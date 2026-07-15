import type {
  Activity,
  GameState,
  InboxMessage,
  Observation,
  Player,
  UnsignedYouth,
  WeekSimulationState,
} from "@/engine/core/types";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import { createRNG } from "@/engine/rng";
import {
  createObservationEvidenceIndex,
  getPlayerObservationEvidence,
  upsertObservationEvidence,
} from "@/engine/scout/perception";
import { processCompletedWeek } from "@/engine/core/calendar";
import {
  applyRegionalPresenceToObservation,
} from "@/engine/world";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import {
  resolveScoutEffectiveCountry,
} from "./weeklySimulationSupport";
import { processWeeklyDataObservationActivities } from "./weeklyDataObservationActivities";
import { processWeeklyYouthObservationActivities } from "./weeklyYouthObservationActivities";
import { processWeeklyProfessionalObservationActivities } from "./weeklyProfessionalObservationActivities";

type CompletedWeekResult = ReturnType<typeof processCompletedWeek>;
type EquipmentBonuses = ReturnType<typeof getActiveEquipmentBonuses>;

export interface WeeklyObservationActivitiesInput {
  gameState: GameState;
  state: GameState;
  weekResult: CompletedWeekResult;
  equipmentBonuses?: EquipmentBonuses;
  qualityByType: ReadonlyMap<Activity["type"], ActivityQualityResult>;
  completedInteractiveIds: ReadonlySet<string>;
  completedLiveActivityTypes: ReadonlySet<Activity["type"]>;
  discoveryModifiers: ReadonlyMap<Activity["type"], number>;
  profileModifiers: ReadonlyMap<Activity["type"], number>;
  anomalyModifiers: ReadonlyMap<Activity["type"], number>;
  relationshipModifiers: ReadonlyMap<Activity["type"], number>;
  reportQualityModifiers: ReadonlyMap<Activity["type"], number>;
  focusDepthByType: ReadonlyMap<Activity["type"], number>;
  focusedPlayersByType: ReadonlyMap<Activity["type"], readonly string[]>;
  weekSimulation: WeekSimulationState | null;
}

export interface WeeklyObservationActivitiesResult {
  state: GameState;
  playersDiscovered: number;
  observationsGenerated: number;
}

