export type WorkflowRunParams = {
	since: string;
	until?: string;

	sources: ("MFDS" | "ICH" | "KONECT")[];

	includeRag: boolean;
	requireApproval: boolean;
	sendEmail: boolean;
};
