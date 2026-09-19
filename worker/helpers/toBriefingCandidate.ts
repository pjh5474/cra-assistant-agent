import type {
	RegulatoryItem,
	AnalyzedRegulatoryItem,
} from "../types/regulatory.ts";

import type { BriefingCandidate } from "../types/regulatory-briefing.ts";

export function toBriefingCandidate(
	item: RegulatoryItem,
	analysis: AnalyzedRegulatoryItem,
	changeStatus: "new" | "changed" | "unchanged",
	fromCache: boolean,
): BriefingCandidate {
	return {
		source: item.source,
		sourceId: item.sourceId,
		title: item.title,
		url: item.url,
		publishedAt: item.publishedAt,
		changeStatus,
		relevant: analysis.relevant,
		relevanceScore: analysis.relevanceScore,
		priority: analysis.priority,
		categories: analysis.categories,
		summary: analysis.summary,
		craImpact: analysis.craImpact,
		interviewPoint: analysis.interviewPoint,
		reason: analysis.reason,
		fromCache,
	};
}
