import { Agent } from "agents";
import { embed, embedMany } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type {
	RegulatoryDocumentAuthority,
	RegulatoryDocumentMetadata,
	RegulatoryDocumentSummary,
	RegulatoryDocumentType,
	RegulatoryRAGIngestResult,
	RegulatoryRAGSearchResult,
} from "../types/regulatory-rag.ts";
import { hashBuffer } from "../helpers/hashBuffer.ts";
import { RAG_EMBEDDING_MODEL, RAG_SKIP_HEADINGS } from "../constants.ts";
import { extractPdfTextFallback } from "../helpers/extractPdfTextFallback.ts";

interface MarkdownChunk {
	heading?: string;
	text: string;
}

export class RegulatoryRAGAgent extends Agent<Env> {
	onStart() {
		this.sql`
        CREATE TABLE IF NOT EXISTS rag_documents (
          id TEXT PRIMARY KEY,
  
          original_name TEXT NOT NULL,
  
          authority TEXT NOT NULL,
  
          document_type TEXT NOT NULL,
  
          title TEXT NOT NULL,
  
          version TEXT,
  
          effective_date TEXT,
  
          content_hash TEXT NOT NULL UNIQUE,
  
          chunk_count INTEGER NOT NULL,
  
          created_at INTEGER NOT NULL
        )
      `;

		this.sql`
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id TEXT PRIMARY KEY,
  
          document_id TEXT NOT NULL,
  
          chunk_index INTEGER NOT NULL,
  
          heading TEXT,
  
          text TEXT NOT NULL,
  
          created_at INTEGER NOT NULL
        )
      `;

		this.sql`
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_id
        ON rag_chunks(document_id)
      `;

		this.sql`
        CREATE INDEX IF NOT EXISTS idx_rag_documents_authority
        ON rag_documents(authority)
      `;
	}

