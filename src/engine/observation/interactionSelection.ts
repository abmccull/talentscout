import type {
  DataPointSelectionResolution,
  DialogueChoiceResolution,
  ObservationSession,
  SessionPhase,
} from "./types";

export interface DialogueSelectionResult {
  session: ObservationSession;
  applied: boolean;
  resolution?: DialogueChoiceResolution;
}

export interface DataPointSelectionResult {
  session: ObservationSession;
  applied: boolean;
  resolution?: DataPointSelectionResolution;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function boundedInsight(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return clamp(Math.trunc(value), 0, 25);
}

function replaceCurrentPhase(
  session: ObservationSession,
  phase: SessionPhase,
): ObservationSession["phases"] {
  return session.phases.map((candidate, index) =>
    index === session.currentPhaseIndex ? phase : candidate,
  );
}

/**
 * Locks one response for a dialogue node and applies its reward exactly once.
 * The immutable resolution snapshot is the source of truth for UI feedback,
 * persistence, and contact-state projection.
 */
export function resolveDialogueOptionSelection(
  session: ObservationSession,
  nodeId: string,
  optionId: string,
): DialogueSelectionResult {
  if (session.state !== "active" || session.mode !== "investigation") {
    return { session, applied: false };
  }

  const phase = session.phases[session.currentPhaseIndex];
  if (!phase?.dialogueNodes?.length) return { session, applied: false };

  if (
    phase.selectedDialogueOptionIds?.[nodeId]
    || phase.dialogueChoiceResolutions?.[nodeId]
  ) {
    return { session, applied: false };
  }

  const node = phase.dialogueNodes.find((candidate) => candidate.id === nodeId);
  const option = node?.options.find((candidate) => candidate.id === optionId);
  if (!node || !option) return { session, applied: false };

  const relationshipScore = session.sourceContactId
    ? clamp(session.sourceRelationshipScore ?? 0, 0, 100)
    : 0;
  if (
    option.requiresRelationship !== undefined
    && relationshipScore < option.requiresRelationship
  ) {
    return { session, applied: false };
  }

  const insightPointsAwarded = boundedInsight(option.outcome.insightBonus);
  const requestedRelationshipDelta = session.sourceContactId
    && Number.isFinite(option.outcome.relationshipDelta)
      ? Math.trunc(option.outcome.relationshipDelta ?? 0)
      : 0;
  const nextRelationshipScore = session.sourceContactId
    ? clamp(relationshipScore + requestedRelationshipDelta, 0, 100)
    : relationshipScore;
  const relationshipDeltaApplied = nextRelationshipScore - relationshipScore;
  const resolution: DialogueChoiceResolution = {
    phaseIndex: phase.index,
    nodeId,
    optionId,
    optionText: option.text,
    narrativeText: option.outcome.narrativeText,
    insightPointsAwarded,
    relationshipDeltaApplied,
    sourceContactId: session.sourceContactId,
  };
  const updatedPhase: SessionPhase = {
    ...phase,
    selectedDialogueOptionIds: {
      ...(phase.selectedDialogueOptionIds ?? {}),
      [nodeId]: optionId,
    },
    dialogueChoiceResolutions: {
      ...(phase.dialogueChoiceResolutions ?? {}),
      [nodeId]: resolution,
    },
  };

  return {
    applied: true,
    resolution,
    session: {
      ...session,
      phases: replaceCurrentPhase(session, updatedPhase),
      insightPointsEarned: session.insightPointsEarned + insightPointsAwarded,
      sourceRelationshipScore: session.sourceContactId
        ? nextRelationshipScore
        : undefined,
    },
  };
}

/** Locks the first valid analysis selection in a phase and rewards it once. */
export function resolveDataPointSelection(
  session: ObservationSession,
  pointId: string,
): DataPointSelectionResult {
  if (session.state !== "active" || session.mode !== "analysis") {
    return { session, applied: false };
  }

  const phase = session.phases[session.currentPhaseIndex];
  if (!phase?.dataPoints?.length) return { session, applied: false };
  if (phase.selectedDataPointId || phase.dataPointResolution) {
    return { session, applied: false };
  }

  const point = phase.dataPoints.find((candidate) => candidate.id === pointId);
  if (!point) return { session, applied: false };

  const insightPointsAwarded = point.isHighlighted ? 3 : 1;
  const resolution: DataPointSelectionResolution = {
    phaseIndex: phase.index,
    pointId,
    pointLabel: point.label,
    insightPointsAwarded,
  };
  const updatedPhase: SessionPhase = {
    ...phase,
    selectedDataPointId: pointId,
    dataPointResolution: resolution,
  };

  return {
    applied: true,
    resolution,
    session: {
      ...session,
      phases: replaceCurrentPhase(session, updatedPhase),
      insightPointsEarned: session.insightPointsEarned + insightPointsAwarded,
    },
  };
}

/**
 * Normalizes legacy/serialized sessions without inventing rewards. Existing
 * selected IDs remain locked even when an old save lacks a resolution record.
 */
export function migrateObservationSessionInteractions(
  session: ObservationSession,
): ObservationSession {
  return {
    ...session,
    phases: session.phases.map((phase) => {
      const dialogueSelections = {
        ...Object.fromEntries(
          Object.entries(phase.dialogueChoiceResolutions ?? {}).map(
            ([nodeId, resolution]) => [nodeId, resolution.optionId],
          ),
        ),
        ...(phase.selectedDialogueOptionIds ?? {}),
      };
      const validDialogueSelections = Object.fromEntries(
        Object.entries(dialogueSelections).filter(
          ([nodeId, optionId]) => phase.dialogueNodes?.some(
            (node) => node.id === nodeId
              && node.options.some((option) => option.id === optionId),
          ),
        ),
      );
      const validDialogueResolutions = Object.fromEntries(
        Object.entries(phase.dialogueChoiceResolutions ?? {}).filter(
          ([nodeId, resolution]) => validDialogueSelections[nodeId] === resolution.optionId,
        ),
      );
      const serializedDataPointId = phase.selectedDataPointId
        ?? phase.dataPointResolution?.pointId;
      const selectedDataPointId = serializedDataPointId
        && phase.dataPoints?.some((point) => point.id === serializedDataPointId)
          ? serializedDataPointId
          : undefined;
      const dataPointResolution = selectedDataPointId
        && phase.dataPointResolution?.pointId === selectedDataPointId
          ? phase.dataPointResolution
          : undefined;

      return {
        ...phase,
        selectedDialogueOptionIds: Object.keys(validDialogueSelections).length
          ? validDialogueSelections
          : undefined,
        dialogueChoiceResolutions: Object.keys(validDialogueResolutions).length
          ? validDialogueResolutions
          : undefined,
        selectedDataPointId,
        dataPointResolution,
      };
    }),
  };
}
