export type WorkflowRunParams = {
	since: string;
	until?: string;

	sources: ("MFDS" | "ICH" | "KONECT")[];
	sendEmail: boolean;
	emailRecipient?: string;
};
