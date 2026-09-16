import { Think, skills } from "@cloudflare/think";
import {
	callable,
	routeAgentRequest,
	type AgentToolProgressSnapshot,
} from "agents";
import { agentTool } from "agents/agent-tools";
import type { AgentToolRunInfo } from "agents/agent-tools";
import type { ContextConfig } from "agents/context";
import type { SkillSource } from "agents/skills";
import type { LanguageModel, ToolSet } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { MFDSRegulatoryAgent } from "./agents/MFDSRegulatoryAgent.ts";

export { MFDSRegulatoryAgent };

export type SubagentStatus = "idle" | "running" | "completed" | "error";

export interface SubagentActivity {
	status: SubagentStatus;
	phase?: string;
	message?: string;
	progress?: number;
	runId?: string;
	updatedAt: string;
}

type CraAssistantAgentState = {
	files: {
		path: string;
		type: "file" | "directory";
		size: number;
		updatedAt: number;
	}[];

	subagents: {
		mfds?: SubagentActivity;
		ich?: SubagentActivity;
		konect?: SubagentActivity;
	};
};

export class CraAssistantAgent extends Think<Env, CraAssistantAgentState> {
	extensionLoader = this.env.LOADER;

	initialState: CraAssistantAgentState = {
		files: [],
		subagents: {},
	};

	async refreshFiles() {
		const all = await this.workspace.glob("**/*");

		this.setState({
			...this.state,

			files: all.map((file) => ({
				path: file.path,

				type: file.type === "file" ? "file" : "directory",

				size: file.size,

				updatedAt: file.updatedAt,
			})),
		});
	}

	async onStart() {
		await this.refreshFiles();
	}

	async onChatResponse() {
		await this.refreshFiles();
		await this.context.refreshSystemPrompt();
	}

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
	}

	getSystemPrompt(): string {
		return `
  You are the main CRA Assistant Agent.
  
  Your role is to coordinate specialized sub-agents that monitor,
  analyze, and summarize regulatory information relevant to
  Clinical Research Associates and clinical trial operations.
  
  For regulatory source-specific work, delegate to the appropriate
  specialized regulatory sub-agent rather than performing source
  collection yourself.
  
  Currently available source agent:
  
  - MFDS Regulatory Agent
	- monitors official MFDS regulatory RSS sources
	- collects newly published items
	- evaluates CRA relevance
	- classifies regulatory impact
	- returns compact analyzed results
  
  When the user asks about MFDS regulatory updates, recent MFDS
  clinical-trial-related notices, weekly regulatory monitoring,
  or similar work, use the MFDS regulatory agent.

  When passing dates to regulatory subagents,
  always use a full ISO 8601 datetime including timezone.
  Example: 2026-09-10T00:00:00+09:00
  
  Do not invent regulatory updates.
  
  When presenting regulatory information:
  - distinguish source facts from analysis
  - preserve source URLs
  - mention uncertainty when source information is insufficient
  - treat generated analysis as workflow assistance, not legal or
	regulatory advice
  
  As additional regulatory source agents become available, coordinate
  their outputs to produce cross-source weekly regulatory briefings.

  If a regulatory sub-agent call fails, do not substitute workspace files
  for current regulatory data.

  Explain that the live regulatory source check failed.

  If the failure is retryable, retry the same regulatory sub-agent once.

  Do not claim that workspace files represent current MFDS updates.
	  `.trim();
	}

	getTools(): ToolSet {
		return {
			mfdsRegulatory: agentTool(MFDSRegulatoryAgent, {
				displayName: "MFDS Regulatory Agent",

				description: `
  Delegate MFDS regulatory monitoring and analysis to the specialized
  MFDS sub-agent.
  
  Use this agent to collect and analyze newly published MFDS regulatory
  information relevant to clinical trials and CRA work.
  
  The sub-agent performs source collection and CRA relevance analysis
  internally, and returns a compact result instead of raw RSS content.
				`.trim(),

				inputSchema: z.object({
					since: z
						.string()
						.optional()
						.describe(
							"Start date or ISO 8601 datetime. Examples: 2026-09-10 or 2026-09-10T00:00:00+09:00",
						),

					purpose: z
						.enum(["weekly-briefing", "regulatory-check", "cra-learning"])
						.default("regulatory-check")
						.describe("Why the MFDS regulatory analysis is being requested."),

					includeIrrelevant: z
						.boolean()
						.default(false)
						.describe(
							"Whether CRA-irrelevant items should also be returned. Normally false.",
						),
				}),
			}),

			...createExtensionTools({
				manager: this.extensionManager!,
			}),
		};
	}

	configureContext(): ContextConfig[] | Promise<ContextConfig[]> {
		return [
			{
				label: "soul",

				provider: {
					get: async () =>
						`
  You are a CRA-focused regulatory intelligence assistant.
  
  Prefer traceable official-source information, concise analysis,
  and clear separation between collected facts and AI interpretation.
			  `.trim(),
				},
			},

			{
				label: "memory",
				description: "Things to remember about the user across conversations.",
				maxTokens: 10_000,
			},
		];
	}

	/**
	 * R2 skills catalog.
	 * Think automatically adds the skills context block.
	 */
	getSkills(): SkillSource[] {
		return [
			skills.r2(this.env.SKILLS, {
				prefix: "skills/",
				refreshIntervalMs: 0,
			}),
		];
	}

	@callable()
	async readWorkspaceFile(path: string) {
		return await this.workspace.readFile(path);
	}

	private resolveSubagentKey(
		agentType: string,
	): "mfds" | "ich" | "konect" | undefined {
		switch (agentType) {
			case "MFDSRegulatoryAgent":
				return "mfds";

			case "ICHRegulatoryAgent":
				return "ich";

			case "KoNECTRegulatoryAgent":
				return "konect";

			default:
				return undefined;
		}
	}

	override async onProgress(
		run: AgentToolRunInfo,
		progress: AgentToolProgressSnapshot,
	) {
		const key = this.resolveSubagentKey(run.agentType);

		if (!key) {
			return;
		}

		this.setState({
			...this.state,
			subagents: {
				...this.state.subagents,

				[key]: {
					status: progress.fraction === 1 ? "completed" : "running",

					phase: progress.phase,

					message: progress.message,

					progress: progress.fraction,

					runId: run.runId,

					updatedAt: new Date().toISOString(),
				},
			},
		});
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", {
				status: 404,
			})
		);
	},
} satisfies ExportedHandler<Env>;
