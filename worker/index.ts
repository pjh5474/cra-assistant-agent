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
import type { ICHWorkflowInput, ICHWorkflowResult } from "./types/ich.ts";
import { KoNECTRegulatoryAgent } from "./agents/KoNECTRegulatoryAgent.ts";
import type {
	KoNECTWorkflowInput,
	KoNECTWorkflowResult,
} from "./types/konect.ts";
import type {
	AgentMemoryItem,
	AgentMemorySnapshot,
	AgentMemorySource,
} from "./types/agent-memory.ts";

export {
	MFDSRegulatoryAgent,
	RegulatoryBriefingWorkflow,
	ICHRegulatoryAgent,
	KoNECTRegulatoryAgent,
};

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

const regulatoryMemoryAnalysisInputSchema = z.object({
	source: z
		.enum(["MFDS", "ICH", "KONECT"])
		.describe(
			"The regulatory source whose stored analysis should be retrieved.",
		),

	sourceId: z
		.string()
		.min(1)
		.describe("The source-specific identifier, such as E6(R3) for ICH."),
});

const regulatoryMemorySearchInputSchema = z.object({
	query: z
		.string()
		.min(1)
		.describe(
			"Search text for stored regulatory memory, such as E6(R3), monitoring, consent, CRA education, or data integrity.",
		),

	source: z
		.enum(["MFDS", "ICH", "KONECT"])
		.optional()
		.describe("Optional source filter."),

	limit: z.number().int().min(1).max(20).optional().default(10),
});

const recentRegulatoryChangesInputSchema = z.object({
	source: z
		.enum(["MFDS", "ICH", "KONECT"])
		.optional()
		.describe("Optional source filter."),

	limit: z.number().int().min(1).max(20).optional().default(10),
});

export class CraAssistantAgent extends Think<Env, CraAssistantAgentState> {
	maxSteps = 8;
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
	  
	  Your role is to coordinate specialized regulatory agents and regulatory
	  memory to help with clinical-trial and CRA-related regulatory monitoring,
	  research, analysis, and learning.
	  
	  You should normally delegate source-specific factual retrieval to the
	  specialized agent that owns that source rather than collecting or inventing
	  source information yourself.
	  
	  AVAILABLE REGULATORY SOURCES
	  
	  1. ICH Regulatory Agent
		 Primary owner of questions centered on ICH guidelines.
	  
		 Use the ICH agent for:
		 - ICH E6 / E6(R2) / E6(R3)
		 - ICH E2, E8, E9 and other ICH guideline families
		 - guideline Step status
		 - official ICH documents
		 - implementation status by ICH member
		 - Korean implementation/adoption status of an ICH guideline
		 - MFDS, Republic of Korea implementation status recorded by ICH
	  
		 IMPORTANT:
		 If a question is centered on an ICH guideline, use the ICH agent first,
		 even when the user mentions Korea, Korean implementation, or MFDS.
	  
		 Example:
		 "ICH E6(R3) 관련 한국 최신 현황"
		 -> ICH agent first, with member "MFDS, Republic of Korea".
	  
	  2. MFDS Regulatory Agent
		 Primary owner of Korean MFDS regulatory publications.
	  
		 Use the MFDS agent for:
		 - recent MFDS notices
		 - laws and regulatory revisions
		 - MFDS guidelines
		 - safety information
		 - Korean domestic regulatory updates
		 - newly published MFDS clinical-trial-related information
	  
		 Do NOT use the MFDS agent as the primary source merely because an
		 ICH-guideline question mentions Korea or MFDS.
	  
	  3. KoNECT Regulatory Agent
		 Primary owner of KoNECT notices and CRA education information.
	  
		 Use the KoNECT agent for:
		 - KoNECT general / education / certification notices
		 - CRA 신규자 / 심화 / 보수 courses
		 - currently open CRA education
		 - GCP-related education information
		 - KoNECT professional-development information
	  
		 KoNECT training information is professional-development information
		 and must not be presented as a new regulatory requirement unless
		 the source explicitly states that.
	  
	  CROSS-SOURCE RESEARCH
	  
	  For broad questions asking for the "latest status", "current situation",
	  "research", or a comprehensive investigation, more than one source may
	  be useful.
	  
