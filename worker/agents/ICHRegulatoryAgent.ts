import { Think } from "@cloudflare/think";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";

import { RegulatoryAnalyzer } from "../analyzers/RegulatoryAnalyzer.ts";

import type {
	ICHGuidelineRecord,
	ICHWorkflowInput,
	ICHWorkflowResult,
} from "../types/ich.ts";

import type { RegulatoryItem } from "../types/regulatory.ts";
import { ICHGuidelineCollector } from "../source-collectors/ICHGuidelineCollector.ts";
import { createWorkersAI } from "workers-ai-provider";

import {
	DEFAULT_ICH_GUIDELINE_PREFIXES,
	DEFAULT_ICH_MEMBER,
} from "../constants.ts";

import { RegulatoryManifestStore } from "../stores/RegulatoryManifestStore.ts";
import { createRegulatoryContentHash } from "../helpers/regulatoryContentHash.ts";
import { RegulatoryAnalysisStore } from "../stores/RegulatoryAnalysisStore.ts";
import type { RegulatoryAnalysisRecord } from "../types/regulatory-analysis.ts";
import type { BriefingCandidate } from "../types/regulatory-briefing.ts";
import { RegulatoryMemoryStore } from "../stores/RegulatoryMemoryStore.ts";
import { callable } from "agents";

const ichCollectInputSchema = z.object({
	includeIrrelevant: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether to include irrelevant items in the analysis."),

	member: z
		.string()
		.optional()
		.describe(
			"ICH member/regulatory authority to focus on, for example 'MFDS, Republic of Korea'.",
		),

	guidelinePrefixes: z
		.array(z.string())
		.optional()
		.describe(
			"Guideline families to include, for example ['E6'] or ['E2', 'E6', 'E8'].",
		),

	guidelineCodes: z
		.array(z.string())
		.optional()
		.describe("Exact guideline codes to include, for example ['E6(R3)']."),

	includeAllImplementations: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Whether to retain implementation status for all ICH members instead of only the selected member.",
		),
});

type ICHCollectInput = z.infer<typeof ichCollectInputSchema>;

