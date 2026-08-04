import type { GameState, InboxMessage } from "@/engine/core/types";
import { addGameWeeks, gameWeeksBetween } from "@/engine/core/gameDate";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import { createNamedRNG } from "@/engine/run";
import { isAccessAgreementActive } from "./accessAgreements";
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
import type { GameDate, JsonValue } from "./types";

export const RELATIONSHIP_CONFLICT_TRIGGER_CHANCE = 0.065;
export const RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS = 10;
export const RELATIONSHIP_CONFLICT_OVERLAP_CADENCE_WEEKS = 3;
export const MAX_OPEN_PLAYER_DECISIONS = 2;
export const MAX_ACTIVE_RELATIONSHIP_CONFLICTS = 2;

export interface RelationshipConflictDirectionResult {
  state: GameState;
  offeredDecisionId?: string;
  blockedReason?:
    | "choice-cap"
    | "unresolved-conflict"
    | "active-conflict-cap"
    | "active-conflict-cadence"
    | "cooldown"
    | "trigger-missed"
    | "no-subject"
    | "no-distinct-front"
    | "no-cast"
    | "registration-failed";
}

export interface PreparedRelationshipConflictCandidate {
  candidate: StoryCandidateV2;
  cast: AuthoredConflictCast;
  materialized: MaterializedRelationshipConflict;
  stakeholderProfiles: StakeholderProfileRegistry;
  front: RelationshipConflictFrontMetadata;
  quietFallback?: QuietRelationshipFallbackMetadata;
}

export interface RelationshipConflictPreparationResult {
  prepared?: PreparedRelationshipConflictCandidate;
  blockedReason?: RelationshipConflictDirectionResult["blockedReason"];
}

