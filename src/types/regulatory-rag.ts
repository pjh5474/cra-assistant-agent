export interface RegulatoryDocumentSummary {
	id: string;
	originalName: string;
	authority: "ICH" | "MFDS" | "KONECT" | "INTERNAL" | "OTHER";
	documentType:
		| "GCP"
		| "REGULATION"
		| "GUIDELINE"
		| "SOP"
		| "TRAINING"
		| "OTHER";

	title: string;
	version?: string | null;
	effectiveDate?: string | null;
	chunkCount: number;
	createdAt: number;
}

export interface RegulatoryDocumentListResponse {
	documents: RegulatoryDocumentSummary[];
}
