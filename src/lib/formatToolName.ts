import { MAIN_TOOL_LABELS } from "@/constants";

export function formatToolName(toolName: string): string {
	const explicit = MAIN_TOOL_LABELS[toolName];

	if (explicit) {
		return explicit;
	}

	return toolName
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (char) => char.toUpperCase());
}
