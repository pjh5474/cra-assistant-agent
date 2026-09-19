export type AgentActivityStatus = "running" | "completed" | "error" | "aborted";

export interface AgentToolActivity {
	id: string;

	toolCallId?: string;
	name: string;

	status: "running" | "completed" | "error";

	input?: unknown;

	error?: string;
}

export interface AgentActivity {
	id: string;

	agentType: string;
	displayName: string;

	status: AgentActivityStatus;

	inputPreview?: string;

	tools: AgentToolActivity[];

	error?: string;

	order: number;
}
