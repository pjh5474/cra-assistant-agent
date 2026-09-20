import {
	FileText,
	Loader2,
	RefreshCw,
	Sparkles,
	Trash2,
	Upload,
} from "lucide-react";

import { useRef, useState } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { RegulatoryDocumentSummary } from "@/types/regulatory-rag";
import type {
	DeleteResponse,
	MetadataPreviewResponse,
	UploadResponse,
} from "@/types/knowledge";

type KnowledgeBasePanelProps = {
	documents: RegulatoryDocumentSummary[];
	loading: boolean;
	onRefresh: () => Promise<void>;
	onUploaded: () => Promise<void>;
	onDeleted: () => Promise<void>;
};

export function KnowledgeBasePanel({
	documents,
	loading,
	onRefresh,
	onUploaded,
	onDeleted,
}: KnowledgeBasePanelProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [uploading, setUploading] = useState(false);

	const [deletingId, setDeletingId] = useState<string | undefined>();

	const [title, setTitle] = useState("");

	const [authority, setAuthority] = useState("ICH");

	const [documentType, setDocumentType] = useState("GCP");

	const [version, setVersion] = useState("");

	const [effectiveDate, setEffectiveDate] = useState("");

	const [extractingMetadata, setExtractingMetadata] = useState(false);

	async function handleGenerateMetadata() {
		const file = fileInputRef.current?.files?.[0];

		if (!file) {
			window.alert("PDF file을 먼저 선택해주세요.");

			return;
		}

		setExtractingMetadata(true);

		try {
			const formData = new FormData();

			formData.append("file", file);

			const response = await fetch("/api/rag/metadata-preview", {
				method: "POST",
				body: formData,
			});

			const result = (await response.json()) as MetadataPreviewResponse;

			if (!response.ok) {
				throw new Error(result.error ?? "Metadata extraction failed");
			}

			const metadata = result.metadata;

			if (metadata?.title) {
				setTitle(metadata.title);
			}

			if (metadata?.authority) {
				setAuthority(metadata.authority);
			}

			if (metadata?.documentType) {
				setDocumentType(metadata.documentType);
			}

			if (metadata?.version) {
				setVersion(metadata.version);
			}

			if (metadata?.effectiveDate) {
				setEffectiveDate(metadata.effectiveDate);
			}

			console.log("[KnowledgeBase] metadata generated", metadata);
		} catch (error) {
			console.error("[KnowledgeBase] metadata generation failed", error);

			window.alert(
				error instanceof Error ? error.message : "Metadata generation failed",
			);
		} finally {
			setExtractingMetadata(false);
		}
	}

	async function handleUpload() {
		const file = fileInputRef.current?.files?.[0];

		if (!file) {
			window.alert("PDF file을 선택해주세요.");
			return;
		}

		if (!title.trim()) {
			window.alert("문서 제목을 입력해주세요.");
			return;
		}

		const formData = new FormData();

		formData.append("file", file);

		formData.append("title", title.trim());

		formData.append("authority", authority);

		formData.append("documentType", documentType);

		if (version.trim()) {
			formData.append("version", version.trim());
		}

		if (effectiveDate) {
			formData.append("effectiveDate", effectiveDate);
		}

		setUploading(true);

		try {
			const response = await fetch("/api/rag/documents", {
				method: "POST",
				body: formData,
			});

			const result = (await response.json()) as UploadResponse;

			if (!response.ok) {
				throw new Error(result.error ?? "Upload failed");
			}

			if (result.status === "already_exists") {
				window.alert("This document already exists in the knowledge base.");

				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}

				await onUploaded();

				return;
			}

			console.log("[KnowledgeBase] upload", result);

			await onUploaded();

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}

			setTitle("");
			setVersion("");
			setEffectiveDate("");
		} catch (error) {
			console.error("[KnowledgeBase] upload failed", error);

			window.alert(error instanceof Error ? error.message : "Upload failed");
		} finally {
			setUploading(false);
		}
	}

	async function handleDelete(document: RegulatoryDocumentSummary) {
		const confirmed = window.confirm(
			`"${document.title}" 문서를 삭제할까요?\n\nVectorize와 RAG chunk도 함께 삭제됩니다.`,
		);

		if (!confirmed) {
			return;
		}

		setDeletingId(document.id);

		try {
			const response = await fetch(`/api/rag/documents/${document.id}`, {
				method: "DELETE",
			});

			const result = (await response.json()) as DeleteResponse;

			if (!response.ok) {
				throw new Error(result.error ?? "Delete failed");
			}

			await onDeleted();
		} catch (error) {
			console.error("[KnowledgeBase] delete failed", error);

			window.alert(error instanceof Error ? error.message : "Delete failed");
		} finally {
			setDeletingId(undefined);
		}
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Add Regulatory Document</CardTitle>

					<CardDescription>
						Add authoritative regulatory documents to the RAG knowledge base.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label>PDF</Label>

							<Input ref={fileInputRef} type="file" accept="application/pdf" />

							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleGenerateMetadata}
								disabled={extractingMetadata}
							>
								{extractingMetadata ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Sparkles className="mr-2 h-4 w-4" />
								)}

								{extractingMetadata ? "Generating..." : "Generate Metadata"}
							</Button>

							{extractingMetadata && (
								<p className="flex items-center gap-2 text-xs text-muted-foreground">
									<Loader2 className="h-3 w-3 animate-spin" />
									Detecting document metadata...
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label>Title</Label>

							<Input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="ICH E6(R3) Good Clinical Practice"
							/>
						</div>

						<div className="space-y-2">
							<Label>Authority</Label>

							<select
								value={authority}
								onChange={(event) => setAuthority(event.target.value)}
								className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							>
								<option value="ICH">ICH</option>

								<option value="MFDS">MFDS</option>

								<option value="KONECT">KoNECT</option>

								<option value="INTERNAL">Internal</option>

								<option value="OTHER">Other</option>
							</select>
						</div>

						<div className="space-y-2">
							<Label>Document Type</Label>

							<select
								value={documentType}
								onChange={(event) => setDocumentType(event.target.value)}
								className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							>
								<option value="GCP">GCP</option>

								<option value="REGULATION">Regulation</option>

								<option value="GUIDELINE">Guideline</option>

								<option value="SOP">SOP</option>

								<option value="TRAINING">Training</option>

								<option value="OTHER">Other</option>
							</select>
						</div>

						<div className="space-y-2">
							<Label>Version</Label>

							<Input
								value={version}
								onChange={(event) => setVersion(event.target.value)}
								placeholder="E6(R3)"
							/>
						</div>

						<div className="space-y-2">
							<Label>Effective Date</Label>

							<Input
								type="date"
								value={effectiveDate}
								onChange={(event) => setEffectiveDate(event.target.value)}
							/>
						</div>
					</div>

					<Button type="button" onClick={handleUpload} disabled={uploading}>
						{uploading ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Upload className="mr-2 h-4 w-4" />
						)}

						{uploading ? "Ingesting..." : "Upload & Ingest"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<CardTitle>Knowledge Base</CardTitle>

							<CardDescription>
								{documents.length} regulatory document(s)
							</CardDescription>
						</div>

						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={onRefresh}
							disabled={loading}
						>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
							/>
							Refresh
						</Button>
					</div>
				</CardHeader>

				<CardContent>
					{documents.length === 0 ? (
						<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
							No regulatory documents have been ingested.
						</div>
					) : (
						<div className="space-y-3">
							{documents.map((document) => (
								<div
									key={document.id}
									className="flex items-start justify-between gap-4 rounded-lg border p-4"
								>
									<div className="flex min-w-0 gap-3">
										<FileText className="mt-0.5 h-5 w-5 shrink-0" />

										<div className="min-w-0">
											<p className="font-medium">{document.title}</p>

											<p className="mt-1 text-sm text-muted-foreground">
												{document.authority}
												{" · "}
												{document.documentType}

												{document.version ? ` · ${document.version}` : ""}

												{document.effectiveDate
													? ` · ${document.effectiveDate}`
													: ""}
											</p>

											<p className="mt-1 text-xs text-muted-foreground">
												{document.chunkCount} chunks
												{" · "}
												{document.originalName}
											</p>
										</div>
									</div>

									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => handleDelete(document)}
										disabled={deletingId === document.id}
									>
										{deletingId === document.id ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Trash2 className="h-4 w-4" />
										)}
									</Button>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
