import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type {
	RegulatoryItem,
	RegulatoryAnalysisResult,
	AnalyzedRegulatoryItem,
} from "../types/regulatory.ts";
import { stripJsonCodeFence } from "../helpers/stripJsonCodeFence.ts";

const analyzedItemSchema = z.object({
	id: z.string(),
	relevant: z.boolean(),
	relevanceScore: z.number().min(0).max(1),
	categories: z.array(
		z.enum([
			"IRB",
			"Safety",
			"Monitoring",
			"Essential Documents",
			"IMP",
			"Protocol/GCP Compliance",
			"Data Integrity",
			"Other",
		]),
	),
	priority: z.enum(["high", "medium", "low"]),
	summary: z.string(),
	craImpact: z.string(),
	interviewPoint: z.string().optional(),
	reason: z.string(),
});

const analysisSchema = z.object({
	items: z.array(analyzedItemSchema),
});

type LLMAnalysisOutput = z.infer<typeof analysisSchema>;

export interface RegulatoryAnalyzerOptions {
	includeIrrelevant?: boolean;
	batchSize?: number;
	maxDescriptionLength?: number;

	abortSignal?: AbortSignal;

	onBatchProgress?: (
		completedBatches: number,
		totalBatches: number,
	) => Promise<void>;
}

export class RegulatoryAnalyzer {
	private readonly model: LanguageModel;

	constructor(model: LanguageModel) {
		this.model = model;
	}

	async analyze(
		items: RegulatoryItem[],
		options: RegulatoryAnalyzerOptions = {},
	): Promise<RegulatoryAnalysisResult> {
		const {
			includeIrrelevant = false,
			batchSize = 10,
			maxDescriptionLength = 2_000,
		} = options;

		if (items.length === 0) {
			return {
				analyzedCount: 0,
				relevantCount: 0,
				items: [],
			};
		}

		const batches = this.chunk(items, batchSize);

		const analyzedItems: AnalyzedRegulatoryItem[] = [];

		for (let index = 0; index < batches.length; index++) {
			if (options.abortSignal?.aborted) {
				console.log("[RegulatoryAnalyzer] abort signal detected");
				throw new DOMException("Regulatory analysis aborted", "AbortError");
			}

			const batch = batches[index];

			console.log("[RegulatoryAnalyzer] batch start", {
				batch: index + 1,
				totalBatches: batches.length,
				itemCount: batch.length,
			});

			try {
				const result = await this.analyzeBatch(
					batch,
					maxDescriptionLength,
					options.abortSignal,
				);

				if (result) {
					analyzedItems.push(...result);
				}

				console.log("[RegulatoryAnalyzer] batch complete", {
					batch: index + 1,
					totalBatches: batches.length,
				});
			} catch (error) {
				console.error("[RegulatoryAnalyzer] batch failed", {
					batch: index + 1,
					totalBatches: batches.length,
					error,
				});

				throw error;
			}

			await options.onBatchProgress?.(index + 1, batches.length);
		}

		const relevantItems = analyzedItems.filter((item) => item.relevant);

		return {
			analyzedCount: analyzedItems.length,
			relevantCount: relevantItems.length,
			items: includeIrrelevant ? analyzedItems : relevantItems,
		};
	}

