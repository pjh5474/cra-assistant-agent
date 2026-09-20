import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatScheduleTimeKst } from "@/lib/regulatorySchedule";
import { weeklyToCron } from "../../../shared/utils/regulatorySchedule";
import type {
	RegulatoryScheduleItem,
	RegulatorySchedulePayload,
	RegulatoryScheduleSource,
	ScheduledRunHistoryItem,
} from "../../../shared/types/schedule";
import { SCHEDULE_DAYS } from "@/constants";
import { ScheduleHistoryDialog } from "./ScheduleHistoryDialog";
import { getNextWeeklyRunKst } from "@/lib/getNextWeeklyRunKst";

const SOURCES: Array<{
	value: RegulatoryScheduleSource;
	label: string;
}> = [
	{
		value: "MFDS",
		label: "MFDS",
	},
	{
		value: "ICH",
		label: "ICH",
	},
	{
		value: "KONECT",
		label: "KoNECT",
	},
];

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
	const [day, setDay] = useState(5);

	const [time, setTime] = useState("19:00");

	const [sources, setSources] = useState<RegulatoryScheduleSource[]>([
		"MFDS",
		"ICH",
		"KONECT",
	]);

	const [sendEmail, setSendEmail] = useState(false);

	const [emailRecipient, setEmailRecipient] = useState("");

	const [schedules, setSchedules] = useState<RegulatoryScheduleItem[]>([]);

	const [loading, setLoading] = useState(false);

	const [creating, setCreating] = useState(false);

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

	function toggleSource(source: RegulatoryScheduleSource) {
		setSources((current) =>
			current.includes(source)
				? current.filter((item) => item !== source)
				: [...current, source],
		);
	}

	async function handleCreate() {
		if (sources.length === 0) {
			toast.error("Select at least one source");
			return;
		}

		if (sendEmail && !emailRecipient.trim()) {
			toast.error("Email recipient is required");
			return;
		}

		const cron = weeklyToCron(day, time);

		const payload: Omit<RegulatorySchedulePayload, "scheduleKey"> = {
			sources,
			purpose: "weekly-briefing",
			sendEmail,
			emailRecipient: sendEmail ? emailRecipient.trim() : undefined,
			timezone: "Asia/Seoul",
			dayOfWeek: day,
			localTime: time,
		};

		setCreating(true);

		try {
			await onCreate(cron, payload);

			toast.success("Regulatory schedule created", {
				description: `${SCHEDULE_DAYS[day].label} ${time} KST`,
			});

			await refreshSchedules();
		} catch (error) {
			console.error("[SchedulePanel] create failed", error);

			toast.error("Failed to create schedule", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setCreating(false);
		}
	}

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
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<CalendarClock className="h-4 w-4" />
						Schedule Regulatory Briefing
					</CardTitle>
				</CardHeader>

				<CardContent className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1.5 text-sm">
							<span className="text-muted-foreground">Day</span>

							<select
								value={day}
								onChange={(event) => setDay(Number(event.target.value))}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							>
								{SCHEDULE_DAYS.map((item) => (
									<option key={item.value} value={item.value}>
										{item.label}
									</option>
								))}
							</select>
						</label>

						<label className="space-y-1.5 text-sm">
							<span className="text-muted-foreground">Time</span>

							<Input
								type="time"
								value={time}
								onChange={(event) => setTime(event.target.value)}
							/>
						</label>
					</div>

					<div className="space-y-1">
						<p className="text-sm text-muted-foreground">Timezone</p>

						<p className="text-sm font-medium">Asia/Seoul (KST)</p>
					</div>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">Sources</p>

						<div className="flex flex-wrap gap-2">
							{SOURCES.map((source) => {
								const selected = sources.includes(source.value);

								return (
									<Button
										key={source.value}
										type="button"
										size="sm"
										variant={selected ? "default" : "outline"}
										onClick={() => toggleSource(source.value)}
									>
										{source.label}
									</Button>
								);
							})}
						</div>
					</div>

					<div className="space-y-3">
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={sendEmail}
								onChange={(event) => setSendEmail(event.target.checked)}
								className="size-4 accent-primary"
							/>
							<Mail className="h-4 w-4" />
							Send email on completion
						</label>

						{sendEmail && (
							<label className="block max-w-md space-y-1.5 text-sm">
								<span className="text-muted-foreground">Recipient</span>

								<Input
									type="email"
									value={emailRecipient}
									onChange={(event) => setEmailRecipient(event.target.value)}
									placeholder="recipient@example.com"
								/>
							</label>
						)}
					</div>

					<div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
						Every {SCHEDULE_DAYS[day].label} at {time} KST
					</div>

					<Button
						type="button"
						onClick={handleCreate}
						disabled={
							creating ||
							sources.length === 0 ||
							(sendEmail && !emailRecipient.trim())
						}
					>
						{creating && <Loader2 className="h-4 w-4 animate-spin" />}
						Create Schedule
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle className="text-base">Scheduled Jobs</CardTitle>

					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => void refreshSchedules()}
						disabled={loading}
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
						<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
							No regulatory schedules.
						</div>
					)}

					<div className="space-y-3">
						{schedules.map((schedule) => {
							const history = historyBySchedule[schedule.id] ?? [];

							const lastRun = history[0];

							const nextRun = getNextWeeklyRunKst(
								schedule.payload.dayOfWeek,
								schedule.payload.localTime,
							);
							return (
								<div key={schedule.id} className="rounded-lg border p-4">
									<div className="flex items-start justify-between gap-4">
										<div className="min-w-0 space-y-2">
											<div>
												<p className="font-medium">
													Weekly Regulatory Briefing
												</p>

												<p className="text-xs text-muted-foreground">
													Next run:{" "}
													{formatScheduleTimeKst(nextRun.getTime() / 1000)}
												</p>
											</div>

											<div className="flex flex-wrap gap-1.5">
												{schedule.payload.sources.map((source) => (
													<span
														key={source}
														className="rounded-md bg-muted px-2 py-1 text-xs"
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

												<p>Status: {lastRun.status}</p>

												{lastRun.emailStatus && (
													<p>Email: {lastRun.emailStatus}</p>
												)}
											</div>
										)}

										<div className="flex gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													void handleViewHistory(schedule.payload.scheduleKey)
												}
											>
												View History
											</Button>

											<Button
												type="button"
												size="sm"
												variant="destructive"
												disabled={cancellingId === schedule.id}
												onClick={() => void handleCancel(schedule.id)}
											>
												{cancellingId === schedule.id ? (
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
						})}
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
