import {
	AgentWorkflow,
	type AgentWorkflowEvent,
	type AgentWorkflowStep,
} from "agents/workflows";
import { getAgentByName } from "agents";
import type { CraAssistantAgent } from "../index.ts";
import type {
	RegulatoryBriefing,
	RegulatoryBriefingParams,
	RegulatoryWorkflowProgress,
	RegulatoryWorkflowState,
	SourceWorkflowResult,
	WorkflowStepState,
} from "../types/workflow.ts";
import { createInitialWorkflowState } from "../helpers/createInitialWorkflowState.ts";
import { buildRegulatoryBriefing } from "../helpers/buildRegulatoryBriefing.ts";
import { selectBriefingItems } from "../helpers/selectBriefingItems.ts";
import { sendEmail } from "../services/emailDelivery.ts";

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

		const selectedSourceCount = Math.max(params.sources.length, 1);
		let processedSourceCount = 0;

		/*
		 * IMPORTANT:
		 * workflow business state is accumulated locally during a run.
		 *
		 * step.mergeAgentState() is used only to publish this canonical state.
		 * We intentionally do not rebuild nested `steps` / `sources` from
		 * this.agent.getState() because that snapshot can lag behind the most
		 * recent workflow merge and cause completed steps to temporarily fall
		 * back to their initial `pending` state.
		 */
		let workflowState: RegulatoryWorkflowState = {
			...createInitialWorkflowState(),
			stage: "initializing",
			progress: 0,
			startedAt,
		};

		const publishWorkflowState = async (
			patch: Partial<RegulatoryWorkflowState> = {},
		) => {
			workflowState = {
				...workflowState,
				...patch,
			};

			/*
			 * Preserve framework/runtime-owned fields such as workflowId,
			 * while our local workflowState remains authoritative for the
			 * actual workflow business state.
			 */
			await step.mergeAgentState({
				regulatoryWorkflow: {
					...this.agent.getState().regulatoryWorkflow,
					...workflowState,
				},
			});
		};

		const nextSourceProgress = () => {
			processedSourceCount += 1;

			const stepProgress = Math.min(
				processedSourceCount / selectedSourceCount,
				1,
			);

			return {
				stepProgress,
				overallProgress: 0.1 + stepProgress * 0.65,
			};
		};

		// =====================================================
		// 1. Initialize
		// =====================================================

		await publishWorkflowState();

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

		const sourceProcessingStartedAt = new Date().toISOString();

		await publishWorkflowState({
			stage: "sourceProcessing",
			progress: 0.1,
			steps: {
				...workflowState.steps,
				sourceProcessing: {
					status: "running",
					message: "Processing regulatory sources",
					progress: 0,
					startedAt: sourceProcessingStartedAt,
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
			const sourceProgress = nextSourceProgress();

			await publishWorkflowState({
				progress: sourceProgress.overallProgress,
				sources: {
					...workflowState.sources,
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
				steps: {
					...workflowState.steps,
					sourceProcessing: {
						...workflowState.steps.sourceProcessing,
						status: "running",
						message: "MFDS processing completed",
						progress: sourceProgress.stepProgress,
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: sourceProgress.overallProgress,
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
			const sourceProgress = nextSourceProgress();

			await publishWorkflowState({
				progress: sourceProgress.overallProgress,
				sources: {
					...workflowState.sources,
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
				steps: {
					...workflowState.steps,
					sourceProcessing: {
						...workflowState.steps.sourceProcessing,
						status: "running",
						message: "ICH processing completed",
						progress: sourceProgress.stepProgress,
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: sourceProgress.overallProgress,
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
			const sourceProgress = nextSourceProgress();

			await publishWorkflowState({
				stage: "sourceProcessing",
				progress: sourceProgress.overallProgress,
				sources: {
					...workflowState.sources,
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
				steps: {
					...workflowState.steps,
					sourceProcessing: {
						...workflowState.steps.sourceProcessing,
						status: "running",
						message: "KoNECT processing completed",
						progress: sourceProgress.stepProgress,
					},
				},
			});

			await this.reportProgress({
				stage: "sourceProcessing",
				step: "sourceProcessing",
				percent: sourceProgress.overallProgress,
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

		await publishWorkflowState({
			stage: "sourceProcessing",
			progress: 0.75,
			steps: {
				...workflowState.steps,
				sourceProcessing: {
					...workflowState.steps.sourceProcessing,
					status: "completed",
					message: "Regulatory source processing completed",
					progress: 1,
					startedAt: sourceProcessingStartedAt,
					completedAt: new Date().toISOString(),
				},
			},
		});

		await this.reportProgress({
			stage: "sourceProcessing",
			step: "sourceProcessing",
			percent: 0.75,
			message: "Regulatory source processing completed",
		});

		// =====================================================
		// 3. Cross-source Synthesis
		// =====================================================

		const synthesisStartedAt = new Date().toISOString();

		await publishWorkflowState({
			stage: "synthesizing",
			progress: 0.78,
			steps: {
				...workflowState.steps,
				synthesis: {
					status: "running",
					message: "Synthesizing regulatory findings",
					progress: 0,
					startedAt: synthesisStartedAt,
				},
			},
		});

		await this.reportProgress({
			stage: "synthesizing",
			step: "synthesis",
			percent: 0.78,
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

		await publishWorkflowState({
			progress: 0.84,
			steps: {
				...workflowState.steps,
				synthesis: {
					...workflowState.steps.synthesis,
					status: "completed",
					message: "Regulatory findings synthesized",
					progress: 1,
					startedAt: synthesisStartedAt,
					completedAt: new Date().toISOString(),
				},
			},
		});

		await this.reportProgress({
			stage: "synthesizing",
			step: "synthesis",
			percent: 0.84,
			message: "Regulatory findings synthesized",
		});

		// =====================================================
		// 4. Generate Briefing
		// =====================================================

		const reportingStartedAt = new Date().toISOString();

		await publishWorkflowState({
			stage: "reporting",
			progress: 0.86,
			steps: {
				...workflowState.steps,
				reporting: {
					status: "running",
					message: "Generating weekly regulatory briefing",
					progress: 0,
					startedAt: reportingStartedAt,
				},
			},
		});

		await this.reportProgress({
			stage: "reporting",
			step: "reporting",
			percent: 0.86,
			message: "Generating weekly regulatory briefing",
		});

		const briefing = await step.do("generate-regulatory-briefing", async () => {
			return buildRegulatoryBriefing({
				mainItems: selection.mainItems,
				referenceItems: selection.referenceItems,
				since: params.since,
				until: params.until,
				sources: synthesisResult.sources,
			});
		});

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

		await publishWorkflowState({
			progress: 0.91,
			briefing,
			steps: {
				...workflowState.steps,
				reporting: {
					...workflowState.steps.reporting,
					status: "running",
					message: "Briefing generated; saving to Workspace",
					progress: 0.7,
					startedAt: reportingStartedAt,
				},
			},
		});

		await this.reportProgress({
			stage: "reporting",
			step: "reporting",
			percent: 0.91,
			message: "Regulatory briefing generated; saving to Workspace",
		});

		// =====================================================
		// 5. Save briefing to Workspace
		// =====================================================

		const reportGeneratedAt = new Date().toISOString();

		const briefingArtifact = await step.do(
			"save-regulatory-briefing-to-workspace",
			async () => {
				const craAssistant = await getAgentByName(
					this.env.CraAssistantAgent,
					"default",
				);

				const reportDate = reportGeneratedAt.slice(0, 10);
				const path = `/reports/regulatory/${reportDate}-regulatory-briefing.md`;

				const content = this.buildBriefingMarkdown({
					briefing,
					startedAt,
					completedAt: reportGeneratedAt,
				});

				await craAssistant.writeWorkspaceFile(path, content);

				return {
					path,
					savedAt: new Date().toISOString(),
				};
			},
		);

		await publishWorkflowState({
			progress: 0.94,
			artifact: {
				path: briefingArtifact.path,
				savedAt: briefingArtifact.savedAt,
			},
			steps: {
				...workflowState.steps,
				reporting: {
					...workflowState.steps.reporting,
					status: "completed",
					message: "Regulatory briefing saved to Workspace",
					progress: 1,
					startedAt: reportingStartedAt,
					completedAt: new Date().toISOString(),
				},
			},
		});

		await this.reportProgress({
			stage: "reporting",
			step: "reporting",
			percent: 0.94,
			message: "Regulatory briefing saved to Workspace",
		});

		// =====================================================
		// 6. Email Delivery
		// =====================================================

		let emailStep: WorkflowStepState;

		if (params.sendEmail && params.emailRecipient) {
			const emailStartedAt = new Date().toISOString();

			emailStep = {
				status: "running",
				message: "Sending regulatory briefing email",
				startedAt: emailStartedAt,
				recipient: params.emailRecipient,
			};

			await publishWorkflowState({
				stage: "emailing",
				progress: 0.96,
				steps: {
					...workflowState.steps,
					email: emailStep,
				},
			});

			await this.reportProgress({
				stage: "emailing",
				step: "email",
				percent: 0.96,
				message: "Sending regulatory briefing email",
			});

			const craAssistant = await getAgentByName(
				this.env.CraAssistantAgent,
				"default",
			);

			const draft = await craAssistant.createEmailDraftFromWorkspace(
				briefingArtifact.path,
				[params.emailRecipient],
			);

			const emailResult = await step.do("send-email", async () => {
				try {
					const result = await sendEmail(this.env, draft, {
						idempotencyKey: params.emailIdempotencyKey,

						scheduleId: params.scheduleId,
					});

					return {
						success: true as const,
						deliveryStatus: result.status,
						sentAt: result.status === "sent" ? result.sentAt : undefined,
					};
				} catch (error) {
					return {
						success: false as const,
						error:
							error instanceof Error ? error.message : "Email sending failed",
					};
				}
			});

			if (emailResult.success) {
				emailStep = {
					status: "completed",
					startedAt: emailStartedAt,
					message: "Email delivery completed",
					progress: 1,
					recipient: params.emailRecipient,
					sentAt: emailResult.sentAt,
					completedAt: new Date().toISOString(),
				};
			} else {
				emailStep = {
					status: "failed",
					startedAt: emailStartedAt,
					message: "Email delivery failed",
					recipient: params.emailRecipient,
					error: emailResult.error,
					completedAt: new Date().toISOString(),
				};
			}

			await publishWorkflowState({
				stage: "emailing",
				progress: 0.98,
				steps: {
					...workflowState.steps,
					email: emailStep,
				},
			});

			await this.reportProgress({
				stage: "emailing",
				step: "email",
				percent: 0.98,
				message: emailStep.message ?? "Email delivery finished",
			});
		} else {
			emailStep = {
				status: "skipped",
				message: params.sendEmail
					? "Email delivery skipped because no recipient was provided"
					: "Email delivery disabled",
				recipient: params.emailRecipient,
			};

			await publishWorkflowState({
				progress: 0.98,
				steps: {
					...workflowState.steps,
					email: emailStep,
				},
			});

			await this.reportProgress({
				stage: "reporting",
				step: "email",
				percent: 0.98,
				message: emailStep.message ?? "Email delivery skipped",
			});
		}

		// =====================================================
		// 7. Complete
		// =====================================================

		const completedAt = new Date().toISOString();

		await publishWorkflowState({
			stage: "completed",
			progress: 1,
			completedAt,
			briefing,
			artifact: {
				path: briefingArtifact.path,
				savedAt: briefingArtifact.savedAt,
			},
			steps: {
				...workflowState.steps,
				email: emailStep,
			},
		});

		await this.reportProgress({
			stage: "completed",
			step: params.sendEmail ? "email" : "reporting",
			percent: 1,
			message: "Regulatory briefing workflow completed",
		});

		const result = {
			briefing,

			artifact: {
				path: briefingArtifact.path,
				savedAt: briefingArtifact.savedAt,
			},

			sources: {
				mfds: mfdsResult,
				ich: ichResult,
				konect: konectResult,
			},

			email: {
				status: emailStep.status,
				recipient: emailStep.recipient,
				sentAt: emailStep.sentAt,
				error: emailStep.error,
			},

			startedAt,
			completedAt,
		};

		await step.reportComplete(result);

		return result;
	}

	private buildBriefingMarkdown({
		briefing,
		startedAt,
		completedAt,
	}: {
		briefing: RegulatoryBriefing;
		startedAt: string;
		completedAt: string;
	}): string {
		const lines: string[] = [];

		lines.push("---");
		lines.push("type: report");
		lines.push("title: Regulatory Briefing");
		lines.push("status: final");
		lines.push("source: regulatory-briefing-workflow");
		lines.push(`startedAt: ${startedAt}`);
		lines.push(`completedAt: ${completedAt}`);
		lines.push("---");
		lines.push("");

		lines.push("# Regulatory Briefing");
		lines.push("");

		if (briefing.summary) {
			lines.push(briefing.summary);
			lines.push("");
		}

		if (briefing.highlights?.length) {
			lines.push("## Highlights");
			lines.push("");

			for (const item of briefing.highlights) {
				lines.push(`### ${item.title}`);
				lines.push("");

				if (item.summary) {
					lines.push(item.summary);
					lines.push("");
				}

				if (item.craImpact) {
					lines.push("**CRA Impact**");
					lines.push("");
					lines.push(item.craImpact);
					lines.push("");
				}

				if (item.url) {
					lines.push(`Source: ${item.url}`);
					lines.push("");
				}
			}
		}

		if (briefing.references?.length) {
			lines.push("## References");
			lines.push("");

			for (const item of briefing.references) {
				lines.push(`- ${item.title}`);

				if (item.url) {
					lines.push(`  - ${item.url}`);
				}
			}

			lines.push("");
		}

		return lines.join("\n");
	}
}
