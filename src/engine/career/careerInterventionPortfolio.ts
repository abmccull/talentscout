import type { GameState, Player } from "@/engine/core/types";
import type { GameDate, JsonValue } from "@/engine/consequences";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import { projectCurrentPlayerCareerEnvironment } from "@/engine/world/developmentEnvironment";

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

function humanizeOption(optionId: string): string {
  return optionId
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`.trim() || "A placed player";
}

function currentEnvironment(state: GameState, player: Player): {
  score: number;
  headline: string;
  summary: string;
} {
  const projection = projectCurrentPlayerCareerEnvironment(state, player);
  return {
    score: projection.score,
    headline: projection.headline,
    summary: projection.summary,
  };
}

function callbackObserved(state: GameState, decisionId: string): boolean {
  return Object.values(state.consequenceState.facts ?? {}).some((fact) =>
    fact.sourceDecisionId === decisionId
    && fact.kind === "activeCareerFrontReviewDue",
  ) || Object.values(state.consequenceState.consequences ?? {}).some((consequence) =>
    consequence.decisionId === decisionId
    && consequence.tags.includes("active-career-front")
    && consequence.status === "applied",
  );
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
  state: GameState,
  playerId: string,
  selectedAt: GameDate,
): string | undefined {
  return [...(state.playerMovementHistory ?? [])]
    .filter((movement) =>
      movement.playerId === playerId
      && (
        movement.season > selectedAt.season
        || (movement.season === selectedAt.season && movement.week >= selectedAt.week)
      ),
    )
    .sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || right.id.localeCompare(left.id),
    )[0]?.id;
}

/**
 * Read selected stalled-pathway responses back out of the durable consequence
 * ledger and compare them with the player's current public environment. The
 * comparison records correlation and follow-through, never invented causality.
 */
export function collectCareerInterventionEvidence(
  state: GameState,
  playerId?: string,
): CareerInterventionEvidence[] {
  const now = { week: state.currentWeek, season: state.currentSeason };
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
    if (playerId && row.relatedPlayerId !== playerId) return [];
    const player = state.players[row.relatedPlayerId]
      ?? state.retiredPlayers?.[row.relatedPlayerId];
    if (!player) return [];
    const environment = currentEnvironment(state, player);
    const originalScore = metadataNumber(row.metadata, "originalEnvironmentScore")
      ?? environment.score;
    const scoreDelta = environment.score - originalScore;
    const observed = callbackObserved(state, row.decisionId);
    const elapsedWeeks = gameWeeksBetween(state.fixtures, row.selectedAt, now);
    const movementId = latestMovementId(state, row.relatedPlayerId, row.selectedAt);
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
        ...Object.values(state.consequenceState.facts ?? {})
          .filter((fact) => fact.sourceDecisionId === row.decisionId)
          .map((fact) => fact.id),
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
    monitoring: interventions.filter((item) => item.outcome === "monitoring").length,
    improved: interventions.filter((item) => item.outcome === "improved").length,
    unchanged: interventions.filter((item) => item.outcome === "unchanged").length,
    worsened: interventions.filter((item) => item.outcome === "worsened").length,
  };
  const summary = interventions.length === 0
    ? "No placed-player pathway has required a recorded intervention yet."
    : `${interventions.length} pathway intervention${interventions.length === 1 ? "" : "s"}: ${counts.improved} improved, ${counts.unchanged} still unsettled, ${counts.worsened} worsened, and ${counts.monitoring} awaiting review.`;
  return { interventions, ...counts, summary };
}
