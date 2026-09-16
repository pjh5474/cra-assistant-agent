import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const capabilities = [
	"도구와 승인",
	"RAG (내 문서)",
	"서브 에이전트",
	"워크플로우",
	"Think",
	"예약과 실시간 상태",
];

export function AgentOverview() {
	return (
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
					CRA가 MFDS, ICH, KoNECT 규제 업데이트를 확인하고, 실무에 필요한 변경을
					빠르게 파악하도록 돕습니다. 지금은 Weekly Regulatory Briefing 뼈대가
					동작합니다.
				</p>

				<div className="flex flex-wrap gap-1.5">
					{capabilities.map((capability) => (
						<Badge key={capability} variant="outline" className="font-normal">
							{capability}
						</Badge>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
