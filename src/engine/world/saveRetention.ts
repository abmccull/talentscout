import type {
  Fixture,
  GameState,
  Player,
  PlayerMovementEvent,
} from "@/engine/core/types";
import { compactPlayerDevelopmentHistory } from "@/engine/world/developmentEnvironment";
import {
  sortPlayerMovementArchiveSummaries,
  summarizePlayerMovement,
} from "@/engine/world/worldHistoryTypes";
import type {
  PlayerMovementArchiveSummary,
  PlayerSeasonHistory,
} from "@/engine/world/worldHistoryTypes";

/**
 * Keep a complete fixture schedule only for the active season. Completed
 * seasons are projected into WorldHistory before this retention boundary runs;
 * individually referenced fixtures are retained separately below.
 */
export const FIXTURE_DETAIL_RETENTION_SEASONS = 1;
/** Global public archive rows per season, plus every scout-causal player. */
export const WORLD_HISTORY_PLAYER_LIMIT = 500;
/** Recent seasons retain the broad comparison field used by expert workflows. */
export const WORLD_HISTORY_DETAILED_PLAYER_SEASONS = 5;
/** Older seasons retain elite public careers plus every scout-causal player. */
export const WORLD_HISTORY_ARCHIVE_PLAYER_LIMIT = 100;
/**
 * Recent raw moves power the detailed dossier and consequence surfaces.
 * Older non-causal movements remain visible through the compact season
 * archive, not as an indefinitely growing world ledger.
 */
export const PLAYER_MOVEMENT_DETAIL_RETENTION_SEASONS = 3;
/**
 * Exact injury incidents are needed for the current season, two-season
 * recommendation reviews, and recent-risk explanations. Lifetime weeks
 * missed and proneness already live on InjuryHistory, so older incident rows
 * are duplicate detail once those consequence windows have closed.
 */
export const PLAYER_INJURY_DETAIL_RETENTION_SEASONS = 3;
/**
 * Unobserved world players need enough recent context for explainable form and
 * development, but not the full dossier timeline reserved for players whose
 * careers the scout has actually touched.
 */
export const BACKGROUND_PLAYER_DEVELOPMENT_HISTORY_LIMIT = 3;
/** Background injury detail supports recent-risk mechanics without becoming a career log. */
export const BACKGROUND_PLAYER_INJURY_HISTORY_LIMIT = 3;

export const SAVE_RETENTION_COLLECTION_KEYS = [
  "players",
  "worldHistory",
  "fixtures",
  "matchRatings",
  "playerMovementHistory",
  "retiredPlayers",
  "retiredPlayerIds",
  "unsignedYouth",
] as const;

export type SaveRetentionCollectionKey =
  (typeof SAVE_RETENTION_COLLECTION_KEYS)[number];

export interface SaveRetentionFootprint {
  totalBytes: number;
  collections: Record<SaveRetentionCollectionKey, number>;
}

export interface SaveRetentionCompactionSample {
  phase: "fixtureRetention" | "archiveCompaction";
  season: number;
  week: number;
  removedBytes: number;
  collectionDeltas: Record<SaveRetentionCollectionKey, number>;
}

type SaveRetentionObserver = (sample: SaveRetentionCompactionSample) => void;

let saveRetentionObserver: SaveRetentionObserver | undefined;
const utf8Encoder = new TextEncoder();

function serializedByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : utf8Encoder.encode(serialized).byteLength;
}

/** Exact UTF-8 attribution used by release-soak diagnostics, never persisted. */
export function measureSaveRetentionFootprint(state: GameState): SaveRetentionFootprint {
  const collections = Object.fromEntries(
    SAVE_RETENTION_COLLECTION_KEYS.map((key) => [
      key,
      serializedByteLength(state[key]),
    ]),
  ) as Record<SaveRetentionCollectionKey, number>;

  return {
    totalBytes: serializedByteLength(state),
    collections,
  };
}

/**
 * Install a process-local diagnostic observer. The observer never changes the
 * save schema or simulation state and is intended for tests/release tooling.
 */
export function observeSaveRetentionCompaction(
  observer: SaveRetentionObserver,
): () => void {
  const previous = saveRetentionObserver;
  saveRetentionObserver = observer;
  return () => {
    if (saveRetentionObserver === observer) saveRetentionObserver = previous;
  };
}

function publishCompactionSample(
  phase: SaveRetentionCompactionSample["phase"],
  beforeState: GameState,
  afterState: GameState,
): void {
  if (!saveRetentionObserver) return;
  const measuredKeys: readonly SaveRetentionCollectionKey[] = phase === "fixtureRetention"
    ? ["fixtures"]
    : SAVE_RETENTION_COLLECTION_KEYS;
  const collectionDeltas = Object.fromEntries(
    SAVE_RETENTION_COLLECTION_KEYS.map((key) => [key, 0]),
  ) as Record<SaveRetentionCollectionKey, number>;
  for (const key of measuredKeys) {
    collectionDeltas[key] = serializedByteLength(beforeState[key])
      - serializedByteLength(afterState[key]);
  }
  saveRetentionObserver({
    phase,
    season: beforeState.currentSeason,
    week: beforeState.currentWeek,
    removedBytes: Math.max(
      0,
      SAVE_RETENTION_COLLECTION_KEYS.reduce(
        (sum, key) => sum + collectionDeltas[key],
        0,
      ),
    ),
    collectionDeltas,
  });
}

