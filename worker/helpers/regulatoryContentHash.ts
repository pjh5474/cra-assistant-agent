import type { RegulatoryItem } from "../types/regulatory.ts";

export async function createRegulatoryContentHash(
	item: RegulatoryItem,
): Promise<string> {
	const canonical = createCanonicalRegulatoryContent(item);

	const encoded = new TextEncoder().encode(canonical);

	const digest = await crypto.subtle.digest("SHA-256", encoded);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function createCanonicalRegulatoryContent(item: RegulatoryItem): string {
	return JSON.stringify({
		source: item.source,
		sourceId: item.sourceId,
		title: normalizeText(item.title),
		description: normalizeText(item.description),
		publishedAt: item.publishedAt ?? null,
		url: item.url ?? null,
		metadata: sortObject(item.metadata ?? {}),
	});
}

function normalizeText(value?: string): string | null {
	if (!value) {
		return null;
	}

	return value.replace(/\s+/g, " ").trim();
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortObject);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, nested]) => [key, sortObject(nested)]),
		);
	}

	return value;
}