export class ICHRegulatoryAgent extends Think<Env> {
	onStart() {
		void this.sql`
		CREATE TABLE IF NOT EXISTS regulatory_manifest (
			source TEXT NOT NULL,
			source_id TEXT NOT NULL,
	
			title TEXT NOT NULL,
			url TEXT,
			published_at TEXT,
	
			content_hash TEXT NOT NULL,
	
			first_seen_at TEXT NOT NULL,
			last_seen_at TEXT NOT NULL,
			last_changed_at TEXT NOT NULL,
	
			change_status TEXT NOT NULL,
	
			storage_key TEXT,
	
			PRIMARY KEY (
			source,
			source_id
			)
		);
		`;

		void this.sql`
		CREATE INDEX IF NOT EXISTS
			idx_regulatory_manifest_last_seen
		ON regulatory_manifest (
			last_seen_at DESC
		);
		`;

		void this.sql`
		CREATE INDEX IF NOT EXISTS
			idx_regulatory_manifest_change_status
		ON regulatory_manifest (
			change_status
		);
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS regulatory_analysis (
			source TEXT NOT NULL,
			source_id TEXT NOT NULL,
			content_hash TEXT NOT NULL,

			relevant INTEGER NOT NULL,
			relevance_score REAL NOT NULL,
			categories TEXT NOT NULL,
			priority TEXT NOT NULL,

			summary TEXT NOT NULL,
			cra_impact TEXT NOT NULL,
			interview_point TEXT,
			reason TEXT NOT NULL,

			analyzed_at TEXT NOT NULL,

			PRIMARY KEY (
			source,
			source_id,
			content_hash
			)
		);
		`;
		void this.sql`
		CREATE INDEX IF NOT EXISTS
		idx_regulatory_analysis_source_item
		ON regulatory_analysis (
		source,
		source_id
		);
		`;

		void this.sql`
		CREATE INDEX IF NOT EXISTS
		idx_regulatory_analysis_analyzed_at
		ON regulatory_analysis (
		analyzed_at DESC
		);
		`;
	}

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
	}

	getTools() {
		return {
			collectICHGuidelines: tool({
				description: [
					"Collect official ICH efficacy guideline metadata,",
					"including guideline status, Step date, official documents,",
					"and member implementation information.",
					"Use this when the user asks about ICH guidelines,",
					"ICH E6/GCP, guideline implementation status,",
					"or official ICH document links.",
				].join(" "),

				inputSchema: ichCollectInputSchema,

				execute: async (input: ICHCollectInput) => {
					return this.collectGuidelines(input);
				},
			}),
		};
	}

	/**
	 * Workflow 전용 deterministic 경로.
	 *
	 * agentTool / LLM tool selection을 거치지 않고
	 * Collector -> filtering -> Analyzer 순서로 직접 실행한다.
	 */
	async collectAndAnalyzeForWorkflow(
		input: ICHWorkflowInput,
	): Promise<ICHWorkflowResult> {
		const member = input.member ?? DEFAULT_ICH_MEMBER;

		const guidelinePrefixes = input.guidelinePrefixes?.length
			? input.guidelinePrefixes
			: DEFAULT_ICH_GUIDELINE_PREFIXES;

		const guidelineCodes = input.guidelineCodes ?? [];

		console.log("[ICHRegulatoryAgent] workflow started", {
			member,
			guidelinePrefixes,
			guidelineCodes,
		});

		const collector = new ICHGuidelineCollector();

		const collection = await collector.collect();

		const filteredGuidelines = filterGuidelines(collection.guidelines, {
			member,
			guidelinePrefixes,
			guidelineCodes,
			includeAllImplementations: false,
		});

		const regulatoryItems = filteredGuidelines.map(guidelineToRegulatoryItem);

		const manifestStore = this.getManifestStore();
		const analysisStore = this.getAnalysisStore();

		const itemsForAnalysis: RegulatoryItem[] = [];

		const cachedAnalyses = new Map<string, RegulatoryAnalysisRecord>();

		const briefingCandidates: BriefingCandidate[] = [];

		const analysisContextByItemId = new Map<
			string,
			{
				item: RegulatoryItem;
				contentHash: string;
				changeStatus: "new" | "changed" | "unchanged";
			}
		>();

		let newCount = 0;
		let changedCount = 0;
		let unchangedCount = 0;

		for (const item of regulatoryItems) {
			const contentHash = await createRegulatoryContentHash(item);

			const change = manifestStore.checkAndUpsert({
				source: item.source,
				sourceId: item.sourceId,
				title: item.title,
				url: item.url,
				publishedAt: item.publishedAt,
				contentHash,
			});

			analysisContextByItemId.set(item.id, {
				item,
				contentHash,
				changeStatus: change.status,
			});

			switch (change.status) {
				case "new":
					newCount++;
					break;

				case "changed":
					changedCount++;
					break;

				case "unchanged":
					unchangedCount++;
					break;
			}

			const cached = analysisStore.get(item.source, item.sourceId, contentHash);

			console.log("[ICHRegulatoryAgent] analysis cache lookup", {
				source: item.source,
				sourceId: item.sourceId,
				contentHash,
				hit: Boolean(cached),
			});

			if (cached) {
				cachedAnalyses.set(item.sourceId, cached);
				if (cached.relevant) {
					briefingCandidates.push({
						source: item.source,
						sourceId: item.sourceId,
						title: item.title,
						url: item.url,
						publishedAt: item.publishedAt,
						changeStatus: change.status,
						relevant: cached.relevant,
						relevanceScore: cached.relevanceScore,
						priority: cached.priority,
						categories: cached.categories,
						summary: cached.summary,
						craImpact: cached.craImpact,
						interviewPoint: cached.interviewPoint,
						reason: cached.reason,
						fromCache: true,
					});
				}
				continue;
			}

			itemsForAnalysis.push(item);
		}

		console.log("[ICHRegulatoryAgent] manifest filtering", {
			candidates: regulatoryItems.length,

			newCount,
			changedCount,
			unchangedCount,

			forAnalysis: itemsForAnalysis.length,
		});

		const analyzer = new RegulatoryAnalyzer(this.getModel());

		const analysis =
			itemsForAnalysis.length > 0
				? await analyzer.analyze(itemsForAnalysis, {
						includeIrrelevant: true,
						onBatchProgress: async (completedBatches, totalBatches) => {
							console.log("[ICHRegulatoryAgent] analyzing", {
								completedBatches,
								totalBatches,
							});
						},
					})
				: {
						items: [],
						relevantCount: 0,
					};

		for (const analyzedItem of analysis.items) {
			const context = analysisContextByItemId.get(analyzedItem.id);

			if (!context) {
				console.warn("[ICHRegulatoryAgent] missing analysis context", {
					id: analyzedItem.id,
				});

				continue;
			}

			const { item, contentHash } = context;

			console.log("[ICHRegulatoryAgent] analysis cache save candidate", {
				source: item.source,
				sourceId: item.sourceId,
				contentHash,
			});

			const saved = analysisStore.upsert({
				source: item.source,
				sourceId: item.sourceId,
				contentHash,
				relevant: analyzedItem.relevant,
				relevanceScore: analyzedItem.relevanceScore,
				categories: analyzedItem.categories,
				priority: analyzedItem.priority,
				summary: analyzedItem.summary,
				craImpact: analyzedItem.craImpact,
				interviewPoint: analyzedItem.interviewPoint,
				reason: analyzedItem.reason,
			});

			if (analyzedItem.relevant) {
				briefingCandidates.push({
					source: item.source,
					sourceId: item.sourceId,
					title: item.title,
					url: item.url,
					publishedAt: item.publishedAt,
					changeStatus: context.changeStatus,
					relevant: analyzedItem.relevant,
					relevanceScore: analyzedItem.relevanceScore,
					priority: analyzedItem.priority,
					categories: analyzedItem.categories,
					summary: analyzedItem.summary,
					craImpact: analyzedItem.craImpact,
					interviewPoint: analyzedItem.interviewPoint,
					reason: analyzedItem.reason,
					fromCache: false,
				});
			}

			console.log("[MFDSRegulatoryAgent] analysis cache saved", {
				source: saved.source,
				sourceId: saved.sourceId,
				contentHash: saved.contentHash,
			});
		}

		const warnings = [
			...collection.failures.map(
				(failure) => `${failure.target}: ${failure.message}`,
			),
		];

		const outputItems = input.includeIrrelevant
			? analysis.items
			: analysis.items.filter((item) => item.relevant);

		const relevantCount = analysis.items.filter((item) => item.relevant).length;

		console.log("[ICHRegulatoryAgent] workflow completed", {
			totalFetched: collection.totalFetched,
			candidateCount: regulatoryItems.length,
			relevantCount: analysis.relevantCount,
			warningCount: warnings.length,
		});

		const reusedRelevantCount = briefingCandidates.filter(
			(item) => item.fromCache,
		).length;

		return {
			source: "ICH",
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			candidateCount: regulatoryItems.length,
			relevantCount,
			items: outputItems,
			failures: collection.failures,
			warnings,
			manifest: {
				newCount,
				changedCount,
				unchangedCount,
			},
			analysisCache: {
				analyzedCount: analysis.items.length,
				reusedCount: cachedAnalyses.size,
				reusedRelevantCount,
			},
			briefingCandidates,
		};
	}

	/**
	 * Interactive chat/tool 경로.
	 *
	 * 공식 데이터를 가져온 뒤 사용자가 요청한 범위로 필터링한다.
	 * 분석까지 강제하지 않고 raw-ish normalized guideline 데이터를 반환한다.
	 */
	private async collectGuidelines(input: ICHCollectInput) {
		const member = input.member ?? DEFAULT_ICH_MEMBER;

		const guidelinePrefixes = input.guidelinePrefixes?.length
			? input.guidelinePrefixes
			: DEFAULT_ICH_GUIDELINE_PREFIXES;

		const guidelineCodes = input.guidelineCodes ?? [];

		const collector = new ICHGuidelineCollector();

		const collection = await collector.collect();

		const guidelines = filterGuidelines(collection.guidelines, {
			member,
			guidelinePrefixes,
			guidelineCodes,
			includeAllImplementations: input.includeAllImplementations ?? false,
		});

		return {
			source: "ICH" as const,
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			totalReturned: guidelines.length,
			filters: {
				member,
				guidelinePrefixes,
				guidelineCodes,
				includeAllImplementations: input.includeAllImplementations ?? false,
			},
			guidelines,
			failures: collection.failures,
			warnings: collection.failures.map(
				(failure) => `${failure.target}: ${failure.message}`,
			),
		};
	}

	private getManifestStore() {
		return new RegulatoryManifestStore(this.sql.bind(this));
	}

	private getAnalysisStore() {
		return new RegulatoryAnalysisStore(this.sql.bind(this));
	}

	private getMemoryStore() {
		return new RegulatoryMemoryStore(this.sql.bind(this));
	}

	@callable()
	getMemorySnapshot() {
		return this.getMemoryStore().getSnapshot("ICH");
	}

	@callable()
	getMemoryItem(sourceId: string) {
		return this.getMemoryStore().getItem("ICH", sourceId);
	}

	@callable()
	listRecentMemoryChanges(limit = 20) {
		return this.getMemoryStore().listRecentChanges("ICH", limit);
	}

	@callable()
	searchMemory(query: string, limit = 20) {
		return this.getMemoryStore().search(query, "ICH", limit);
	}
}

