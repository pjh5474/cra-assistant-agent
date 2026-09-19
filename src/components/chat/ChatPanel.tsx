import type { AgentToolRunState } from "agents";
import type { UIMessage } from "ai";
import { Bot, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	isBusy,
	isRecovering,
	getRunsForToolCall,
}: ChatPanelProps) {
	return (
		<Card className="flex h-[min(36rem,calc(100vh-22rem))] flex-col overflow-hidden">
			<CardHeader className="shrink-0 border-b py-4">
				<CardTitle className="flex items-center gap-2 text-base">
					<Bot className="h-4 w-4" />
					CRA Regulatory Assistant
				</CardTitle>
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
