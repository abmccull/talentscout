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
import {
  checkMasteryPerkUnlocks,
  getMasteryPerkModifiers,
} from "@/engine/specializations/masteryPerks";

function getMasteryObservationEffect(scout: Scout, context: ObservationContext): {
  extraAttributes: number;
  notes: string[];
} {
  const mastery = getMasteryPerkModifiers(checkMasteryPerkUnlocks(scout));
  const liveOrVideo = context === "liveMatch"
    || context === "videoAnalysis"
    || context === "deepVideoAnalysis";
  const training = context === "trainingGround" || context === "academyVisit";
  const notes: string[] = [];
  let extraAttributes = 0;
  if (mastery.canDetectSignatureMoves && liveOrVideo) {
    extraAttributes += 1;
    notes.push("A distinctive technical pattern is worth checking for repetition in another context.");
  }
  if (mastery.bodyLanguageAttributes.length > 0 && (liveOrVideo || training)) {
    extraAttributes += 1;
    notes.push("The player's pressure cues added mental context, but one body-language read is not a verdict.");
  }
  if (mastery.canAssessCharacter && training) {
    extraAttributes += 1;
    notes.push("Response to coaching added a character cue that should be tested over another visit.");
  }
  return { extraAttributes: Math.min(2, extraAttributes), notes };
}

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
  const memoryDetailBonus = input.scout.attributes.memory >= 15 ? 1 : 0;
  const masteryEffect = getMasteryObservationEffect(input.scout, input.context);
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
    (input.extraAttributes ?? 0) + memoryDetailBonus + masteryEffect.extraAttributes,
    {
      situation: evidence.situation,
      activityInstanceId: evidence.activityInstanceId,
      difficulty: input.state.difficulty,
    },
  );
  return {
    ...observation,
    notes: [...observation.notes, ...masteryEffect.notes],
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
  const memoryDetailBonus = input.scout.attributes.memory >= 15 ? 1 : 0;
  const masteryEffect = getMasteryObservationEffect(input.scout, input.context);
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
  const result = processVenueObservation(
    input.rng,
    input.scout,
    input.youth,
    input.context,
    input.existingObservations,
    input.state.currentWeek,
    input.state.currentSeason,
    (input.extraAttributes ?? 0) + memoryDetailBonus + masteryEffect.extraAttributes,
    input.tournament,
    {
      situation: evidence.situation,
      activityInstanceId: evidence.activityInstanceId,
      difficulty: input.state.difficulty,
    },
  );
  return {
    ...result,
    observation: {
      ...result.observation,
      notes: [...result.observation.notes, ...masteryEffect.notes],
    },
  };
}
