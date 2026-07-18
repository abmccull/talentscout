import {
  ALL_ATTRIBUTES,
  type GameState,
  type Observation,
  type ObservationContext,
  type PlayerAttribute,
  type UnsignedYouth,
} from "@/engine/core/types";
import { recordDiscovery } from "@/engine/career/discoveryTracking";
import { calculateSystemFit } from "@/engine/firstTeam/systemFit";
import type { ObservationSession } from "@/engine/observation/types";
import { applyRegionalPresenceToObservation } from "@/engine/world/regionalPresence";
import type { InsightActionContext } from "./actions";
import { createInsightState, recordInsightUse } from "./insight";
import type {
  InsightActionResult,
  InsightPersistedEffects,
  InsightState,
  PendingInsightQueryAccuracyEffect,
  PendingInsightReportQualityEffect,
} from "./types";
import { createEmptyInsightPersistedEffects } from "./types";

const PLAYER_ATTRIBUTES = new Set<string>(ALL_ATTRIBUTES);
const DIRECT_OBSERVATION_CONTEXTS = new Set<ObservationContext>([
  "liveMatch",
  "videoAnalysis",
  "trainingGround",
  "youthTournament",
  "academyVisit",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "followUpSession",
  "parentCoachMeeting",
  "reserveMatch",
  "oppositionAnalysis",
  "agentShowcase",
  "trialMatch",
  "databaseQuery",
  "statsBriefing",
  "deepVideoAnalysis",
]);

type NormalizedInsightState = InsightState & { persistedEffects: InsightPersistedEffects };

export function normalizeInsightState(state?: InsightState): NormalizedInsightState {
  const base = state ?? createInsightState();
  const persisted = base.persistedEffects;
  return {
    ...base,
    persistedEffects: {
      ...createEmptyInsightPersistedEffects(),
      pendingReportQuality: Array.isArray(persisted?.pendingReportQuality)
        ? persisted.pendingReportQuality
        : [],
      pendingQueryAccuracy: Array.isArray(persisted?.pendingQueryAccuracy)
        ? persisted.pendingQueryAccuracy
        : [],
    },
  };
}

export function getPendingInsightReportQualityEffect(
  state: InsightState | undefined,
  playerId: string,
): PendingInsightReportQualityEffect | undefined {
  const effects = normalizeInsightState(state).persistedEffects;
  return effects.pendingReportQuality.find((effect) => effect.playerId === playerId)
    ?? effects.pendingReportQuality.find((effect) => effect.playerId === undefined);
}

export function consumeInsightReportQualityEffect(
  state: InsightState,
  effectId: string,
): InsightState {
  const normalized = normalizeInsightState(state);
  return {
    ...normalized,
    persistedEffects: {
      ...normalized.persistedEffects,
      pendingReportQuality: normalized.persistedEffects.pendingReportQuality
        .filter((effect) => effect.id !== effectId),
    },
  };
}

export function getPendingInsightQueryAccuracyEffect(
  state: InsightState | undefined,
): PendingInsightQueryAccuracyEffect | undefined {
  return normalizeInsightState(state).persistedEffects.pendingQueryAccuracy[0];
}

export function consumeInsightQueryAccuracyEffect(
  state: InsightState,
  effectId: string,
): InsightState {
  const normalized = normalizeInsightState(state);
  return {
    ...normalized,
    persistedEffects: {
      ...normalized.persistedEffects,
      pendingQueryAccuracy: normalized.persistedEffects.pendingQueryAccuracy
        .filter((effect) => effect.id !== effectId),
    },
  };
}

function queueReportQualityEffect(
  state: InsightState,
  effect: PendingInsightReportQualityEffect,
): NormalizedInsightState {
  const normalized = normalizeInsightState(state);
  const pendingReportQuality = normalized.persistedEffects.pendingReportQuality
    .filter((candidate) => candidate.playerId !== effect.playerId);
  return {
    ...normalized,
    persistedEffects: {
      ...normalized.persistedEffects,
      pendingReportQuality: [...pendingReportQuality, effect],
    },
  };
}

