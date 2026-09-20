import { Think } from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
	createMFDSCollectTool,
	getTodayDate,
} from "../tools/collect/MFDSCollectTool.ts";
import { createRegulatoryAnalyzeTool } from "../tools/analyze/RegulatoryAnalyzeTool.ts";
import type { MFDSWorkflowInput } from "../types/workflow.ts";
import { MFDSCollector } from "../source-collectors/MFDSCollector.ts";
import { RegulatoryAnalyzer } from "../analyzers/RegulatoryAnalyzer.ts";
import type { RegulatoryItem } from "../types/regulatory.ts";
import type { MFDSWorkflowResult } from "../types/mfds.ts";
import { callable } from "agents";
import { RegulatoryManifestStore } from "../stores/RegulatoryManifestStore.ts";
import { createRegulatoryContentHash } from "../helpers/regulatoryContentHash.ts";
import { RegulatoryAnalysisStore } from "../stores/RegulatoryAnalysisStore.ts";
import type { RegulatoryAnalysisRecord } from "../types/regulatory-analysis.ts";
import type { BriefingCandidate } from "../types/regulatory-briefing.ts";
import { RegulatoryMemoryStore } from "../stores/RegulatoryMemoryStore.ts";
import type { ContextConfig } from "agents/context";
import { SUB_AGENT_MODEL } from "../constants.ts";

