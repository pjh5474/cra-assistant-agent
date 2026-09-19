import type {
	BriefingCandidate,
	BriefingSelectionResult,
} from "../types/regulatory-briefing.ts";

export function selectBriefingItems(
	candidates: BriefingCandidate[],
): BriefingSelectionResult {
	const mainItems: BriefingCandidate[] = [];

	const referenceItems: BriefingCandidate[] = [];

	const hiddenItems: BriefingCandidate[] = [];

	for (const item of candidates) {
		if (!item.relevant) {
			hiddenItems.push(item);
			continue;
		}

		if (
			item.source === "MFDS" &&
			item.changeStatus === "unchanged" &&
			item.priority === "low"
		) {
			hiddenItems.push(item);
			continue;
		}

		if (
			item.priority === "high" &&
			(item.changeStatus === "new" || item.changeStatus === "changed")
		) {
			mainItems.push(item);
			continue;
		}

		if (item.source === "ICH" && item.priority === "high") {
			mainItems.push(item);
			continue;
		}

		referenceItems.push(item);
	}

	return {
		mainItems,
		referenceItems,
		hiddenItems,
	};
}
