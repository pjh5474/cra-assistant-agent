import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime, statusLabel } from "@/lib/subagent";
import type { SubagentActivity } from "@/types/agent";

interface CurrentActivityCardProps {
	activity?: SubagentActivity;
}

export function CurrentActivityCard({ activity }: CurrentActivityCardProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<Activity className="h-4 w-4" />
					Current Activity
				</CardTitle>
			</CardHeader>

			<CardContent>
				{activity ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm font-medium">MFDS</span>

							<Badge
								variant={activity.status === "error" ? "destructive" : "outline"}
							>
								{statusLabel(activity.status)}
							</Badge>
						</div>

						{activity.phase && (
							<p className="text-xs font-medium">{activity.phase}</p>
						)}

						{activity.message && (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{activity.message}
							</p>
						)}

						<div className="text-[10px] text-muted-foreground">
							Last updated {formatTime(activity.updatedAt)}
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No active regulatory jobs.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