	  For a Korea-focused question centered on an ICH guideline:
	  1. Use the ICH agent first for the authoritative ICH guideline status
		 and Korean implementation status.
	  2. If useful, use the MFDS agent second to check recent Korean domestic
		 notices, laws, or guidance.
	  3. Clearly distinguish:
		 - ICH guideline / implementation information
		 - MFDS domestic regulatory publications
	  
	  Do not substitute one source for another simply because their subject
	  matter overlaps.
	  
	  REGULATORY MEMORY VS LIVE SOURCE

		Use getRegulatoryAnalysis when the user refers to one known regulatory item
		and asks for:
		- previous analysis
		- stored analysis
		- remembered CRA impact or relevance
		- what was previously determined for that specific item
		- an analysis already produced for a known MFDS, ICH, or KoNECT item

		Use searchRegulatoryMemory when the user asks to:
		- search stored regulatory knowledge by topic or keyword
		- find previous analyses related to monitoring, consent, GCP, safety,
		essential documents, data integrity, CRA education, or similar topics
		- recall what the agent already knows across multiple stored items
		- search stored titles, summaries, CRA impacts, categories, or reasoning

		Use listRecentRegulatoryChanges when the user asks:
		- what previous monitoring runs detected as new or changed
		- which regulatory items were recently recorded as changed
		- what changes the agent previously observed in regulatory memory

		Use live regulatory agents when the user asks about:
		- current status
		- latest information
		- today's updates
		- currently open courses
		- whether something has changed now
		- verification against the official source

		Regulatory memory represents stored observations and analyses.
		It must not be presented as fresh live-source verification.

		If the user asks for current, latest, today's, or presently valid information,
		use the appropriate live regulatory source agent even if matching memory exists.

		If the user asks to compare stored knowledge with the current situation,
		you may use regulatory memory first and then perform a live source check.

		Do not use a memory tool merely because a related stored item exists.
		Choose memory only when the user's intent is historical, stored, remembered,
		or based on previous monitoring results.
	  
	  Stored regulatory memory is not fresh source verification.
	  Never present memory alone as proof of the current regulatory state.
	  
	  If a question requires both previous reasoning and current verification,
	  you may use both memory and a live regulatory source.
	  
	  DATE HANDLING
	  
	  When passing dates to regulatory agents:
	  - use full ISO 8601 datetime values
	  - preserve timezone information
	  - do not silently broaden the user's requested range
	  
	  A successful source query returning zero items is a valid result.
	  Do not retry or remove date filters simply because no items were returned.
	  
	  SOURCE AND ANALYSIS INTEGRITY
	  
	  Do not invent regulatory updates, implementation status, or source facts.
	  
	  When presenting regulatory information:
	  - distinguish official source facts from generated analysis
	  - preserve source URLs when available
	  - mention uncertainty when source information is incomplete
	  - do not overstate professional-development information as regulation
	  - treat generated analysis as workflow assistance, not legal or regulatory advice
	  
	  Do not claim a specific source type such as "newsletter" before the source
	  agent actually returns that source information.

	  Date-range policy for live regulatory lookups:

	  - Do not request excessively broad date ranges unless the user explicitly asks for historical research.
	  - For "latest", "recent", or general current-status questions:
	  - prefer the last 30 days for MFDS
	  - expand only if needed
	  - For weekly monitoring:
	  - use the requested weekly range
	  - If the requested or inferred range exceeds 90 days, do not silently broaden or execute it as a normal live lookup.
	  - For broad historical research, ask for or derive a narrower target topic and date range.
	  
	  FAILURE HANDLING
	  
	  If a regulatory source agent call fails:
	  - do not substitute regulatory memory or workspace files as current data
	  - state that the live source check failed
	  - if the failure appears transient, retry the same source once
	  - do not broaden or change the user's request merely to obtain a result
	  
	  Choose tools based primarily on the subject's source ownership, not on
	  isolated keywords such as "Korea", "MFDS", or "CRA".
		`.trim();
	}

	getTools(): ToolSet {
		return {
			mfdsRegulatory: agentTool(MFDSRegulatoryAgent, {
				displayName: "MFDS Regulatory Agent",

				description: `
				Primary tool for official Korean MFDS regulatory publications.

