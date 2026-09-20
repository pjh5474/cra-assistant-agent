import { Think, skills } from "@cloudflare/think";
import {
	callable,
	getAgentByName,
	routeAgentRequest,
	type AgentToolProgressSnapshot,
} from "agents";
import type { AgentToolRunInfo } from "agents/agent-tools";
import { AgentContextProvider, type ContextConfig } from "agents/context";
import type { SkillSource } from "agents/skills";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { MFDSRegulatoryAgent } from "./agents/MFDSRegulatoryAgent.ts";
import { ICHRegulatoryAgent } from "./agents/ICHRegulatoryAgent.ts";
import { RegulatoryRAGAgent } from "./agents/RegulatoryRAGAgent.ts";
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
import type { RegulatoryRAGSearchResult } from "./types/regulatory-rag.ts";
import { formatRegulatoryHeading } from "./helpers/formatRegulatoryHeading.ts";
import { CRA_ASSISTANT_SOUL } from "./prompts/soul.ts";
import { extractRegulatoryDocumentMetadata } from "./helpers/extractRegulatoryDocumentMetadata.ts";

import type { SubagentActivity } from "../shared/types/agent.ts";
import type { EmailDraft } from "../shared/types/email.ts";
import { weeklyToCron } from "../shared/utils/regulatorySchedule.ts";
import { sendEmail } from "./services/emailDelivery.ts";
import type { RegulatorySchedulePayload } from "../shared/types/schedule.ts";
import { ScheduledRunHistoryStore } from "./stores/ScheduledRunHistoryStore.ts";

