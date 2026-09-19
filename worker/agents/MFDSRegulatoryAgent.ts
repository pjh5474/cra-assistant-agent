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

export class MFDSRegulatoryAgent extends Think<Env> {
	maxSteps = 10;

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
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

		const analysis = await this.analyzeForWorkflow(
			collection.items,
			input.includeIrrelevant ?? false,
		);

		console.log("[MFDSRegulatoryAgent] workflow RPC complete", {
			fetched: collection.totalFetched,
			candidates: collection.totalReturned,
			relevant: analysis.relevantCount,
		});

		return {
			source: "MFDS",
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			candidateCount: collection.totalReturned,
			relevantCount: analysis.relevantCount,
			failures: collection.failures, //source-specific structured diagnostic data
			warnings: collection.failures.map(
				(failure) => `${failure.feedTitle}: ${failure.message}`,
			), // 공통 Workflow/UI에서 바로 표시 가능한 문자열

			items: analysis.items,
		};
	}
}
