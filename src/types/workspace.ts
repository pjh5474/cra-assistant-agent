export type WorkspaceFileEntry = {
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;
};
