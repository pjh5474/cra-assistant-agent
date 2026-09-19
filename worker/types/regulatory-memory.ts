export type RegulatoryChangeStatus = "new" | "changed" | "unchanged";

export interface RegulatoryManifestRecord {
	source: "MFDS" | "ICH" | "KONECT";

	sourceId: string;

	title: string;

	url?: string;

	publishedAt?: string;

	contentHash: string;

	firstSeenAt: string;
	lastSeenAt: string;
	lastChangedAt: string;

	changeStatus: RegulatoryChangeStatus;

	storageKey?: string;
}

export interface RegulatoryManifestRow {
	source: "MFDS" | "ICH" | "KONECT";
	sourceId: string;
	title: string;
	url: string | null;
	publishedAt: string | null;
	contentHash: string;
	firstSeenAt: string;
	lastSeenAt: string;
	lastChangedAt: string;
	changeStatus: "new" | "changed" | "unchanged";
	storageKey: string | null;
}

export interface RegulatoryManifestInput {
	source: "MFDS" | "ICH" | "KONECT";

	sourceId: string;

	title: string;

	url?: string;

	publishedAt?: string;

	contentHash: string;
}

export interface RegulatoryManifestCheckResult {
	status: RegulatoryChangeStatus;

	current: RegulatoryManifestRecord;

	previous?: RegulatoryManifestRecord;
}

export interface RegulatoryManifestSummary {
	total: number;

	newCount: number;

	changedCount: number;

	unchangedCount: number;

	lastSeenAt?: string;
}

type SqlValue = string | number | boolean | null;

export type SqlExecutor = <T = Record<string, SqlValue>>(
	strings: TemplateStringsArray,
	...values: SqlValue[]
) => T[];
