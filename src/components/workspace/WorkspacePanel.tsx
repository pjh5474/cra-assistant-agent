import { useMemo, useState } from "react";

import {
	Download,
	FileText,
	Loader2,
	RefreshCw,
	Save,
	Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";

import type { WorkspaceFileEntry } from "@/types/workspace";

type WorkspacePanelProps = {
	agent: {
		call: <T = unknown>(method: string, args?: unknown[]) => Promise<T>;
	};

	files: WorkspaceFileEntry[];
	onRefresh: () => Promise<void>;
};

export function WorkspacePanel({
	agent,
	files,
	onRefresh,
}: WorkspacePanelProps) {
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	const [content, setContent] = useState("");

	const [loading, setLoading] = useState(false);

	const [saving, setSaving] = useState(false);

	const fileEntries = useMemo(
		() =>
			files
				.filter((file) => file.type === "file")
				.sort((a, b) => a.path.localeCompare(b.path)),
		[files],
	);

	async function openFile(path: string) {
		setLoading(true);

		try {
			const result = await agent.call<{
				path: string;
				content: string;
			}>("readWorkspaceFile", [path]);

			setSelectedPath(result.path);

			setContent(result.content);
		} finally {
			setLoading(false);
		}
	}

	async function saveFile() {
		if (!selectedPath) {
			return;
		}

		setSaving(true);

		try {
			await agent.call("writeWorkspaceFile", [selectedPath, content]);

			await onRefresh();
		} finally {
			setSaving(false);
		}
	}

	async function deleteFile() {
		if (!selectedPath) {
			return;
		}

		const confirmed = window.confirm(`Delete ${selectedPath}?`);

		if (!confirmed) {
			return;
		}

		await agent.call("deleteWorkspaceFile", [selectedPath]);

		setSelectedPath(null);
		setContent("");

		await onRefresh();
	}

	return (
		<div className="grid h-full grid-cols-[280px_minmax(0,1fr)] gap-4">
			<div className="flex min-h-0 flex-col rounded-lg border">
				<div className="flex items-center justify-between border-b p-3">
					<div>
						<div className="font-medium">Workspace</div>

						<div className="text-xs text-muted-foreground">
							{fileEntries.length} files
						</div>
					</div>

					<Button variant="ghost" size="icon" onClick={onRefresh}>
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{fileEntries.length === 0 ? (
						<div className="p-4 text-sm text-muted-foreground">
							No workspace files yet.
						</div>
					) : (
						<div className="space-y-1">
							{fileEntries.map((file) => (
								<button
									key={file.path}
									type="button"
									onClick={() => openFile(file.path)}
									className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
										selectedPath === file.path ? "bg-muted" : ""
									}`}
								>
									<FileText className="mt-0.5 h-4 w-4 shrink-0" />

									<div className="min-w-0">
										<div className="truncate font-medium">
											{file.path.split("/").at(-1)}
										</div>

										<div className="truncate text-xs text-muted-foreground">
											{file.path}
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="flex min-h-0 flex-col rounded-lg border">
				{selectedPath ? (
					<>
						<div className="flex items-center justify-between border-b p-3">
							<div className="min-w-0">
								<div className="truncate font-medium">
									{selectedPath.split("/").at(-1)}
								</div>

								<div className="truncate text-xs text-muted-foreground">
									{selectedPath}
								</div>
							</div>

							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (!selectedPath) {
											return;
										}

										const url = `/api/workspace/download?path=${encodeURIComponent(
											selectedPath,
										)}`;

										window.open(url, "_blank");
									}}
								>
									<Download className="mr-2 h-4 w-4" />
									Download
								</Button>

								<Button size="sm" onClick={saveFile} disabled={saving}>
									{saving ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<Save className="mr-2 h-4 w-4" />
									)}
									Save
								</Button>

								<Button variant="outline" size="sm" onClick={deleteFile}>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</Button>
							</div>
						</div>

						<div className="min-h-0 flex-1 p-3">
							{loading ? (
								<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Loading...
								</div>
							) : (
								<Textarea
									value={content}
									onChange={(event) => setContent(event.target.value)}
									className="h-full min-h-125 resize-none font-mono text-sm"
								/>
							)}
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Select a workspace file.
					</div>
				)}
			</div>
		</div>
	);
}
