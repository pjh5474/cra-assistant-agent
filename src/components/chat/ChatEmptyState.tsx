import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatEmptyStateProps {
	onSelectPrompt: (text: string) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
	return (
		<div className="flex min-h-125 flex-col items-center justify-center px-4 text-center">
			<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
				<ShieldCheck className="h-7 w-7 text-muted-foreground" />
			</div>

			<h3 className="mt-4 font-medium">Regulatory monitoring ready</h3>

			<p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
				Ask the agent to monitor MFDS regulatory updates, identify CRA-relevant
				changes, or prepare a weekly regulatory briefing.
			</p>

			<div className="mt-6 flex flex-wrap justify-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						onSelectPrompt(
							"이번 주 MFDS에서 CRA 업무와 관련된 규제 업데이트를 확인해줘.",
						)
					}
				>
					이번 주 MFDS
				</Button>

				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						onSelectPrompt(
							"최근 MFDS 업데이트 중 Monitoring, Safety, IRB 관련 내용을 정리해줘.",
						)
					}
				>
					CRA 관련 변경
				</Button>

				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() =>
						onSelectPrompt(
							"최근 MFDS 업데이트에서 면접 전에 알아둘 내용을 알려줘.",
						)
					}
				>
					Interview Points
				</Button>
			</div>
		</div>
	);
}
