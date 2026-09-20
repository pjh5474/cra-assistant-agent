import type { MFDSFeed } from "./types/mfds.ts";

export const SUB_AGENT_MODEL = "@cf/zai-org/glm-4.7-flash";

export const RAG_EMBEDDING_MODEL = "@cf/baai/bge-m3";

export const RAG_SKIP_HEADINGS = new Set(["Metadata", "Contents"]);

export const MAX_RANGE_DAYS = 30;

export const MFDS_FEEDS: readonly MFDSFeed[] = [
	{
		type: "recent-law",
		title: "최근 개정 법령",
		sourceType: "law",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=data0008",
	},
	{
		type: "official-notice",
		title: "고시전문",
		sourceType: "notice",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=data0005",
	},
	{
		type: "law-revision",
		title: "법률 제·개정 현황",
		sourceType: "law",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=relaw0001",
	},
	{
		type: "safety-letter",
		title: "안전성 서한",
		sourceType: "safety",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=seohan001",
	},
	{
		type: "civil-guidance",
		title: "민원인안내서",
		sourceType: "guidance",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=data0011",
	},
	{
		type: "guideline",
		title: "안내서/지침",
		sourceType: "guideline",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=data0013",
	},
	{
		type: "law",
		title: "법, 시행령, 시행규칙",
		sourceType: "law",
		url: "https://www.mfds.go.kr/www/rss/brd.do?brdId=data0003",
	},
] as const;

export const ICH_EFFICACY_API_URL =
	"https://admin.ich.org/api/v1/nodes" +
	"?loadEntities%5B%5D=paragraph" +
	"&alias=/page/efficacy-guidelines";

export const CRA_RELEVANT_ICH_PREFIXES = [
	"E2",
	"E3",
	"E6",
	"E8",
	"E9",
	"E11",
	"E17",
	"E19",
	"M1",
	"M11",
];

export const ICH_MEMBERS = [
	{
		value: "MFDS, Republic of Korea",
		label: "MFDS, Republic of Korea",
		aliases: ["korea", "kr", "mfds", "south korea"],
	},
	{
		value: "FDA, United States",
		label: "FDA, United States",
		aliases: ["us", "usa", "united states", "fda"],
	},
	{
		value: "MHLW/PMDA, Japan",
		label: "MHLW/PMDA, Japan",
		aliases: ["japan", "jp", "pmda", "mhlw"],
	},
	{
		value: "Health Canada, Canada",
		label: "Health Canada, Canada",
		aliases: ["canada", "ca", "health canada"],
	},
	{
		value: "EC, Europe",
		label: "EC, Europe",
		aliases: ["europe", "eu", "ec", "ema"],
	},
	{
		value: "ANVISA, Brazil",
		label: "ANVISA, Brazil",
		aliases: ["brazil", "br", "anvisa"],
	},
	{
		value: "NMPA, China",
		label: "NMPA, China",
		aliases: ["china", "cn", "nmpa"],
	},
	{
		value: "HSA, Singapore",
		label: "HSA, Singapore",
		aliases: ["singapore", "sg", "hsa"],
	},
	{
		value: "Swissmedic, Switzerland",
		label: "Swissmedic, Switzerland",
		aliases: ["switzerland", "ch", "swissmedic"],
	},
] as const;

export const ICH_GUIDELINE_FAMILIES = [
	{
		value: "E2",
		label: "E2 - Clinical Safety Data Management",
		craRelevance: "Safety reporting / pharmacovigilance",
	},
	{
		value: "E3",
		label: "E3 - Clinical Study Reports",
		craRelevance: "Clinical study documentation",
	},
	{
		value: "E6",
		label: "E6 - Good Clinical Practice",
		craRelevance: "Core GCP / monitoring / trial conduct",
	},
	{
		value: "E8",
		label: "E8 - General Considerations for Clinical Studies",
		craRelevance: "Clinical study design and quality",
	},
	{
		value: "E9",
		label: "E9 - Statistical Principles for Clinical Trials",
		craRelevance: "Trial analysis / data interpretation",
	},
	{
		value: "E11",
		label: "E11 - Clinical Investigation in Pediatric Population",
		craRelevance: "Pediatric clinical trials",
	},
	{
		value: "E17",
		label: "E17 - Multi-Regional Clinical Trials",
		craRelevance: "Global / multi-regional trial operations",
	},
	{
		value: "E19",
		label: "E19 - Safety Data Collection",
		craRelevance: "Safety data collection",
	},
] as const;

export const DEFAULT_ICH_MEMBER = "MFDS, Republic of Korea";

export const DEFAULT_ICH_GUIDELINE_PREFIXES = ["E6"];

export type ICHMember = (typeof ICH_MEMBERS)[number]["value"];

export type ICHGuidelinePrefix =
	(typeof ICH_GUIDELINE_FAMILIES)[number]["value"];

export function normalizeICHMember(value: string): ICHMember | undefined {
	const normalized = value.trim().toLowerCase();

	const match = ICH_MEMBERS.find(
		(member) =>
			member.value.toLowerCase() === normalized ||
			member.aliases.some((alias) => alias.toLowerCase() === normalized),
	);

	return match?.value;
}

export const KONECT_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
		"(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",

	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

	"Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",

	Referer: "https://lms.konect.or.kr/web/index.do",
};

export const KONECT_BASE_URL = "https://lms.konect.or.kr";

export const NOTICE_PATH = "/web/center/noticeList.do";

export const COURSE_PATH = "/web/course/courseList.do";

export const NOTICE_TYPES = {
	general: "D",
	education: "N",
	certification: "Y",
} as const;

export const CRA_CATEGORY_ID = "306";

export const NOTICE_TARGETS = [
	{
		type: "general",
		certifiedYn: "D",
	},
	{
		type: "education",
		certifiedYn: "N",
	},
	{
		type: "certification",
		certifiedYn: "Y",
	},
] as const;
