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
	isBusy: boolean;
	isRecovering: boolean;
	getRunsForToolCall: (toolCallId: string) => AgentToolRunState[];
}

export function ChatPanel({
	messages,
	input,
	onInputChange,
	onSend,
	isBusy,
	isRecovering,
	getRunsForToolCall,
}: ChatPanelProps) {
	return (
		<Card className="overflow-hidden">
			<CardHeader className="border-b py-4">
				<CardTitle className="flex items-center gap-2 text-base">
					<Bot className="h-4 w-4" />
					CRA Regulatory Assistant
				</CardTitle>
			</CardHeader>

			<CardContent className="p-0">
				<ScrollArea className="h-150">
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
					isBusy={isBusy}
				/>
			</CardContent>
		</Card>
	);
}
