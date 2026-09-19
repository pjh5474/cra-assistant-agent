export function removeJSessionId(url: string): string {
	return url.replace(/;jsessionid=[^?]+/i, "");
}
