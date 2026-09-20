export interface ScheduledRunRecord {
	id: string;
	runKey: string;
	scheduleId: string;
	workflowId?: string;
	status: "running" | "completed" | "failed" | "skipped";
	startedAt: string;
	completedAt?: string;
	artifactPath?: string;
	emailStatus?: string;
	emailRecipient?: string;
	error?: string;
}

export class ScheduledRunHistoryStore {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async startRun(input: {
		id: string;
		runKey: string;
		scheduleId: string;
		scheduledFor: string;
		startedAt: string;
	}): Promise<boolean> {
		try {
			await this.db
				.prepare(
					`
                    INSERT INTO scheduled_runs (
                        id,
                        run_key,
                        schedule_id,
                        scheduled_for,
                        status,
                        started_at,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, 'running', ?, ?)
                    `,
				)
				.bind(
					input.id,
					input.runKey,
					input.scheduleId,
					input.scheduledFor,
					input.startedAt,
					input.startedAt,
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

	async completeRunByWorkflowId(input: {
		workflowId: string;
		completedAt: string;
		artifactPath?: string;
		emailStatus?: string;
		emailRecipient?: string;
	}): Promise<void> {
		await this.db
			.prepare(
				`
                UPDATE scheduled_runs
                SET
                    status = 'completed',
                    completed_at = ?,
                    artifact_path = ?,
                    email_status = ?,
                    email_recipient = ?
                WHERE workflow_id = ?
                `,
			)
			.bind(
				input.completedAt,
				input.artifactPath ?? null,
				input.emailStatus ?? null,
				input.emailRecipient ?? null,
				input.workflowId,
			)
			.run();
	}

	async failRunByWorkflowId(input: {
		workflowId: string;
		completedAt: string;
		error: string;
	}): Promise<void> {
		await this.db
			.prepare(
				`
                UPDATE scheduled_runs
                SET
                    status = 'failed',
                    completed_at = ?,
                    error = ?
                WHERE workflow_id = ?
                `,
			)
			.bind(input.completedAt, input.error, input.workflowId)
			.run();
	}

	async getRunsByScheduleId(
		scheduleId: string,
		limit = 20,
	): Promise<ScheduledRunRecord[]> {
		const result = await this.db
			.prepare(
				`
                    SELECT
                        id,
                        run_key AS runKey,
                        schedule_id AS scheduleId,
                        scheduled_for AS scheduledFor,
                        workflow_id AS workflowId,
                        status,
                        started_at AS startedAt,
                        completed_at AS completedAt,
                        artifact_path AS artifactPath,
                        email_status AS emailStatus,
                        email_recipient AS emailRecipient,
                        error
                    FROM scheduled_runs
                    WHERE schedule_id = ?
                    ORDER BY started_at DESC
                    LIMIT ?
                    `,
			)
			.bind(scheduleId, limit)
			.all<ScheduledRunRecord>();

		return result.results;
	}

	async attachWorkflowId(id: string, workflowId: string): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE scheduled_runs
				SET workflow_id = ?
				WHERE id = ?
				`,
			)
			.bind(workflowId, id)
			.run();
	}

	async completeRun(input: {
		id: string;
		completedAt: string;
		artifactPath?: string;
		emailStatus?: string;
		emailRecipient?: string;
	}): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE scheduled_runs
				SET
					status = 'completed',
					completed_at = ?,
					artifact_path = ?,
					email_status = ?,
					email_recipient = ?
				WHERE id = ?
				`,
			)
			.bind(
				input.completedAt,
				input.artifactPath ?? null,
				input.emailStatus ?? null,
				input.emailRecipient ?? null,
				input.id,
			)
			.run();
	}

	async failRun(input: {
		id: string;
		completedAt: string;
		error: string;
	}): Promise<void> {
		await this.db
			.prepare(
				`
				UPDATE scheduled_runs
				SET
					status = 'failed',
					completed_at = ?,
					error = ?
				WHERE id = ?
				`,
			)
			.bind(input.completedAt, input.error, input.id)
			.run();
	}

	async getRecentRuns(limit = 20): Promise<ScheduledRunRecord[]> {
		const result = await this.db
			.prepare(
				`
					SELECT
						id,
						run_key AS runKey,
						schedule_id AS scheduleId,
						workflow_id AS workflowId,
						status,
						started_at AS startedAt,
						completed_at AS completedAt,
						artifact_path AS artifactPath,
						email_status AS emailStatus,
						email_recipient AS emailRecipient,
						error
					FROM scheduled_runs
					ORDER BY started_at DESC
					LIMIT ?
					`,
			)
			.bind(limit)
			.all<ScheduledRunRecord>();

		return result.results;
	}
}
