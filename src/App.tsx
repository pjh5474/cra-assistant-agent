import { useMemo, useState } from "react";
import { useAgent, useAgentToolEvents } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Activity } from "lucide-react";
import { AgentRunTimeline } from "@/components/chat/AgentRunTimeline";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { AgentOverview } from "@/components/agents/AgentOverview";
import { CurrentActivityCard } from "@/components/agents/CurrentActivityCard";
import { SubagentSummary } from "@/components/agents/SubagentSummary";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
	CraAssistantAgentState,
	SubagentActivity,
	SubagentStatus,
} from "@/types/agent";
import { isToolUIPart } from "ai";
import type { AgentToolRunState } from "agents";

export default function App() {
	const [input, setInput] = useState("");

	const agent = useAgent<any, CraAssistantAgentState>({
		agent: "CraAssistantAgent",
		name: "default",
	});

	const {
		messages,
		sendMessage,
		status,
		isStreaming,
		isRecovering,
		clearHistory,
	} = useAgentChat({
		agent,
	});

	const agentTools = useAgentToolEvents({
		agent,
	});

	const state = agent.state ?? {
		files: [],
		subagents: {},
	};

	const isBusy = isStreaming || isRecovering || status === "submitted";

	const allRuns = useMemo(
		() => agentTools.unboundRuns ?? [],
		[agentTools.unboundRuns],
	);

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

	function activityFromRun(
		run: AgentToolRunState | undefined,
	): SubagentActivity | undefined {
		if (!run) {
			return undefined;
		}

		let status: SubagentStatus;

		switch (run.status) {
			case "running":
				status = "running";
				break;

			case "completed":
				status = "completed";
				break;

			case "error":
			case "aborted":
			case "interrupted":
				status = "error";
				break;

			default:
				status = "idle";
		}

		return {
			status,

			phase: run.progress?.phase,

			message: run.progress?.message,

			progress: run.status === "completed" ? 1 : run.progress?.fraction,

			runId: run.runId,

			updatedAt: new Date().toISOString(),
		};
	}

	const mfdsActivity = activityFromRun(latestMFDSRun) ?? state.subagents?.mfds;

	function handleSend(text: string) {
		sendMessage({
			text,
		});

		setInput("");
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			<AppHeader
				isBusy={isBusy}
				isRecovering={isRecovering}
				clearHistory={clearHistory}
			/>

			<main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0 space-y-6">
					<section>
						<div className="mb-3 flex items-center gap-2">
							<Activity className="h-4 w-4" />

							<h2 className="text-sm font-medium">Regulatory Agents</h2>
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
								state={state.subagents?.ich}
							/>

							<SubagentSummary
								name="KoNECT"
								description="Clinical trial ecosystem updates"
								state={state.subagents?.konect}
							/>
						</div>
					</section>

					<ChatPanel
						messages={messages}
						input={input}
						onInputChange={setInput}
						onSend={handleSend}
						isBusy={isBusy}
						isRecovering={isRecovering}
						getRunsForToolCall={agentTools.getRunsForToolCall}
					/>
				</div>

				<aside className="space-y-4">
					<AgentOverview />

					<CurrentActivityCard activity={state.subagents?.mfds} />

					{allRuns.length > 0 && (
						<AgentRunTimeline runs={allRuns} variant="panel" />
					)}

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Workspace</CardTitle>
						</CardHeader>

						<CardContent className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Files</span>

								<span className="font-medium">{state.files?.length ?? 0}</span>
							</div>
						</CardContent>
					</Card>
				</aside>
			</main>
		</div>
	);
}