				Use this agent for:
				- MFDS notices and announcements
				- Korean laws and regulatory revisions
				- MFDS guidelines
				- drug / clinical-trial safety information
				- recent Korean domestic regulatory publications
				- recent MFDS clinical-trial-related updates

				Do NOT use this agent as the primary source for a question centered on
				an ICH guideline such as E6(R3), even if the user asks about Korea or MFDS.
				For Korean implementation status of an ICH guideline, use the ICH agent first.

				This agent performs official-source collection and CRA relevance analysis
				and returns compact analyzed results.
			`.trim(),

				inputSchema: z.object({
					since: z
						.string()
						.optional()
						.describe(
							"Start date in YYYY-MM-DD or ISO 8601 format. For 'today', use the actual current date provided by the agent context.",
						),

					until: z
						.string()
						.optional()
						.describe(
							"End date or full ISO 8601 datetime for MFDS publication filtering.",
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

			ichRegulatory: agentTool(ICHRegulatoryAgent, {
				displayName: "ICH Regulatory Agent",

				description: `
				Primary tool for questions centered on official ICH guidelines.

				Use this agent for:
				- ICH E6 / E6(R2) / E6(R3)
				- other ICH guideline families such as E2, E8, and E9
				- ICH guideline Step status
				- official ICH guideline documents
				- implementation status by ICH member
				- Korean implementation or adoption status of an ICH guideline
				- "MFDS, Republic of Korea" implementation information recorded by ICH

				IMPORTANT:
				If the question is centered on an ICH guideline, use this agent first
				even when the user mentions Korea, Korean implementation, or MFDS.

				Examples:
				- "ICH E6(R3) 최신 현황"
				- "E6(R3) 한국 도입 현황"
				- "MFDS에서 E6(R3)가 시행됐나요?"
				- "E6(R3)의 한국 implementation status를 확인해줘"
			`.trim(),

				inputSchema: z.object({
					member: z
						.string()
						.optional()
						.default("MFDS, Republic of Korea")
						.describe("ICH member or regulatory authority to focus on."),

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

			konectRegulatory: agentTool(KoNECTRegulatoryAgent, {
				displayName: "KoNECT Regulatory Agent",

				description: `
				Primary tool for official KoNECT notices and CRA education information.

				Use this agent for:
				- KoNECT general notices
				- KoNECT education notices
				- KoNECT certification notices
				- CRA education and training courses
				- CRA 신규자 / 심화 / 보수 courses
				- currently open CRA course applications
				- GCP-related education information

				KoNECT course information is normally professional-development information,
				not a regulatory change or legal requirement.

				Do not use this agent as a substitute for ICH or MFDS when the user's
				question is primarily about an ICH guideline or an MFDS regulation.
				`.trim(),

				inputSchema: z.object({
					since: z
						.string()
						.optional()
						.describe(
							"Start date or ISO 8601 datetime. Used to filter KoNECT notices and course dates.",
						),

					until: z
						.string()
						.optional()
						.describe(
							"End date or ISO 8601 datetime. Used to filter KoNECT notices and course dates.",
						),

					includeCourses: z
						.boolean()
						.optional()
						.default(true)
						.describe(
							"Whether CRA education and course information should be included.",
						),

					onlyOpenCourses: z
						.boolean()
						.optional()
						.default(true)
						.describe(
							"Whether to return only CRA courses that are currently open for application.",
						),

					includeNoticeTypes: z
						.array(z.enum(["general", "education", "certification"]))
						.optional()
						.default(["general", "education", "certification"])
						.describe("KoNECT notice categories to include."),

					includeIrrelevant: z
						.boolean()
						.optional()
						.default(false)
						.describe(
							"Whether CRA-irrelevant items should also be returned. Normally false.",
						),
				}),
			}),

			getTodayDate: tool({
				description:
					"Get today's calendar date in Korea Standard Time (Asia/Seoul) as YYYY-MM-DD.",

				inputSchema: z.object({}),

				execute: async () => {
					return new Intl.DateTimeFormat("en-CA", {
						timeZone: "Asia/Seoul",
						year: "numeric",
						month: "2-digit",
						day: "2-digit",
					}).format(new Date());
				},
			}),

			getRegulatoryAnalysis: tool({
				description: `
				Retrieve a previously stored analysis for one known regulatory item
				from agent memory.

