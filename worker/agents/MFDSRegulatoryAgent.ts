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

export class MFDSRegulatoryAgent extends Think<Env> {
	maxSteps = 10;

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
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

	getSystemPrompt(): string {
		return `
  You are the specialized MFDS Regulatory Agent
  for a CRA Assistant system.

  Date handling rules:

- The user may use relative Korean date expressions such as
  "오늘", "어제", "이번 주", or "최근".
- Resolve relative dates using the current date in Asia/Seoul.
- For "오늘", query only the current Korean calendar day.
- For "어제", query only the previous Korean calendar day.
- Do not guess dates from training data.
- Do not reuse dates from examples or previous conversations.
- If the current date is needed, use the current-date tool before
  calling regulatory collection tools.
  

  Collection behavior rules:

- A successful collection returning zero candidate items is a valid result.
- Zero items does NOT mean the collection failed.
- Do not automatically retry the MFDS collection with broader or missing date filters merely because zero items were returned.
- Preserve the user's requested date range.
- If the requested period returns zero items, report that no matching MFDS items were found for that period.
- Only retry collection when the tool reports an actual technical failure, such as a fetch error or source failure.


  Workflow:
  
  1. Call collect_mfds_updates.
  2. Pass the collected items to analyze_regulatory_updates.
  3. Return only the analyzed compact result.
  
  You must not skip the analysis step.
  
  Do not return raw RSS XML or unnecessarily long source content.
  
  Do not invent regulatory information.
  
  Preserve collection failures and uncertainty.
  
  Only the analysis tool determines CRA relevance,
  categories, priority, CRA impact, and interview points.
      `.trim();
	}

	getTools(): ToolSet {
		const report = async (progress: {
			fraction?: number;
			phase?: string;
			message?: string;
			milestone?: string;
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

					await report(progress);
				},
			}),

			analyze_regulatory_updates: createRegulatoryAnalyzeTool({
				model: this.getModel(),

				onProgress: async (progress) => {
					console.log("[MFDSRegulatoryAgent] analyze progress", progress);

					await report(progress);
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

	// @callable()
	// async testManifestStore() {
	// 	const store = this.getManifestStore();

	// 	const testId = `manifest-test-${Date.now()}`;

	// 	const base = {
	// 		source: "MFDS" as const,

	// 		sourceId: testId,

	// 		url: "https://example.com/manifest-test",

	// 		publishedAt: "2026-09-19T00:00:00+09:00",
	// 	};

	// 	const first = store.checkAndUpsert({
	// 		...base,
	// 		title: "Manifest Test Item",
	// 		contentHash: "hash-v1",
	// 	});

	// 	const second = store.checkAndUpsert({
	// 		...base,
	// 		title: "Manifest Test Item",
	// 		contentHash: "hash-v1",
	// 	});

	// 	const third = store.checkAndUpsert({
	// 		...base,
	// 		title: "Manifest Test Item Updated",
	// 		contentHash: "hash-v2",
	// 	});

	// 	console.log("[MFDSRegulatoryAgent] manifest test", {
	// 		testId,
	// 		first: first.status,
	// 		second: second.status,
	// 		third: third.status,
	// 	});

	// 	return {
	// 		testId,
	// 		first,
	// 		second,
	// 		third,
	// 	};
	// }
}
