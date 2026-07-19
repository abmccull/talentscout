import type {
  Activity,
  GameState,
  WeekSimulationState,
} from "@/engine/core/types";
import { getActivityInteractionEffect } from "@/engine/core/activityInteractions";
import { getScheduledActivityInstances } from "@/engine/core/calendar";
import {
  getDelegationPolicyModifier,
  getWeeklyIntentActivityModifier,
  normalizeWeeklyStrategyState,
  type WeeklyStrategyModifier,
} from "@/engine/core/weeklyStrategy";
import { ACTIVITY_MODE_MAP } from "@/engine/observation/types";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import { getDayChoiceId } from "./weeklySimulationSupport";

export interface WeeklyActivityModifierState {
  discoveryModifiers: Map<Activity["type"], number>;
  profileModifiers: Map<Activity["type"], number>;
  anomalyModifiers: Map<Activity["type"], number>;
  relationshipModifiers: Map<Activity["type"], number>;
  reportQualityModifiers: Map<Activity["type"], number>;
  focusDepthByType: Map<Activity["type"], number>;
  focusedPlayersByType: Map<Activity["type"], string[]>;
  completedInteractiveIds: Set<string>;
  completedLiveActivityTypes: Set<Activity["type"]>;
}

interface WeeklyActivityModifierInput {
  gameState: GameState;
  weekSimulation: WeekSimulationState | null;
}

function addModifier(
  modifiers: Map<Activity["type"], number>,
  activityType: Activity["type"],
  value: number | undefined,
): void {
  modifiers.set(activityType, (modifiers.get(activityType) ?? 0) + (value ?? 0));
}

/**
 * Build the choice-authored portion before the weekly pipeline enters activity
 * resolution. This preserves the established ordering around transaction
 * telemetry while keeping store reads out of the calculation.
 */
export function createWeeklyChoiceModifiers({
  gameState,
  weekSimulation,
}: WeeklyActivityModifierInput): WeeklyActivityModifierState {
  const modifiers: WeeklyActivityModifierState = {
    discoveryModifiers: new Map(),
    profileModifiers: new Map(),
    anomalyModifiers: new Map(),
    relationshipModifiers: new Map(),
    reportQualityModifiers: new Map(),
    focusDepthByType: new Map(),
    focusedPlayersByType: new Map(),
    completedInteractiveIds: new Set(gameState.completedInteractiveSessions ?? []),
    completedLiveActivityTypes: new Set(),
  };

  if (!weekSimulation) return modifiers;

  for (const day of weekSimulation.dayResults) {
    const activity = gameState.schedule.activities[day.dayIndex];
    if (!activity) continue;
    const choiceId = getDayChoiceId(day);
    if (!choiceId) continue;
    const effect = getActivityInteractionEffect(activity.type, choiceId);
    addModifier(modifiers.discoveryModifiers, activity.type, effect.discoveryModifier);
    addModifier(modifiers.profileModifiers, activity.type, effect.profileModifier);
    addModifier(modifiers.anomalyModifiers, activity.type, effect.anomalyModifier);
    addModifier(modifiers.relationshipModifiers, activity.type, effect.relationshipModifier);
    addModifier(modifiers.reportQualityModifiers, activity.type, effect.reportQualityModifier);

    if (choiceId !== "focus") continue;
    const selectedFocusIds = Array.from(
      new Set(
        (
          day.interaction?.focusedPlayerIds
          ?? (day.interaction?.focusedPlayerId ? [day.interaction.focusedPlayerId] : undefined)
          ?? weekSimulation.focusedYouthPlayerIds
          ?? (weekSimulation.focusedYouthPlayerId ? [weekSimulation.focusedYouthPlayerId] : [])
        ).filter(Boolean),
      ),
    ).slice(0, 3);

    if (selectedFocusIds.length === 0) continue;
    const focusedPlayers = modifiers.focusedPlayersByType.get(activity.type) ?? [];
    const merged = [...focusedPlayers];
    for (const playerId of selectedFocusIds) {
      if (!merged.includes(playerId)) merged.push(playerId);
    }
    modifiers.focusedPlayersByType.set(activity.type, merged);

    // Single-target focus yields deepest reads. Splitting attention reduces depth.
    const depthGain = Math.max(1, 4 - selectedFocusIds.length);
    addModifier(modifiers.focusDepthByType, activity.type, depthGain);
  }

  return modifiers;
}