				Use this tool when the user explicitly asks about:
				- a previous or stored analysis
				- what was previously determined
				- remembered CRA impact or relevance
				- what the agent already knows about a specific item
				- an existing analysis for a known ICH, MFDS, or KoNECT item

				Do NOT use this tool as the sole source for:
				- latest status
				- current implementation status
				- today's updates
				- current course availability
				- live regulatory verification

				Memory is stored historical knowledge and is not a live source refresh.
				`.trim(),

				inputSchema: regulatoryMemoryAnalysisInputSchema,

				execute: async ({ source, sourceId }) => {
					const result = await this.getRegulatoryAnalysis(source, sourceId);

					if (!result) {
						return {
							found: false,

							source,
							sourceId,

							message:
								"No stored memory item was found for this source and sourceId.",
						};
					}

					return {
						found: true,
						item: result,
					};
				},
			}),

			searchRegulatoryMemory: tool({
				description: `
			  Search previously stored regulatory memory and analysis.
			  
			  Use this tool when the user asks:
			  - what the agent already knows about a topic
			  - to find previous regulatory analyses
			  - to search stored CRA-impact assessments
			  - to find remembered information across MFDS, ICH, or KoNECT
			  - for previously analyzed topics such as monitoring, consent, GCP,
				essential documents, safety, or CRA education
			  
			  This tool searches stored memory only.
			  It does not verify the current official source.
			  Do not use it as the sole source for "latest", "current", or "today" questions.
				`.trim(),

				inputSchema: regulatoryMemorySearchInputSchema,

				execute: async ({ query, source, limit }) => {
					const items = await this.searchRegulatoryMemory(query, source, limit);

					return {
						query,
						source: source ?? "ALL",
						count: items.length,
						items,
					};
				},
			}),

			listRecentRegulatoryChanges: tool({
				description: `
			  List recent new or changed items recorded in regulatory memory.
			  
			  Use this tool when the user asks:
			  - what changed recently in stored regulatory memory
			  - which items the monitoring workflow detected as new or changed
			  - recent remembered MFDS, ICH, or KoNECT changes
			  - what the agent detected during previous monitoring runs
			  
			  This tool reports changes already recorded in memory.
			  It is NOT a live regulatory source check.
			  
