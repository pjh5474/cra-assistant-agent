import type {
	AgentMemoryItem,
	AgentMemorySource,
	AgentMemorySourceSnapshot,
} from "../types/agent-memory.ts";
import type { SqlExecutor } from "../types/regulatory-memory.ts";

interface RegulatoryMemoryRow {
	source: "MFDS" | "ICH" | "KONECT";
	sourceId: string;
	title: string;
	url: string | null;
	publishedAt: string | null;
	contentHash: string;
	firstSeenAt: string;
	lastSeenAt: string;
	lastChangedAt: string;
	changeStatus: "new" | "changed" | "unchanged";
	relevant: number | null;
	relevanceScore: number | null;
	categories: string | null;
	priority: "high" | "medium" | "low" | null;
	summary: string | null;
	craImpact: string | null;
	interviewPoint: string | null;
	reason: string | null;
	analyzedAt: string | null;
}

export class RegulatoryMemoryStore {
	private readonly sql: SqlExecutor;
	constructor(sql: SqlExecutor) {
		this.sql = sql;
	}

	getSnapshot(source: AgentMemorySource): AgentMemorySourceSnapshot {
		const rows = this.sql<RegulatoryMemoryRow>`
          SELECT
            m.source AS source,
            m.source_id AS sourceId,
  
            m.title AS title,
  
            m.url AS url,
            m.published_at AS publishedAt,
  
            m.content_hash AS contentHash,
  
            m.first_seen_at AS firstSeenAt,
            m.last_seen_at AS lastSeenAt,
            m.last_changed_at AS lastChangedAt,
  
            m.change_status AS changeStatus,
  
            a.relevant AS relevant,
            a.relevance_score AS relevanceScore,
  
            a.categories AS categories,
            a.priority AS priority,
  
            a.summary AS summary,
            a.cra_impact AS craImpact,
            a.interview_point AS interviewPoint,
            a.reason AS reason,
  
            a.analyzed_at AS analyzedAt
  
          FROM regulatory_manifest m
  
          LEFT JOIN regulatory_analysis a
            ON a.source =
              m.source
  
            AND a.source_id =
              m.source_id
  
            AND a.content_hash =
              m.content_hash
  
          WHERE
            m.source = ${source}
  
          ORDER BY
            m.last_seen_at DESC
        `;

		const items = rows.map((row) => this.rowToItem(row));

		return {
			source,

			generatedAt: new Date().toISOString(),

			summary: {
				source,

				total: items.length,

				newCount: items.filter((item) => item.changeStatus === "new").length,

				changedCount: items.filter((item) => item.changeStatus === "changed")
					.length,

				unchangedCount: items.filter(
					(item) => item.changeStatus === "unchanged",
				).length,

				relevantCount: items.filter((item) => item.analysis?.relevant === true)
					.length,

				lastSeenAt: items[0]?.lastSeenAt,
			},

			items,
		};
	}

	getItem(
		source: AgentMemorySource,
		sourceId: string,
	): AgentMemoryItem | undefined {
		const rows = this.sql<RegulatoryMemoryRow>`
			SELECT
			  m.source AS source,
			  m.source_id AS sourceId,
	  
			  m.title AS title,
	  
			  m.url AS url,
			  m.published_at AS publishedAt,
	  
			  m.content_hash AS contentHash,
	  
			  m.first_seen_at AS firstSeenAt,
			  m.last_seen_at AS lastSeenAt,
			  m.last_changed_at AS lastChangedAt,
	  
			  m.change_status AS changeStatus,
	  
			  a.relevant AS relevant,
			  a.relevance_score AS relevanceScore,
	  
			  a.categories AS categories,
			  a.priority AS priority,
	  
			  a.summary AS summary,
			  a.cra_impact AS craImpact,
			  a.interview_point AS interviewPoint,
			  a.reason AS reason,
	  
			  a.analyzed_at AS analyzedAt
	  
			FROM regulatory_manifest m
	  
			LEFT JOIN regulatory_analysis a
			  ON a.source = m.source
			  AND a.source_id = m.source_id
			  AND a.content_hash = m.content_hash
	  
			WHERE
			  m.source = ${source}
			  AND m.source_id = ${sourceId}
	  
			LIMIT 1
		  `;

		const row = rows[0];

		if (!row) {
			return undefined;
		}

		return this.rowToItem(row);
	}

