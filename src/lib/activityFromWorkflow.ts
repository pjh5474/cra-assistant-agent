import type { RegulatoryWorkflowState } from "worker/types/workflow";

export interface WorkflowActivity {
	source: "SYSTEM";
	displayName: string;
	status: "running" | "completed" | "error";
	phase?: string;
	message?: string;
	progress?: number;
	runId?: string;
	updatedAt: string;
}

export function activityFromWorkflow(
	workflow: RegulatoryWorkflowState | undefined,
): WorkflowActivity | undefined {
	if (!workflow) {
		return undefined;
	}

	const { sourceProcessing, synthesis, reporting, email } = workflow.steps;

	if (email.status === "running") {
		return {
			source: "SYSTEM",
			displayName: "Email Delivery",
			status: "running",
			phase: "email",
			message: email.message ?? "Sending regulatory briefing email",
			progress: email.progress,
			runId: workflow.workflowId ?? "workflow",
			updatedAt: new Date().toISOString(),
		};
	}

	if (reporting.status === "running") {
		return {
			source: "SYSTEM",
			displayName: "Regulatory Reporting",
			status: "running",
			phase: "reporting",
			message: reporting.message ?? "Generating regulatory briefing",
			progress: reporting.progress,
			runId: workflow.workflowId ?? "workflow",
			updatedAt: new Date().toISOString(),
		};
	}

	if (synthesis.status === "running") {
		return {
			source: "SYSTEM",
			displayName: "Regulatory Synthesis",
			status: "running",
			phase: "synthesis",
			message: synthesis.message ?? "Synthesizing regulatory findings",
			progress: synthesis.progress,
			runId: workflow.workflowId ?? "workflow",
			updatedAt: new Date().toISOString(),
		};
	}

	if (sourceProcessing.status === "running") {
		return {
			source: "SYSTEM",
			displayName: "Regulatory Sources",
			status: "running",
			phase: "source-processing",
			message: sourceProcessing.message ?? "Processing regulatory sources",
			progress: sourceProcessing.progress,
			runId: workflow.workflowId ?? "workflow",
			updatedAt: new Date().toISOString(),
		};
	}

	if (workflow.stage === "completed") {
		return {
			source: "SYSTEM",
			displayName: "Regulatory Workflow",
			status: "completed",
			phase: "completed",
			message: "Regulatory workflow completed",
			progress: 1,
			runId: workflow.workflowId ?? "workflow",
			updatedAt: new Date().toISOString(),
		};
	}

	return undefined;
}
