export const MAIN_TOOL_LABELS: Record<string, string> = {
	searchRegulatoryDocuments: "Regulatory RAG Search",
	searchRegulatoryMemory: "Regulatory Memory Search",
	listRecentRegulatoryChanges: "Recent Regulatory Changes",
	getRegulatoryAnalysis: "Regulatory Analysis Lookup",
};

export const EMAIL_APPROVAL_STORAGE_KEY =
	"cra-assistant:handled-email-approvals";

export const WORKFLOW_TOAST_STORAGE_KEY = "cra-assistant:toasted-workflows";

export const WORKFLOW_STEP_LABELS = {
	sourceProcessing: "Source Processing",
	synthesis: "Briefing Synthesis",
	reporting: "Briefing Generation",
	email: "Email Delivery",
} as const;

export const WORKFLOW_STAGE_LABELS: Record<string, string> = {
	idle: "Idle",
	initializing: "Initializing",
	sourceProcessing: "Source Processing",
	synthesizing: "Synthesizing",
	reporting: "Reporting",
	emailing: "Emailing",
	completed: "Completed",
	error: "Error",
};
