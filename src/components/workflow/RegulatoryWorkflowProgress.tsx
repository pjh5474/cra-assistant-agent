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
			return (
				<div className="relative flex h-5 w-5 items-center justify-center">
					<span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />

					<Loader2 className="relative h-4 w-4 animate-spin text-primary" />
				</div>
			);

		case "completed":
			return (
				<CheckCircle2 className="h-4 w-4 text-emerald-500 transition-all duration-300" />
			);

		case "failed":
		case "error":
			return (
				<XCircle className="h-4 w-4 text-destructive transition-all duration-300" />
			);

		case "skipped":
			return (
				<MinusCircle className="h-4 w-4 text-muted-foreground transition-all duration-300" />
			);

		default:
			return (
				<Circle className="h-4 w-4 text-muted-foreground transition-all duration-300" />
			);
	}
}

function stepContainerClass(status: WorkflowStepState["status"]) {
	switch (status) {
		case "running":
			return [
				"border-primary/40",
				"bg-primary/[0.04]",
				"shadow-sm",
				"ring-1",
				"ring-primary/10",
			].join(" ");

		case "completed":
			return ["border-emerald-500/20", "bg-emerald-500/[0.025]"].join(" ");

		case "failed":
		case "error":
			return ["border-destructive/30", "bg-destructive/[0.035]"].join(" ");

		default:
			return "";
	}
}

function stepBadgeVariant(status: WorkflowStepState["status"]) {
	switch (status) {
		case "running":
			return "default" as const;

		case "failed":
		case "error":
			return "destructive" as const;

		default:
			return "secondary" as const;
	}
}

export function RegulatoryWorkflowProgress({
	workflow,
}: RegulatoryWorkflowProgressProps) {
	const percent = Math.round((workflow?.progress ?? 0) * 100);

	const isRunning = Object.values(workflow?.steps ?? {}).some(
		(step) => step?.status === "running",
	);

	return (
		<Card className="transition-shadow duration-300">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-base">Workflow Status</CardTitle>

					{isRunning && (
						<div className="flex items-center gap-1.5 text-xs text-primary">
							<span className="relative flex size-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
								<span className="relative inline-flex size-2 rounded-full bg-primary" />
							</span>
							Running
						</div>
					)}
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs text-muted-foreground">Current Stage</span>

					<Badge variant="outline" className="transition-all duration-300">
						{WORKFLOW_STAGE_LABELS[workflow?.stage ?? "idle"] ??
							workflow?.stage ??
							"Idle"}
					</Badge>
				</div>

				<div className="space-y-2">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Overall Progress</span>

						<span className="tabular-nums transition-all duration-300">
							{percent}%
						</span>
					</div>

					<div className="overflow-hidden rounded-full">
						<Progress
							value={percent}
							className="transition-all duration-500 ease-out"
						/>
					</div>
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
								<div
									key={key}
									className={[
										"flex gap-3 rounded-md border p-3",
										"transition-all duration-300 ease-out",
										stepContainerClass(step.status),
									]
										.filter(Boolean)
										.join(" ")}
								>
									<div className="mt-0.5">
										<StepIcon step={step} />
									</div>

									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-3">
											<span className="text-sm font-medium">
												{WORKFLOW_STEP_LABELS[key]}
											</span>

											<Badge
												variant={stepBadgeVariant(step.status)}
												className="text-[10px] transition-all duration-300"
											>
												{step.status}
											</Badge>
										</div>

										{step.message && (
											<p className="mt-1 text-xs text-muted-foreground transition-opacity duration-300">
												{step.message}
											</p>
										)}

										{step.recipient && (
											<p className="mt-1 text-xs text-muted-foreground">
												Recipient: {step.recipient}
											</p>
										)}

										{typeof step.progress === "number" && (
											<div className="mt-2 overflow-hidden rounded-full">
												<Progress
													value={step.progress * 100}
													className="transition-all duration-500 ease-out"
												/>
											</div>
										)}

										{step.error && (
											<p className="mt-2 text-xs text-destructive transition-opacity duration-300">
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
