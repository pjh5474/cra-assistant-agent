import type { AgentToolRunState } from "agents";
import { Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentRunItem } from "./AgentRunItem";

interface AgentRunTimelineProps {
	runs: AgentToolRunState[];
	variant?: "inline" | "panel";
}

export function AgentRunTimeline({
	runs,
	variant = "panel",
}: AgentRunTimelineProps) {
	if (runs.length === 0) {
		return null;
	}

	if (variant === "inline") {
		return (
			<div className="space-y-2">
				{runs.map((run) => (
					<AgentRunItem key={run.runId} run={run} compact />
				))}
			</div>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<Database className="h-4 w-4" />
					Agent Runs
				</CardTitle>
			</CardHeader>

			<CardContent>
				<div className="space-y-3">
					{runs.map((run) => (
						<AgentRunItem key={run.runId} run={run} />
					))}
				</div>
			</CardContent>
		</Card>
	);
}
