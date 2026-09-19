import type { RegulatoryItem } from "./regulatory.ts";
import type { SourceWorkflowResult } from "./workflow.ts";

/**
 * MFDS RSS 종류
 *
 * MFDS 공식 RSS 목록:
 * https://www.mfds.go.kr/www/rss/list.do
 */

export interface MFDSFeed {
	type: MFDSFeedType;
	title: string;
	sourceType: RegulatoryItem["sourceType"];
	url: string;
}

export interface MFDSCollectionFailure {
	source: "MFDS";
	feedType: MFDSFeedType;
	feedTitle: string;
	message: string;
}

export interface MFDSCollectionResult {
	source: "MFDS";
	collectedAt: string;
	totalFetched: number;
	totalReturned: number;
	items: RegulatoryItem[];
	failures: MFDSCollectionFailure[];
}

export type MFDSFeedType =
	| "recent-law"
	| "official-notice"
	| "law-revision"
	| "safety-letter"
	| "civil-guidance"
	| "guideline"
	| "law";

export interface MFDSCollectionFailure {
	source: "MFDS";
	feedType: MFDSFeedType;
	feedTitle: string;
	message: string;
}

export interface MFDSWorkflowResult extends SourceWorkflowResult {
	source: "MFDS";
	failures: MFDSCollectionFailure[];

	manifest?: {
		newCount: number;
		changedCount: number;
		unchangedCount: number;
	};
}
