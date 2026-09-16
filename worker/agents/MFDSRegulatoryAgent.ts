import { Think } from "@cloudflare/think";
import type { LanguageModel, ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createMFDSCollectTool } from "../tools/collect/MFDSCollectTool.ts";
import { createRegulatoryAnalyzeTool } from "../tools/analyze/RegulatoryAnalyzeTool.ts";
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
		};
	}
}
