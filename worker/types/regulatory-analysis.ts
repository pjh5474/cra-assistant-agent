import type { RegulatoryItem } from "./regulatory.ts";

export interface RegulatoryAnalysisRecord {
	source: RegulatoryItem["source"];
	sourceId: string;
	contentHash: string;

	relevant: boolean;
	relevanceScore: number;
	categories: string[];
	priority: "high" | "medium" | "low";

	summary: string;
	craImpact: string;
	interviewPoint?: string;
	reason: string;

	analyzedAt: string;
}

export interface RegulatoryAnalysisInput {
	source: RegulatoryItem["source"];
	sourceId: string;
	contentHash: string;

	relevant: boolean;
	relevanceScore: number;
	categories: string[];
	priority: "high" | "medium" | "low";

	summary: string;
	craImpact: string;
	interviewPoint?: string;
	reason: string;
}

export interface RegulatoryAnalysisCacheSummary {
	analyzedCount: number;
	reusedCount: number;
	missingCount: number;
}
