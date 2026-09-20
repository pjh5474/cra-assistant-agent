import { useEffect, useState } from "react";
import { Brain, Eraser, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type UserMemoryPanelProps = {
	memory: string;
	loading: boolean;
	saving: boolean;
	onRefresh: () => Promise<void>;
	onSave: (content: string) => Promise<void>;
	onClear: () => Promise<void>;
};

export function UserMemoryPanel({
	memory,
	loading,
	saving,
	onRefresh,
	onSave,
	onClear,
}: UserMemoryPanelProps) {
	const [draft, setDraft] = useState(memory);

	useEffect(() => {
		setDraft(memory);
	}, [memory]);

	const isDirty = draft !== memory;

	const handleClear = async () => {
		if (!window.confirm("Clear all user memory stored for this agent?")) {
			return;
		}

		await onClear();
		setDraft("");
	};

	return (
		<Card>
			<CardHeader className="gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Brain className="h-4 w-4" />
							User Memory
						</CardTitle>
						<CardDescription className="mt-1">
							Persistent user context used by the CRA Assistant across
							conversations.
						</CardDescription>
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onRefresh}
						disabled={loading || saving}
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				<Textarea
					value={draft}
					onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
						setDraft(event.target.value)
					}
					placeholder="No user memory has been stored yet."
					className="min-h-55 resize-y font-mono text-sm"
					disabled={loading || saving}
				/>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">
						{isDirty
							? "You have unsaved changes."
							: "This content is injected into the agent's persistent memory context."}
					</p>

					<div className="flex gap-2">
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onClick={handleClear}
							disabled={loading || saving || (!memory && !draft)}
						>
							<Eraser className="mr-2 h-4 w-4" />
							Clear
						</Button>

						<Button
							type="button"
							size="sm"
							onClick={() => onSave(draft)}
							disabled={loading || saving || !isDirty}
						>
							<Save className="mr-2 h-4 w-4" />
							{saving ? "Saving..." : "Save"}
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
