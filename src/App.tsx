import { useMemo, useState } from "react";
import { useAgent, useAgentToolEvents } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Activity } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { AgentOverview } from "@/components/agents/AgentOverview";
import { CurrentActivityCard } from "@/components/agents/CurrentActivityCard";
import { SubagentSummary } from "@/components/agents/SubagentSummary";
import { AppHeader } from "@/components/layout/AppHeader";
import { WorkflowPanel } from "@/components/workflow/WorkflowPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isToolUIPart } from "ai";
import type { WorkflowRunParams } from "@/types/workflows";
import { activityFromRun, normalizeChatActivity } from "./lib/subagent.ts";
import { AgentMemoryPanel } from "./components/memory/AgentMemoryPanel.tsx";
import type { AgentMemorySnapshot } from "./types/agent-memory.ts";
import { AgentActivityPanel } from "./components/activity/AgentActivityPanel.tsx";
import { UserMemoryPanel } from "./components/memory/UserMemoryPanel.tsx";
import { mapAgentToolActivities } from "./lib/agent-activity.ts";
import type { RegulatoryDocumentSummary } from "./types/regulatory-rag.ts";
import { KnowledgeBasePanel } from "./components/knowledge/KnowledgeBasePanel.tsx";
import { WorkspacePanel } from "./components/workspace/WorkspacePanel.tsx";
import type { AppTab } from "./types/app-tab.ts";
import type {
	CraAssistantAgent,
	CraAssistantAgentState,
} from "../worker/index.ts";
import type { EmailDraft } from "shared/types/email.ts";
import { EmailApprovalDialog } from "./components/email/EmailApprovalDialog.tsx";
import { Button } from "@base-ui/react/button";

const MAIN_TOOL_LABELS: Record<string, string> = {
	searchRegulatoryDocuments: "Regulatory RAG Search",
	searchRegulatoryMemory: "Regulatory Memory Search",
	listRecentRegulatoryChanges: "Recent Regulatory Changes",
	getRegulatoryAnalysis: "Regulatory Analysis Lookup",
};

function stringifyActivityPreview(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	try {
		const text = typeof value === "string" ? value : JSON.stringify(value);
		return text.length > 180 ? `${text.slice(0, 177)}...` : text;
	} catch {
		return String(value);
	}
}

