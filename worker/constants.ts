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
  
  export const DEFAULT_ICH_MEMBER =
	"MFDS, Republic of Korea" as const;
  
  export const DEFAULT_ICH_GUIDELINE_PREFIXES = [
	"E6",
  ] as const;
  
  export type ICHMember =
	(typeof ICH_MEMBERS)[number]["value"];
  
  export type ICHGuidelinePrefix =
	(typeof ICH_GUIDELINE_FAMILIES)[number]["value"];
  
  export function normalizeICHMember(
	value: string,
  ): ICHMember | undefined {
	const normalized = value
	  .trim()
	  .toLowerCase();
  
	const match = ICH_MEMBERS.find(
	  (member) =>
		member.value.toLowerCase() === normalized ||
		member.aliases.some(
		  (alias) =>
			alias.toLowerCase() === normalized,
		),
	);
  
	return match?.value;
  }
