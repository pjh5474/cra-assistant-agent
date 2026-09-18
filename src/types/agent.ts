import type { RegulatoryWorkflowState } from "../../worker/types/workflow.ts";

export type SubagentStatus = "idle" | "running" | "completed" | "error";

export interface SubagentActivity {
	status: SubagentStatus;
	phase?: string;
	message?: string;
	progress?: number;
	runId?: string;
	updatedAt: string;
}

export interface WorkspaceFile {
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;
}

export interface CraAssistantAgentState {
	files: WorkspaceFile[];
	subagents: {
		mfds?: SubagentActivity;
		ich?: SubagentActivity;
		konect?: SubagentActivity;
	};
	regulatoryWorkflow: RegulatoryWorkflowState;
}
