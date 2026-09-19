import { Think } from "@cloudflare/think";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";

import { RegulatoryAnalyzer } from "../analyzers/RegulatoryAnalyzer.ts";

import type {
  ICHGuidelineRecord,
  ICHWorkflowInput,
  ICHWorkflowResult,
} from "../types/ich.ts";

import type {
  RegulatoryItem,
} from "../types/regulatory.ts";
import { ICHGuidelineCollector } from "../source-collectors/ICHGuidelineCollector.ts";
import { createWorkersAI } from "workers-ai-provider";

const DEFAULT_MEMBER = "MFDS, Republic of Korea";

const DEFAULT_GUIDELINE_PREFIXES = [
  "E6",
];

const ichCollectInputSchema = z.object({
  member: z
    .string()
    .optional()
    .describe(
      "ICH member/regulatory authority to focus on, for example 'MFDS, Republic of Korea'.",
    ),

  guidelinePrefixes: z
    .array(z.string())
    .optional()
    .describe(
      "Guideline families to include, for example ['E6'] or ['E2', 'E6', 'E8'].",
    ),

  guidelineCodes: z
    .array(z.string())
    .optional()
    .describe(
      "Exact guideline codes to include, for example ['E6(R3)'].",
    ),

  includeAllImplementations: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to retain implementation status for all ICH members instead of only the selected member.",
    ),
});

type ICHCollectInput =
  z.infer<typeof ichCollectInputSchema>;

export class ICHRegulatoryAgent extends Think<Env> {

    getModel(): LanguageModel {
		const workersAI = createWorkersAI({
			binding: this.env.AI,
		});

		return workersAI("@cf/zai-org/glm-4.7-flash");
	}


  getTools() {
    return {
      collectICHGuidelines: tool({
        description:
          [
            "Collect official ICH efficacy guideline metadata,",
            "including guideline status, Step date, official documents,",
            "and member implementation information.",
            "Use this when the user asks about ICH guidelines,",
            "ICH E6/GCP, guideline implementation status,",
            "or official ICH document links.",
          ].join(" "),

        inputSchema:
          ichCollectInputSchema,

        execute: async (
          input: ICHCollectInput,
        ) => {
          return this.collectGuidelines(
            input,
          );
        },
      }),
    };
  }

  /**
   * Workflow 전용 deterministic 경로.
   *
   * agentTool / LLM tool selection을 거치지 않고
   * Collector -> filtering -> Analyzer 순서로 직접 실행한다.
   */
  async collectAndAnalyzeForWorkflow(
    input: ICHWorkflowInput,
  ): Promise<ICHWorkflowResult> {
    const member =
      input.member ??
      DEFAULT_MEMBER;

    const guidelinePrefixes =
      input.guidelinePrefixes?.length
        ? input.guidelinePrefixes
        : DEFAULT_GUIDELINE_PREFIXES;

    const guidelineCodes =
      input.guidelineCodes ?? [];

    console.log(
      "[ICHRegulatoryAgent] workflow started",
      {
        member,
        guidelinePrefixes,
        guidelineCodes,
      },
    );

    const collector =
      new ICHGuidelineCollector();

    const collection =
      await collector.collect();

    const filteredGuidelines =
      filterGuidelines(
        collection.guidelines,
        {
          member,
          guidelinePrefixes,
          guidelineCodes,
          includeAllImplementations:
            false,
        },
      );

    const regulatoryItems =
      filteredGuidelines.map(
        guidelineToRegulatoryItem,
      );

    const analyzer = new RegulatoryAnalyzer(this.getModel());

    const analysis =
      await analyzer.analyze(
        regulatoryItems,
        {
          onBatchProgress: async (
            completedBatches,
            total,
          ) => {
            console.log(
              "[ICHRegulatoryAgent] analyzing",
              {
                completedBatches,
                total,
              },
            );
          },
        },
      );

    const warnings = [
      ...collection.failures.map(
        (failure) =>
          `${failure.target}: ${failure.message}`,
      ),
    ];

    console.log(
      "[ICHRegulatoryAgent] workflow completed",
      {
        totalFetched:
          collection.totalFetched,

        candidateCount:
          regulatoryItems.length,

        relevantCount:
          analysis.relevantCount,

        warningCount:
          warnings.length,
      },
    );

    return {
      source: "ICH",

      collectedAt:
        collection.collectedAt,

      totalFetched:
        collection.totalFetched,

      candidateCount:
        regulatoryItems.length,

      relevantCount:
        analysis.relevantCount,

      items:
        analysis.items,

      failures:
        collection.failures,

      warnings,
    };
  }

