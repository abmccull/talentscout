import type {
  GameState,
  NarrativeEvent,
  NarrativeEventType,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { getRunSimulationModifiers } from "@/engine/run";
import {
  generateNarrativeEventOfType,
  generateWeeklyEvent,
  type WeeklyEventResult,
} from "./narrativeEvents";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import { selectScoutingSpecialEvent } from "./specialEventDeck";
import { getPriorityConfidentialityObligation } from "./eventTemplates";

export interface EventDirectorState {
  version: 1;
  tension: number;
  quietWeeks: number;
  recentEventTypes: NarrativeEventType[];
  eventCounts: Partial<Record<NarrativeEventType, number>>;
  recentSpecialEventIds: string[];
  specialEventCounts: Record<string, number>;
  lastSpecialSeason?: number;
  totalEvents: number;
}

export interface DirectedWeeklyEventResult extends WeeklyEventResult {
  director: EventDirectorState;
  triggerChance: number;
  generatedSpecialEvent: boolean;
}

export function createEventDirectorState(
  partial: Partial<EventDirectorState> = {},
): EventDirectorState {
  return {
    version: 1,
    tension: Math.min(100, Math.max(0, partial.tension ?? 18)),
    quietWeeks: Math.max(0, Math.floor(partial.quietWeeks ?? 0)),
    recentEventTypes: [...(partial.recentEventTypes ?? [])].slice(-8),
    eventCounts: { ...(partial.eventCounts ?? {}) },
    recentSpecialEventIds: [...(partial.recentSpecialEventIds ?? [])].slice(-6),
    specialEventCounts: { ...(partial.specialEventCounts ?? {}) },
    lastSpecialSeason: partial.lastSpecialSeason,
    totalEvents: Math.max(0, Math.floor(partial.totalEvents ?? 0)),
  };
}

function noveltyWeights(
  director: EventDirectorState,
  traitWeights: Partial<Record<NarrativeEventType, number>>,
): Partial<Record<NarrativeEventType, number>> {
  const weights = { ...traitWeights };
  for (const [type, count] of Object.entries(director.eventCounts) as [
    NarrativeEventType,
    number,
  ][]) {
    weights[type] = (weights[type] ?? 1) / Math.sqrt(1 + count * 0.18);
  }
  [...director.recentEventTypes].reverse().forEach((type, recency) => {
    const repeatPenalty = recency === 0 ? 0 : recency < 2 ? 0.14 : recency < 5 ? 0.42 : 0.68;
    weights[type] = (weights[type] ?? 1) * repeatPenalty;
  });
  return weights;
}

function recordEvent(
  director: EventDirectorState,
  event: NarrativeEvent | null,
  special: boolean,
  currentSeason: number,
): EventDirectorState {
  if (!event) {
    return {
      ...director,
      tension: Math.min(100, director.tension + 7),
      quietWeeks: director.quietWeeks + 1,
    };
  }
  return {
    ...director,
    tension: Math.max(0, director.tension - (special ? 48 : 24)),
    quietWeeks: 0,
    recentEventTypes: [...director.recentEventTypes, event.type].slice(-8),
    eventCounts: {
      ...director.eventCounts,
      [event.type]: (director.eventCounts[event.type] ?? 0) + 1,
    },
    recentSpecialEventIds: event.specialEventId
      ? [...director.recentSpecialEventIds, event.specialEventId].slice(-6)
      : director.recentSpecialEventIds,
    specialEventCounts: event.specialEventId
      ? {
          ...director.specialEventCounts,
          [event.specialEventId]:
            (director.specialEventCounts[event.specialEventId] ?? 0) + 1,
        }
      : director.specialEventCounts,
    lastSpecialSeason: special ? currentSeason : director.lastSpecialSeason,
    totalEvents: director.totalEvents + 1,
  };
}

/**
 * Deterministic pacing layer: quiet periods build pressure, unresolved choices
 * suppress overload, recent content is penalized, and rare turning points are
 * guaranteed to use the same persisted run seed and state.
 */
export function directWeeklyNarrativeEvent(
  rng: RNG,
  state: GameState,
): DirectedWeeklyEventResult {
  const director = createEventDirectorState(state.eventDirector);
  const modifiers = getRunSimulationModifiers(state.runManifest);
  const unresolvedChoices = state.narrativeEvents.filter((event) =>
    event.selectedChoice === undefined
    && !event.acknowledged
    && (event.choices?.length ?? 0) > 0,
  ).length;
  const overloadMultiplier = unresolvedChoices >= 3
    ? 0.3
    : unresolvedChoices === 2
      ? 0.55
      : 1;
  const triggerChance = Math.min(
    0.42,
    Math.max(
      0.04,
      (0.1
        + director.quietWeeks * 0.012
        + director.tension * 0.0008)
        * modifiers.narrativeEventChanceMultiplier
        * overloadMultiplier,
    ),
  );
  let generated = generateWeeklyEvent(rng, state, {
    triggerChance,
    cooldownWeeks: Math.max(1, 2 + modifiers.narrativeCooldownDelta),
    chainTriggerChance: Math.min(0.28, 0.08 + director.tension * 0.0015),
    typeWeights: noveltyWeights(director, modifiers.narrativeTypeWeights),
  });

  const currentDate = { week: state.currentWeek, season: state.currentSeason };
  const activeConfidentiality = getPriorityConfidentialityObligation(state);
  const confidentialityAlreadyOffered = state.narrativeEvents.some((candidate) =>
    candidate.type === "confidentialityDilemma"
    && candidate.selectedChoice === undefined
    && candidate.relatedIds.includes(activeConfidentiality?.creditor.id ?? ""),
  );
  const confidentialityAge = activeConfidentiality
    ? gameWeeksBetween(state.fixtures, activeConfidentiality.createdAt, currentDate)
    : 0;
  const weeksUntilConfidentialityDue = activeConfidentiality?.dueAt
    ? gameWeeksBetween(state.fixtures, currentDate, activeConfidentiality.dueAt)
    : Number.POSITIVE_INFINITY;
  const confidentialityIsUrgent = Boolean(
    activeConfidentiality
    && !confidentialityAlreadyOffered
    && (confidentialityAge >= 8 || weeksUntilConfidentialityDue <= 4),
  );
  // Due chain continuations retain priority. A random standalone beat may be
  // replaced so a real promise cannot silently expire without a player choice.
  if (confidentialityIsUrgent && !generated.advancedChain) {
    const dilemma = generateNarrativeEventOfType(
      rng,
      state,
      "confidentialityDilemma",
    );
    if (dilemma) generated = { event: dilemma };
  }

  let event = generated.event;
  let generatedSpecialEvent = false;
  const currentSeasonSpecials = state.narrativeEvents
    .filter((candidate) =>
      candidate.season === state.currentSeason && Boolean(candidate.specialEventId),
    )
    .sort((left, right) => right.week - left.week || right.id.localeCompare(left.id));
  const weeksSinceSpecial = currentSeasonSpecials[0]
    ? state.currentWeek - currentSeasonSpecials[0].week
    : Number.POSITIVE_INFINITY;
  const specialEligible = !event
    && director.tension >= 72
    && director.quietWeeks >= 4
    && currentSeasonSpecials.length < 2
    && weeksSinceSpecial >= 10
    && unresolvedChoices < 2;
  const pressureReleaseRequired = director.tension >= 100 && director.quietWeeks >= 8;
  if (
    specialEligible
    && (
      pressureReleaseRequired
      || rng.chance(Math.min(0.8, 0.3 + director.tension / 200))
    )
  ) {
    const seasonSpecialIds = [...currentSeasonSpecials]
      .sort((left, right) => left.week - right.week || left.id.localeCompare(right.id))
      .flatMap((candidate) => candidate.specialEventId ? [candidate.specialEventId] : []);
    event = selectScoutingSpecialEvent(rng, state, {
      recentSpecialEventIds: [
        ...director.recentSpecialEventIds,
        ...seasonSpecialIds,
      ].slice(-6),
      specialEventCounts: director.specialEventCounts,
    });
    generatedSpecialEvent = event !== null;
  }

  return {
    ...generated,
    event,
    director: recordEvent(
      director,
      event,
      generatedSpecialEvent,
      state.currentSeason,
    ),
    triggerChance,
    generatedSpecialEvent,
  };
}
