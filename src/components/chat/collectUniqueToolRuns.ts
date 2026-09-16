import type { AgentToolRunState } from "agents";
import { isToolUIPart, type UIMessage } from "ai";

export function collectUniqueToolRuns(
	message: UIMessage,
	getRunsForToolCall: (toolCallId: string) => AgentToolRunState[],
): AgentToolRunState[] {
	const runs: AgentToolRunState[] = [];

	for (const part of message.parts) {
		if (isToolUIPart(part)) {
			runs.push(...getRunsForToolCall(part.toolCallId));
		}
	}

	return Array.from(new Map(runs.map((run) => [run.runId, run])).values());
}