/** Routine renewals are current contract state, not permanent narrative events. */
export function isMaterialHistoricalMovement(movement: PlayerMovementEvent): boolean {
  return movement.type !== "contractRenewal";
}

type WorldHistoryState = NonNullable<GameState["worldHistory"]>;
type WorldSeasonHistory = WorldHistoryState["seasons"][number];

function isMaterialMovementSummary(summary: PlayerMovementArchiveSummary): boolean {
  return summary.type !== "contractRenewal";
}

/**
 * Legacy WorldHistory rows only retained ledger IDs. Rebuild the additive
 * compact archive from the raw source while it exists, then preserve already
 * projected summaries across all later saves. The projection includes every
 * material movement for an archived season, even if its player was sampled
 * out of the bounded public comparison rows.
 */
function projectWorldHistoryMovementSummaries(
  history: WorldHistoryState | undefined,
  movements: readonly PlayerMovementEvent[],
): WorldHistoryState | undefined {
  if (!history) return history;

  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));
  const materialMovementsBySeason = new Map<number, PlayerMovementEvent[]>();
  for (const movement of movements) {
    if (!isMaterialHistoricalMovement(movement)) continue;
    const seasonMovements = materialMovementsBySeason.get(movement.season) ?? [];
    seasonMovements.push(movement);
    materialMovementsBySeason.set(movement.season, seasonMovements);
  }

  const migrateSeason = (season: WorldSeasonHistory): WorldSeasonHistory => {
    const summariesById = new Map<string, PlayerMovementArchiveSummary>();
    for (const summary of season.playerMovementSummaries ?? []) {
      if (!summary.id || !summary.playerId || !isMaterialMovementSummary(summary)) continue;
      summariesById.set(summary.id, summary);
    }

    // Backfill a legacy ID-only player row. This is intentionally narrower
    // than the all-movements pass below: its player/season checks stop a
    // malformed ID from being reattached to the wrong archive row.
    for (const player of season.players) {
      for (const movementId of player.movementEventIds) {
        const movement = movementsById.get(movementId);
        if (
          !movement
          || movement.playerId !== player.playerId
          || movement.season !== season.season
          || !isMaterialHistoricalMovement(movement)
        ) {
          continue;
        }
        summariesById.set(movement.id, summarizePlayerMovement(movement));
      }
    }

    // A summary must not depend on a player making the public top-500
    // archive. This pass lets raw movement rows graduate safely regardless of
    // comparison-row selection.
    for (const movement of materialMovementsBySeason.get(season.season) ?? []) {
      summariesById.set(movement.id, summarizePlayerMovement(movement));
    }
    const playerMovementSummaries = sortPlayerMovementArchiveSummaries(
      [...summariesById.values()],
    );
    const projectedMovementIds = new Set(playerMovementSummaries.map((summary) => summary.id));
    const seasonWithoutSummaries: WorldSeasonHistory = { ...season };
    delete seasonWithoutSummaries.playerMovementSummaries;

    return {
      ...seasonWithoutSummaries,
      players: season.players.map((player) => ({
        ...player,
        // Keep the established ID field as a compact compatibility pointer,
        // but never let it retain an unresolved legacy ledger reference.
        movementEventIds: player.movementEventIds.filter((id) => projectedMovementIds.has(id)),
      })),
      ...(playerMovementSummaries.length > 0
        ? { playerMovementSummaries }
        : {}),
    };
  };

  return {
    ...history,
    seasons: history.seasons.map(migrateSeason),
  };
}

