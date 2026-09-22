import type { RegulatoryWorkflowState } from "worker/types/workflow";

import type { AgentActivity } from "@/types/agent-activity";

export function mapWorkflowActivities(
	workflow: RegulatoryWorkflowState | undefined,
): AgentActivity[] {
	if (!workflow) {
		return [];
	}

	const activities: AgentActivity[] = [];

	const steps = [
		{
			key: "source-processing",
			label: "Regulatory Source Processing",
			step: workflow.steps.sourceProcessing,
		},
		{
			key: "synthesis",
			label: "Regulatory Synthesis",
			step: workflow.steps.synthesis,
		},
		{
			key: "reporting",
			label: "Regulatory Reporting",
			step: workflow.steps.reporting,
		},
		{
			key: "email",
			label: "Workflow Email Delivery",
			step: workflow.steps.email,
		},
	] as const;

	for (const { key, label, step } of steps) {
		if (step.status === "pending") {
			continue;
		}

		const status: AgentActivity["status"] =
			step.status === "running"
				? "running"
				: step.status === "completed" || step.status === "skipped"
					? "completed"
					: "error";

		activities.push({
			id: `workflow:${workflow.workflowId ?? "current"}:${key}`,
			agentType: "RegulatoryBriefingWorkflow",
			displayName: label,
			status,
			inputPreview: step.message,
			tools: [],
			error: step.error,
			order: 0,
		});
	}

	return activities;
}