export class MFDSRegulatoryAgent extends Think<Env> {
	maxSteps = 10;

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
			gateway: {
				id: "cra-assistant-agent",
			},
		});

		return workersAI(SUB_AGENT_MODEL);
	}

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

	configureContext(): ContextConfig[] | Promise<ContextConfig[]> {
		return [
			{
				label: "soul",
				provider: {
					get: async () =>
						`
			You are the specialized MFDS Regulatory Agent in a CRA Assistant workflow.
			
			Your responsibility is limited to official MFDS regulatory publications.
			You collect MFDS source data, analyze CRA relevance through the designated analyzer,
			and return compact structured findings for downstream workflow consumption.
			
			You are not a general-purpose conversational assistant.
			
			## Source Scope
			
			Use official MFDS sources for:
			- notices and announcements
			- laws and regulatory revisions
			- MFDS guidelines
			- safety information
			- domestic clinical-trial regulatory updates
			
			Do not treat this agent as the primary authority for ICH guideline status.
			For ICH guideline status or implementation questions, the parent workflow should use
			the ICH Regulatory Agent.
			
			## Date Handling
			
			Resolve relative and current dates using Asia/Seoul.
			
			For requests involving:
			- latest / recent / current / today
			- 오늘 / 어제 / 이번 주 / 최근 / 최신 / 현재
			
			you MUST call get_today_date before collect_mfds_updates.
			
			Never infer, recall, or guess the current date yourself.
			
			Use:
			- 오늘: current Korean calendar day only
			- 어제: previous Korean calendar day only
			- 이번 주: relevant range of the current Korean calendar week
			- recent/latest/current with no explicit range: normally 15 days or less
			
			A single MFDS collection call must never exceed 30 days.
			
			Do not:
			- silently broaden date ranges
			- infer full-year or multi-month ranges
			- remove date filters to obtain results
			- use historical dates unless explicitly requested
			
			If explicit historical research exceeds 30 days, split it into windows of 30 days or less.
			
			## Collection Behavior
			
			1. Call collect_mfds_updates using the narrowest appropriate date range.
			2. Inspect the collection result.
			3. If candidate items exist, pass them to analyze_regulatory_updates.
			4. If zero candidates are returned, do not call the analyzer.
			5. Return compact structured findings.
			
			Zero candidates are a valid successful result.
			
			Do not retry or broaden the search only because no items were found.
			
			Retry only for an actual transient technical failure such as:
			- network or upstream failure
			- source fetch failure
			- parser failure
			
			For a transient technical failure:
			- retry at most once
			- preserve the same filters
			
			## Analysis Rules
			
			Only analyze_regulatory_updates determines:
			- CRA relevance
			- relevance score
			- categories
			- priority
			- summary
			- CRA impact
			- interview points
			- analytical reasoning
			
			Do not independently invent, modify, or override those fields.
			
			Clearly distinguish:
			- official MFDS source facts
			- generated CRA-oriented analysis
			
			Do not invent regulatory information.
			
			Preserve:
			- official source URLs
			- publication dates
			- uncertainty
			- collection failures
			
			Do not describe a source as a specific publication type unless supported by the source data.
			
			Generated analysis is workflow assistance and must not be presented as legal or regulatory advice.
			
			## Output Behavior
			
			Return concise structured findings for downstream workflow use.
			
			Do not:
			- return raw RSS XML
			- return unnecessarily long source content
			- address the end user directly
			- ask follow-up questions
			- offer additional actions
			- add conversational filler or closing remarks
						`.trim(),
				},
			},
		];
	}

	getTools(): ToolSet {
		const report = async (progress: {
			fraction?: number;
			phase?: string;
			message?: string;
			milestone?: string;
			tool?: string;
		}) => {
			console.log("[MFDSRegulatoryAgent] progress", progress);

			await this.reportProgress(
				progress,
				progress.milestone
					? {
							persist: true,
						}
					: undefined,
			);
		};

		return {
			collect_mfds_updates: createMFDSCollectTool({
				onProgress: async (progress) => {
					console.log("[MFDSRegulatoryAgent] collect progress", progress);

					await report({
						...progress,

						phase: progress.phase ?? "collecting",

						message: progress.message ?? "Checking official MFDS sources...",

						tool: "collect_mfds_updates",
					});
				},
			}),

			analyze_regulatory_updates: createRegulatoryAnalyzeTool({
				model: this.getModel(),

				onProgress: async (progress) => {
					console.log("[MFDSRegulatoryAgent] analyze progress", progress);

					await report({
						...progress,
						tool: "analyze_regulatory_updates",
					});
				},
			}),

			get_today_date: getTodayDate(),
		};
	}

	private async collectForWorkflow(since?: Date, until?: Date) {
		const collector = new MFDSCollector();

		return collector.collect({
			since,
			until,
			maxDescriptionLength: 3000,
		});
	}

	private async analyzeForWorkflow(
		items: RegulatoryItem[],
		includeIrrelevant: boolean,
	) {
		const analyzer = new RegulatoryAnalyzer(this.getModel());

		return analyzer.analyze(items, {
			includeIrrelevant,
			batchSize: 5,
		});
	}

	async collectAndAnalyzeForWorkflow(
		input: MFDSWorkflowInput,
	): Promise<MFDSWorkflowResult> {
		console.log("[MFDSRegulatoryAgent] workflow RPC start", input);

		const since = input.since ? new Date(input.since) : undefined;
		const until = input.until ? new Date(input.until) : undefined;

		if (since && Number.isNaN(since.getTime())) {
			throw new Error(`Invalid since date: ${input.since}`);
		}

		if (until && Number.isNaN(until.getTime())) {
			throw new Error(`Invalid until date: ${input.until}`);
		}

		const collection = await this.collectForWorkflow(since, until);

		const manifestStore = this.getManifestStore();
		const analysisStore = this.getAnalysisStore();

		const analysisContextByItemId = new Map<
			string,
			{
				item: RegulatoryItem;
				contentHash: string;
				changeStatus: "new" | "changed" | "unchanged";
			}
		>();

		const itemsForAnalysis: RegulatoryItem[] = [];

		const cachedAnalyses = new Map<string, RegulatoryAnalysisRecord>();

		const briefingCandidates: BriefingCandidate[] = [];

		let newCount = 0;
		let changedCount = 0;
		let unchangedCount = 0;

		for (const item of collection.items) {
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

			console.log("[MFDSRegulatoryAgent] analysis cache lookup", {
				source: item.source,
				sourceId: item.sourceId,
				contentHash,
				hit: Boolean(cached),
			});

			console.log("[MFDSRegulatoryAgent] cached analysis", {
				sourceId: item.sourceId,
				relevant: cached?.relevant,
				relevanceScore: cached?.relevanceScore,
				priority: cached?.priority,
			});

			if (cached) {
				cachedAnalyses.set(item.id, cached);

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

		console.log("[MFDSRegulatoryAgent] manifest filtering", {
			candidates: collection.items.length,

			newCount,
			changedCount,
			unchangedCount,

			forAnalysis: itemsForAnalysis.length,
		});

		const analysis =
			itemsForAnalysis.length > 0
				? await this.analyzeForWorkflow(
						itemsForAnalysis,
						true, // irrelevant 결과도 받아서 cache에 저장
					)
				: {
						items: [],
						relevantCount: 0,
					};

		if (itemsForAnalysis.length > 0) {
			console.log("[MFDSRegulatoryAgent] analysis result before cache save", {
				itemCount: analysis.items.length,
				relevantCount: analysis.relevantCount,
				items: analysis.items.map((item) => ({
					id: item.id,
					relevant: item.relevant,
				})),
			});
		}

		for (const analyzedItem of analysis.items) {
			const context = analysisContextByItemId.get(analyzedItem.id);

			if (!context) {
				console.warn("[MFDSRegulatoryAgent] missing analysis context", {
					id: analyzedItem.id,
				});

				continue;
			}

			const { item, contentHash } = context;

			console.log("[MFDSRegulatoryAgent] analysis cache save candidate", {
				source: analyzedItem.source,
				sourceId: analyzedItem.sourceId,
				contentHash,
			});

			if (!contentHash) {
				console.warn(
					"[MFDSRegulatoryAgent] missing content hash for analyzed item",
					{
						sourceId: analyzedItem.sourceId,
					},
				);

				continue;
			}

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

		console.log("[MFDSRegulatoryAgent] workflow RPC complete", {
			fetched: collection.totalFetched,
			candidates: collection.items.length,
			relevant: analysis.relevantCount,
		});

		const relevantCount = analysis.items.filter((item) => item.relevant).length;

		const reusedRelevantCount = briefingCandidates.filter(
			(item) => item.fromCache,
		).length;

		return {
			source: "MFDS",
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			candidateCount: collection.items.length,
			relevantCount,
			failures: collection.failures, //source-specific structured diagnostic data
			warnings: collection.failures.map(
				(failure) => `${failure.feedTitle}: ${failure.message}`,
			), // 공통 Workflow/UI에서 바로 표시 가능한 문자열

			items: outputItems,

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
		return this.getMemoryStore().getSnapshot("MFDS");
	}

	@callable()
	getMemoryItem(sourceId: string) {
		return this.getMemoryStore().getItem("MFDS", sourceId);
	}

	@callable()
	listRecentMemoryChanges(limit = 20) {
		return this.getMemoryStore().listRecentChanges("MFDS", limit);
	}

	@callable()
	searchMemory(query: string, limit = 20) {
		return this.getMemoryStore().search(query, "MFDS", limit);
	}
}
