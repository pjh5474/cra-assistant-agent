import { MAX_RANGE_DAYS } from "../constants.ts";

export function validateDateRange(since?: string, until?: string) {
	if (!since || !until) {
		return;
	}

	const start = new Date(since);

	const end = new Date(until);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		throw new Error("Invalid MFDS date range.");
	}

	if (end.getTime() < start.getTime()) {
		throw new Error("MFDS date range is invalid: until is earlier than since.");
	}

	const rangeDays = (end.getTime() - start.getTime()) / 86_400_000;

	if (rangeDays > MAX_RANGE_DAYS) {
		throw new Error(
			`MFDS live lookup range is too broad (${Math.ceil(rangeDays)} days). ` +
				`Maximum allowed range is ${MAX_RANGE_DAYS} days. ` +
				`For recent/current checks, prefer 15 days or less.`,
		);
	}
}
