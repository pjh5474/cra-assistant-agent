import { Think } from "@cloudflare/think";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { createWorkersAI } from "workers-ai-provider";

import { KoNECTCollector } from "../source-collectors/KoNECTCollector.ts";
import { RegulatoryAnalyzer } from "../analyzers/RegulatoryAnalyzer.ts";

import type {
	KoNECTCourseItem,
	KoNECTNoticeItem,
	KoNECTNoticeType,
	KoNECTWorkflowInput,
	KoNECTWorkflowResult,
} from "../types/konect.ts";

import type { RegulatoryItem } from "../types/regulatory.ts";

const DEFAULT_NOTICE_TYPES: KoNECTNoticeType[] = [
	"general",
	"education",
	"certification",
];

const konectCollectInputSchema = z.object({
	since: z
		.string()
		.optional()
		.describe(
			"Start date or ISO 8601 datetime for KoNECT notice/course filtering.",
		),

	until: z
		.string()
		.optional()
		.describe(
			"End date or ISO 8601 datetime for KoNECT notice/course filtering.",
		),

	includeCourses: z
		.boolean()
		.optional()
		.default(true)
		.describe("Whether CRA education/course information should be collected."),

	onlyOpenCourses: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			"When true, return only CRA courses whose application period is currently open.",
		),

	includeNoticeTypes: z
		.array(z.enum(["general", "education", "certification"]))
		.optional()
		.default(["general", "education", "certification"])
		.describe("KoNECT notice categories to collect."),

	includeIrrelevant: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether CRA-irrelevant items should also be returned."),
});

type KoNECTCollectInput = z.infer<typeof konectCollectInputSchema>;