function compactPlayerRecord(
  player: Player,
  currentSeason: number,
  preserveFullDossierHistory = false,
): Player {
  const compactedDevelopmentHistory = player.developmentHistory
    ? compactPlayerDevelopmentHistory(player.developmentHistory)
    : undefined;
  const developmentHistory = compactedDevelopmentHistory
    && !preserveFullDossierHistory
    && compactedDevelopmentHistory.length > BACKGROUND_PLAYER_DEVELOPMENT_HISTORY_LIMIT
    ? compactedDevelopmentHistory.slice(-BACKGROUND_PLAYER_DEVELOPMENT_HISTORY_LIMIT)
    : compactedDevelopmentHistory;
  const injuryHistory = player.injuryHistory;
  const injuryCutoff = Math.max(
    1,
    currentSeason - PLAYER_INJURY_DETAIL_RETENTION_SEASONS + 1,
  );
  const injuriesInConsequenceWindow = injuryHistory?.injuries.filter((injury) =>
    injury.occurredSeason >= injuryCutoff || injury.id === player.currentInjury?.id
  );
  const recentBackgroundInjuries = injuriesInConsequenceWindow
    && !preserveFullDossierHistory
    && injuriesInConsequenceWindow.length > BACKGROUND_PLAYER_INJURY_HISTORY_LIMIT
    ? injuriesInConsequenceWindow.slice(-BACKGROUND_PLAYER_INJURY_HISTORY_LIMIT)
    : injuriesInConsequenceWindow;
  const activeInjury = player.currentInjury;
  const retainedInjuries = activeInjury
    && recentBackgroundInjuries
    && !recentBackgroundInjuries.some((injury) => injury.id === activeInjury.id)
    ? [activeInjury, ...recentBackgroundInjuries]
    : recentBackgroundInjuries;
  const compactedInjuryHistory = injuryHistory && retainedInjuries
    ? retainedInjuries.length === injuryHistory.injuries.length
      ? injuryHistory
      : { ...injuryHistory, injuries: retainedInjuries }
    : injuryHistory;

  if (
    developmentHistory === player.developmentHistory
    && compactedInjuryHistory === player.injuryHistory
  ) {
    return player;
  }
  return {
    ...player,
    ...(developmentHistory ? { developmentHistory } : {}),
    ...(compactedInjuryHistory ? { injuryHistory: compactedInjuryHistory } : {}),
  };
}

export function collectCausallyReferencedPlayerIds(state: GameState): Set<string> {
  const ids = new Set<string>([
    ...(state.watchlist ?? []),
    ...Object.keys(state.contactIntel ?? {}),
  ]);
  const add = (id: string | undefined): void => {
    if (id) ids.add(id);
  };
  const addEntityId = (id: string | undefined): void => {
    if (id && (state.players?.[id] || state.retiredPlayers?.[id])) add(id);
  };
  const addEntityRef = (ref: { kind: string; id: string } | undefined): void => {
    if (ref?.kind === "player") add(ref.id);
  };
  const addEffect = (effect: import("@/engine/consequences/types").ConsequenceEffect): void => {
    if (effect.type === "recordFact") addEntityRef(effect.fact.subject);
    if (effect.type === "addMemory") {
      addEntityRef(effect.memory.subject);
      addEntityRef(effect.memory.stakeholder);
    }
    if (effect.type === "createObligation") {
      addEntityRef(effect.obligation.debtor);
      addEntityRef(effect.obligation.creditor);
    }
    if (effect.type === "createOpportunityLock") addEntityRef(effect.lock.owner);
  };

  Object.values(state.reports ?? {}).forEach((record) => add(record.playerId));
  Object.values(state.observations ?? {}).forEach((record) => add(record.playerId));
  Object.values(state.scoutingCases ?? {}).forEach((record) => add(record.playerId));
  Object.values(state.recommendationReviews ?? {}).forEach((record) => add(record.playerId));
  Object.values(state.npcReports ?? {}).forEach((record) => add(record.playerId));
  (state.discoveryRecords ?? []).forEach((record) => add(record.playerId));
  (state.transferRecords ?? []).forEach((record) => add(record.playerId));
  (state.alumniRecords ?? []).forEach((record) => add(record.playerId));
  (state.gutFeelings ?? []).forEach((record) => add(record.playerId));
  Object.values(state.reflectionJournal ?? {}).forEach((entry) => {
    entry.playerIds.forEach(add);
    entry.hypotheses.forEach((record) => add(record.playerId));
    entry.flaggedMoments?.forEach((record) => add(record.playerId));
  });
  Object.values(state.youthRecruitmentBriefs ?? {}).forEach((brief) => add(brief.fulfilledByPlayerId));
  Object.values(state.placementReports ?? {}).forEach((report) => {
    add(resolvePlacementPlayerId(state, report));
  });
  state.seasonAwardsData?.leagueAwards.forEach((award) => add(award.relatedPlayerId));
  (state.predictions ?? []).forEach((record) => add(record.playerId));
  Object.values(state.statisticalProfiles ?? {}).forEach((record) => add(record.playerId));
  (state.anomalyFlags ?? []).forEach((record) => add(record.playerId));
  Object.values(state.analystReports ?? {}).forEach((record) => {
    record.highlightedPlayerIds.forEach(add);
    record.anomalies.forEach((anomaly) => add(anomaly.playerId));
  });
  (state.activeNegotiations ?? []).forEach((record) => add(record.playerId));
  (state.freeAgentNegotiations ?? []).forEach((record) => add(record.freeAgentId));
  (state.activeLoans ?? [])
    .filter((record) => record.scoutId !== undefined)
    .forEach((record) => add(record.playerId));
  (state.loanHistory ?? [])
    .filter((record) => record.scoutId !== undefined)
    .forEach((record) => add(record.playerId));
  (state.loanRecommendations ?? []).forEach((record) => add(record.playerId));
  Object.values(state.contacts ?? {}).forEach((contact) => contact.knownPlayerIds.forEach(add));
  Object.values(state.contacts ?? {}).forEach((contact) => {
    contact.gossipQueue?.forEach((item) => add(item.playerId));
  });
  Object.values(state.rivalScouts ?? {}).forEach((rival) => {
    rival.targetPlayerIds.forEach(add);
    rival.competingForPlayers.forEach(add);
    add(rival.currentTarget);
  });
  (state.rivalActivities ?? []).forEach((activity) => add(activity.playerId));
  (state.narrativeEvents ?? []).forEach((event) => event.relatedIds.forEach(addEntityId));
  // Inbox news is a transient navigation surface, not permanent authorship.
  // Preserve a player solely for a still-actionable recent message; durable
  // scout work is already represented by reports, cases, decisions, loans,
  // contacts, and consequence memory above.
  (state.inbox ?? [])
    .filter((message) =>
      message.actionRequired
      && !message.read
      && message.season >= Math.max(1, state.currentSeason - 1)
    )
    .forEach((message) => addEntityId(message.relatedId));
  (state.eventChains ?? []).forEach((chain) => addEntityId(chain.context.playerId));
  (state.activeStorylines ?? []).forEach((storyline) => {
    const playerId = storyline.context.playerId;
    if (typeof playerId === "string") addEntityId(playerId);
  });

  const consequences = state.consequenceState;
  Object.values(consequences?.decisions ?? {}).forEach((decision) => {
    addEntityRef(decision.source);
    decision.stakeholders.forEach(addEntityRef);
    decision.expiryEffects?.forEach(addEffect);
    decision.options.forEach((option) => {
      option.immediateEffects.forEach(addEffect);
      option.scheduledConsequences.forEach((scheduled) => scheduled.effects.forEach(addEffect));
    });
  });
  Object.values(consequences?.consequences ?? {}).forEach((record) => record.effects.forEach(addEffect));
  Object.values(consequences?.facts ?? {}).forEach((fact) => addEntityRef(fact.subject));
  Object.values(consequences?.memories ?? {}).forEach((memory) => {
    addEntityRef(memory.subject);
    addEntityRef(memory.stakeholder);
  });
  Object.values(consequences?.obligations ?? {}).forEach((obligation) => {
    addEntityRef(obligation.debtor);
    addEntityRef(obligation.creditor);
  });
  Object.values(consequences?.opportunityLocks ?? {}).forEach((lock) => addEntityRef(lock.owner));
  (consequences?.history ?? []).forEach((record) => addEntityRef(record.source));
  state.activeObservationSession?.players.forEach((player) => add(player.playerId));

  return ids;
}

