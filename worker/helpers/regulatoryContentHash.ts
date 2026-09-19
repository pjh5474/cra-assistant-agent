import type { RegulatoryItem } from "../types/regulatory.ts";
import { normalizeMetadataForHash } from "./normalizeMetadataForHash.ts";

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
	const payload = {
		source: item.source,
		sourceId: item.sourceId,
		title: normalizeText(item.title),
		description: normalizeText(item.description),
		publishedAt: item.publishedAt ?? null,
		url: item.url ?? null,
		metadata: normalizeMetadataForHash(item.metadata ?? {}),
	};

	// console.log(
	// 	"[RegulatoryContentHash] payload",
	// 	JSON.stringify(payload, null, 2),
	// );

	return JSON.stringify(payload);
}

function normalizeText(value?: string): string | null {
	if (!value) {
		return null;
	}

	return value.replace(/\s+/g, " ").trim();
}
