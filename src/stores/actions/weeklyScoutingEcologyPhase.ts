import type { GameState } from "@/engine/core/types";
import {
  applyPreparedRelationshipConflict,
  prepareWeeklyRelationshipConflictCandidate,
  type PreparedRelationshipConflictCandidate,
} from "@/engine/consequences/relationshipConflictDirector";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import {
  applyPreparedAgencyDilemma,
  prepareWeeklyAgencyDilemmaCandidate,
  type PreparedAgencyDilemmaCandidate,
} from "@/engine/finance";
import type {
  RivalOrganization,
  RivalOrganizationOpportunity,
} from "@/engine/rivals/organizations";
import { createRivalOrganizationOpportunityMessage } from "@/engine/rivals/organizations";

export interface PreparedRivalOpportunityPresentation {
  candidate: StoryCandidateV2;
  opportunity: RivalOrganizationOpportunity;
  organization: RivalOrganization;
}

export interface PreparedWeeklyScoutingEcology {
  agencyDilemma?: PreparedAgencyDilemmaCandidate;
  relationshipConflict?: PreparedRelationshipConflictCandidate;
  rivalOpportunity?: PreparedRivalOpportunityPresentation;
  candidates: StoryCandidateV2[];
}

function prepareRivalOpportunityPresentation(
  state: GameState,
  opportunity: RivalOrganizationOpportunity | undefined,
): PreparedRivalOpportunityPresentation | undefined {
  if (!opportunity || opportunity.status !== "open") return undefined;
  const organization = state.rivalOrganizationState.organizations[opportunity.organizationId];
  if (!organization) return undefined;
  const cast = organization.memberRivalIds
    .filter((rivalId) => Boolean(state.rivalScouts[rivalId]))
    .sort()
    .map((rivalId) => ({ kind: "rivalScout", id: rivalId }));
  const topics = opportunity.relatedPlayerId
    ? [{ kind: "player", id: opportunity.relatedPlayerId }]
    : [];
  return {
    opportunity,
    organization,
    candidate: {
      id: `rival-opportunity:${opportunity.id}`,
      templateId: `rival-opportunity:${opportunity.kind}`,
      kind: "rivalOpportunity",
      category: "rival-pressure",
      semanticSignature: `rival:${organization.archetypeId}:${opportunity.kind}`,
      baseWeight: 1 + Math.min(1.5, organization.heat / 100),
      cast: [{ kind: "rivalOrganization", id: organization.id }, ...cast],
      topics,
      requiresChoice: true,
      templateCooldownWeeks: 6,
      semanticCooldownWeeks: 8,
      castWindowWeeks: 10,
      castMaxUses: 2,
      topicCooldownWeeks: 4,
    },
  };
}

function selectUnpresentedRivalOpportunity(
  state: GameState,
  newlyCreated: RivalOrganizationOpportunity | undefined,
): RivalOrganizationOpportunity | undefined {
  const opportunities = new Map(
    Object.values(state.rivalOrganizationState.opportunities ?? {})
      .map((opportunity) => [opportunity.id, opportunity]),
  );
  if (newlyCreated) opportunities.set(newlyCreated.id, newlyCreated);

  return [...opportunities.values()]
    .filter((opportunity) =>
      opportunity.status === "open"
      && !state.inbox.some(
        (message) => message.id === `rival-organization-opportunity-${opportunity.id}`,
      )
    )
    .sort((left, right) =>
      left.expiresSeason - right.expiresSeason
      || left.expiresWeek - right.expiresWeek
      || left.createdSeason - right.createdSeason
      || left.createdWeek - right.createdWeek
      || left.id.localeCompare(right.id)
    )[0];
}

/**
 * Prepare the social and rival candidates that compete with narrative/world
 * beats for the same weekly attention slot. Preparation is side-effect free.
 */
export function prepareWeeklyScoutingEcology(input: {
  state: GameState;
  rivalOpportunity?: RivalOrganizationOpportunity;
}): PreparedWeeklyScoutingEcology {
  const agencyDilemma = prepareWeeklyAgencyDilemmaCandidate({
    state: input.state,
  }).prepared;
  const relationshipConflict = prepareWeeklyRelationshipConflictCandidate({
    state: input.state,
  }).prepared;
  const rivalOpportunity = prepareRivalOpportunityPresentation(
    input.state,
    selectUnpresentedRivalOpportunity(input.state, input.rivalOpportunity),
  );
  return {
    agencyDilemma,
    relationshipConflict,
    rivalOpportunity,
    candidates: [
      ...(agencyDilemma ? [agencyDilemma.candidate] : []),
      ...(relationshipConflict ? [relationshipConflict.candidate] : []),
      ...(rivalOpportunity ? [rivalOpportunity.candidate] : []),
    ],
  };
}

/** Apply only ecology candidates selected by Story Director V2. */
export function applyDirectedWeeklyScoutingEcology(input: {
  state: GameState;
  prepared: PreparedWeeklyScoutingEcology;
  acceptedCandidateIds: ReadonlySet<string>;
}): GameState {
  let state = input.state;
  const agencyDilemma = input.prepared.agencyDilemma;
  if (
    agencyDilemma
    && input.acceptedCandidateIds.has(agencyDilemma.candidate.id)
  ) {
    state = applyPreparedAgencyDilemma(state, agencyDilemma).state;
  }
  const relationshipConflict = input.prepared.relationshipConflict;
  if (
    relationshipConflict
    && input.acceptedCandidateIds.has(relationshipConflict.candidate.id)
  ) {
    state = applyPreparedRelationshipConflict(state, relationshipConflict).state;
  }

  const rivalOpportunity = input.prepared.rivalOpportunity;
  if (
    rivalOpportunity
    && input.acceptedCandidateIds.has(rivalOpportunity.candidate.id)
  ) {
    const message = {
      ...createRivalOrganizationOpportunityMessage(
        rivalOpportunity.opportunity,
        rivalOpportunity.organization,
      ),
      relatedEntityType: "narrative" as const,
    };
    if (!state.inbox.some((entry) => entry.id === message.id)) {
      state = { ...state, inbox: [...state.inbox, message] };
    }
  }
  return state;
}