export function collectReferencedUnsignedYouthIds(
  state: GameState,
  causalPlayerIds: ReadonlySet<string> = collectCausallyReferencedPlayerIds(state),
): Set<string> {
  const ids = new Set<string>();
  const youthIdByPlayerId = new Map(
    Object.entries(state.unsignedYouth ?? {}).map(([youthId, youth]) => [youth.player.id, youthId]),
  );
  const addEntityId = (id: string | undefined): void => {
    if (!id) return;
    if (state.unsignedYouth?.[id]) ids.add(id);
    const youthId = youthIdByPlayerId.get(id);
    if (youthId) ids.add(youthId);
  };

  for (const playerId of causalPlayerIds) addEntityId(playerId);
  Object.values(state.placementReports ?? {}).forEach((report) => ids.add(report.unsignedYouthId));
  for (const activity of state.schedule?.activities ?? []) addEntityId(activity?.targetId);
  (state.narrativeEvents ?? []).forEach((event) => event.relatedIds.forEach(addEntityId));
  (state.inbox ?? [])
    .filter((message) =>
      message.actionRequired
      && !message.read
      && message.season >= Math.max(1, state.currentSeason - 1)
    )
    .forEach((message) => addEntityId(message.relatedId));

  const addEntityRef = (ref: { kind: string; id: string } | undefined): void => {
    if (ref?.kind === "unsignedYouth") addEntityId(ref.id);
  };
  const consequences = state.consequenceState;
  Object.values(consequences?.facts ?? {}).forEach((fact) => addEntityRef(fact.subject));
  Object.values(consequences?.memories ?? {}).forEach((memory) => {
    addEntityRef(memory.subject);
    addEntityRef(memory.stakeholder);
  });
  Object.values(consequences?.obligations ?? {}).forEach((obligation) => {
    addEntityRef(obligation.debtor);
    addEntityRef(obligation.creditor);
  });
  Object.values(consequences?.opportunityLocks ?? {}).forEach((lock) => addEntityRef(lock.owner));

  return ids;
}