export {
	MFDSRegulatoryAgent,
	RegulatoryBriefingWorkflow,
	ICHRegulatoryAgent,
	KoNECTRegulatoryAgent,
	RegulatoryRAGAgent,
};

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
				source: "MFDS",
				displayName: "MFDS",
				status: "idle",
				phase: undefined,
				message: undefined,
				progress: undefined,
				runId: undefined,
				updatedAt: new Date().toISOString(),
			},
			ich: {
				source: "ICH",
				displayName: "ICH",
				status: "idle",
				phase: undefined,
				message: undefined,
				progress: undefined,
				runId: undefined,
				updatedAt: new Date().toISOString(),
			},
			konect: {
				source: "KONECT",
				displayName: "KoNECT",
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

	getTools(): ToolSet {
		return {
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
				from regulatory memory.

				Use this when the user asks about:
				- a previous analysis
				- stored CRA impact or relevance
				- what was previously determined for a known item

				This is stored memory, not live regulatory verification.
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
			  	Search previously stored regulatory memory by topic or keyword.

				Use this for:
				- previous regulatory analyses
				- stored CRA impact assessments
				- remembered information across MFDS, ICH, and KoNECT
				- topics such as monitoring, consent, GCP, safety, data integrity,
				essential documents, or CRA education

				This tool does not perform live source verification.
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
			  	List new or changed regulatory items that were previously recorded
				by the monitoring workflow.

				Use this when the user asks what earlier workflow runs detected
				as new or changed.

				This reflects stored observations only and is not a live source check.
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

			searchRegulatoryDocuments: tool({
				description: `
				Search the curated regulatory knowledge base, including ICH GCP and other authoritative regulatory documents. Use this for questions about guideline content, requirements, principles, responsibilities, monitoring, informed consent, data governance, and other regulatory topics.
				`.trim(),

				inputSchema: z.object({
					query: z
						.string()
						.min(2)
						.describe(
							"Semantic search query for regulatory guidance. The query may be in Korean or English.",
						),

					topK: z.number().int().min(1).max(10).optional().default(5),
				}),

				execute: async ({ query, topK }) => {
					const results = await this.searchRegulatoryDocuments(query, topK);

					return {
						query,
						count: results.length,
						results: results.map((result) => ({
							documentId: result.documentId,
							title: result.document.title,
							authority: result.document.authority,
							documentType: result.document.documentType,
							version: result.document.version,
							effectiveDate: result.document.effectiveDate,
							heading: formatRegulatoryHeading(result.heading),
							chunkIndex: result.chunkIndex,
							score: result.score,
							text: result.text,
							sourceLabel: [
								result.document.title,
								result.heading ? `§ ${result.heading}` : undefined,
							]
								.filter(Boolean)
								.join(" — "),
						})),
					};
				},
			}),

			prepareEmailDraft: tool({
				description: `
				Prepare an email draft from a Workspace artifact. 
				Use this when the user asks to email, send, share, or deliver a saved Workspace report, note, comparison, or log. 
				This tool only prepares a draft for user approval and MUST NOT send the email.

				If the user explicitly provides one or more recipient email addresses,
				include them in the \`to\` field exactly as provided.

				Do not invent recipient addresses.
				If no recipient address was provided, leave \`to\` empty so the user can fill it in during approval.
				`.trim(),

				inputSchema: z.object({
					path: z.string().describe("Exact Workspace artifact path"),
					to: z
						.array(z.email())
						.default([])
						.describe(
							"Email recipients explicitly provided by the user. Leave empty if no recipient was provided.",
						),
				}),

				execute: async ({ path, to }) => {
					const draft = await this.createEmailDraftFromWorkspace(path, to);

					return {
						type: "email_approval_required",

						message:
							"Email draft prepared. User approval is required before sending.",

						draft,
					};
				},
			}),

			scheduleRegulatoryBriefing: tool({
				description: `
				Create a recurring weekly regulatory briefing schedule. Use when the user explicitly asks to schedule, automate, or regularly run a regulatory briefing. Times are interpreted in Asia/Seoul unless the user explicitly specifies another timezone. Never invent an email recipient.

				For schedule creation:
				- Interpret ordinary user times in Asia/Seoul unless another timezone is explicitly specified.
				- Do not invent recipient email addresses.
				- Do not create a schedule unless the user clearly requests recurring or future automation.
				- Use MFDS, ICH, and KONECT by default when the user says "regulatory briefing" without specifying sources.
				- When email delivery is requested, require an explicit recipient.
				`.trim(),

				inputSchema: z.object({
					dayOfWeek: z
						.number()
						.int()
						.min(0)
						.max(6)
						.describe(
							"Day of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday",
						),

					time: z
						.string()
						.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
						.describe(
							"Time in HH:mm 24-hour format, interpreted as Asia/Seoul time",
						),

					sources: z
						.array(z.enum(["MFDS", "ICH", "KONECT"]))
						.min(1)
						.default(["MFDS", "ICH", "KONECT"]),

					sendEmail: z.boolean().default(false),

					emailRecipient: z.email().optional(),
				}),

				execute: async ({
					dayOfWeek,
					time,
					sources,
					sendEmail,
					emailRecipient,
				}) => {
					if (sendEmail && !emailRecipient) {
						return {
							success: false,
							error:
								"Email delivery was requested but no recipient was provided.",
						};
					}

					const cron = weeklyToCron(dayOfWeek, time);

					const schedule = await this.createRegulatorySchedule(cron, {
						sources,
						purpose: "weekly-briefing",
						sendEmail,
						emailRecipient: sendEmail ? emailRecipient : undefined,
						timezone: "Asia/Seoul",
					});

					return {
						success: true,
						schedule,
						dayOfWeek,
						time,
						timezone: "Asia/Seoul",
					};
				},
			}),

			getRegulatorySchedules: tool({
				description: `
				List the currently active regulatory briefing schedules.
				- Always use this tool when the user asks what schedules currently exist, are active, are registered, or are scheduled.
				- The tool result is the authoritative current state.
				- Do not rely on conversation history, memory, or previously created schedules when answering current schedule status.
				- Only report schedules returned by this tool.
				`.trim(),

				inputSchema: z.object({}),

				execute: async () => {
					return this.listRegulatorySchedules();
				},
			}),

			removeRegulatorySchedule: tool({
				description: `
				Cancel an existing regulatory briefing schedule.
				- After cancellation, do not treat the cancelled schedule as active.
				- If the user later asks for current schedules, use the schedule listing tool again.
				`.trim(),

				inputSchema: z.object({
					scheduleId: z
						.string()
						.describe("Exact schedule ID returned from the schedule list"),
				}),

				execute: async ({ scheduleId }) => {
					await this.cancelRegulatorySchedule(scheduleId);

					const schedules = await this.listRegulatorySchedules();

					return {
						success: true,
						cancelledScheduleId: scheduleId,
						activeSchedules: schedules,
					};
				},
			}),

			...createExtensionTools({
				manager: this.extensionManager!,
			}),
		};
	}

	/* State & Basic Functions End */

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
			sendEmail: input.sendEmail ?? false,
			emailRecipient: input.emailRecipient ?? undefined,
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

	async onWorkflowComplete(
		workflowName: string,
		instanceId: string,
		result?: unknown,
	) {
		console.log("[Workflow] completed", {
			workflowName,
			instanceId,
		});

		/*
		 * 다른 Workflow가 생길 수 있으므로
		 * Regulatory Briefing만 처리
		 */
		if (workflowName !== "REGULATORY_BRIEFING_WORKFLOW") {
			return;
		}

		const history = new ScheduledRunHistoryStore(this.env.HISTORY_DB);

		const workflowResult = result as
			| {
					artifact?: {
						path?: string;
					};

					email?: {
						status?: string;
						recipient?: string;
						sentAt?: string;
						error?: string;
					};
			  }
			| undefined;

		await history.completeRunByWorkflowId({
			workflowId: instanceId,

			completedAt: new Date().toISOString(),

			artifactPath: workflowResult?.artifact?.path,

			emailStatus: workflowResult?.email?.status,

			emailRecipient: workflowResult?.email?.recipient,
		});
	}

	async onWorkflowError(
		workflowName: string,
		instanceId: string,
		error: string,
	) {
		console.error("[Workflow] failed", {
			workflowName,
			instanceId,
			error,
		});

		if (workflowName !== "REGULATORY_BRIEFING_WORKFLOW") {
			return;
		}

		const history = new ScheduledRunHistoryStore(this.env.HISTORY_DB);

		await history.failRunByWorkflowId({
			workflowId: instanceId,

			completedAt: new Date().toISOString(),

			error: error || "Regulatory briefing workflow failed",
		});
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

	/*
	 * User Memory & Context
	 */

	configureContext(): ContextConfig[] | Promise<ContextConfig[]> {
		return [
			{
				label: "soul",
				provider: {
					get: async () => CRA_ASSISTANT_SOUL,
				},
			},
			{
				label: "memory",
				description: "Things to remember about the user across conversations.",
				maxTokens: 10_000,
				provider: this.getUserMemoryProvider(),
			},
		];
	}

	@callable()
	async getUserMemory() {
		const provider = this.getUserMemoryProvider();

		const content = await provider.get();

		return {
			content: content ?? "",
		};
	}

	@callable()
	async updateUserMemory(content: string) {
		const provider = this.getUserMemoryProvider();

		await provider.set(content.trim());

		return {
			success: true,
		};
	}

	@callable()
	async clearUserMemory() {
		const provider = this.getUserMemoryProvider();

		await provider.set("");

		return {
			success: true,
		};
	}

	private getUserMemoryProvider() {
		return new AgentContextProvider(this, "memory");
	}

	/* User Memory & Context End */

	/*
	 * Regulatory RAG
	 */
	private async searchRegulatoryDocuments(
		query: string,
		topK = 5,
	): Promise<RegulatoryRAGSearchResult[]> {
		const rag = await getAgentByName(
			this.env.RegulatoryRAGAgent,
			"regulatory-rag",
		);

		return rag.searchDocuments(query, topK);
	}

	@callable()
	async getRegulatoryDocuments() {
		const rag = await getAgentByName(
			this.env.RegulatoryRAGAgent,
			"regulatory-rag",
		);

		const documents = await rag.listDocuments();

		return {
			documents,
		};
	}
	/* Regulatory RAG End */

	/*
	 * Workspace
	 */

	@callable()
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
	async listWorkspaceFiles(pattern = "**/*") {
		const files = await this.workspace.glob(pattern);

		return {
			files,
		};
	}

	@callable()
	async readWorkspaceFile(path: string) {
		const content = await this.workspace.readFile(path);

		return {
			path,
			content,
		};
	}

	@callable()
	async writeWorkspaceFile(path: string, content: string) {
		await this.workspace.writeFile(path, content);

		return {
			status: "saved",
			path,
		};
	}

	@callable()
	async deleteWorkspaceFile(path: string) {
		await this.workspace.rm(path, {
			recursive: true,
		});

		return {
			status: "deleted",
			path,
		};
	}
	/* Workspace End */

	/*
	 * Email
	 */
	@callable()
	async createEmailDraftFromWorkspace(
		path: string,
		to: string[],
	): Promise<EmailDraft> {
		const result = await this.readWorkspaceFile(path);

		const fileName =
			path.split("/").filter(Boolean).at(-1) ?? "Workspace Report";

		const reportDateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);

		const reportDate = reportDateMatch?.[1];

		return {
			to,

			subject: reportDate
				? `Regulatory Briefing - ${reportDate}`
				: "Regulatory Briefing",

			body:
				`안녕하세요.\n\n` +
				`Regulatory Briefing을 전달드립니다.\n\n` +
				`${result.content}\n\n` +
				`감사합니다.`,

			sourceArtifact: {
				path,
			},

			createdAt: new Date().toISOString(),
		};
	}
	/* Email End */

	/*
	 * Schedules
	 */

	async runScheduledRegulatoryBriefing(payload: RegulatorySchedulePayload) {
		console.log("[Scheduler] running scheduled regulatory briefing", {
			payload,
		});

		const history = new ScheduledRunHistoryStore(this.env.HISTORY_DB);

		const startedAt = new Date().toISOString();

		/*
		 * 동일 schedule occurrence의 중복 실행을 막기 위한 key.
		 *
		 * 현재 weekly scheduler이므로
		 * KST 기준 실행 날짜를 occurrence key로 사용합니다.
		 */
		const scheduledFor = new Intl.DateTimeFormat("sv-SE", {
			timeZone: payload.timezone ?? "Asia/Seoul",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		})
			.format(new Date())
			.replace(" ", "T");

		const runKey = `${payload.scheduleKey}:${scheduledFor}`;

		const runId = crypto.randomUUID();

		console.log("[Scheduler] triggered", {
			runId,
			runKey,
			scheduleKey: payload.scheduleKey,
			startedAt,
			payload,
		});

		/*
		 * INSERT 성공 = 이번 occurrence의 최초 실행
		 * UNIQUE(run_key) 충돌 = 이미 실행한 occurrence
		 */
		const started = await history.startRun({
			id: runId,
			runKey,
			scheduleId: payload.scheduleKey,
			scheduledFor,
			startedAt,
		});

		if (!started) {
			console.warn("[Scheduler] duplicate run skipped", {
				runKey,
				scheduleKey: payload.scheduleKey,
			});

			return {
				skipped: true,
				reason: "duplicate-run",
				runKey,
			};
		}

		try {
			const now = new Date();

			const until = now.toISOString();

			const since = new Date(
				now.getTime() - 7 * 24 * 60 * 60 * 1000,
			).toISOString();

			const { workflowId } = await this.startRegulatoryBriefingWorkflow({
				since,
				until,
				sources: payload.sources,
				purpose: payload.purpose,
				sendEmail: payload.sendEmail,
				emailRecipient: payload.emailRecipient,
			});

			/*
			 * Workflow 시작에 성공했으므로
			 * D1 history에 workflowId 연결
			 */
			await history.attachWorkflowId(runId, workflowId);

			console.log("[Scheduler] workflow started", {
				runId,
				runKey,
				workflowId,
				since,
				until,
			});

			return {
				skipped: false,
				runId,
				runKey,
				workflowId,
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Scheduled workflow start failed";

			await history.failRun({
				id: runId,
				completedAt: new Date().toISOString(),
				error: message,
			});

			console.error("[Scheduler] workflow start failed", {
				runId,
				runKey,
				error,
			});

			throw error;
		}
	}

	@callable()
	async createRegulatorySchedule(
		cron: string,
		payload: Omit<RegulatorySchedulePayload, "scheduleKey">,
	) {
		const scheduleKey = crypto.randomUUID();

		return this.schedule(cron, "runScheduledRegulatoryBriefing", {
			...payload,
			scheduleKey,
		});
	}

	@callable()
	async listRegulatorySchedules() {
		const schedules = await this.listSchedules({
			type: "cron",
		});

		return schedules.filter(
			(schedule) => schedule.callback === "runScheduledRegulatoryBriefing",
		);
	}

	@callable()
	async cancelRegulatorySchedule(scheduleId: string) {
		return this.cancelSchedule(scheduleId);
	}

	/* Schedules End */
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		/*
		 * RAG Endpoints
		 */

		if (request.method === "POST" && url.pathname === "/api/rag/documents") {
			try {
				const formData = await request.formData();

				const file = formData.get("file");

				if (!(file instanceof File)) {
					return Response.json(
						{
							error: "file is required",
						},
						{
							status: 400,
						},
					);
				}

				const title = formData.get("title");

				const authority = formData.get("authority");

				const documentType = formData.get("documentType");

				const version = formData.get("version");

				const effectiveDate = formData.get("effectiveDate");

				if (typeof title !== "string" || !title.trim()) {
					return Response.json(
						{
							error: "title is required",
						},
						{
							status: 400,
						},
					);
				}

				if (typeof authority !== "string" || !authority.trim()) {
					return Response.json(
						{
							error: "authority is required",
						},
						{
							status: 400,
						},
					);
				}

				if (typeof documentType !== "string" || !documentType.trim()) {
					return Response.json(
						{
							error: "documentType is required",
						},
						{
							status: 400,
						},
					);
				}

				const buffer = await file.arrayBuffer();

				const rag = await getAgentByName(
					env.RegulatoryRAGAgent,
					"regulatory-rag",
				);

				const result = await rag.ingestDocument(
					buffer,
					file.name,
					file.type || "application/pdf",
					{
						title: title.trim(),
						authority: authority as any,
						documentType: documentType as any,
						version:
							typeof version === "string" && version.trim()
								? version.trim()
								: undefined,

						effectiveDate:
							typeof effectiveDate === "string" && effectiveDate.trim()
								? effectiveDate.trim()
								: undefined,
					},
				);

				return Response.json(result);
			} catch (error) {
				console.error("[RAG Upload] failed", error);

				return Response.json(
					{
						error:
							error instanceof Error
								? error.message
								: "Unknown ingestion error",
					},
					{
						status: 500,
					},
				);
			}
		}

		if (request.method === "POST" && url.pathname === "/api/rag/search") {
			try {
				const body = await request.json<{
					query?: string;
					topK?: number;
				}>();

				if (!body.query?.trim()) {
					return Response.json(
						{
							error: "query is required",
						},
						{
							status: 400,
						},
					);
				}

				const rag = await getAgentByName(
					env.RegulatoryRAGAgent,
					"regulatory-rag",
				);

				const results = await rag.searchDocuments(body.query, body.topK ?? 5);

				return Response.json({
					query: body.query,
					count: results.length,
					results,
				});
			} catch (error) {
				console.error("[RAG Search] failed", error);

				return Response.json(
					{
						error:
							error instanceof Error ? error.message : "Unknown search error",
					},
					{
						status: 500,
					},
				);
			}
		}

		if (request.method === "GET" && url.pathname === "/api/rag/chunks") {
			const documentId = url.searchParams.get("documentId");

			const limit = Number(url.searchParams.get("limit") ?? "10");

			if (!documentId) {
				return Response.json(
					{
						error: "documentId is required",
					},
					{
						status: 400,
					},
				);
			}

			const rag = await getAgentByName(
				env.RegulatoryRAGAgent,
				"regulatory-rag",
			);

			const chunks = await rag.getChunkPreview(
				documentId,
				Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
			);

			return Response.json({
				documentId,
				count: chunks.length,
				chunks,
			});
		}

		if (
			request.method === "DELETE" &&
			url.pathname.startsWith("/api/rag/documents/")
		) {
			try {
				const documentId = url.pathname
					.replace("/api/rag/documents/", "")
					.trim();

				if (!documentId) {
					return Response.json(
						{
							error: "documentId is required",
						},
						{
							status: 400,
						},
					);
				}

				const rag = await getAgentByName(
					env.RegulatoryRAGAgent,
					"regulatory-rag",
				);

				const result = await rag.deleteDocument(documentId);

				if (result.status === "not_found") {
					return Response.json(result, {
						status: 404,
					});
				}

				return Response.json(result);
			} catch (error) {
				console.error("[RAG Delete] failed", error);

				return Response.json(
					{
						error:
							error instanceof Error ? error.message : "Unknown delete error",
					},
					{
						status: 500,
					},
				);
			}
		}

		if (
			request.method === "POST" &&
			url.pathname === "/api/rag/metadata-preview"
		) {
			try {
				const formData = await request.formData();

				const file = formData.get("file");

				if (!(file instanceof File)) {
					return Response.json(
						{
							error: "file is required",
						},
						{
							status: 400,
						},
					);
				}

				if (file.type !== "application/pdf") {
					return Response.json(
						{
							error: "Only PDF files are currently supported.",
						},
						{
							status: 400,
						},
					);
				}

				const buffer = await file.arrayBuffer();

				const markdownResult = await env.AI.toMarkdown(
					{
						name: file.name,

						blob: new Blob([buffer], {
							type: file.type,
						}),
					},

					{
						conversionOptions: {
							pdf: {
								metadata: false,
							},
						},
					},
				);

				if (markdownResult.format === "error") {
					throw new Error(markdownResult.error);
				}

				const metadata = await extractRegulatoryDocumentMetadata(
					env,
					markdownResult.data,
					file.name,
				);

				return Response.json({
					metadata,
				});
			} catch (error) {
				console.error("[RAG Metadata Preview] failed", error);

				return Response.json(
					{
						error:
							error instanceof Error
								? error.message
								: "Metadata extraction failed",
					},
					{
						status: 500,
					},
				);
			}
		}

		/* RAG Endpoints End */

		/* Workspace Endpoints Start */
		if (
			request.method === "GET" &&
			url.pathname === "/api/workspace/download"
		) {
			const path = url.searchParams.get("path");

			if (!path) {
				return Response.json(
					{
						error: "path is required",
					},
					{
						status: 400,
					},
				);
			}

			const stub = await getAgentByName(env.CraAssistantAgent, "default");

			const result = await stub.readWorkspaceFile(path);

			const fileName =
				path.split("/").filter(Boolean).at(-1) ?? "workspace-file.md";

			return new Response(result.content, {
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"Content-Disposition": `attachment; filename="${fileName}"`,
				},
			});
		}
		/* Workspace Endpoints End */

		/* Email Endpoints Start */

		if (request.method === "POST" && url.pathname === "/api/email/send") {
			try {
				const body = await request.json<{
					to?: string[];
					subject?: string;
					body?: string;
					sourceArtifact?: {
						path?: string;
					};
				}>();

				if (!Array.isArray(body.to) || body.to.length === 0) {
					return Response.json(
						{
							error: "At least one recipient is required.",
						},
						{
							status: 400,
						},
					);
				}

				if (!body.subject?.trim()) {
					return Response.json(
						{
							error: "subject is required",
						},
						{
							status: 400,
						},
					);
				}

				if (!body.body?.trim()) {
					return Response.json(
						{
							error: "body is required",
						},
						{
							status: 400,
						},
					);
				}

				const result = await sendEmail(env, {
					to: body.to,

					subject: body.subject.trim(),

					body: body.body,

					sourceArtifact: body.sourceArtifact?.path
						? {
								path: body.sourceArtifact.path,
							}
						: undefined,

					createdAt: new Date().toISOString(),
				});

				return Response.json({
					status: "sent",
					result,
				});
			} catch (error) {
				console.error("[Email] send failed", error);

				return Response.json(
					{
						error:
							error instanceof Error ? error.message : "Email sending failed",
					},
					{
						status: 500,
					},
				);
			}
		}

		/* Email Endpoints End */

		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, {
				status: 404,
			})
		);
	},
} satisfies ExportedHandler<Env>;
