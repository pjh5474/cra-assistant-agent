import type { SourceWorkflowResult } from "./workflow.ts";
import type { AnalyzedRegulatoryItem } from "./regulatory.ts";

export interface KoNECTWorkflowResult extends SourceWorkflowResult {
	source: "KONECT";
}

export type KoNECTNoticeType = "general" | "education" | "certification";

export interface KoNECTNoticeItem {
	id: string;
	type: KoNECTNoticeType;
	title: string;
	publishedAt?: string;
	author?: string;
	views?: number;
	url: string;
	collectedAt: string;
}

export interface KoNECTCourseItem {
	id: string;
	title: string;
	category: string;
	level?: string;
	courseType?: string;
	applicationStart?: string;
	applicationEnd?: string;
	courseStart?: string;
	courseEnd?: string;
	durationDays?: number;
	durationHours?: number;
	capacity?: number;
	price?: number;
	status?: KoNECTCourseStatus;
	statusClass?: string;
	url: string;
	collectedAt: string;
}

export interface KoNECTCollectionFailure {
	source: "KONECT";

	target:
		| "notice-general"
		| "notice-education"
		| "notice-certification"
		| "cra-course";

	url?: string;

	message: string;
}

export interface KoNECTCollectionResult {
	source: "KONECT";
	collectedAt: string;
	notices: KoNECTNoticeItem[];
	courses: KoNECTCourseItem[];
	totalFetched: number;
	totalReturned: number;
	failures: KoNECTCollectionFailure[];
}

export interface KoNECTWorkflowInput {
	since?: string;
	until?: string;
	includeCourses?: boolean;
	includeNoticeTypes?: KoNECTNoticeType[];
	includeIrrelevant?: boolean;
}

export interface KoNECTWorkflowResult extends SourceWorkflowResult {
	source: "KONECT";
	failures: KoNECTCollectionFailure[];
	items: AnalyzedRegulatoryItem[];
}

export type KoNECTCourseStatus =
	| "접수준비중"
	| "교육신청"
	| "교육대기"
	| "교육중"
	| "교육종료"
	| string;
