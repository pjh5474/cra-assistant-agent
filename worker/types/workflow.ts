import type { BriefingCandidate } from "./regulatory-briefing.ts";
import type { AnalyzedRegulatoryItem } from "./regulatory.ts";

export type RegulatoryWorkflowStage =
	| "idle"
	| "initializing"
	| "sourceProcessing"
	| "synthesizing"
	| "enriching"
	| "awaitingApproval"
	| "reporting"
	| "emailing"
	| "completed"
	| "error";

export type WorkflowStepStatus =
	| "pending"
	| "running"
	| "completed"
	| "error"
	| "skipped";

export interface WorkflowStepState {
	status: WorkflowStepStatus;
	message?: string;
	progress?: number;
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

export interface SourceProcessingResult {
	source: "MFDS" | "ICH" | "KONECT";
	fetched: number;
	candidates: number;
	relevant: number;
	completedAt: string;
	items: {
		id: string;
		title: string;
		url: string;
		publishedAt?: string;
		categories: string[];
		priority: "high" | "medium" | "low";
		summary: string;
		craImpact: string;
		interviewPoint?: string;
	}[];

	warnings?: string[];
}

export interface RegulatoryBriefing {
	title: string;
	period: {
		since: string;
		until?: string;
	};
	generatedAt: string;
	summary: string;
	stats: {
		sourcesProcessed: number;
		totalFetched: number;
		totalCandidates: number;
		totalRelevant: number;
		mainItems: number;
		referenceItems: number;
		highPriority: number;
		mediumPriority: number;
		lowPriority: number;
	};

	sources: SourceProcessingResult[];

	categories: {
		category: string;
		count: number;
	}[];

	highlights: {
		id: string;
		title: string;
		source: string;
		priority: "high" | "medium" | "low";
		categories: string[];
		summary: string;
		craImpact: string;
		interviewPoint?: string;
		url?: string;
		publishedAt?: string;
		relevanceScore: number;
	}[];

	references: {
		id: string;
		title: string;
		source: string;
		priority: "high" | "medium" | "low";
		categories: string[];
		summary: string;
		url?: string;
		publishedAt?: string;
		changeStatus: "new" | "changed" | "unchanged";
		fromCache: boolean;
	}[];
}

export interface RegulatoryWorkflowState {
	workflowId?: string;
	stage: RegulatoryWorkflowStage;
	progress: number;
	startedAt?: string;
	completedAt?: string;
	sources: {
		mfds?: SourceProcessingResult;
		ich?: SourceProcessingResult;
		konect?: SourceProcessingResult;
	};

	steps: {
		sourceProcessing: WorkflowStepState;
		synthesis: WorkflowStepState;
		enrichment: WorkflowStepState;
		approval: WorkflowStepState;
		reporting: WorkflowStepState;
		email: WorkflowStepState;
	};

	briefing?: RegulatoryBriefing;
	error?: string;
}

export interface RegulatoryBriefingParams {
	since: string;
	until?: string;
	sources: Array<"MFDS" | "ICH" | "KONECT">;
	purpose: "weekly-briefing" | "regulatory-check" | "cra-learning";
	includeRag: boolean;
	requireApproval: boolean;
	sendEmail: boolean;
}

export interface RegulatoryWorkflowProgress {
	stage: RegulatoryWorkflowStage;
	step:
		| "sourceProcessing"
		| "synthesis"
		| "enrichment"
		| "approval"
		| "reporting"
		| "email";

	percent: number;
	message: string;
}

export interface StartRegulatoryBriefingInput {
	since: string;
	until?: string;
	sources?: Array<"MFDS" | "ICH" | "KONECT">;
	purpose?: "weekly-briefing" | "regulatory-check" | "cra-learning";
	includeRag?: boolean;
	requireApproval?: boolean;
	sendEmail?: boolean;
}

export interface MFDSWorkflowInput {
	since: string;
	until?: string;
	includeIrrelevant?: boolean;
}

export interface SourceWorkflowResult {
	source: "MFDS" | "ICH" | "KONECT";
	collectedAt: string;
	totalFetched: number;
	candidateCount: number;
	relevantCount: number;
	items: AnalyzedRegulatoryItem[];
	warnings: string[];
	manifest: {
		newCount: number;
		changedCount: number;
		unchangedCount: number;
	};
	analysisCache: {
		analyzedCount: number;
		reusedCount: number;
		reusedRelevantCount: number;
	};
	briefingCandidates?: BriefingCandidate[];
}
