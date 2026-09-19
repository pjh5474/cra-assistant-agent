import { Think } from "@cloudflare/think";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";

import { KoNECTCollector } from "../source-collectors/KoNECTCollector.ts";
import { RegulatoryAnalyzer } from "../analyzers/RegulatoryAnalyzer.ts";

import type {
	KoNECTCourseItem,
	KoNECTNoticeItem,
	KoNECTNoticeType,
	KoNECTWorkflowInput,
	KoNECTWorkflowResult,
} from "../types/konect.ts";

import type { RegulatoryItem } from "../types/regulatory.ts";
import { RegulatoryManifestStore } from "../stores/RegulatoryManifestStore.ts";
import { RegulatoryAnalysisStore } from "../stores/RegulatoryAnalysisStore.ts";
import type { RegulatoryAnalysisRecord } from "../types/regulatory-analysis.ts";
import { createRegulatoryContentHash } from "../helpers/regulatoryContentHash.ts";
import type { BriefingCandidate } from "../types/regulatory-briefing.ts";
import { RegulatoryMemoryStore } from "../stores/RegulatoryMemoryStore.ts";
import { callable } from "agents";

const DEFAULT_NOTICE_TYPES: KoNECTNoticeType[] = [
	"general",
	"education",
	"certification",
];

const konectCollectInputSchema = z.object({
	since: z
		.string()
		.optional()
		.describe(
			"Start date or ISO 8601 datetime for KoNECT notice/course filtering.",
		),

	until: z
		.string()
		.optional()
		.describe(
			"End date or ISO 8601 datetime for KoNECT notice/course filtering.",
		),

	includeCourses: z
		.boolean()
		.optional()
		.default(true)
		.describe("Whether CRA education/course information should be collected."),

	onlyOpenCourses: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			"When true, return only CRA courses whose application period is currently open.",
		),

	includeNoticeTypes: z
		.array(z.enum(["general", "education", "certification"]))
		.optional()
		.default(["general", "education", "certification"])
		.describe("KoNECT notice categories to collect."),

	includeIrrelevant: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether CRA-irrelevant items should also be returned."),
});

type KoNECTCollectInput = z.infer<typeof konectCollectInputSchema>;

