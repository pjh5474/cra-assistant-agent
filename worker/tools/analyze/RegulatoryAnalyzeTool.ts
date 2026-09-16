import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { RegulatoryAnalyzer } from "../../analyzers/RegulatoryAnalyzer.ts";
import type { RegulatoryItem } from "../../types/regulatory.ts";

const regulatoryItemSchema = z.object({
	id: z.string(),
	source: z.enum(["MFDS", "ICH", "KONECT"]),
	sourceType: z.enum(["law", "notice", "guidance", "safety", "guideline"]),
	title: z.string(),
	description: z.string().optional(),
	url: z.url(),
	publishedAt: z.string().optional(),
	collectedAt: z.string(),
	sourceId: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const inputSchema = z.object({
	items: z
		.array(regulatoryItemSchema)
		.min(1)
		.describe(
			"Normalized regulatory items collected from an official regulatory source.",
		),
	includeIrrelevant: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Return items determined to be unrelated to CRA work. Useful mainly for debugging and evaluation.",
		),
	batchSize: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.default(5)
		.describe(
			"Maximum number of regulatory items analyzed in a single model call.",
		),
});

export interface CreateRegulatoryAnalyzeToolOptions {
	model: LanguageModel;

	onProgress?: (progress: {
		fraction?: number;
		phase?: string;
		message?: string;
		milestone?: string;
	}) => Promise<void>;
}

/**
 * Analyzer를 factory 형태로 생성합니다.
 *
 * model을 module 내부에 hard-code하지 않고,
 * Agent/Worker 생성 시 injection할 수 있도록 설계합니다.
 */
export function createRegulatoryAnalyzeTool(
	options: CreateRegulatoryAnalyzeToolOptions,
) {
	const analyzer = new RegulatoryAnalyzer(options.model);

	return tool({
		description: `
Analyze regulatory items previously collected from official
clinical-trial or pharmaceutical regulatory sources.

Use this tool after source collection.

The tool determines CRA relevance, functional categories,
priority, concise summary, practical CRA impact, and useful
interview or learning points.

The analysis is source-agnostic and can process items collected
from MFDS, ICH, KoNECT, and other supported regulatory sources.

The tool intentionally returns compact analysis results and does
not reproduce unnecessary raw regulatory content.
    `.trim(),
		inputSchema,
		execute: async (input) => {
			console.log("[RegulatoryAnalyzeTool] execute start", {
				itemCount: input.items.length,
				batchSize: input.batchSize,
			});

			try {
				await options.onProgress?.({
					fraction: 0.5,
					phase: "analyzing",
					message: `Analyzing ${input.items.length} regulatory items`,
				});

				const result = await analyzer.analyze(input.items as RegulatoryItem[], {
					includeIrrelevant: input.includeIrrelevant,

					batchSize: input.batchSize,

					onBatchProgress: async (completed, total) => {
						const fraction = 0.5 + (completed / total) * 0.4;

						await options.onProgress?.({
							fraction,

							phase: "analyzing",

							message: `Analyzing regulatory items (${completed}/${total} batches completed)`,
						});
					},
				});

				console.log("[RegulatoryAnalyzeTool] execute success", {
					analyzedCount: result.analyzedCount,
					relevantCount: result.relevantCount,
				});

				await options.onProgress?.({
					fraction: 0.9,
					phase: "analyzed",
					message: `Found ${result.relevantCount} CRA-relevant MFDS updates`,
				});

				return result;
			} catch (error) {
				console.error("[RegulatoryAnalyzeTool] execute failed", error);

				throw error;
			}
		},
	});
}
