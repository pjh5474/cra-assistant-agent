import type { AgentActivity } from "@/types/agent-activity";
import { Circle, LoaderCircle } from "lucide-react";
import { Check } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import { Ban } from "lucide-react";

export function AgentStatus({ status }: { status: AgentActivity["status"] }) {
	switch (status) {
		case "running":
			return <LoaderCircle className="size-4 animate-spin text-primary" />;

		case "completed":
			return <Check className="size-4 text-muted-foreground" />;

		case "error":
			return <TriangleAlert className="size-4 text-destructive" />;

		case "aborted":
			return <Ban className="size-4 text-muted-foreground" />;

		default:
			return <Circle className="size-3" />;
	}
}
