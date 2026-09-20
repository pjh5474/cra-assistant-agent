import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SOURCES = [
	{ value: "MFDS", label: "MFDS" },
	{ value: "ICH", label: "ICH" },
	{ value: "KONECT", label: "KoNECT" },
] as const;

type Source = (typeof SOURCES)[number]["value"];

interface WorkflowRunParams {
	since: string;
	until?: string;
	sources: Source[];
	sendEmail: boolean;
	emailRecipient?: string;
}

interface WorkflowControlsProps {
	onRun: (params: WorkflowRunParams) => void | Promise<void>;
	isWorkflowRunning: boolean;
}

function toIsoString(value: string): string {
	return new Date(value).toISOString();
}

export function WorkflowControls({
	onRun,
	isWorkflowRunning,
}: WorkflowControlsProps) {
	const [since, setSince] = useState("2026-09-18T00:00");
	const [until, setUntil] = useState("2026-09-19T23:59");
	const [sources, setSources] = useState<Source[]>(["MFDS", "ICH", "KONECT"]);
	const [sendEmail, setSendEmail] = useState(false);
	const [emailRecipient, setEmailRecipient] = useState("");

	function handleRun() {
		if (!since || sources.length === 0) {
			return;
		}

		if (sendEmail && !emailRecipient.trim()) {
			return;
		}

		return onRun({
			since: toIsoString(since),

			until: until ? toIsoString(until) : undefined,

			sources,

			sendEmail,

			emailRecipient: sendEmail ? emailRecipient.trim() : undefined,
		});
	}

	function toggleSource(source: Source) {
		setSources((current) =>
			current.includes(source)
				? current.filter((item) => item !== source)
				: [...current, source],
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Workflow Controls</CardTitle>
			</CardHeader>

			<CardContent className="space-y-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="text-muted-foreground">Since</span>
						<Input
							type="datetime-local"
							value={since}
							onChange={(event) => setSince(event.target.value)}
						/>
					</label>

					<label className="space-y-1.5 text-sm">
						<span className="text-muted-foreground">Until</span>
						<Input
							type="datetime-local"
							value={until}
							onChange={(event) => setUntil(event.target.value)}
						/>
					</label>
				</div>

				<div className="space-y-1.5">
					<span className="text-sm text-muted-foreground">Sources</span>
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
						Send report by email
					</label>

					{sendEmail && (
						<label className="block max-w-md space-y-1.5 text-sm">
							<span className="text-muted-foreground">Email recipient</span>

							<Input
								type="email"
								value={emailRecipient}
								onChange={(event) => setEmailRecipient(event.target.value)}
								placeholder="recipient@example.com"
							/>

							<p className="text-xs text-muted-foreground">
								You will review and approve the email before it is sent.
							</p>
						</label>
					)}
				</div>

				<Button
					type="button"
					onClick={handleRun}
					disabled={
						sources.length === 0 ||
						(sendEmail && !emailRecipient.trim()) ||
						isWorkflowRunning
					}
					className="w-full sm:w-auto"
				>
					{isWorkflowRunning ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Workflow Running
						</>
					) : (
						<>
							<Play className="h-4 w-4" />
							Run Workflow
						</>
					)}
				</Button>
			</CardContent>
		</Card>
	);
}
