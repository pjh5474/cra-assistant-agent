export function cleanText(value?: string): string {
	return (
		value
			?.replace(/\u00a0/g, " ")
			.replace(/\s+/g, " ")
			.trim() ?? ""
	);
}
