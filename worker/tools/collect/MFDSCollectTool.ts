import { tool } from "ai";
import { z } from "zod";
import { MFDSCollector } from "../../source-collectors/MFDSCollector.ts";
import { MFDS_FEEDS } from "../../source-collectors/MFDSCollector.ts";

const collector = new MFDSCollector();

const inputSchema = z.object({
	since: z
		.string()
		.optional()
		.describe(
			"Start date or ISO 8601 datetime. Examples: 2026-09-10 or 2026-09-10T00:00:00+09:00",
		),

	feedTypes: z.array(z.enum(MFDS_FEEDS.map((feed) => feed.type))).optional(),

	maxDescriptionLength: z
		.number()
		.int()
		.min(200)
		.max(3000)
		.optional()
		.describe(
			"Maximum number of characters retained from each RSS description.",
		),
});

export interface CreateMFDSCollectToolOptions {
	onProgress?: (progress: {
		fraction?: number;
		phase?: string;
		message?: string;
		milestone?: string;
	}) => Promise<void>;
}

export function createMFDSCollectTool(
	options: CreateMFDSCollectToolOptions = {},
) {
	return tool({
		description: `
  Collect newly published regulatory information
  from official MFDS RSS feeds.
      `.trim(),

		inputSchema,

		execute: async (input) => {
			console.log("[MFDSCollectTool] execute start", input);

			try {
				await options.onProgress?.({
					fraction: 0.1,
					phase: "collecting",
					message: "Collecting MFDS regulatory RSS feeds",
				});

				const since = input.since ? new Date(input.since) : undefined;

				if (since && Number.isNaN(since.getTime())) {
					throw new Error(`Invalid since date: ${input.since}`);
				}

				const result = await collector.collect({
					since,
					feedTypes: input.feedTypes,
					maxDescriptionLength: input.maxDescriptionLength,
				});

				console.log("[MFDSCollectTool] execute success", {
					totalFetched: result.totalFetched,
					totalReturned: result.totalReturned,
					failures: result.failures,
				});

				await options.onProgress?.({
					fraction: 0.4,
					phase: "collected",
					message: `Collected ${result.totalReturned} MFDS candidate items`,
				});

				return result;
			} catch (error) {
				console.error("[MFDSCollectTool] execute failed", error);

				throw error;
			}
		},
	});
}
