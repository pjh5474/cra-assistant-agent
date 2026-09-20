import type { WorkspaceFileEntry } from "@/types/workspace";

export type WorkspaceTreeNode = {
	name: string;
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;

	children: WorkspaceTreeNode[];

	fileCount: number;
};

export function buildWorkspaceTree(
	files: WorkspaceFileEntry[],
): WorkspaceTreeNode[] {
	const root: WorkspaceTreeNode = {
		name: "",
		path: "",
		type: "directory",
		size: 0,
		updatedAt: 0,
		children: [],
		fileCount: 0,
	};

	const nodeMap = new Map<string, WorkspaceTreeNode>();

	nodeMap.set("", root);

	const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

	for (const file of sortedFiles) {
		const parts = file.path.split("/").filter(Boolean);

		let currentPath = "";

		for (let index = 0; index < parts.length; index += 1) {
			const name = parts[index];

			const parentPath = currentPath;

			currentPath += `/${name}`;

			const isLast = index === parts.length - 1;

			let node = nodeMap.get(currentPath);

			if (!node) {
				node = {
					name,
					path: currentPath,

					type: isLast ? file.type : "directory",

					size: isLast ? file.size : 0,

					updatedAt: isLast ? file.updatedAt : 0,

					children: [],
					fileCount: 0,
				};

				nodeMap.set(currentPath, node);

				const parent = nodeMap.get(parentPath);

				parent?.children.push(node);
			} else if (isLast) {
				node.type = file.type;

				node.size = file.size;

				node.updatedAt = file.updatedAt;
			}
		}
	}

	calculateCounts(root);

	return root.children;
}

export function calculateCounts(node: WorkspaceTreeNode): number {
	if (node.type === "file") {
		node.fileCount = 1;

		return 1;
	}

	const count = node.children.reduce(
		(total, child) => total + calculateCounts(child),
		0,
	);

	node.fileCount = count;

	node.children.sort((a, b) => {
		// folders first
		if (a.type !== b.type) {
			return a.type === "directory" ? -1 : 1;
		}

		return a.name.localeCompare(b.name);
	});

	return count;
}

export function formatSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileName(path: string) {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function getDepth(path: string) {
	return path.split("/").filter(Boolean).length - 1;
}
