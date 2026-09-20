import type { AgentToolRunState } from "agents";
import type { UIMessage } from "ai";
import { Bot, User } from "lucide-react";
import { AgentRunTimeline } from "./AgentRunTimeline";
import { collectUniqueToolRuns } from "./collectUniqueToolRuns";

interface MessageBubbleProps {
	message: UIMessage;
	getRunsForToolCall: (toolCallId: string) => AgentToolRunState[];
}

export function MessageBubble({
	message,
	getRunsForToolCall,
}: MessageBubbleProps) {
	const isUser = message.role === "user";
	const textParts = message.parts.filter((part) => part.type === "text");
	const uniqueRuns = collectUniqueToolRuns(message, getRunsForToolCall);

	if (textParts.length === 0 && uniqueRuns.length === 0) {
		return null;
	}

	return (
		<div
			className={["flex gap-3", isUser ? "justify-end" : "justify-start"].join(
				" ",
			)}
		>
			{!isUser && (
				<div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
					<Bot className="h-4 w-4" />
				</div>
			)}

			<div
				className={[
					"flex max-w-[85%] flex-col gap-3",
					isUser ? "items-end" : "items-start",
				].join(" ")}
			>
				{textParts.length > 0 && (
					<div
						className={[
							"rounded-xl px-4 py-3 text-sm",
							isUser
								? "bg-sky-100 text-sky-950 dark:bg-sky-500/15 dark:text-sky-100"
								: "bg-muted",
						].join(" ")}
					>
						{textParts.map((part, index) => (
							<div key={index} className="whitespace-pre-wrap leading-relaxed">
								{part.text}
							</div>
						))}
					</div>
				)}

				{uniqueRuns.length > 0 && (
					<div className="w-full min-w-[320px] max-w-xl">
						<AgentRunTimeline runs={uniqueRuns} variant="inline" />
					</div>
				)}
			</div>

			{isUser && (
				<div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
					<User className="h-4 w-4" />
				</div>
			)}
		</div>
	);
}
