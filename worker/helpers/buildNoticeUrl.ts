import { KONECT_BASE_URL } from "../constants.ts";

export function buildNoticeUrl(certifiedYn: string, pageIndex = 1): string {
	const url = new URL("/web/center/noticeList.do", KONECT_BASE_URL);

	url.searchParams.set("certifiedYn", certifiedYn);

	url.searchParams.set("pageIndex", String(pageIndex));

	return url.toString();
}
