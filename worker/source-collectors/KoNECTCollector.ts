import type {
	KoNECTCollectionFailure,
	KoNECTCollectionResult,
	KoNECTCourseItem,
	KoNECTNoticeItem,
	KoNECTNoticeType,
} from "../types/konect.ts";
import { parseKoNECTCourses } from "../helpers/parseKoNECTCourses.ts";
import { parseKoNECTNotices } from "../helpers/parseKonectNotices.ts";
import {
	NOTICE_TARGETS,
	NOTICE_PATH,
	COURSE_PATH,
	CRA_CATEGORY_ID,
	KONECT_BASE_URL,
	KONECT_HEADERS,
} from "../constants.ts";
import { fetchKoNECT } from "../helpers/fetchKoNECT.ts";

export interface KoNECTCollectorInput {
	since?: string;
	until?: string;
	includeCourses?: boolean;
	onlyOpenCourses?: boolean;
	includeNoticeTypes?: KoNECTNoticeType[];
	noticePageIndex?: number;
	coursePageIndex?: number;
}

export class KoNECTCollector {
	async collect(
		input: KoNECTCollectorInput = {},
	): Promise<KoNECTCollectionResult> {
		const collectedAt = new Date().toISOString();

		const notices: KoNECTNoticeItem[] = [];

		const courses: KoNECTCourseItem[] = [];

		const failures: KoNECTCollectionFailure[] = [];

		const includeNoticeTypes = input.includeNoticeTypes?.length
			? input.includeNoticeTypes
			: NOTICE_TARGETS.map((target) => target.type);

		const noticeTargets = NOTICE_TARGETS.filter((target) =>
			includeNoticeTypes.includes(target.type),
		);

		const testResponse = await fetch("https://lms.konect.or.kr/web/index.do", {
			headers: KONECT_HEADERS,
			redirect: "follow",
		});

		console.log("[KoNECTCollector] index probe", {
			status: testResponse.status,
			statusText: testResponse.statusText,
			finalUrl: testResponse.url,
			redirected: testResponse.redirected,
		});

		/*
		 * Notice 3종은 서로 독립적이므로
		 * 하나 실패해도 다른 source는 계속 수집한다.
		 */
		const noticeResults = await Promise.allSettled(
			noticeTargets.map(async (target) => {
				const url = buildNoticeUrl(
					target.certifiedYn,
					input.noticePageIndex ?? 1,
				);

				console.log("[KoNECTCollector] fetching notice", {
					type: target.type,
					url,
				});

				const response = await fetchKoNECT(url);

				// const response = await fetch(url, {
				// 	headers: KONECT_HEADERS,
				// 	redirect: "follow",
				// });

				// if (!response.ok) {
				// 	const body = await response.text();

				// 	console.error("[KoNECTCollector] bad response", {
				// 		url,
				// 		status: response.status,
				// 		statusText: response.statusText,
				// 		bodyPreview: body.slice(0, 1000),
				// 		finalUrl: response.url,
				// 		redirected: response.redirected,
				// 		contentType: response.headers.get("content-type"),
				// 	});
				// 	throw new Error(
				// 		`KoNECT notice request failed: ${response.status} ${response.statusText}`,
				// 	);
				// }

				const html = await response.text();

				return parseKoNECTNotices(html, target.type, collectedAt);
			}),
		);

		noticeResults.forEach((result, index) => {
			const target = noticeTargets[index];

			if (result.status === "fulfilled") {
				notices.push(...result.value);

				return;
			}

			const url = buildNoticeUrl(
				target.certifiedYn,
				input.noticePageIndex ?? 1,
			);

			const message = errorMessage(result.reason);

			failures.push({
				source: "KONECT",
				target: `notice-${target.type}`,
				url,
				message,
			});

			console.error("[KoNECTCollector] notice failed", {
				type: target.type,
				message,
			});
		});

		/*
		 * CRA 교육 목록은 optional.
		 */
		if (input.includeCourses !== false) {
			const courseUrl = buildCourseUrl(input.coursePageIndex ?? 1);

			try {
				console.log("[KoNECTCollector] fetching CRA courses", courseUrl);

				const response = await fetchKoNECT(courseUrl);

				// const response = await fetch(courseUrl, {
				// 	headers: KONECT_HEADERS,
				// 	redirect: "follow",
				// });

				// if (!response.ok) {
				// 	const body = await response.text();

				// 	console.error("[KoNECTCollector] bad response", {
				// 		url: courseUrl,
				// 		status: response.status,
				// 		statusText: response.statusText,
				// 		bodyPreview: body.slice(0, 1000),
				// 		finalUrl: response.url,
				// 		redirected: response.redirected,
				// 		contentType: response.headers.get("content-type"),
				// 	});

				// 	throw new Error(
				// 		`KoNECT CRA course request failed: ${response.status} ${response.statusText}`,
				// 	);
				// }

				const html = await response.text();

				courses.push(...parseKoNECTCourses(html, collectedAt));
			} catch (error) {
				const message = errorMessage(error);

				failures.push({
					source: "KONECT",
					target: "cra-course",
					url: courseUrl,
					message,
				});

				console.error("[KoNECTCollector] CRA course failed", message);
			}
		}

		const filteredNotices = notices
			.filter((item) =>
				isWithinRange(item.publishedAt, input.since, input.until),
			)
			.sort(comparePublishedDesc);

		/*
		 * Course는 공지 publishedAt이 없으므로
		 * 신청 가능한 기간 필터링.
		 *
		 * 날짜가 없는 항목은 false-negative 방지를 위해 유지.
		 */

		const filteredCourses = input.onlyOpenCourses
			? courses
					.filter((course) => isCourseApplicationOpen(course, new Date()))
					.sort(compareCourseDateDesc)
			: courses.sort(compareCourseDateDesc);

		const totalFetched = notices.length + courses.length;

		const totalReturned = filteredNotices.length + filteredCourses.length;

		console.log("[KoNECTCollector] completed", {
			noticesFetched: notices.length,
			noticesReturned: filteredNotices.length,
			coursesFetched: courses.length,
			coursesReturned: filteredCourses.length,
			failureCount: failures.length,
		});

		return {
			source: "KONECT",
			collectedAt,
			notices: filteredNotices,
			courses: filteredCourses,
			totalFetched,
			totalReturned,
			failures,
		};
	}
}

