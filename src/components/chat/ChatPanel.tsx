import type { AgentToolRunState } from "agents";
import type { UIMessage } from "ai";
import { Bot, Eraser, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChatComposer } from "./ChatComposer";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageBubble } from "./MessageBubble";

interface ChatPanelProps {
	messages: UIMessage[];
	input: string;
	onInputChange: (value: string) => void;
	onSend: (text: string) => void;
	onStop?: () => void;
	onClearHistory: () => void;
	isBusy: boolean;
	isRecovering: boolean;
	getRunsForToolCall: (toolCallId: string) => AgentToolRunState[];
}

export function ChatPanel({
	messages,
	input,
	onInputChange,
	onSend,
	onStop,
	onClearHistory,
	isBusy,
	isRecovering,
	getRunsForToolCall,
}: ChatPanelProps) {
	return (
		<Card className="flex h-[calc(100vh-10.5rem)] flex-col overflow-hidden">
			<CardHeader className="shrink-0 items-center border-b py-4">
				<CardTitle className="flex items-center gap-2 text-base">
					<Bot className="h-4 w-4" />
					CRA Regulatory Assistant
				</CardTitle>

				<CardAction className="flex items-center gap-2">
					<Badge
						variant="secondary"
						className={
							isRecovering
								? "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400"
								: isBusy
									? "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400"
									: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
						}
					>
						{isRecovering ? "Recovering" : isBusy ? "Working" : "Ready"}
					</Badge>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onClearHistory}
						disabled={messages.length === 0}
						className="text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
					>
						<Eraser />
						Clear chat
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent className="flex min-h-0 flex-1 flex-col p-0">
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-5 p-5">
						{messages.length === 0 ? (
							<ChatEmptyState onSelectPrompt={onInputChange} />
						) : (
							messages.map((message) => (
								<MessageBubble
									key={message.id}
									message={message}
									getRunsForToolCall={getRunsForToolCall}
								/>
							))
						)}

						{isBusy && (
							<div className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />

								{isRecovering
									? "Recovering agent execution..."
									: "Agent is working..."}
							</div>
						)}
					</div>
				</ScrollArea>

				<Separator />

				<ChatComposer
					value={input}
					onChange={onInputChange}
					onSend={onSend}
					onStop={onStop}
					isBusy={isBusy}
				/>
			</CardContent>
		</Card>
	);
}