export interface QuietRelationshipFallbackMetadata {
  quietIntervention: true;
  caseId?: string;
  questionId?: string;
  question?: string;
  careerEraId?: string;
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function distinctInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

interface ActiveRelationshipConflictFront {
  decisionId: string;
  offeredAt: GameDate;
  frontFamilyId?: string;
  ensembleId?: string;
  stakeholderPairKey: string;
}

function stakeholderRefKey(entity: { kind: string; id: string }): string {
  return `${entity.kind}:${entity.id}`;
}

function stakeholderPairKey(keys: readonly string[]): string {
  return [...new Set(keys.filter(Boolean))].sort().join("|");
}

function hasPendingRelationshipConsequences(state: GameState, decisionId: string): boolean {
  return Object.values(state.consequenceState.consequences ?? {})
    .some((consequence) =>
      consequence.decisionId === decisionId
      && consequence.status === "pending",
    );
}

function hasActiveRelationshipObligations(state: GameState, decisionId: string): boolean {
  return Object.values(state.consequenceState.obligations ?? {})
    .some((obligation) =>
      obligation.sourceDecisionId === decisionId
      && obligation.status === "active",
    );
}

function hasActiveRelationshipAccess(state: GameState, decisionId: string): boolean {
  const now = { season: state.currentSeason, week: state.currentWeek };
  return Object.values(state.accessAgreements ?? {})
    .some((agreement) =>
      agreement.sourceDecisionId === decisionId
      && isAccessAgreementActive(agreement, now),
    );
}

function decisionHasLiveRelationshipPressure(
  state: GameState,
  decision: GameState["consequenceState"]["decisions"][string],
): boolean {
  if (decision.source.kind !== "relationshipConflict") return false;
  if (decision.status === "offered") return true;
  if (decision.status !== "selected" || !decision.selectedOptionId) return false;
  return hasPendingRelationshipConsequences(state, decision.id)
    || hasActiveRelationshipObligations(state, decision.id)
    || hasActiveRelationshipAccess(state, decision.id);
}

function activeRelationshipConflictFronts(state: GameState): ActiveRelationshipConflictFront[] {
  return Object.values(state.consequenceState.decisions)
    .filter((decision) => decisionHasLiveRelationshipPressure(state, decision))
    .map((decision) => {
      const leftStakeholderKey = typeof decision.metadata?.leftStakeholderKey === "string"
        ? decision.metadata.leftStakeholderKey
        : undefined;
      const rightStakeholderKey = typeof decision.metadata?.rightStakeholderKey === "string"
        ? decision.metadata.rightStakeholderKey
        : undefined;
      const fallbackStakeholderKeys = decision.stakeholders
        .filter((stakeholder) => stakeholder.kind !== "scout")
        .map(stakeholderRefKey)
        .slice(0, 2);
      return {
        decisionId: decision.id,
        offeredAt: decision.offeredAt,
        frontFamilyId: typeof decision.metadata?.frontFamilyId === "string"
          ? decision.metadata.frontFamilyId
          : undefined,
        ensembleId: typeof decision.metadata?.ensembleId === "string"
          ? decision.metadata.ensembleId
          : undefined,
        stakeholderPairKey: stakeholderPairKey(
          leftStakeholderKey && rightStakeholderKey
            ? [leftStakeholderKey, rightStakeholderKey]
            : fallbackStakeholderKeys,
        ),
      };
    });
}

function quietFallbackDecisionMetadata(
  quietFallback: QuietRelationshipFallbackMetadata | undefined,
): Record<string, JsonValue> | undefined {
  if (!quietFallback) return undefined;
  return {
    quietIntervention: true,
    ...(quietFallback.caseId ? { caseId: quietFallback.caseId } : {}),
    ...(quietFallback.questionId ? { questionId: quietFallback.questionId } : {}),
    ...(quietFallback.question ? { question: quietFallback.question } : {}),
    ...(quietFallback.careerEraId ? { careerEraId: quietFallback.careerEraId } : {}),
  };
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
  preferredSubjectIds?: readonly string[];
  quietFallback?: QuietRelationshipFallbackMetadata;
}): RelationshipConflictPreparationResult {
  const state = input.state;
  const activeConflictFronts = activeRelationshipConflictFronts(state);
  if (activeConflictFronts.length >= MAX_ACTIVE_RELATIONSHIP_CONFLICTS) {
    return { blockedReason: "active-conflict-cap" };
  }
  const openDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered");
  if (openDecisions.length >= MAX_OPEN_PLAYER_DECISIONS) {
    return { blockedReason: "choice-cap" };
  }

  const now = { week: state.currentWeek, season: state.currentSeason };
  const previous = lastConflictDate(state);
  const cooldownWeeks = activeConflictFronts.length > 0
    ? RELATIONSHIP_CONFLICT_OVERLAP_CADENCE_WEEKS
    : RELATIONSHIP_CONFLICT_COOLDOWN_WEEKS;
  if (
    previous
    && gameWeeksBetween(state.fixtures, previous, now) < cooldownWeeks
  ) {
    return { blockedReason: activeConflictFronts.length > 0 ? "active-conflict-cadence" : "cooldown" };
  }

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

  const preferredSubjectIds = distinctInOrder(
    (input.preferredSubjectIds ?? []).filter((playerId) =>
      Boolean(state.players[playerId])
      || Boolean(state.retiredPlayers?.[playerId])
      || Object.values(state.unsignedYouth ?? {})
        .some((candidate) => candidate.player.id === playerId),
    ),
  );
  const playerIds = preferredSubjectIds.length > 0
    ? preferredSubjectIds
    : getRelationshipConflictCandidatePlayerIds(state);
  if (playerIds.length === 0) return { blockedReason: "no-subject" };
  const registry = createStakeholderProfileRegistry(state, state.stakeholderProfiles);
  const candidateSubjects = preferredSubjectIds.length > 0
    ? playerIds
    : [createNamedRNG(
      state.runManifest.rootSeed,
      "weekly-relationship-conflict-subject",
      state.currentSeason,
      state.currentWeek,
      playerIds.join("|"),
    ).pick(playerIds)];
  let cast: AuthoredConflictCast | undefined;
  const excludedFrontFamilyIds = new Set(
    activeConflictFronts.flatMap((front) => front.frontFamilyId ? [front.frontFamilyId] : []),
  );
  const excludedEnsembleIds = new Set(
    activeConflictFronts.flatMap((front) => front.ensembleId ? [front.ensembleId] : []),
  );
  const excludedStakeholderPairKeys = new Set(
    activeConflictFronts.map((front) => front.stakeholderPairKey).filter((key) => key.length > 0),
  );
  for (const playerId of candidateSubjects) {
    cast = selectAuthoredRelationshipConflict({
      rootSeed: state.runManifest.rootSeed,
      now,
      registry,
      subject: { kind: "player", id: playerId },
      excludedFrontFamilyIds,
      excludedEnsembleIds,
      excludedStakeholderPairKeys,
      quietEligibleOnly: Boolean(input.quietFallback),
      state,
    });
    if (cast) break;
  }
  if (!cast) {
    return { blockedReason: activeConflictFronts.length > 0 ? "no-distinct-front" : "no-cast" };
  }
  const subject = cast.subject;

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
    decisionMetadata: quietFallbackDecisionMetadata(input.quietFallback),
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
      quietFallback: input.quietFallback,
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