export class KoNECTRegulatoryAgent extends Think<Env> {
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
			collectKoNECTUpdates: tool({
				description: `
Collect official KoNECT Clinical Education Center notices and
CRA education/course information.

Use this tool when the user asks about:
- KoNECT notices
- CRA education or training
- CRA 신규자 / 심화 / 보수 courses
- GCP-related education announcements
- current CRA course application status
- KoNECT certification or education announcements

KoNECT education courses are professional-development information,
not regulatory requirements.
        `.trim(),

				inputSchema: konectCollectInputSchema,

				execute: async (input: KoNECTCollectInput) => {
					return this.collectKoNECT(input);
				},
			}),
		};
	}

	/**
	 * Workflow용 deterministic 경로.
	 *
	 * Agent tool selection을 거치지 않고
	 * Collector -> RegulatoryItem conversion -> Analyzer
	 * 순서로 직접 실행한다.
	 */
	async collectAndAnalyzeForWorkflow(
		input: KoNECTWorkflowInput,
	): Promise<KoNECTWorkflowResult> {
		const includeNoticeTypes = input.includeNoticeTypes?.length
			? input.includeNoticeTypes
			: DEFAULT_NOTICE_TYPES;

		const includeCourses = input.includeCourses ?? true;

		console.log("[KoNECTRegulatoryAgent] workflow started", {
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		const collector = new KoNECTCollector();

		const collection = await collector.collect({
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		const regulatoryItems: RegulatoryItem[] = [
			...collection.notices.map(noticeToRegulatoryItem),
			...collection.courses.map(courseToRegulatoryItem),
		];

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

			console.log("[KoNECTRegulatoryAgent] analysis cache lookup", {
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

		console.log("[KoNECTRegulatoryAgent] manifest filtering", {
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
							console.log("[KoNECTRegulatoryAgent] analyzing", {
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
				console.warn("[KoNECTRegulatoryAgent] missing analysis context", {
					id: analyzedItem.id,
				});

				continue;
			}

			const { item, contentHash } = context;

			console.log("[KoNECTRegulatoryAgent] analysis cache save candidate", {
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

		const outputItems = input.includeIrrelevant
			? analysis.items
			: analysis.items.filter((item) => item.relevant);

		const relevantCount = analysis.items.filter((item) => item.relevant).length;

		const warnings = [
			...collection.failures.map(
				(failure) => `${failure.target}: ${failure.message}`,
			),
		];

		console.log("[KoNECTRegulatoryAgent] workflow completed", {
			totalFetched: collection.totalFetched,
			candidateCount: regulatoryItems.length,
			relevantCount: analysis.relevantCount,
			warningCount: warnings.length,
		});

		const reusedRelevantCount = briefingCandidates.filter(
			(item) => item.fromCache,
		).length;

		return {
			source: "KONECT",
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
	 * KoNECT normalized data를 그대로 반환한다.
	 * 사용자가 현재 신청 가능한 CRA 교육 등을 물었을 때
	 * LLM이 직접 course 상태를 해석할 수 있다.
	 */
	private async collectKoNECT(input: KoNECTCollectInput) {
		const includeNoticeTypes = input.includeNoticeTypes?.length
			? input.includeNoticeTypes
			: DEFAULT_NOTICE_TYPES;

		const includeCourses = input.includeCourses ?? true;

		const collector = new KoNECTCollector();

		const collection = await collector.collect({
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		return {
			source: "KONECT" as const,
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			totalReturned: collection.totalReturned,
			filters: {
				since: input.since,
				until: input.until,
				includeCourses,
				onlyOpenCourses: input.onlyOpenCourses ?? true,
				includeNoticeTypes,
			},
			notices: collection.notices,
			courses: collection.courses,
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
		return this.getMemoryStore().getSnapshot("KONECT");
	}

	@callable()
	getMemoryItem(sourceId: string) {
		return this.getMemoryStore().getItem("KONECT", sourceId);
	}

	@callable()
	listRecentMemoryChanges(limit = 20) {
		return this.getMemoryStore().listRecentChanges("KONECT", limit);
	}

	@callable()
	searchMemory(query: string, limit = 20) {
		return this.getMemoryStore().search(query, "KONECT", limit);
	}
}

/* -------------------------------------------------------------------------- */
/*                     KoNECT notice -> RegulatoryItem                        */
/* -------------------------------------------------------------------------- */

function noticeToRegulatoryItem(notice: KoNECTNoticeItem): RegulatoryItem {
	const description = [
		`KoNECT notice category: ${notice.type}.`,

		notice.author ? `Author: ${notice.author}.` : undefined,

		typeof notice.views === "number" ? `Views: ${notice.views}.` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		id: `KONECT:NOTICE:${notice.id}`,
		source: "KONECT",
		sourceType: "notice",
		sourceId: notice.id,
		title: notice.title,
		description,
		publishedAt: normalizeKoNECTDate(notice.publishedAt),
		url: notice.url,
		collectedAt: notice.collectedAt,
		metadata: {
			noticeType: notice.type,
			author: notice.author,
			views: notice.views,
		},
	};
}

/* -------------------------------------------------------------------------- */
/*                     KoNECT course -> RegulatoryItem                        */
/* -------------------------------------------------------------------------- */

function courseToRegulatoryItem(course: KoNECTCourseItem): RegulatoryItem {
	const description = [
		`${course.category}${course.level ? ` > ${course.level}` : ""}.`,

		course.durationDays !== undefined
			? `Duration: ${course.durationDays} day(s).`
			: undefined,

		course.durationHours !== undefined
			? `Training hours: ${course.durationHours}.`
			: undefined,

		course.capacity !== undefined ? `Capacity: ${course.capacity}.` : undefined,

		course.applicationStart && course.applicationEnd
			? `Application period: ${course.applicationStart} to ${course.applicationEnd}.`
			: undefined,

		course.courseStart && course.courseEnd
			? `Course period: ${course.courseStart} to ${course.courseEnd}.`
			: undefined,

		course.price !== undefined ? `Price: ${course.price} KRW.` : undefined,

		course.status ? `Current course status: ${course.status}.` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		id: `KONECT:COURSE:${course.id}`,

		source: "KONECT",

		sourceType: "education",

		sourceId: course.id,

		title: course.title,

		description,

		/*
		 * 교육에는 게시일이 없으므로 현재는 courseStart를 사용.
		 *
		 * 이후 snapshot/change detection을 붙이면
		 * publishedAt 대신 firstSeenAt을 활용하는 쪽이 더 적절하다.
		 */
		publishedAt: normalizeKoNECTDate(course.courseStart),

		url: course.url,

		collectedAt: course.collectedAt,

		metadata: {
			category: course.category,
			level: course.level,
			courseType: course.courseType,
			durationDays: course.durationDays,
			durationHours: course.durationHours,
			capacity: course.capacity,
			applicationStart: course.applicationStart,
			applicationEnd: course.applicationEnd,
			courseStart: course.courseStart,
			courseEnd: course.courseEnd,
			price: course.price,
			status: course.status,
			statusClass: course.statusClass,
		},
	};
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function normalizeKoNECTDate(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}

	const timestamp = Date.parse(value);

	if (Number.isNaN(timestamp)) {
		return undefined;
	}

	return new Date(timestamp).toISOString();
}
