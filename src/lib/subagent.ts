import type { SubagentStatus } from "@/types/agent";

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
