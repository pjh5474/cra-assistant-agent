import { useMemo, useState } from "react";

import { Brain, Database, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import type {
	AgentMemorySnapshot,
	MemorySource,
} from "../../types/agent-memory.ts";

import { AgentMemorySourceCards } from "./AgentMemorySourceCards";
import { AgentMemoryList } from "./AgentMemoryList";

interface AgentMemoryPanelProps {
	memory?: AgentMemorySnapshot;

	loading?: boolean;

	onRefresh?: () => void | Promise<void>;
}

const SOURCE_FILTERS: Array<"ALL" | MemorySource> = [
	"ALL",
	"MFDS",
	"ICH",
	"KONECT",
];

export function AgentMemoryPanel({
	memory,
	loading = false,
	onRefresh,
}: AgentMemoryPanelProps) {
	const [selectedSource, setSelectedSource] = useState<"ALL" | MemorySource>(
		"ALL",
	);

	const [query, setQuery] = useState("");

	const filteredItems = useMemo(() => {
		if (!memory) {
			return [];
		}

		const normalizedQuery = query.trim().toLowerCase();

		return memory.items.filter((item) => {
			if (selectedSource !== "ALL" && item.source !== selectedSource) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			const searchable = [
				item.title,
				item.source,
				item.sourceId,
				item.analysis?.summary,
				item.analysis?.craImpact,
				item.analysis?.categories.join(" "),
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();

			return searchable.includes(normalizedQuery);
		});
	}, [memory, query, selectedSource]);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="space-y-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="space-y-1">
							<CardTitle className="flex items-center gap-2 text-lg">
								<Brain className="h-5 w-5" />
								Agent Memory
							</CardTitle>

							<p className="text-sm text-muted-foreground">
								Regulatory documents observed and analyzed by each source agent.
							</p>
						</div>

						{onRefresh && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={loading}
								onClick={() => void onRefresh()}
							>
								<RefreshCw
									className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
								/>
								Refresh
							</Button>
						)}
					</div>
				</CardHeader>

				<CardContent className="space-y-6">
					{!memory ? (
						<EmptyMemoryState loading={loading} />
					) : (
						<>
							<AgentMemorySourceCards sources={memory.sources} />

							<Separator />

							<div className="space-y-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<h3 className="text-sm font-medium">
											Known Regulatory Items
										</h3>

										<p className="mt-1 text-xs text-muted-foreground">
											{filteredItems.length} of {memory.items.length} items
											shown
										</p>
									</div>

									<Badge variant="outline">
										<Database className="mr-1 h-3.5 w-3.5" />
										{memory.items.length} stored
									</Badge>
								</div>

								<div className="flex flex-col gap-3 lg:flex-row">
									<div className="relative min-w-0 flex-1">
										<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

										<Input
											value={query}
											onChange={(event) => setQuery(event.target.value)}
											placeholder="Search title, category, CRA impact..."
											className="pl-9"
										/>
									</div>

									<div className="flex flex-wrap gap-2">
										{SOURCE_FILTERS.map((source) => (
											<Button
												key={source}
												type="button"
												size="sm"
												variant={
													selectedSource === source ? "default" : "outline"
												}
												onClick={() => setSelectedSource(source)}
											>
												{source}
											</Button>
										))}
									</div>
								</div>

								<AgentMemoryList items={filteredItems} />
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function EmptyMemoryState({ loading }: { loading: boolean }) {
	return (
		<div className="rounded-lg border border-dashed p-8 text-center">
			<Database className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />

			<p className="text-sm font-medium">
				{loading ? "Loading agent memory..." : "No memory loaded"}
			</p>

			<p className="mt-1 text-xs text-muted-foreground">
				Manifest and analysis records will appear here after they are retrieved
				from the regulatory agents.
			</p>
		</div>
	);
}
