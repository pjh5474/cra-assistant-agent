import type { SourceWorkflowResult } from "./workflow.ts";

export interface ICHWorkflowResult extends SourceWorkflowResult {
	source: "ICH";
}
