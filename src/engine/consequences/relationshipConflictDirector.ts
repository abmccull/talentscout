import type { GameState, InboxMessage } from "@/engine/core/types";
import { addGameWeeks, gameWeeksBetween } from "@/engine/core/gameDate";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import { createNamedRNG } from "@/engine/run";
import {
  type AuthoredConflictCast,
  type MaterializedRelationshipConflict,
  type RelationshipConflictFrontMetadata,
  materializeAuthoredRelationshipConflict,
  registerMaterializedRelationshipConflict,
  selectAuthoredRelationshipConflict,
} from "./authoredRelationshipConflicts";
import {
  createStakeholderProfileRegistry,
  type StakeholderProfileRegistry,
} from "./stakeholderProfiles";
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

export interface PreparedRelationshipConflictCandidate {
  candidate: StoryCandidateV2;
  cast: AuthoredConflictCast;
  materialized: MaterializedRelationshipConflict;
  stakeholderProfiles: StakeholderProfileRegistry;
  front: RelationshipConflictFrontMetadata;
}

export interface RelationshipConflictPreparationResult {
  prepared?: PreparedRelationshipConflictCandidate;
  blockedReason?: RelationshipConflictDirectionResult["blockedReason"];
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function relevantRelationshipSubjectIds(state: GameState): string[] {
  const unsignedPlayerIds = new Set(
    Object.values(state.unsignedYouth ?? {}).map((candidate) => candidate.player.id),
  );
  const alumniPlayerIds = new Set(
    (state.alumniRecords ?? []).map((record) => record.playerId),
  );
  return distinctSorted([
    ...(state.watchlist ?? []),
    ...Object.values(state.reports ?? {}).map((report) => report.playerId),
    ...Object.values(state.scoutingCases ?? {})
      .filter((scoutingCase) => scoutingCase.status !== "closed")
      .map((scoutingCase) => scoutingCase.playerId),
    ...Object.values(state.placementReports ?? {})
      .map((report) => state.unsignedYouth?.[report.unsignedYouthId]?.player.id)
      .filter((playerId): playerId is string => Boolean(playerId)),
    ...unsignedPlayerIds,
    ...alumniPlayerIds,
  ]).filter((id) =>
    Boolean(state.players[id])
    || Boolean(state.retiredPlayers?.[id])
    || unsignedPlayerIds.has(id),
  );
}

export function getRelationshipConflictCandidatePlayerIds(state: GameState): string[] {
  const relevantIds = relevantRelationshipSubjectIds(state);
  if (relevantIds.length > 0) return relevantIds;
  return distinctSorted(Object.keys(state.players ?? {}));
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
 * Prepare a deterministic relationship conflict without mutating state. The
 * shared story director can therefore compare it with world arcs, rival
 * openings, and authored narrative beats before anything reaches the inbox.
 */
export function prepareWeeklyRelationshipConflictCandidate(input: {
  state: GameState;
  triggerChance?: number;
  forceTrigger?: boolean;
}): RelationshipConflictPreparationResult {
  const state = input.state;
  const openDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered");
  if (openDecisions.length >= MAX_OPEN_PLAYER_DECISIONS) {
    return { blockedReason: "choice-cap" };
  }
  if (openDecisions.some((decision) => decision.source.kind === "relationshipConflict")) {
    return { blockedReason: "unresolved-conflict" };
  }

  const now = { week: state.currentWeek, season: state.currentSeason };
  const previous = lastConflictDate(state);
  if (
    previous
    && gameWeeksBetween(state.fixtures, previous, now) < RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS
  ) return { blockedReason: "cooldown" };

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
    return { blockedReason: "trigger-missed" };
  }

  const playerIds = getRelationshipConflictCandidatePlayerIds(state);
  if (playerIds.length === 0) return { blockedReason: "no-subject" };
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
    state,
  });
  if (!cast) return { blockedReason: "no-cast" };

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
    existingState: state.consequenceState,
    advanceWeeks: (start, weeks) => addGameWeeks(state.fixtures, start, weeks),
  });

  const semanticSignature = materialized.decision.metadata?.semanticSignature;
  return {
    prepared: {
      candidate: {
        id: materialized.decision.id,
        templateId: cast.definition.id,
        kind: "relationshipConflict",
        category: "relationship",
        semanticSignature: typeof semanticSignature === "string"
          ? semanticSignature
          : `relationship:${cast.definition.leftRole}:${cast.definition.rightRole}`,
        baseWeight: cast.selectionWeight,
        cast: [{ ...cast.left.entity }, { ...cast.right.entity }],
        topics: [{ ...cast.subject }],
        requiresChoice: true,
        templateCooldownWeeks: RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS,
        semanticCooldownWeeks: RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS,
        castWindowWeeks: 12,
        castMaxUses: 1,
        topicCooldownWeeks: 6,
      },
      cast,
      materialized,
      stakeholderProfiles: registry,
      front: materialized.front,
    },
  };
}

/** Register and surface a conflict only after the shared story gate accepts it. */
export function applyPreparedRelationshipConflict(
  state: GameState,
  prepared: PreparedRelationshipConflictCandidate,
): RelationshipConflictDirectionResult {
  const registered = registerMaterializedRelationshipConflict(
    state.consequenceState,
    prepared.materialized,
  );
  if (registered.error) return { state, blockedReason: "registration-failed" };

  const premise = prepared.materialized.decision.metadata?.premise;
  const decisionId = prepared.materialized.decision.id;
  const message: InboxMessage = {
    id: `inbox:${decisionId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: prepared.cast.definition.title,
    body: typeof premise === "string"
      ? premise
      : `${prepared.cast.left.name} and ${prepared.cast.right.name} want incompatible commitments from you.`,
    read: false,
    actionRequired: true,
    relatedId: decisionId,
    relatedEntityType: "narrative",
  };
  return {
    state: {
      ...state,
      consequenceState: registered.state,
      stakeholderProfiles: prepared.stakeholderProfiles,
      inbox: [...state.inbox, message],
    },
    offeredDecisionId: decisionId,
  };
}

/**
 * Compatibility entry point for callers that intentionally want a standalone
 * conflict. The authoritative weekly loop uses prepare/apply through Story
 * Director V2 instead.
 */
export function directWeeklyRelationshipConflict(input: {
  state: GameState;
  triggerChance?: number;
  forceTrigger?: boolean;
}): RelationshipConflictDirectionResult {
  const prepared = prepareWeeklyRelationshipConflictCandidate(input);
  if (!prepared.prepared) {
    return { state: input.state, blockedReason: prepared.blockedReason };
  }
  return applyPreparedRelationshipConflict(input.state, prepared.prepared);
}
