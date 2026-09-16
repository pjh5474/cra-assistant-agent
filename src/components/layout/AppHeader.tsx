import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
	isBusy: boolean;
	isRecovering: boolean;
	clearHistory: () => void;
}

export function AppHeader({
	isBusy,
	isRecovering,
	clearHistory,
}: AppHeaderProps) {
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

				<Badge variant={isBusy ? "default" : "secondary"}>
					{isRecovering ? "Recovering" : isBusy ? "Working" : "Ready"}
				</Badge>

				<button
					onClick={clearHistory}
					className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
				>
					Clear
				</button>
			</div>
		</header>
	);
}
