import { formatSize, type WorkspaceTreeNode } from "@/lib/workspace";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";

export function TreeNode({
	node,
	depth,
	selectedPath,
	collapsedFolders,
	onToggleFolder,
	onOpenFile,
}: {
	node: WorkspaceTreeNode;
	depth: number;
	selectedPath: string | null;
	collapsedFolders: Set<string>;

	onToggleFolder: (path: string) => void;

	onOpenFile: (path: string) => void;
}) {
	const isDirectory = node.type === "directory";

	const collapsed = collapsedFolders.has(node.path);

	return (
		<>
			<button
				type="button"
				onClick={() => {
					if (isDirectory) {
						onToggleFolder(node.path);
					} else {
						onOpenFile(node.path);
					}
				}}
				style={{
					paddingLeft: 8 + depth * 16,
				}}
				className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition hover:bg-muted ${
					selectedPath === node.path ? "bg-muted" : ""
				}`}
			>
				{isDirectory ? (
					<>
						{collapsed ? (
							<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						) : (
							<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						)}

						<Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
					</>
				) : (
					<>
						<span className="w-3.5 shrink-0" />

						<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
					</>
				)}

				<span className="min-w-0 flex-1 truncate text-xs">{node.name}</span>

				{isDirectory ? (
					<span className="shrink-0 text-xs text-muted-foreground">
						{node.fileCount}
					</span>
				) : (
					<span className="shrink-0 text-xs text-muted-foreground">
						{formatSize(node.size)}
					</span>
				)}
			</button>

			{isDirectory &&
				!collapsed &&
				node.children.map((child) => (
					<TreeNode
						key={child.path}
						node={child}
						depth={depth + 1}
						selectedPath={selectedPath}
						collapsedFolders={collapsedFolders}
						onToggleFolder={onToggleFolder}
						onOpenFile={onOpenFile}
					/>
				))}
		</>
	);
}