	async ingestDocument(
		buffer: ArrayBuffer,
		originalName: string,
		fileType: string,
		metadata: RegulatoryDocumentMetadata,
	): Promise<RegulatoryRAGIngestResult> {
		const contentHash = await hashBuffer(buffer);

		const [existing] = this.sql<{
			id: string;
			original_name: string;
			chunk_count: number;
		}>`
			SELECT
				id,
				original_name,
				chunk_count
			FROM rag_documents
			WHERE content_hash = ${contentHash}
			LIMIT 1
		`;

		if (existing) {
			return {
				status: "already_exists",
				documentId: existing.id,
				originalName: existing.original_name,
				chunkCount: existing.chunk_count,
			};
		}

		const documentId = crypto.randomUUID();

		//
		// 1. Primary extraction:
		// Cloudflare AI.toMarkdown()
		//
		let extractedText = await this.convertToMarkdown(
			originalName,
			buffer,
			fileType,
		);

		let extractionMode: "markdown" | "pdf-text" = "markdown";

		console.log("[RegulatoryRAGAgent] markdown extraction", {
			originalName,
			length: extractedText.length,
		});

		//
		// 2. Fallback:
		// If toMarkdown produced only metadata/page headings
		// or otherwise no meaningful body text,
		// try unpdf text extraction.
		//
		if (!this.hasSearchableDocumentText(extractedText)) {
			console.warn(
				"[RegulatoryRAGAgent] Markdown extraction produced no searchable body text. Trying PDF text fallback.",
				{
					originalName,
				},
			);

			const fallback = await extractPdfTextFallback(buffer);

			if (!fallback.text || fallback.text.trim().length < 200) {
				throw new Error(
					"PDF conversion succeeded, but no searchable body text could be extracted " +
						"using either Markdown conversion or PDF text extraction.",
				);
			}

			extractedText = fallback.text.trim();

			extractionMode = "pdf-text";

			console.log("[RegulatoryRAGAgent] PDF text fallback succeeded", {
				originalName,
				totalPages: fallback.totalPages,
				textLength: extractedText.length,
			});
		}

		//
		// 3. Chunking
		//
		let chunks: {
			heading?: string;
			text: string;
		}[];

		if (extractionMode === "markdown") {
			chunks = this.splitMarkdownByHeading(extractedText);
		} else {
			//
			// unpdf output is plain text,
			// so do not force Markdown heading parsing.
			//
			chunks = this.splitSectionText(extractedText, 1200, 150).map((text) => ({
				text,
			}));
		}

		if (chunks.length === 0) {
			throw new Error("Document conversion produced no searchable text.");
		}

		//
		// 4. Build embedding input
		//
		const embeddingTexts = chunks.map((chunk) =>
			chunk.heading ? `${chunk.heading}\n\n${chunk.text}` : chunk.text,
		);

		const embeddings = await this.embedChunks(embeddingTexts);

		if (embeddings.length !== chunks.length) {
			throw new Error(
				`Embedding count mismatch: expected ${chunks.length}, received ${embeddings.length}.`,
			);
		}

		const createdAt = Date.now();

		//
		// 5. Persist chunks + prepare vectors
		//
		const vectors = chunks.map((chunk, index) => {
			const chunkId = crypto.randomUUID();

			this.sql`
						INSERT INTO rag_chunks (
							id,
							document_id,
							chunk_index,
							heading,
							text,
							created_at
						)
						VALUES (
							${chunkId},
							${documentId},
							${index},
							${chunk.heading ?? null},
							${chunk.text},
							${createdAt}
						)
					`;

			return {
				id: chunkId,

				values: embeddings[index],

				metadata: {
					documentId,

					authority: metadata.authority,

					documentType: metadata.documentType,

					version: metadata.version ?? "",

					chunkIndex: index,
				},
			};
		});

		//
		// 6. Vectorize
		//
		await this.env.VECTORIZE.upsert(vectors);

		//
		// 7. Persist document record
		//
		this.sql`
			INSERT INTO rag_documents (
				id,
				original_name,
				authority,
				document_type,
				title,
				version,
				effective_date,
				content_hash,
				chunk_count,
				created_at
			)
			VALUES (
				${documentId},
				${originalName},
				${metadata.authority},
				${metadata.documentType},
				${metadata.title},
				${metadata.version ?? null},
				${metadata.effectiveDate ?? null},
				${contentHash},
				${chunks.length},
				${createdAt}
			)
		`;

		console.log("[RegulatoryRAGAgent] ingestion completed", {
			documentId,
			originalName,
			extractionMode,
			chunks: chunks.length,
		});

		return {
			status: "ingested",
			documentId,
			originalName,
			chunkCount: chunks.length,
		};
	}

	async searchDocuments(
		query: string,
		topK = 5,
	): Promise<RegulatoryRAGSearchResult[]> {
		const trimmed = query.trim();

		if (!trimmed) {
			return [];
		}

		const safeTopK = Math.max(1, Math.min(topK, 10));

		const embedding = await this.embedQuery(trimmed);

		const result = await this.env.VECTORIZE.query(embedding, {
			topK: safeTopK,

			returnMetadata: "all",
		});

		console.log("[RegulatoryRAGAgent] search", {
			query,
			topK,

			matches: result.matches.map((match) => ({
				id: match.id,
				score: match.score,
				documentId: match.metadata?.documentId,
				version: match.metadata?.version,
				authority: match.metadata?.authority,
				chunkIndex: match.metadata?.chunkIndex,
			})),
		});

		const results: RegulatoryRAGSearchResult[] = [];

		for (const match of result.matches) {
			const [row] = this.sql<{
				chunk_id: string;
				document_id: string;
				chunk_index: number;
				heading: string | null;
				text: string;
				title: string;
				original_name: string;
				authority: string;
				document_type: string;
				version: string | null;
				effective_date: string | null;
			}>`
              SELECT
                c.id AS chunk_id,
                c.document_id,
                c.chunk_index,
                c.heading,
                c.text,
      
                d.title,
                d.original_name,
                d.authority,
                d.document_type,
                d.version,
                d.effective_date
      
              FROM rag_chunks c
      
              JOIN rag_documents d
                ON d.id =
                   c.document_id
      
              WHERE c.id =
                ${match.id}
      
              LIMIT 1
            `;

			if (!row) {
				continue;
			}

			results.push({
				chunkId: row.chunk_id,
				documentId: row.document_id,
				score: match.score,
				text: row.text,
				chunkIndex: row.chunk_index,
				heading: row.heading ?? undefined,
				document: {
					title: row.title,
					originalName: row.original_name,
					authority: row.authority as any,
					documentType: row.document_type as any,
					version: row.version ?? undefined,
					effectiveDate: row.effective_date ?? undefined,
				},
			});
		}

		return results;
	}

