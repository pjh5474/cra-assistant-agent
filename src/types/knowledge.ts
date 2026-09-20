export type MetadataPreviewResponse = {
	metadata?: {
		title?: string;
		authority?: string;
		documentType?: string;
		version?: string;
		effectiveDate?: string;
	};
	error?: string;
};

export type UploadResponse = {
	status?: "ingested" | "already_exists";
	documentId?: string;
	originalName?: string;
	chunkCount?: number;
	error?: string;
};

export type DeleteResponse = {
	status?: "deleted" | "not_found";
	documentId?: string;
	deletedChunks?: number;
	error?: string;
};
