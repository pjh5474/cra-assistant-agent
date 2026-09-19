import type {
	RegulatoryManifestCheckResult,
	RegulatoryManifestInput,
	RegulatoryManifestRecord,
	RegulatoryManifestRow,
	SqlExecutor,
} from "../types/regulatory-memory.ts";

export class RegulatoryManifestStore {
	private readonly sql: SqlExecutor;

	constructor(sql: SqlExecutor) {
		this.sql = sql;
	}

	get(source: string, sourceId: string): RegulatoryManifestRecord | undefined {
		const rows = this.sql<RegulatoryManifestRow>`
          SELECT
            source,
            source_id AS sourceId,
            title,
            url,
            published_at AS publishedAt,
            content_hash AS contentHash,
            first_seen_at AS firstSeenAt,
            last_seen_at AS lastSeenAt,
            last_changed_at AS lastChangedAt,
            change_status AS changeStatus,
            storage_key AS storageKey
          FROM regulatory_manifest
          WHERE
            source = ${source}
            AND source_id = ${sourceId}
          LIMIT 1
        `;

		const row = rows[0];

		if (!row) {
			return undefined;
		}

		return {
			...row,
			url: row.url ?? undefined,
			publishedAt: row.publishedAt ?? undefined,
			storageKey: row.storageKey ?? undefined,
		};
	}

	checkAndUpsert(
		input: RegulatoryManifestInput,
	): RegulatoryManifestCheckResult {
		const now = new Date().toISOString();

		const previous = this.get(input.source, input.sourceId);

		if (!previous) {
			this.sql`
            INSERT INTO regulatory_manifest (
              source,
              source_id,
              title,
              url,
              published_at,
              content_hash,
              first_seen_at,
              last_seen_at,
              last_changed_at,
              change_status,
              storage_key
            )
            VALUES (
              ${input.source},
              ${input.sourceId},
              ${input.title},
              ${input.url ?? null},
              ${input.publishedAt ?? null},
              ${input.contentHash},
              ${now},
              ${now},
              ${now},
              ${"new"},
              ${null}
            )
          `;

			const current = this.get(input.source, input.sourceId);

			if (!current) {
				throw new Error(
					`Failed to insert regulatory manifest item: ${input.source}:${input.sourceId}`,
				);
			}

			return {
				status: "new",
				current,
			};
		}

		if (previous.contentHash === input.contentHash) {
			this.sql`
            UPDATE regulatory_manifest
            SET
              last_seen_at = ${now},
              change_status = ${"unchanged"}
            WHERE
              source = ${input.source}
              AND source_id = ${input.sourceId}
          `;

			const current = this.get(input.source, input.sourceId);

			if (!current) {
				throw new Error(
					`Failed to update regulatory manifest item: ${input.source}:${input.sourceId}`,
				);
			}

			return {
				status: "unchanged",
				previous,
				current,
			};
		}

		this.sql`
          UPDATE regulatory_manifest
          SET
            title = ${input.title},
            url = ${input.url ?? null},
            published_at = ${input.publishedAt ?? null},
            content_hash = ${input.contentHash},
            last_seen_at = ${now},
            last_changed_at = ${now},
            change_status = ${"changed"}
          WHERE
            source = ${input.source}
            AND source_id = ${input.sourceId}
        `;

		const current = this.get(input.source, input.sourceId);

		if (!current) {
			throw new Error(
				`Failed to update changed regulatory manifest item: ${input.source}:${input.sourceId}`,
			);
		}

		return {
			status: "changed",
			previous,
			current,
		};
	}
}