function queueQueryAccuracyEffect(
  state: InsightState,
  effect: PendingInsightQueryAccuracyEffect,
): NormalizedInsightState {
  const normalized = normalizeInsightState(state);
  return {
    ...normalized,
    persistedEffects: {
      ...normalized.persistedEffects,
      pendingQueryAccuracy: [effect],
    },
  };
}

function isPlayerAttribute(value: string): value is PlayerAttribute {
  return PLAYER_ATTRIBUTES.has(value);
}

function resolveObservationContext(session: ObservationSession): ObservationContext {
  if (session.situation?.observationContext) {
    return session.situation.observationContext;
  }
  if (DIRECT_OBSERVATION_CONTEXTS.has(session.activityType as ObservationContext)) {
    return session.activityType as ObservationContext;
  }
  if (session.activityType === "attendMatch" || session.activityType === "scoutingMission") {
    return "liveMatch";
  }
  if (session.activityType === "watchVideo") return "videoAnalysis";
  if (session.activityType === "trainingVisit") return "trainingGround";
  if (session.mode === "analysis") return "databaseQuery";
  if (session.mode === "investigation" || session.mode === "quickInteraction") {
    return "parentCoachMeeting";
  }
  return "liveMatch";
}

function clampAttributeReadingValue(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

function resolveInsightReadingRange(
  value: number,
  confidence: number,
): { perceivedValue: number; rangeLow: number; rangeHigh: number } {
  const perceivedValue = clampAttributeReadingValue(value);
  const normalizedConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 1;
  const radius = normalizedConfidence >= 0.95
    ? 0
    : normalizedConfidence >= 0.82
      ? 1
      : normalizedConfidence >= 0.7
        ? 2
        : 3;
  return {
    perceivedValue,
    rangeLow: clampAttributeReadingValue(perceivedValue - radius),
    rangeHigh: clampAttributeReadingValue(perceivedValue + radius),
  };
}

function createInsightObservations(
  state: GameState,
  session: ObservationSession,
  result: InsightActionResult,
): Record<string, Observation> {
  const readingsByPlayer = new Map<
    string,
    Map<PlayerAttribute, { value: number; confidence: number }>
  >();
  const addReading = (
    playerId: string,
    attribute: string,
    value: number,
    confidence: number,
  ) => {
    if (!isPlayerAttribute(attribute)) return;
    const playerReadings = readingsByPlayer.get(playerId) ?? new Map();
    const existing = playerReadings.get(attribute);
    if (!existing || confidence >= existing.confidence) {
      playerReadings.set(attribute, { value, confidence });
    }
    readingsByPlayer.set(playerId, playerReadings);
  };

  for (const reading of result.observations ?? []) {
    addReading(
      reading.playerId,
      reading.attribute,
      reading.trueValue,
      reading.confidence ?? 1,
    );
  }
  for (const reading of result.revealedAttributes ?? []) {
    addReading(reading.playerId, reading.attribute, reading.value, 1);
  }

  const context = resolveObservationContext(session);
  const existing = Object.values(state.observations ?? {});
  const observations: Record<string, Observation> = {};
  for (const [playerId, readings] of readingsByPlayer.entries()) {
    const id = `insight-${result.actionId}-${session.id}-${playerId}`;
    if (state.observations[id]) continue;
    const observation: Observation = {
      id,
      playerId,
      scoutId: state.scout.id,
      sourceSessionId: session.id,
      activityInstanceId: session.activityInstanceId,
      week: state.currentWeek,
      season: state.currentSeason,
      context,
      attributeReadings: [...readings.entries()].map(([attribute, reading]) => {
        const priorCount = existing.filter(
          (candidate) =>
            candidate.playerId === playerId
            && candidate.attributeReadings.some((item) => item.attribute === attribute),
        ).length;
        const resolvedReading = resolveInsightReadingRange(reading.value, reading.confidence);
        return {
          attribute,
          perceivedValue: resolvedReading.perceivedValue,
          confidence: reading.confidence,
          observationCount: priorCount + 1,
          rangeLow: resolvedReading.rangeLow,
          rangeHigh: resolvedReading.rangeHigh,
        };
      }),
      notes: [result.narrative],
      flaggedMoments: [],
      situation: session.situation,
    };
    observations[id] = applyRegionalPresenceToObservation(state, observation);
  }
  return observations;
}

function markYouthDiscovered(
  youthById: Record<string, UnsignedYouth>,
  playerId: string,
  scoutId: string,
): Record<string, UnsignedYouth> {
  let changed = false;
  const updated = { ...youthById };
  for (const [youthId, youth] of Object.entries(youthById)) {
    if (youth.id !== playerId && youth.player.id !== playerId) continue;
    if (youth.discoveredBy.includes(scoutId)) continue;
    updated[youthId] = {
      ...youth,
      discoveredBy: [...youth.discoveredBy, scoutId],
    };
    changed = true;
  }
  return changed ? updated : youthById;
}

function classifyOutcome(result: InsightActionResult): "valuable" | "moderate" | "wasted" {
  const producedEffect = Boolean(
    result.observations?.length
    || result.revealedAttributes?.length
    || result.discoveredPlayerId
    || result.reportQualityBonus
    || result.systemFitData
    || result.contactIntel?.length
    || result.confidenceBonus
    || result.queryAccuracyBonus
    || result.undervaluedPlayers?.length
    || result.wonderkidSignal,
  );
  if (result.success && producedEffect) return "valuable";
  if (producedEffect) return "moderate";
  return "wasted";
}

export interface ApplyInsightActionResultInput {
  state: GameState;
  session: ObservationSession;
  context: InsightActionContext;
  result: InsightActionResult;
  /** State returned by `spendInsight`, before history and deferred effects. */
  insightState: InsightState;
  /** Pending youth simulation state that will later replace the live pool. */
  simulatedUnsignedYouth?: Record<string, UnsignedYouth>;
}

export interface AppliedInsightActionResult {
  state: GameState;
  simulatedUnsignedYouth?: Record<string, UnsignedYouth>;
}

/** Apply every durable payoff through one idempotent state transition. */
export function applyInsightActionResult(
  input: ApplyInsightActionResultInput,
): AppliedInsightActionResult {
  const { context, result, session } = input;
  let insightState = normalizeInsightState(input.insightState);
  const generatedObservations = createInsightObservations(input.state, session, result);
  const observations = Object.keys(generatedObservations).length > 0
    ? { ...input.state.observations, ...generatedObservations }
    : input.state.observations;

  const discoveredPlayerIds = new Set<string>();
  if (result.discoveredPlayerId) discoveredPlayerIds.add(result.discoveredPlayerId);
  for (const playerId of result.undervaluedPlayers ?? []) discoveredPlayerIds.add(playerId);

  let watchlist = input.state.watchlist ?? [];
  let discoveryRecords = input.state.discoveryRecords ?? [];
  let unsignedYouth = input.state.unsignedYouth ?? {};
  let simulatedUnsignedYouth = input.simulatedUnsignedYouth;
  for (const playerId of discoveredPlayerIds) {
    const player = context.players[playerId];
    const canonicalPlayerId = player?.id ?? playerId;
    if (!watchlist.includes(canonicalPlayerId)) {
      watchlist = [...watchlist, canonicalPlayerId];
    }
    if (player && !discoveryRecords.some((record) => record.playerId === canonicalPlayerId)) {
      discoveryRecords = [
        ...discoveryRecords,
        recordDiscovery(
          player,
          input.state.scout,
          input.state.currentWeek,
          input.state.currentSeason,
        ),
      ];
    }
    unsignedYouth = markYouthDiscovered(unsignedYouth, canonicalPlayerId, input.state.scout.id);
    if (simulatedUnsignedYouth) {
      simulatedUnsignedYouth = markYouthDiscovered(
        simulatedUnsignedYouth,
        canonicalPlayerId,
        input.state.scout.id,
      );
    }
  }

  let gutFeelings = input.state.gutFeelings ?? [];
  if (result.wonderkidSignal) {
    const id = `insight-gut-${session.id}-${result.wonderkidSignal.playerId}`;
    if (!gutFeelings.some((feeling) => feeling.id === id)) {
      gutFeelings = [...gutFeelings, {
        id,
        playerId: result.wonderkidSignal.playerId,
        narrative: result.narrative,
        triggerDomain: "mental",
        reliability: result.wonderkidSignal.reliability,
        perceivedTier: result.wonderkidSignal.perceivedTier,
        week: input.state.currentWeek,
        season: input.state.currentSeason,
      }];
    }
  }

  let contactIntel = input.state.contactIntel ?? {};
  for (const intel of result.contactIntel ?? []) {
    const existing = contactIntel[intel.playerId] ?? [];
    const duplicate = existing.some(
      (candidate) =>
        candidate.attribute === intel.attribute
        && candidate.sourceContactId === intel.sourceContactId
        && candidate.recordedWeek === intel.recordedWeek
        && candidate.recordedSeason === intel.recordedSeason,
    );
    if (!duplicate) {
      contactIntel = {
        ...contactIntel,
        [intel.playerId]: [...existing, intel],
      };
    }
  }

  let subRegions = input.state.subRegions ?? {};
  if (result.confidenceBonus && context.subRegionId && subRegions[context.subRegionId]) {
    const subRegion = subRegions[context.subRegionId];
    subRegions = {
      ...subRegions,
      [context.subRegionId]: {
        ...subRegion,
        familiarity: Math.min(
          100,
          subRegion.familiarity + Math.round(result.confidenceBonus * 100),
        ),
      },
    };
  }

  if (result.reportQualityBonus && result.reportQualityBonus > 0) {
    insightState = queueReportQualityEffect(insightState, {
      id: `insight-effect-verdict-${session.id}`,
      actionId: "theVerdict",
      playerId: context.targetPlayerId,
      bonusPoints: result.reportQualityBonus,
      sourceSessionId: session.id,
      createdWeek: input.state.currentWeek,
      createdSeason: input.state.currentSeason,
    });
  }
  if (result.queryAccuracyBonus && result.queryAccuracyBonus > 0) {
    insightState = queueQueryAccuracyEffect(insightState, {
      id: `insight-effect-query-${session.id}`,
      actionId: "algorithmicEpiphany",
      leagueId: result.leagueId ?? context.leagueId,
      accuracyBonus: Math.min(1, result.queryAccuracyBonus),
      sourceSessionId: session.id,
      createdWeek: input.state.currentWeek,
      createdSeason: input.state.currentSeason,
    });
  }

  let systemFitCache = input.state.systemFitCache ?? {};
  if (
    result.actionId === "perfectFit"
    && result.systemFitData
    && input.state.scout.currentClubId
    && context.targetPlayerId
  ) {
    const player = context.players[context.targetPlayerId];
    const club = input.state.clubs[input.state.scout.currentClubId];
    const manager = input.state.managerProfiles[input.state.scout.currentClubId];
    if (player && club && manager) {
      const cacheKey = `${player.id}:${club.id}`;
      systemFitCache = {
        ...systemFitCache,
        [cacheKey]: calculateSystemFit(player, club, manager, context.players),
      };
    }
  }

  let anomalyFlags = input.state.anomalyFlags ?? [];
  for (const playerId of result.undervaluedPlayers ?? []) {
    const id = `insight-market-${session.id}-${playerId}`;
    if (anomalyFlags.some((flag) => flag.id === id)) continue;
    anomalyFlags = [...anomalyFlags, {
      id,
      playerId,
      stat: "marketValue",
      direction: "positive",
      severity: 3,
      description: "Market Blind Spot identified a material gap between price and projected upside.",
      investigated: false,
      week: input.state.currentWeek,
      season: input.state.currentSeason,
    }];
  }

  insightState = normalizeInsightState(recordInsightUse(insightState, {
    actionId: result.actionId,
    week: input.state.currentWeek,
    season: input.state.currentSeason,
    targetPlayerId: result.discoveredPlayerId ?? context.targetPlayerId,
    outcome: classifyOutcome(result),
    narrative: result.narrative,
  }));

  return {
    state: {
      ...input.state,
      observations,
      watchlist,
      discoveryRecords,
      unsignedYouth,
      gutFeelings,
      contactIntel,
      subRegions,
      systemFitCache,
      anomalyFlags,
      scout: {
        ...input.state.scout,
        insightState,
      },
    },
    simulatedUnsignedYouth,
  };
}
