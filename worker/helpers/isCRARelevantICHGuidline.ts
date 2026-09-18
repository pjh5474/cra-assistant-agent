import { CRA_RELEVANT_ICH_PREFIXES } from "../constants.ts";

export function isCRARelevantICHGuideline(code: string): boolean {
	return CRA_RELEVANT_ICH_PREFIXES.some((prefix) => code.startsWith(prefix));
}
