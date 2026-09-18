import type { RegulatoryWorkflowState } from "../types/workflow.ts";

export function createInitialWorkflowState(): RegulatoryWorkflowState {
	return {
		stage: "idle",

		progress: 0,

		sources: {},

		steps: {
			sourceProcessing: {
				status: "pending",
			},

			synthesis: {
				status: "pending",
			},

			enrichment: {
				status: "pending",
			},

			approval: {
				status: "pending",
			},

			reporting: {
				status: "pending",
			},

			email: {
				status: "pending",
			},
		},
	};
}
