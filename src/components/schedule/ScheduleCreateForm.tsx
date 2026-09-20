import { useState } from "react";
import { CalendarClock, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { weeklyToCron } from "../../../shared/utils/regulatorySchedule";
import type {
	RegulatorySchedulePayload,
	RegulatoryScheduleSource,
} from "../../../shared/types/schedule";
import { SCHEDULE_DAYS } from "@/constants";

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

interface ScheduleCreateFormProps {
	onCreate: (
		cron: string,
		payload: Omit<RegulatorySchedulePayload, "scheduleKey">,
	) => Promise<unknown>;
	onCreated: () => Promise<void>;
}

export function ScheduleCreateForm({
	onCreate,
	onCreated,
}: ScheduleCreateFormProps) {
	const [day, setDay] = useState(5);
	const [time, setTime] = useState("19:00");
	const [sources, setSources] = useState<RegulatoryScheduleSource[]>([
		"MFDS",
		"ICH",
		"KONECT",
	]);
	const [sendEmail, setSendEmail] = useState(false);
	const [emailRecipient, setEmailRecipient] = useState("");
	const [creating, setCreating] = useState(false);

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

			await onCreated();
		} catch (error) {
			console.error("[SchedulePanel] create failed", error);

			toast.error("Failed to create schedule", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setCreating(false);
		}
	}

	return (
		<Card className="transition-shadow duration-300 hover:shadow-sm">
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
									className="transition-all duration-200"
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
						<label className="animate-in fade-in slide-in-from-top-1 block max-w-md space-y-1.5 text-sm duration-200">
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
					className="transition-all duration-200 active:scale-[0.98]"
				>
					{creating && <Loader2 className="h-4 w-4 animate-spin" />}
					Create Schedule
				</Button>
			</CardContent>
		</Card>
	);
}
