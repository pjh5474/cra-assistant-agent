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
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { MFDSRegulatoryAgent } from "./agents/MFDSRegulatoryAgent.ts";
import { ICHRegulatoryAgent } from "./agents/ICHRegulatoryAgent.ts";
import type {
	MFDSWorkflowInput,
	RegulatoryWorkflowProgress,
	RegulatoryWorkflowState,
	StartRegulatoryBriefingInput,
} from "./types/workflow.ts";
import { RegulatoryBriefingWorkflow } from "./workflows/RegulatoryBriefingWorkflow.ts";
import { createInitialWorkflowState } from "./helpers/createInitialWorkflowState.ts";
import { ICHImplementationCollector } from "./source-collectors/ICHImplementationCollector.ts";
import { ICHGuidelineCollector } from "./source-collectors/ICHGuidelineCollector.ts";

export { MFDSRegulatoryAgent, RegulatoryBriefingWorkflow, ICHRegulatoryAgent };

export type SubagentStatus = "idle" | "running" | "completed" | "error";

export interface SubagentActivity {
	status: SubagentStatus;
	phase?: string;
	message?: string;
	progress?: number;
	runId?: string;
	updatedAt: string;
}

export type CraAssistantAgentState = {
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

	regulatoryWorkflow: RegulatoryWorkflowState;
};

export class CraAssistantAgent extends Think<Env, CraAssistantAgentState> {
	extensionLoader = this.env.LOADER;

	/*
	 * State & Basic Functions Start
	 */

	initialState: CraAssistantAgentState = {
		files: [],
		subagents: {
			mfds: {
				status: "idle",
				phase: undefined,
				message: undefined,
				progress: undefined,
				runId: undefined,
				updatedAt: new Date().toISOString(),
			},
			ich: {
				status: "idle",
				phase: undefined,
				message: undefined,
				progress: undefined,
				runId: undefined,
				updatedAt: new Date().toISOString(),
			},
			konect: {
				status: "idle",
				phase: undefined,
				message: undefined,
				progress: undefined,
				runId: undefined,
				updatedAt: new Date().toISOString(),
			},
		},
		regulatoryWorkflow: createInitialWorkflowState(),
	};