	private async analyzeBatch(
		items: RegulatoryItem[],
		maxDescriptionLength: number,
		abortSignal?: AbortSignal,
	): Promise<AnalyzedRegulatoryItem[] | undefined> {
		const compactItems = items.map((item) => ({
			id: item.id,
			source: item.source,
			sourceType: item.sourceType,
			title: item.title,
			description: item.description
				? this.truncate(item.description, maxDescriptionLength)
				: undefined,
			publishedAt: item.publishedAt,
			metadata: item.metadata,
		}));

		console.log("[RegulatoryAnalyzer] generateText start", {
			itemCount: compactItems.length,
			sources: compactItems.map((item) => item.source),
		});

		try {
			const result = await generateText({
				model: this.model,
				abortSignal: abortSignal,
				output: Output.object({
					schema: analysisSchema,
				}),
				system: `
You are a regulatory intelligence analyst specializing in
clinical trials and CRA (Clinical Research Associate) work.

Analyze regulatory updates collected from official regulatory
or clinical-trial-related sources.

Determine whether each item is meaningfully relevant to CRA work.

Relevant domains include:

- IRB / ethics committee submissions and reporting
- informed consent and subject protection
- AE / SAE / SUSAR and safety reporting
- monitoring and risk-based monitoring
- essential documents, TMF, and ISF
- investigational medicinal product management
- protocol compliance
- GCP compliance
- data integrity and source data
- eCRF and computerized systems
- inspection readiness
- investigator/site responsibilities
- sponsor/CRO responsibilities relevant to CRA activities

Do not mark an item relevant merely because it concerns
pharmaceutical products, regulatory authorities, or
clinical research in general.

KoNECT education or course items are professional-development
information, not regulatory changes.

A KoNECT education or course item may still be meaningfully relevant
to CRA work when it is specifically intended for CRA professionals
or directly supports CRA/GCP professional development.

Examples of relevant KoNECT professional-development items include:

- CRA 신규자, 심화, or 보수 training
- GCP training intended for clinical-trial professionals
- monitoring-related practical education
- sponsor/CRO operational training relevant to CRA work
- education concerning informed consent, safety reporting,
  essential documents, protocol compliance, or inspection readiness

For KoNECT education items, distinguish CRA relevance from
regulatory impact.

A relevant KoNECT training item should normally be treated as
professional-development information with LOW or MEDIUM priority,
unless the supplied information independently indicates a meaningful
operational or compliance impact.

Do not describe the publication or availability of a KoNECT training
course as:
- a regulatory change
- a new legal requirement
- a mandatory requirement

unless the supplied input explicitly supports such a conclusion.

Usually irrelevant examples include:

- food regulations
- cosmetics regulations
- pharmaceutical manufacturing issues with no meaningful
clinical-trial impact
- unrelated recruitment or organizational announcements
- administrative notices unrelated to clinical trials
- KoNECT website maintenance, contact information, or general
administrative notices with no meaningful CRA or clinical-trial impact

Priority:

HIGH:
May materially affect clinical-trial conduct, monitoring,
documentation, reporting, subject safety, or inspection readiness.

MEDIUM:
Relevant to CRA work or clinical-trial operations but unlikely
to require an immediate operational change.

LOW:
Useful mainly as background knowledge with limited practical impact.

Categories:

IRB
Safety
Monitoring
Essential Documents
IMP
Protocol/GCP Compliance
Data Integrity
Other

Rules:

1. Use only the supplied information.
2. Do not invent regulatory changes.
3. Do not claim that a requirement changed unless supported by the input.
4. If the available information is insufficient, state that clearly.
5. Preserve the exact input item id.
6. Keep outputs concise.
7. Multiple categories are allowed.
8. Return exactly one result for every input item.
9. Return only valid JSON matching the required schema.
10. Do not wrap the JSON response in Markdown code fences.
11. Do not include explanatory text before or after the JSON.
	  `.trim(),
				prompt: `
Analyze the following regulatory items.

${JSON.stringify(compactItems, null, 2)}
	  `.trim(),
			});
			return this.mergeWithSource(items, result.output);
		} catch (error) {
			console.error("[RegulatoryAnalyzer] generateText failed", error);

			const rawText =
				typeof error === "object" &&
				error !== null &&
				"text" in error &&
				typeof error.text === "string"
					? error.text
					: undefined;

			if (rawText) {
				try {
					const cleaned = stripJsonCodeFence(rawText);

					const parsed = JSON.parse(cleaned);

					const normalized = Array.isArray(parsed) ? { items: parsed } : parsed;

					const recovered = analysisSchema.parse(normalized);

					console.warn(
						"[RegulatoryAnalyzer] recovered structured output from fenced JSON",
					);

					return this.mergeWithSource(items, recovered);
				} catch (recoveryError) {
					console.error(
						"[RegulatoryAnalyzer] recovery parse failed",
						recoveryError,
					);
				}
			}
		}
	}

	private mergeWithSource(
		sourceItems: RegulatoryItem[],
		output: LLMAnalysisOutput,
	): AnalyzedRegulatoryItem[] {
		const analyzedMap = new Map(output.items.map((item) => [item.id, item]));
		const results: AnalyzedRegulatoryItem[] = [];

		for (const sourceItem of sourceItems) {
			const analysis = analyzedMap.get(sourceItem.id);

			if (!analysis) {
				results.push({
					id: sourceItem.id,
					source: sourceItem.source,
					sourceId: sourceItem.sourceId,
					title: sourceItem.title,
					url: sourceItem.url,
					publishedAt: sourceItem.publishedAt,
					relevant: true,
					relevanceScore: 0.5,
					categories: ["Other"],
					priority: "medium",
					summary:
						"Automatic regulatory analysis was incomplete for this item.",
					craImpact:
						"Manual review is recommended because the automated analysis did not return a result.",
					interviewPoint: undefined,
					reason:
						"The analyzer did not return a corresponding result for this regulatory item.",
				});

				continue;
			}

			results.push({
				id: sourceItem.id,
				source: sourceItem.source,
				sourceId: sourceItem.sourceId,
				title: sourceItem.title,
				url: sourceItem.url,
				publishedAt: sourceItem.publishedAt,
				relevant: analysis.relevant,
				relevanceScore: analysis.relevanceScore,
				categories: analysis.categories,
				priority: analysis.priority,
				summary: analysis.summary,
				craImpact: analysis.craImpact,
				interviewPoint: analysis.interviewPoint,
				reason: analysis.reason,
			});
		}

		return results;
	}

	private chunk<T>(items: T[], size: number): T[][] {
		const safeSize = Math.max(1, size);
		const chunks: T[][] = [];
		for (let index = 0; index < items.length; index += safeSize) {
			chunks.push(items.slice(index, index + safeSize));
		}
		return chunks;
	}

	private truncate(value: string, maxLength: number): string {
		if (value.length <= maxLength) {
			return value;
		}
		return `${value.slice(0, maxLength)}…`;
	}
}
