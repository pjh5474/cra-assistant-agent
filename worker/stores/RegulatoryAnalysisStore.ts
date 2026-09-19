import type {
	RegulatoryAnalysisInput,
	RegulatoryAnalysisRecord,
} from "../types/regulatory-analysis.ts";
import type { SqlExecutor } from "../types/regulatory-memory.ts";

interface RegulatoryAnalysisRow {
	source: string;
	sourceId: string;
	contentHash: string;

	relevant: number;
	relevanceScore: number;
	categories: string;
	priority: "high" | "medium" | "low";

	summary: string;
	craImpact: string;
	interviewPoint: string | null;
	reason: string;

	analyzedAt: string;
}

export class RegulatoryAnalysisStore {
	private readonly sql: SqlExecutor;

	constructor(sql: SqlExecutor) {
		this.sql = sql;
	}

	get(
		source: string,
		sourceId: string,
		contentHash: string,
	): RegulatoryAnalysisRecord | undefined {
		const rows = this.sql<RegulatoryAnalysisRow>`
          SELECT
            source,
            source_id AS sourceId,
            content_hash AS contentHash,
  
            relevant,
            relevance_score AS relevanceScore,
            categories,
            priority,
  
            summary,
            cra_impact AS craImpact,
            interview_point AS interviewPoint,
            reason,
  
            analyzed_at AS analyzedAt
  
          FROM regulatory_analysis
  
          WHERE
            source = ${source}
            AND source_id = ${sourceId}
            AND content_hash = ${contentHash}
  
          LIMIT 1
        `;

		const row = rows[0];

		if (!row) {
			return undefined;
		}

		return this.rowToRecord(row);
	}

	upsert(input: RegulatoryAnalysisInput): RegulatoryAnalysisRecord {
		const analyzedAt = new Date().toISOString();

		this.sql`
        INSERT INTO regulatory_analysis (
          source,
          source_id,
          content_hash,
  
          relevant,
          relevance_score,
          categories,
          priority,
  
          summary,
          cra_impact,
          interview_point,
          reason,
  
          analyzed_at
        )
        VALUES (
          ${input.source},
          ${input.sourceId},
          ${input.contentHash},
  
          ${input.relevant ? 1 : 0},
          ${input.relevanceScore},
          ${JSON.stringify(input.categories)},
          ${input.priority},
  
          ${input.summary},
          ${input.craImpact},
          ${input.interviewPoint ?? null},
          ${input.reason},
  
          ${analyzedAt}
        )
  
        ON CONFLICT (
          source,
          source_id,
          content_hash
        )
        DO UPDATE SET
          relevant = excluded.relevant,
          relevance_score = excluded.relevance_score,
          categories = excluded.categories,
          priority = excluded.priority,
  
          summary = excluded.summary,
          cra_impact = excluded.cra_impact,
          interview_point = excluded.interview_point,
          reason = excluded.reason,
  
          analyzed_at = excluded.analyzed_at
      `;

		return {
			...input,
			analyzedAt,
		};
	}

	private rowToRecord(row: RegulatoryAnalysisRow): RegulatoryAnalysisRecord {
		let categories: string[] = [];

		try {
			categories = JSON.parse(row.categories);
		} catch {
			categories = [];
		}

		return {
			source: row.source as RegulatoryAnalysisRecord["source"],

			sourceId: row.sourceId,

			contentHash: row.contentHash,

			relevant: row.relevant === 1,

			relevanceScore: row.relevanceScore,

			categories,

			priority: row.priority,

			summary: row.summary,

			craImpact: row.craImpact,

			interviewPoint: row.interviewPoint ?? undefined,

			reason: row.reason,

			analyzedAt: row.analyzedAt,
		};
	}
}
