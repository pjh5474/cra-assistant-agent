import { CheckCircle2, Circle, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
	RegulatoryWorkflowState,
	WorkflowStepState,
} from "../../../worker/types/workflow.ts";

interface RegulatoryWorkflowProgressProps {
	workflow?: RegulatoryWorkflowState;
}

const STEP_LABELS = {
	collection: "Data Collection",
	analysis: "CRA Analysis",
	enrichment: "RAG Enrichment",
	approval: "Approval",
	reporting: "Briefing Generation",
	email: "Email Delivery",
} as const;

function StepIcon({ step }: { step: WorkflowStepState }) {
	switch (step.status) {
		case "running":
			return <Loader2 className="h-4 w-4 animate-spin" />;

		case "completed":
			return <CheckCircle2 className="h-4 w-4" />;

		case "error":
			return <TriangleAlert className="h-4 w-4" />;

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
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-base">
						Regulatory Briefing Workflow
					</CardTitle>

					<Badge variant="outline">{workflow?.stage}</Badge>
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				<div className="space-y-2">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Overall Progress</span>

						<span>{percent}%</span>
					</div>

					<Progress value={percent} />
				</div>

				<div className="space-y-3">
					{Object.entries(workflow?.steps ?? {}).map(([key, step]) => (
						<div key={key} className="flex gap-3 rounded-md border p-3">
							<div className="mt-0.5">
								<StepIcon step={step} />
							</div>

							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-3">
									<span className="text-sm font-medium">
										{STEP_LABELS[key as keyof typeof STEP_LABELS]}
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

								{typeof step.progress === "number" && (
									<Progress className="mt-2" value={step.progress * 100} />
								)}

								{step.error && (
									<p className="mt-2 text-xs text-destructive">{step.error}</p>
								)}
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
