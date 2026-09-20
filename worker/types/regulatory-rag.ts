export type RegulatoryDocumentAuthority =
	| "ICH"
	| "MFDS"
	| "KONECT"
	| "INTERNAL"
	| "OTHER";

export type RegulatoryDocumentType =
	| "GCP"
	| "REGULATION"
	| "GUIDELINE"
	| "SOP"
	| "TRAINING"
	| "OTHER";

export interface RegulatoryDocumentMetadata {
	authority: RegulatoryDocumentAuthority;

	documentType: RegulatoryDocumentType;

	title: string;

	version?: string;

	effectiveDate?: string;
}

export interface RegulatoryDocument {
	id: string;

	originalName: string;

	authority: RegulatoryDocumentAuthority;

	documentType: RegulatoryDocumentType;

	title: string;

	version?: string;

	effectiveDate?: string;

	contentHash: string;

	chunkCount: number;

	createdAt: number;
}

export interface RegulatoryChunk {
	id: string;

	documentId: string;

	chunkIndex: number;

	heading?: string;

	text: string;
}

export interface RegulatoryRAGIngestResult {
	status: "ingested" | "already_exists";

	documentId: string;

	originalName: string;

	chunkCount: number;
}

export interface RegulatoryRAGSearchResult {
	chunkId: string;

	documentId: string;

	score: number;

	text: string;

	chunkIndex: number;

	heading?: string;

	document: {
		title: string;

		originalName: string;

		authority: RegulatoryDocumentAuthority;

		documentType: RegulatoryDocumentType;

		version?: string;

		effectiveDate?: string;
	};
}
