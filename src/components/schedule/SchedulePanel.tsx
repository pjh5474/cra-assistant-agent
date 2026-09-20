import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
	RegulatoryScheduleItem,
	RegulatorySchedulePayload,
	ScheduledRunHistoryItem,
} from "../../../shared/types/schedule";
import { ScheduleCreateForm } from "./ScheduleCreateForm";
import { ScheduleHistoryDialog } from "./ScheduleHistoryDialog";
import { ScheduleJobCard } from "./ScheduleJobCard";

interface SchedulePanelProps {
	onCreate: (
		cron: string,
		payload: Omit<RegulatorySchedulePayload, "scheduleKey">,
	) => Promise<unknown>;

	onList: () => Promise<RegulatoryScheduleItem[]>;

	onCancel: (scheduleId: string) => Promise<unknown>;

	onGetHistory: (
		scheduleId: string,
		limit?: number,
	) => Promise<ScheduledRunHistoryItem[]>;
}

export function SchedulePanel({
	onCreate,
	onList,
	onCancel,
	onGetHistory,
}: SchedulePanelProps) {
	const [schedules, setSchedules] = useState<RegulatoryScheduleItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [cancellingId, setCancellingId] = useState<string | null>(null);
	const [historyBySchedule, setHistoryBySchedule] = useState<
		Record<string, ScheduledRunHistoryItem[]>
	>({});
	const [historyOpen, setHistoryOpen] = useState(false);
	const [selectedScheduleHistory, setSelectedScheduleHistory] = useState<
		ScheduledRunHistoryItem[]
	>([]);
	const [historyLoading, setHistoryLoading] = useState(false);

	const refreshSchedules = useCallback(async () => {
		setLoading(true);

		try {
			const result = await onList();

			setSchedules(result);

			const entries = await Promise.all(
				result.map(async (schedule) => {
					const history = await onGetHistory(schedule.payload.scheduleKey, 1);

					return [schedule.id, history] as const;
				}),
			);

			setHistoryBySchedule(Object.fromEntries(entries));
		} finally {
			setLoading(false);
		}
	}, [onList, onGetHistory]);

	useEffect(() => {
		void refreshSchedules();
	}, [refreshSchedules]);

	async function handleCancel(id: string) {
		setCancellingId(id);

		try {
			await onCancel(id);

			toast.success("Schedule cancelled");

			await refreshSchedules();
		} catch (error) {
			console.error("[SchedulePanel] cancel failed", error);

			toast.error("Failed to cancel schedule", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setCancellingId(null);
		}
	}

	async function handleViewHistory(scheduleKey: string) {
		setHistoryOpen(true);
		setHistoryLoading(true);

		try {
			const history = await onGetHistory(scheduleKey, 20);

			setSelectedScheduleHistory(history);
		} catch (error) {
			console.error("[SchedulePanel] history load failed", error);

			toast.error("Failed to load schedule history", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setHistoryLoading(false);
		}
	}

	return (
		<div className="space-y-6">
			<ScheduleCreateForm onCreate={onCreate} onCreated={refreshSchedules} />

			<Card className="transition-shadow duration-300 hover:shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle className="text-base">Scheduled Jobs</CardTitle>

					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => void refreshSchedules()}
						disabled={loading}
						className="transition-all duration-200 active:scale-[0.98]"
					>
						<RefreshCw
							className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
						/>
						Refresh
					</Button>
				</CardHeader>

				<CardContent>
					{loading && schedules.length === 0 && (
						<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading schedules...
						</div>
					)}

					{!loading && schedules.length === 0 && (
						<div className="animate-in fade-in rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground duration-300">
							No regulatory schedules.
						</div>
					)}

					<div className="space-y-3">
						{schedules.map((schedule) => (
							<ScheduleJobCard
								key={schedule.id}
								schedule={schedule}
								lastRun={historyBySchedule[schedule.id]?.[0]}
								cancelling={cancellingId === schedule.id}
								onViewHistory={(scheduleKey) => {
									void handleViewHistory(scheduleKey);
								}}
								onCancel={(scheduleId) => {
									void handleCancel(scheduleId);
								}}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			<ScheduleHistoryDialog
				open={historyOpen}
				loading={historyLoading}
				history={selectedScheduleHistory}
				onOpenChange={(open) => {
					setHistoryOpen(open);

					if (!open) {
						setSelectedScheduleHistory([]);
					}
				}}
			/>
		</div>
	);
}
