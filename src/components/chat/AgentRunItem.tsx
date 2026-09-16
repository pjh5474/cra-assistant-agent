import type { AgentToolRunState } from "agents";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function getStatusVariant(
	status: AgentToolRunState["status"],
): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "completed":
			return "default";
		case "error":
		case "aborted":
		case "interrupted":
			return "destructive";
		case "running":
			return "secondary";
		default:
			return "outline";
	}
}

function getStatusLabel(status: AgentToolRunState["status"]) {
	switch (status) {
		case "running":
			return "Running";
		case "completed":
			return "Completed";
		case "error":
			return "Error";
		case "aborted":
			return "Aborted";
		case "interrupted":
			return "Interrupted";
		default:
			return status;
	}
}

function RunStatusIcon({ status }: { status: AgentToolRunState["status"] }) {
	switch (status) {
		case "running":
			return <Loader2 className="h-4 w-4 shrink-0 animate-spin" />;
		case "completed":
			return <CheckCircle2 className="h-4 w-4 shrink-0" />;
		case "error":
		case "aborted":
		case "interrupted":
			return <CircleAlert className="h-4 w-4 shrink-0" />;
		default:
			return null;
	}
}

interface AgentRunItemProps {
	run: AgentToolRunState;
	compact?: boolean;
}

export function AgentRunItem({ run, compact = false }: AgentRunItemProps) {
	const fraction =
		run.status === "completed" ? 1 : (run.progress?.fraction ?? 0);
	const progress = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);

	return (
		<div
			className={
				compact
					? "rounded-md border bg-background/60 p-3"
					: "rounded-lg border p-3"
			}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<RunStatusIcon status={run.status} />

					<span className="truncate text-sm font-medium">
						{run.agentType || "Subagent"}
					</span>
				</div>

				<Badge variant={getStatusVariant(run.status)} className="shrink-0">
					{getStatusLabel(run.status)}
				</Badge>
			</div>

			{run.progress?.phase && (
				<p className="mt-2 text-xs font-medium">{run.progress.phase}</p>
			)}

			{run.progress?.message && (
				<p className="mt-1 text-xs text-muted-foreground">
					{run.progress.message}
				</p>
			)}

			{(run.status === "running" || progress > 0) && (
				<div className="mt-3 space-y-1">
					<Progress value={progress} />

					<div className="text-right text-[10px] text-muted-foreground">
						{progress}%
					</div>
				</div>
			)}

			{run.milestones && run.milestones.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-1">
					{run.milestones.map((milestone, index) => (
						<Badge
							key={milestone.sequence ?? index}
							variant="outline"
							className="text-[10px]"
						>
							Milestone {index + 1}
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
