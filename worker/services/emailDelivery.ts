import type { EmailDraft } from "../../shared/types/email.ts";

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function buildEmailHtml(content: string): string {
	const escaped = escapeHtml(content);

	return `
		<div
			style="
				font-family: Arial, sans-serif;
				line-height: 1.6;
				white-space: pre-wrap;
				max-width: 800px;
				margin: 0 auto;
			"
		>${escaped}</div>
	`;
}

export async function sendEmail(env: Env, draft: EmailDraft) {
	return env.EMAIL.send({
		from: {
			email: "cra-assistant@warwarsn.online",
			name: "CRA Assistant",
		},

		to: draft.to,

		subject: draft.subject,

		text: draft.body,

		html: buildEmailHtml(draft.body),
	});
}
