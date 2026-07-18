import type { GameState, InboxMessage } from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import {
  createDecisionRecord,
  registerDecision,
  type EntityRef,
} from "@/engine/consequences";
import type { AccessAgreement, AccessAgreementScope } from "@/engine/consequences/accessAgreements";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import {
  buildRivalCampaignDirectory,
  directRivalCampaignWeek,
  resolveRivalCampaignResponse,
  type RivalCampaign,
  type RivalCampaignOperationalEffect,
  type RivalCampaignProvenancePacket,
} from "@/engine/rivals";
import { getWorldConditionModifiers } from "@/engine/world";

export interface PreparedRivalCampaignPresentation {
  candidate: StoryCandidateV2;
  campaign: RivalCampaign;
}

export interface PreparedWeeklyRivalCampaigns {
  state: GameState;
  presentations: PreparedRivalCampaignPresentation[];
  candidates: StoryCandidateV2[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function sameEntity(left: EntityRef | undefined, right: EntityRef): boolean {
  return Boolean(left && left.kind === right.kind && left.id === right.id);
}

function appendUniqueMessages(
  inbox: readonly InboxMessage[],
  messages: readonly InboxMessage[],
): InboxMessage[] {
  if (messages.length === 0) return [...inbox];
  const ids = new Set(inbox.map((message) => message.id));
  return [
    ...inbox,
    ...messages.filter((message) => {
      if (ids.has(message.id)) return false;
      ids.add(message.id);
      return true;
    }),
  ];
}

function accessScopeFor(effect: RivalCampaignOperationalEffect): AccessAgreementScope {
  if (effect.type === "territoryAccess") return "regionalIntro";
  if (effect.type === "venueAccess") return "tournamentAccess";
  if (effect.type === "clubReceptiveness") return "clubChannel";
  if (effect.target.kind === "player") return "playerEarlyAccess";
  return "clubChannel";
}

function metadataString(
  agreement: AccessAgreement,
  key: string,
): string | undefined {
  const value = agreement.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function rivalCampaignAgreementPrefix(
  campaignId: string,
  scope: AccessAgreementScope,
): string {
  return `access:rival-campaign:${campaignId}:${scope}:`;
}

function isLinkedRivalCampaignAgreement(
  agreement: AccessAgreement,
  effect: RivalCampaignOperationalEffect,
  campaignId: string,
  scope: AccessAgreementScope,
): boolean {
  if (agreement.scope !== scope) return false;

  if (
    agreement.id.startsWith(rivalCampaignAgreementPrefix(campaignId, scope))
    || metadataString(agreement, "campaignId") === campaignId
  ) {
    return true;
  }

  if (effect.target.kind === "territory") {
    return metadataString(agreement, "accessSource") === "rivalCampaign"
      && metadataString(agreement, "territoryId") === effect.target.id;
  }

  return sameEntity(agreement.grantor, effect.target)
    || sameEntity(agreement.subject, effect.target);
}

function applyAccessEffect(
  state: GameState,
  effect: RivalCampaignOperationalEffect,
  now: { season: number; week: number },
  sourceDecisionId: string | undefined,
): GameState {
  const agreements = { ...(state.accessAgreements ?? {}) };
  const campaignId = String(effect.metadata?.campaignId ?? "unknown");
  const delta = effect.delta ?? 0;
  if (delta <= 0) {
    const scope = accessScopeFor(effect);
    let changed = false;
    for (const [agreementId, agreement] of Object.entries(agreements)) {
      if (
        agreement.status === "active"
        && isLinkedRivalCampaignAgreement(agreement, effect, campaignId, scope)
      ) {
        agreements[agreementId] = { ...agreement, status: "revoked" };
        changed = true;
      }
    }
    return changed ? { ...state, accessAgreements: agreements } : state;
  }

  const scope = accessScopeFor(effect);
  const agreementId = `access:rival-campaign:${campaignId}:${scope}:${effect.target.kind}:${effect.target.id}`;
  if (agreements[agreementId]) return state;
  const campaign = state.rivalOrganizationState.campaignState.campaigns[campaignId];
  const territoryId = effect.target.kind === "territory"
    ? effect.target.id
    : campaign?.target.regionId;
  const agreement: AccessAgreement = {
    id: agreementId,
    grantor: { ...effect.target },
    beneficiary: { kind: "scout", id: state.scout.id },
    scope,
    status: "active",
    exclusive: false,
    confidential: true,
    createdAt: { ...now },
    expiresAt: addGameWeeks(state.fixtures, now, 6),
    subject: effect.target.kind === "territory" ? undefined : { ...effect.target },
    countryId: territoryId,
    regionId: territoryId,
    sourceDecisionId,
    metadata: {
      campaignId,
      note: effect.note,
      operationalEffect: effect.type,
      targetLabel: campaign?.target.label ?? "a scouting opportunity",
      accessSource: "rivalCampaign",
      territoryId: territoryId ?? null,
    },
  };
  agreements[agreementId] = agreement;
  return { ...state, accessAgreements: agreements };
}

function applyOperationalEffect(
  state: GameState,
  effect: RivalCampaignOperationalEffect,
  now: { season: number; week: number },
  sourceDecisionId: string | undefined,
): GameState {
  const delta = effect.delta ?? 0;
  if (effect.type === "contactTrust") {
    const contact = state.contacts[effect.target.id];
    if (!contact) return state;
    return {
      ...state,
      contacts: {
        ...state.contacts,
        [contact.id]: {
          ...contact,
          relationship: clamp(contact.relationship + Math.round(delta / 2), 0, 100),
          trustLevel: clamp((contact.trustLevel ?? contact.relationship) + delta, 0, 100),
        },
      },
    };
  }
  if (effect.type === "employeeMorale") {
    if (!state.finances?.employees.some((employee) => employee.id === effect.target.id)) return state;
    return {
      ...state,
      finances: {
        ...state.finances,
        employees: state.finances.employees.map((employee) =>
          employee.id === effect.target.id
            ? { ...employee, morale: clamp(employee.morale + delta, 0, 100) }
            : employee,
        ),
      },
    };
  }
  if (effect.type === "rivalMomentum") {
    const rival = state.rivalScouts[effect.target.id];
    const organizationId = typeof effect.metadata?.organizationId === "string"
      ? effect.metadata.organizationId
      : undefined;
    const organization = organizationId
      ? state.rivalOrganizationState.organizations[organizationId]
      : undefined;
    return {
      ...state,
      rivalScouts: rival
        ? {
            ...state.rivalScouts,
            [rival.id]: {
              ...rival,
              winsAgainstPlayer: rival.winsAgainstPlayer + (delta > 0 ? 1 : 0),
              lossesToPlayer: rival.lossesToPlayer + (delta < 0 ? 1 : 0),
            },
          }
        : state.rivalScouts,
      rivalOrganizationState: organization
        ? {
            ...state.rivalOrganizationState,
            organizations: {
              ...state.rivalOrganizationState.organizations,
              [organization.id]: {
                ...organization,
                momentum: clamp(organization.momentum + Math.round(delta / 3), -10, 10),
              },
            },
          }
        : state.rivalOrganizationState,
    };
  }
  return applyAccessEffect(state, effect, now, sourceDecisionId);
}

/**
 * Merge a resolved campaign into the canonical consequence and domain state.
 * The primary fact id is the exact-once boundary for every operational effect.
 */
export function applyRivalCampaignProvenance(
  state: GameState,
  packet: RivalCampaignProvenancePacket,
  now: { season: number; week: number },
): GameState {
  const primaryFactId = packet.facts[0]?.id;
  if (primaryFactId && state.consequenceState.facts[primaryFactId]) return state;
  const sourceDecisionId = packet.facts.find((fact) => fact.sourceDecisionId)?.sourceDecisionId;
  const facts = Object.fromEntries(packet.facts.map((fact) => [fact.id, fact]));
  const memories = Object.fromEntries(packet.memories.map((memory) => [memory.id, memory]));
  const obligations = Object.fromEntries(packet.obligations.map((obligation) => [
    obligation.id,
    obligation.debtor.kind === "scout" && obligation.debtor.id === "player-scout"
      ? { ...obligation, debtor: { kind: "scout", id: state.scout.id } }
      : obligation,
  ]));
  let updated: GameState = {
    ...state,
    consequenceState: {
      ...state.consequenceState,
      facts: { ...state.consequenceState.facts, ...facts },
      memories: { ...state.consequenceState.memories, ...memories },
      obligations: { ...state.consequenceState.obligations, ...obligations },
    },
  };
  for (const effect of packet.operationalEffects) {
    updated = applyOperationalEffect(updated, effect, now, sourceDecisionId);
  }
  return updated;
}

/** Reconcile selected/defaulted consequence decisions back into campaign state. */
export function reconcileRivalCampaignDecisions(
  state: GameState,
  now: { season: number; week: number },
): GameState {
  let updated = state;
  const decisions = Object.values(state.consequenceState.decisions)
    .filter((decision) =>
      decision.source.kind === "rivalCampaign"
      && Boolean(decision.selectedOptionId),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const decision of decisions) {
    const campaign = updated.rivalOrganizationState.campaignState.campaigns[decision.source.id];
    if (!campaign || campaign.status !== "active" || campaign.phase !== "response") continue;
    const result = resolveRivalCampaignResponse({
      rootSeed: updated.runManifest.rootSeed,
      state: updated.rivalOrganizationState.campaignState,
      campaignId: campaign.id,
      responseOptionId: decision.selectedOptionId!,
      date: now,
      forcedResolution: decision.selectionKind === "default"
        ? "expired"
        : campaign.responseOptions.find((option) => option.id === decision.selectedOptionId)?.style === "withdraw"
          ? "ignored"
          : undefined,
    });
    if (!result.changed || !result.campaign) continue;
    updated = {
      ...updated,
      rivalOrganizationState: {
        ...updated.rivalOrganizationState,
        campaignState: result.state,
      },
    };
    if (result.provenance) {
      updated = applyRivalCampaignProvenance(updated, result.provenance, now);
    }
    if (result.message) {
      updated = {
        ...updated,
        inbox: appendUniqueMessages(updated.inbox, [{
          ...result.message,
          relatedId: campaign.id,
          relatedEntityType: "narrative",
        }]),
      };
    }
  }
  return updated;
}

function campaignCandidate(
  state: GameState,
  campaign: RivalCampaign,
): PreparedRivalCampaignPresentation {
  const organization = state.rivalOrganizationState.organizations[campaign.organizationId];
  const remainingWeeks = campaign.responseDueAt
    ? Math.max(0, (campaign.responseDueAt.season - state.currentSeason) * 38
      + campaign.responseDueAt.week - state.currentWeek)
    : 2;
  const urgencyMultiplier = remainingWeeks <= 1 ? 1.8 : remainingWeeks <= 2 ? 1.35 : 1;
  return {
    campaign,
    candidate: {
      id: `rival-campaign:${campaign.id}`,
      templateId: `rival-campaign:${campaign.kind}`,
      kind: "rivalCampaign",
      category: "rival-counterplay",
      semanticSignature: `rival-campaign:${campaign.kind}:${campaign.targetKind}`,
      baseWeight: urgencyMultiplier + Math.min(1, (organization?.heat ?? 0) / 100),
      cast: [
        { kind: "rivalOrganization", id: campaign.organizationId },
        { kind: "rivalScout", id: campaign.leadRivalId },
        campaign.target.entity,
      ],
      topics: [campaign.target.entity],
      requiresChoice: true,
      templateCooldownWeeks: 4,
      semanticCooldownWeeks: 5,
      castWindowWeeks: 8,
      castMaxUses: 2,
      topicCooldownWeeks: 3,
      relevanceMultipliers: [urgencyMultiplier],
    },
  };
}

/** Advance persistent rival campaigns without bypassing the shared story gate. */
export function prepareWeeklyRivalCampaigns(input: {
  state: GameState;
  seasonLength: number;
}): PreparedWeeklyRivalCampaigns {
  const now = { season: input.state.currentSeason, week: input.state.currentWeek };
  let state = reconcileRivalCampaignDecisions(input.state, now);
  const globalPressure = getWorldConditionModifiers(state).rivalPressureMultiplier;
  const result = directRivalCampaignWeek({
    rootSeed: state.runManifest.rootSeed,
    season: state.currentSeason,
    week: state.currentWeek,
    seasonLength: input.seasonLength,
    organizationState: state.rivalOrganizationState,
    organizations: state.rivalOrganizationState.organizations,
    rivalScouts: state.rivalScouts,
    directory: buildRivalCampaignDirectory(state),
    state: state.rivalOrganizationState.campaignState,
    maxActiveCampaigns: 4,
    maxWeeklySpawns: 1,
    spawnChanceMultiplier: clamp(0.25 * globalPressure, 0.1, 0.55),
  });
  state = {
    ...state,
    rivalOrganizationState: {
      ...state.rivalOrganizationState,
      campaignState: result.state,
    },
    inbox: appendUniqueMessages(
      state.inbox,
      result.messages.filter((message) => !message.actionRequired),
    ),
  };
  for (const packet of result.provenance) {
    state = applyRivalCampaignProvenance(state, packet, now);
  }

  const historyDecisionIds = new Set(state.consequenceState.history.map((entry) => entry.decisionId));
  const presentations = Object.values(result.state.campaigns)
    .filter((campaign) =>
      campaign.status === "active"
      && campaign.phase === "response"
      && Boolean(campaign.responseDecisionId)
      && !state.consequenceState.decisions[campaign.responseDecisionId!]
      && !historyDecisionIds.has(campaign.responseDecisionId!),
    )
    .map((campaign) => campaignCandidate(state, campaign))
    .sort((left, right) => left.candidate.id.localeCompare(right.candidate.id));
  return {
    state,
    presentations,
    candidates: presentations.map((presentation) => presentation.candidate),
  };
}

function responseMessage(campaign: RivalCampaign, decisionId: string): InboxMessage {
  const signal = campaign.visibleSignals[0];
  return {
    id: `rival-campaign-decision:${decisionId}`,
    week: campaign.phaseStartedAt.week,
    season: campaign.phaseStartedAt.season,
    type: "event",
    title: signal?.headline ?? "A rival move needs your response",
    body: `${signal?.detail ?? "A rival has forced a response."}\n\nChoose how hard to protect the relationship, territory, or pathway before the window closes.`,
    read: false,
    actionRequired: true,
    relatedId: decisionId,
    relatedEntityType: "narrative",
  };
}

/** Materialize only campaign prompts accepted by Story Director V2. */
export function applyDirectedWeeklyRivalCampaigns(input: {
  state: GameState;
  prepared: PreparedWeeklyRivalCampaigns;
  acceptedCandidateIds: ReadonlySet<string>;
}): GameState {
  let state = input.state;
  for (const presentation of input.prepared.presentations) {
    if (!input.acceptedCandidateIds.has(presentation.candidate.id)) continue;
    const campaign = presentation.campaign;
    const decisionId = campaign.responseDecisionId;
    if (!decisionId || state.consequenceState.decisions[decisionId]) continue;
    const withdraw = campaign.responseOptions.find((option) => option.style === "withdraw")
      ?? campaign.responseOptions[0];
    const decision = createDecisionRecord({
      id: decisionId,
      source: { kind: "rivalCampaign", id: campaign.id },
      offeredAt: campaign.phaseStartedAt,
      deadlineAt: campaign.responseDueAt ?? campaign.phaseStartedAt,
      visibility: "stakeholders",
      stakeholders: [
        { kind: "rivalOrganization", id: campaign.organizationId },
        { kind: "rivalScout", id: campaign.leadRivalId },
        campaign.target.entity,
      ],
      options: campaign.responseOptions.map((option) => ({
        id: option.id,
        label: option.label,
        knownTradeoffs: [...option.knownTradeoffs],
        immediateEffects: [],
        scheduledConsequences: [],
      })),
      defaultOptionId: withdraw?.id,
      outcomeRoll: campaign.outcomeRoll,
      metadata: {
        title: campaign.visibleSignals[0]?.headline ?? "Rival counter-move",
        premise: campaign.visibleSignals[0]?.detail ?? "A rival campaign needs a response.",
        campaignId: campaign.id,
        campaignKind: campaign.kind,
        targetKind: campaign.targetKind,
        targetLabel: campaign.target.label,
      },
    });
    const registered = registerDecision(state.consequenceState, decision);
    if (registered.error || !registered.changed) continue;
    state = {
      ...state,
      consequenceState: registered.state,
      inbox: appendUniqueMessages(state.inbox, [responseMessage(campaign, decisionId)]),
    };
  }
  return state;
}
