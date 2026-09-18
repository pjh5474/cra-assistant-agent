// worker/source-collectors/ICHGuidelineCollector.ts

import type {
	ICHCollectionFailure,
	ICHGuidelineCollectionResult,
	ICHGuidelineRecord,
	ICHImplementationRecord,
} from "../types/ich.ts";
import {
	CRA_RELEVANT_ICH_PREFIXES,
	ICH_EFFICACY_API_URL,
} from "../constants.ts";

type UnknownRecord = Record<string, unknown>;

export class ICHGuidelineCollector {
	async collect(): Promise<ICHGuidelineCollectionResult> {
		const collectedAt = new Date().toISOString();

		try {
			console.log("[ICHGuidelineCollector] fetching", ICH_EFFICACY_API_URL);

			const response = await fetch(ICH_EFFICACY_API_URL, {
				headers: {
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(
					`ICH efficacy API request failed: ${response.status} ${response.statusText}`,
				);
			}

			const payload = (await response.json()) as unknown;

			const rawGuidelines = extractGuidelineItems(payload);

			const guidelines = rawGuidelines
				.map((item) => normalizeGuideline(item, collectedAt))
				.filter((item): item is ICHGuidelineRecord => item !== null);

			console.log("[ICHGuidelineCollector] collected", {
				totalFetched: rawGuidelines.length,
				totalReturned: guidelines.length,
			});

			return {
				source: "ICH",
				collectedAt,
				totalFetched: rawGuidelines.length,
				totalReturned: guidelines.length,
				guidelines,
				failures: [],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error("[ICHGuidelineCollector] failed", message);

			const failure: ICHCollectionFailure = {
				source: "ICH",
				target: "guideline-index",
				url: ICH_EFFICACY_API_URL,
				message,
			};

			return {
				source: "ICH",
				collectedAt,
				totalFetched: 0,
				totalReturned: 0,
				guidelines: [],
				failures: [failure],
			};
		}
	}
}

function extractGuidelineItems(value: unknown): UnknownRecord[] {
	const results: UnknownRecord[] = [];

	walk(value);

	return results;

	function walk(current: unknown): void {
		if (current == null) {
			return;
		}

		if (Array.isArray(current)) {
			for (const item of current) {
				walk(item);
			}

			return;
		}

		if (typeof current !== "object") {
			return;
		}

		const record = current as UnknownRecord;

		if (isGuidelineRecord(record)) {
			results.push(record);

			// guideline 자체를 찾았으면 내부 details / people / fileGroups까지
			// 다시 순회할 필요가 없음
			return;
		}

		for (const child of Object.values(record)) {
			walk(child);
		}
	}
}

function isGuidelineRecord(record: UnknownRecord): boolean {
	return (
		typeof record.code === "string" &&
		typeof record.title === "string" &&
		Array.isArray(record.fileGroups)
	);
}

function normalizeGuideline(
	raw: UnknownRecord,
	collectedAt: string,
): ICHGuidelineRecord | null {
	const displayCode = toStringValue(raw.code);
	const title = toStringValue(raw.title);

	if (!displayCode || !title) {
		return null;
	}

	const { code, revision } = parseGuidelineCode(displayCode);

	const details = asRecord(raw.details);

	const status = toStringValue(raw.status);

	const stepDate = toStringValue(details?.stepDate);

	const stepDateLabel = toStringValue(details?.stepDateLabel);

	const documentUrls = extractDocumentUrls(raw.fileGroups);

	const implementations = extractImplementations(
		details?.info,
		displayCode,
		title,
		collectedAt,
	);

	return {
		code,
		revision,
		displayCode,
		title,

		topic: "Efficacy",

		step: extractStepFromLabel(stepDateLabel),

		status: status || undefined,

		date: stepDate || undefined,

		guidelineUrl: "https://www.ich.org/page/efficacy-guidelines",

		documentUrls,

		implementations,

		collectedAt,
	};
}

function parseGuidelineCode(displayCode: string): {
	code: string;
	revision?: string;
} {
	const match = displayCode.match(/^([A-Z]+\d+[A-Z]?)(?:\(([^)]+)\))?/i);

	if (!match) {
		return {
			code: displayCode,
		};
	}

	const code = match[1];

	const revision = match[2];

	return {
		code,
		revision,
	};
}

function extractStepFromLabel(label: string): string | undefined {
	if (!label) {
		return undefined;
	}

	const normalized = stripHtml(label);

	const match = normalized.match(/Step\s+\d+/i);

	return match?.[0];
}

function extractDocumentUrls(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const urls = new Set<string>();

	for (const group of value) {
		const groupRecord = asRecord(group);

		if (!groupRecord) {
			continue;
		}

		if (Array.isArray(groupRecord.files)) {
			for (const file of groupRecord.files) {
				const fileRecord = asRecord(file);

				const uri = toStringValue(fileRecord?.uri);

				if (uri) {
					urls.add(uri);
				}
			}
		}

		if (Array.isArray(groupRecord.links)) {
			for (const link of groupRecord.links) {
				const linkRecord = asRecord(link);

				const uri = toStringValue(linkRecord?.uri);

				if (uri) {
					urls.add(uri);
				}
			}
		}
	}

	return Array.from(urls);
}

function extractImplementations(
	value: unknown,
	guidelineCode: string,
	guidelineTitle: string,
	collectedAt: string,
): ICHImplementationRecord[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const results: ICHImplementationRecord[] = [];

	for (const item of value) {
		const record = asRecord(item);

		if (!record) {
			continue;
		}

		const member = toStringValue(record.party);

		const text = toStringValue(record.text);

		if (!member) {
			continue;
		}

		const parsed = parseImplementationText(text);

		results.push({
			guidelineCode,
			guidelineTitle,
			member,

			status: parsed.status,

			implementationDate: parsed.implementationDate,

			reference: parsed.reference,

			collectedAt,
		});
	}

	return results;
}

function parseImplementationText(text: string): {
	status: string;
	implementationDate?: string;
	reference?: string;
} {
	if (!text) {
		return {
			status: "",
		};
	}

	const status = text.split(";")[0]?.trim() ?? "";

	const dateMatch = text.match(/Date:\s*([^;]+)/i);

	const referenceMatch = text.match(/Reference:\s*(.+)$/is);

	return {
		status,

		implementationDate: dateMatch?.[1]?.trim(),

		reference: referenceMatch?.[1]?.trim(),
	};
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function asRecord(value: unknown): UnknownRecord | undefined {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	return value as UnknownRecord;
}

function toStringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
