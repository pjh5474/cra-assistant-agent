import { RegulatoryBriefingPanel } from "./RegulatoryBriefingPanel";
import { RegulatoryWorkflowProgress } from "./RegulatoryWorkflowProgress";
import { WorkflowControls } from "./WorkflowControls";
import { WorkflowSourceResults } from "./WorkflowSourceResults";
import type { RegulatoryWorkflowState } from "../../../worker/types/workflow.ts";
import type { WorkflowRunParams } from "@/types/workflows";

import { useEffect, useRef } from "react";

import { toast } from "sonner";

interface WorkflowPanelProps {
	workflow?: RegulatoryWorkflowState;
	onRun: (params: WorkflowRunParams) => void | Promise<void>;
	onOpenWorkspace?: () => void;
}

export function WorkflowPanel({
	workflow,
	onRun,
	onOpenWorkspace,
}: WorkflowPanelProps) {
	const lastToastedWorkflowId = useRef<string | null>(null);

	useEffect(() => {
		if (
			workflow?.stage !== "completed" ||
			!workflow.workflowId ||
			lastToastedWorkflowId.current === workflow.workflowId
		) {
			return;
		}

		lastToastedWorkflowId.current = workflow.workflowId;

		toast.success("Regulatory briefing saved", {
			description: workflow.artifact?.path ?? "Report saved to Workspace.",

			action: onOpenWorkspace
				? {
						label: "Open Workspace",

						onClick: onOpenWorkspace,
					}
				: undefined,

			duration: 5000,
		});
	}, [
		workflow?.stage,
		workflow?.workflowId,
		workflow?.artifact?.path,
		onOpenWorkspace,
	]);

	return (
		<div className="space-y-6">
			<WorkflowControls onRun={onRun} />
			<RegulatoryWorkflowProgress workflow={workflow} />
			<WorkflowSourceResults
				sources={workflow?.sources}
				briefingSources={workflow?.briefing?.sources}
			/>

			{workflow?.briefing ? (
				<RegulatoryBriefingPanel briefing={workflow.briefing} />
			) : (
				<div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
					<p className="font-medium text-foreground">Generated Briefing</p>
					<p className="mt-1">
						The generated weekly briefing will appear here after the workflow
						completes.
					</p>
				</div>
			)}
		</div>
	);
}
