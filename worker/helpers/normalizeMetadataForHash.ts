export function normalizeMetadataForHash(value: unknown): unknown {
	if (Array.isArray(value)) {
		const normalized = value.map(normalizeMetadataForHash);

		return normalized.sort((a, b) =>
			JSON.stringify(a).localeCompare(JSON.stringify(b)),
		);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => {
					return ![
						"collectedAt",
						"fetchedAt",
						"retrievedAt",
						"lastSeenAt",
						"runId",
					].includes(key);
				})
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, nested]) => [key, normalizeMetadataForHash(nested)]),
		);
	}

	return value;
}
