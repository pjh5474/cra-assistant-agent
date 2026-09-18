import { parseSimpleXlsx } from "../helpers/parseSimpleXlsx.ts";

import type {
	ICHImplementationCollectionResult,
	ICHImplementationRecord,
} from "../types/ich.ts";

const ICH_IMPLEMENTATION_EXPORT_URL =
	"https://admin.ich.org/database-connector/v1/guidelines/export/implementation/xlsx/724";

export interface ICHImplementationCollectOptions {
	partyId?: number;
	guidelineId?: number;
}

function parseGuidelineLabel(value: string): {
	code: string;
	title: string;
} {
	const match = value.match(/^([A-Z]\d+(?:\([^)]+\))?)\s+(.+)$/);

	if (!match) {
		return {
			code: value,
			title: "",
		};
	}

	return {
		code: match[1].trim(),
		title: match[2].trim(),
	};
}

export class ICHImplementationCollector {
	async collect(
		options: ICHImplementationCollectOptions = {},
	): Promise<ICHImplementationCollectionResult> {
		const collectedAt = new Date().toISOString();

		try {
			const url = new URL(ICH_IMPLEMENTATION_EXPORT_URL);

			if (options.partyId !== undefined) {
				url.searchParams.set("partyId", String(options.partyId));
			}

			if (options.guidelineId !== undefined) {
				url.searchParams.set("id", String(options.guidelineId));
			}

			console.log("[ICHImplementationCollector] fetching", url.toString());

			const response = await fetch(url.toString(), {
				headers: {
					Accept:
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, */*",
				},
			});

			if (!response.ok) {
				throw new Error(
					`ICH implementation export failed: ${response.status} ${response.statusText}`,
				);
			}

			const buffer = await response.arrayBuffer();

			const rows = parseSimpleXlsx(buffer);

			console.log("[ICHImplementationCollector] rows", rows.length);

			console.log("[ICHImplementationCollector] first rows", rows.slice(0, 3));

			console.log("[ICHImplementationCollector] XLS rows", rows.length);

			const implementations = rows
				.map((row) => this.normalizeRow(row, collectedAt))
				.filter((record): record is ICHImplementationRecord => record !== null);

			return {
				source: "ICH",
				collectedAt,
				totalFetched: rows.length,
				totalReturned: implementations.length,
				implementations,
				failures: [],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error("[ICHImplementationCollector] failed", message);

			return {
				source: "ICH",
				collectedAt,
				totalFetched: 0,
				totalReturned: 0,
				implementations: [],
				failures: [
					{
						source: "ICH",
						target: "implementation-index",
						url: ICH_IMPLEMENTATION_EXPORT_URL,
						message,
					},
				],
			};
		}
	}

	private normalizeRow(
		row: Record<string, string>,
		collectedAt: string,
	): ICHImplementationRecord | null {
		const guidelineCode = String(row["ICH Guideline"] ?? "").trim();

		const member = String(row["ICH Member"] ?? "").trim();

		const status = String(row["Implementation Status"] ?? "").trim();

		const implementationDate = String(row["Implementation Date"] ?? "").trim();

		const reference = String(row["Reference"] ?? "").trim();

		const guideline = parseGuidelineLabel(
			String(row["ICH Guideline"] ?? "").trim(),
		);

		if (!guideline.code || !member) {
			return null;
		}

		if (!guidelineCode || !member) {
			return null;
		}

		return {
			guidelineCode: guideline.code,
			guidelineTitle: guideline.title,
			member,
			status,
			implementationDate: implementationDate || undefined,
			reference: reference || undefined,
			collectedAt,
		};
	}
}