export function processWeeklyObservationActivities(
  input: WeeklyObservationActivitiesInput,
): WeeklyObservationActivitiesResult {
  let stateWithScheduleApplied = input.state;
  const {
    gameState,
    weekResult,
    qualityByType,
    completedInteractiveIds,
    completedLiveActivityTypes,
    weekSimulation: simChoices,
  } = input;
  const weekEquipBonuses = input.equipmentBonuses;
  const choiceDiscoveryModifiers = input.discoveryModifiers;
  const choiceProfileModifiers = input.profileModifiers;
  const choiceAnomalyModifiers = input.anomalyModifiers;
  const choiceRelationshipModifiers = input.relationshipModifiers;
  const choiceReportQualityModifiers = input.reportQualityModifiers;
  const choiceFocusDepthByType = input.focusDepthByType;
  const choiceFocusedPlayersByType = input.focusedPlayersByType;

  // g) Activity-based observations — academy visits, youth tournaments,
  //    training visits, and video analysis generate player observations.
  //    Quality rolls modify discovery counts and prepend narratives.
  let weekPlayersDiscovered = 0;
  let weekObservationsGenerated = 0;
  {
    const actObsRng = createRNG(
      `${gameState.seed}-actobs-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const updatedObservations = { ...stateWithScheduleApplied.observations };
    const preexistingObservationIds = new Set(Object.keys(updatedObservations));
    let actDiscoveries = [...(stateWithScheduleApplied.discoveryRecords ?? [])];
    let actObsMessages: InboxMessage[] = [];
    const allPlayers = Object.values(stateWithScheduleApplied.players);
    const existingObs = Object.values(updatedObservations);
    const observationEvidenceIndex = createObservationEvidenceIndex(existingObs);
    const playerEvidence = (playerId: string): Observation[] =>
      getPlayerObservationEvidence(observationEvidenceIndex, playerId);
    const recordObservation = (observation: Observation): void => {
      updatedObservations[observation.id] = observation;
      upsertObservationEvidence(observationEvidenceIndex, observation);
    };
    const observedPlayerIds = new Set(existingObs.map((o) => o.playerId));
    const currentScout = stateWithScheduleApplied.scout;
    const effectiveScoutCountry = resolveScoutEffectiveCountry(
      currentScout,
      stateWithScheduleApplied.regionalKnowledge,
      stateWithScheduleApplied.currentWeek,
    );

    // Equipment attributesPerSession bonus: extra attributes revealed per observation
    const extraAttrsPerSession = weekEquipBonuses?.attributesPerSession ?? 0;

    // Lookup aggregated quality for a given activity type.
    // Aggregation is built from day-level rolls to keep outcomes consistent
    // with week simulation while preserving existing handler contracts.
    const qualityMap = qualityByType;

    const TIER_LABELS: Record<string, string> = {
      poor: "Poor", average: "Average", good: "Good",
      excellent: "Excellent", exceptional: "Exceptional",
    };

    // Helper: apply discovery modifier to base range, clamped to min 1
    function adjustedRange(baseMin: number, baseMax: number, mod: number): [number, number] {
      return [Math.max(1, baseMin + mod), Math.max(1, baseMax + mod)];
    }

    function choiceDiscoveryMod(activityType: Activity["type"]): number {
      return choiceDiscoveryModifiers.get(activityType) ?? 0;
    }

    function choiceProfileMod(activityType: Activity["type"]): number {
      return choiceProfileModifiers.get(activityType) ?? 0;
    }

    function choiceAnomalyMod(activityType: Activity["type"]): number {
      return choiceAnomalyModifiers.get(activityType) ?? 0;
    }

    function choiceRelationshipMod(activityType: Activity["type"]): number {
      return choiceRelationshipModifiers.get(activityType) ?? 0;
    }

    function choiceReportQualityMod(activityType: Activity["type"]): number {
      return choiceReportQualityModifiers.get(activityType) ?? 0;
    }

    function focusDepth(activityType: Activity["type"]): number {
      return choiceFocusDepthByType.get(activityType) ?? 0;
    }

    function focusPlayers(activityType: Activity["type"]): string[] {
      const selected = choiceFocusedPlayersByType.get(activityType);
      if (selected && selected.length > 0) return [...selected];
      if (simChoices?.focusedYouthPlayerIds && simChoices.focusedYouthPlayerIds.length > 0) {
        return simChoices.focusedYouthPlayerIds;
      }
      if (simChoices?.focusedYouthPlayerId) return [simChoices.focusedYouthPlayerId];
      return [];
    }

    function prioritizeFocusedYouth(
      pool: UnsignedYouth[],
      activityType: Activity["type"],
    ): UnsignedYouth[] {
      const targetIds = focusPlayers(activityType);
      if (targetIds.length === 0) return pool;

      const orderMap = new Map(targetIds.map((id, idx) => [id, idx]));
      const focused: UnsignedYouth[] = [];
      const rest: UnsignedYouth[] = [];
      for (const youth of pool) {
        if (orderMap.has(youth.player.id)) {
          focused.push(youth);
        } else {
          rest.push(youth);
        }
      }

      focused.sort((a, b) => {
        const aOrder = orderMap.get(a.player.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = orderMap.get(b.player.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
      return [...focused, ...rest];
    }

    function prioritizeFocusedPlayers(
      pool: Player[],
      activityType: Activity["type"],
    ): Player[] {
      const targetIds = focusPlayers(activityType);
      if (targetIds.length === 0) return pool;

      const orderMap = new Map(targetIds.map((id, idx) => [id, idx]));
      const focused: Player[] = [];
      const rest: Player[] = [];
      for (const player of pool) {
        if (orderMap.has(player.id)) {
          focused.push(player);
        } else {
          rest.push(player);
        }
      }

      focused.sort((a, b) => {
        const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
      return [...focused, ...rest];
    }

    const professionalObservations = processWeeklyProfessionalObservationActivities({
      sourceState: gameState,
      state: stateWithScheduleApplied,
      weekResult,
      equipmentBonuses: weekEquipBonuses,
      qualityByType: qualityMap,
      scout: currentScout,
      effectiveScoutCountry,
      rng: actObsRng,
      discoveries: actDiscoveries,
      messages: actObsMessages,
      playersDiscovered: weekPlayersDiscovered,
      observationsGenerated: weekObservationsGenerated,
      allPlayers,
      extraAttributesPerSession: extraAttrsPerSession,
      playerEvidence,
      recordObservation,
      observedPlayerIds,
      adjustedRange,
      discoveryModifier: choiceDiscoveryMod,
      relationshipModifier: choiceRelationshipMod,
      reportQualityModifier: choiceReportQualityMod,
      focusDepth,
      focusPlayers,
      prioritizeYouth: prioritizeFocusedYouth,
      prioritizePlayers: prioritizeFocusedPlayers,
      tierLabels: TIER_LABELS,
    });
    stateWithScheduleApplied = professionalObservations.state;
    actDiscoveries = professionalObservations.discoveries;
    actObsMessages = professionalObservations.messages;
    weekPlayersDiscovered = professionalObservations.playersDiscovered;
    weekObservationsGenerated = professionalObservations.observationsGenerated;
    const dataObservations = processWeeklyDataObservationActivities({
      sourceState: gameState,
      state: stateWithScheduleApplied,
      weekResult,
      equipmentBonuses: weekEquipBonuses,
      scout: currentScout,
      allPlayers,
      messages: actObsMessages,
      observationsGenerated: weekObservationsGenerated,
      extraAttributesPerSession: extraAttrsPerSession,
      playerEvidence,
      recordObservation,
      observedPlayerIds,
      profileModifier: choiceProfileMod,
      anomalyModifier: choiceAnomalyMod,
      relationshipModifier: choiceRelationshipMod,
      reportQualityModifier: choiceReportQualityMod,
      prioritizePlayers: prioritizeFocusedPlayers,
    });
    stateWithScheduleApplied = dataObservations.state;
    actObsMessages = dataObservations.messages;
    weekObservationsGenerated = dataObservations.observationsGenerated;

    const youthObservations = processWeeklyYouthObservationActivities({
      sourceState: gameState,
      state: stateWithScheduleApplied,
      weekResult,
      equipmentBonuses: weekEquipBonuses,
      qualityByType: qualityMap,
      scout: currentScout,
      effectiveScoutCountry,
      rng: actObsRng,
      discoveries: actDiscoveries,
      messages: actObsMessages,
      observations: updatedObservations,
      playersDiscovered: weekPlayersDiscovered,
      observationsGenerated: weekObservationsGenerated,
      playerEvidence,
      recordObservation,
      discoveryModifier: choiceDiscoveryMod,
      focusDepth,
      focusPlayers,
      prioritizeYouth: prioritizeFocusedYouth,
      weekSimulation: simChoices,
      completedInteractiveIds,
      completedLiveActivityTypes,
      tierLabels: TIER_LABELS,
    });
    stateWithScheduleApplied = youthObservations.state;
    actDiscoveries = youthObservations.discoveries;
    actObsMessages = youthObservations.messages;
    weekPlayersDiscovered = youthObservations.playersDiscovered;
    weekObservationsGenerated = youthObservations.observationsGenerated;
    // Apply regional context once, after every manual/week-simulation path
    // has converged on the same authoritative observation collection.
    const presenceAdjustedObservations = {
      ...stateWithScheduleApplied.observations,
    };
    for (const [observationId, observation] of Object.entries(presenceAdjustedObservations)) {
      if (preexistingObservationIds.has(observationId)) continue;
      presenceAdjustedObservations[observationId] = applyRegionalPresenceToObservation(
        stateWithScheduleApplied,
        observation,
      );
    }
    stateWithScheduleApplied = {
      ...stateWithScheduleApplied,
      observations: presenceAdjustedObservations,
    };
  }
  return {
    state: stateWithScheduleApplied,
    playersDiscovered: weekPlayersDiscovered,
    observationsGenerated: weekObservationsGenerated,
  };
}
