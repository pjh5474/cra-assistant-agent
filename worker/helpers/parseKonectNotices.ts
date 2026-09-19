import { parse } from "node-html-parser";
import type { KoNECTNoticeItem, KoNECTNoticeType } from "../types/konect.ts";
import { KONECT_BASE_URL } from "../constants.ts";
import { cleanText } from "./cleanText.ts";
import { removeJSessionId } from "./removeJSessionId.ts";

export function parseKoNECTNotices(
	html: string,
	noticeType: KoNECTNoticeType,
	collectedAt: string,
): KoNECTNoticeItem[] {
	const root = parse(html);

	const rows = root.querySelectorAll(".bbs_list.table.notice_li > li");

	const results: KoNECTNoticeItem[] = [];

	for (const row of rows) {
		// 첫 번째 header row 제외
		if (row.classList.contains("cate")) {
			continue;
		}

		const title = cleanText(row.querySelector(".tit .tit_n")?.text);

		if (!title) {
			continue;
		}

		const onclick = row.getAttribute("onclick");

		const relativeUrl = extractLocationHref(onclick);

		if (!relativeUrl) {
			continue;
		}

		const url = removeJSessionId(
			new URL(relativeUrl, KONECT_BASE_URL).toString(),
		);

		const id = extractBoardIdx(url);

		if (!id) {
			continue;
		}

		const publishedAt = normalizeDate(
			cleanText(row.querySelector(".date")?.text),
		);

		const author = cleanText(row.querySelector(".name")?.text);

		const views = extractNumber(row.querySelector(".view")?.text);

		results.push({
			id,

			type: noticeType,

			title,

			publishedAt,

			author: author || undefined,

			views,

			url,

			collectedAt,
		});
	}

	return results;
}

function extractLocationHref(onclick?: string): string | undefined {
	if (!onclick) {
		return undefined;
	}

	const match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);

	return match?.[1];
}

function extractBoardIdx(url: string): string | undefined {
	try {
		return new URL(url).searchParams.get("boardIdx") ?? undefined;
	} catch {
		return undefined;
	}
}

function normalizeDate(value: string): string | undefined {
	if (!value) {
		return undefined;
	}

	const match = value.match(/^\d{4}-\d{2}-\d{2}$/);

	return match ? value : undefined;
}

function extractNumber(value?: string): number | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.replace(/,/g, "");

	const match = normalized.match(/\d+/);

	if (!match) {
		return undefined;
	}

	return Number(match[0]);
}
