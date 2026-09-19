export function stripJsonCodeFence(text: string): string {
	return text
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();
}
