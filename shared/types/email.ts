export interface EmailDraft {
	to: string[];
	subject: string;
	body: string;

	sourceArtifact?: {
		path: string;
	};

	createdAt: string;
}

export interface EmailApprovalRequest {
	id: string;
	status: "pending" | "approved" | "cancelled" | "sent" | "failed";

	draft: EmailDraft;

	createdAt: string;
	sentAt?: string;
	error?: string;
}
