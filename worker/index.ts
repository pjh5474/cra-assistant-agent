import { Think, skills } from "@cloudflare/think";
import {
	callable,
	getAgentByName,
	routeAgentRequest,
	type AgentToolProgressSnapshot,
} from "agents";
import type { AgentToolRunInfo } from "agents/agent-tools";
import type { ContextConfig } from "agents/context";
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

export {
	MFDSRegulatoryAgent,
	RegulatoryBriefingWorkflow,
	ICHRegulatoryAgent,
	KoNECTRegulatoryAgent,
	RegulatoryRAGAgent,
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

		For chat interactions, you currently have access to stored regulatory
		memory and curated regulatory document knowledge base.

		You may use regulatory memory to:
		- retrieve previous analyses
		- search stored regulatory knowledge
		- inspect previously detected regulatory changes
		- explain stored CRA impact and relevance assessments

		You do NOT perform live MFDS, ICH, or KoNECT source checks in chat.

		If the user asks for:
		- latest information
		- current implementation status
		- today's regulatory updates
		- currently open courses
		- live official-source verification

		explain that live regulatory collection is handled through the monitoring
		workflow, not through chat.

		Do not present stored regulatory memory as current official-source verification.

		Use:
		- getRegulatoryAnalysis for one known item
		- searchRegulatoryMemory for topic/keyword searches
		- listRecentRegulatoryChanges for changes detected by previous workflow runs

		Do not invent information that is not present in regulatory memory.

		You have access to a curated regulatory document knowledge base through
		searchRegulatoryDocuments.

		Use searchRegulatoryDocuments when the user asks about the content,
		requirements, principles, responsibilities, or interpretation of regulatory
		guidelines such as ICH GCP.

		The regulatory document search is semantic and may return English source
		material for Korean queries.

		Base regulatory answers on the retrieved source text when available.
		Do not claim that a retrieved document says something that is not supported
		by the returned passages.

		When using retrieved regulatory documents, clearly identify the source using
		the document title/version and section heading when available.

		Do not use the regulatory document search to answer questions about recently
		detected regulatory updates. Use regulatory memory for previously observed
		changes instead.
		`.trim();
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
				description:
					"Search the curated regulatory knowledge base, including ICH GCP and other authoritative regulatory documents. Use this for questions about guideline content, requirements, principles, responsibilities, monitoring, informed consent, data governance, and other regulatory topics.",

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

							heading: result.heading,

							chunkIndex: result.chunkIndex,

							score: result.score,

							text: result.text,
						})),
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
	 * Regulatory RAG
	 */
	private async searchRegulatoryDocuments(query: string, topK = 5) {
		const rag = await getAgentByName(
			this.env.RegulatoryRAGAgent,
			"regulatory-rag",
		);

		return rag.searchDocuments(query, topK);
	}
	/* Regulatory RAG End */
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

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

		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, {
				status: 404,
			})
		);
	},
} satisfies ExportedHandler<Env>;