	async getChunkPreview(documentId: string, limit = 10) {
		return this.sql`
          SELECT
            id,
            document_id,
            chunk_index,
            heading,
            substr(text, 1, 300)
              AS preview
          FROM rag_chunks
          WHERE document_id =
            ${documentId}
          ORDER BY chunk_index
          LIMIT ${limit}
        `;
	}

	async deleteDocument(documentId: string): Promise<{
		status: "deleted" | "not_found";
		documentId: string;
		deletedChunks: number;
	}> {
		const [document] = this.sql<{
			id: string;
			original_name: string;
		}>`
            SELECT
              id,
              original_name
            FROM rag_documents
            WHERE id = ${documentId}
            LIMIT 1
          `;

		if (!document) {
			return {
				status: "not_found",
				documentId,
				deletedChunks: 0,
			};
		}

		const chunks = this.sql<{
			id: string;
		}>`
            SELECT id
            FROM rag_chunks
            WHERE document_id = ${documentId}
            ORDER BY chunk_index
          `;

		const chunkIds = chunks.map((chunk) => chunk.id);

		if (chunkIds.length > 0) {
			await this.deleteVectorsInBatches(chunkIds);
		}

		this.sql`
          DELETE FROM rag_chunks
          WHERE document_id = ${documentId}
        `;

		this.sql`
          DELETE FROM rag_documents
          WHERE id = ${documentId}
        `;

		console.log("[RegulatoryRAGAgent] document deleted", {
			documentId,
			originalName: document.original_name,
			deletedChunks: chunkIds.length,
		});

		return {
			status: "deleted",
			documentId,
			deletedChunks: chunkIds.length,
		};
	}

	async listDocuments(): Promise<RegulatoryDocumentSummary[]> {
		const rows = this.sql<{
			id: string;
			original_name: string;
			authority: RegulatoryDocumentAuthority;
			document_type: RegulatoryDocumentType;
			title: string;
			version: string | null;
			effective_date: string | null;
			chunk_count: number;
			created_at: number;
		}>`
			SELECT
				id,
				original_name,
				authority,
				document_type,
				title,
				version,
				effective_date,
				chunk_count,
				created_at
			FROM rag_documents
			ORDER BY created_at DESC
		`;

		return rows.map((row) => ({
			id: row.id,
			originalName: row.original_name,
			authority: row.authority,
			documentType: row.document_type,
			title: row.title,
			version: row.version,
			effectiveDate: row.effective_date,
			chunkCount: row.chunk_count,
			createdAt: row.created_at,
		}));
	}

	private async convertToMarkdown(
		fileName: string,
		buffer: ArrayBuffer,
		fileType: string,
	): Promise<string> {
		const result = await this.env.AI.toMarkdown({
			name: fileName,

			blob: new Blob([buffer], {
				type: fileType,
			}),
		});

		if (result.format === "error") {
			throw new Error(result.error);
		}

		return result.data;
	}

