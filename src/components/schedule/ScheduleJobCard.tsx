import { Loader2, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatScheduleTimeKst } from "@/lib/regulatorySchedule";
import { getNextWeeklyRunKst } from "@/lib/getNextWeeklyRunKst";
import type {
	RegulatoryScheduleItem,
	ScheduledRunHistoryItem,
} from "../../../shared/types/schedule";

interface ScheduleJobCardProps {
	schedule: RegulatoryScheduleItem;
	lastRun?: ScheduledRunHistoryItem;
	cancelling: boolean;
	onViewHistory: (scheduleKey: string) => void;
	onCancel: (scheduleId: string) => void;
}

function runStatusClass(status: ScheduledRunHistoryItem["status"]) {
	switch (status) {
		case "completed":
			return "text-emerald-500";

		case "failed":
			return "text-destructive";

		case "running":
			return "text-primary";

		default:
			return "text-muted-foreground";
	}
}

export function ScheduleJobCard({
	schedule,
	lastRun,
	cancelling,
	onViewHistory,
	onCancel,
}: ScheduleJobCardProps) {
	const nextRun = getNextWeeklyRunKst(
		schedule.payload.dayOfWeek,
		schedule.payload.localTime,
	);

	return (
		<div
			className={[
				"animate-in fade-in slide-in-from-bottom-1",
				"rounded-lg border p-4",
				"transition-all duration-300 ease-out",
				"hover:-translate-y-0.5",
				"hover:border-primary/30",
				"hover:shadow-sm",
			].join(" ")}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 space-y-2">
					<div>
						<p className="font-medium">Weekly Regulatory Briefing</p>

						<p className="text-xs text-muted-foreground">
							Next run: {formatScheduleTimeKst(nextRun.getTime() / 1000)}
						</p>
					</div>

					<div className="flex flex-wrap gap-1.5">
						{schedule.payload.sources.map((source) => (
							<span
								key={source}
								className="rounded-md bg-muted px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted/70"
							>
								{source}
							</span>
						))}
					</div>

					{schedule.type === "cron" && schedule.cron && (
						<p className="text-xs text-muted-foreground">
							Cron (UTC): {schedule.cron}
						</p>
					)}

					{schedule.payload.sendEmail && (
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Mail className="h-3.5 w-3.5" />
							{schedule.payload.emailRecipient}
						</p>
					)}
				</div>

				{lastRun && (
					<div className="space-y-1 text-xs text-muted-foreground">
						<p>
							Last run:{" "}
							{new Intl.DateTimeFormat("ko-KR", {
								timeZone: "Asia/Seoul",
								year: "numeric",
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							}).format(new Date(lastRun.startedAt))}
						</p>

						<p>
							Status:{" "}
							<span
								className={`font-medium transition-colors duration-300 ${runStatusClass(
									lastRun.status,
								)}`}
							>
								{lastRun.status}
							</span>
						</p>

						{lastRun.emailStatus && (
							<p>
								Email: <span className="font-medium">{lastRun.emailStatus}</span>
							</p>
						)}
					</div>
				)}

				<div className="flex gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onViewHistory(schedule.payload.scheduleKey)}
						className="transition-all duration-200 active:scale-[0.97]"
					>
						View History
					</Button>

					<Button
						type="button"
						size="sm"
						variant="destructive"
						disabled={cancelling}
						onClick={() => onCancel(schedule.id)}
						className="transition-all duration-200 active:scale-[0.97]"
					>
						{cancelling ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Trash2 className="h-4 w-4" />
						)}
						Cancel
					</Button>
				</div>
			</div>
		</div>
	);
}