function accumulateStrategyModifier(
  modifiers: WeeklyActivityModifierState,
  activityType: Activity["type"],
  modifier: WeeklyStrategyModifier,
): void {
  addModifier(modifiers.discoveryModifiers, activityType, modifier.discoveryModifier);
  addModifier(modifiers.profileModifiers, activityType, modifier.profileModifier);
  addModifier(modifiers.anomalyModifiers, activityType, modifier.anomalyModifier);
  addModifier(modifiers.relationshipModifiers, activityType, modifier.relationshipModifier);
  addModifier(modifiers.reportQualityModifiers, activityType, modifier.reportQualityModifier);
}

/**
 * Apply persistent desk policy plus completed/skipped live-session effects after
 * activity-resolution telemetry begins. Mutating the supplied maps preserves
 * their existing downstream identity and avoids a second authority path.
 */
export function applyWeeklyStrategyAndInteractiveModifiers(
  { gameState, weekSimulation }: WeeklyActivityModifierInput,
  modifiers: WeeklyActivityModifierState,
): void {
  const strategy = normalizeWeeklyStrategyState(
    gameState.weeklyStrategy,
    gameState.currentWeek,
    gameState.currentSeason,
  );

  // Strategy is applied once per scheduled activity instance. This keeps
  // manual and auto-scheduled weeks equivalent while making the selected
  // weekly intent a real edge with an explicit opposing cost.
  const scheduledInstances = getScheduledActivityInstances(gameState.schedule);
  for (const instance of scheduledInstances) {
    accumulateStrategyModifier(
      modifiers,
      instance.activity.type,
      getWeeklyIntentActivityModifier(strategy.intentId, instance.activity),
    );
  }

  // A skipped live call is not silently converted into a generic choice.
  // The persisted standing order resolves it and adds its own tradeoff.
  for (const day of weekSimulation?.dayResults ?? []) {
    if (day.interaction?.resolutionMode !== "delegated" || !day.activity) continue;
    accumulateStrategyModifier(
      modifiers,
      day.activity.type,
      getDelegationPolicyModifier(
        day.interaction.delegationPolicyId ?? strategy.delegationPolicyId,
      ),
    );
  }

  const skippedInteractiveByType = new Map<Activity["type"], number>();
  for (const instance of scheduledInstances) {
    const activity = instance.activity;
    if (activity.type === "attendMatch") continue;
    const mode = ACTIVITY_MODE_MAP[activity.type];
    if (!mode) continue;

    const instanceKey = getInteractiveActivityCompletionKey(activity, instance.dayIndex);
    if (modifiers.completedInteractiveIds.has(instanceKey)) {
      switch (mode) {
        case "fullObservation":
          // The live session writes its own observations. Do not stack a second
          // generic bonus on top of that evidence.
          modifiers.completedLiveActivityTypes.add(activity.type);
          break;
        case "investigation":
          addModifier(modifiers.relationshipModifiers, activity.type, 1);
          addModifier(modifiers.reportQualityModifiers, activity.type, 1);
          break;
        case "analysis":
          addModifier(modifiers.profileModifiers, activity.type, 1);
          addModifier(modifiers.anomalyModifiers, activity.type, 1);
          break;
        case "quickInteraction":
          addModifier(modifiers.relationshipModifiers, activity.type, 1);
          break;
      }
    } else {
      addModifier(skippedInteractiveByType, activity.type, 1);
    }
  }

  // Skipping live sessions carries a small opportunity-cost penalty.
  for (const [activityType, skippedCount] of skippedInteractiveByType.entries()) {
    if (skippedCount <= 0) continue;
    const mode = ACTIVITY_MODE_MAP[activityType];
    if (!mode) continue;
    switch (mode) {
      case "fullObservation":
        addModifier(modifiers.discoveryModifiers, activityType, -1);
        break;
      case "investigation":
        addModifier(modifiers.relationshipModifiers, activityType, -1);
        break;
      case "analysis":
        addModifier(modifiers.profileModifiers, activityType, -1);
        break;
      case "quickInteraction":
        addModifier(modifiers.relationshipModifiers, activityType, -1);
        break;
    }
  }
}
