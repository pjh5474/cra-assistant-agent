export function weeklyToCron(day: number, time: string): string {
	const [hourText, minuteText] = time.split(":");

	const hour = Number(hourText);
	const minute = Number(minuteText);

	return `${minute} ${hour} * * ${day}`;
}
