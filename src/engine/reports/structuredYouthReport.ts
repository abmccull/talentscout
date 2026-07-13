import type {
  JudgmentCategory,
  ScoutReport,
  StructuredReportInput,
  YouthRecruitmentBrief,
} from "@/engine/core/types";

const REQUIRED_CATEGORIES: JudgmentCategory[] = [
  "potential",
  "roleFit",
  "characterRisk",
];
const PRESENTATION_APPROACHES = new Set(["evidenceLed", "fitLed", "riskLed"]);

export interface StructuredReportValidation {
  valid: boolean;
  errors: string[];
}

/** Validate only player-visible professional fields; hidden player truth is never an input. */
export function validateStructuredReportInput(
  input: StructuredReportInput,
  brief: YouthRecruitmentBrief | undefined,
): StructuredReportValidation {
  const errors: string[] = [];
  if (!brief || brief.id !== input.briefId || brief.status !== "open") {
    errors.push("Select an open academy recruitment brief.");
  }
  if (!input.intendedClubId || input.intendedClubId !== brief?.clubId) {
    errors.push("The report audience must match the recruitment brief.");
  }
  if (input.presentationApproach && !PRESENTATION_APPROACHES.has(input.presentationApproach)) {
    errors.push("Choose a valid presentation approach.");
  }
  if (input.recruitmentNeed.trim().length < 12) {
    errors.push("Explain the recruitment need in at least 12 characters.");
  }
  if (!input.projectedRole) errors.push("Choose a projected tactical role.");
  if (!input.recommendedAction) errors.push("Choose a recommended next action.");
  if (!Number.isFinite(input.estimatedWeeklyWage) || input.estimatedWeeklyWage < 0) {
    errors.push("Enter a valid wage estimate.");
  }
  if (input.riskFactors.length === 0 || input.riskFactors.some((risk) => !risk.trim())) {
    errors.push("Record at least one material risk.");
  }
  for (const category of REQUIRED_CATEGORIES) {
    const verdict = input.categoryVerdicts[category];
    if (!verdict || verdict.verdict.trim().length < 8) {
      errors.push(`Write a ${category} verdict.`);
      continue;
    }
    if (verdict.acknowledgedUncertainty.trim().length < 4) {
      errors.push(`Acknowledge remaining uncertainty for ${category}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Attach authored context to an immutable generated report revision. */
export function applyStructuredReportInput(
  report: ScoutReport,
  input: StructuredReportInput,
  previousReport?: ScoutReport,
): ScoutReport {
  const revision = (previousReport?.revision ?? (previousReport ? 1 : 0)) + 1;
  return {
    ...report,
    id: `${report.id}_r${revision}`,
    briefId: input.briefId,
    supersedesReportId: previousReport?.id,
    revision,
    intendedClubId: input.intendedClubId,
    intendedAudience: input.intendedAudience,
    presentationApproach: input.presentationApproach ?? "evidenceLed",
    recruitmentNeed: input.recruitmentNeed.trim(),
    projectedRole: input.projectedRole,
    recommendedAction: input.recommendedAction,
    riskFactors: input.riskFactors.map((risk) => risk.trim()).filter(Boolean),
    estimatedWeeklyWage: Math.round(input.estimatedWeeklyWage),
    decisionDeadlineWeek: input.decisionDeadlineWeek,
    decisionDeadlineSeason: input.decisionDeadlineSeason,
    categoryVerdicts: Object.fromEntries(
      REQUIRED_CATEGORIES.map((category) => {
        const verdict = input.categoryVerdicts[category];
        return [category, {
          ...verdict,
          verdict: verdict.verdict.trim(),
          acknowledgedUncertainty: verdict.acknowledgedUncertainty.trim(),
          hypothesisIds: [...new Set(verdict.hypothesisIds)],
        }];
      }),
    ),
    alternativePlayerIds: [...new Set(input.alternativePlayerIds)].filter(
      (playerId) => playerId !== report.playerId,
    ),
  };
}

export function isStructuredYouthReport(report: ScoutReport): boolean {
  return Boolean(
    report.briefId
    && report.intendedClubId
    && report.projectedRole
    && report.recommendedAction
    && report.categoryVerdicts
    && REQUIRED_CATEGORIES.every((category) => report.categoryVerdicts?.[category]),
  );
}
