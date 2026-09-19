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
import { Button } from "./components/ui/button.tsx";
import { AgentMemoryPanel } from "./components/memory/AgentMemoryPanel.tsx";
import type { AgentMemorySnapshot } from "./types/agent-memory.ts";

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

	const handleTestMFDSMemory = async () => {
		try {
			const result = await agent.stub.getRegulatoryMemory();

			console.log("[MFDS Memory Test Result]", result);
		} catch (error) {
			console.error("[MFDS Memory Test Failed]", error);
		}
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
						<AgentMemoryPanel
							memory={memory}
							loading={memoryLoading}
							onRefresh={handleMemoryRefresh}
						/>
					</TabsContent>
				</Tabs>

				<aside className="space-y-4">
					<AgentOverview />
					<CurrentActivityCard activity={currentActivity} />
					<Button
						type="button"
						variant="outline"
						onClick={handleTestMFDSMemory}
					>
						Test MFDS Memory
					</Button>
				</aside>
			</main>
		</div>
	);
}
