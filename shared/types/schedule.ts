export interface RegulatorySchedulePayload {
	sources: Array<"MFDS" | "ICH" | "KONECT">;

	purpose: "weekly-briefing" | "regulatory-check" | "cra-learning";

	sendEmail: boolean;
	emailRecipient?: string;

	timezone: string;
}

export interface RegulatorySchedule {
	id: string;

	type: "cron" | "scheduled" | "delayed" | "interval";

	time: number;

	cron?: string;

	payload: RegulatorySchedulePayload;
}

export type RegulatoryScheduleSource = "MFDS" | "ICH" | "KONECT";

export interface RegulatorySchedulePayload {
	sources: RegulatoryScheduleSource[];

	purpose: "weekly-briefing" | "regulatory-check" | "cra-learning";

	sendEmail: boolean;
	emailRecipient?: string;

	timezone: string;
}

export interface RegulatoryScheduleItem {
	id: string;
	callback: string;
	payload: RegulatorySchedulePayload;

	time: number;

	type: "cron" | "scheduled" | "delayed" | "interval";

	cron?: string;
}