function publicHistoryScore(player: PlayerSeasonHistory): number {
  const performance = player.performance;
  return (
    (performance?.averageRating ?? 0) * 10_000
    + (performance?.appearances ?? 0) * 100
    + (performance?.goals ?? 0) * 50
    + (performance?.assists ?? 0) * 30
    + player.movementEventIds.length * 5_000
    + (player.status === "retired" || player.status === "exitedFootball" ? 2_500 : 0)
    + Math.min(2_000, Math.floor(player.marketValue / 100_000))
  );
}

function stableHistoryPreferenceKey(player: PlayerSeasonHistory): string {
  const performance = player.performance;
  return JSON.stringify([
    player.firstName ?? "",
    player.lastName ?? "",
    player.nationality ?? "",
    player.age,
    player.position,
    player.currentAbility,
    player.marketValue,
    player.registeredClubId ?? "",
    player.contractClubId ?? "",
    player.loanParentClubId ?? "",
    player.status,
    performance?.appearances ?? -1,
    performance?.starts ?? -1,
    performance?.minutesPlayed ?? -1,
    performance?.appearancesWithoutMinutes ?? -1,
    performance?.averageRating ?? -1,
    performance?.goals ?? -1,
    performance?.assists ?? -1,
    performance?.cleanSheets ?? -1,
  ]);
}