	getState(): CraAssistantAgentState {
		return this.state;
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
				.enum([
				  "weekly-briefing",
				  "regulatory-check",
				  "cra-learning",
				])
				.default("regulatory-check")
				.describe(
				  "Why the MFDS regulatory analysis is being requested.",
				),
	  
			  includeIrrelevant: z
				.boolean()
				.default(false)
				.describe(
				  "Whether CRA-irrelevant items should also be returned. Normally false.",
				),
			}),
		  }),
	  
		  ichRegulatory: agentTool(ICHRegulatoryAgent, {
			displayName: "ICH Regulatory Agent",
	  
			description: `
	  Delegate ICH guideline lookup and regulatory analysis to the specialized
	  ICH sub-agent.
	  
	  Use this agent to check official ICH guideline information,
	  implementation status, Step status, and official documents relevant
	  to clinical trials and CRA work.
	  
	  Typical use cases include ICH E6/GCP, MFDS implementation status,
	  and official ICH guideline documents.
			`.trim(),
	  
			inputSchema: z.object({
			  member: z
				.string()
				.optional()
				.default("MFDS, Republic of Korea")
				.describe(
				  "ICH member or regulatory authority to focus on.",
				),
	  
			  guidelinePrefixes: z
				.array(z.string())
				.optional()
				.default(["E6"])
				.describe(
				  "Guideline families to include, for example ['E6'] or ['E2', 'E6', 'E8'].",
				),
	  
			  guidelineCodes: z
				.array(z.string())
				.optional()
				.describe(
				  "Exact guideline codes to include, for example ['E6(R3)'].",
				),
	  
			  includeAllImplementations: z
				.boolean()
				.optional()
				.default(false)
				.describe(
				  "Whether implementation information for all ICH members should be retained.",
				),
			}),
		  }),
	  
		  getTodayDate: tool({
			description: "Get the today's date in YYYY-MM-DD format",
			inputSchema: z.object({}),
			execute: async () => {
			  return new Date().toISOString().split("T")[0];
			},
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

	/* State & Basic Functions End */

	/*
	 * File System Start
	 */

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

	@callable()
	async readWorkspaceFile(path: string) {
		return await this.workspace.readFile(path);
	}

	/* File System End */

	/*
	 * R2 skills catalog.
	 */
	getSkills(): SkillSource[] {
		return [
			skills.r2(this.env.SKILLS, {
				prefix: "skills/",
				refreshIntervalMs: 0,
			}),
		];
	}

	/* R2 Skills Catalog End */

	/*
	 * Regulatory Briefing Workflow Start
	 */
	@callable()
	async startRegulatoryBriefingWorkflow(input: StartRegulatoryBriefingInput) {
		console.log("[CraAssistantAgent] startRegulatoryBriefingWorkflow", input);
		const params = {
			since: input.since,
			until: input.until,
			sources: input.sources ?? ["MFDS"],
			purpose: input.purpose ?? "weekly-briefing",
			includeRag: input.includeRag ?? false,
			requireApproval: input.requireApproval ?? false,
			sendEmail: input.sendEmail ?? false,
		};

		const instanceId = await this.runWorkflow(
			"REGULATORY_BRIEFING_WORKFLOW",
			params,
			{
				metadata: {
					type: "regulatory-briefing",
					sources: params.sources.join(","),
					purpose: params.purpose,
					startedAt: new Date().toISOString(),
				},
			},
		);

		this.setState({
			...this.state,
			regulatoryWorkflow: {
				...this.state.regulatoryWorkflow,
				workflowId: instanceId,
				stage: "initializing",
				progress: 0,
				startedAt: new Date().toISOString(),
				completedAt: undefined,
				error: undefined,
			},
		});

		return {
			ok: true,
			workflowId: instanceId,
			params,
		};
	}

	async collectMFDSForWorkflow(input: MFDSWorkflowInput) {
		const mfds = await this.dynamicAgents.get(
			MFDSRegulatoryAgent,
			"mfds-regulatory",
		);

		return mfds.collectAndAnalyzeForWorkflow(input);
	}

	override async onWorkflowProgress(
		workflowName: string,
		instanceId: string,
		progress: unknown,
	) {
		const p = progress as RegulatoryWorkflowProgress;

		this.setState({
			...this.state,
			regulatoryWorkflow: {
				...this.state.regulatoryWorkflow,
				workflowId: instanceId,
				stage: p.stage,
				progress: p.percent,
			},
		});

		console.log("[CraAssistantAgent] workflow progress", {
			workflowName,
			instanceId,
			progress: p,
		});
	}

	/* Regulatory Briefing Workflow End */

	/*
	 * Sub-Agent Start
	 */

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

	/* Sub-Agent End */

	/*
	 * ICH Regulatory Agent Start
	 */
	@callable()
	async testICHImplementation() {
		const collector = new ICHImplementationCollector();

		const result = await collector.collect({
			partyId: 30,
			// guidelineId: 72,
		});

		console.log("[ICH TEST RESULT]", JSON.stringify(result, null, 2));

		return result;
	}

	@callable()
	async testICHEfficacyPage() {
		const response = await fetch(
			"https://www.ich.org/page/efficacy-guidelines",
		);

		const html = await response.text();

		const result = {
			status: response.status,
			hasE6R3: html.includes("E6(R3)"),
			hasDocumentPdf: html.includes("document-pdf"),
			hasConsolidatedGuideline: html.includes("Consolidated Guideline"),
			length: html.length,
		};

		console.log("[ICH Efficacy Test]", result);

		const collector = new ICHGuidelineCollector();

		const efficacyResult = await collector.collect();

		const e6r3 = efficacyResult.guidelines.find(
			(item) => item.displayCode === "E6(R3)",
		);

		console.log("[ICH Efficacy Test - E6(R3)]", e6r3);

		return {
			pageTest: result,
			collectorTest: {
				totalFetched: efficacyResult.totalFetched,
				totalReturned: efficacyResult.totalReturned,
				failures: efficacyResult.failures,
				e6r3,
			},
		};
	}

	/* ICH Regulatory Agent End */

	/*
	 * KoNECT Regulatory Agent Start
	 */

	/* KoNECT Regulatory Agent End */
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
