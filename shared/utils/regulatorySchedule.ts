export function weeklyToCron(day: number, time: string): string {
	const [hourText, minuteText] = time.split(":");

	const kstHour = Number(hourText);

	const minute = Number(minuteText);

	let utcHour = kstHour - 9;

	let utcDay = day;

	if (utcHour < 0) {
		utcHour += 24;
		utcDay = (day + 6) % 7;
	}

	return `${minute} ${utcHour} * * ${utcDay}`;
}
