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
import type { CraAssistantAgentState } from "@/types/agent";
import type { WorkflowRunParams } from "@/types/workflows";
import { activityFromRun, normalizeChatActivity } from "./lib/subagent.ts";
import { AgentMemoryPanel } from "./components/memory/AgentMemoryPanel.tsx";
import type { AgentMemorySnapshot } from "./types/agent-memory.ts";
import { AgentActivityPanel } from "./components/activity/AgentActivityPanel.tsx";
import { UserMemoryPanel } from "./components/memory/UserMemoryPanel.tsx";
import { mapAgentToolActivities } from "./lib/agent-activity.ts";

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
	const agent = useAgent<any, CraAssistantAgentState>({
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

	const workflow = agent.state?.regulatoryWorkflow;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<AppHeader
				isBusy={isBusy}
				isRecovering={isRecovering}
				clearHistory={clearHistory}
				isStreaming={isStreaming}
				handleStop={handleStop}
			/>

			<main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<Tabs defaultValue="chat" className="min-w-0 w-full">
					<TabsList>
						<TabsTrigger value="chat">Chat</TabsTrigger>
						<TabsTrigger value="workflow">Regulatory Workflow</TabsTrigger>
						<TabsTrigger value="memory">Agent Memory</TabsTrigger>
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
						<WorkflowPanel workflow={workflow} onRun={handleWorkflowStart} />
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
				</Tabs>

				<aside className="hidden min-h-0 lg:block space-y-4">
					<AgentOverview />
					<CurrentActivityCard activity={currentActivity} />
					<div className="sticky top-4">
						<AgentActivityPanel
							runningActivities={runningActivities}
							recentActivities={recentActivities}
						/>
					</div>
					{/* <Button
						type="button"
						variant="outline"
						onClick={handleTestMFDSMemory}
					>
						Test MFDS Memory
					</Button> */}
				</aside>
			</main>
		</div>
	);
}