	private splitMarkdownByHeading(
		markdown: string,
		maxSize = 1200,
		overlap = 150,
	): MarkdownChunk[] {
		const sections: {
			heading?: string;
			body: string;
		}[] = [];

		const lines = markdown.split("\n");

		let currentHeading: string | undefined;

		let currentBody: string[] = [];

		let skipCurrentSection = false;

		const flush = () => {
			const body = currentBody.join("\n").trim();

			if (body && !skipCurrentSection) {
				sections.push({
					heading: currentHeading,
					body,
				});
			}

			currentBody = [];
		};

		for (const line of lines) {
			const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);

			if (!headingMatch) {
				if (!skipCurrentSection) {
					currentBody.push(line);
				}

				continue;
			}

			const heading = headingMatch[2].trim();

			//
			// Cloudflare PDF conversion
			// synthetic page headings.
			//
			if (/^Page\s+\d+$/i.test(heading)) {
				// Important:
				// Do NOT flush and
				// do NOT replace currentHeading.
				//
				// Page boundaries are not
				// semantic section boundaries.
				continue;
			}

			//
			// Metadata should not enter
			// the retrieval corpus.
			//
			if (RAG_SKIP_HEADINGS.has(heading)) {
				flush();
				currentHeading = undefined;
				currentBody = [];
				skipCurrentSection = true;
				continue;
			}

			//
			// We reached a real heading.
			//
			if (skipCurrentSection) {
				skipCurrentSection = false;
				currentBody = [];
			} else {
				flush();
			}

			currentHeading = heading;
		}

		flush();

		const chunks: MarkdownChunk[] = [];

		for (const section of sections) {
			const sectionChunks = this.splitSectionText(
				section.body,
				maxSize,
				overlap,
			);

			for (const text of sectionChunks) {
				chunks.push({
					heading: section.heading,
					text,
				});
			}
		}

		return chunks;
	}

	private async embedChunks(chunks: string[], batchSize = 32) {
		const embeddings: number[][] = [];

		for (let start = 0; start < chunks.length; start += batchSize) {
			const batch = chunks.slice(start, start + batchSize);

			const result = await embedMany({
				model: this.embedder(),
				values: batch,
			});

			embeddings.push(...result.embeddings);
		}

		return embeddings;
	}

	private async embedQuery(query: string) {
		const { embedding } = await embed({
			model: this.embedder(),

			value: query,
		});

		return embedding;
	}

	private hasSearchableDocumentText(markdown: string): boolean {
		const cleaned = markdown
			.replace(/^#{1,6}\s+Metadata\s*$/gim, "")
			.replace(/^#{1,6}\s+Contents\s*$/gim, "")
			.replace(/^#{1,6}\s+Page\s+\d+\s*$/gim, "")
			.replace(/^- .+?=.+$/gm, "")
			.replace(/^#{1,6}\s+.+\.pdf\s*$/gim, "")
			.trim();

		return cleaned.length >= 200;
	}

	private splitSectionText(
		text: string,
		maxSize = 1200,
		overlap = 150,
	): string[] {
		const chunks: string[] = [];

		const normalized = text.trim();

		if (!normalized) {
			return chunks;
		}

		let start = 0;

		while (start < normalized.length) {
			let end = Math.min(start + maxSize, normalized.length);

			if (end < normalized.length) {
				const slice = normalized.slice(start, end);

				const breakAt = Math.max(
					slice.lastIndexOf("\n\n"),
					slice.lastIndexOf("\n"),
					slice.lastIndexOf(". "),
					slice.lastIndexOf(" "),
				);

				if (breakAt > maxSize * 0.5) {
					end = start + breakAt;
				}
			}

			const chunk = normalized.slice(start, end).trim();

			if (chunk) {
				chunks.push(chunk);
			}

			if (end >= normalized.length) {
				break;
			}

			start = Math.max(0, end - overlap);
		}

		return chunks;
	}

	private async deleteVectorsInBatches(
		ids: string[],
		batchSize = 100,
	): Promise<void> {
		for (let start = 0; start < ids.length; start += batchSize) {
			const batch = ids.slice(start, start + batchSize);

			await this.env.VECTORIZE.deleteByIds(batch);
		}
	}

	private embedder() {
		return createWorkersAI({
			binding: this.env.AI,
		}).textEmbeddingModel(RAG_EMBEDDING_MODEL);
	}
}
