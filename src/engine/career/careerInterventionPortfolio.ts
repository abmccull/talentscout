import type { GameState, Player } from "@/engine/core/types";
import type { GameDate, JsonValue } from "@/engine/consequences";
import {
  createGameCalendarIndex,
  gameWeeksBetweenWithCalendar,
} from "@/engine/core/gameDate";
import {
  createDevelopmentEnvironmentIndex,
  projectCurrentPlayerCareerEnvironment,
  type DevelopmentEnvironmentIndex,
} from "@/engine/world/developmentEnvironment";

export type CareerInterventionOutcome =
  | "monitoring"
  | "improved"
  | "unchanged"
  | "worsened";

export interface CareerInterventionEvidence {
  decisionId: string;
  playerId: string;
  playerName: string;
  optionId: string;
  optionLabel: string;
  selectedAt: GameDate;
  originalEnvironmentScore: number;
  currentEnvironmentScore: number;
  currentEnvironmentHeadline: string;
  currentEnvironmentSummary: string;
  scoreDelta: number;
  outcome: CareerInterventionOutcome;
  callbackObserved: boolean;
  evidenceIds: string[];
}

export interface CareerInterventionPortfolio {
  interventions: CareerInterventionEvidence[];
  monitoring: number;
  improved: number;
  unchanged: number;
  worsened: number;
  summary: string;
}

type PlayerMovementRecord = NonNullable<GameState["playerMovementHistory"]>[number];
type CareerInterventionPlayerFilter = string | ReadonlySet<string>;
export type CareerInterventionEnvironmentStrategy = "adaptive" | "direct" | "indexed";

const CAREER_INTERVENTION_DIRECT_ENVIRONMENT_PLAYER_LIMIT = 3;

interface CareerInterventionIndexes {
  callbackObservedByDecision: ReadonlySet<string>;
  factIdsByDecision: ReadonlyMap<string, readonly string[]>;
  movementsByPlayer: ReadonlyMap<string, readonly PlayerMovementRecord[]>;
}

function normalizeCareerInterventionPlayerFilter(
  filter: CareerInterventionPlayerFilter | undefined,
): ReadonlySet<string> | undefined {
  if (filter === undefined) return undefined;
  return typeof filter === "string" ? new Set([filter]) : filter;
}

export function determineCareerInterventionEnvironmentStrategy(
  playerFilter: CareerInterventionPlayerFilter | undefined,
  strategy: CareerInterventionEnvironmentStrategy = "adaptive",
): "direct" | "indexed" {
  if (strategy === "direct" || strategy === "indexed") return strategy;
  const filteredPlayerIds = normalizeCareerInterventionPlayerFilter(playerFilter);
  if (!filteredPlayerIds) return "indexed";
  return filteredPlayerIds.size <= CAREER_INTERVENTION_DIRECT_ENVIRONMENT_PLAYER_LIMIT
    ? "direct"
    : "indexed";
}

