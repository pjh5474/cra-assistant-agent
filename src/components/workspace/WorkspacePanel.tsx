import { useMemo, useState } from "react";

import {
	Download,
	Loader2,
	Mail,
	RefreshCw,
	Save,
	Search,
	Trash2,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";

import type { WorkspaceFileEntry } from "@/types/workspace";
import { buildWorkspaceTree } from "@/lib/workspace";
import { TreeNode } from "./TreeNode";
import { Input } from "@/components/ui/input";

type WorkspacePanelProps = {
	agent: {
		call: <T = unknown>(method: string, args?: unknown[]) => Promise<T>;
	};

	files: WorkspaceFileEntry[];
	onRefresh: () => Promise<void>;
	onCreateEmailDraft: (path: string) => void | Promise<void>;
};

export function WorkspacePanel({
	agent,
	files,
	onRefresh,
	onCreateEmailDraft,
}: WorkspacePanelProps) {
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	const [content, setContent] = useState("");

	const [loading, setLoading] = useState(false);

	const [saving, setSaving] = useState(false);

	const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
		new Set(),
	);

	const [searchQuery, setSearchQuery] = useState("");

	const filteredFiles = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();

		if (!query) {
			return files;
		}

		return files.filter((file) => file.path.toLowerCase().includes(query));
	}, [files, searchQuery]);

	const workspaceTree = useMemo(
		() => buildWorkspaceTree(filteredFiles),
		[filteredFiles],
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

	const totalFileCount = useMemo(
		() => files.filter((file) => file.type === "file").length,
		[files],
	);

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

	function toggleFolder(path: string) {
		setCollapsedFolders((current) => {
			const next = new Set(current);

			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}

			return next;
		});
	}

	return (
		<div className="grid h-full grid-cols-[280px_minmax(0,1fr)] gap-4">
			<div className="flex min-h-0 flex-col rounded-lg border">
				<div className="flex items-center justify-between border-b p-3">
					<div>
						<div className="font-medium">Workspace</div>

						<div className="text-xs text-muted-foreground">
							{totalFileCount} files
						</div>
					</div>

					<Button variant="ghost" size="icon" onClick={onRefresh}>
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>

				<div className="border-b px-3 py-2">
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />

						<Input
							placeholder="Search files..."
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							className="h-8 bg-muted/40 pr-8 pl-8 text-xs"
						/>

						{searchQuery ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
								onClick={() => setSearchQuery("")}
								aria-label="Clear search"
							>
								<X />
							</Button>
						) : null}
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{totalFileCount === 0 ? (
						<div className="p-4 text-sm text-muted-foreground">
							No workspace files yet.
						</div>
					) : (
						<div className="space-y-0.5">
							{workspaceTree.length === 0 ? (
								<div className="p-4 text-sm text-muted-foreground">
									No workspace files yet.
								</div>
							) : (
								workspaceTree.map((node) => (
									<TreeNode
										key={node.path}
										node={node}
										depth={0}
										selectedPath={selectedPath}
										collapsedFolders={collapsedFolders}
										onToggleFolder={toggleFolder}
										onOpenFile={openFile}
									/>
								))
							)}
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

								<Button variant="destructive" size="sm" onClick={deleteFile}>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</Button>

								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										if (!selectedPath) {
											return;
										}

										onCreateEmailDraft(selectedPath);
									}}
								>
									<Mail className="mr-2 h-4 w-4" />
									Send Email
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
