export function formatRegulatoryHeading(heading?: string): string | undefined {
	if (!heading) {
		return undefined;
	}

	return heading
		.replace(/^(\d+(?:\.\d+)*)(?=[A-Za-z])/, "$1 ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.trim();
}
