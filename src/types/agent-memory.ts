export type MemorySource = "MFDS" | "ICH" | "KONECT";

export type MemoryChangeStatus = "new" | "changed" | "unchanged";

export type MemoryPriority = "high" | "medium" | "low";

export interface AgentMemoryItem {
	source: MemorySource;
	sourceId: string;

	title: string;
	url?: string;
	publishedAt?: string;

	contentHash: string;

	firstSeenAt: string;
	lastSeenAt: string;
	lastChangedAt: string;

	changeStatus: MemoryChangeStatus;

	analysis?: {
		relevant: boolean;
		relevanceScore: number;

		categories: string[];

		priority: MemoryPriority;

		summary: string;
		craImpact: string;

		interviewPoint?: string;
		reason: string;

		analyzedAt: string;
	};
}

export interface AgentMemorySourceSummary {
	source: MemorySource;

	total: number;

	newCount: number;
	changedCount: number;
	unchangedCount: number;

	relevantCount: number;

	lastSeenAt?: string;
}

export interface AgentMemorySnapshot {
	generatedAt: string;

	sources: AgentMemorySourceSummary[];

	items: AgentMemoryItem[];
}
