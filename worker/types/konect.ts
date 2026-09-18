import type { SourceWorkflowResult } from "./workflow.ts";

export interface KoNECTWorkflowResult extends SourceWorkflowResult {
	source: "KONECT";
}
