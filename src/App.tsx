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
import { isToolUIPart } from "ai";
import { Button } from "./components/ui/button";
import type { CraAssistantAgentState } from "@/types/agent";
import { RegulatoryWorkflowProgress } from "./components/workflow/RegulatoryWorkflowProgress.tsx";
import { RegulatoryBriefingPanel } from "./components/workflow/RegulatoryBriefingPanel.tsx";
import { ScrollArea } from "./components/ui/scroll-area.tsx";
import { activityFromRun } from "./lib/subagent.ts";

export default function App() {
	const agent = useAgent<any, CraAssistantAgentState>({
		agent: "CraAssistantAgent",
		name: "default",
	});

	const [input, setInput] = useState("");

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

	const mfdsActivity =
		activityFromRun(latestMFDSRun) ?? agent.state?.subagents?.mfds;

	const ichActivity =
		activityFromRun(latestICHRun) ?? agent.state?.subagents?.ich;

	const konectActivity =
		activityFromRun(latestKONECTRun) ?? agent.state?.subagents?.konect;

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
		sendMessage({
			text,
		});

		setInput("");
	}

	const handleWorkflowStart = async () => {
		await agent.stub.startRegulatoryBriefingWorkflow({
			since: "2026-09-16T00:00:00+09:00",
			until: "2026-09-17T00:00:00+09:00",
			sources: ["MFDS", "ICH"],
			purpose: "weekly-briefing",
		});
	};

	const handleTestICHImplementation = async () => {
		const result = await agent.stub.testICHImplementation();

		console.log(result);
		const efficacyResult = await agent.stub.testICHEfficacyPage();

		console.log(efficacyResult);
	};

	const handleTestKoNECTCollector = async () => {
		const result = await agent.stub.testKoNECTCollector();

		console.log(result);
	};

	const workflow = agent.state?.regulatoryWorkflow;
	const briefing = workflow?.briefing;
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
								state={ichActivity}
							/>

							<SubagentSummary
								name="KoNECT"
								description="Clinical trial ecosystem updates"
								state={konectActivity}
							/>
						</div>
					</section>

					{workflow?.stage === "completed" && briefing && (
						<RegulatoryBriefingPanel briefing={briefing} />
					)}

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

					<CurrentActivityCard activity={currentActivity} />

					<ScrollArea className="h-screen">
						<div className="space-y-4 p-4">
							<Button onClick={handleWorkflowStart} className="w-full">
								Start Workflow
							</Button>

							<Button onClick={handleTestICHImplementation} className="w-full">
								Test ICH Implementation
							</Button>

							<Button onClick={handleTestKoNECTCollector} className="w-full">
								Test KoNECT Collector
							</Button>

							<RegulatoryWorkflowProgress workflow={workflow} />

							<AgentRunTimeline runs={allRuns} variant="panel" />
						</div>
					</ScrollArea>

					{/* <Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Workspace</CardTitle>
						</CardHeader>

						<CardContent className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Files</span>

								<span className="font-medium">
									{agent.state?.files?.length ?? 0}
								</span>
							</div>
						</CardContent>
					</Card> */}
				</aside>
			</main>
		</div>
	);
}