  /**
   * Interactive chat/tool 경로.
   *
   * 공식 데이터를 가져온 뒤 사용자가 요청한 범위로 필터링한다.
   * 분석까지 강제하지 않고 raw-ish normalized guideline 데이터를 반환한다.
   */
  private async collectGuidelines(
    input: ICHCollectInput,
  ) {
    const member =
      input.member ??
      DEFAULT_MEMBER;

    const guidelinePrefixes =
      input.guidelinePrefixes?.length
        ? input.guidelinePrefixes
        : DEFAULT_GUIDELINE_PREFIXES;

    const guidelineCodes =
      input.guidelineCodes ?? [];

    const collector =
      new ICHGuidelineCollector();

    const collection =
      await collector.collect();

    const guidelines =
      filterGuidelines(
        collection.guidelines,
        {
          member,
          guidelinePrefixes,
          guidelineCodes,

          includeAllImplementations:
            input.includeAllImplementations ??
            false,
        },
      );

    return {
      source: "ICH" as const,

      collectedAt:
        collection.collectedAt,

      totalFetched:
        collection.totalFetched,

      totalReturned:
        guidelines.length,

      filters: {
        member,
        guidelinePrefixes,
        guidelineCodes,

        includeAllImplementations:
          input.includeAllImplementations ??
          false,
      },

      guidelines,

      failures:
        collection.failures,

      warnings:
        collection.failures.map(
          (failure) =>
            `${failure.target}: ${failure.message}`,
        ),
    };
  }
}

interface FilterGuidelinesOptions {
  member?: string;

  guidelinePrefixes:
    string[];

  guidelineCodes:
    string[];

  includeAllImplementations:
    boolean;
}

function filterGuidelines(
  guidelines: ICHGuidelineRecord[],
  options: FilterGuidelinesOptions,
): ICHGuidelineRecord[] {
  const {
    member,
    guidelinePrefixes,
    guidelineCodes,
    includeAllImplementations,
  } = options;

  return guidelines
    .filter((guideline) => {
      const matchesExactCode =
        guidelineCodes.length === 0 ||
        guidelineCodes.includes(
          guideline.displayCode,
        );

      const matchesPrefix =
        guidelinePrefixes.length === 0 ||
        guidelinePrefixes.some(
          (prefix) =>
            guideline.displayCode.startsWith(
              prefix,
            ),
        );

      /*
       * exact code가 지정되어 있으면 exact code를 우선한다.
       *
       * 예:
       * guidelineCodes = ["E6(R3)"]
       * guidelinePrefixes = ["E6"]
       *
       * => E6(R3)만 반환.
       */
      if (guidelineCodes.length > 0) {
        return matchesExactCode;
      }

      return matchesPrefix;
    })
    .map((guideline) => {
      if (
        includeAllImplementations ||
        !member
      ) {
        return guideline;
      }

      return {
        ...guideline,

        implementations:
          guideline.implementations.filter(
            (implementation) =>
              implementation.member ===
              member,
          ),
      };
    });
}

/**
 * ICH guideline 정보를 기존 RegulatoryAnalyzer가 받을 수 있는
 * 공통 RegulatoryItem 형태로 변환한다.
 */
function guidelineToRegulatoryItem(
  guideline: ICHGuidelineRecord,
): RegulatoryItem {
  const implementation =
    guideline.implementations[0];

  const implementationText =
    implementation
      ? [
          `${implementation.member}:`,
          implementation.status,

          implementation.implementationDate
            ? `Date: ${implementation.implementationDate}`
            : undefined,

          implementation.reference
            ? `Reference: ${implementation.reference}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ")
      : "No selected-member implementation information.";

  const documentText =
    guideline.documentUrls.length > 0
      ? `Official documents: ${guideline.documentUrls.length}`
      : "No official document URL found.";

  const description = [
    `${guideline.displayCode} ${guideline.title}.`,

    guideline.step
      ? `${guideline.step}${
          guideline.date
            ? ` date: ${guideline.date}.`
            : "."
        }`
      : undefined,

    guideline.status
      ? `Current status: ${guideline.status}.`
      : undefined,

    implementationText,

    documentText,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id:
      `ICH:${guideline.displayCode}`,

    sourceType:
      "guideline",

    collectedAt:
      guideline.collectedAt,

    source:
      "ICH",

    sourceId:
      guideline.displayCode,

    title:
      `${guideline.displayCode} ${guideline.title}`,

    description,

    publishedAt:
      normalizeICHDate(
        guideline.date,
      ),

    url:
      guideline.guidelineUrl ?? "",

    metadata: {
      guidelineCode:
        guideline.code,

      revision:
        guideline.revision,

      displayCode:
        guideline.displayCode,

      topic:
        guideline.topic,

      step:
        guideline.step,

      status:
        guideline.status,

      implementation,

      documentUrls:
        guideline.documentUrls,
    },
  };
}

/**
 * ICH는 "6 January 2025"처럼 human-readable date를 주므로
 * 가능한 경우 ISO8601로 정규화한다.
 *
 * parsing 실패 시 undefined.
 */
function normalizeICHDate(
  value?: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp =
    Date.parse(value);

  if (
    Number.isNaN(timestamp)
  ) {
    return undefined;
  }

  return new Date(
    timestamp,
  ).toISOString();
}