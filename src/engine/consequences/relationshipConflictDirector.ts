import type { GameState, InboxMessage } from "@/engine/core/types";
import { addGameWeeks, gameWeeksBetween } from "@/engine/core/gameDate";
import { createNamedRNG } from "@/engine/run";
import {
  materializeAuthoredRelationshipConflict,
  registerMaterializedRelationshipConflict,
  selectAuthoredRelationshipConflict,
} from "./authoredRelationshipConflicts";
import { createStakeholderProfileRegistry } from "./stakeholderProfiles";
import type { GameDate } from "./types";

export const RELATIONSHIP_CONFLICT_TRIGGER_CHANCE = 0.065;
export const RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS = 10;
export const MAX_OPEN_PLAYER_DECISIONS = 2;

export interface RelationshipConflictDirectionResult {
  state: GameState;
  offeredDecisionId?: string;
  blockedReason?:
    | "choice-cap"
    | "unresolved-conflict"
    | "cooldown"
    | "trigger-missed"
    | "no-subject"
    | "no-cast"
    | "registration-failed";
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function candidatePlayerIds(state: GameState): string[] {
  const unsignedPlayerIds = new Set(
    Object.values(state.unsignedYouth ?? {}).map((candidate) => candidate.player.id),
  );
  return distinctSorted([
    ...(state.watchlist ?? []),
    ...Object.values(state.reports ?? {}).map((report) => report.playerId),
    ...unsignedPlayerIds,
    ...Object.keys(state.players ?? {}),
  ]).filter((id) =>
    Boolean(state.players[id])
    || unsignedPlayerIds.has(id),
  );
}

function lastConflictDate(state: GameState): GameDate | undefined {
  const dates = [
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) => decision.source.kind === "relationshipConflict")
      .map((decision) => decision.offeredAt),
    ...(state.consequenceState.history ?? [])
      .filter((record) => record.source.kind === "relationshipConflict")
      .map((record) => record.offeredAt),
  ];
  const now = { week: state.currentWeek, season: state.currentSeason };
  return dates.sort((left, right) =>
    gameWeeksBetween(state.fixtures, left, now)
    - gameWeeksBetween(state.fixtures, right, now),
  )[0];
}

/**
 * Bounded weekly relationship director. At most one authored conflict can be
 * unresolved, and it shares the same two-choice attention cap as narrative
 * decisions and career crossroads.
 */
export function directWeeklyRelationshipConflict(input: {
  state: GameState;
  triggerChance?: number;
  forceTrigger?: boolean;
}): RelationshipConflictDirectionResult {
  const state = input.state;
  const openDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered");
  if (openDecisions.length >= MAX_OPEN_PLAYER_DECISIONS) {
    return { state, blockedReason: "choice-cap" };
  }
  if (openDecisions.some((decision) => decision.source.kind === "relationshipConflict")) {
    return { state, blockedReason: "unresolved-conflict" };
  }

  const now = { week: state.currentWeek, season: state.currentSeason };
  const previous = lastConflictDate(state);
  if (
    previous
    && gameWeeksBetween(state.fixtures, previous, now) < RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS
  ) return { state, blockedReason: "cooldown" };

  const triggerRng = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-relationship-conflict-trigger",
    state.currentSeason,
    state.currentWeek,
  );
  const triggerChance = Math.max(0, Math.min(1,
    input.triggerChance ?? RELATIONSHIP_CONFLICT_TRIGGER_CHANCE,
  ));
  if (!input.forceTrigger && !triggerRng.chance(triggerChance)) {
    return { state, blockedReason: "trigger-missed" };
  }

  const playerIds = candidatePlayerIds(state);
  if (playerIds.length === 0) return { state, blockedReason: "no-subject" };
  const subjectRng = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-relationship-conflict-subject",
    state.currentSeason,
    state.currentWeek,
    playerIds.join("|"),
  );
  const subject = { kind: "player", id: subjectRng.pick(playerIds) };
  const registry = createStakeholderProfileRegistry(state, state.stakeholderProfiles);
  const cast = selectAuthoredRelationshipConflict({
    rootSeed: state.runManifest.rootSeed,
    now,
    registry,
    subject,
  });
  if (!cast) return { state, blockedReason: "no-cast" };

  const decisionId = [
    "relationship-conflict",
    `s${state.currentSeason}w${state.currentWeek}`,
    cast.definition.id,
    subject.id,
  ].join(":");
  const outcomeRng = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-relationship-conflict-outcome",
    decisionId,
  );
  const materialized = materializeAuthoredRelationshipConflict({
    id: decisionId,
    cast,
    scoutId: state.scout.id,
    now,
    deadlineAt: addGameWeeks(state.fixtures, now, cast.definition.deadlineWeeks),
    outcomeRoll: outcomeRng.next(),
  });
  const registered = registerMaterializedRelationshipConflict(
    state.consequenceState,
    materialized,
  );
  if (registered.error) return { state, blockedReason: "registration-failed" };

  const premise = materialized.decision.metadata?.premise;
  const message: InboxMessage = {
    id: `inbox:${decisionId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: cast.definition.title,
    body: typeof premise === "string"
      ? premise
      : `${cast.left.name} and ${cast.right.name} want incompatible commitments from you.`,
    read: false,
    actionRequired: true,
    relatedId: decisionId,
  };
  return {
    state: {
      ...state,
      consequenceState: registered.state,
      stakeholderProfiles: registry,
      inbox: [...state.inbox, message],
    },
    offeredDecisionId: decisionId,
  };
}
