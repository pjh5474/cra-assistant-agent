import { cn } from "@/lib/utils";
import type { AgentToolActivity } from "@/types/agent-activity";
import { Check, LoaderCircle, TriangleAlert, Wrench } from "lucide-react";

export function ToolActivity({ tool }: { tool: AgentToolActivity }) {
	const running = tool.status === "running";

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",

				running && "bg-primary/10 text-primary",
			)}
		>
			<Wrench className="size-3 shrink-0" />

			<span className="min-w-0 flex-1 truncate font-mono text-[11px]">
				{tool.name}
			</span>

			{tool.status === "completed" && (
				<Check className="size-3.5 text-muted-foreground" />
			)}

			{running && <LoaderCircle className="size-3.5 animate-spin" />}

			{tool.status === "error" && (
				<TriangleAlert className="size-3.5 text-destructive" />
			)}
		</div>
	);
}
