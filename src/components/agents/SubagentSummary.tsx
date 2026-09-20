import { Activity, Clock3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime, statusLabel } from "@/lib/subagent";
import type { SubagentActivity } from "../../../shared/types/agent.ts";

interface SubagentSummaryProps {
	name: string;
	description: string;
	state?: SubagentActivity;
}

export function SubagentSummary({
	name,
	description,
	state,
}: SubagentSummaryProps) {
	const progress = Math.round((state?.progress ?? 0) * 100);

	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							{state?.status === "running" ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Activity className="h-4 w-4" />
							)}

							<span className="font-medium">{name}</span>
						</div>

						<p className="mt-1 text-xs text-muted-foreground">{description}</p>
					</div>

					<Badge
						variant={
							state?.status === "error"
								? "destructive"
								: state?.status === "completed"
									? "default"
									: "secondary"
						}
					>
						{statusLabel(state?.status)}
					</Badge>
				</div>

				{state && (
					<div className="mt-4 space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="truncate text-muted-foreground">
								{state.message ?? state.phase ?? "Waiting"}
							</span>

							<span className="ml-3 shrink-0 text-muted-foreground">
								{progress}%
							</span>
						</div>

						<div className="h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full bg-primary transition-all"
								style={{
									width: `${progress}%`,
								}}
							/>
						</div>

						<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
							<Clock3 className="h-3 w-3" />

							{formatTime(new Date().toISOString())}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
