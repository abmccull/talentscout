/**
 * Deterministic situation construction for weekly/background observations.
 *
 * This module deliberately does not consume the simulation RNG stream. A
 * situation is derived from persisted state, the scheduled activity, and the
 * player's longitudinal observation ordinal, so manual advancement, batch
 * advancement, and save/reload all produce the same evidence conditions.
 */

import { getScheduledActivityInstances } from "@/engine/core/calendar";
import type {
  ActivityType,
  GameState,
  Observation,
  ObservationContext,
  Player,
  RegionalKnowledge,
} from "@/engine/core/types";
import { getPlayerScoutingCountry } from "@/engine/world/regionalPresence";
import {
  getScoutHomeCountry,
  isScoutAbroad,
} from "@/engine/world/travel";
import { normalizeCountryKey } from "@/lib/country";
import {
  createObservationSituation,
  type ObservationSituationSnapshot,
} from "./situations";

export interface BackgroundObservationSituationInput {
  state: GameState;
  activityType: ActivityType;
  observationContext: ObservationContext;
  player: Player;
  existingObservations: readonly Observation[];
  countryId?: string;
  venueType?: string;
  activityInstanceId?: string;
  /** Additional stable identity for previews or multiple same-week watches. */
  occurrenceKey?: string | number;
}
export interface BackgroundObservationEvidenceContext {
  situation: ObservationSituationSnapshot;
  activityInstanceId?: string;
}

const CONTEXT_ACTIVITY_MAP: Record<ObservationContext, ActivityType> = {
  liveMatch: "scoutingMission",
  trainingGround: "trainingVisit",
  videoAnalysis: "watchVideo",
  academyVisit: "academyVisit",
  youthTournament: "youthTournament",
  reserveMatch: "reserveMatch",
  oppositionAnalysis: "oppositionAnalysis",
  agentShowcase: "agentShowcase",
  trialMatch: "trialMatch",
  schoolMatch: "schoolMatch",
  grassrootsTournament: "grassrootsTournament",
  streetFootball: "streetFootball",
  academyTrialDay: "academyTrialDay",
  youthFestival: "youthFestival",
  followUpSession: "followUpSession",
  parentCoachMeeting: "parentCoachMeeting",
  databaseQuery: "databaseQuery",
  statsBriefing: "statsBriefing",
  deepVideoAnalysis: "deepVideoAnalysis",
};

/** Shared mapping used by every background producer when no richer activity is known. */
export function getBackgroundActivityTypeForContext(
  context: ObservationContext,
): ActivityType {
  return CONTEXT_ACTIVITY_MAP[context];
}

function canonicalCountry(value?: string): string | undefined {
  const normalized = normalizeCountryKey(value);
  if (normalized) return normalized;
  const fallback = value?.trim().toLowerCase();
  return fallback || undefined;
}

function findRegionalKnowledge(
  state: GameState,
  countryId: string | undefined,
): RegionalKnowledge | undefined {
  if (!countryId) return undefined;
  return Object.entries(state.regionalKnowledge ?? {}).find(([key, knowledge]) =>
    canonicalCountry(key) === countryId
    || canonicalCountry(knowledge.countryId) === countryId,
  )?.[1];
}

function resolveActivityInstanceId(
  state: GameState,
  activityType: ActivityType,
  playerId: string,
  explicitId?: string,
): string | undefined {
  if (explicitId) return explicitId;
  const instances = getScheduledActivityInstances(state.schedule)
    .filter((instance) => instance.activity.type === activityType);
  const targeted = instances.find((instance) =>
    instance.activity.targetId === playerId,
  );
  return (targeted ?? instances[0])?.key;
}

/**
 * Build the one persisted situation snapshot used by all non-interactive
 * observation pipelines. This function is pure and stable for equivalent
 * persisted input.
 */
export function createBackgroundObservationSituation(
  input: BackgroundObservationSituationInput,
): BackgroundObservationEvidenceContext {
  const playerCountry = getPlayerScoutingCountry(input.state, input.player);
  const countryId = canonicalCountry(input.countryId)
    ?? canonicalCountry(playerCountry)
    ?? canonicalCountry(
      isScoutAbroad(input.state.scout, input.state.currentWeek)
        ? input.state.scout.travelBooking?.destinationCountry
        : getScoutHomeCountry(input.state.scout),
    );
  const regionalKnowledge = findRegionalKnowledge(input.state, countryId);
  const activeTravelCountry = isScoutAbroad(input.state.scout, input.state.currentWeek)
    ? canonicalCountry(input.state.scout.travelBooking?.destinationCountry)
    : undefined;
  const travelPosture = countryId && activeTravelCountry === countryId
    ? input.state.scout.travelBooking?.posture
    : undefined;
  const observationOrdinal = input.existingObservations.filter(
    (observation) => observation.playerId === input.player.id,
  ).length;
  const activityInstanceId = resolveActivityInstanceId(
    input.state,
    input.activityType,
    input.player.id,
    input.activityInstanceId,
  );
  const occurrenceKey = input.occurrenceKey ?? observationOrdinal;
  const seed = [
    input.state.seed,
    `s${input.state.currentSeason}`,
    `w${input.state.currentWeek}`,
    activityInstanceId ?? input.activityType,
    input.observationContext,
    input.player.id,
    `observation-${observationOrdinal}`,
    `occurrence-${occurrenceKey}`,
  ].join(":");

  return {
    activityInstanceId,
    situation: createObservationSituation({
      activityType: input.activityType,
      seed,
      venueType: input.venueType ?? input.observationContext,
      countryId,
      travelPosture,
      culturalInsights: regionalKnowledge?.culturalInsights,
    }),
  };
}
