import { RegulatoryBriefingPanel } from "./RegulatoryBriefingPanel";
import { RegulatoryWorkflowProgress } from "./RegulatoryWorkflowProgress";
import { WorkflowControls } from "./WorkflowControls";
import { WorkflowSourceResults } from "./WorkflowSourceResults";
import type { RegulatoryWorkflowState } from "../../../worker/types/workflow.ts";

interface WorkflowPanelProps {
	workflow?: RegulatoryWorkflowState;
	onRun: () => void;
}

export function WorkflowPanel({ workflow, onRun }: WorkflowPanelProps) {
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
