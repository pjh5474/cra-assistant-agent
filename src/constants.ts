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

export const MINUTES_PER_DAY = 24 * 60;

export const SCHEDULE_DAYS = [
	{ value: 0, label: "Sunday" },
	{ value: 1, label: "Monday" },
	{ value: 2, label: "Tuesday" },
	{ value: 3, label: "Wednesday" },
	{ value: 4, label: "Thursday" },
	{ value: 5, label: "Friday" },
	{ value: 6, label: "Saturday" },
] as const;
