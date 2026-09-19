import { parse } from "node-html-parser";
import { KONECT_BASE_URL } from "../constants.ts";
import type { KoNECTCourseItem } from "../types/konect.ts";
import { cleanText } from "../helpers/cleanText.ts";
import { removeJSessionId } from "./removeJSessionId.ts";

export function parseKoNECTCourses(
	html: string,
	collectedAt: string,
): KoNECTCourseItem[] {
	const root = parse(html);

	const rows = root.querySelectorAll(".course_list .flex_box_1");

	const results: KoNECTCourseItem[] = [];

	for (const row of rows) {
		const categoryText = cleanText(row.querySelector(".course_name01")?.text);

		const anchor = row.querySelector(".course_name a");

		if (!anchor) {
			continue;
		}

		const title = cleanText(anchor.text);

		const href = anchor.getAttribute("href");

		if (!title || !href) {
			continue;
		}

		const url = removeJSessionId(new URL(href, KONECT_BASE_URL).toString());

		const id = extractEduCd(url);

		if (!id) {
			continue;
		}

		const durationDays = extractNumber(row.querySelector(".edu_icon01")?.text);

		const durationHours = extractNumber(row.querySelector(".edu_icon02")?.text);

		const capacity = extractNumber(row.querySelector(".edu_icon03")?.text);

		const infoItems = row.querySelectorAll(".course_info li");

		let applicationStart: string | undefined;

		let applicationEnd: string | undefined;

		let courseStart: string | undefined;

		let courseEnd: string | undefined;

		let price: number | undefined;

		for (const item of infoItems) {
			const text = cleanText(item.text);

			if (text.startsWith("신청기간")) {
				const range = extractDateRange(text);
				applicationStart = range?.start;
				applicationEnd = range?.end;
			}

			if (text.startsWith("교육기간")) {
				const range = extractDateRange(text);
				courseStart = range?.start;
				courseEnd = range?.end;
			}

			if (text.startsWith("수강료")) {
				price = extractNumber(text);
			}
		}

		const statusElement = row.querySelector(".right_btn_box p");

		const status = cleanText(statusElement?.text);

		const statusClass = statusElement?.getAttribute("class")?.trim();

		const { category, level } = parseCategory(categoryText);

		results.push({
			id,
			title,
			category: category ?? "임상시험 모니터요원(CRA)",
			level,
			courseType: "CRA",
			durationDays,
			durationHours,
			capacity,
			applicationStart,
			applicationEnd,
			courseStart,
			courseEnd,
			price,
			status: status || undefined,
			statusClass: statusClass || undefined,
			url,
			collectedAt,
		});
	}

	return results;
}

/// Helpers
// ------------------------------------------------------------

function extractNumber(value?: string): number | undefined {
	if (!value) {
		return undefined;
	}

	const match = value.replace(/,/g, "").match(/\d+/);

	if (!match) {
		return undefined;
	}

	return Number(match[0]);
}

function extractEduCd(url: string): string | undefined {
	try {
		return new URL(url).searchParams.get("eduCd") ?? undefined;
	} catch {
		return undefined;
	}
}

function extractDateRange(value: string):
	| {
			start: string;
			end: string;
	  }
	| undefined {
	const match = value.match(
		/(\d{2}\.\d{2}\.\d{2})\s*~\s*(\d{2}\.\d{2}\.\d{2})/,
	);

	if (!match) {
		return undefined;
	}

	return {
		start: normalizeShortDate(match[1]),

		end: normalizeShortDate(match[2]),
	};
}

function normalizeShortDate(value: string): string {
	const [yy, mm, dd] = value.split(".");

	return `20${yy}-${mm}-${dd}`;
}

function parseCategory(value: string): {
	category?: string;
	level?: string;
} {
	const normalized = value.replace(/^\[/, "").replace(/\]$/, "").trim();

	const parts = normalized.split(">").map((item) => item.trim());

	return {
		category: parts[0] || undefined,

		level: parts[1] || undefined,
	};
}
