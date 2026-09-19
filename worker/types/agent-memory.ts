export type AgentMemorySource = "MFDS" | "ICH" | "KONECT";
export type AgentMemoryChangeStatus = "new" | "changed" | "unchanged";
export type AgentMemoryPriority = "high" | "medium" | "low";

export interface AgentMemoryAnalysis {
	relevant: boolean;
	relevanceScore: number;
	categories: string[];
	priority: AgentMemoryPriority;
	summary: string;
	craImpact: string;
	interviewPoint?: string;
	reason: string;
	analyzedAt: string;
}

export interface AgentMemoryItem {
	source: AgentMemorySource;
	sourceId: string;
	title: string;
	url?: string;
	publishedAt?: string;
	contentHash: string;
	firstSeenAt: string;
	lastSeenAt: string;
	lastChangedAt: string;
	changeStatus: AgentMemoryChangeStatus;
	analysis?: AgentMemoryAnalysis;
}

export interface AgentMemorySourceSummary {
	source: AgentMemorySource;
	total: number;
	newCount: number;
	changedCount: number;
	unchangedCount: number;
	relevantCount: number;
	lastSeenAt?: string;
}

export interface AgentMemorySourceSnapshot {
	source: AgentMemorySource;
	generatedAt: string;
	summary: AgentMemorySourceSummary;
	items: AgentMemoryItem[];
}

export interface AgentMemorySnapshot {
	generatedAt: string;
	sources: AgentMemorySourceSummary[];
	items: AgentMemoryItem[];
}
