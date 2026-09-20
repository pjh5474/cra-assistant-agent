import { extractText, getDocumentProxy } from "unpdf";

export interface PdfTextFallbackResult {
	text: string;
	totalPages: number;
}

export async function extractPdfTextFallback(
	buffer: ArrayBuffer,
): Promise<PdfTextFallbackResult> {
	const pdf = await getDocumentProxy(new Uint8Array(buffer));

	const result = await extractText(pdf, {
		mergePages: true,
	});

	const text =
		typeof result.text === "string"
			? result.text
			: (result.text as string[]).join("\n\n");

	return {
		text: text.trim(),

		totalPages: result.totalPages,
	};
}
