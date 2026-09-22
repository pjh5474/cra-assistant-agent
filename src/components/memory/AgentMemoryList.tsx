import { ChevronDown, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type {
	AgentMemoryItem,
	MemoryChangeStatus,
	MemoryPriority,
} from "../../types/agent-memory.ts";

import { formatTime } from "@/lib/subagent";

interface AgentMemoryListProps {
	items: AgentMemoryItem[];
}

export function AgentMemoryList({ items }: AgentMemoryListProps) {
	if (items.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center">
				<p className="text-sm font-medium">No matching memory items</p>

				<p className="mt-1 text-xs text-muted-foreground">
					Try changing the source filter or search query.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{items.map((item, index) => (
				<div
					key={`${item.source}:${item.sourceId}:${item.contentHash}`}
					className="animate-in fade-in slide-in-from-bottom-1 duration-300"
					style={{
						animationDelay: `${Math.min(index * 40, 200)}ms`,
						animationFillMode: "both",
					}}
				>
					<MemoryItemCard item={item} />
				</div>
			))}
		</div>
	);
}

function MemoryItemCard({ item }: { item: AgentMemoryItem }) {
	return (
		<Collapsible>
			<div className="rounded-lg border bg-background transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
				<div className="flex flex-wrap items-start gap-3 p-4">
					<CollapsibleTrigger className="group flex min-w-0 flex-1 items-start gap-3 text-left">
						<ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />

						<div className="min-w-0 flex-1 space-y-2">
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">{item.source}</Badge>

								<ChangeStatusBadge status={item.changeStatus} />

								{item.analysis && (
									<PriorityBadge priority={item.analysis.priority} />
								)}

								{item.analysis && (
									<Badge
										variant={item.analysis.relevant ? "secondary" : "outline"}
									>
										{item.analysis.relevant ? "Relevant" : "Not Relevant"}
									</Badge>
								)}
							</div>

							<div>
								<h4 className="text-sm font-medium leading-snug">
									{item.title}
								</h4>

								<p className="mt-1 text-xs text-muted-foreground">
									{item.sourceId}
								</p>
							</div>

							<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<span>First seen {formatTime(item.firstSeenAt)}</span>

								<span>Last seen {formatTime(item.lastSeenAt)}</span>

								<span>Last changed {formatTime(item.lastChangedAt)}</span>
							</div>
						</div>
					</CollapsibleTrigger>

					{item.url && (
						<Button variant="outline" size="sm">
							<a
								href={item.url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-2"
							>
								<ExternalLink className="h-4 w-4" />
								Source
							</a>
						</Button>
					)}
				</div>

				<CollapsibleContent className="overflow-hidden data-open:animate-collapsible-down data-closed:animate-collapsible-up">
					<div className="border-t px-4 py-4">
						{item.analysis ? (
							<AnalysisDetails item={item} />
						) : (
							<div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
								No cached analysis exists for this content version.
							</div>
						)}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

function AnalysisDetails({ item }: { item: AgentMemoryItem }) {
	const analysis = item.analysis;

	if (!analysis) {
		return null;
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap gap-2">
				{analysis.categories.map((category) => (
					<Badge key={category} variant="secondary">
						{category}
					</Badge>
				))}
			</div>

			<MemoryTextSection title="Summary" text={analysis.summary} />

			<MemoryTextSection title="CRA Impact" text={analysis.craImpact} />

			{analysis.interviewPoint && (
				<MemoryTextSection
					title="Interview Point"
					text={analysis.interviewPoint}
				/>
			)}

			<MemoryTextSection title="Analysis Reason" text={analysis.reason} />

			<div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
				<div>Relevance {Math.round(analysis.relevanceScore * 100)}%</div>

				<div>Analyzed {formatTime(analysis.analyzedAt)}</div>

				<div className="truncate" title={item.contentHash}>
					Hash {item.contentHash.slice(0, 12)}…
				</div>
			</div>
		</div>
	);
}

function MemoryTextSection({ title, text }: { title: string; text: string }) {
	return (
		<div className="space-y-1">
			<div className="text-xs font-medium">{title}</div>

			<p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
		</div>
	);
}

function ChangeStatusBadge({ status }: { status: MemoryChangeStatus }) {
	switch (status) {
		case "new":
			return <Badge>New</Badge>;

		case "changed":
			return <Badge variant="destructive">Changed</Badge>;

		case "unchanged":
		default:
			return <Badge variant="outline">Unchanged</Badge>;
	}
}

function PriorityBadge({ priority }: { priority: MemoryPriority }) {
	switch (priority) {
		case "high":
			return <Badge variant="destructive">High</Badge>;

		case "medium":
			return <Badge variant="secondary">Medium</Badge>;

		case "low":
		default:
			return <Badge variant="outline">Low</Badge>;
	}
}
