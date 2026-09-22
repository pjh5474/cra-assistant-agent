import { KONECT_HEADERS } from "../constants.ts";
import { env } from "cloudflare:workers";

export async function fetchKoNECT(url: string): Promise<Response> {
	const startedAt = Date.now();

	try {
		const directResponse = await fetch(url, {
			headers: KONECT_HEADERS,
			redirect: "follow",
		});

		if (directResponse.ok) {
			console.log("[KoNECTCollector] direct fetch succeeded", {
				url,
				status: directResponse.status,
				finalUrl: directResponse.url,
				durationMs: Date.now() - startedAt,
			});

			return directResponse;
		}

		const body = await directResponse.text();

		console.warn("[KoNECTCollector] direct fetch failed, using fallback", {
			url,
			status: directResponse.status,
			statusText: directResponse.statusText,
			finalUrl: directResponse.url,
			contentType: directResponse.headers.get("content-type"),
			bodyPreview: body.slice(0, 500),
			durationMs: Date.now() - startedAt,
		});
	} catch (error) {
		console.warn("[KoNECTCollector] direct fetch threw, using fallback", {
			url,
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - startedAt,
		});
	}

	/**
	 * 2. Render fallback
	 */

	const controller = new AbortController();

	const timeout = setTimeout(() => controller.abort(), 90_000);

	const fallbackStartedAt = Date.now();

	const fallbackUrl = new URL("/api/konect/fetch", env.RENDER_SERVICE_URL);

	fallbackUrl.searchParams.set("url", url);

	console.log("[KoNECTCollector] fallback fetch started", {
		targetUrl: url,
		fallbackUrl: fallbackUrl.origin + fallbackUrl.pathname,
	});

	try {
		const fallbackResponse = await fetch(fallbackUrl.toString(), {
			headers: {
				"X-Internal-Token": env.KONECT_FALLBACK_TOKEN,
			},
			signal: controller.signal,
		});

		if (!fallbackResponse.ok) {
			const fallbackBody = await fallbackResponse.text();

			console.error("[KoNECTCollector] fallback fetch failed", {
				targetUrl: url,
				status: fallbackResponse.status,
				statusText: fallbackResponse.statusText,
				finalUrl: fallbackResponse.url,
				contentType: fallbackResponse.headers.get("content-type"),
				bodyPreview: fallbackBody.slice(0, 500),
				durationMs: Date.now() - fallbackStartedAt,
			});

			throw new Error(
				`KoNECT fallback request failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`,
			);
		}

		console.log("[KoNECTCollector] fallback fetch succeeded", {
			targetUrl: url,
			status: fallbackResponse.status,
			finalUrl: fallbackResponse.url,
			contentType: fallbackResponse.headers.get("content-type"),
			durationMs: Date.now() - fallbackStartedAt,
			totalDurationMs: Date.now() - startedAt,
		});

		return fallbackResponse;
	} catch (error) {
		const isAbortError = error instanceof Error && error.name === "AbortError";

		console.error("[KoNECTCollector] fallback fetch threw", {
			targetUrl: url,
			errorType: isAbortError ? "timeout" : "fetch-error",
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - fallbackStartedAt,
			totalDurationMs: Date.now() - startedAt,
		});

		if (isAbortError) {
			throw new Error("KoNECT fallback request timed out after 90 seconds");
		}

		throw error;
	} finally {
		clearTimeout(timeout);
	}
}