function metadataString(
  metadata: Record<string, JsonValue> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metadataNumber(
  metadata: Record<string, JsonValue> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function matchesPlayerFilter(
  filter: CareerInterventionPlayerFilter | undefined,
  candidatePlayerId: string,
): boolean {
  if (filter === undefined) return true;
  return typeof filter === "string"
    ? filter === candidatePlayerId
    : filter.has(candidatePlayerId);
}

function humanizeOption(optionId: string): string {
  return optionId
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`.trim() || "A placed player";
}

function createCareerInterventionIndexes(
  state: GameState,
  playerFilter?: CareerInterventionPlayerFilter,
): CareerInterventionIndexes {
  const callbackObservedByDecision = new Set<string>();
  const factIdsByDecision = new Map<string, string[]>();
  for (const fact of Object.values(state.consequenceState.facts ?? {})) {
    if (fact.sourceDecisionId) {
      let factIds = factIdsByDecision.get(fact.sourceDecisionId);
      if (!factIds) {
        factIds = [];
        factIdsByDecision.set(fact.sourceDecisionId, factIds);
      }
      factIds.push(fact.id);
      if (fact.kind === "activeCareerFrontReviewDue") {
        callbackObservedByDecision.add(fact.sourceDecisionId);
      }
    }
  }
  for (const consequence of Object.values(state.consequenceState.consequences ?? {})) {
    if (
      consequence.decisionId
      && consequence.tags.includes("active-career-front")
      && consequence.status === "applied"
    ) {
      callbackObservedByDecision.add(consequence.decisionId);
    }
  }

  const movementsByPlayer = new Map<string, PlayerMovementRecord[]>();
  for (const movement of state.playerMovementHistory ?? []) {
    if (!matchesPlayerFilter(playerFilter, movement.playerId)) continue;
    let movements = movementsByPlayer.get(movement.playerId);
    if (!movements) {
      movements = [];
      movementsByPlayer.set(movement.playerId, movements);
    }
    movements.push(movement);
  }
  for (const movements of movementsByPlayer.values()) {
    movements.sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || right.id.localeCompare(left.id),
    );
  }

  return {
    callbackObservedByDecision,
    factIdsByDecision,
    movementsByPlayer,
  };
}

function createCurrentEnvironmentResolver(
  state: GameState,
  playerFilter: CareerInterventionPlayerFilter | undefined,
  strategy: CareerInterventionEnvironmentStrategy,
) {
  const cache = new Map<string, {
    score: number;
    headline: string;
    summary: string;
  }>();
  const resolvedStrategy = determineCareerInterventionEnvironmentStrategy(
    playerFilter,
    strategy,
  );
  let developmentEnvironmentIndex: DevelopmentEnvironmentIndex | undefined;

  const resolveWithDirectProjection = (player: Player) =>
    projectCurrentPlayerCareerEnvironment(state, player);
  const resolveWithSharedIndex = (player: Player) =>
    projectCurrentPlayerCareerEnvironment(state, player, {
      index: developmentEnvironmentIndex ??= createDevelopmentEnvironmentIndex(state),
    });

  return (player: Player) => {
    const cached = cache.get(player.id);
    if (cached) return cached;
    const projection = player.clubId && resolvedStrategy === "indexed"
      ? resolveWithSharedIndex(player)
      : resolveWithDirectProjection(player);
    const resolved = {
      score: projection.score,
      headline: projection.headline,
      summary: projection.summary,
    };
    cache.set(player.id, resolved);
    return resolved;
  };
}

function outcomeFor(
  elapsedWeeks: number,
  callbackHasLanded: boolean,
  scoreDelta: number,
): CareerInterventionOutcome {
  if (!callbackHasLanded && elapsedWeeks < 8) return "monitoring";
  if (scoreDelta >= 8) return "improved";
  if (scoreDelta <= -8) return "worsened";
  return "unchanged";
}

function latestMovementId(
  indexes: CareerInterventionIndexes,
  playerId: string,
  selectedAt: GameDate,
): string | undefined {
  return indexes.movementsByPlayer.get(playerId)?.find((movement) =>
      movement.playerId === playerId
      && (
        movement.season > selectedAt.season
        || (movement.season === selectedAt.season && movement.week >= selectedAt.week)
      ),
    )?.id;
}

/**
 * Read selected stalled-pathway responses back out of the durable consequence
 * ledger and compare them with the player's current public environment. The
 * comparison records correlation and follow-through, never invented causality.
 */
export function collectCareerInterventionEvidence(
  state: GameState,
  playerFilter?: CareerInterventionPlayerFilter,
  strategy: CareerInterventionEnvironmentStrategy = "adaptive",
): CareerInterventionEvidence[] {
  const now = { week: state.currentWeek, season: state.currentSeason };
  const indexes = createCareerInterventionIndexes(state, playerFilter);
  const resolveCurrentEnvironment = createCurrentEnvironmentResolver(
    state,
    playerFilter,
    strategy,
  );
  let gameCalendar: ReturnType<typeof createGameCalendarIndex> | undefined;
  const activeById = new Map(
    Object.values(state.consequenceState.decisions ?? {})
      .filter((decision) =>
        decision.source.kind === "activeCareerFront"
        && Boolean(decision.selectedOptionId),
      )
      .map((decision) => [decision.id, decision]),
  );
  const rows: Array<{
    decisionId: string;
    relatedPlayerId?: string;
    selectedOptionId?: string;
    selectedAt: GameDate;
    metadata?: Record<string, JsonValue>;
    optionLabel?: string;
  }> = [];

  for (const decision of activeById.values()) {
    rows.push({
      decisionId: decision.id,
      relatedPlayerId: metadataString(decision.metadata, "playerId")
        ?? metadataString(decision.metadata, "relatedPlayerId"),
      selectedOptionId: decision.selectedOptionId,
      selectedAt: decision.selectedAt ?? decision.offeredAt,
      metadata: decision.metadata,
      optionLabel: decision.options.find((option) => option.id === decision.selectedOptionId)?.label,
    });
  }
  for (const history of state.consequenceState.history ?? []) {
    if (history.source.kind !== "activeCareerFront" || activeById.has(history.decisionId)) continue;
    rows.push({
      decisionId: history.decisionId,
      relatedPlayerId: metadataString(history.metadata, "playerId")
        ?? metadataString(history.metadata, "relatedPlayerId"),
      selectedOptionId: history.selectedOptionId,
      selectedAt: history.terminalAt,
      metadata: history.metadata,
    });
  }

  return rows.flatMap((row): CareerInterventionEvidence[] => {
    if (!row.relatedPlayerId || !row.selectedOptionId) return [];
    if (!matchesPlayerFilter(playerFilter, row.relatedPlayerId)) return [];
    const player = state.players[row.relatedPlayerId]
      ?? state.retiredPlayers?.[row.relatedPlayerId];
    if (!player) return [];
    const environment = resolveCurrentEnvironment(player);
    const originalScore = metadataNumber(row.metadata, "originalEnvironmentScore")
      ?? environment.score;
    const scoreDelta = environment.score - originalScore;
    const observed = indexes.callbackObservedByDecision.has(row.decisionId);
    const elapsedWeeks = gameWeeksBetweenWithCalendar(
      gameCalendar ??= createGameCalendarIndex(state.fixtures),
      row.selectedAt,
      now,
    );
    const movementId = latestMovementId(indexes, row.relatedPlayerId, row.selectedAt);
    const alumniRecordId = metadataString(row.metadata, "alumniRecordId");
    const caseId = metadataString(row.metadata, "caseId");
    const reportId = metadataString(row.metadata, "reportId");
    return [{
      decisionId: row.decisionId,
      playerId: row.relatedPlayerId,
      playerName: playerName(player),
      optionId: row.selectedOptionId,
      optionLabel: row.optionLabel ?? humanizeOption(row.selectedOptionId),
      selectedAt: { ...row.selectedAt },
      originalEnvironmentScore: originalScore,
      currentEnvironmentScore: environment.score,
      currentEnvironmentHeadline: environment.headline,
      currentEnvironmentSummary: environment.summary,
      scoreDelta,
      outcome: outcomeFor(elapsedWeeks, observed, scoreDelta),
      callbackObserved: observed,
      evidenceIds: [
        row.decisionId,
        row.relatedPlayerId,
        ...(alumniRecordId ? [alumniRecordId] : []),
        ...(caseId ? [caseId] : []),
        ...(reportId ? [reportId] : []),
        ...(movementId ? [movementId] : []),
        ...(indexes.factIdsByDecision.get(row.decisionId) ?? []),
      ],
    }];
  }).sort((left, right) =>
    right.selectedAt.season - left.selectedAt.season
    || right.selectedAt.week - left.selectedAt.week
    || left.decisionId.localeCompare(right.decisionId),
  );
}

export function projectCareerInterventionPortfolio(
  state: GameState,
): CareerInterventionPortfolio {
  const interventions = collectCareerInterventionEvidence(state);
  const counts = {
    monitoring: 0,
    improved: 0,
    unchanged: 0,
    worsened: 0,
  };
  for (const intervention of interventions) {
    counts[intervention.outcome] += 1;
  }
  const summary = interventions.length === 0
    ? "No placed-player pathway has required a recorded intervention yet."
    : `${interventions.length} pathway intervention${interventions.length === 1 ? "" : "s"}: ${counts.improved} improved, ${counts.unchanged} still unsettled, ${counts.worsened} worsened, and ${counts.monitoring} awaiting review.`;
  return { interventions, ...counts, summary };
}