export class KoNECTRegulatoryAgent extends Think<Env> {
	getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
	}

	getTools() {
		return {
			collectKoNECTUpdates: tool({
				description: `
Collect official KoNECT Clinical Education Center notices and
CRA education/course information.

Use this tool when the user asks about:
- KoNECT notices
- CRA education or training
- CRA 신규자 / 심화 / 보수 courses
- GCP-related education announcements
- current CRA course application status
- KoNECT certification or education announcements

KoNECT education courses are professional-development information,
not regulatory requirements.
        `.trim(),

				inputSchema: konectCollectInputSchema,

				execute: async (input: KoNECTCollectInput) => {
					return this.collectKoNECT(input);
				},
			}),
		};
	}

	/**
	 * Workflow용 deterministic 경로.
	 *
	 * Agent tool selection을 거치지 않고
	 * Collector -> RegulatoryItem conversion -> Analyzer
	 * 순서로 직접 실행한다.
	 */
	async collectAndAnalyzeForWorkflow(
		input: KoNECTWorkflowInput,
	): Promise<KoNECTWorkflowResult> {
		const includeNoticeTypes = input.includeNoticeTypes?.length
			? input.includeNoticeTypes
			: DEFAULT_NOTICE_TYPES;

		const includeCourses = input.includeCourses ?? true;

		console.log("[KoNECTRegulatoryAgent] workflow started", {
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		const collector = new KoNECTCollector();

		const collection = await collector.collect({
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		const regulatoryItems: RegulatoryItem[] = [
			...collection.notices.map(noticeToRegulatoryItem),
			...collection.courses.map(courseToRegulatoryItem),
		];

		const analyzer = new RegulatoryAnalyzer(this.getModel());

		const analysis = await analyzer.analyze(regulatoryItems, {
			includeIrrelevant: input.includeIrrelevant ?? false,

			onBatchProgress: async (completedBatches, totalBatches) => {
				console.log("[KoNECTRegulatoryAgent] analyzing", {
					completedBatches,
					totalBatches,
				});
			},
		});

		const warnings = collection.failures.map(
			(failure) => `${failure.target}: ${failure.message}`,
		);

		console.log("[KoNECTRegulatoryAgent] workflow completed", {
			totalFetched: collection.totalFetched,
			candidateCount: regulatoryItems.length,
			relevantCount: analysis.relevantCount,
			warningCount: warnings.length,
		});

		return {
			source: "KONECT",
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			candidateCount: regulatoryItems.length,
			relevantCount: analysis.relevantCount,
			items: analysis.items,
			failures: collection.failures,
			warnings,
		};
	}

	/**
	 * Interactive chat/tool 경로.
	 *
	 * KoNECT normalized data를 그대로 반환한다.
	 * 사용자가 현재 신청 가능한 CRA 교육 등을 물었을 때
	 * LLM이 직접 course 상태를 해석할 수 있다.
	 */
	private async collectKoNECT(input: KoNECTCollectInput) {
		const includeNoticeTypes = input.includeNoticeTypes?.length
			? input.includeNoticeTypes
			: DEFAULT_NOTICE_TYPES;

		const includeCourses = input.includeCourses ?? true;

		const collector = new KoNECTCollector();

		const collection = await collector.collect({
			since: input.since,
			until: input.until,
			includeCourses,
			onlyOpenCourses: input.onlyOpenCourses ?? true,
			includeNoticeTypes,
		});

		return {
			source: "KONECT" as const,
			collectedAt: collection.collectedAt,
			totalFetched: collection.totalFetched,
			totalReturned: collection.totalReturned,
			filters: {
				since: input.since,
				until: input.until,
				includeCourses,
				onlyOpenCourses: input.onlyOpenCourses ?? true,
				includeNoticeTypes,
			},
			notices: collection.notices,
			courses: collection.courses,
			failures: collection.failures,
			warnings: collection.failures.map(
				(failure) => `${failure.target}: ${failure.message}`,
			),
		};
	}
}

/* -------------------------------------------------------------------------- */
/*                     KoNECT notice -> RegulatoryItem                        */
/* -------------------------------------------------------------------------- */

function noticeToRegulatoryItem(notice: KoNECTNoticeItem): RegulatoryItem {
	const description = [
		`KoNECT notice category: ${notice.type}.`,

		notice.author ? `Author: ${notice.author}.` : undefined,

		typeof notice.views === "number" ? `Views: ${notice.views}.` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		id: `KONECT:NOTICE:${notice.id}`,
		source: "KONECT",
		sourceType: "notice",
		sourceId: notice.id,
		title: notice.title,
		description,
		publishedAt: normalizeKoNECTDate(notice.publishedAt),
		url: notice.url,
		collectedAt: notice.collectedAt,
		metadata: {
			noticeType: notice.type,
			author: notice.author,
			views: notice.views,
		},
	};
}

/* -------------------------------------------------------------------------- */
/*                     KoNECT course -> RegulatoryItem                        */
/* -------------------------------------------------------------------------- */

function courseToRegulatoryItem(course: KoNECTCourseItem): RegulatoryItem {
	const description = [
		`${course.category}${course.level ? ` > ${course.level}` : ""}.`,

		course.durationDays !== undefined
			? `Duration: ${course.durationDays} day(s).`
			: undefined,

		course.durationHours !== undefined
			? `Training hours: ${course.durationHours}.`
			: undefined,

		course.capacity !== undefined ? `Capacity: ${course.capacity}.` : undefined,

		course.applicationStart && course.applicationEnd
			? `Application period: ${course.applicationStart} to ${course.applicationEnd}.`
			: undefined,

		course.courseStart && course.courseEnd
			? `Course period: ${course.courseStart} to ${course.courseEnd}.`
			: undefined,

		course.price !== undefined ? `Price: ${course.price} KRW.` : undefined,

		course.status ? `Current course status: ${course.status}.` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		id: `KONECT:COURSE:${course.id}`,

		source: "KONECT",

		sourceType: "education",

		sourceId: course.id,

		title: course.title,

		description,

		/*
		 * 교육에는 게시일이 없으므로 현재는 courseStart를 사용.
		 *
		 * 이후 snapshot/change detection을 붙이면
		 * publishedAt 대신 firstSeenAt을 활용하는 쪽이 더 적절하다.
		 */
		publishedAt: normalizeKoNECTDate(course.courseStart),

		url: course.url,

		collectedAt: course.collectedAt,

		metadata: {
			category: course.category,

			level: course.level,

			courseType: course.courseType,

			durationDays: course.durationDays,

			durationHours: course.durationHours,

			capacity: course.capacity,

			applicationStart: course.applicationStart,

			applicationEnd: course.applicationEnd,

			courseStart: course.courseStart,

			courseEnd: course.courseEnd,

			price: course.price,

			status: course.status,

			statusClass: course.statusClass,
		},
	};
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function normalizeKoNECTDate(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}

	const timestamp = Date.parse(value);

	if (Number.isNaN(timestamp)) {
		return undefined;
	}

	return new Date(timestamp).toISOString();
}