	listRecentChanges(source?: AgentMemorySource, limit = 20): AgentMemoryItem[] {
		const safeLimit = Math.max(1, Math.min(limit, 100));

		const rows = source
			? this.sql<RegulatoryMemoryRow>`
				SELECT
				  m.source AS source,
				  m.source_id AS sourceId,
				  m.title AS title,
				  m.url AS url,
				  m.published_at AS publishedAt,
				  m.content_hash AS contentHash,
				  m.first_seen_at AS firstSeenAt,
				  m.last_seen_at AS lastSeenAt,
				  m.last_changed_at AS lastChangedAt,
				  m.change_status AS changeStatus,
	  
				  a.relevant AS relevant,
				  a.relevance_score AS relevanceScore,
				  a.categories AS categories,
				  a.priority AS priority,
				  a.summary AS summary,
				  a.cra_impact AS craImpact,
				  a.interview_point AS interviewPoint,
				  a.reason AS reason,
				  a.analyzed_at AS analyzedAt
	  
				FROM regulatory_manifest m
	  
				LEFT JOIN regulatory_analysis a
				  ON a.source = m.source
				  AND a.source_id = m.source_id
				  AND a.content_hash = m.content_hash
	  
				WHERE
				  m.source = ${source}
				  AND m.change_status IN ('new', 'changed')
	  
				ORDER BY
				  m.last_changed_at DESC
	  
				LIMIT ${safeLimit}
			  `
			: this.sql<RegulatoryMemoryRow>`
				SELECT
				  m.source AS source,
				  m.source_id AS sourceId,
				  m.title AS title,
				  m.url AS url,
				  m.published_at AS publishedAt,
				  m.content_hash AS contentHash,
				  m.first_seen_at AS firstSeenAt,
				  m.last_seen_at AS lastSeenAt,
				  m.last_changed_at AS lastChangedAt,
				  m.change_status AS changeStatus,
	  
				  a.relevant AS relevant,
				  a.relevance_score AS relevanceScore,
				  a.categories AS categories,
				  a.priority AS priority,
				  a.summary AS summary,
				  a.cra_impact AS craImpact,
				  a.interview_point AS interviewPoint,
				  a.reason AS reason,
				  a.analyzed_at AS analyzedAt
	  
				FROM regulatory_manifest m
	  
				LEFT JOIN regulatory_analysis a
				  ON a.source = m.source
				  AND a.source_id = m.source_id
				  AND a.content_hash = m.content_hash
	  
				WHERE
				  m.change_status IN ('new', 'changed')
	  
				ORDER BY
				  m.last_changed_at DESC
	  
				LIMIT ${safeLimit}
			  `;

		return rows.map((row) => this.rowToItem(row));
	}

