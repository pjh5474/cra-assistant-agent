import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgent, useAgentToolEvents } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
	BookOpen,
	Brain,
	CalendarClock,
	FolderTree,
	MessageSquare,
	Workflow,
} from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { AgentOverview } from "@/components/agents/AgentOverview";
import { CurrentActivityCard } from "@/components/agents/CurrentActivityCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { WorkflowPanel } from "@/components/workflow/WorkflowPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getToolName, isToolUIPart } from "ai";
import type { WorkflowRunParams } from "@/types/workflows";
import { activityFromRun } from "./lib/subagent.ts";
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
import { toast } from "sonner";
import { EMAIL_APPROVAL_STORAGE_KEY, MAIN_TOOL_LABELS } from "./constants.ts";
import type {
	RegulatoryScheduleItem,
	RegulatorySchedulePayload,
} from "shared/types/schedule.ts";
import { SchedulePanel } from "./components/schedule/SchedulePanel.tsx";

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

	const [pendingEmailToolCallId, setPendingEmailToolCallId] = useState<
		string | null
	>(null);

	function getHandledEmailApprovalIds(): Set<string> {
		try {
			const stored = localStorage.getItem(EMAIL_APPROVAL_STORAGE_KEY);

			if (!stored) {
				return new Set();
			}

			return new Set(JSON.parse(stored) as string[]);
		} catch {
			return new Set();
		}
	}

	function markEmailApprovalHandled(id: string) {
		const ids = getHandledEmailApprovalIds();

		ids.add(id);

		localStorage.setItem(
			EMAIL_APPROVAL_STORAGE_KEY,
			JSON.stringify(Array.from(ids).slice(-100)),
		);
	}

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

	useEffect(() => {
		for (const message of messages) {
			for (const part of message.parts ?? []) {
				if (!isToolUIPart(part)) {
					continue;
				}

				if (getToolName(part) !== "prepareEmailDraft") {
					continue;
				}

				if (part.state !== "output-available") {
					continue;
				}

				const handled = getHandledEmailApprovalIds();

				if (handled.has(part.toolCallId)) {
					continue;
				}

				const output = part.output as {
					type?: string;
					draft?: EmailDraft;
				};

				if (output.type !== "email_approval_required" || !output.draft) {
					continue;
				}

				//
				// 여기서는 아직 handled 처리하지 않습니다.
				// 실제 Send/Cancel 때 처리합니다.
				//
				setEmailDraft(output.draft);

				setPendingEmailToolCallId(part.toolCallId);

				setEmailApprovalOpen(true);

				return;
			}
		}
	}, [messages]);

	function handleSend(text: string) {
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
			sendEmail: params.sendEmail,
			emailRecipient: params.emailRecipient,
		});
	};

	const handleStop = () => {
		console.log("[App] stopping current agent turn");
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

	async function handleCreateEmailDraft(path: string, to: string[]) {
		try {
			const draft = await agent.stub.createEmailDraftFromWorkspace(path, to);

			setEmailDraft(draft);

			setEmailApprovalOpen(true);
		} catch (error) {
			console.error("[Email] draft creation failed", error);
			throw error;
		}
	}

	async function handleApprovedEmailSend(draft: EmailDraft) {
		setEmailSending(true);
		try {
			const response = await fetch("/api/email/send", {
				method: "POST",

				headers: {
					"Content-Type": "application/json",
				},

				body: JSON.stringify({
					to: draft.to,
					subject: draft.subject,
					body: draft.body,
					sourceArtifact: draft.sourceArtifact,
				}),
			});

			const result = (await response.json()) as {
				status?: "sent";
				error?: string;
			};

			if (!response.ok) {
				throw new Error(result.error ?? "Email sending failed");
			}

			setEmailApprovalOpen(false);

			setEmailDraft(null);

			if (pendingEmailToolCallId) {
				markEmailApprovalHandled(pendingEmailToolCallId);
			}

			setPendingEmailToolCallId(null);

			setEmailApprovalOpen(false);

			setEmailDraft(null);

			toast.success("Email sent", {
				description: `Sent to ${draft.to.join(", ")}`,
			});
		} catch (error) {
			console.error("[Email] sending failed", error);

			toast.error("Failed to send email", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setEmailSending(false);
		}
	}

	const handleCreateRegulatorySchedule = useCallback(
		async (
			cron: string,
			payload: Omit<RegulatorySchedulePayload, "scheduleKey">,
		) => {
			return agent.stub.createRegulatorySchedule(cron, payload);
		},
		[agent],
	);

	const handleListRegulatorySchedules = useCallback(async (): Promise<
		RegulatoryScheduleItem[]
	> => {
		return agent.stub.listRegulatorySchedules() as Promise<
			RegulatoryScheduleItem[]
		>;
	}, [agent]);

	const handleCancelRegulatorySchedule = useCallback(
		async (scheduleId: string) => {
			return agent.stub.cancelRegulatorySchedule(scheduleId);
		},
		[agent],
	);

	const handleGetRegulatoryScheduleHistory = useCallback(
		async (scheduleId: string, limit = 20) => {
			return agent.stub.getRegulatoryScheduleHistory(scheduleId, limit);
		},
		[agent],
	);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<EmailApprovalDialog
				open={emailApprovalOpen}
				draft={emailDraft}
				sending={emailSending}
				onOpenChange={(open) => {
					if (!open) {
						if (pendingEmailToolCallId) {
							markEmailApprovalHandled(pendingEmailToolCallId);
						}

						setPendingEmailToolCallId(null);

						setEmailDraft(null);
					}

					setEmailApprovalOpen(open);
				}}
				onApprove={handleApprovedEmailSend}
			/>
			<AppHeader isStreaming={isStreaming} handleStop={handleStop} />

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
						<TabsTrigger value="chat">
							<MessageSquare className="mr-2 h-4 w-4" />
							Chat
						</TabsTrigger>
						<TabsTrigger value="workflow">
							<Workflow className="mr-2 h-4 w-4" />
							Workflow
						</TabsTrigger>
						<TabsTrigger value="schedules">
							<CalendarClock className="mr-2 h-4 w-4" />
							Schedules
						</TabsTrigger>
						<TabsTrigger value="memory">
							<Brain className="mr-2 h-4 w-4" />
							Agent Memory
						</TabsTrigger>
						<TabsTrigger value="knowledge">
							<BookOpen className="mr-2 h-4 w-4" />
							Knowledge Base
						</TabsTrigger>
						<TabsTrigger value="workspace">
							<FolderTree className="mr-2 h-4 w-4" />
							Workspace
						</TabsTrigger>
					</TabsList>

					<TabsContent value="chat" className="space-y-6">
						<ChatPanel
							messages={messages}
							input={input}
							onInputChange={setInput}
							onSend={handleSend}
							onStop={handleStop}
							onClearHistory={clearHistory}
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

					<TabsContent value="schedules" className="mt-4">
						<SchedulePanel
							onCreate={handleCreateRegulatorySchedule}
							onList={handleListRegulatorySchedules}
							onCancel={handleCancelRegulatorySchedule}
							onGetHistory={handleGetRegulatoryScheduleHistory}
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
					</aside>
				)}
			</main>
		</div>
	);
}
