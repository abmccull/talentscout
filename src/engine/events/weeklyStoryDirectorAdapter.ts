import type {
  EventChain,
  GameState,
  NarrativeEvent,
  StorylineState,
} from "@/engine/core/types";
import type { EntityRef, GameDate } from "@/engine/consequences/types";
import {
  adaptLegacyStoryCandidate,
  recordStorySelectionV2,
  scoreStoryCandidatesV2,
  selectStoryCandidateV2,
  type StoryCandidateScoreV2,
  type StoryCandidateV2,
  type StoryDirectorStateV2,
} from "./storyDirectorV2";

export interface WeeklyNarrativeEmissionV2 {
  event: NarrativeEvent;
  /** Required for a new chain to use its authored template cooldown. */
  chain?: EventChain;
  /** Required for a new storyline to use its authored template cooldown. */
  storyline?: StorylineState;
  cast?: EntityRef[];
  topics?: EntityRef[];
  critical?: boolean;
  callbackFingerprint?: string;
  /** Explicit engine authority; use when old instance beats may be compacted. */
  continuation?: boolean;
}

export interface DirectedWeeklyNarrativeEmissionV2 {
  emission: WeeklyNarrativeEmissionV2;
  candidate: StoryCandidateV2;
  score: StoryCandidateScoreV2;
}

export interface DirectedWeeklyStoryCandidateV2 {
  candidate: StoryCandidateV2;
  score: StoryCandidateScoreV2;
}

export interface WeeklyStoryDirectionResultV2 {
  state: StoryDirectorStateV2;
  accepted: DirectedWeeklyNarrativeEmissionV2[];
  rejected: DirectedWeeklyNarrativeEmissionV2[];
  /** Non-legacy candidates, such as persistent world-condition arc beats. */
  acceptedCandidates: DirectedWeeklyStoryCandidateV2[];
  rejectedCandidates: DirectedWeeklyStoryCandidateV2[];
}

type AdaptedWeeklyStoryItemV2 =
  | {
      emission: WeeklyNarrativeEmissionV2;
      candidate: StoryCandidateV2;
    }
  | {
      candidate: StoryCandidateV2;
    };

function unresolvedChoiceCount(events: readonly NarrativeEvent[]): number {
  return events.filter((event) =>
    event.selectedChoice === undefined
    && !event.acknowledged
    && (event.choices?.length ?? 0) > 0,
  ).length;
}

function priorInstanceBeatExists(
  event: NarrativeEvent,
  priorEvents: readonly NarrativeEvent[],
): boolean {
  if (event.chainId) return priorEvents.some((candidate) => candidate.chainId === event.chainId);
  if (event.storylineId) {
    return priorEvents.some((candidate) => candidate.storylineId === event.storylineId);
  }
  return false;
}

/** Resolve legacy relatedIds into useful cast and topic ledgers. */
export function inferNarrativeEntityRefsV2(
  state: GameState,
  event: NarrativeEvent,
): { cast: EntityRef[]; topics: EntityRef[] } {
  const unsignedPlayerIds = new Set(
    Object.values(state.unsignedYouth ?? {}).map((candidate) => candidate.player.id),
  );
  const employeeIds = new Set(
    (state.finances?.employees ?? []).map((employee) => employee.id),
  );
  const cast: EntityRef[] = [];
  const topics: EntityRef[] = [];
  for (const id of [...new Set(event.relatedIds)].sort()) {
    let entity: EntityRef;
    if (state.players[id] || state.retiredPlayers[id] || unsignedPlayerIds.has(id)) {
      entity = { kind: "player", id };
    } else if (state.contacts[id]) {
      entity = { kind: "contact", id };
    } else if (state.rivalScouts[id]) {
      entity = { kind: "rival", id };
    } else if (state.npcScouts?.[id]) {
      entity = { kind: "scout", id };
    } else if (employeeIds.has(id)) {
      entity = { kind: "employee", id };
    } else if (state.clubs[id]) {
      entity = { kind: "club", id };
    } else {
      entity = { kind: "entity", id };
    }
    topics.push(entity);
    if (entity.kind !== "club" && entity.kind !== "entity") cast.push(entity);
  }
  return { cast, topics };
}

