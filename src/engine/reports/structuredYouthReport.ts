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
const CATEGORY_LABELS: Record<JudgmentCategory, string> = {
  potential: "development potential",
  roleFit: "tactical role fit",
  characterRisk: "character and adaptation risk",
};

export interface StructuredReportValidation {
  valid: boolean;
  errors: string[];
}

/** Validate only player-visible professional fields; hidden player truth is never an input. */
export function validateStructuredReportInput(
  input: StructuredReportInput,
  brief: YouthRecruitmentBrief | undefined,
  availableEvidenceIds?: ReadonlySet<string>,
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
  if (!input.recruitmentNeed.trim()) errors.push("The recruitment brief needs a clear club need.");
  if (!input.projectedRole) errors.push("Choose a projected tactical role.");
  if (!input.recommendedAction) errors.push("Choose a recommended next action.");
  if (!Number.isFinite(input.estimatedWeeklyWage) || input.estimatedWeeklyWage <= 0) {
    errors.push("Enter a valid wage estimate.");
  }
  if (input.evidenceVersion === 1) {
    const declaredEvidence = new Set(input.evidenceIds ?? []);
    const assessedCategories = REQUIRED_CATEGORIES.filter(
      (category) => input.categoryVerdicts[category]?.status === "assessed",
    );
    if (assessedCategories.length === 0) {
      errors.push("Support at least one judgment with saved evidence.");
    }
    for (const category of REQUIRED_CATEGORIES) {
      const verdict = input.categoryVerdicts[category];
      const categoryLabel = CATEGORY_LABELS[category];
      if (!verdict || !verdict.status) {
        errors.push(`Choose whether ${categoryLabel} is assessed or still untested.`);
        continue;
      }
      if (!verdict.unknownOptionId || !verdict.acknowledgedUncertainty.trim()) {
        errors.push(`Choose what remains unknown for ${categoryLabel}.`);
      }
      if (verdict.status === "assessed") {
        if (!verdict.classification || !verdict.claimSupport) {
          errors.push(`Choose an evidence-backed interpretation for ${categoryLabel}.`);
        }
        if (!verdict.evidenceIds?.length) {
          errors.push(`Select saved evidence for ${categoryLabel}.`);
        }
        for (const evidenceId of verdict.evidenceIds ?? []) {
          if (!declaredEvidence.has(evidenceId)) {
            errors.push(`The ${categoryLabel} judgment references evidence outside this report.`);
          } else if (availableEvidenceIds && !availableEvidenceIds.has(evidenceId)) {
            errors.push(`The ${categoryLabel} judgment references evidence that is no longer available.`);
          }
        }
      }
    }
    const risks = input.riskAssessments ?? [];
    if (risks.length === 0) {
      errors.push("Choose a risk posture, including no material signal if appropriate.");
    }
    const noMaterialRisk = risks.find((risk) => risk.id === "noMaterialSignal");
    if (noMaterialRisk && risks.length > 1) {
      errors.push("No material risk signal cannot be combined with a specific risk.");
    }
    if (noMaterialRisk && noMaterialRisk.status !== "noSignal") {
      errors.push("No material risk signal must use the no-signal assessment.");
    }
    for (const risk of risks) {
      if (risk.status === "observed" && risk.evidenceIds.length === 0) {
        errors.push(`${risk.label} needs supporting evidence or must remain untested.`);
      }
      for (const evidenceId of risk.evidenceIds) {
        if (!declaredEvidence.has(evidenceId)) {
          errors.push(`${risk.label} references evidence outside this report.`);
        } else if (availableEvidenceIds && !availableEvidenceIds.has(evidenceId)) {
          errors.push(`${risk.label} references evidence that is no longer available.`);
        }
      }
    }
  } else if (input.riskFactors.length === 0 || input.riskFactors.some((risk) => !risk.trim())) {
    errors.push("Record at least one material risk.");
  }
  if (input.evidenceVersion !== 1) {
    for (const category of REQUIRED_CATEGORIES) {
      const verdict = input.categoryVerdicts[category];
      const categoryLabel = CATEGORY_LABELS[category];
      if (!verdict || verdict.verdict.trim().length < 8) {
        errors.push(`Write a ${categoryLabel} verdict.`);
        continue;
      }
      if (verdict.acknowledgedUncertainty.trim().length < 4) {
        errors.push(`Acknowledge remaining uncertainty for ${categoryLabel}.`);
      }
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
    riskAssessments: input.riskAssessments?.map((risk) => ({
      ...risk,
      evidenceIds: [...new Set(risk.evidenceIds)],
    })),
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
          evidenceIds: verdict.evidenceIds
            ? [...new Set(verdict.evidenceIds)]
            : undefined,
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
