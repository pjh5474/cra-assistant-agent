import {
	AlertTriangle,
	BookOpen,
	Brain,
	CalendarClock,
	Database,
	FileSearch,
	MailCheck,
	Workflow,
} from "lucide-react";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { capabilities } from "./AgentOverview";

interface HowToUseSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const sections = [
	{
		icon: Brain,
		title: "1. Chat",
		description:
			"CRA 및 규제 관련 질문을 자연어로 입력합니다. Main Agent가 질문에 맞춰 RAG, Regulatory Memory, User Memory, Workspace 등의 도구를 선택해 사용합니다.",
		examples: [
			"ICH E6(R3)에서 risk-based monitoring은 어떻게 설명하나요?",
			"최근 수집된 규제 변경사항을 알려줘.",
			"Workspace에 저장된 문서 목록을 보여줘.",
		],
	},
	{
		icon: FileSearch,
		title: "2. RAG & Regulatory Memory",
		description:
			"RAG는 인덱싱된 규정 문서를 근거로 검색하고, Regulatory Memory는 이전 Regulatory Workflow에서 수집·분석한 규제 상태를 조회합니다.",
		examples: [
			"ICH E6(R2)와 R3의 monitoring 차이를 비교해줘.",
			"최근 MFDS 관련 변경사항 중 CRA에게 중요한 내용을 찾아줘.",
		],
	},
	{
		icon: Workflow,
		title: "3. Regulatory Workflow",
		description:
			"MFDS, ICH, KoNECT 소스를 수집하고 CRA 관련성을 분석한 뒤 결과를 종합해 Weekly Regulatory Briefing을 생성합니다.",
		examples: [
			"Source Processing → Synthesis → Reporting 순서로 진행됩니다.",
			"생성된 Briefing은 Workspace에 자동 저장됩니다.",
			"Email 옵션을 선택한 경우 완료 후 지정한 수신자에게 자동 발송됩니다.",
		],
	},
	{
		icon: Database,
		title: "4. Workspace",
		description:
			"Chat 또는 Workflow에서 생성된 보고서, 비교 문서, 메모 등을 저장하고 다시 읽거나 수정할 수 있습니다.",
		examples: [
			"/comparisons — 규정 비교 문서",
			"/reports/regulatory — Regulatory Briefing",
			"/notes — 사용자 메모",
			"/logs — 실행 및 업무 기록",
		],
	},
	{
		icon: MailCheck,
		title: "5. Email",
		description:
			"Chat에서 생성된 이메일은 사용자의 최종 승인을 받은 뒤 발송됩니다. Workflow 이메일은 Workflow 실행 전 설정한 수신자를 사전 승인된 대상으로 간주합니다.",
		examples: [
			"Chat / Workspace Email → Approval required",
			"Workflow Email → Pre-authorized automatic delivery",
			"Email delivery history와 중복 발송 방지는 D1에서 관리됩니다.",
		],
	},
	{
		icon: CalendarClock,
		title: "6. Schedule",
		description:
			"Weekly Regulatory Briefing을 반복 실행하도록 예약할 수 있습니다. 사용자 입력은 KST 기준이며 실제 Cloudflare Cron은 UTC로 변환되어 저장됩니다.",
		examples: [
			"예: Friday 19:00 KST → Cron 0 10 * * 5 UTC",
			"Schedule 생성 / 조회 / 취소를 지원합니다.",
			"Last Run, Last Status, Email Status와 실행 History를 확인할 수 있습니다.",
		],
	},
];

const workflowSteps = [
	"1. Schedule에서 Friday 19:00 KST로 Weekly Briefing 예약",
	"2. MFDS / ICH / KoNECT source agents가 규제 정보 수집 및 분석",
	"3. Regulatory Workflow가 분석 결과를 종합",
	"4. Briefing을 Workspace에 Markdown으로 저장",
	"5. Email 옵션이 활성화되어 있으면 지정된 수신자에게 자동 발송",
	"6. Schedule History에서 실행 결과와 Email status 확인",
];

