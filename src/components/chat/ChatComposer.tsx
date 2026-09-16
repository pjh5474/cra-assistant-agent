import type { SubmitEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatComposerProps {
	value: string;

	onChange: (value: string) => void;

	onSend: (text: string) => void;

	isBusy: boolean;
}

export function ChatComposer({
	value,
	onChange,
	onSend,
	isBusy,
}: ChatComposerProps) {
	function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();

		const text = value.trim();

		if (!text || isBusy) {
			return;
		}

		onSend(text);
	}

	return (
		<form onSubmit={handleSubmit} className="flex gap-2 p-4">
			<Input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder="Ask about regulatory updates..."
				disabled={isBusy}
			/>

			<Button
				type="submit"
				size="icon"
				disabled={isBusy || !value.trim()}
				aria-label="Send message"
			>
				{isBusy ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Send className="h-4 w-4" />
				)}
			</Button>
		</form>
	);
}