/* -------------------------------------------------------------------------- */
/*                                URL builders                                */
/* -------------------------------------------------------------------------- */

function buildNoticeUrl(certifiedYn: string, pageIndex: number): string {
	const url = new URL(NOTICE_PATH, KONECT_BASE_URL);
	url.searchParams.set("certifiedYn", certifiedYn);
	url.searchParams.set("pageIndex", String(pageIndex));
	url.searchParams.set("searchKeyword", "");
	url.searchParams.set("searchCondition", "");
	return url.toString();
}

function buildCourseUrl(pageIndex: number): string {
	const now = new Date();
	const year = now.getUTCFullYear();
	const url = new URL(COURSE_PATH, KONECT_BASE_URL);
	url.searchParams.set("eduCertifiedYn", "N");
	url.searchParams.set("schEduCategory", CRA_CATEGORY_ID);
	url.searchParams.set("completeNumKeyword", "");
	url.searchParams.set("pageIndex", String(pageIndex));
	url.searchParams.set("category1", CRA_CATEGORY_ID);
	url.searchParams.set("schEduType", "F");

	/*
	 * CRA 교육 검색 범위는 해당 연도 전체.
	 *
	 * 추후 input으로 courseFrom / courseTo를
	 * 따로 받을 수도 있음.
	 */
	url.searchParams.set("schEduSdate", `${year}-01-01`);
	url.searchParams.set("schEduEdate", `${year}-12-31`);
	url.searchParams.set("schEduGubun", "");
	url.searchParams.set("searchKeyword", "");
	return url.toString();
}

/* -------------------------------------------------------------------------- */
/*                               Date filtering                               */
/* -------------------------------------------------------------------------- */

function isWithinRange(
	itemDate?: string,
	since?: string,
	until?: string,
): boolean {
	/*
	 * 날짜 없는 item을 제거하면 false negative가 생길 수 있으므로 유지.
	 */
	if (!itemDate) {
		return true;
	}

	const itemTime = parseDateToTime(itemDate);

	if (itemTime === undefined) {
		return true;
	}

	if (since) {
		const sinceTime = parseDateToTime(since);

		if (sinceTime !== undefined && itemTime < sinceTime) {
			return false;
		}
	}

	if (until) {
		const untilTime = parseDateToTime(until);

		if (untilTime !== undefined && itemTime > untilTime) {
			return false;
		}
	}

	return true;
}

function parseDateToTime(value: string): number | undefined {
	const timestamp = Date.parse(value);

	if (Number.isNaN(timestamp)) {
		return undefined;
	}

	return timestamp;
}

function parseDateStart(value: string): Date | undefined {
	const date = new Date(`${value}T00:00:00+09:00`);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDateEnd(value: string): Date | undefined {
	const date = new Date(`${value}T23:59:59.999+09:00`);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

function isCourseApplicationOpen(course: KoNECTCourseItem, now: Date): boolean {
	if (course.status !== "교육신청") {
		return false;
	}

	if (!course.applicationStart || !course.applicationEnd) {
		/*
		 * 상태가 "교육신청"인데 신청기간 파싱이 안 된 경우,
		 * KoNECT의 상태값을 우선 신뢰할지 결정해야 합니다.
		 *
		 * false negative 방지를 위해 여기서는 true.
		 */
		return true;
	}

	const start = parseDateStart(course.applicationStart);

	const end = parseDateEnd(course.applicationEnd);

	if (!start || !end) {
		return true;
	}

	const time = now.getTime();

	return time >= start.getTime() && time <= end.getTime();
}

/* -------------------------------------------------------------------------- */
/*                                  Sorting                                   */
/* -------------------------------------------------------------------------- */

function comparePublishedDesc(
	a: KoNECTNoticeItem,
	b: KoNECTNoticeItem,
): number {
	return toSortableTime(b.publishedAt) - toSortableTime(a.publishedAt);
}

function compareCourseDateDesc(
	a: KoNECTCourseItem,
	b: KoNECTCourseItem,
): number {
	return toSortableTime(b.courseStart) - toSortableTime(a.courseStart);
}

function toSortableTime(value?: string): number {
	if (!value) {
		return 0;
	}

	const timestamp = Date.parse(value);

	return Number.isNaN(timestamp) ? 0 : timestamp;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