interface FilterGuidelinesOptions {
	member?: string;
	guidelinePrefixes: string[];
	guidelineCodes: string[];
	includeAllImplementations: boolean;
}

function filterGuidelines(
	guidelines: ICHGuidelineRecord[],
	options: FilterGuidelinesOptions,
): ICHGuidelineRecord[] {
	const {
		member,
		guidelinePrefixes,
		guidelineCodes,
		includeAllImplementations,
	} = options;

	return guidelines
		.filter((guideline) => {
			const matchesExactCode =
				guidelineCodes.length === 0 ||
				guidelineCodes.includes(guideline.displayCode);

			const matchesPrefix =
				guidelinePrefixes.length === 0 ||
				guidelinePrefixes.some((prefix) =>
					guideline.displayCode.startsWith(prefix),
				);

			/*
			 * exact code가 지정되어 있으면 exact code를 우선한다.
			 *
			 * 예:
			 * guidelineCodes = ["E6(R3)"]
			 * guidelinePrefixes = ["E6"]
			 *
			 * => E6(R3)만 반환.
			 */
			if (guidelineCodes.length > 0) {
				return matchesExactCode;
			}

			return matchesPrefix;
		})
		.map((guideline) => {
			if (includeAllImplementations || !member) {
				return guideline;
			}

			return {
				...guideline,

				implementations: guideline.implementations.filter(
					(implementation) => implementation.member === member,
				),
			};
		});
}

