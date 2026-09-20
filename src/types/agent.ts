export type SubagentStatus = "idle" | "running" | "completed" | "error";

export type RegulatoryAgentSource = "MFDS" | "ICH" | "KONECT" | "UNKNOWN";

export interface WorkspaceFile {
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;
}
