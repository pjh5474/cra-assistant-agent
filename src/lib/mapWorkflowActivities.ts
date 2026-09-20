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
			order: 2_000_000,
		},
		{
			key: "synthesis",
			label: "Regulatory Synthesis",
			step: workflow.steps.synthesis,
			order: 2_000_001,
		},
		{
			key: "reporting",
			label: "Regulatory Reporting",
			step: workflow.steps.reporting,
			order: 2_000_002,
		},
		{
			key: "email",
			label: "Workflow Email Delivery",
			step: workflow.steps.email,
			order: 2_000_003,
		},
	] as const;

	for (const { key, label, step, order } of steps) {
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
			order,
		});
	}

	return activities;
}