/**
 * ICH guideline 정보를 기존 RegulatoryAnalyzer가 받을 수 있는
 * 공통 RegulatoryItem 형태로 변환한다.
 */
function guidelineToRegulatoryItem(
	guideline: ICHGuidelineRecord,
): RegulatoryItem {
	const implementation = guideline.implementations[0];

	const implementationText = implementation
		? [
				`${implementation.member}:`,
				implementation.status,

				implementation.implementationDate
					? `Date: ${implementation.implementationDate}`
					: undefined,

				implementation.reference
					? `Reference: ${implementation.reference}`
					: undefined,
			]
				.filter(Boolean)
				.join(" ")
		: "No selected-member implementation information.";

	const documentText =
		guideline.documentUrls.length > 0
			? `Official documents: ${guideline.documentUrls.length}`
			: "No official document URL found.";

	const description = [
		`${guideline.displayCode} ${guideline.title}.`,

		guideline.step
			? `${guideline.step}${guideline.date ? ` date: ${guideline.date}.` : "."}`
			: undefined,

		guideline.status ? `Current status: ${guideline.status}.` : undefined,

		implementationText,

		documentText,
	]
		.filter(Boolean)
		.join(" ");

	return {
		id: `ICH:${guideline.displayCode}`,

		sourceType: "guideline",

		collectedAt: guideline.collectedAt,

		source: "ICH",

		sourceId: guideline.displayCode,

		title: `${guideline.displayCode} ${guideline.title}`,

		description,

		publishedAt: normalizeICHDate(guideline.date),

		url: guideline.guidelineUrl ?? "",

		metadata: {
			guidelineCode: guideline.code,

			revision: guideline.revision,

			displayCode: guideline.displayCode,

			topic: guideline.topic,

			step: guideline.step,

			status: guideline.status,

			implementation,

			documentUrls: guideline.documentUrls,
		},
	};
}

/**
 * ICH는 "6 January 2025"처럼 human-readable date를 주므로
 * 가능한 경우 ISO8601로 정규화한다.
 *
 * parsing 실패 시 undefined.
 */
function normalizeICHDate(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}

	const timestamp = Date.parse(value);

	if (Number.isNaN(timestamp)) {
		return undefined;
	}

	return new Date(timestamp).toISOString();
}
