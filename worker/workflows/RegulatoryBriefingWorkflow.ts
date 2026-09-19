import {
	AgentWorkflow,
	type AgentWorkflowEvent,
	type AgentWorkflowStep,
} from "agents/workflows";
import type { CraAssistantAgent } from "../index.ts";
import type {
	RegulatoryBriefingParams,
	RegulatoryWorkflowProgress,
	SourceWorkflowResult,
} from "../types/workflow.ts";
import { createInitialWorkflowState } from "../helpers/createInitialWorkflowState.ts";
import { buildRegulatoryBriefing } from "../helpers/buildRegulatoryBriefing.ts";
import { selectBriefingItems } from "../helpers/selectBriefingItems.ts";

export class RegulatoryBriefingWorkflow extends AgentWorkflow<
	CraAssistantAgent,
	RegulatoryBriefingParams,
	RegulatoryWorkflowProgress
> {
	async run(
		event: AgentWorkflowEvent<RegulatoryBriefingParams>,
		step: AgentWorkflowStep,
	) {
		const params = event.payload;

		const startedAt = new Date().toISOString();

		// =====================================================
		// 1. Initialize
		// =====================================================

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...createInitialWorkflowState(),
				stage: "initializing",
				progress: 0,
				startedAt,
			},
		});

		await this.reportProgress({
			stage: "initializing",
			step: "sourceProcessing",
			percent: 0,
			message: "Initializing regulatory briefing workflow",
		});

		// =====================================================
		// 2. Source Processing
		//
		// Each source-specific agent performs:
		// collect → normalize → source-level analysis
		// =====================================================

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,

				stage: "sourceProcessing",

				progress: 0.1,

				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,

					sourceProcessing: {
						status: "running",
						message: "Processing regulatory sources",
						progress: 0,
						startedAt: new Date().toISOString(),
					},
				},
			},
		});

		await this.reportProgress({
			stage: "sourceProcessing",
			step: "sourceProcessing",
			percent: 0.1,
			message: "Processing regulatory sources",
		});

		// -----------------------------------------------------
		// MFDS
		// -----------------------------------------------------

		const mfdsResult = params.sources.includes("MFDS")
			? await step.do(
					"process-mfds",
					{
						timeout: "5 minutes",
					},

					async () => {
						try {
							return await this.agent.collectMFDSForWorkflow({
								since: params.since,
								until: params.until,
								includeIrrelevant: false,
							});
						} catch (error) {
							console.error(
								"[RegulatoryBriefingWorkflow] MFDS processing failed",
								error,
							);

							throw error;
						}
					},
				)
			: undefined;

		if (mfdsResult) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					progress: 0.35,
					sources: {
						...this.agent.getState().regulatoryWorkflow.sources,

						mfds: {
							source: "MFDS",
							fetched: mfdsResult.totalFetched,
							candidates: mfdsResult.candidateCount,
							relevant: mfdsResult.relevantCount,
							completedAt: new Date().toISOString(),
							items: mfdsResult.items,
							warnings: mfdsResult.failures.map(
								(failure) => `${failure.feedTitle}: ${failure.message}`,
							),
						},
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: 0.35,
				message:
					`MFDS processing completed: ` +
					`${mfdsResult.manifest?.newCount ?? 0} new, ` +
					`${mfdsResult.manifest?.changedCount ?? 0} changed, ` +
					`${mfdsResult.manifest?.unchangedCount ?? 0} unchanged, ` +
					`${mfdsResult.relevantCount} CRA-relevant analyzed update(s)`,
			});
		}

		// -----------------------------------------------------
		// ICH
		// -----------------------------------------------------

		const ichResult = params.sources.includes("ICH")
			? await step.do(
					"process-ich",
					{
						timeout: "5 minutes",
					},
					async () => {
						return await this.agent.collectICHForWorkflow({
							member: "MFDS, Republic of Korea",
							guidelinePrefixes: ["E6"],
							includeIrrelevant: false,
						});
					},
				)
			: undefined;

		if (ichResult) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					progress: 0.55,
					sources: {
						...this.agent.getState().regulatoryWorkflow.sources,
						ich: {
							source: "ICH",
							fetched: ichResult.totalFetched,
							candidates: ichResult.candidateCount,
							relevant: ichResult.relevantCount,
							completedAt: new Date().toISOString(),
							items: ichResult.items,
							warnings: ichResult.warnings,
						},
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: 0.55,
				message:
					`ICH processing completed: ` +
					`${ichResult.manifest?.newCount ?? 0} new, ` +
					`${ichResult.manifest?.changedCount ?? 0} changed, ` +
					`${ichResult.manifest?.unchangedCount ?? 0} unchanged, ` +
					`${ichResult.relevantCount} CRA-relevant analyzed update(s)`,
			});
		}

		// -----------------------------------------------------
		// KoNECT
		// -----------------------------------------------------

		const konectResult = params.sources.includes("KONECT")
			? await step.do(
					"process-konect",
					{
						retries: {
							limit: 1,
							delay: 1000,
							backoff: "exponential",
						},
					},
					async () =>
						this.agent.collectKoNECTForWorkflow({
							since: params.since,
							until: params.until,
							includeCourses: true,
							onlyOpenCourses: true,
							includeNoticeTypes: ["general", "education", "certification"],
							includeIrrelevant: false,
						}),
				)
			: undefined;

		if (konectResult) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					stage: "sourceProcessing",
					progress: 0.7,
					sources: {
						...this.agent.getState().regulatoryWorkflow.sources,
						konect: {
							source: "KONECT",
							fetched: konectResult.totalFetched,
							candidates: konectResult.candidateCount,
							relevant: konectResult.relevantCount,
							completedAt: new Date().toISOString(),
							items: konectResult.items,
							warnings: konectResult.warnings,
						},
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: 0.7,
				message:
					`KoNECT processing complete: ` +
					`${konectResult.manifest?.newCount ?? 0} new, ` +
					`${konectResult.manifest?.changedCount ?? 0} changed, ` +
					`${konectResult.manifest?.unchangedCount ?? 0} unchanged, ` +
					`${konectResult.relevantCount} relevant item(s)`,
			});
		}

		// -----------------------------------------------------
		// Source processing complete
		// -----------------------------------------------------

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,
				progress: 0.75,
				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,

					sourceProcessing: {
						status: "completed",
						message: "Regulatory source processing completed",
						progress: 1,
						completedAt: new Date().toISOString(),
					},
				},
			},
		});

		// =====================================================
		// 3. Cross-source Synthesis
		// =====================================================

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,
				stage: "synthesizing",
				progress: 0.8,
				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,
					synthesis: {
						status: "running",
						message: "Synthesizing regulatory findings",
						progress: 0,
						startedAt: new Date().toISOString(),
					},
				},
			},
		});

		await this.reportProgress({
			stage: "synthesizing",
			step: "synthesis",
			percent: 0.8,
			message: "Synthesizing regulatory findings",
		});

		const allCandidates = [
			...(mfdsResult?.briefingCandidates ?? []),
			...(ichResult?.briefingCandidates ?? []),
			...(konectResult?.briefingCandidates ?? []),
		];

		const selection = selectBriefingItems(allCandidates);

		console.log("[RegulatoryBriefingWorkflow] briefing selection", {
			mainItems: selection.mainItems.map((item) => ({
				source: item.source,
				sourceId: item.sourceId,
				title: item.title,
				priority: item.priority,
				changeStatus: item.changeStatus,
				fromCache: item.fromCache,
			})),

			referenceItems: selection.referenceItems.map((item) => ({
				source: item.source,
				sourceId: item.sourceId,
				title: item.title,
				relevant: item.relevant,
				relevanceScore: item.relevanceScore,
				priority: item.priority,
				changeStatus: item.changeStatus,
				fromCache: item.fromCache,
			})),

			hiddenItems: selection.hiddenItems.map((item) => ({
				source: item.source,
				sourceId: item.sourceId,
				title: item.title,
				relevant: item.relevant,
				priority: item.priority,
				changeStatus: item.changeStatus,
				fromCache: item.fromCache,
			})),
		});

		const synthesisResult = await step.do(
			"synthesize-regulatory-findings",
			async () => {
				const sources: SourceWorkflowResult[] = [];

				if (mfdsResult) {
					sources.push(mfdsResult);
				}

				if (ichResult) {
					sources.push(ichResult);
				}

				if (konectResult) {
					sources.push(konectResult);
				}

				return {
					sources,
				};
			},
		);

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,
				progress: 1,
				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,

					synthesis: {
						status: "completed",
						message: "Regulatory findings synthesized",
						progress: 1,
						completedAt: new Date().toISOString(),
					},
				},
			},
		});

		// =====================================================
		// 4. RAG Enrichment
		// =====================================================

		if (params.includeRag) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					stage: "enriching",

					progress: 0.7,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						enrichment: {
							status: "running",

							message: "Enriching analysis with user regulatory documents",

							progress: 0,

							startedAt: new Date().toISOString(),
						},
					},
				},
			});

			await this.reportProgress({
				stage: "enriching",

				step: "enrichment",

				percent: 0.7,

				message: "Enriching analysis with user regulatory documents",
			});

			await step.do(
				"rag-enrichment",

				async () => {
					/*
					 * RAG 연결 예정
					 */

					return {};
				},
			);

			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,
						enrichment: {
							status: "completed",
							message: "RAG enrichment completed",
							progress: 1,
							completedAt: new Date().toISOString(),
						},
					},
				},
			});
		} else {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						enrichment: {
							status: "skipped",
							message: "RAG enrichment disabled",
						},
					},
				},
			});
		}

		// =====================================================
		// 5. Approval
		// =====================================================

		if (params.requireApproval) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					stage: "awaitingApproval",
					progress: 0.75,
					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						approval: {
							status: "running",
							message: "Waiting for user approval",
							startedAt: new Date().toISOString(),
						},
					},
				},
			});

			await this.reportProgress({
				stage: "awaitingApproval",
				step: "approval",
				percent: 0.75,
				message: "Waiting for user approval before report delivery",
			});

			await this.waitForApproval(step, {
				timeout: "7 days",
			});

			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						approval: {
							status: "completed",
							message: "Approved",
							progress: 1,
							completedAt: new Date().toISOString(),
						},
					},
				},
			});
		} else {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						approval: {
							status: "skipped",
							message: "Approval not required",
						},
					},
				},
			});
		}

		// =====================================================
		// 6. Generate Briefing
		// =====================================================

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,
				stage: "reporting",
				progress: 0.8,
				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,
					reporting: {
						status: "running",
						message: "Generating weekly regulatory briefing",
						progress: 0,
						startedAt: new Date().toISOString(),
					},
				},
			},
		});

		await this.reportProgress({
			stage: "reporting",
			step: "reporting",
			percent: 0.8,
			message: "Generating weekly regulatory briefing",
		});

		const briefing = await step.do(
			"generate-regulatory-briefing",

			async () => {
				return buildRegulatoryBriefing({
					mainItems: selection.mainItems,
					referenceItems: selection.referenceItems,

					since: params.since,
					until: params.until,

					sources: synthesisResult.sources,
				});
			},
		);

		console.log("[RegulatoryBriefingWorkflow] generated briefing", {
			summary: briefing.summary,

			highlights: briefing.highlights.map((item) => ({
				source: item.source,
				title: item.title,
				priority: item.priority,
			})),

			references: briefing.references.map((item) => ({
				source: item.source,
				title: item.title,
				priority: item.priority,
				changeStatus: item.changeStatus,
				fromCache: item.fromCache,
			})),

			stats: briefing.stats,
		});

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,
				progress: 0.9,
				briefing,
				steps: {
					...this.agent.getState().regulatoryWorkflow.steps,

					reporting: {
						status: "completed",
						message: "Weekly regulatory briefing generated",
						progress: 1,
						completedAt: new Date().toISOString(),
					},
				},
			},
		});

		// =====================================================
		// 7. Email Delivery
		// =====================================================

		if (params.sendEmail) {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					stage: "emailing",

					progress: 0.95,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						email: {
							status: "running",

							message: "Sending regulatory briefing email",

							startedAt: new Date().toISOString(),
						},
					},
				},
			});

			await this.reportProgress({
				stage: "emailing",

				step: "email",

				percent: 0.95,

				message: "Sending regulatory briefing email",
			});

			await step.do(
				"send-email",

				async () => {
					/*
					 * Mailing integration 예정.
					 */

					return {
						sent: false,
					};
				},
			);

			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						email: {
							status: "completed",

							message: "Email delivery completed",

							progress: 1,

							completedAt: new Date().toISOString(),
						},
					},
				},
			});
		} else {
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,

					steps: {
						...this.agent.getState().regulatoryWorkflow.steps,

						email: {
							status: "skipped",

							message: "Email delivery disabled",
						},
					},
				},
			});
		}

		// =====================================================
		// 8. Complete
		// =====================================================

		const completedAt = new Date().toISOString();

		await step.mergeAgentState({
			regulatoryWorkflow: {
				...this.agent.getState().regulatoryWorkflow,

				stage: "completed",

				progress: 1,

				completedAt,

				briefing,
			},
		});

		await this.reportProgress({
			stage: "completed",

			step: "reporting",

			percent: 1,

			message: "Regulatory briefing workflow completed",
		});

		const result = {
			briefing,
			sources: {
				mfds: mfdsResult,
				ich: ichResult,
				konect: konectResult,
			},
			startedAt,
			completedAt,
		};

		/*
		 * reportComplete는 모든 단계가 실제로 끝난 뒤
		 * 한 번만 호출합니다.
		 */
		await step.reportComplete(result);

		return result;
	}
}