export function selectWorldHistoryPlayers(
  players: readonly PlayerSeasonHistory[],
  causalPlayerIds: ReadonlySet<string>,
  publicPlayerLimit = WORLD_HISTORY_PLAYER_LIMIT,
): PlayerSeasonHistory[] {
  // Malformed or legacy saves may contain the same player twice. Coalesce
  // those rows without adding performance totals (which would double-count a season).
  const uniqueByPlayerId = new Map<string, PlayerSeasonHistory>();
  for (const player of players) {
    const prior = uniqueByPlayerId.get(player.playerId);
    if (!prior) {
      uniqueByPlayerId.set(player.playerId, {
        ...player,
        movementEventIds: [...new Set(player.movementEventIds)],
      });
      continue;
    }
    const playerScore = publicHistoryScore(player);
    const priorScore = publicHistoryScore(prior);
    const preferred = playerScore > priorScore
      || (
        playerScore === priorScore
        && stableHistoryPreferenceKey(player).localeCompare(stableHistoryPreferenceKey(prior)) > 0
      )
        ? player
        : prior;
    const fallback = preferred === player ? prior : player;
    uniqueByPlayerId.set(player.playerId, {
      ...preferred,
      firstName: preferred.firstName ?? fallback.firstName,
      lastName: preferred.lastName ?? fallback.lastName,
      nationality: preferred.nationality ?? fallback.nationality,
      movementEventIds: [...new Set([
        ...prior.movementEventIds,
        ...player.movementEventIds,
      ])].sort(),
    });
  }
  const uniquePlayers = [...uniqueByPlayerId.values()];
  const causal = uniquePlayers
    .filter((player) => causalPlayerIds.has(player.playerId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  const publicPlayers = uniquePlayers
    .filter((player) => !causalPlayerIds.has(player.playerId))
    .sort(
      (a, b) =>
        publicHistoryScore(b) - publicHistoryScore(a)
        || a.playerId.localeCompare(b.playerId),
    )
    .slice(0, Math.max(0, publicPlayerLimit - causal.length));

  return [...causal, ...publicPlayers].sort((a, b) => a.playerId.localeCompare(b.playerId));
}

/**
 * Fixture details are simulation working data, not the historical record.
 * WorldHistory owns completed-season aggregates; this collector preserves the
 * smaller set of old fixtures still addressable from durable gameplay facts.
 */
export function collectReferencedFixtureIds(state: GameState): Set<string> {
  const ids = new Set<string>(state.playedFixtures ?? []);

  for (const observation of Object.values(state.observations ?? {})) {
    if (observation.matchId) ids.add(observation.matchId);
  }
  // Player recentMatchRatings are bounded, self-contained form samples
  // (season, week, rating). Their fixtureId remains a stable event key, but no
  // consumer dereferences it, so it must not pin a completed fixture schedule.
  for (const rival of Object.values(state.rivalScouts ?? {})) {
    if (rival.lastSeenAtFixture) ids.add(rival.lastSeenAtFixture);
  }
  for (const activity of state.rivalActivities ?? []) {
    if (activity.fixtureId) ids.add(activity.fixtureId);
  }
  for (const record of Object.values(state.disciplinaryRecords ?? {})) {
    for (const card of record.cardHistory ?? []) ids.add(card.fixtureId);
  }
  for (const activity of state.schedule?.activities ?? []) {
    if (activity?.targetId && state.fixtures?.[activity.targetId]) ids.add(activity.targetId);
  }

  return ids;
}

/**
 * Resolve a placement's durable player identity after its unsigned-youth
 * opportunity has left the active pool. New saves use report/case/alumni IDs;
 * the unsigned-youth ID fallback supports older saves where both IDs matched.
 */
export function resolvePlacementPlayerId(
  state: GameState,
  placement: GameState["placementReports"][string],
): string | undefined {
  const candidates = [
    state.unsignedYouth?.[placement.unsignedYouthId]?.player.id,
    placement.reportId ? state.reports?.[placement.reportId]?.playerId : undefined,
    placement.caseId ? state.scoutingCases?.[placement.caseId]?.playerId : undefined,
    (state.alumniRecords ?? []).find(
      (record) => record.placementReportId === placement.id,
    )?.playerId,
    placement.unsignedYouthId,
  ].filter((playerId): playerId is string => Boolean(playerId));

  return candidates.find((playerId) =>
    Boolean(state.players?.[playerId] || state.retiredPlayers?.[playerId]),
  ) ?? candidates[0];
}

/**
 * Validate every reference whose target this compactor is allowed to remove.
 * This deliberately does not attempt to validate unrelated game-state graphs.
 */
export function findSaveRetentionReferenceViolations(state: GameState): string[] {
  const failures: string[] = [];
  const fixtureIds = new Set(Object.keys(state.fixtures ?? {}));
  const movementsById = new Map(
    (state.playerMovementHistory ?? []).map((movement) => [movement.id, movement]),
  );
  const requireFixture = (fixtureId: string | undefined, source: string): void => {
    if (fixtureId && !fixtureIds.has(fixtureId)) {
      failures.push(`${source}:missing-fixture:${fixtureId}`);
    }
  };

  (state.playedFixtures ?? []).forEach((fixtureId, index) =>
    requireFixture(fixtureId, `playedFixtures[${index}]`));
  Object.values(state.observations ?? {}).forEach((observation) =>
    requireFixture(observation.matchId, `observation:${observation.id}`));
  Object.values(state.rivalScouts ?? {}).forEach((rival) =>
    requireFixture(rival.lastSeenAtFixture, `rival:${rival.id}`));
  (state.rivalActivities ?? []).forEach((activity, index) =>
    requireFixture(activity.fixtureId, `rivalActivity:${index}`));
  Object.entries(state.disciplinaryRecords ?? {}).forEach(([playerId, record]) =>
    record.cardHistory?.forEach((card, index) =>
      requireFixture(card.fixtureId, `discipline:${playerId}:card[${index}]`)));
  (state.schedule?.activities ?? []).forEach((activity, index) => {
    if (activity?.type === "attendMatch") {
      requireFixture(activity.targetId, `schedule:${index}`);
    }
  });

  for (const season of state.worldHistory?.seasons ?? []) {
    const summaryById = new Map<string, PlayerMovementArchiveSummary>();
    for (const summary of season.playerMovementSummaries ?? []) {
      if (summaryById.has(summary.id)) {
        failures.push(
          `worldHistory:${season.season}:duplicate-movement-summary:${summary.id}`,
        );
        continue;
      }
      if (!summary.id || !summary.playerId || !isMaterialMovementSummary(summary)) {
        failures.push(
          `worldHistory:${season.season}:invalid-movement-summary:${summary.id || "unknown"}`,
        );
        continue;
      }
      summaryById.set(summary.id, summary);
    }
    const seenPlayers = new Set<string>();
    for (const player of season.players) {
      if (seenPlayers.has(player.playerId)) {
        failures.push(`worldHistory:${season.season}:duplicate-player:${player.playerId}`);
      }
      seenPlayers.add(player.playerId);
      for (const movementId of player.movementEventIds) {
        const rawMovement = movementsById.get(movementId);
        const archivedSummary = summaryById.get(movementId);
        if (
          !rawMovement
          && !archivedSummary
        ) {
          failures.push(
            `worldHistory:${season.season}:player:${player.playerId}:missing-movement:${movementId}`,
          );
          continue;
        }
        if (
          rawMovement
          && (
            rawMovement.playerId !== player.playerId
            || rawMovement.season !== season.season
            || !isMaterialHistoricalMovement(rawMovement)
          )
        ) {
          failures.push(
            `worldHistory:${season.season}:player:${player.playerId}:invalid-raw-movement:${movementId}`,
          );
        }
        if (archivedSummary && archivedSummary.playerId !== player.playerId) {
          failures.push(
            `worldHistory:${season.season}:player:${player.playerId}:invalid-archived-movement:${movementId}`,
          );
        }
      }
    }
  }
  for (const playerId of state.retiredPlayerIds ?? []) {
    if (!state.retiredPlayers?.[playerId]) {
      failures.push(`retiredPlayerIds:missing-player:${playerId}`);
    }
  }
  for (const placement of Object.values(state.placementReports ?? {})) {
    if (state.unsignedYouth?.[placement.unsignedYouthId]) continue;
    const playerId = resolvePlacementPlayerId(state, placement);
    if (!playerId || (!state.players?.[playerId] && !state.retiredPlayers?.[playerId])) {
      failures.push(
        `placement:${placement.id}:unresolvable-player:${playerId ?? placement.unsignedYouthId}`,
      );
    }
  }

  return failures.sort();
}

export function retainRequiredFixtureHistory(
  state: GameState,
  activeSeason = state.currentSeason,
  publishTelemetry = true,
): Record<string, Fixture> {
  const normalizedActiveSeason = Number.isFinite(activeSeason) ? activeSeason : 1;
  const earliestDetailedSeason = Math.max(
    1,
    normalizedActiveSeason - FIXTURE_DETAIL_RETENTION_SEASONS + 1,
  );
  const referenced = collectReferencedFixtureIds(state);

  const retained = Object.fromEntries(
    Object.entries(state.fixtures ?? {}).filter(([fixtureId, fixture]) => {
      const fixtureSeason = fixture.season ?? normalizedActiveSeason;
      return fixtureSeason >= earliestDetailedSeason || referenced.has(fixtureId);
    }),
  );
  if (publishTelemetry && saveRetentionObserver) {
    publishCompactionSample(
      "fixtureRetention",
      state,
      { ...state, fixtures: retained },
    );
  }
  return retained;
}

/**
 * Keep per-fixture ratings in lockstep with the retained fixture ledger.
 *
 * Completed-season performance is projected into player season ratings and
 * WorldHistory before this runs. Retaining ratings for discarded fixtures
 * would create an orphaned, ever-growing second history that every later
 * season rollover has to rescan.
 */
export function retainMatchRatingsForFixtures(
  fixtures: Record<string, Fixture>,
  matchRatings: GameState["matchRatings"] | undefined,
): GameState["matchRatings"] {
  const retainedIds = new Set(Object.keys(fixtures ?? {}));
  return Object.fromEntries(
    Object.entries(matchRatings ?? {}).filter(([fixtureId]) => retainedIds.has(fixtureId)),
  );
}

/** Mutating adapter for one-time backward-save migration. */
export function migrateHistoricalFixtureRetention(state: GameState): void {
  state.fixtures = retainRequiredFixtureHistory(state, state.currentSeason, false);
  state.matchRatings = retainMatchRatingsForFixtures(state.fixtures, state.matchRatings);
}

/**
 * Bound ledgers whose durable meaning has already been projected into the
 * 30-season WorldHistory archive. Material transfers, loans, releases,
 * signings, retirements, and exits remain intact for the archive window;
 * routine renewals retain only the active and previous season.
 */
export function compactLongCareerHistory(state: GameState): GameState {
  const publishTelemetry = saveRetentionObserver !== undefined;
  const renewalDetailCutoff = Math.max(1, state.currentSeason - 1);
  const movementDetailCutoff = Math.max(
    1,
    state.currentSeason - PLAYER_MOVEMENT_DETAIL_RETENTION_SEASONS + 1,
  );
  const causalPlayerIds = collectCausallyReferencedPlayerIds(state);
  const referencedYouthIds = collectReferencedUnsignedYouthIds(state, causalPlayerIds);
  const unsignedYouth = Object.fromEntries(
    Object.entries(state.unsignedYouth ?? {})
      .filter(([youthId, youth]) => {
        if (!youth.placed && !youth.retired) return true;
        // Once an authoritative Player identity exists, reports and alumni
        // resolve through that record and the duplicate opportunity must go.
        if (state.players?.[youth.player.id] || state.retiredPlayers?.[youth.player.id]) {
          return false;
        }
        // Drop untracked terminal prospects immediately. A malformed legacy
        // save with a causal reference but no durable Player is retained so a
        // later migration cannot silently erase the only remaining identity.
        return referencedYouthIds.has(youthId) || causalPlayerIds.has(youth.player.id);
      })
      .map(([youthId, youth]) => [
        youthId,
        youth.player.developmentHistory
          ? {
              ...youth,
              player: compactPlayerRecord(
                youth.player,
                state.currentSeason,
                causalPlayerIds.has(youth.player.id),
              ),
            }
          : youth,
      ]),
  );
  const players = Object.fromEntries(
    Object.entries(state.players ?? {}).map(([playerId, player]) => [
      playerId,
      compactPlayerRecord(
        player,
        state.currentSeason,
        causalPlayerIds.has(playerId),
      ),
    ]),
  );
  const retainedYouthPlayerIds = new Set(
    Object.values(unsignedYouth).map((youth) => youth.player.id),
  );
  // A removed terminal unsigned-youth opportunity has neither a live player
  // dossier nor a durable causal record. Its movement row must not survive
  // solely because an older save had not yet written a season archive.
  const discardedYouthPlayerIds = new Set(
    Object.entries(state.unsignedYouth ?? {})
      .filter(([youthId]) => !unsignedYouth[youthId])
      .map(([, youth]) => youth.player.id),
  );
  let worldHistory = projectWorldHistoryMovementSummaries(
    state.worldHistory,
    state.playerMovementHistory ?? [],
  );
  // Record projection coverage before tiering the public archive. This lets a
  // closed, non-causal background move age out of both the raw ledger and the
  // old public summary without weakening the legacy-save safety rule below.
  const projectedArchivedMovementIds = new Set(
    worldHistory?.seasons.flatMap((season) =>
      season.playerMovementSummaries?.map((summary) => summary.id) ?? [],
    ) ?? [],
  );
  worldHistory = worldHistory
    ? {
        ...worldHistory,
        seasons: worldHistory.seasons.map((season) => ({
          ...season,
          players: season.players
            .map((player) => {
              const identity = players[player.playerId] ?? state.retiredPlayers[player.playerId];
              return {
                ...player,
                ...(identity
                  ? {
                      firstName: player.firstName ?? identity.firstName,
                      lastName: player.lastName ?? identity.lastName,
                      nationality: player.nationality ?? identity.nationality,
                    }
                  : {}),
              };
            })
            .filter((player) =>
              player.performance !== undefined
              || player.movementEventIds.length > 0
              || player.status === "retired"
              || player.status === "exitedFootball"
              || causalPlayerIds.has(player.playerId),
            ),
        })),
      }
    : state.worldHistory;
  if (worldHistory) {
    worldHistory = {
      ...worldHistory,
      seasons: worldHistory.seasons.map((season) => {
        const keepsFullMovementDetail =
          season.season >= state.currentSeason - WORLD_HISTORY_DETAILED_PLAYER_SEASONS;
        const players = selectWorldHistoryPlayers(
          season.players,
          causalPlayerIds,
          keepsFullMovementDetail
            ? WORLD_HISTORY_PLAYER_LIMIT
            : WORLD_HISTORY_ARCHIVE_PLAYER_LIMIT,
        );
        const retainedPlayerIds = new Set(players.map((player) => player.playerId));
        const playerMovementSummaries = season.playerMovementSummaries?.filter(
          (summary) =>
            keepsFullMovementDetail
            || retainedPlayerIds.has(summary.playerId)
            || causalPlayerIds.has(summary.playerId),
        );
        return {
          ...season,
          players,
          ...(playerMovementSummaries && playerMovementSummaries.length > 0
            ? { playerMovementSummaries }
            : { playerMovementSummaries: undefined }),
        };
      }),
    };
  }
  const playerMovementHistory = (state.playerMovementHistory ?? []).filter(
    (movement) => {
      // Renewals do not enter the permanent archive. Their active-contract
      // meaning remains useful only for the current and immediately previous
      // season, matching the previous retention contract.
      if (!isMaterialHistoricalMovement(movement)) {
        return movement.season >= renewalDetailCutoff;
      }

      // A scout-authored relationship, active youth opportunity, or recent
      // dossier still needs the exact raw event (including reason/loan data).
      if (
        causalPlayerIds.has(movement.playerId)
        || retainedYouthPlayerIds.has(movement.playerId)
        || movement.season >= movementDetailCutoff
      ) {
        return true;
      }

      if (discardedYouthPlayerIds.has(movement.playerId)) return false;

      // Never release a raw row until an immutable archive summary exists.
      // This makes a partial/legacy WorldHistory safe: unresolved movement
      // rows retain their source rather than becoming dangling pointers.
      return !projectedArchivedMovementIds.has(movement.id);
    },
  );

  const retainedRetiredPlayerIds = new Set(causalPlayerIds);
  for (const movement of state.playerMovementHistory ?? []) {
    if (
      (movement.type === "retirement" || movement.type === "footballExit")
      && movement.season >= renewalDetailCutoff
    ) {
      retainedRetiredPlayerIds.add(movement.playerId);
    }
  }
  const retiredPlayers = Object.fromEntries(
    Object.entries(state.retiredPlayers ?? {})
      .filter(([playerId]) => retainedRetiredPlayerIds.has(playerId))
      .map(([playerId, player]) => [
        playerId,
        compactPlayerRecord(
          player,
          state.currentSeason,
          causalPlayerIds.has(playerId),
        ),
      ]),
  );
  const retiredPlayerIds = (state.retiredPlayerIds ?? []).filter((playerId) =>
    retiredPlayers[playerId] !== undefined,
  );

  const compacted: GameState = {
    ...state,
    players,
    playerMovementHistory,
    worldHistory,
    retiredPlayers,
    retiredPlayerIds,
    unsignedYouth,
  };
  migrateHistoricalFixtureRetention(compacted);
  if (publishTelemetry && saveRetentionObserver) {
    publishCompactionSample(
      "archiveCompaction",
      state,
      compacted,
    );
  }
  return compacted;
}
