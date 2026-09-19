import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AgentActivity } from "@/types/agent-activity";
import { ToolActivity } from "./ToolActivity";
import { AgentStatus } from "./AgentStatus";

interface Props {
	activity: AgentActivity;
}

export function AgentActivityItem({ activity }: Props) {
	const running = activity.status === "running";

	return (
		<div
			className={cn(
				"rounded-xl border p-3 transition-all duration-300",

				running && [
					"border-primary/40",
					"bg-primary/5",
					"ring-1",
					"ring-primary/15",
					"shadow-sm",
				],

				activity.status === "error" && "border-destructive/40",
			)}
		>
			<div className="flex items-start gap-3">
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted",

						running && "bg-primary/10 text-primary",
					)}
				>
					<Bot className={cn("size-4", running && "animate-pulse")} />
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate text-sm font-medium">
							{activity.displayName}
						</p>

						<AgentStatus status={activity.status} />
					</div>

					{activity.inputPreview && (
						<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
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
