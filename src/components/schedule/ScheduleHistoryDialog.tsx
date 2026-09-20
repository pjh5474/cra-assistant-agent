import { Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ScheduledRunHistoryItem } from "../../../shared/types/schedule";

interface ScheduleHistoryDialogProps {
	open: boolean;
	loading: boolean;
	history: ScheduledRunHistoryItem[];
	onOpenChange: (open: boolean) => void;
}

export function ScheduleHistoryDialog({
	open,
	loading,
	history,
	onOpenChange,
}: ScheduleHistoryDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] w-[95vw] max-w-4xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Schedule History</DialogTitle>

					<DialogDescription>
						Recent regulatory briefing runs for this schedule.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading history...
					</div>
				) : history.length === 0 ? (
					<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
						No run history found.
					</div>
				) : (
					<div className="space-y-3">
						{history.map((run) => (
							<div key={run.id} className="rounded-lg border p-4">
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-2">
										<div>
											<p className="text-sm font-medium">
												{run.status === "completed"
													? "Completed"
													: run.status === "failed"
														? "Failed"
														: run.status === "running"
															? "Running"
															: run.status}
											</p>

											{run.scheduledFor && (
												<p className="text-xs text-muted-foreground">
													Scheduled for: {run.scheduledFor}
												</p>
											)}
										</div>

										<p className="text-xs text-muted-foreground">
											Started:{" "}
											{new Intl.DateTimeFormat("ko-KR", {
												timeZone: "Asia/Seoul",
												year: "numeric",
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
												second: "2-digit",
											}).format(new Date(run.startedAt))}
										</p>

										{run.completedAt && (
											<p className="text-xs text-muted-foreground">
												Completed:{" "}
												{new Intl.DateTimeFormat("ko-KR", {
													timeZone: "Asia/Seoul",
													year: "numeric",
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
													second: "2-digit",
												}).format(new Date(run.completedAt))}
											</p>
										)}

										{run.workflowId && (
											<p className="break-all text-xs text-muted-foreground">
												Workflow: {run.workflowId}
											</p>
										)}

										{run.artifactPath && (
											<p className="break-all text-xs text-muted-foreground">
												Artifact: {run.artifactPath}
											</p>
										)}

										{run.emailStatus && (
											<p className="text-xs text-muted-foreground">
												Email: {run.emailStatus}
												{run.emailRecipient ? ` → ${run.emailRecipient}` : ""}
											</p>
										)}

										{run.error && (
											<p className="text-xs text-destructive">
												Error: {run.error}
											</p>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
