import type { AgentActivity, AgentToolActivity } from "@/types/agent-activity";

type UnknownRecord = Record<string, any>;

function mapToolStatus(state?: string): AgentToolActivity["status"] {
	switch (state) {
		case "output-available":
			return "completed";

		case "output-error":
			return "error";

		default:
			return "running";
	}
}

function extractTools(parts: UnknownRecord[] = []): AgentToolActivity[] {
	return parts
		.filter(
			(part) => typeof part?.type === "string" && part.type.startsWith("tool-"),
		)
		.map((part, index) => ({
			id: part.toolCallId ?? `${part.toolName}-${index}`,

			toolCallId: part.toolCallId,

			name: part.toolName ?? part.type.replace(/^tool-/, ""),

			status: mapToolStatus(part.state),

			input: part.input,

			error: part.errorText,
		}));
}

export function mapAgentToolActivities(agentTools: any): AgentActivity[] {
	const runs = Object.values(agentTools?.runsById ?? {}) as UnknownRecord[];

	return runs
		.map(
			(run): AgentActivity => ({
				id: run.runId,

				agentType: run.agentType ?? "UnknownAgent",

				displayName: run.display?.name ?? run.agentType ?? "Agent",

				status:
					run.status === "completed"
						? "completed"
						: run.status === "aborted"
							? "aborted"
							: run.status === "error"
								? "error"
								: "running",

				inputPreview: run.inputPreview,

				tools: extractTools(run.parts),

				error: run.error,

				order: run.order ?? 0,
			}),
		)
		.sort((a, b) => {
			const aRunning = a.status === "running" ? 1 : 0;

			const bRunning = b.status === "running" ? 1 : 0;

			if (aRunning !== bRunning) {
				return bRunning - aRunning;
			}

			return b.order - a.order;
		});
}
