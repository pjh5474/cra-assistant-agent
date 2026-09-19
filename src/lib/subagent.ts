import type {
	RegulatoryAgentSource,
	SubagentActivity,
	SubagentStatus,
} from "@/types/agent";
import type { AgentToolRunState } from "agents";

export function formatTime(value?: string) {
	if (!value) {
		return "-";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "-";
	}

	return new Intl.DateTimeFormat("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

export function statusLabel(status?: SubagentStatus) {
	switch (status) {
		case "running":
			return "Running";
		case "completed":
			return "Completed";
		case "error":
			return "Error";
		default:
			return "Idle";
	}
}

export function getSubagentInfo(agentType: string): {
	source: RegulatoryAgentSource;
	displayName: string;
} {
	switch (agentType) {
		case "MFDSRegulatoryAgent":
			return {
				source: "MFDS",
				displayName: "MFDS Regulatory Agent",
			};

		case "ICHRegulatoryAgent":
			return {
				source: "ICH",
				displayName: "ICH Regulatory Agent",
			};

		case "KONECTRegulatoryAgent":
			return {
				source: "KONECT",
				displayName: "KoNECT Regulatory Agent",
			};

		default:
			return {
				source: "UNKNOWN",
				displayName: agentType,
			};
	}
}

export function activityFromRun(
	run: AgentToolRunState | undefined,
): SubagentActivity | undefined {
	if (!run) {
		return undefined;
	}

	let status: SubagentStatus;

	switch (run.status) {
		case "running":
			status = "running";
			break;

		case "completed":
			status = "completed";
			break;

		case "error":
		case "aborted":
		case "interrupted":
			status = "error";
			break;

		default:
			status = "idle";
	}

	const agentInfo = getSubagentInfo(run.agentType);

	return {
		source: agentInfo.source,
		displayName: agentInfo.displayName,
		status,
		phase: run.progress?.phase,
		message: run.progress?.message,
		progress: run.status === "completed" ? 1 : run.progress?.fraction,
		runId: run.runId,
		updatedAt: new Date().toISOString(),
	};
}

export function normalizeChatActivity<
	T extends {
		status?: string;
		progress?: number;
		message?: string;
	},
>(
	activity: T | undefined,
	isBusy: boolean,
	wasStopped: boolean,
): T | undefined {
	if (!activity) {
		return undefined;
	}

	if (!isBusy && activity.status === "running") {
		return {
			...activity,
			status: wasStopped ? "aborted" : "idle",

			message: wasStopped ? "Aborted by user" : undefined,
		};
	}

	return activity;
}