export function HowToUseSheet({ open, onOpenChange }: HowToUseSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
				<SheetHeader className="border-b px-6 py-5 pr-14">
					<SheetTitle className="flex items-center gap-2 text-lg">
						<BookOpen className="h-5 w-5" />
						How to Use CRA Assistant
					</SheetTitle>

					<SheetDescription>
						CRA Assistant의 주요 기능과 각 정보 소스의 역할을 확인할 수
						있습니다.
					</SheetDescription>
				</SheetHeader>

				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-8 px-6 py-6 pb-10">
						<div className="rounded-xl border bg-muted/30 p-5">
							<p className="text-sm font-medium">
								Regulatory Intelligence Agent
							</p>

							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								MFDS, ICH, KoNECT 규제 정보를 수집·분석하고, RAG와 Regulatory
								Memory를 활용해 CRA 업무에 필요한 정보를 탐색합니다. 분석 결과는
								Workspace, Email, Scheduler와 연결해 반복적으로 활용할 수
								있습니다.
							</p>

							<div className="mt-4 flex flex-wrap gap-1.5">
								{capabilities.map((capability) => (
									<Badge
										key={capability}
										variant="outline"
										className="font-normal"
									>
										{capability}
									</Badge>
								))}
							</div>
						</div>

						<div className="space-y-4">
							{sections.map(({ icon: Icon, title, description, examples }) => (
								<section
									key={title}
									className="rounded-xl border bg-card p-4 shadow-xs"
								>
									<div className="flex items-center gap-3">
										<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
											<Icon className="h-4 w-4" />
										</div>

										<h3 className="text-sm font-semibold">{title}</h3>
									</div>

									<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
										{description}
									</p>

									<div className="mt-3 space-y-2">
										{examples.map((example) => (
											<div
												key={example}
												className="rounded-lg border-l-2 border-sky-400/70 bg-sky-50/70 px-3 py-2 text-sm leading-relaxed text-foreground dark:border-sky-500/50 dark:bg-sky-500/10"
											>
												{example}
											</div>
										))}
									</div>
								</section>
							))}
						</div>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold">
								Understanding the information sources
							</h3>

							<div className="space-y-2">
								<SourceInfo
									name="RAG"
									description="인덱싱된 규정 문서에서 관련 근거를 검색합니다."
								/>

								<SourceInfo
									name="Regulatory Memory"
									description="이전 Workflow에서 수집·분석한 규제 상태를 조회합니다."
								/>

								<SourceInfo
									name="Regulatory Workflow"
									description="MFDS, ICH, KoNECT 소스를 다시 수집·분석하여 새로운 Briefing을 생성합니다."
								/>

								<SourceInfo
									name="User Memory"
									description="사용자와 관련된 지속적인 context를 저장하고 활용합니다."
								/>

								<SourceInfo
									name="Workspace"
									description="보고서, 비교 문서, 메모 등 생성된 working artifact를 저장합니다."
								/>
							</div>
						</section>

						<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
							<p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
								<AlertTriangle className="h-4 w-4" />
								Important
							</p>

							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								Regulatory Memory는 이전에 수집된 규제 상태이며 실시간 최신성을
								보장하는 source가 아닙니다. 최신 MFDS, ICH, KoNECT 정보를 다시
								확인해야 할 경우 Regulatory Workflow를 실행하세요.
							</p>
						</div>

						<section className="space-y-3">
							<h3 className="text-sm font-semibold">Example workflow</h3>

							<div className="rounded-xl border p-4">
								<ol className="space-y-3">
									{workflowSteps.map((step) => (
										<li key={step} className="flex gap-3">
											<span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" />

											<p className="text-sm leading-relaxed text-muted-foreground">
												{step}
											</p>
										</li>
									))}
								</ol>
							</div>
						</section>
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}

interface SourceInfoProps {
	name: string;
	description: string;
}

function SourceInfo({ name, description }: SourceInfoProps) {
	return (
		<div className="flex gap-3 rounded-lg border px-3 py-3">
			<Badge variant="outline" className="h-fit shrink-0 font-medium">
				{name}
			</Badge>

			<p className="text-sm leading-relaxed text-muted-foreground">
				{description}
			</p>
		</div>
	);
}
