export interface ConciseOpeningReportModeInput {
  isYouthScout: boolean;
  openingStage?: string | null;
  openingPlayerId?: string | null;
  selectedPlayerId?: string | null;
  previousReportExists: boolean;
  observationCount: number;
  contextCount: number;
}

export interface ReportWorkflowStep {
  id: string;
  complete: boolean;
  required?: boolean;
  decisionsRemaining?: number;
}

export interface ReportWorkflowProgress {
  activeStepId: string | null;
  completedRequiredSteps: number;
  decisionsRemaining: number;
  nextRequiredStepId: string | null;
  requiredSteps: number;
}

export function isConciseOpeningReportMode(input: ConciseOpeningReportModeInput): boolean {
  if (!input.isYouthScout) return false;
  if (input.openingStage !== "report") return false;
  if (!input.openingPlayerId || input.openingPlayerId !== input.selectedPlayerId) return false;
  if (input.previousReportExists) return false;
  return input.observationCount <= 1 && input.contextCount <= 1;
}

/**
 * Keeps the writer on the next unfinished decision while still allowing players
 * to reopen completed or optional work. An unfinished future step cannot be
 * selected ahead of the current decision.
 */
export function resolveReportWorkflow(
  steps: ReportWorkflowStep[],
  requestedStepId: string | null = null,
): ReportWorkflowProgress {
  const requiredSteps = steps.filter((step) => step.required !== false);
  const nextRequiredStep = requiredSteps.find((step) => !step.complete) ?? null;
  const requestedStep = requestedStepId
    ? steps.find((step) => step.id === requestedStepId) ?? null
    : null;
  const requestedStepCanOpen = Boolean(
    requestedStep
      && (
        requestedStep.required === false
        || requestedStep.complete
        || requestedStep.id === nextRequiredStep?.id
      ),
  );
  const finalStep = steps.find((step) => step.id === "final") ?? null;
  const activeStep = requestedStepCanOpen
    ? requestedStep
    : nextRequiredStep ?? finalStep ?? steps[0] ?? null;

  return {
    activeStepId: activeStep?.id ?? null,
    completedRequiredSteps: requiredSteps.filter((step) => step.complete).length,
    decisionsRemaining: requiredSteps.reduce(
      (total, step) => total + Math.max(0, step.decisionsRemaining ?? (step.complete ? 0 : 1)),
      0,
    ),
    nextRequiredStepId: nextRequiredStep?.id ?? null,
    requiredSteps: requiredSteps.length,
  };
}

export function canOpenReportWorkflowStep(
  step: ReportWorkflowStep,
  nextRequiredStepId: string | null,
): boolean {
  return step.required === false
    || step.complete
    || step.id === nextRequiredStepId;
}
