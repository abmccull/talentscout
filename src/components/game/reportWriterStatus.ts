export type ReportWriterStepId = "assessment" | "brief" | "case" | "risk" | "final";

export interface ReportWriterBlocker {
  id: string;
  stepId: ReportWriterStepId;
  message: string;
  count?: number;
}

export interface ReportWriterStatusInput {
  mode: "opening" | "youth" | "general";
  hasObservations: boolean;
  hasFreshEvidence: boolean;
  hasSummary: boolean;
  initialAssessmentReady?: boolean;
  openingDecisionCount?: number;
  youthValidationErrors?: string[];
}

export interface ReportWriterStatus {
  blockers: ReportWriterBlocker[];
  canSubmit: boolean;
  countsByStep: Record<ReportWriterStepId, number>;
  primaryBlocker: string | null;
  totalRemaining: number;
}

function classifyYouthValidationError(error: string): ReportWriterStepId {
  if (
    error === "Select an open academy recruitment brief."
    || error === "The report audience must match the recruitment brief."
    || error === "Choose a valid presentation approach."
    || error === "The recruitment brief needs a clear club need."
  ) {
    return "brief";
  }

  if (
    error === "Choose a projected tactical role."
    || error === "Choose a recommended next action."
    || error === "Enter a valid wage estimate."
    || error === "Support at least one judgment with saved evidence."
    || error.startsWith("Choose whether ")
    || error.startsWith("Choose what remains unknown for ")
    || error.startsWith("Choose an evidence-backed interpretation for ")
    || error.startsWith("Select saved evidence for ")
    || error.includes("judgment references evidence")
  ) {
    return "case";
  }

  if (
    error === "Choose a risk posture, including no material signal if appropriate."
    || error === "No material risk signal cannot be combined with a specific risk."
    || error === "No material risk signal must use the no-signal assessment."
    || error.includes("must remain untested.")
    || error.includes("references evidence outside this report.")
    || error.includes("references evidence that is no longer available.")
  ) {
    return "risk";
  }

  return "final";
}

function addBlocker(
  blockers: ReportWriterBlocker[],
  blocker: ReportWriterBlocker,
): void {
  const normalizedCount = Math.max(1, blocker.count ?? 1);
  if (
    blockers.some(
      (existing) =>
        existing.stepId === blocker.stepId
        && existing.message === blocker.message,
    )
  ) {
    return;
  }
  blockers.push({ ...blocker, count: normalizedCount });
}

export function buildReportWriterStatus(
  input: ReportWriterStatusInput,
): ReportWriterStatus {
  const blockers: ReportWriterBlocker[] = [];

  if (!input.hasObservations) {
    addBlocker(blockers, {
      id: "observation-required",
      stepId: input.mode === "opening" ? "assessment" : "final",
      message: "Return to the dossier and choose the context that can answer the open question.",
    });
  } else if (!input.hasFreshEvidence) {
    addBlocker(blockers, {
      id: "fresh-evidence-required",
      stepId: "final",
      message: "Gather fresh evidence in another match, training visit, video review, or meaningful context before filing this revision.",
    });
  }

  if (input.mode === "opening") {
    if (!input.initialAssessmentReady) {
      addBlocker(blockers, {
        id: "opening-assessment-required",
        stepId: "assessment",
        message: "Complete the five assessment decisions to file this first read.",
        count: Math.max(1, input.openingDecisionCount ?? 5),
      });
    }
  } else if (input.mode === "youth") {
    for (const error of input.youthValidationErrors ?? []) {
      addBlocker(blockers, {
        id: `validation:${error}`,
        stepId: classifyYouthValidationError(error),
        message: error,
      });
    }
    if (!input.hasSummary && (input.youthValidationErrors?.length ?? 0) === 0) {
      addBlocker(blockers, {
        id: "youth-summary-required",
        stepId: "final",
        message: "Complete the evidence judgments above to assemble the recommendation.",
      });
    }
  } else if (!input.hasSummary) {
    addBlocker(blockers, {
      id: "private-note-required",
      stepId: "final",
      message: "Add your private scout note before filing the report.",
    });
  }

  const countsByStep: Record<ReportWriterStepId, number> = {
    assessment: 0,
    brief: 0,
    case: 0,
    risk: 0,
    final: 0,
  };

  for (const blocker of blockers) {
    countsByStep[blocker.stepId] += Math.max(1, blocker.count ?? 1);
  }

  return {
    blockers,
    canSubmit: blockers.length === 0,
    countsByStep,
    primaryBlocker: blockers[0]?.message ?? null,
    totalRemaining: Object.values(countsByStep).reduce((sum, count) => sum + count, 0),
  };
}
