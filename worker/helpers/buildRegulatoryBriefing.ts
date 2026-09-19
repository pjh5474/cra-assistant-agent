import type {
	RegulatoryBriefing,
	SourceProcessingResult,
	SourceWorkflowResult,
} from "../types/workflow.ts";
import type { BriefingCandidate } from "../types/regulatory-briefing.ts";

export interface BuildRegulatoryBriefingInput {
	since: string;
	until?: string;

	sources: SourceWorkflowResult[];

	mainItems: BriefingCandidate[];

	referenceItems: BriefingCandidate[];
}

const PRIORITY_WEIGHT: Record<"high" | "medium" | "low", number> = {
	high: 3,
	medium: 2,
	low: 1,
};

export function buildRegulatoryBriefing(
	input: BuildRegulatoryBriefingInput,
): RegulatoryBriefing {
	const { since, until, sources, mainItems, referenceItems } = input;

	// const sourceItems = sources.flatMap((source) => source.items);

	// const relevantItems = sourceItems.filter((item) => item.relevant);

	const highlights = [...mainItems]
		.sort((a, b) => {
			const priorityDiff =
				PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];

			if (priorityDiff !== 0) {
				return priorityDiff;
			}

			const relevanceDiff = b.relevanceScore - a.relevanceScore;

			if (relevanceDiff !== 0) {
				return relevanceDiff;
			}

			const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;

			const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

			return bDate - aDate;
		})
		.map((item) => ({
			id: `${item.source}:${item.sourceId}`,
			title: item.title,
			source: item.source,
			priority: item.priority,
			categories: item.categories,
			summary: item.summary,
			craImpact: item.craImpact,
			interviewPoint: item.interviewPoint,
			url: item.url,
			publishedAt: item.publishedAt,
			relevanceScore: item.relevanceScore,
		}));

	const references = [...referenceItems]
		.sort((a, b) => {
			const priorityDiff =
				PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];

			if (priorityDiff !== 0) {
				return priorityDiff;
			}

			return b.relevanceScore - a.relevanceScore;
		})
		.map((item) => ({
			id: `${item.source}:${item.sourceId}`,
			title: item.title,
			source: item.source,
			priority: item.priority,
			categories: item.categories,
			summary: item.summary,
			url: item.url,
			publishedAt: item.publishedAt,
			changeStatus: item.changeStatus,
			fromCache: item.fromCache,
		}));

	const allVisibleItems = [...mainItems, ...referenceItems];

	const sourceSummary = buildSourceSummary(sources);

	const categorySummary = buildCategorySummary(allVisibleItems);

	const prioritySummary = buildPrioritySummary(allVisibleItems);

	const summary = buildSummaryText({
		mainCount: highlights.length,

		referenceCount: references.length,

		sourceSummary,
		categorySummary,
		prioritySummary,
	});

	return {
		title: "Weekly CRA Regulatory Briefing",
		period: {
			since,
			until,
		},
		generatedAt: new Date().toISOString(),
		summary,
		stats: {
			sourcesProcessed: sourceSummary.length,
			totalFetched: sourceSummary.reduce(
				(total, source) => total + source.fetched,
				0,
			),
			totalCandidates: sourceSummary.reduce(
				(total, source) => total + source.candidates,
				0,
			),
			totalRelevant: mainItems.length + referenceItems.length,
			mainItems: mainItems.length,
			referenceItems: referenceItems.length,
			highPriority: prioritySummary.high,
			mediumPriority: prioritySummary.medium,
			lowPriority: prioritySummary.low,
		},
		sources: sourceSummary,
		categories: categorySummary,
		highlights,
		references,
	};
}

function buildSourceSummary(
	sources: SourceWorkflowResult[],
): SourceProcessingResult[] {
	return sources.map((source) => ({
		source: source.source,

		fetched: source.totalFetched,

		candidates: source.candidateCount,

		relevant: source.relevantCount,

		completedAt: source.collectedAt,

		items: source.items
			.filter((item) => item.relevant)
			.map((item) => ({
				id: item.id,

				title: item.title,

				url: item.url,

				publishedAt: item.publishedAt,

				categories: item.categories,

				priority: item.priority,

				summary: item.summary,

				craImpact: item.craImpact,

				interviewPoint: item.interviewPoint,
			})),

		warnings: source.warnings,
	}));
}

function buildCategorySummary(items: BriefingCandidate[]) {
	const counts = new Map<string, number>();

	for (const item of items) {
		for (const category of item.categories) {
			counts.set(category, (counts.get(category) ?? 0) + 1);
		}
	}

	return Array.from(counts.entries())
		.map(([category, count]) => ({
			category,
			count,
		}))
		.sort((a, b) => b.count - a.count);
}

function buildPrioritySummary(items: BriefingCandidate[]) {
	const summary = {
		high: 0,
		medium: 0,
		low: 0,
	};

	for (const item of items) {
		summary[item.priority] += 1;
	}

	return summary;
}

function buildSummaryText(input: {
	mainCount: number;
	referenceCount: number;

	sourceSummary: SourceProcessingResult[];

	categorySummary: {
		category: string;
		count: number;
	}[];

	prioritySummary: {
		high: number;
		medium: number;
		low: number;
	};
}): string {
	const {
		mainCount,
		referenceCount,
		sourceSummary,
		categorySummary,
		prioritySummary,
	} = input;

	const totalVisible = mainCount + referenceCount;

	if (totalVisible === 0) {
		return (
			"No CRA-relevant regulatory updates " +
			"or active reference items were identified."
		);
	}

	const sourceNames = sourceSummary.map((source) => source.source).join(", ");

	const topCategories = categorySummary
		.slice(0, 3)
		.map(({ category, count }) => `${category} (${count})`)
		.join(", ");

	const priorityText = [
		prioritySummary.high > 0 ? `${prioritySummary.high} high priority` : null,

		prioritySummary.medium > 0
			? `${prioritySummary.medium} medium priority`
			: null,

		prioritySummary.low > 0 ? `${prioritySummary.low} low priority` : null,
	]
		.filter(Boolean)
		.join(", ");

	const parts = [
		`${mainCount} main briefing item${
			mainCount === 1 ? "" : "s"
		} and ${referenceCount} additional reference item${
			referenceCount === 1 ? "" : "s"
		} were identified from ${sourceNames}.`,
	];

	if (priorityText) {
		parts.push(`Priority distribution: ${priorityText}.`);
	}

	if (topCategories) {
		parts.push(`Main categories: ${topCategories}.`);
	}

	return parts.join(" ");
}
