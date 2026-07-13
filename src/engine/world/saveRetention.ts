import type {
  Fixture,
  GameState,
  PlayerMovementEvent,
} from "@/engine/core/types";
import type { PlayerSeasonHistory } from "@/engine/world/worldHistory";

/** Keep detailed schedules for the active season and the one immediately prior. */
export const FIXTURE_DETAIL_RETENTION_SEASONS = 2;
/** Global public archive rows per season, plus every scout-causal player. */
export const WORLD_HISTORY_PLAYER_LIMIT = 500;

/** Routine renewals are current contract state, not permanent narrative events. */
export function isMaterialHistoricalMovement(movement: PlayerMovementEvent): boolean {
  return movement.type !== "contractRenewal";
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
    add(state.unsignedYouth?.[report.unsignedYouthId]?.player.id);
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
  (state.activeLoans ?? []).forEach((record) => add(record.playerId));
  (state.loanHistory ?? []).forEach((record) => add(record.playerId));
  (state.loanRecommendations ?? []).forEach((record) => add(record.playerId));
  Object.values(state.contacts ?? {}).forEach((contact) => contact.knownPlayerIds.forEach(add));
  Object.values(state.contacts ?? {}).forEach((contact) => {
    contact.gossipQueue?.forEach((item) => add(item.playerId));
  });
  (state.gossipItems ?? []).forEach((item) => add(item.subjectPlayerId));
  Object.values(state.rivalScouts ?? {}).forEach((rival) => {
    rival.targetPlayerIds.forEach(add);
    rival.competingForPlayers.forEach(add);
    add(rival.currentTarget);
  });
  (state.rivalActivities ?? []).forEach((activity) => add(activity.playerId));
  (state.narrativeEvents ?? []).forEach((event) => event.relatedIds.forEach(addEntityId));
  (state.inbox ?? []).forEach((message) => addEntityId(message.relatedId));
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
  (state.inbox ?? []).forEach((message) => addEntityId(message.relatedId));

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

export function selectWorldHistoryPlayers(
  players: readonly PlayerSeasonHistory[],
  causalPlayerIds: ReadonlySet<string>,
): PlayerSeasonHistory[] {
  const causal = players
    .filter((player) => causalPlayerIds.has(player.playerId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  const publicPlayers = players
    .filter((player) => !causalPlayerIds.has(player.playerId))
    .sort(
      (a, b) =>
        publicHistoryScore(b) - publicHistoryScore(a)
        || a.playerId.localeCompare(b.playerId),
    )
    .slice(0, Math.max(0, WORLD_HISTORY_PLAYER_LIMIT - causal.length));

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
  for (const player of [
    ...Object.values(state.players ?? {}),
  ]) {
    for (const rating of player.recentMatchRatings ?? []) ids.add(rating.fixtureId);
  }
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

export function retainRequiredFixtureHistory(
  state: GameState,
  activeSeason = state.currentSeason,
): Record<string, Fixture> {
  const normalizedActiveSeason = Number.isFinite(activeSeason) ? activeSeason : 1;
  const earliestDetailedSeason = Math.max(
    1,
    normalizedActiveSeason - FIXTURE_DETAIL_RETENTION_SEASONS + 1,
  );
  const referenced = collectReferencedFixtureIds(state);

  return Object.fromEntries(
    Object.entries(state.fixtures ?? {}).filter(([fixtureId, fixture]) => {
      const fixtureSeason = fixture.season ?? normalizedActiveSeason;
      return fixtureSeason >= earliestDetailedSeason || referenced.has(fixtureId);
    }),
  );
}

/** Mutating adapter for one-time backward-save migration. */
export function migrateHistoricalFixtureRetention(state: GameState): void {
  state.fixtures = retainRequiredFixtureHistory(state);

  const retainedIds = new Set(Object.keys(state.fixtures));
  state.matchRatings = Object.fromEntries(
    Object.entries(state.matchRatings ?? {}).filter(([fixtureId]) => retainedIds.has(fixtureId)),
  );
}

/**
 * Bound ledgers whose durable meaning has already been projected into the
 * 30-season WorldHistory archive. Material transfers, loans, releases,
 * signings, retirements, and exits remain intact for the archive window;
 * routine renewals retain only the active and previous season.
 */
export function compactLongCareerHistory(state: GameState): GameState {
  const earliestArchivedSeason = state.worldHistory?.seasons[0]?.season
    ?? Math.max(1, state.currentSeason - 1);
  const renewalDetailCutoff = Math.max(1, state.currentSeason - 1);
  const causalPlayerIds = collectCausallyReferencedPlayerIds(state);
  const referencedYouthIds = collectReferencedUnsignedYouthIds(state, causalPlayerIds);
  const signingSeasonByPlayerId = new Map<string, number>();
  for (const movement of state.playerMovementHistory ?? []) {
    if (movement.type !== "youthSigning") continue;
    signingSeasonByPlayerId.set(
      movement.playerId,
      Math.max(signingSeasonByPlayerId.get(movement.playerId) ?? 0, movement.season),
    );
  }
  const youthHistoryCutoff = Math.max(1, state.currentSeason - 5);
  const unsignedYouth = Object.fromEntries(
    Object.entries(state.unsignedYouth ?? {}).filter(([youthId, youth]) => {
      if (!youth.placed && !youth.retired) return true;
      if (referencedYouthIds.has(youthId) || causalPlayerIds.has(youth.player.id)) return true;
      const signingSeason = signingSeasonByPlayerId.get(youth.player.id) ?? 0;
      return (
        signingSeason >= renewalDetailCutoff
        || youth.generatedSeason >= youthHistoryCutoff
      );
    }),
  );
  const retainedYouthPlayerIds = new Set(
    Object.values(unsignedYouth).map((youth) => youth.player.id),
  );
  const materialMovementIds = new Set(
    (state.playerMovementHistory ?? [])
      .filter(isMaterialHistoricalMovement)
      .map((movement) => movement.id),
  );
  let worldHistory = state.worldHistory
    ? {
        ...state.worldHistory,
        seasons: state.worldHistory.seasons.map((season) => ({
          ...season,
          players: season.players
            .map((player) => {
              const identity = state.players[player.playerId] ?? state.retiredPlayers[player.playerId];
              return {
                ...player,
                ...(identity
                  ? {
                      firstName: player.firstName ?? identity.firstName,
                      lastName: player.lastName ?? identity.lastName,
                      nationality: player.nationality ?? identity.nationality,
                    }
                  : {}),
                movementEventIds: player.movementEventIds.filter((id) => materialMovementIds.has(id)),
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
      seasons: worldHistory.seasons.map((season) => ({
        ...season,
        players: selectWorldHistoryPlayers(season.players, causalPlayerIds),
      })),
    };
  }
  const archivedMovementIds = new Set(
    worldHistory?.seasons.flatMap((season) =>
      season.players.flatMap((player) => player.movementEventIds),
    ) ?? [],
  );
  const playerMovementHistory = (state.playerMovementHistory ?? []).filter(
    (movement) =>
      (
        movement.season >= earliestArchivedSeason
        && (
          movement.season >= renewalDetailCutoff
          || archivedMovementIds.has(movement.id)
        )
      )
      || (
        causalPlayerIds.has(movement.playerId)
        && isMaterialHistoricalMovement(movement)
      )
      || (
        retainedYouthPlayerIds.has(movement.playerId)
        && isMaterialHistoricalMovement(movement)
      ),
  );
  const retainedMovementIds = new Set(playerMovementHistory.map((movement) => movement.id));
  if (worldHistory) {
    worldHistory = {
      ...worldHistory,
      seasons: worldHistory.seasons.map((season) => ({
        ...season,
        players: season.players.map((player) => ({
          ...player,
          movementEventIds: player.movementEventIds.filter((id) => retainedMovementIds.has(id)),
        })),
      })),
    };
  }

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
    Object.entries(state.retiredPlayers ?? {}).filter(([playerId]) =>
      retainedRetiredPlayerIds.has(playerId),
    ),
  );
  const retiredPlayerIds = (state.retiredPlayerIds ?? []).filter((playerId) =>
    retiredPlayers[playerId] !== undefined,
  );

  const compacted: GameState = {
    ...state,
    playerMovementHistory,
    worldHistory,
    retiredPlayers,
    retiredPlayerIds,
    unsignedYouth,
  };
  migrateHistoricalFixtureRetention(compacted);
  return compacted;
}
