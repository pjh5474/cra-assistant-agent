import { ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";

interface AppHeaderProps {
	handleStop: () => void;
	isStreaming: boolean;
}

export function AppHeader({ handleStop, isStreaming }: AppHeaderProps) {
	return (
		<header className="border-b bg-background/95 backdrop-blur">
			<div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
						<ShieldCheck className="h-5 w-5 text-primary-foreground" />
					</div>

					<div>
						<h1 className="text-lg font-semibold tracking-tight">
							CRA Assistant
						</h1>

						<p className="text-xs text-muted-foreground">
							Regulatory Intelligence Agent
						</p>
					</div>
				</div>

				{isStreaming && (
					<Button type="button" variant="destructive" onClick={handleStop}>
						Stop
					</Button>
				)}
			</div>
		</header>
	);
}