/** Adapt the concrete event produced by the existing engines into one ledger. */
export function adaptWeeklyNarrativeEmissionV2(input: {
  emission: WeeklyNarrativeEmissionV2;
  priorEvents: readonly NarrativeEvent[];
}): StoryCandidateV2 {
  const { emission, priorEvents } = input;
  const event = emission.event;
  const kind = event.specialEventId
    ? "special" as const
    : event.chainId
      ? "chain" as const
      : event.storylineId
        ? "storyline" as const
        : "standalone" as const;
  const templateId = event.specialEventId
    ?? emission.chain?.templateKey
    ?? emission.storyline?.templateId
    ?? event.chainId
    ?? event.storylineId
    ?? event.type;
  const candidate = adaptLegacyStoryCandidate({
    source: event,
    kind,
    templateId,
    category: event.type,
    semanticSignature: `${kind}:${event.type}`,
    cast: emission.cast,
    topics: emission.topics,
    callbackFingerprint: emission.callbackFingerprint,
    continuation: emission.continuation ?? priorInstanceBeatExists(event, priorEvents),
  });
  return {
    ...candidate,
    critical: emission.critical,
    careerLimit: kind === "special" ? 1 : undefined,
  };
}

function directSingleCandidate(input: {
  state: StoryDirectorStateV2;
  now: GameDate;
  candidate: StoryCandidateV2;
  activeChoiceCount: number;
  seasonLength: number;
}): StoryCandidateScoreV2 {
  return scoreStoryCandidatesV2({
    state: input.state,
    now: input.now,
    candidates: [input.candidate],
    activeChoiceCount: input.activeChoiceCount,
    seasonLength: input.seasonLength,
  })[0];
}

/**
 * One weekly hook for standalone events, chain beats, storyline beats and rare
 * specials. Due continuations are recorded first and suppress a competing new
 * opening beat; otherwise one deterministic new beat wins the weekly slot.
 */
export function directWeeklyStoryEmissionsV2(input: {
  rootSeed: string;
  state: StoryDirectorStateV2;
  now: GameDate;
  priorEvents: readonly NarrativeEvent[];
  emissions: readonly WeeklyNarrativeEmissionV2[];
  /** Additional story sources sharing the same weekly opening/continuation gate. */
  candidates?: readonly StoryCandidateV2[];
  activeChoiceCount?: number;
  seasonLength?: number;
}): WeeklyStoryDirectionResultV2 {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  const activeChoiceCount = input.activeChoiceCount
    ?? unresolvedChoiceCount(input.priorEvents);
  const adaptedEmissions: AdaptedWeeklyStoryItemV2[] = input.emissions.map((emission) => ({
    emission,
    candidate: adaptWeeklyNarrativeEmissionV2({
      emission,
      priorEvents: input.priorEvents,
    }),
  }));
  const narrativeCandidateIds = new Set(
    adaptedEmissions.map(({ candidate }) => candidate.id),
  );
  const adaptedCandidates: AdaptedWeeklyStoryItemV2[] = (input.candidates ?? [])
    .filter((candidate) => !narrativeCandidateIds.has(candidate.id))
    .map((candidate) => ({ candidate }));
  const adapted = [...adaptedEmissions, ...adaptedCandidates]
    .sort((left, right) => left.candidate.id.localeCompare(right.candidate.id));

  const continuationIds = new Set(adapted
    .filter(({ candidate }) => candidate.continuation || candidate.critical)
    .map(({ candidate }) => candidate.id));
  const optional = adapted.filter(({ candidate }) => !continuationIds.has(candidate.id));
  const optionalSelection = continuationIds.size > 0
    ? undefined
    : selectStoryCandidateV2({
        rootSeed: input.rootSeed,
        state: input.state,
        now: input.now,
        candidates: optional.map(({ candidate }) => candidate),
        activeChoiceCount,
        seasonLength,
      }).selected;
  const acceptedIds = new Set([
    ...continuationIds,
    ...(optionalSelection ? [optionalSelection.id] : []),
  ]);

  let state = input.state;
  const accepted: DirectedWeeklyNarrativeEmissionV2[] = [];
  const rejected: DirectedWeeklyNarrativeEmissionV2[] = [];
  const acceptedCandidates: DirectedWeeklyStoryCandidateV2[] = [];
  const rejectedCandidates: DirectedWeeklyStoryCandidateV2[] = [];
  for (const item of adapted) {
    const score = directSingleCandidate({
      state,
      now: input.now,
      candidate: item.candidate,
      activeChoiceCount,
      seasonLength,
    });
    const acceptedByDirection = acceptedIds.has(item.candidate.id) && score.eligible;
    const directed = { candidate: item.candidate, score };
    if (acceptedByDirection) {
      if ("emission" in item) {
        accepted.push({ ...directed, emission: item.emission });
      } else {
        acceptedCandidates.push(directed);
      }
      state = recordStorySelectionV2(state, item.candidate, input.now);
    } else {
      if ("emission" in item) {
        rejected.push({ ...directed, emission: item.emission });
      } else {
        rejectedCandidates.push(directed);
      }
    }
  }
  return {
    state,
    accepted,
    rejected,
    acceptedCandidates,
    rejectedCandidates,
  };
}
