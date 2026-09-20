export function isSyntheticHeading(heading: string): boolean {
	const normalized = heading.trim();

	if (!normalized) {
		return true;
	}

	if (/^Page\s+\d+$/i.test(normalized)) {
		return true;
	}

	if (normalized === "Metadata") {
		return true;
	}

	return false;
}
