export function formatScheduleTimeKst(unixSeconds: number): string {
	return new Intl.DateTimeFormat("ko-KR", {
		timeZone: "Asia/Seoul",
		year: "numeric",
		month: "long",
		day: "numeric",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	}).format(new Date(unixSeconds * 1000));
}