export default function App() {
	const agent = useAgent<CraAssistantAgent, CraAssistantAgentState>({
		agent: "CraAssistantAgent",
		name: "default",
	});

	const [input, setInput] = useState("");
	const [wasStopped, setWasStopped] = useState(false);

	const [memory, setMemory] = useState<AgentMemorySnapshot | undefined>(
		undefined,
	);

	const [memoryLoading, setMemoryLoading] = useState(false);

	const [userMemory, setUserMemory] = useState("");
	const [userMemoryLoading, setUserMemoryLoading] = useState(false);
	const [userMemorySaving, setUserMemorySaving] = useState(false);

	const [regulatoryDocuments, setRegulatoryDocuments] = useState<
		RegulatoryDocumentSummary[]
	>([]);

	const [regulatoryDocumentsLoading, setRegulatoryDocumentsLoading] =
		useState(false);

	const [activeTab, setActiveTab] = useState<AppTab>("chat");

	const showAside = activeTab === "chat" || activeTab === "workflow";

	const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

	const [emailApprovalOpen, setEmailApprovalOpen] = useState(false);

	const [emailSending, setEmailSending] = useState(false);

	const {
		messages,
		sendMessage,
		status,
		stop,
		isStreaming,
		isRecovering,
		clearHistory,
	} = useAgentChat({
		agent,
		cancelOnClientAbort: true,
	});

	const agentTools = useAgentToolEvents({
		agent,
	});

	const { runningActivities, recentActivities } = useMemo(() => {
		const subAgentActivities = mapAgentToolActivities(agentTools);
		const mainToolActivities: ReturnType<typeof mapAgentToolActivities> = [];

		let order = 1_000_000;

		for (const message of messages) {
			for (const part of message.parts) {
				if (!isToolUIPart(part)) {
					continue;
				}

				const toolName = part.type.replace(/^tool-/, "");
				const displayName = MAIN_TOOL_LABELS[toolName];

				// Only surface CraAssistantAgent tools that are useful for
				// RAG / regulatory-memory observability. Sub-agent tool calls
				// continue to come from useAgentToolEvents().
				if (!displayName) {
					continue;
				}

				const toolState = part.state;

				const activityStatus =
					toolState === "output-available"
						? "completed"
						: toolState === "output-error" || toolState === "output-denied"
							? "error"
							: "running";

				const input =
					"input" in part ? (part as { input?: unknown }).input : undefined;

				const errorText =
					"errorText" in part &&
					typeof (part as { errorText?: unknown }).errorText === "string"
						? (part as { errorText: string }).errorText
						: undefined;

				mainToolActivities.push({
					id: `main-tool:${part.toolCallId}`,
					agentType: "CraAssistantAgent",
					displayName,
					status: activityStatus,
					inputPreview: stringifyActivityPreview(input),
					tools: [],
					error: errorText,
					order: order++,
				});
			}
		}

		const activities = [...subAgentActivities, ...mainToolActivities];

		const deduped = Array.from(
			new Map(activities.map((activity) => [activity.id, activity])).values(),
		);

		return {
			runningActivities: deduped
				.filter((activity) => activity.status === "running")
				.sort((a, b) => b.order - a.order),

			recentActivities: deduped
				.filter((activity) => activity.status !== "running")
				.sort((a, b) => b.order - a.order)
				.slice(0, 8),
		};
	}, [agentTools, messages]);

	const isBusy = isStreaming || isRecovering || status === "submitted";

	const boundRuns = useMemo(() => {
		const runs = [];

		for (const message of messages) {
			for (const part of message.parts) {
				if (!isToolUIPart(part)) {
					continue;
				}

				runs.push(...agentTools.getRunsForToolCall(part.toolCallId));
			}
		}

		return Array.from(new Map(runs.map((run) => [run.runId, run])).values());
	}, [messages, agentTools]);

	const allAgentRuns = useMemo(() => {
		const runs = [...boundRuns, ...(agentTools.unboundRuns ?? [])];

		return Array.from(new Map(runs.map((run) => [run.runId, run])).values());
	}, [boundRuns, agentTools.unboundRuns]);

	const latestMFDSRun = useMemo(() => {
		return [...allAgentRuns]
			.reverse()
			.find((run) => run.agentType === "MFDSRegulatoryAgent");
	}, [allAgentRuns]);

	const latestICHRun = useMemo(() => {
		return [...allAgentRuns]
			.reverse()
			.find((run) => run.agentType === "ICHRegulatoryAgent");
	}, [allAgentRuns]);

	const latestKONECTRun = useMemo(() => {
		return [...allAgentRuns]
			.reverse()
			.find((run) => run.agentType === "KONECTRegulatoryAgent");
	}, [allAgentRuns]);

	const mfdsActivity = normalizeChatActivity(
		activityFromRun(latestMFDSRun) ?? agent.state?.subagents?.mfds,
		isBusy,
		wasStopped,
	);

	const ichActivity = normalizeChatActivity(
		activityFromRun(latestICHRun) ?? agent.state?.subagents?.ich,
		isBusy,
		wasStopped,
	);

	const konectActivity = normalizeChatActivity(
		activityFromRun(latestKONECTRun) ?? agent.state?.subagents?.konect,
		isBusy,
		wasStopped,
	);

	const latestRegulatoryRun = useMemo(() => {
		return [...allAgentRuns]
			.reverse()
			.find((run) =>
				[
					"MFDSRegulatoryAgent",
					"ICHRegulatoryAgent",
					"KONECTRegulatoryAgent",
				].includes(run.agentType),
			);
	}, [allAgentRuns]);

	const currentActivity = activityFromRun(latestRegulatoryRun);

	function handleSend(text: string) {
		setWasStopped(false);

		sendMessage({
			text,
		});

		setInput("");
	}

	const handleWorkflowStart = async (params: WorkflowRunParams) => {
		await agent.stub.startRegulatoryBriefingWorkflow({
			since: params.since,
			until: params.until,
			sources: params.sources,
			purpose: "weekly-briefing",
			includeRag: params.includeRag,
			requireApproval: params.requireApproval,
			sendEmail: params.sendEmail,
		});
	};

	const handleStop = () => {
		console.log("[App] stopping current agent turn");

		setWasStopped(true);
		stop();
	};

	const handleMemoryRefresh = async () => {
		if (memoryLoading) {
			return;
		}

		setMemoryLoading(true);

		try {
			const snapshot = await agent.stub.getRegulatoryMemory();

			setMemory(snapshot);

			console.log("[App] regulatory memory loaded", {
				sources: snapshot.sources.length,

				items: snapshot.items.length,
			});
		} catch (error) {
			console.error("[App] failed to load regulatory memory", error);
		} finally {
			setMemoryLoading(false);
		}
	};

	const handleUserMemoryRefresh = async () => {
		if (userMemoryLoading) {
			return;
		}

		setUserMemoryLoading(true);

		try {
			const result = await agent.stub.getUserMemory();
			setUserMemory(result.content ?? "");
		} catch (error) {
			console.error("[App] failed to load user memory", error);
		} finally {
			setUserMemoryLoading(false);
		}
	};

	const handleUserMemorySave = async (content: string) => {
		if (userMemorySaving) {
			return;
		}

		setUserMemorySaving(true);

		try {
			const result = await agent.stub.updateUserMemory(content);

			if (result.success) {
				setUserMemory(content);
			}
		} catch (error) {
			console.error("[App] failed to update user memory", error);
			throw error;
		} finally {
			setUserMemorySaving(false);
		}
	};

	const handleUserMemoryClear = async () => {
		if (userMemorySaving) {
			return;
		}

		setUserMemorySaving(true);

		try {
			const result = await agent.stub.clearUserMemory();

			if (result.success) {
				setUserMemory("");
			}
		} catch (error) {
			console.error("[App] failed to clear user memory", error);
			throw error;
		} finally {
			setUserMemorySaving(false);
		}
	};

	const handleRegulatoryDocumentsRefresh = async () => {
		if (regulatoryDocumentsLoading) {
			return;
		}

		setRegulatoryDocumentsLoading(true);

		try {
			const result = await agent.stub.getRegulatoryDocuments();

			setRegulatoryDocuments(result.documents);

			console.log("[App] regulatory documents loaded", {
				count: result.documents.length,
			});
		} catch (error) {
			console.error("[App] failed to load regulatory documents", error);
		} finally {
			setRegulatoryDocumentsLoading(false);
		}
	};

	const workflow = agent.state?.regulatoryWorkflow;

	const handleWorkspaceRefresh = async () => {
		await agent.stub.refreshFiles();
	};

	const testEmailApproval = async () => {
		setEmailDraft({
			to: ["test@example.com"],

			subject: "Regulatory Briefing - 2026-09-20",

			body: `안녕하세요.
	
	2026-09-20 Regulatory Briefing을 전달드립니다.
	
	감사합니다.`,

			sourceArtifact: {
				path: "/reports/regulatory/2026-09-20-regulatory-briefing.md",
			},

			createdAt: new Date().toISOString(),
		});

		setEmailApprovalOpen(true);
	};

	async function handleCreateEmailDraft(path: string) {
		try {
			const draft = await agent.stub.createEmailDraftFromWorkspace(path);

			setEmailDraft(draft);

			setEmailApprovalOpen(true);
		} catch (error) {
			console.error("[Email] draft creation failed", error);
			throw error;
		}
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			<EmailApprovalDialog
				open={emailApprovalOpen}
				draft={emailDraft}
				sending={emailSending}
				onOpenChange={setEmailApprovalOpen}
				onApprove={async (approvedDraft) => {
					console.log("[Email] approved", approvedDraft);

					// 실제 Cloudflare Email 전송은 다음 단계에서 연결
				}}
			/>
			<AppHeader
				isBusy={isBusy}
				isRecovering={isRecovering}
				clearHistory={clearHistory}
				isStreaming={isStreaming}
				handleStop={handleStop}
			/>

			<main
				className={`mx-auto grid max-w-7xl gap-6 px-6 py-6 ${
					showAside ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"
				}`}
			>
				<Tabs
					className="min-w-0 w-full"
					value={activeTab}
					onValueChange={setActiveTab}
				>
					<TabsList>
						<TabsTrigger value="chat">Chat</TabsTrigger>
						<TabsTrigger value="workflow">Regulatory Workflow</TabsTrigger>
						<TabsTrigger value="memory">Agent Memory</TabsTrigger>
						<TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
						<TabsTrigger value="workspace">Workspace</TabsTrigger>
					</TabsList>

					<TabsContent value="chat" className="space-y-6">
						<section>
							<div className="mb-3 flex items-center gap-2">
								<Activity className="h-4 w-4" />
								<h2 className="text-sm font-medium">
									Current Regulatory Agent Activity
								</h2>
							</div>

							<div className="grid gap-3 md:grid-cols-3">
								<SubagentSummary
									name="MFDS"
									description="MFDS regulatory notices and guidance"
									state={mfdsActivity}
								/>

								<SubagentSummary
									name="ICH"
									description="ICH guideline monitoring"
									state={ichActivity}
								/>

								<SubagentSummary
									name="KoNECT"
									description="Clinical trial ecosystem updates"
									state={konectActivity}
								/>
							</div>
						</section>

						<ChatPanel
							messages={messages}
							input={input}
							onInputChange={setInput}
							onSend={handleSend}
							onStop={handleStop}
							isBusy={isBusy}
							isRecovering={isRecovering}
							getRunsForToolCall={agentTools.getRunsForToolCall}
						/>
					</TabsContent>

					<TabsContent value="workflow" keepMounted>
						<WorkflowPanel
							workflow={workflow}
							onRun={handleWorkflowStart}
							onOpenWorkspace={() => setActiveTab("workspace")}
						/>
					</TabsContent>

					<TabsContent value="memory" keepMounted>
						<div className="space-y-6">
							<UserMemoryPanel
								memory={userMemory}
								loading={userMemoryLoading}
								saving={userMemorySaving}
								onRefresh={handleUserMemoryRefresh}
								onSave={handleUserMemorySave}
								onClear={handleUserMemoryClear}
							/>

							<AgentMemoryPanel
								memory={memory}
								loading={memoryLoading}
								onRefresh={handleMemoryRefresh}
							/>
						</div>
					</TabsContent>

					<TabsContent value="knowledge" keepMounted>
						<KnowledgeBasePanel
							documents={regulatoryDocuments}
							loading={regulatoryDocumentsLoading}
							onRefresh={handleRegulatoryDocumentsRefresh}
							onUploaded={handleRegulatoryDocumentsRefresh}
							onDeleted={handleRegulatoryDocumentsRefresh}
						/>
					</TabsContent>
					<TabsContent value="workspace">
						<WorkspacePanel
							agent={agent}
							files={agent.state?.files ?? []}
							onRefresh={handleWorkspaceRefresh}
							onCreateEmailDraft={handleCreateEmailDraft}
						/>
					</TabsContent>
				</Tabs>

				{showAside && (
					<aside className="hidden min-h-0 lg:block space-y-4">
						<AgentOverview />
						<CurrentActivityCard activity={currentActivity} />
						<div className="sticky top-4">
							<AgentActivityPanel
								runningActivities={runningActivities}
								recentActivities={recentActivities}
							/>
						</div>
						<Button onClick={testEmailApproval}>Test Email Approval</Button>
					</aside>
				)}
			</main>
		</div>
	);
}