			  For "latest right now", "today", or current verification,
			  use the appropriate live regulatory source agent instead.
				`.trim(),

				inputSchema: recentRegulatoryChangesInputSchema,

				execute: async ({ source, limit }) => {
					const items = await this.listRecentRegulatoryChanges(source, limit);

					return {
						source: source ?? "ALL",
						count: items.length,
						items,
					};
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

		return await mfds.collectAndAnalyzeForWorkflow(input);
	}

	async collectICHForWorkflow(
		input: ICHWorkflowInput,
	): Promise<ICHWorkflowResult> {
		const ich = await this.dynamicAgents.get(
			ICHRegulatoryAgent,
			"ich-regulatory",
		);

		return ich.collectAndAnalyzeForWorkflow(input);
	}

	async collectKoNECTForWorkflow(
		input: KoNECTWorkflowInput,
	): Promise<KoNECTWorkflowResult> {
		const konect = await this.dynamicAgents.get(
			KoNECTRegulatoryAgent,
			"konect-regulatory",
		);

		return konect.collectAndAnalyzeForWorkflow(input);
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
	 * ICH Regulatory Agent test Start
	 */
	// @callable()
	// async testICHImplementation() {
	// 	const collector = new ICHImplementationCollector();

	// 	const result = await collector.collect({
	// 		partyId: 30,
	// 		// guidelineId: 72,
	// 	});

	// 	console.log("[ICH TEST RESULT]", JSON.stringify(result, null, 2));

	// 	return result;
	// }

	// @callable()
	// async testICHEfficacyPage() {
	// 	const response = await fetch(
	// 		"https://www.ich.org/page/efficacy-guidelines",
	// 	);

	// 	const html = await response.text();

	// 	const result = {
	// 		status: response.status,
	// 		hasE6R3: html.includes("E6(R3)"),
	// 		hasDocumentPdf: html.includes("document-pdf"),
	// 		hasConsolidatedGuideline: html.includes("Consolidated Guideline"),
	// 		length: html.length,
	// 	};

	// 	console.log("[ICH Efficacy Test]", result);

	// 	const collector = new ICHGuidelineCollector();

	// 	const efficacyResult = await collector.collect();

	// 	const e6r3 = efficacyResult.guidelines.find(
	// 		(item) => item.displayCode === "E6(R3)",
	// 	);

	// 	console.log("[ICH Efficacy Test - E6(R3)]", e6r3);

	// 	return {
	// 		pageTest: result,
	// 		collectorTest: {
	// 			totalFetched: efficacyResult.totalFetched,
	// 			totalReturned: efficacyResult.totalReturned,
	// 			failures: efficacyResult.failures,
	// 			e6r3,
	// 		},
	// 	};
	// }

	/* ICH Regulatory Agent test End */

	/*
	 * KoNECT Regulatory Agent test Start
	 */

	// @callable()
	// async testKoNECTCollector() {
	// 	const collector = new KoNECTCollector();

	// 	const result = await collector.collect({
	// 		since: "2026-09-01",
	// 		until: "2026-09-30",
	// 		includeCourses: true,
	// 		includeNoticeTypes: ["general", "education", "certification"],
	// 	});

	// 	console.log("[KoNECT TEST RESULT]", JSON.stringify(result, null, 2));

	// 	return result;
	// }

	// @callable()
	// async testKoNECTSubAgent() {
	// 	console.log("[CraAssistantAgent] testKoNECTSubAgent start");

	// 	using konect = await this.dynamicAgents.get(
	// 		KoNECTRegulatoryAgent,
	// 		"konect-regulatory",
	// 	);

	// 	const result = await konect.collectAndAnalyzeForWorkflow({
	// 		since: "2026-09-01",
	// 		until: "2026-09-30",
	// 		includeCourses: true,
	// 		includeNoticeTypes: ["general", "education", "certification"],
	// 		includeIrrelevant: false,
	// 	});

	// 	console.log("[CraAssistantAgent] testKoNECTSubAgent complete", {
	// 		totalFetched: result.totalFetched,
	// 		candidateCount: result.candidateCount,
	// 		relevantCount: result.relevantCount,
	// 		warnings: result.warnings,
	// 	});

	// 	return result;
	// }

	/* KoNECT Regulatory Agent test End */

	/*
	 * Manifest Store test Start
	 */
	// @callable()
	// async testMFDSManifestStore() {
	// 	const mfds = await this.dynamicAgents.get(
	// 		MFDSRegulatoryAgent,
	// 		"mfds-regulatory",
	// 	);

	// 	return await mfds.testManifestStore();
	// }

	/* Manifest Store test End */

	/*
	 * Regulatory Memory Store
	 */
	@callable()
	async getRegulatoryMemory(): Promise<AgentMemorySnapshot> {
		console.log("[CraAssistantAgent] regulatory memory snapshot requested");

		const mfds = await this.dynamicAgents.get(
			MFDSRegulatoryAgent,
			"mfds-regulatory",
		);

		const ich = await this.dynamicAgents.get(
			ICHRegulatoryAgent,
			"ich-regulatory",
		);

		const konect = await this.dynamicAgents.get(
			KoNECTRegulatoryAgent,
			"konect-regulatory",
		);

		const mfdsSnapshot = await mfds.getMemorySnapshot();

		const ichSnapshot = await ich.getMemorySnapshot();

		const konectSnapshot = await konect.getMemorySnapshot();

		const snapshots = [mfdsSnapshot, ichSnapshot, konectSnapshot];

		const memory: AgentMemorySnapshot = {
			generatedAt: new Date().toISOString(),

			sources: snapshots.map((snapshot) => snapshot.summary),

			items: snapshots
				.flatMap((snapshot) => snapshot.items)
				.sort((a, b) => {
					return (
						new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
					);
				}),
		};
		return memory;
	}

	@callable()
	async getRegulatoryAnalysis(
		source: AgentMemorySource,
		sourceId: string,
	): Promise<AgentMemoryItem | undefined> {
		console.log("[CraAssistantAgent] get regulatory analysis", {
			source,
			sourceId,
		});

		switch (source) {
			case "MFDS": {
				const agent = await this.dynamicAgents.get(
					MFDSRegulatoryAgent,
					"mfds-regulatory",
				);

				return await agent.getMemoryItem(sourceId);
			}

			case "ICH": {
				const agent = await this.dynamicAgents.get(
					ICHRegulatoryAgent,
					"ich-regulatory",
				);

				return await agent.getMemoryItem(sourceId);
			}

			case "KONECT": {
				const agent = await this.dynamicAgents.get(
					KoNECTRegulatoryAgent,
					"konect-regulatory",
				);

				return await agent.getMemoryItem(sourceId);
			}
		}
	}

	@callable()
	async listRecentRegulatoryChanges(
		source?: AgentMemorySource,
		limit = 20,
	): Promise<AgentMemoryItem[]> {
		console.log("[CraAssistantAgent] list recent regulatory changes", {
			source,
			limit,
		});

		if (source === "MFDS") {
			const agent = await this.dynamicAgents.get(
				MFDSRegulatoryAgent,
				"mfds-regulatory",
			);

			return await agent.listRecentMemoryChanges(limit);
		}

		if (source === "ICH") {
			const agent = await this.dynamicAgents.get(
				ICHRegulatoryAgent,
				"ich-regulatory",
			);

			return await agent.listRecentMemoryChanges(limit);
		}

		if (source === "KONECT") {
			const agent = await this.dynamicAgents.get(
				KoNECTRegulatoryAgent,
				"konect-regulatory",
			);

			return await agent.listRecentMemoryChanges(limit);
		}

		const mfds = await this.dynamicAgents.get(
			MFDSRegulatoryAgent,
			"mfds-regulatory",
		);

		const ich = await this.dynamicAgents.get(
			ICHRegulatoryAgent,
			"ich-regulatory",
		);

		const konect = await this.dynamicAgents.get(
			KoNECTRegulatoryAgent,
			"konect-regulatory",
		);

		const [mfdsItems, ichItems, konectItems] = await Promise.all([
			mfds.listRecentMemoryChanges(limit),
			ich.listRecentMemoryChanges(limit),
			konect.listRecentMemoryChanges(limit),
		]);

		return [...mfdsItems, ...ichItems, ...konectItems]
			.sort(
				(a, b) =>
					new Date(b.lastChangedAt).getTime() -
					new Date(a.lastChangedAt).getTime(),
			)
			.slice(0, limit);
	}

	@callable()
	async searchRegulatoryMemory(
		query: string,
		source?: AgentMemorySource,
		limit = 20,
	): Promise<AgentMemoryItem[]> {
		console.log("[CraAssistantAgent] search regulatory memory", {
			query,
			source,
			limit,
		});

		if (!query.trim()) {
			return [];
		}

		if (source === "MFDS") {
			const agent = await this.dynamicAgents.get(
				MFDSRegulatoryAgent,
				"mfds-regulatory",
			);

			return await agent.searchMemory(query, limit);
		}

		if (source === "ICH") {
			const agent = await this.dynamicAgents.get(
				ICHRegulatoryAgent,
				"ich-regulatory",
			);

			return await agent.searchMemory(query, limit);
		}

		if (source === "KONECT") {
			const agent = await this.dynamicAgents.get(
				KoNECTRegulatoryAgent,
				"konect-regulatory",
			);

			return await agent.searchMemory(query, limit);
		}

		const mfds = await this.dynamicAgents.get(
			MFDSRegulatoryAgent,
			"mfds-regulatory",
		);

		const ich = await this.dynamicAgents.get(
			ICHRegulatoryAgent,
			"ich-regulatory",
		);

		const konect = await this.dynamicAgents.get(
			KoNECTRegulatoryAgent,
			"konect-regulatory",
		);

		const [mfdsItems, ichItems, konectItems] = await Promise.all([
			mfds.searchMemory(query, limit),
			ich.searchMemory(query, limit),
			konect.searchMemory(query, limit),
		]);

		return [...mfdsItems, ...ichItems, ...konectItems]
			.sort((a, b) => {
				const relevanceDiff =
					(b.analysis?.relevanceScore ?? 0) - (a.analysis?.relevanceScore ?? 0);

				if (relevanceDiff !== 0) {
					return relevanceDiff;
				}

				return (
					new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
				);
			})
			.slice(0, limit);
	}

	/* Regulatory Memory Store End */
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