	search(
		query: string,
		source?: AgentMemorySource,
		limit = 20,
	): AgentMemoryItem[] {
		const normalizedQuery = query.trim();

		if (!normalizedQuery) {
			return [];
		}

		const safeLimit = Math.max(1, Math.min(limit, 100));

		const pattern = `%${normalizedQuery}%`;

		const rows = source
			? this.sql<RegulatoryMemoryRow>`
				SELECT
				  m.source AS source,
				  m.source_id AS sourceId,
				  m.title AS title,
				  m.url AS url,
				  m.published_at AS publishedAt,
				  m.content_hash AS contentHash,
				  m.first_seen_at AS firstSeenAt,
				  m.last_seen_at AS lastSeenAt,
				  m.last_changed_at AS lastChangedAt,
				  m.change_status AS changeStatus,
	  
				  a.relevant AS relevant,
				  a.relevance_score AS relevanceScore,
				  a.categories AS categories,
				  a.priority AS priority,
				  a.summary AS summary,
				  a.cra_impact AS craImpact,
				  a.interview_point AS interviewPoint,
				  a.reason AS reason,
				  a.analyzed_at AS analyzedAt
	  
				FROM regulatory_manifest m
	  
				LEFT JOIN regulatory_analysis a
				  ON a.source = m.source
				  AND a.source_id = m.source_id
				  AND a.content_hash = m.content_hash
	  
				WHERE
				  m.source = ${source}
				  AND (
					m.title LIKE ${pattern}
					OR m.source_id LIKE ${pattern}
					OR a.summary LIKE ${pattern}
					OR a.cra_impact LIKE ${pattern}
					OR a.categories LIKE ${pattern}
					OR a.reason LIKE ${pattern}
				  )
	  
				ORDER BY
				  m.last_seen_at DESC
	  
				LIMIT ${safeLimit}
			  `
			: this.sql<RegulatoryMemoryRow>`
				SELECT
				  m.source AS source,
				  m.source_id AS sourceId,
				  m.title AS title,
				  m.url AS url,
				  m.published_at AS publishedAt,
				  m.content_hash AS contentHash,
				  m.first_seen_at AS firstSeenAt,
				  m.last_seen_at AS lastSeenAt,
				  m.last_changed_at AS lastChangedAt,
				  m.change_status AS changeStatus,
	  
				  a.relevant AS relevant,
				  a.relevance_score AS relevanceScore,
				  a.categories AS categories,
				  a.priority AS priority,
				  a.summary AS summary,
				  a.cra_impact AS craImpact,
				  a.interview_point AS interviewPoint,
				  a.reason AS reason,
				  a.analyzed_at AS analyzedAt
	  
				FROM regulatory_manifest m
	  
				LEFT JOIN regulatory_analysis a
				  ON a.source = m.source
				  AND a.source_id = m.source_id
				  AND a.content_hash = m.content_hash
	  
				WHERE
				  m.title LIKE ${pattern}
				  OR m.source_id LIKE ${pattern}
				  OR a.summary LIKE ${pattern}
				  OR a.cra_impact LIKE ${pattern}
				  OR a.categories LIKE ${pattern}
				  OR a.reason LIKE ${pattern}
	  
				ORDER BY
				  m.last_seen_at DESC
	  
				LIMIT ${safeLimit}
			  `;

		return rows.map((row) => this.rowToItem(row));
	}

	private rowToItem(row: RegulatoryMemoryRow): AgentMemoryItem {
		const hasAnalysis =
			row.relevant !== null &&
			row.relevanceScore !== null &&
			row.priority !== null &&
			row.summary !== null &&
			row.craImpact !== null &&
			row.reason !== null &&
			row.analyzedAt !== null;

		return {
			source: row.source,

			sourceId: row.sourceId,

			title: row.title,

			url: row.url ?? undefined,

			publishedAt: row.publishedAt ?? undefined,

			contentHash: row.contentHash,

			firstSeenAt: row.firstSeenAt,

			lastSeenAt: row.lastSeenAt,

			lastChangedAt: row.lastChangedAt,

			changeStatus: row.changeStatus,

			analysis: hasAnalysis
				? {
						relevant: row.relevant === 1,

						relevanceScore: row.relevanceScore!,

						categories: parseCategories(row.categories),

						priority: row.priority!,

						summary: row.summary!,

						craImpact: row.craImpact!,

						interviewPoint: row.interviewPoint ?? undefined,

						reason: row.reason!,

						analyzedAt: row.analyzedAt!,
					}
				: undefined,
		};
	}
}

function parseCategories(value: string | null): string[] {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);

		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}
