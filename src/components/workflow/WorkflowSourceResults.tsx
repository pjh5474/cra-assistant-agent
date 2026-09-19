import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/subagent";
import type { SourceProcessingResult } from "../../../worker/types/workflow.ts";

interface WorkflowSourceResultsProps {
	sources?: {
		mfds?: SourceProcessingResult;
		ich?: SourceProcessingResult;
		konect?: SourceProcessingResult;
	};
	briefingSources?: SourceProcessingResult[];
}

const SOURCE_CARDS = [
	{ key: "MFDS", label: "MFDS" },
	{ key: "ICH", label: "ICH" },
	{ key: "KONECT", label: "KoNECT" },
] as const;

function findResult(
	source: "MFDS" | "ICH" | "KONECT",
	sources?: WorkflowSourceResultsProps["sources"],
	briefingSources?: SourceProcessingResult[],
) {
	if (source === "MFDS" && sources?.mfds) {
		return sources.mfds;
	}

	if (source === "ICH" && sources?.ich) {
		return sources.ich;
	}

	if (source === "KONECT" && sources?.konect) {
		return sources.konect;
	}

	return briefingSources?.find((item) => item.source === source);
}

export function WorkflowSourceResults({
	sources,
	briefingSources,
}: WorkflowSourceResultsProps) {
	const results = SOURCE_CARDS.map((source) =>
		findResult(source.key, sources, briefingSources),
	);

	const hasAny = results.some(Boolean);

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Source Results</CardTitle>
			</CardHeader>

			<CardContent className="space-y-3">
				{!hasAny ? (
					<p className="text-sm text-muted-foreground">
						No source results yet. Run the workflow to collect MFDS, ICH, and
						KoNECT updates.
					</p>
				) : (
					SOURCE_CARDS.map((source, index) => {
						const result = results[index];

						return (
							<div key={source.key} className="rounded-lg border p-3">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<ShieldCheck className="h-4 w-4" />
										<span className="text-sm font-medium">{source.label}</span>
									</div>

									<Badge variant={result ? "secondary" : "outline"}>
										{result ? `${result.relevant} relevant` : "Pending"}
									</Badge>
								</div>

								{result ? (
									<>
										<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
											<span>{result.fetched} scanned</span>
											<span>{result.candidates} candidates</span>
											<span>completed {formatTime(result.completedAt)}</span>
										</div>

										{result.items.slice(0, 3).map((item) => (
											<p
												key={item.id}
												className="mt-2 truncate text-xs text-foreground"
											>
												{item.title}
											</p>
										))}

										{result.warnings && result.warnings.length > 0 && (
											<div className="mt-3 space-y-1">
												{result.warnings.map((warning, warningIndex) => (
													<div
														key={`${source.key}-${warningIndex}`}
														className="flex items-start gap-2 text-xs text-muted-foreground"
													>
														<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
														<span>{warning}</span>
													</div>
												))}
											</div>
										)}
									</>
								) : (
									<p className="mt-2 text-xs text-muted-foreground">
										No result for this source.
									</p>
								)}
							</div>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}
