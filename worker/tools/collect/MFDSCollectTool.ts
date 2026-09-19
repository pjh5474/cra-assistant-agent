import { tool } from "ai";
import { z } from "zod";
import { MFDSCollector } from "../../source-collectors/MFDSCollector.ts";
import { MFDS_FEEDS } from "../../constants.ts";

const collector = new MFDSCollector();

const inputSchema = z.object({
	since: z
		.string()
		.optional()
		.describe(
			"Start of the requested date range. Preserve this filter across retries unless the user explicitly asks for a broader range.",
		),

	until: z
		.string()
		.optional()
		.describe(
			"End of the requested date range. Preserve this filter across retries unless the user explicitly asks for a broader range.",
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

  A successful response containing zero items is valid and means
  that no matching MFDS items were found for that period.

  Do not broaden or remove date filters merely because the result is empty.

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
				const until = input.until ? new Date(input.until) : undefined;

				if (since && Number.isNaN(since.getTime())) {
					throw new Error(`Invalid since date: ${input.since}`);
				}

				const result = await collector.collect({
					since,
					until,
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

export function getTodayDate() {
	return tool({
		description:
			"Get the current date in Korea (Asia/Seoul). Use this before interpreting relative dates such as today, yesterday, or this week.",

		inputSchema: z.object({}),

		execute: async () => {
			const formatter = new Intl.DateTimeFormat("en-CA", {
				timeZone: "Asia/Seoul",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			});

			return {
				date: formatter.format(new Date()),

				timezone: "Asia/Seoul",
			};
		},
	});
}
