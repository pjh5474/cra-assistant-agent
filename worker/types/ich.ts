import type { AnalyzedRegulatoryItem } from "./regulatory.ts";
import type { SourceWorkflowResult } from "./workflow.ts";

export type ICHTopic = "Quality" | "Safety" | "Efficacy" | "Multidisciplinary";

export type ICHMonitoringType = "guideline" | "implementation";

export type ICHChangeType =
	| "new-guideline"
	| "new-revision"
	| "step-changed"
	| "status-changed"
	| "date-changed"
	| "new-document"
	| "implementation-status-changed"
	| "implementation-date-changed"
	| "implementation-reference-changed";

/**
 * ICH Guideline Index에서 수집하는 정규화된 record.
 */
export interface ICHGuidelineRecord {
	code: string;
	// E6

	revision?: string;
	// R3

	displayCode: string;
	// E6(R3)

	title: string;

	topic: ICHTopic;

	step?: string;
	// Step 2 / Step 4

	status?: string;

	date?: string;

	guidelineUrl?: string;

	documentUrls: string[];

	implementations: ICHImplementationRecord[];

	collectedAt: string;
}

/**
 * ICH Guideline Implementation 표에서 수집하는 record.
 *
 * 초기에는 MFDS, Republic of Korea만 사용하지만
 * 타입 자체는 다른 Member도 표현할 수 있도록 둡니다.
 */
export interface ICHImplementationRecord {
	guidelineCode: string;
	// E6(R2)
	guidelineTitle: string;
	// Good Clinical Practice (GCP)
	member: string;
	status: string;
	implementationDate?: string;
	reference?: string;
	referenceUrl?: string;
	collectedAt: string;
}

/**
 * 특정 guideline의 이전 상태와 현재 상태를 비교한 결과.
 */
export interface ICHGuidelineChange {
	monitoringType: "guideline";
	guidelineCode: string;
	changeTypes: ICHChangeType[];
	previous?: ICHGuidelineRecord;
	current: ICHGuidelineRecord;
	detectedAt: string;
}

/**
 * Member별 implementation 상태 변경.
 */
export interface ICHImplementationChange {
	monitoringType: "implementation";
	guidelineCode: string;
	member: string;
	changeTypes: ICHChangeType[];
	previous?: ICHImplementationRecord;
	current: ICHImplementationRecord;
	detectedAt: string;
}

export interface ICHCollectionFailure {
	source: "ICH";
	target:
		| "guideline-index"
		| "implementation-index"
		| "guideline-page"
		| "document";

	url?: string;
	message: string;
}

/**
 * Guideline XLS Collector 결과.
 */
export interface ICHGuidelineCollectionResult {
	source: "ICH";
	collectedAt: string;
	totalFetched: number;
	totalReturned: number;
	guidelines: ICHGuidelineRecord[];
	failures: ICHCollectionFailure[];
}

/**
 * Implementation XLS Collector 결과.
 */
export interface ICHImplementationCollectionResult {
	source: "ICH";
	collectedAt: string;
	totalFetched: number;
	totalReturned: number;
	implementations: ICHImplementationRecord[];
	failures: ICHCollectionFailure[];
}

/**
 * 최종 ICH Agent → Workflow 반환 계약.
 */
export interface ICHWorkflowResult extends SourceWorkflowResult {
	source: "ICH";
	failures: ICHCollectionFailure[];
	items: AnalyzedRegulatoryItem[];
	guidelineChanges?: ICHGuidelineChange[];
	implementationChanges?: ICHImplementationChange[];
}

export interface ICHWorkflowInput {
	includeIrrelevant: boolean;
	member?: string;
	guidelinePrefixes?: string[];
	guidelineCodes?: string[];
	since?: string;
	until?: string;
}
