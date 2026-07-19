import type { Activity, GameState } from "@/engine/core/types";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import {
  evaluateFatigueConsequences,
  getScheduledActivityInstances,
  processCompletedWeek,
  readConsecutiveRestWeeks,
  resolveWeekActivityXp,
  type WeekProcessingResult,
} from "@/engine/core/calendar";
import { calculateInfrastructureEffects } from "@/engine/finance";
import { createRNG, type RNG } from "@/engine/rng";
import { getRegionalTravelQuote } from "@/engine/world";
import {
  aggregateQualityForType,
  isQualityRelevantActivity,
  rollDayActivityQuality,
} from "./weeklySimulationSupport";

export interface WeeklyActivityQualityRoll {
  dayIndex: number;
  activity: Activity;
  result: ActivityQualityResult;
}

export interface PreparedWeeklyActivityResolution {
  rng: RNG;
  scheduledTravelActivity?: Activity;
  weekResult: WeekProcessingResult;
  qualityRollsByDay: WeeklyActivityQualityRoll[];
  qualityByType: Map<Activity["type"], ActivityQualityResult>;
}

/** Prepare deterministic calendar, travel, quality, and XP results before mutation. */
export function prepareWeeklyActivityResolution(
  gameState: GameState,
): PreparedWeeklyActivityResolution {
  const rng = createRNG(
    `${gameState.seed}-week-${gameState.currentWeek}-${gameState.currentSeason}`,
  );
  const scheduledTravelActivity = gameState.schedule.activities.find(
    (activity) => activity?.type === "internationalTravel" || activity?.type === "travel",
  ) ?? undefined;
  const travelDestination = scheduledTravelActivity?.targetId
    ?? gameState.scout.travelBooking?.destinationCountry;
  const travelPosture = gameState.scout.travelBooking?.posture;
  const quotedTravelFatigueMultiplier = travelDestination
    ? getRegionalTravelQuote(gameState, travelDestination, travelPosture).fatigueMultiplier
    : 1;
  const infrastructureTravelMultiplier = calculateInfrastructureEffects(
    gameState.scoutingInfrastructure,
  ).travelFatigueMultiplier;
  const travelFatigueMultiplier = Math.max(
    0,
    quotedTravelFatigueMultiplier * infrastructureTravelMultiplier,
  );
  const weekResult = processCompletedWeek(
    gameState.schedule,
    gameState.scout,
    rng,
    scheduledTravelActivity
      ? { [scheduledTravelActivity.type]: travelFatigueMultiplier }
      : undefined,
  );

  const qualityRollsByDay: WeeklyActivityQualityRoll[] = [];
  const qualityBucketsByType = new Map<Activity["type"], ActivityQualityResult[]>();
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const activity = gameState.schedule.activities[dayIndex];
    if (!isQualityRelevantActivity(activity)) continue;
    const result = rollDayActivityQuality(gameState, activity, dayIndex);
    qualityRollsByDay.push({ dayIndex, activity, result });
    const bucket = qualityBucketsByType.get(activity.type) ?? [];
    bucket.push(result);
    qualityBucketsByType.set(activity.type, bucket);
  }

  const qualityByType = new Map<Activity["type"], ActivityQualityResult>();
  for (const [activityType, rolls] of qualityBucketsByType.entries()) {
    qualityByType.set(activityType, aggregateQualityForType(activityType, rolls));
  }

  const qualityMultiplierByDay = new Map(
    qualityRollsByDay.map(({ dayIndex, result }) => [dayIndex, result.multiplier]),
  );
  const qualityMultiplierByInstance = new Map<string, number>();
  for (const instance of getScheduledActivityInstances(gameState.schedule)) {
    const multipliers = instance.slotIndexes
      .map((dayIndex) => qualityMultiplierByDay.get(dayIndex))
      .filter((value): value is number => value !== undefined);
    if (multipliers.length === 0) continue;
    qualityMultiplierByInstance.set(
      instance.key,
      multipliers.reduce((sum, value) => sum + value, 0) / multipliers.length,
    );
  }

  const fatigueConsequences = evaluateFatigueConsequences(
    gameState.scout.fatigue,
    readConsecutiveRestWeeks(gameState.consequenceState?.metrics),
  );
  const resolvedXp = resolveWeekActivityXp(gameState.schedule, gameState.scout, {
    qualityMultiplierByInstance,
    refreshed: fatigueConsequences.refreshedBuff,
  });
  weekResult.skillXpGained = resolvedXp.skillXpGained;
  weekResult.attributeXpGained = resolvedXp.attributeXpGained;

  return {
    rng,
    scheduledTravelActivity,
    weekResult,
    qualityRollsByDay,
    qualityByType,
  };
}
