import { BookOpen, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "../ui/button";
import { useState } from "react";
import { HowToUseSheet } from "./HowToUseSheet";

export const capabilities = [
	"RAG",
	"Regulatory Memory",
	"Workspace",
	"Workflow",
	"Email Approval",
	"Scheduler",
	"Audit History",
	"AI Gateway",
];

export function AgentOverview() {
	const [howToUseOpen, setHowToUseOpen] = useState(false);
	return (
		<>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<ShieldCheck className="h-4 w-4" />
						CRA Assistant
					</CardTitle>
				</CardHeader>

				<CardContent className="space-y-3">
					<p className="text-xs font-medium">Regulatory Intelligence Agent</p>

					<p className="text-xs leading-relaxed text-muted-foreground">
						MFDS, ICH, KoNECT의 규제 정보를 수집·분석하고, RAG와 Regulatory
						Memory를 활용해 CRA 업무에 필요한 정보를 탐색합니다. Weekly
						Regulatory Briefing 생성, Workspace 저장, Email 전달, 예약 실행과
						실행 이력 관리까지 지원합니다.
					</p>

					<div className="flex flex-wrap gap-1.5">
						{capabilities.map((capability) => (
							<Badge key={capability} variant="outline" className="font-normal">
								{capability}
							</Badge>
						))}
					</div>
				</CardContent>

				<CardFooter>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setHowToUseOpen(true)}
					>
						<BookOpen className="mr-2 h-4 w-4" />
						How to Use
					</Button>
				</CardFooter>
			</Card>

			<HowToUseSheet open={howToUseOpen} onOpenChange={setHowToUseOpen} />
		</>
	);
}
