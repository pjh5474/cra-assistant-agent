export type RegulatorySource = "MFDS" | "ICH" | "KONECT";

export type RegulatorySourceType =
	| "law"
	| "notice"
	| "guidance"
	| "safety"
	| "guideline"
	| "education";

export interface RegulatoryItem {
	id: string;
	source: RegulatorySource;
	sourceType: RegulatorySourceType;
	title: string;
	description?: string;
	url: string;
	publishedAt?: string;
	collectedAt: string;
	sourceId: string;
	rawText?: string;
	documentUrls?: string[];
	metadata?: Record<string, unknown>;
}

export type RegulatoryCategory =
	| "IRB"
	| "Safety"
	| "Monitoring"
	| "Essential Documents"
	| "IMP"
	| "Protocol/GCP Compliance"
	| "Data Integrity"
	| "Other";

export type RegulatoryPriority = "high" | "medium" | "low";

export interface AnalyzedRegulatoryItem {
	id: string;
	source: RegulatorySource;
	sourceId: string;
	title: string;
	url: string;
	publishedAt?: string;
	relevant: boolean;
	relevanceScore: number;
	categories: RegulatoryCategory[];
	priority: RegulatoryPriority;
	summary: string;
	craImpact: string;
	interviewPoint?: string;
	reason: string;
}

export interface RegulatoryAnalysisResult {
	analyzedCount: number;
	relevantCount: number;
	items: AnalyzedRegulatoryItem[];
}
