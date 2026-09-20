import {
	CheckCircle2,
	Circle,
	Loader2,
	MinusCircle,
	XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
	RegulatoryWorkflowState,
	WorkflowStepState,
} from "../../../worker/types/workflow.ts";
import { WORKFLOW_STAGE_LABELS, WORKFLOW_STEP_LABELS } from "@/constants.ts";

interface RegulatoryWorkflowProgressProps {
	workflow?: RegulatoryWorkflowState;
}

function StepIcon({ step }: { step: WorkflowStepState }) {
	switch (step.status) {
		case "running":
			return <Loader2 className="h-4 w-4 animate-spin" />;

		case "completed":
			return <CheckCircle2 className="h-4 w-4" />;

		case "failed":
		case "error":
			return <XCircle className="h-4 w-4" />;

		case "skipped":
			return <MinusCircle className="h-4 w-4 text-muted-foreground" />;

		default:
			return <Circle className="h-4 w-4 text-muted-foreground" />;
	}
}

export function RegulatoryWorkflowProgress({
	workflow,
}: RegulatoryWorkflowProgressProps) {
	const percent = Math.round((workflow?.progress ?? 0) * 100);

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Workflow Status</CardTitle>
			</CardHeader>

			<CardContent className="space-y-5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs text-muted-foreground">Current Stage</span>
					<Badge variant="outline">
						{WORKFLOW_STAGE_LABELS[workflow?.stage ?? "idle"] ??
							workflow?.stage ??
							"Idle"}
					</Badge>
				</div>

				<div className="space-y-2">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Overall Progress</span>

						<span>{percent}%</span>
					</div>

					<Progress value={percent} />
				</div>

				<div className="space-y-2">
					<span className="text-xs text-muted-foreground">Timeline</span>

					<div className="space-y-3">
						{(
							Object.keys(WORKFLOW_STEP_LABELS) as Array<
								keyof typeof WORKFLOW_STEP_LABELS
							>
						).map((key) => {
							const step: WorkflowStepState = workflow?.steps?.[key] ?? {
								status: "pending",
							};

							return (
								<div key={key} className="flex gap-3 rounded-md border p-3">
									<div className="mt-0.5">
										<StepIcon step={step} />
									</div>

									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-3">
											<span className="text-sm font-medium">
												{WORKFLOW_STEP_LABELS[key]}
											</span>

											<Badge variant="secondary" className="text-[10px]">
												{step.status}
											</Badge>
										</div>

										{step.message && (
											<p className="mt-1 text-xs text-muted-foreground">
												{step.message}
											</p>
										)}

										{step.recipient && (
											<p className="mt-1 text-xs text-muted-foreground">
												Recipient: {step.recipient}
											</p>
										)}

										{typeof step.progress === "number" && (
											<Progress className="mt-2" value={step.progress * 100} />
										)}

										{step.error && (
											<p className="mt-2 text-xs text-destructive">
												{step.error}
											</p>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
