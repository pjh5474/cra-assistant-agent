import {
	AlertTriangle,
	BookOpen,
	ChevronDown,
	FileText,
	ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { RegulatoryBriefing } from "../../../worker/types/workflow.ts";
import { formatTime } from "@/lib/subagent.ts";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible.tsx";

interface RegulatoryBriefingPanelProps {
	briefing: RegulatoryBriefing;
}

function getPriorityVariant(priority: "high" | "medium" | "low") {
	switch (priority) {
		case "high":
			return "destructive";

		case "medium":
			return "secondary";

		case "low":
		default:
			return "outline";
	}
}

export function RegulatoryBriefingPanel({
	briefing,
}: RegulatoryBriefingPanelProps) {
	const { stats } = briefing;

	return (
		<Card className="overflow-hidden">
			<CardHeader className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle className="flex items-center gap-2 text-lg">
							<FileText className="h-5 w-5" />

							{briefing.title}
						</CardTitle>

						<p className="text-sm text-muted-foreground">
							{formatTime(briefing.period.since)}
							{" ~ "}
							{briefing.period.until
								? formatTime(briefing.period.until)
								: "현재"}
						</p>
					</div>

					<Badge variant="outline">{stats.totalRelevant} relevant</Badge>
				</div>

				<p className="text-sm leading-relaxed text-muted-foreground">
					{briefing.summary}
				</p>
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Summary metrics */}

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
					<MetricCard label="Scanned" value={stats.totalFetched} />
					<MetricCard label="Candidates" value={stats.totalCandidates} />
					<MetricCard label="Relevant" value={stats.totalRelevant} />
					<MetricCard label="Main" value={stats.mainItems} />
					<MetricCard label="References" value={stats.referenceItems} />
					<MetricCard label="Sources" value={stats.sourcesProcessed} />
				</div>

				{/* Priority */}

				<div className="space-y-3">
					<h3 className="text-sm font-medium">Priority</h3>

					<div className="flex flex-wrap gap-2">
						<Badge variant="destructive">High {stats.highPriority}</Badge>

						<Badge variant="secondary">Medium {stats.mediumPriority}</Badge>

						<Badge variant="outline">Low {stats.lowPriority}</Badge>
					</div>
				</div>

				{/* Categories */}

				{briefing.categories.length > 0 && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium">Main Categories</h3>

						<div className="flex flex-wrap gap-2">
							{briefing.categories.map((category) => (
								<Badge key={category.category} variant="outline">
									{category.category} {category.count}
								</Badge>
							))}
						</div>
					</div>
				)}

				<Separator />

				{/* Source overview */}

				<div className="space-y-3">
					<h3 className="text-sm font-medium">Regulatory Sources</h3>

					<div className="grid gap-3">
						{briefing.sources.map((source) => (
							<div key={source.source} className="rounded-lg border p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<ShieldCheck className="h-4 w-4" />

										<span className="text-sm font-medium">{source.source}</span>
									</div>

									<Badge variant="secondary">{source.relevant} relevant</Badge>
								</div>

								<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
									<span>{source.fetched} scanned</span>

									<span>{source.candidates} candidates</span>

									<span>completed {formatTime(source.completedAt)}</span>
								</div>

								{source.warnings && source.warnings.length > 0 && (
									<div className="mt-3 space-y-1">
										{source.warnings.map((warning, index) => (
											<div
												key={`${source.source}-${index}`}
												className="flex items-start gap-2 text-xs text-muted-foreground"
											>
												<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

												<span>{warning}</span>
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				</div>

				<Separator />

				{/* Highlights */}

				<div className="space-y-4">
					<div className="flex items-center justify-between gap-3">
						<h3 className="text-sm font-medium">Highlights</h3>

						<span className="text-xs text-muted-foreground">
							{briefing.highlights.length} items
						</span>
					</div>

					{briefing.highlights.length === 0 ? (
						<div className="rounded-lg border border-dashed p-6 text-center">
							<ShieldCheck className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />

							<p className="text-sm font-medium">No CRA-relevant updates</p>

							<p className="mt-1 text-xs text-muted-foreground">
								No relevant regulatory changes were identified during this
								period.
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{briefing.highlights.map((item) => (
								<div key={item.id} className="rounded-lg border p-4">
									<div className="space-y-3">
										<div className="flex flex-wrap gap-2">
											<Badge variant={getPriorityVariant(item.priority)}>
												{item.priority.toUpperCase()}
											</Badge>

											<Badge variant="outline">{item.source}</Badge>

											{item.categories.map((category) => (
												<Badge key={category} variant="secondary">
													{category}
												</Badge>
											))}
										</div>

										<div>
											<h4 className="font-medium leading-snug">{item.title}</h4>

											{item.publishedAt && (
												<p className="mt-1 text-xs text-muted-foreground">
													Published {formatTime(item.publishedAt)}
												</p>
											)}
										</div>

										<BriefingSection title="Summary" text={item.summary} />

										<BriefingSection
											title="CRA Impact"
											text={item.craImpact}
											icon={<ShieldCheck className="h-4 w-4" />}
										/>

										{item.interviewPoint && (
											<BriefingSection
												title="Interview Point"
												text={item.interviewPoint}
												icon={<BookOpen className="h-4 w-4" />}
											/>
										)}

										<div className="flex items-center justify-between gap-3 pt-1">
											<span className="text-xs text-muted-foreground">
												Relevance {Math.round(item.relevanceScore * 100)}%
											</span>

											{item.url && (
												<Button variant="outline" size="sm">
													<a href={item.url} target="_blank" rel="noreferrer">
														View Source
													</a>
												</Button>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<Separator />

				{/* Additional References */}
				<Collapsible defaultOpen={false}>
					<div className="space-y-4">
						<div className="flex items-center justify-between gap-3">
							<CollapsibleTrigger className="group inline-flex h-auto items-center gap-2 rounded-md px-0 py-0 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
								Additional References
								<Badge variant="secondary">{briefing.references.length}</Badge>
								<ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
							</CollapsibleTrigger>

							<span className="text-xs text-muted-foreground">
								Supporting items
							</span>
						</div>

						<CollapsibleContent>
							{briefing.references.length === 0 ? (
								<div className="rounded-lg border border-dashed p-4 text-center">
									<p className="text-xs text-muted-foreground">
										No additional reference items.
									</p>
								</div>
							) : (
								<div className="space-y-3">
									{briefing.references.map((item) => (
										<div key={item.id} className="rounded-lg border p-3">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0 flex-1 space-y-2">
													<div className="flex flex-wrap gap-2">
														<Badge variant={getPriorityVariant(item.priority)}>
															{item.priority.toUpperCase()}
														</Badge>

														<Badge variant="outline">{item.source}</Badge>

														<Badge variant="secondary">
															{item.changeStatus}
														</Badge>

														{item.fromCache && (
															<Badge variant="outline">Cached</Badge>
														)}
													</div>

													<div>
														<h4 className="text-sm font-medium leading-snug">
															{item.title}
														</h4>

														{item.publishedAt && (
															<p className="mt-1 text-xs text-muted-foreground">
																Published {formatTime(item.publishedAt)}
															</p>
														)}
													</div>

													<p className="text-sm leading-relaxed text-muted-foreground">
														{item.summary}
													</p>
												</div>

												{item.url && (
													<Button variant="outline" size="sm">
														<a href={item.url} target="_blank" rel="noreferrer">
															View Source
														</a>
													</Button>
												)}
											</div>
										</div>
									))}
								</div>
							)}
						</CollapsibleContent>
					</div>
				</Collapsible>

				<div className="text-xs text-muted-foreground">
					Generated {formatTime(briefing.generatedAt)}
				</div>
			</CardContent>
		</Card>
	);
}

function MetricCard({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border p-3">
			<div className="text-xl font-semibold">{value}</div>

			<div className="mt-1 text-xs text-muted-foreground">{label}</div>
		</div>
	);
}

function BriefingSection({
	title,
	text,
	icon,
}: {
	title: string;
	text: string;
	icon?: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1.5 text-xs font-medium">
				{icon}

				{title}
			</div>

			<p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
		</div>
	);
}
