import type { Player } from "@/engine/core/types";
import type {
  DataPoint,
  ObservationSession,
  PlayerMoment,
  SessionPhase,
} from "@/engine/observation/types";
import type {
  VeteranPrologueCase,
  VeteranPrologueEvidenceBeat,
} from "./veteranPrologue";

function openingMoment(input: {
  id: string;
  playerId: string;
  beat: VeteranPrologueEvidenceBeat;
}): PlayerMoment {
  return {
    id: input.id,
    playerId: input.playerId,
    momentType: input.beat.type,
    quality: input.beat.quality,
    attributesHinted: [...input.beat.attributesHinted],
    description: input.beat.focused,
    vagueDescription: input.beat.peripheral,
    pressureContext: input.beat.pressure ?? false,
    isStandout: input.beat.quality >= 8,
  };
}

function pickThreePhases(phases: readonly SessionPhase[]): SessionPhase[] {
  if (phases.length === 0) {
    return [0, 1, 2].map((index) => ({
      index,
      minute: index + 1,
      description: "",
      moments: [],
    }));
  }
  const indexes = [0, Math.floor((phases.length - 1) / 2), phases.length - 1];
  return indexes.map((sourceIndex, index) => ({ ...phases[sourceIndex], index }));
}

function shapeFullObservation(
  phases: readonly SessionPhase[],
  prologue: VeteranPrologueCase,
): SessionPhase[] {
  const selected = pickThreePhases(phases);
  const descriptions = [
    `${prologue.setting} ${prologue.pressure}`,
    "The initial story is tested in the most revealing passage of the session.",
    `${prologue.contradiction} ${prologue.deadline}`,
  ];
  return selected.map((phase, index) => ({
    ...phase,
    index,
    minute: [9, 34, 61][index],
    description: descriptions[index],
    moments: [
      openingMoment({
        id: `${prologue.activityInstanceId}:beat:${index}`,
        playerId: prologue.player.id,
        beat: prologue.evidenceBeats[index],
      }),
      ...(phase.moments ?? []).filter(
        (moment) => moment.playerId !== prologue.player.id,
      ).slice(0, 1),
    ],
    isHalfTime: index === 1,
  }));
}

function shapeInvestigation(
  phases: readonly SessionPhase[],
  prologue: VeteranPrologueCase,
): SessionPhase[] {
  const selected = pickThreePhases(phases);
  const speakers = [prologue.sourceContactName, "Your notes", prologue.sourceContactName];
  return selected.map((phase, index) => {
    const originalNode = phase.dialogueNodes?.[0];
    const node = originalNode
      ? {
          ...originalNode,
          id: `${prologue.activityInstanceId}:dialogue:${index}`,
          speaker: speakers[index],
          text: prologue.evidenceBeats[index].focused,
          options: originalNode.options.map((option) => ({ ...option })),
        }
      : undefined;
    return {
      ...phase,
      index,
      minute: index + 1,
      description: index === 0
        ? `${prologue.setting} ${prologue.pressure}`
        : index === 1
          ? "A second account changes what the first answer means."
          : `${prologue.contradiction} ${prologue.deadline}`,
      moments: [],
      dialogueNodes: node ? [node] : [],
      selectedDialogueOptionIds: undefined,
      dialogueChoiceResolutions: undefined,
      isHalfTime: false,
    };
  });
}

function evidenceDataPoint(
  prologue: VeteranPrologueCase,
  beat: VeteranPrologueEvidenceBeat,
  index: number,
): DataPoint {
  return {
    id: `${prologue.activityInstanceId}:data:${index}`,
    playerId: prologue.player.id,
    label: ["Initial pattern", "Repeatable signal", "Context challenge"][index],
    value: beat.focused,
    category: index === 0 ? "trend" : index === 1 ? "anomaly" : "comparison",
    isHighlighted: index === 1,
    relatedAttributes: [...beat.attributesHinted],
  };
}

function shapeAnalysis(
  phases: readonly SessionPhase[],
  prologue: VeteranPrologueCase,
): SessionPhase[] {
  const selected = pickThreePhases(phases);
  return selected.map((phase, index) => ({
    ...phase,
    index,
    minute: index + 1,
    description: index === 0
      ? `${prologue.setting} ${prologue.pressure}`
      : index === 1
        ? "The pattern survives the first cross-check and becomes a scouting question."
        : `${prologue.contradiction} ${prologue.deadline}`,
    moments: [],
    dataPoints: [
      evidenceDataPoint(prologue, prologue.evidenceBeats[index], index),
      ...(phase.dataPoints ?? []).filter(
        (point) => point.playerId !== prologue.player.id,
      ).slice(0, 2),
    ],
    selectedDataPointId: undefined,
    dataPointResolution: undefined,
    isHalfTime: false,
  }));
}

/** Reframe a normally-created session without bypassing its state machine. */
export function shapeVeteranPrologueSession(
  session: ObservationSession,
  prologue: VeteranPrologueCase,
): ObservationSession;
export function shapeVeteranPrologueSession(
  session: ObservationSession,
  lead: Player,
  prologue: VeteranPrologueCase,
): ObservationSession;
export function shapeVeteranPrologueSession(
  session: ObservationSession,
  leadOrPrologue: Player | VeteranPrologueCase,
  suppliedPrologue?: VeteranPrologueCase,
): ObservationSession {
  const prologue = suppliedPrologue ?? leadOrPrologue as VeteranPrologueCase;
  const suppliedLead = suppliedPrologue ? leadOrPrologue as Player : undefined;
  if (session.state !== "setup") return session;
  if (session.activityInstanceId !== prologue.activityInstanceId) return session;
  if (session.activityType !== prologue.activityType) return session;
  if (suppliedLead && suppliedLead.id !== prologue.player.id) return session;
  if (!session.players.some((player) => player.playerId === prologue.player.id)) return session;

  const phases = session.mode === "fullObservation"
    ? shapeFullObservation(session.phases, prologue)
    : session.mode === "investigation"
      ? shapeInvestigation(session.phases, prologue)
      : session.mode === "analysis"
        ? shapeAnalysis(session.phases, prologue)
        : session.phases;

  return {
    ...session,
    phases,
    currentPhaseIndex: 0,
    sourceContactName: prologue.sourceContactName,
    players: [
      ...session.players.filter((player) => player.playerId === prologue.player.id),
      ...session.players.filter((player) => player.playerId !== prologue.player.id),
    ],
  };
}
