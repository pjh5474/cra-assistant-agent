import type { AgentActivity } from "@/types/agent-activity";

import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { AgentActivityItem } from "./AgentActivityItem";

interface Props {
	runningActivities: AgentActivity[];
	recentActivities: AgentActivity[];
}

export function AgentActivityPanel({
	runningActivities,
	recentActivities,
}: Props) {
	const hasActivities =
		runningActivities.length > 0 || recentActivities.length > 0;

	return (
		<Card className="max-h-[70vh] overflow-hidden transition-shadow duration-300">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-sm">
						<Activity
							className={
								runningActivities.length > 0
									? "size-4 text-primary transition-colors duration-300"
									: "size-4 transition-colors duration-300"
							}
						/>
						Agent Activity
					</CardTitle>

					{runningActivities.length > 0 && (
						<div className="flex items-center gap-1.5 text-xs text-primary">
							<span className="relative flex size-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
								<span className="relative inline-flex size-2 rounded-full bg-primary" />
							</span>

							<span className="tabular-nums">
								{runningActivities.length} running
							</span>
						</div>
					)}
				</div>
			</CardHeader>

			<CardContent className="max-h-[calc(70vh-4rem)] space-y-4 overflow-y-auto">
				{!hasActivities && (
					<div className="animate-in fade-in duration-300 py-8 text-center text-xs text-muted-foreground">
						No agent activity yet.
					</div>
				)}

				{runningActivities.length > 0 && (
					<div className="animate-in fade-in slide-in-from-top-1 space-y-2 duration-300">
						<div className="flex items-center gap-2">
							<p className="text-xs font-medium text-muted-foreground">
								Active
							</p>

							<div className="h-px flex-1 bg-border" />
						</div>

						{runningActivities.map((activity) => (
							<AgentActivityItem key={activity.id} activity={activity} />
						))}
					</div>
				)}

				{recentActivities.length > 0 && (
					<div className="animate-in fade-in space-y-2 duration-300">
						<div className="flex items-center gap-2">
							<p className="text-xs font-medium text-muted-foreground">
								Recent
							</p>

							<div className="h-px flex-1 bg-border" />
						</div>

						{recentActivities.map((activity) => (
							<AgentActivityItem key={activity.id} activity={activity} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
