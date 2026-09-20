function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

export function buildEmailHtml(content: string): string {
	const escaped = escapeHtml(content);
	return `
		<div
			style="
				font-family:
					Arial,
					sans-serif;
				line-height: 1.6;
				white-space: pre-wrap;
				max-width: 800px;
				margin: 0 auto;
			"
		>${escaped}</div>
	`;
}
