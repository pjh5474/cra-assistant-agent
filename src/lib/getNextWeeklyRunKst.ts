export function getNextWeeklyRunKst(
	dayOfWeek: number,
	localTime: string,
): Date {
	const now = new Date();

	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Seoul",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);

	const getPart = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);

	const year = getPart("year");

	const month = getPart("month");

	const date = getPart("day");

	const [hour, minute] = localTime.split(":").map(Number);

	// 오늘 날짜를 기준으로 현재 KST 요일 계산
	const currentKstDay = new Date(Date.UTC(year, month - 1, date)).getUTCDay();

	let daysUntil = (dayOfWeek - currentKstDay + 7) % 7;

	// 요청한 KST wall-clock을
	// 실제 UTC instant로 변환
	let candidate = new Date(
		Date.UTC(year, month - 1, date + daysUntil, hour - 9, minute, 0, 0),
	);

	// 오늘 같은 요일인데 이미 시간이 지났다면 다음 주
	if (daysUntil === 0 && candidate.getTime() <= now.getTime()) {
		candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
	}

	return candidate;
}
