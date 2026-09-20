import { Output, generateText } from "ai";

import { createWorkersAI } from "workers-ai-provider";

import { z } from "zod";

import type { RegulatoryDocumentMetadataPreview } from "../types/regulatory-rag.ts";

const metadataSchema = z.object({
	title: z.string().optional(),

	authority: z.enum(["ICH", "MFDS", "KONECT", "INTERNAL", "OTHER"]).optional(),

	documentType: z
		.enum(["GCP", "REGULATION", "GUIDELINE", "SOP", "TRAINING", "OTHER"])
		.optional(),

	version: z.string().optional(),

	effectiveDate: z.string().optional(),

	confidence: z.object({
		title: z.number().min(0).max(1),

		authority: z.number().min(0).max(1),

		documentType: z.number().min(0).max(1),

		version: z.number().min(0).max(1),

		effectiveDate: z.number().min(0).max(1),
	}),
});

export async function extractRegulatoryDocumentMetadata(
	env: Env,
	markdown: string,
	fileName: string,
): Promise<RegulatoryDocumentMetadataPreview> {
	const workersAI = createWorkersAI({
		binding: env.AI,
	});

	const preview = markdown.slice(0, 12_000);

	const result = await generateText({
		model: workersAI("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),

		output: Output.object({
			schema: metadataSchema,
		}),

		prompt: `
Extract regulatory document metadata from the provided document preview.

Filename:
${fileName}

Document preview:
${preview}

Rules:

- Use only information explicitly supported by the document.
- Do not guess missing fields.
- title should be the human-readable official document title.
- authority identifies the issuing organization.
- documentType must use the provided enum.
- version should preserve official notation such as "E6(R3)".
- effectiveDate must be YYYY-MM-DD when an explicit adoption/effective/final date is available.
- Do not treat PDF creation metadata as the regulatory effective date.
- For ICH documents, "Final version Adopted on ..." may be used when appropriate.
- confidence values range from 0 to 1.
			`.trim(),
	});

	return result.output;
}
