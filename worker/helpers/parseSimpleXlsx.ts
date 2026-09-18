import { unzipSync, strFromU8 } from "fflate";

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

export function parseSimpleXlsx(buffer: ArrayBuffer): Record<string, string>[] {
	const files = unzipSync(new Uint8Array(buffer));

	const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]);

	const worksheet = files["xl/worksheets/sheet1.xml"];

	if (!worksheet) {
		throw new Error("XLSX worksheet sheet1.xml not found");
	}

	const xml = strFromU8(worksheet);

	const parsed = parser.parse(xml);

	const rawRows = parsed?.worksheet?.sheetData?.row;

	if (!rawRows) {
		return [];
	}

	const rows = Array.isArray(rawRows) ? rawRows : [rawRows];

	const values = rows.map((row) => parseRow(row, sharedStrings));

	if (values.length === 0) {
		return [];
	}

	const [headerRow, ...dataRows] = values;

	const headers = headerRow.map((value) => value.trim());

	return dataRows
		.filter((row) => row.some(Boolean))
		.map((row) => {
			const record: Record<string, string> = {};

			headers.forEach((header, index) => {
				if (!header) {
					return;
				}

				record[header] = row[index] ?? "";
			});

			return record;
		});
}

function parseSharedStrings(file: Uint8Array | undefined): string[] {
	if (!file) {
		return [];
	}

	const xml = strFromU8(file);

	const parsed = parser.parse(xml);

	const items = parsed?.sst?.si;

	if (!items) {
		return [];
	}

	const list = Array.isArray(items) ? items : [items];

	return list.map(extractSharedString);
}

function extractSharedString(item: unknown): string {
	if (typeof item === "string") {
		return item;
	}

	if (!item || typeof item !== "object") {
		return "";
	}

	const value = item as Record<string, any>;

	if (typeof value.t === "string") {
		return value.t;
	}

	/*
	 * rich text:
	 * <si>
	 *   <r><t>...</t></r>
	 *   <r><t>...</t></r>
	 * </si>
	 */

	if (value.r) {
		const runs = Array.isArray(value.r) ? value.r : [value.r];

		return runs
			.map((run: any) => (typeof run.t === "string" ? run.t : ""))
			.join("");
	}

	return "";
}

function parseRow(row: any, sharedStrings: string[]): string[] {
	const cells = row?.c;

	if (!cells) {
		return [];
	}

	const cellList = Array.isArray(cells) ? cells : [cells];

	const result: string[] = [];

	for (const cell of cellList) {
		const reference = cell?.["@_r"];

		if (typeof reference !== "string") {
			continue;
		}

		const columnIndex = columnReferenceToIndex(reference);

		const type = cell?.["@_t"];

		const rawValue = cell?.v;

		let value = "";

		if (type === "s") {
			const index = Number(rawValue);

			value = sharedStrings[index] ?? "";
		} else if (type === "inlineStr") {
			value = cell?.is?.t ?? "";
		} else {
			value = rawValue !== undefined ? String(rawValue) : "";
		}

		result[columnIndex] = value;
	}

	return result;
}

function columnReferenceToIndex(reference: string): number {
	const match = reference.match(/^([A-Z]+)/i);

	if (!match) {
		return 0;
	}

	const letters = match[1].toUpperCase();

	let index = 0;

	for (const char of letters) {
		index = index * 26 + char.charCodeAt(0) - 64;
	}

	return index - 1;
}
