import { Bot, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AgentActivity } from "@/types/agent-activity";

import { ToolActivity } from "./ToolActivity";
import { AgentStatus } from "./AgentStatus";

interface Props {
	activity: AgentActivity;
}

export function AgentActivityItem({ activity }: Props) {
	const running = activity.status === "running";

	const completed = activity.status === "completed";

	const error = activity.status === "error";

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-xl border p-3",
				"transition-all duration-300 ease-out",
				"animate-in fade-in slide-in-from-top-1",
				running && [
					"border-primary/40",
					"bg-primary/4",
					"ring-1",
					"ring-primary/15",
					"shadow-sm",
				],
				completed && ["border-emerald-500/20", "bg-emerald-500/2"],
				error && ["border-destructive/40", "bg-destructive/3"],
			)}
		>
			{running && (
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
			)}

			<div className="flex items-start gap-3">
				<div
					className={cn(
						"relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted",
						"transition-all duration-300",
						running && "bg-primary/10 text-primary",
						completed && "bg-emerald-500/10 text-emerald-500",
						error && "bg-destructive/10 text-destructive",
					)}
				>
					{running && (
						<span className="absolute inset-0 rounded-lg bg-primary/10 animate-ping" />
					)}

					{running ? (
						<Loader2 className="relative size-4 animate-spin" />
					) : completed ? (
						<CheckCircle2 className="relative size-4" />
					) : error ? (
						<XCircle className="relative size-4" />
					) : (
						<Bot className="relative size-4" />
					)}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate text-sm font-medium">
							{activity.displayName}
						</p>

						<AgentStatus status={activity.status} />
					</div>

					{activity.inputPreview && (
						<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground transition-opacity duration-300">
							{activity.inputPreview}
						</p>
					)}

					{activity.tools.length > 0 && (
						<div className="mt-3 space-y-1.5 border-t pt-2">
							{activity.tools.map((tool) => (
								<ToolActivity key={tool.id} tool={tool} />
							))}
						</div>
					)}

					{activity.error && (
						<p className="mt-2 text-xs text-destructive">{activity.error}</p>
					)}
				</div>
			</div>
		</div>
	);
}
