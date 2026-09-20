import type { EmailDraft } from "../../shared/types/email.ts";

import { EmailDeliveryStore } from "../stores/EmailDeliveryStore.ts";

export interface SendEmailOptions {
	/**
	 * 동일 작업의 중복 발송을 막아야 할 경우
	 * 호출자가 안정적인 key를 전달합니다.
	 *
	 * 전달하지 않으면 매 호출을 새로운 명시적 발송으로 취급합니다.
	 */
	idempotencyKey?: string;

	workflowId?: string;
	scheduleId?: string;
}

export type SendEmailResult =
	| {
			status: "sent";
			deliveryId: string;
			sentAt: string;
			result: unknown;
	  }
	| {
			status: "skipped";
			deliveryId: string;
			reason: "duplicate";
	  };

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

export async function sendEmail(
	env: Env,
	draft: EmailDraft,
	options: SendEmailOptions = {},
): Promise<SendEmailResult> {
	const store = new EmailDeliveryStore(env.HISTORY_DB);

	const deliveryId = crypto.randomUUID();

	/*
	 * 명시적인 idempotency key가 없으면
	 * 매 발송 요청을 독립적인 사용자 요청으로 취급합니다.
	 *
	 * 따라서 Chat/Workspace에서 같은 메일을
	 * 사용자가 의도적으로 다시 보내는 것도 가능합니다.
	 */
	const idempotencyKey = options.idempotencyKey ?? `manual:${deliveryId}`;

	const createdAt = new Date().toISOString();

	/*
	 * 현재 email_deliveries.recipient가 TEXT 하나이므로
	 * 여러 recipient는 하나의 delivery record 안에 저장합니다.
	 */
	const recipient = [...draft.to].sort().join(", ");

	const started = await store.startDelivery({
		id: deliveryId,
		idempotencyKey,
		workflowId: options.workflowId,
		scheduleId: options.scheduleId,
		recipient,
		subject: draft.subject,
		artifactPath: draft.sourceArtifact?.path,
		createdAt,
	});

	let activeDeliveryId: string = deliveryId;

	if (!started) {
		const existing = await store.getByIdempotencyKey(idempotencyKey);

		if (!existing) {
			throw new Error(
				"Duplicate email delivery was detected, but the existing delivery record could not be loaded.",
			);
		}

		/*
		 * 이미 발송되었거나 현재 발송 중이면
		 * 실제 이메일 API를 다시 호출하지 않습니다.
		 */
		if (existing.status === "sent" || existing.status === "sending") {
			console.warn("[Email] duplicate delivery skipped", {
				idempotencyKey,
				deliveryId: existing.id,
				status: existing.status,
			});

			return {
				status: "skipped",
				deliveryId: existing.id,
				reason: "duplicate",
			};
		}

		/*
		 * 이전 시도가 failed였다면
		 * 동일 record를 재사용해서 재시도합니다.
		 */
		if (existing.status === "failed") {
			await store.retryFailedDelivery(existing.id);

			activeDeliveryId = existing.id;
		} else {
			return {
				status: "skipped",
				deliveryId: existing.id,
				reason: "duplicate",
			};
		}
	}

	try {
		const result = await env.EMAIL.send({
			from: {
				email: "cra-assistant@warwarsn.online",
				name: "CRA Assistant",
			},
			to: draft.to,
			subject: draft.subject,
			text: draft.body,
			html: buildEmailHtml(draft.body),
		});

		const sentAt = new Date().toISOString();

		await store.markSent(activeDeliveryId, sentAt);

		console.log("[Email] sent", {
			deliveryId: activeDeliveryId,
			idempotencyKey,
			to: draft.to,
			subject: draft.subject,
			workflowId: options.workflowId,
			scheduleId: options.scheduleId,
		});

		return {
			status: "sent",
			deliveryId: activeDeliveryId,
			sentAt,
			result,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Email sending failed";

		await store.markFailed(activeDeliveryId, message);

		console.error("[Email] send failed", {
			deliveryId: activeDeliveryId,
			idempotencyKey,
			error,
		});

		throw error;
	}
}
