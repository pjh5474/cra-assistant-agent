/**
 * MFDS RSS 종류
 *
 * MFDS 공식 RSS 목록:
 * https://www.mfds.go.kr/www/rss/list.do
 */
export type MFDSFeedType =
	| "recent-law"
	| "official-notice"
	| "law-revision"
	| "safety-letter"
	| "civil-guidance"
	| "guideline"
	| "law";
