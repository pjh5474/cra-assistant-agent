export type RegulatorySource = "MFDS" | "ICH" | "KONECT";

export interface SubagentActivity {
	source: RegulatorySource;
	displayName: string;

	status: "idle" | "running" | "completed" | "error";

	phase?: string;
	message?: string;
	progress?: number;
	runId?: string;

	updatedAt: string;
}
