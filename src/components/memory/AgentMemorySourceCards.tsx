import { Database, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentMemorySourceSummary } from "../../types/agent-memory.ts";
import { formatTime } from "@/lib/subagent";

interface AgentMemorySourceCardsProps {
	sources: AgentMemorySourceSummary[];
}

export function AgentMemorySourceCards({
	sources,
}: AgentMemorySourceCardsProps) {
	if (sources.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-3 md:grid-cols-3">
			{sources.map((source) => (
				<div key={source.source} className="rounded-lg border p-4">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<Database className="h-4 w-4" />

							<span className="font-medium">{source.source}</span>
						</div>

						<Badge variant="outline">{source.total}</Badge>
					</div>

					<div className="mt-4 grid grid-cols-3 gap-2">
						<MemoryMetric label="New" value={source.newCount} />

						<MemoryMetric label="Changed" value={source.changedCount} />

						<MemoryMetric label="Relevant" value={source.relevantCount} />
					</div>

					{source.lastSeenAt && (
						<div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
							<History className="h-3.5 w-3.5" />
							Last seen {formatTime(source.lastSeenAt)}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function MemoryMetric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md bg-muted/40 p-2">
			<div className="text-lg font-semibold">{value}</div>

			<div className="text-[11px] text-muted-foreground">{label}</div>
		</div>
	);
}
