export type EmailDeliveryStatus = "sending" | "sent" | "failed" | "skipped";

export interface EmailDeliveryRecord {
	id: string;
	idempotencyKey: string;
	workflowId?: string;
	scheduleId?: string;
	recipient: string;
	subject: string;
	artifactPath?: string;
	status: EmailDeliveryStatus;
	error?: string;
	createdAt: string;
	sentAt?: string;
}

export class EmailDeliveryStore {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async startDelivery(input: {
		id: string;
		idempotencyKey: string;
		workflowId?: string;
		scheduleId?: string;
		recipient: string;
		subject: string;
		artifactPath?: string;
		createdAt: string;
	}): Promise<boolean> {
		try {
			await this.db
				.prepare(
					`
					INSERT INTO email_deliveries (
						id,
						idempotency_key,
						workflow_id,
						schedule_id,
						recipient,
						subject,
						artifact_path,
						status,
						created_at
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, 'sending', ?)
					`,
				)
				.bind(
					input.id,
					input.idempotencyKey,
					input.workflowId ?? null,
					input.scheduleId ?? null,
					input.recipient,
					input.subject,
					input.artifactPath ?? null,
					input.createdAt,
				)
				.run();

			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (message.includes("UNIQUE")) {
				return false;
			}

			throw error;
		}
	}

	async markSent(id: string, sentAt: string): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE email_deliveries
				SET
					status = 'sent',
					sent_at = ?
				WHERE id = ?
				`,
			)
			.bind(sentAt, id)
			.run();
	}

	async markFailed(id: string, error: string): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE email_deliveries
				SET
					status = 'failed',
					error = ?
				WHERE id = ?
				`,
			)
			.bind(error, id)
			.run();
	}

	async getByIdempotencyKey(
		idempotencyKey: string,
	): Promise<EmailDeliveryRecord | null> {
		const record = await this.db
			.prepare(
				`
                SELECT
                    id,
                    idempotency_key AS idempotencyKey,
                    workflow_id AS workflowId,
                    schedule_id AS scheduleId,
                    recipient,
                    subject,
                    artifact_path AS artifactPath,
                    status,
                    error,
                    created_at AS createdAt,
                    sent_at AS sentAt
                FROM email_deliveries
                WHERE idempotency_key = ?
                LIMIT 1
                `,
			)
			.bind(idempotencyKey)
			.first<EmailDeliveryRecord>();

		return record ?? null;
	}

	async retryFailedDelivery(id: string): Promise<void> {
		await this.db
			.prepare(
				`
                UPDATE email_deliveries
                SET
                    status = 'sending',
                    error = NULL,
                    sent_at = NULL
                WHERE id = ?
                  AND status = 'failed'
                `,
			)
			.bind(id)
			.run();
	}
}
