/**
 * The sole adapter from weekly/background activities into observation truth.
 * Interactive sessions keep their own explicit situation, while every
 * automatic producer routes through these helpers before perception runs.
 */

import type {
  ActivityType,
  GameState,
  Observation,
  ObservationContext,
  Player,
  Scout,
  TournamentEvent,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  createBackgroundObservationSituation,
  getBackgroundActivityTypeForContext,
} from "@/engine/observation/backgroundSituation";
import type { RNG } from "@/engine/rng";
import { observePlayerLight } from "@/engine/scout/perception";
import { processVenueObservation } from "@/engine/youth/venues";

interface WeeklyObservationBaseInput {
  state: GameState;
  rng: RNG;
  scout: Scout;
  context: ObservationContext;
  existingObservations: Observation[];
  activityType?: ActivityType;
  countryId?: string;
  venueType?: string;
  activityInstanceId?: string;
  occurrenceKey?: string | number;
}
export interface ProduceWeeklyPlayerObservationInput extends WeeklyObservationBaseInput {
  player: Player;
  extraAttributes?: number;
}

export function produceWeeklyPlayerObservation(
  input: ProduceWeeklyPlayerObservationInput,
): Observation {
  const activityType = input.activityType
    ?? getBackgroundActivityTypeForContext(input.context);
  const evidence = createBackgroundObservationSituation({
    state: input.state,
    activityType,
    observationContext: input.context,
    player: input.player,
    existingObservations: input.existingObservations,
    countryId: input.countryId,
    venueType: input.venueType,
    activityInstanceId: input.activityInstanceId,
    occurrenceKey: input.occurrenceKey,
  });
  const observation = observePlayerLight(
    input.rng,
    input.player,
    input.scout,
    input.context,
    input.existingObservations,
    input.extraAttributes,
    {
      situation: evidence.situation,
      activityInstanceId: evidence.activityInstanceId,
      difficulty: input.state.difficulty,
    },
  );
  return {
    ...observation,
    week: input.state.currentWeek,
    season: input.state.currentSeason,
  };
}

export interface ProduceWeeklyVenueObservationInput extends WeeklyObservationBaseInput {
  youth: UnsignedYouth;
  extraAttributes?: number;
  tournament?: TournamentEvent;
}

export function produceWeeklyVenueObservation(
  input: ProduceWeeklyVenueObservationInput,
): ReturnType<typeof processVenueObservation> {
  const activityType = input.activityType
    ?? getBackgroundActivityTypeForContext(input.context);
  const evidence = createBackgroundObservationSituation({
    state: input.state,
    activityType,
    observationContext: input.context,
    player: input.youth.player,
    existingObservations: input.existingObservations,
    countryId: input.countryId ?? input.tournament?.country ?? input.youth.country,
    venueType: input.venueType ?? input.tournament?.id ?? input.context,
    activityInstanceId: input.activityInstanceId,
    occurrenceKey: input.occurrenceKey,
  });
  return processVenueObservation(
    input.rng,
    input.scout,
    input.youth,
    input.context,
    input.existingObservations,
    input.state.currentWeek,
    input.state.currentSeason,
    input.extraAttributes,
    input.tournament,
    {
      situation: evidence.situation,
      activityInstanceId: evidence.activityInstanceId,
      difficulty: input.state.difficulty,
    },
  );
}
