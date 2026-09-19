export type BriefingPlacement = "main" | "reference" | "hidden";

export interface BriefingCandidate {
	source: "MFDS" | "ICH" | "KONECT";

	sourceId: string;

	title: string;

	url?: string;

	publishedAt?: string;

	changeStatus: "new" | "changed" | "unchanged";

	relevant: boolean;

	relevanceScore: number;

	priority: "high" | "medium" | "low";

	categories: string[];

	summary: string;

	craImpact: string;

	interviewPoint?: string;

	reason: string;

	fromCache: boolean;
}

export interface BriefingSelectionResult {
	mainItems: BriefingCandidate[];
	referenceItems: BriefingCandidate[];
	hiddenItems: BriefingCandidate[];
}
