/**
 * Career progression, inbox, gossip, NPC management, travel, and
 * narrative event actions extracted from gameStore.
 *
 * Handles job acceptance/decline, inbox management, gossip actions,
 * NPC scout territory assignment, manager/board meetings,
 * specialization unlocks, international travel, and narrative events.
 */
import type { GetState, SetState } from "./types";
import { clearTerminalNarrativeInboxActions } from "./narrativeInboxState";
import type {
  GameState,
  InboxMessage,
  Specialization,
  ActionableGossipItem,
  GossipAction,
  ChainConsequence,
  Activity,
  BoardMeetingApproach,
  ManagerMeetingApproach,
  TravelPosture,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  assignTerritory,
  canUnlockSecondarySpec,
  unlockSecondarySpecialization,
  conductBoardMeeting,
  conductManagerMeeting,
  canAcceptJobOffer,
} from "@/engine/career/index";
import {
  applyCareerPathTransition,
  applyClubEmploymentTransition,
} from "@/engine/career/transitions";
import {
  chooseCareerRecoveryPlan,
  isCareerRecoveryBlockingOffers,
  type CareerRecoveryPlanId,
} from "@/engine/career/recovery";
import {
  calculateSigningBonus,
  getActiveEquipmentBonuses,
  applyBalanceTransaction,
} from "@/engine/finance";
import {
  bookTravel,
  getTravelDuration,
  getScoutHomeCountry as getScoutHome,
  isInternationalAssignmentEligibleCountry,
  isTravelEligibleCountry,
  getRegionalTravelQuote,
  createWorldConditionArcState,
  reconcileWorldConditionArcDecisions,
} from "@/engine/world/index";
import {
  addActivity,
  canScheduleActivity,
} from "@/engine/core/calendar";
import { getSeasonLength } from "@/engine/core/gameLoop";
import {
  resolveEventChoice,
  acknowledgeEvent,
  computeChainChoiceEffects,
  resolveChainChoice,
  resolveStorylineChoice,
} from "@/engine/events";
import {
  appendDecisionConsequence,
  narrativeDecisionId,
  processDueConsequences,
  projectConsequenceMetrics,
  selectDecisionOption,
  selectNarrativeDecision,
  synchronizeConsequenceMetrics,
  type ConsequenceEffect,
} from "@/engine/consequences";
import {
  resolvePoachCounterBid,
  isNemesis,
  resolveRivalOrganizationOpportunity as resolveRivalOrganizationOpportunityEngine,
} from "@/engine/rivals";
import {
  getLifecycleWorld,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import {
  applyGossipAction,
  getActionableGossipItems,
} from "@/engine/network/gossip";
import {
  activateInternationalAssignment,
  ensureInternationalAssignmentLiaison,
} from "@/engine/world/internationalDeliverables";
import { normalizeCountryKey } from "@/lib/country";

function consequenceFailureMessages(
  state: GameState,
  contextId: string,
  errors: readonly string[],
): InboxMessage[] {
  return errors.map((error, index) => ({
    id: `consequence-warning:${contextId}:s${state.currentSeason}w${state.currentWeek}:${index}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "warning" as const,
    title: "A linked consequence could not be applied",
    body: `Your decision was recorded. One unrelated or invalid follow-up was safely closed instead of blocking the choice. ${error}`,
    read: false,
    actionRequired: false,
    relatedId: contextId,
  }));
}

/**
 * Apply ChainConsequence[] to a GameState, returning a new GameState.
 * Pure helper for A5 chain consequence system.
 */
export function applyConsequences(state: GameState, consequences: ChainConsequence[]): GameState {
  let updated = state;
  for (const c of consequences) {
    switch (c.type) {
      case "reputation":
        updated = {
          ...updated,
          scout: {
            ...updated.scout,
            reputation: Math.min(100, Math.max(0, updated.scout.reputation + c.value)),
          },
        };
        break;
      case "clubTrust":
        updated = {
          ...updated,
          scout: {
            ...updated.scout,
            clubTrust: Math.min(100, Math.max(0, updated.scout.clubTrust + c.value)),
          },
        };
        break;
      case "budget": {
        if (updated.finances) {
          updated = {
            ...updated,
            finances: applyBalanceTransaction(
              updated.finances,
              c.value,
              updated.currentWeek,
              updated.currentSeason,
              "Narrative event financial consequence",
            ),
          };
        }
        break;
      }
      case "form": {
        if (c.targetId && updated.players[c.targetId]) {
          const player = updated.players[c.targetId];
          updated = {
            ...updated,
            players: {
              ...updated.players,
              [c.targetId]: {
                ...player,
                form: Math.min(3, Math.max(-3, player.form + c.value)),
              },
            },
          };
        }
        break;
      }
      case "playerValue": {
        if (c.targetId && updated.players[c.targetId]) {
          const player = updated.players[c.targetId];
          const multiplier = 1 + c.value / 100;
          updated = {
            ...updated,
            players: {
              ...updated.players,
              [c.targetId]: {
                ...player,
                marketValue: Math.round(player.marketValue * multiplier),
              },
            },
          };
        }
        break;
      }
      case "contactRelationship": {
        if (c.targetId && updated.contacts[c.targetId]) {
          const contact = updated.contacts[c.targetId];
          updated = {
            ...updated,
            contacts: {
              ...updated.contacts,
              [c.targetId]: {
                ...contact,
                relationship: Math.min(100, Math.max(0, contact.relationship + c.value)),
              },
            },
          };
        }
        break;
      }
    }
  }
  return updated;
}

/**
 * Project network choices into the real contact model and the causal ledger.
 * These events previously changed only prose/global reputation, so confronting
 * a betrayer and rewarding an exclusive source led to the same future network.
 */
export function applyNarrativeRelationshipChoice(
  state: GameState,
  event: GameState["narrativeEvents"][number],
  choiceIndex: number,
): GameState {
  const effectTag = event.choices?.[choiceIndex]?.effect;
  if (!effectTag) return state;
  const contactId = event.relatedIds.find((id) => state.contacts[id]);
  if (!contactId) return state;
  const contact = state.contacts[contactId];

  let relationshipDelta = 0;
  let trustDelta = 0;
  let loyaltyDelta = 0;
  let memoryTags: string[] | undefined;
  let memoryValence = 0;
  let memoryIntensity = 0;
  let memoryVisibility: "private" | "stakeholders" = "stakeholders";
  let createsConfidentiality = false;
  let obligationResolution: "fulfilled" | "breached" | undefined;

  switch (effectTag) {
    case "betrayalConfront":
      relationshipDelta = -contact.relationship;
      trustDelta = -(contact.trustLevel ?? contact.relationship);
      loyaltyDelta = -20;
      memoryTags = ["betrayal", "confronted", "dishonest"];
      memoryValence = -70;
      memoryIntensity = 90;
      break;
    case "betrayalMonitor":
      relationshipDelta = -5;
      trustDelta = -15;
      loyaltyDelta = -10;
      memoryTags = ["betrayal", "watched", "discreet"];
      memoryValence = -20;
      memoryIntensity = 75;
      memoryVisibility = "private";
      break;
    case "accessAttend":
      relationshipDelta = 5;
      trustDelta = 8;
      memoryTags = ["exclusiveAccess", "reciprocity", "confidentiality"];
      memoryValence = 35;
      memoryIntensity = 65;
      createsConfidentiality = true;
      break;
    case "accessPass":
      relationshipDelta = -2;
      memoryTags = ["exclusiveAccess", "declined"];
      memoryValence = -5;
      memoryIntensity = 25;
      break;
    case "doubleDealExpose":
      relationshipDelta = -20;
      trustDelta = -30;
      loyaltyDelta = -20;
      memoryTags = ["exposedMisconduct", "integrityConflict"];
      memoryValence = -75;
      memoryIntensity = 90;
      break;
    case "doubleDealLeverage":
      trustDelta = -5;
      loyaltyDelta = -5;
      memoryTags = ["mutualComplicity", "selfInterested"];
      memoryValence = 10;
      memoryIntensity = 60;
      memoryVisibility = "private";
      break;
    case "confidentialityKeep":
      relationshipDelta = 4;
      trustDelta = 10;
      loyaltyDelta = 5;
      memoryTags = ["promiseKept", "confidentiality", "trustedUnderPressure"];
      memoryValence = 50;
      memoryIntensity = 80;
      obligationResolution = "fulfilled";
      break;
    case "confidentialityLeak":
      relationshipDelta = -30;
      trustDelta = -40;
      loyaltyDelta = -25;
      memoryTags = ["promiseBroken", "confidentiality", "informationLeak"];
      memoryValence = -90;
      memoryIntensity = 95;
      obligationResolution = "breached";
      break;
    default:
      return state;
  }

  const decisionId = narrativeDecisionId(event.id);
  const now = { week: state.currentWeek, season: state.currentSeason };
  const relationshipKey = `contact:${contactId}:relationship`;
  const trustKey = `contact:${contactId}:trust`;
  const loyaltyKey = `contact:${contactId}:loyalty`;
  const seededMetrics = {
    ...state.consequenceState.metrics,
    [relationshipKey]: contact.relationship,
    [trustKey]: contact.trustLevel ?? contact.relationship,
    [loyaltyKey]: contact.loyalty ?? 50,
  };
  const baseId = `effect:${decisionId}:relationship`;
  const effects: ConsequenceEffect[] = [
    {
      id: `${baseId}:relationship`,
      type: "adjustMetric",
      metricKey: relationshipKey,
      delta: relationshipDelta,
      min: 0,
      max: 100,
    },
    {
      id: `${baseId}:trust`,
      type: "adjustMetric",
      metricKey: trustKey,
      delta: trustDelta,
      min: 0,
      max: 100,
    },
    {
      id: `${baseId}:loyalty`,
      type: "adjustMetric",
      metricKey: loyaltyKey,
      delta: loyaltyDelta,
      min: 0,
      max: 100,
    },
  ];

  if (memoryTags) {
    effects.push({
      id: `${baseId}:memory`,
      type: "addMemory",
      memory: {
        id: `memory:${decisionId}:${contactId}`,
        stakeholder: { kind: "contact", id: contactId },
        subject: { kind: "scout", id: state.scout.id },
        tags: memoryTags,
        valence: memoryValence,
        intensity: memoryIntensity,
        salience: Math.min(100, memoryIntensity + 10),
        visibility: memoryVisibility,
        createdAt: now,
        sourceDecisionId: decisionId,
        // Strong breaches linger longer, but no relationship episode is an
        // eternal hidden modifier. The policy decays this deterministically.
        halfLifeWeeks: memoryIntensity >= 80 ? 104 : 76,
      },
    });
  }

  if (createsConfidentiality) {
    const existingConfidentiality = Object.values(state.consequenceState.obligations).find(
      (obligation) =>
        obligation.status === "active"
        && obligation.kind === "confidentiality"
        && obligation.debtor.kind === "scout"
        && obligation.debtor.id === state.scout.id
        && obligation.creditor.kind === "contact"
        && obligation.creditor.id === contactId,
    );
    if (!existingConfidentiality) {
      effects.push({
        id: `${baseId}:obligation`,
        type: "createObligation",
        obligation: {
          id: `obligation:${decisionId}:confidentiality`,
          debtor: { kind: "scout", id: state.scout.id },
          creditor: { kind: "contact", id: contactId },
          kind: "confidentiality",
          terms: `Keep ${contact.name}'s exclusive access confidential.`,
          status: "active",
          createdAt: now,
          sourceDecisionId: decisionId,
        },
      });
    }
  }

  if (obligationResolution) {
    const obligation = event.relatedIds
      .map((id) => state.consequenceState.obligations[id])
      .find((candidate) =>
        candidate?.status === "active"
        && candidate.kind === "confidentiality"
        && candidate.creditor.id === contactId,
      ) ?? Object.values(state.consequenceState.obligations).find((candidate) =>
        candidate.status === "active"
        && candidate.kind === "confidentiality"
        && candidate.creditor.id === contactId,
      );
    if (obligation) {
      effects.push({
        id: `${baseId}:obligation-${obligationResolution}`,
        type: "transitionObligation",
        obligationId: obligation.id,
        status: obligationResolution,
        note: obligationResolution === "fulfilled"
          ? "The scout refused to disclose the confidential access."
          : "The scout disclosed information obtained under confidence.",
      });
    }
  }

  const appended = appendDecisionConsequence(
    { ...state.consequenceState, metrics: seededMetrics },
    decisionId,
    `relationship-${effectTag}`,
    effects,
    now,
    { tags: ["relationship", event.type, effectTag] },
  );
  if (appended.error) return state;
  const processed = processDueConsequences(
    appended.state,
    now,
    getSeasonLength(state.fixtures),
  );

  const relationship = Math.round(processed.state.metrics[relationshipKey]);
  const trustLevel = Math.round(processed.state.metrics[trustKey]);
  const loyalty = Math.round(processed.state.metrics[loyaltyKey]);
  return {
    ...state,
    consequenceState: processed.state,
    contacts: {
      ...state.contacts,
      [contactId]: {
        ...contact,
        relationship,
        trustLevel,
        loyalty,
        dormant: relationship <= 20,
      },
    },
    inbox: [
      ...state.inbox,
      ...consequenceFailureMessages(state, decisionId, processed.errors),
    ],
  };
}

/**
 * Project the non-financial rival state for conceding a poach bid. The timeout
 * adapter reuses this path so letting the deadline pass cannot avoid the loss
 * that an explicit Concede choice records.
 */
export function applyRivalPoachBidConcession(
  state: GameState,
  event: GameState["narrativeEvents"][number],
  choiceIndex: number,
): GameState {
  if (event.type !== "rivalPoachBid" || event.choices?.[choiceIndex]?.effect !== "concede") {
    return state;
  }
  const playerId = event.relatedIds[0];
  const rivalId = event.relatedIds[1];
  const rival = rivalId ? state.rivalScouts[rivalId] : undefined;
  const player = playerId ? state.players[playerId] : undefined;
  if (!rival || !player) return state;

  const updatedRival = {
    ...rival,
    winsAgainstPlayer: (rival.winsAgainstPlayer ?? 0) + 1,
    lossesToPlayer: rival.lossesToPlayer ?? 0,
  };
  const becomesNemesis = isNemesis(updatedRival);
  return {
    ...state,
    rivalScouts: {
      ...state.rivalScouts,
      [rivalId]: updatedRival,
    },
    inbox: becomesNemesis
      ? [
          ...state.inbox,
          {
            id: `nemesis-${rivalId}-s${state.currentSeason}w${state.currentWeek}`,
            week: state.currentWeek,
            season: state.currentSeason,
            type: "event",
            title: `Nemesis: ${rival.name}`,
            body: `You've lost ${updatedRival.winsAgainstPlayer} players to ${rival.name}. They're becoming your nemesis.`,
            read: false,
            actionRequired: false,
          },
        ]
      : state.inbox,
  };
}

export function createProgressionActions(get: GetState, set: SetState) {
  return {
    resolveRivalOrganizationOpportunity: (
      opportunityId: string,
      response: "exploit" | "decline",
    ) => {
      const gameState = get().gameState;
      if (!gameState) return;
      const result = resolveRivalOrganizationOpportunityEngine(
        gameState.rivalOrganizationState,
        opportunityId,
        response,
        { season: gameState.currentSeason, week: gameState.currentWeek },
      );
      if (!result.changed || result.error) return;
      set({
        gameState: {
          ...gameState,
          rivalOrganizationState: result.state,
          scout: {
            ...gameState.scout,
            reputation: Math.max(
              0,
              Math.min(100, gameState.scout.reputation + result.reputationDelta),
            ),
            fatigue: Math.max(
              0,
              Math.min(100, gameState.scout.fatigue + result.fatigueDelta),
            ),
          },
          consequenceState: result.fact
            ? {
              ...gameState.consequenceState,
              facts: {
                ...gameState.consequenceState.facts,
                [result.fact.id]: result.fact,
              },
            }
            : gameState.consequenceState,
          inbox: result.message
            ? [...gameState.inbox, result.message]
            : gameState.inbox,
        },
      });
    },
    // ── Career ────────────────────────────────────────────────────────────────

    chooseCareerRecovery: (planId: CareerRecoveryPlanId) => {
      const { gameState } = get();
      if (!gameState) return;
      const result = chooseCareerRecoveryPlan(gameState, planId);
      if (result.accepted) {
        set({ gameState: result.state });
        return;
      }
      set({
        gameState: {
          ...gameState,
          inbox: [
            ...gameState.inbox,
            {
              id: `career-recovery-rejected:s${gameState.currentSeason}w${gameState.currentWeek}:${planId}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "feedback",
              title: "Recovery route unavailable",
              body: result.reason ?? "That recovery route can no longer be selected.",
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },

    acceptJob: (offerId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      if (isCareerRecoveryBlockingOffers(gameState)) return;
      const offer = gameState.jobOffers.find((o) => o.id === offerId);
      if (!offer) return;
      if (!canAcceptJobOffer(offer, gameState.currentWeek, gameState.currentSeason)) {
        set({
          gameState: {
            ...gameState,
            jobOffers: gameState.jobOffers.filter((candidate) => candidate.id !== offerId),
            inbox: [
              ...gameState.inbox.map((message) =>
                message.relatedId === offerId
                  ? { ...message, read: true, actionRequired: false }
                  : message,
              ),
              {
                id: `job-expired-${offerId}`,
                week: gameState.currentWeek,
                season: gameState.currentSeason,
                type: "feedback" as const,
                title: "Job Offer Expired",
                body: "The club has filled the role. This offer can no longer be accepted.",
                read: false,
                actionRequired: false,
              },
            ],
          },
        });
        return;
      }

      const transitionedState = applyClubEmploymentTransition(gameState, offer);
      const updatedScout = transitionedState.scout;
      let updatedFinances = transitionedState.finances;

      // W3d: Signing bonus for tier 3+ club-path scouts
      const signingBonusMessages: InboxMessage[] = [];
      if (updatedFinances) {
        const signingBonus = calculateSigningBonus(offer);
        if (signingBonus > 0) {
          updatedFinances = {
            ...updatedFinances,
            balance: updatedFinances.balance + signingBonus,
            bonusRevenue: updatedFinances.bonusRevenue + signingBonus,
            transactions: [
              ...updatedFinances.transactions,
              {
                week: gameState.currentWeek,
                season: gameState.currentSeason,
                amount: signingBonus,
                description: `Signing bonus (${offer.role})`,
                referenceId: `scout-signing-bonus:${offer.id}`,
                category: "bonus",
                counterpartyId: offer.clubId,
              },
            ],
          };
          signingBonusMessages.push({
            id: `signing-bonus-${offerId}`,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
            type: "event" as const,
            title: "Signing Bonus",
            body: `You've received a £${signingBonus.toLocaleString()} signing bonus for joining ${gameState.clubs[offer.clubId]?.name}.`,
            read: false,
            actionRequired: false,
          });
        }
      }

      set({
        gameState: {
          ...transitionedState,
          scout: updatedScout,
          finances: updatedFinances,
          inbox: [
            ...transitionedState.inbox,
            {
              id: `job-accepted-${offerId}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "event",
              title: "Contract Signed",
              body: `You've joined ${gameState.clubs[offer.clubId]?.name} as ${offer.role}. Your reputation in the scouting world grows.`,
              read: false,
              actionRequired: false,
            },
            ...signingBonusMessages,
          ],
        },
      });
    },

    declineJob: (offerId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const declinedOffer = gameState.jobOffers.find((offer) => offer.id === offerId);
      const endsCurrentEmployment = Boolean(
        declinedOffer?.renewalOfContractId
        && declinedOffer.clubId === gameState.scout.currentClubId
        && (gameState.scout.contractEndSeason ?? Number.POSITIVE_INFINITY)
          <= gameState.currentSeason
        && gameState.finances
      );
      const withoutOffer = {
        ...gameState,
        jobOffers: gameState.jobOffers.filter((offer) => offer.id !== offerId),
        inbox: gameState.inbox.map((message) =>
          message.relatedId === offerId
            ? { ...message, read: true, actionRequired: false }
            : message,
        ),
      };
      set({
        gameState: endsCurrentEmployment
          ? applyCareerPathTransition(withoutOffer, "independent")
          : withoutOffer,
      });
    },

    // ── Inbox ─────────────────────────────────────────────────────────────────

    markMessageRead: (messageId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      set({
        gameState: {
          ...gameState,
          inbox: gameState.inbox.map((m) =>
            m.id === messageId ? { ...m, read: true } : m
          ),
        },
      });
    },

    markAllRead: () => {
      const { gameState } = get();
      if (!gameState) return;
      set({
        gameState: {
          ...gameState,
          inbox: gameState.inbox.map((m) => ({ ...m, read: true })),
        },
      });
    },

    // ── Gossip (A3) ───────────────────────────────────────────────────────────

    handleGossipAction: (gossipId: string, action: GossipAction) => {
      const { gameState } = get();
      if (!gameState) return;
      const result = applyGossipAction(gameState.contacts, gossipId, action);
      if (!result) return;

      // If the scout chose to "act on" the gossip, add the subject to the watchlist
      let updatedWatchlist = gameState.watchlist;
      if (
        action === "actOn"
        && result.item.playerId
        && !gameState.watchlist.includes(result.item.playerId)
      ) {
        updatedWatchlist = [...gameState.watchlist, result.item.playerId];
      }

      set({
        gameState: {
          ...gameState,
          contacts: result.updatedContacts,
          watchlist: updatedWatchlist,
        },
      });
    },

    getActiveGossip: (): ActionableGossipItem[] => {
      const { gameState } = get();
      if (!gameState) return [];
      return getActionableGossipItems(gameState.contacts).filter(
        (gossip) => !gossip.dismissed && !gossip.actionTaken,
      );
    },

    // ── NPC Scout Management ──────────────────────────────────────────────────

    assignNPCScoutTerritory: (npcScoutId: string, territoryId: string) => {
      const { gameState } = get();
      if (!gameState) return;

      const npcScout = gameState.npcScouts[npcScoutId];
      const territory = gameState.territories[territoryId];
      if (!npcScout || !territory) return;

      // If the scout was previously assigned elsewhere, remove them from that territory
      let updatedTerritories = { ...gameState.territories };
      if (npcScout.territoryId && npcScout.territoryId !== territoryId) {
        const previousTerritory = updatedTerritories[npcScout.territoryId];
        if (previousTerritory) {
          updatedTerritories[npcScout.territoryId] = {
            ...previousTerritory,
            assignedScoutIds: previousTerritory.assignedScoutIds.filter(
              (id) => id !== npcScoutId,
            ),
          };
        }
      }

      const { npcScout: updatedNpcScout, territory: updatedTerritory } = assignTerritory(
        npcScout,
        territory,
      );

      updatedTerritories[territoryId] = updatedTerritory;

      set({
        gameState: {
          ...gameState,
          npcScouts: { ...gameState.npcScouts, [npcScoutId]: updatedNpcScout },
          territories: updatedTerritories,
        },
      });
    },

    reviewNPCReport: (reportId: string) => {
      const { gameState } = get();
      if (!gameState) return;

      const report = gameState.npcReports[reportId];
      if (!report) return;

      set({
        gameState: {
          ...gameState,
          npcReports: {
            ...gameState.npcReports,
            [reportId]: { ...report, reviewed: true },
          },
        },
      });
    },

    // ── Career Management ─────────────────────────────────────────────────────

    meetManager: (approach: ManagerMeetingApproach) => {
      const { gameState } = get();
      if (!gameState) return;
      const result = conductManagerMeeting(gameState, approach);
      if (result.executed) set({ gameState: result.state });
    },

    meetBoard: (approach: BoardMeetingApproach) => {
      const { gameState } = get();
      if (!gameState) return;
      const result = conductBoardMeeting(gameState, approach);
      if (result.executed) set({ gameState: result.state });
    },

    unlockSecondarySpecialization: (spec: Specialization) => {
      const { gameState } = get();
      if (!gameState) return;

      if (!canUnlockSecondarySpec(gameState.scout)) return;

      const updatedScout = unlockSecondarySpecialization(gameState.scout, spec);

      set({
        gameState: {
          ...gameState,
          scout: updatedScout,
        },
      });
    },

    // ── Travel ────────────────────────────────────────────────────────────────

    bookInternationalTravel: (
      country: string,
      options?: { duration?: number; assignmentId?: string; posture?: TravelPosture },
    ) => {
      const { gameState } = get();
      if (!gameState) return false;
      if (gameState.scout.travelBooking) return false;
      // A country name in a static catalogue or stale legacy save is not
      // enough: travel is permitted only when the current world actually
      // contains a usable generated destination.
      if (!isTravelEligibleCountry(gameState, country)) return false;

      const homeCountry = getScoutHome(gameState.scout);
      const posture = options?.posture ?? "assignmentFirst";
      const regionalQuote = getRegionalTravelQuote(gameState, country, posture);
      const duration = Math.max(
        1,
        options?.duration ?? regionalQuote.duration ?? getTravelDuration(homeCountry, country),
      );
      const departureWeek = gameState.currentWeek + 1;

      const equipmentBonuses = gameState.finances?.equipment
        ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
        : undefined;
      const travelSlots = Math.max(
        1,
        regionalQuote.slots
          - (equipmentBonuses?.travelSlotReduction ?? 0),
      );
      const travelActivity: Activity = {
        type: "internationalTravel",
        slots: travelSlots,
        targetId: country,
        description: `Travel to ${country}`,
      };
      const travelStartIndex = gameState.schedule.activities.findIndex((_, dayIndex) =>
        canScheduleActivity(
          gameState.schedule,
          travelActivity,
          dayIndex,
          gameState.scout,
        ),
      );
      if (travelStartIndex < 0) return false;
      const updatedSchedule = addActivity(
        gameState.schedule,
        travelActivity,
        travelStartIndex,
      );

      const quotedTravelCost = Math.round(
        regionalQuote.cost * (1 - (equipmentBonuses?.travelCostReduction ?? 0)),
      );
      const updatedScout = bookTravel(
        gameState.scout,
        country,
        departureWeek,
        duration,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
        quotedTravelCost,
        posture,
      );
      const travelCost = updatedScout.travelBooking?.cost ?? 0;
      if ((gameState.finances?.balance ?? Infinity) < travelCost) return false;

      const acceptedAssignment = options?.assignmentId
        ? gameState.internationalAssignments.find(
            (assignment) => assignment.id === options.assignmentId,
          ) ?? null
        : null;
      if (
        options?.assignmentId
        && (
          !acceptedAssignment
          || !isInternationalAssignmentEligibleCountry(gameState, acceptedAssignment.country)
          || normalizeCountryKey(acceptedAssignment.country) !== normalizeCountryKey(country)
        )
      ) {
        return false;
      }
      const activatedAssignment = acceptedAssignment
        ? activateInternationalAssignment(
            acceptedAssignment,
            gameState.currentWeek,
            gameState.currentSeason,
          )
        : null;

      set({
        gameState: {
          ...gameState,
          scout: updatedScout,
          schedule: updatedSchedule,
          finances: gameState.finances
            ? {
                ...gameState.finances,
                balance: gameState.finances.balance - travelCost,
                transactions: [
                  ...gameState.finances.transactions,
                  {
                    week: gameState.currentWeek,
                    season: gameState.currentSeason,
                    amount: -travelCost,
                    description: acceptedAssignment
                      ? `Accepted international assignment in ${country}`
                      : `International travel to ${country}`,
                  },
                ],
              }
            : gameState.finances,
          internationalAssignments: acceptedAssignment
            ? gameState.internationalAssignments.filter(
                (assignment) => assignment.id !== acceptedAssignment.id,
              )
            : gameState.internationalAssignments,
          activeInternationalAssignment: activatedAssignment,
          contacts: activatedAssignment
            ? ensureInternationalAssignmentLiaison(gameState.contacts, activatedAssignment)
            : gameState.contacts,
        },
        weekSimulation: null,
      });
      return true;
    },

    // ── Phase 2 Actions (Narrative Events) ────────────────────────────────────

    acknowledgeNarrativeEvent: (eventId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const event = gameState.narrativeEvents.find((e) => e.id === eventId);
      const updatedEvents = acknowledgeEvent(gameState.narrativeEvents, eventId);
      // A5: Apply consequences if the event has them and no choices (auto-apply on acknowledge)
      let updatedState: GameState = {
        ...gameState,
        narrativeEvents: updatedEvents,
        inbox: clearTerminalNarrativeInboxActions(
          gameState.inbox,
          updatedEvents,
        ),
      };
      if (event?.consequences && event.consequences.length > 0 && (!event.choices || event.choices.length === 0)) {
        updatedState = applyConsequences(updatedState, event.consequences);
      }
      set({ gameState: updatedState });
    },

    resolveConsequenceDecision: (decisionId: string, optionId: string) => {
      const gameState = get().gameState;
      const decision = gameState?.consequenceState.decisions[decisionId];
      if (!gameState || !decision || decision.status !== "offered") return;
      if (!decision.options.some((option) => option.id === optionId)) return;

      const now = { week: gameState.currentWeek, season: gameState.currentSeason };
      const seasonLength = getSeasonLength(gameState.fixtures, gameState.currentSeason);
      const synchronized = synchronizeConsequenceMetrics(
        gameState,
        gameState.consequenceState,
      );
      const selected = selectDecisionOption(
        synchronized,
        decisionId,
        optionId,
        now,
        "player",
        seasonLength,
      );
      if (selected.error || !selected.changed) return;
      const processed = processDueConsequences(selected.state, now, seasonLength);

      let projected = projectConsequenceMetrics(
        { ...gameState, consequenceState: processed.state },
        processed.state,
      );
      if (decision.source.kind === "worldConditionArc") {
        projected = {
          ...projected,
          worldConditionArcState: reconcileWorldConditionArcDecisions({
            state: createWorldConditionArcState(
              projected.worldConditionArcState,
              projected.countries,
            ),
            decisions: processed.state.decisions,
            now,
            seasonLength,
          }),
        };
      }
      set({
        gameState: {
          ...projected,
          inbox: projected.inbox.map((message) =>
            message.relatedId === decisionId
              ? { ...message, read: true, actionRequired: false }
              : message,
          ).concat(consequenceFailureMessages(projected, decisionId, processed.errors)),
        },
      });
    },

    resolveNarrativeEventChoice: (eventId: string, choiceIndex: number) => {
      const currentState = get().gameState;
      if (!currentState) return;

      const event = currentState.narrativeEvents.find((e) => e.id === eventId);
      if (!event || event.selectedChoice !== undefined) return;

      const decisionSelection = selectNarrativeDecision(
        currentState,
        event,
        choiceIndex,
      );
      if (decisionSelection.error) return;
      const gameState = decisionSelection.state;

      const resolveRng = createRNG(
        `${gameState.seed}-event-resolve-${eventId}-${choiceIndex}`,
      );

      // Storyline choices must update the persisted storyline context before
      // later stages are generated. Previously they passed through the generic
      // event resolver only, so every later beat followed its default branch.
      let storylineRepChange = 0;
      let storylineFatigueChange = 0;
      let storylineMessage: InboxMessage | undefined;
      let updatedStorylines = gameState.activeStorylines;
      if (event.storylineId) {
        const storyline = updatedStorylines.find((item) => item.id === event.storylineId);
        if (storyline) {
          const storylineResult = resolveStorylineChoice(
            storyline,
            event.storylineStage ?? Math.max(0, storyline.currentStage - 1),
            choiceIndex,
            resolveRng,
            event.id,
          );
          storylineRepChange = storylineResult.reputationChange;
          storylineFatigueChange = storylineResult.fatigueChange;
          updatedStorylines = updatedStorylines.map((item) =>
            item.id === storyline.id ? storylineResult.storyline : item,
          );
          if (storylineResult.message) {
            storylineMessage = {
              id: `storyline-choice-${event.id}-${choiceIndex}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "feedback",
              title: `${storyline.name}: Decision Recorded`,
              body: storylineResult.message,
              read: false,
              actionRequired: false,
              relatedId: event.id,
              relatedEntityType: "narrative",
            };
          }
        }
      }

      // F2: If event is part of a chain, record choice and compute chain effects
      let chainRepChange = 0;
      let chainFatigueChange = 0;
      let updatedChains = gameState.eventChains ?? [];
      if (event.chainId) {
        const chain = updatedChains.find((c) => c.id === event.chainId);
        if (chain) {
          const choiceStepIndex = event.chainStep !== undefined
            ? Math.max(0, event.chainStep - 1)
            : undefined;
          const effects = computeChainChoiceEffects(
            chain,
            choiceIndex,
            resolveRng,
            choiceStepIndex,
          );
          chainRepChange = effects.reputationChange;
          chainFatigueChange = effects.fatigueChange;
          const resolvedChain = resolveChainChoice(
            chain,
            event.id,
            choiceIndex,
            choiceStepIndex,
          );
          updatedChains = updatedChains.map((c) =>
            c.id === chain.id ? resolvedChain : c,
          );
        }
      }

      let result;
      try {
        result = resolveEventChoice(event, choiceIndex, gameState, resolveRng);
      } catch {
        // Out-of-bounds choice index or event with no choices — do nothing
        return;
      }

      const updatedEvents = gameState.narrativeEvents.map((e) =>
        e.id === eventId ? result.updatedEvent : e,
      );

      const totalRepChange = (event.storylineId
        ? storylineRepChange
        : result.reputationChange) + chainRepChange;
      const totalFatigueChange = (event.storylineId
        ? storylineFatigueChange
        : result.fatigueChange) + chainFatigueChange;

      const reputationMetric = "scout:reputation";
      const fatigueMetric = "scout:fatigue";
      const consequenceDate = {
        week: gameState.currentWeek,
        season: gameState.currentSeason,
      };
      const causalBase = {
        ...gameState.consequenceState,
        metrics: {
          ...gameState.consequenceState.metrics,
          [reputationMetric]: gameState.scout.reputation,
          [fatigueMetric]: gameState.scout.fatigue,
        },
      };
      const appendedOutcome = appendDecisionConsequence(
        causalBase,
        decisionSelection.decisionId,
        "narrative-core-outcome",
        [
          {
            id: `effect:${decisionSelection.decisionId}:reputation`,
            type: "adjustMetric",
            metricKey: reputationMetric,
            delta: totalRepChange,
            min: 0,
            max: 100,
          },
          {
            id: `effect:${decisionSelection.decisionId}:fatigue`,
            type: "adjustMetric",
            metricKey: fatigueMetric,
            delta: totalFatigueChange,
            min: 0,
            max: 100,
          },
        ],
        consequenceDate,
        { tags: ["narrative", event.type, "immediate"] },
      );
      if (appendedOutcome.error) return;
      const processedOutcome = processDueConsequences(
        appendedOutcome.state,
        consequenceDate,
        getSeasonLength(gameState.fixtures),
      );

      const newReputation = Math.round(
        processedOutcome.state.metrics[reputationMetric],
      );
      const newFatigue = Math.round(
        processedOutcome.state.metrics[fatigueMetric],
      );

      let finalState: GameState = {
        ...gameState,
        consequenceState: processedOutcome.state,
        narrativeEvents: updatedEvents,
        eventChains: updatedChains,
        activeStorylines: updatedStorylines,
        scout: {
          ...gameState.scout,
          reputation: newReputation,
          fatigue: newFatigue,
        },
        inbox: [
          ...gameState.inbox,
          ...(storylineMessage ? [storylineMessage] : result.messages),
          ...consequenceFailureMessages(
            gameState,
            decisionSelection.decisionId,
            processedOutcome.errors,
          ),
        ],
      };
      // A5: Apply consequences if the resolved event has them
      const resolvedEvent = finalState.narrativeEvents.find((e) => e.id === eventId);
      if (resolvedEvent?.consequences && resolvedEvent.consequences.length > 0) {
        finalState = applyConsequences(finalState, resolvedEvent.consequences);
      }

      // ── Special handling for rivalPoachBid events ────────────────────────
      if (event.type === "rivalPoachBid" && event.relatedIds && event.relatedIds.length >= 2) {
        const playerId = event.relatedIds[0];
        const rivalId = event.relatedIds[1];
        const rival = finalState.rivalScouts[rivalId];
        const player = finalState.players[playerId];
        const choice = event.choices?.[choiceIndex];

        if (rival && player && choice) {
          const updatedRivals = { ...finalState.rivalScouts };

          if (choice.effect === "counterBid") {
            const bidRng = createRNG(
              `${gameState.seed}-poach-bid-${eventId}-${choiceIndex}`,
            );
            const bidResult = resolvePoachCounterBid(
              bidRng,
              rival,
              player,
              finalState.scout,
              getLifecycleWorld(finalState),
              finalState.currentWeek,
              finalState.currentSeason,
            );

            updatedRivals[rivalId] = bidResult.updatedRival;
            const bidRep = Math.min(
              100,
              Math.max(0, finalState.scout.reputation + bidResult.reputationChange),
            );

            const outcomeMessage: InboxMessage = {
              id: `poach-bid-result-${eventId}`,
              week: finalState.currentWeek,
              season: finalState.currentSeason,
              type: "event" as const,
              title: bidResult.success
                ? `Counter-Bid Successful: ${player.firstName} ${player.lastName}`
                : bidResult.attempted
                  ? `Counter-Bid Failed: ${player.firstName} ${player.lastName}`
                  : `Counter-Bid Unavailable: ${player.firstName} ${player.lastName}`,
              body: bidResult.success
                ? `Your counter-bid of ${bidResult.cost.toLocaleString()} succeeded! ` +
                  `${player.firstName} ${player.lastName} has joined your club through a completed transfer. ` +
                  `Your decisive action has boosted your reputation.`
                : bidResult.attempted
                  ? `Your counter-bid of ${bidResult.cost.toLocaleString()} was rejected. ` +
                    `${rival.name}'s club keeps the player. No club funds were spent, but your reputation takes a hit.`
                  : `No counter-bid was submitted: ${bidResult.rejectionReason ?? "the transfer was no longer valid"} No club funds were spent.`,
              read: false,
              actionRequired: false,
              relatedId: playerId,
            };

            finalState = {
              ...withLifecycleWorld(finalState, bidResult.lifecycle),
              scout: { ...finalState.scout, reputation: bidRep },
              rivalScouts: updatedRivals,
              inbox: [...finalState.inbox, outcomeMessage],
            };

            // Check if rival has become a nemesis
            const updatedRival = updatedRivals[rivalId];
            if (updatedRival && bidResult.attempted && !bidResult.success && isNemesis(updatedRival)) {
              const nemesisMsg: InboxMessage = {
                id: `nemesis-${rivalId}-w${finalState.currentWeek}`,
                week: finalState.currentWeek,
                season: finalState.currentSeason,
                type: "event" as const,
                title: `Nemesis: ${rival.name}`,
                body: `You've lost ${updatedRival.winsAgainstPlayer} players to ${rival.name}. They're becoming your nemesis.`,
                read: false,
                actionRequired: false,
              };
              finalState = {
                ...finalState,
                inbox: [...finalState.inbox, nemesisMsg],
              };
            }
          } else if (choice.effect === "concede") {
            finalState = applyRivalPoachBidConcession(finalState, event, choiceIndex);
          }
        }
      }

      finalState = applyNarrativeRelationshipChoice(
        finalState,
        event,
        choiceIndex,
      );

      const repairedInbox = clearTerminalNarrativeInboxActions(
        finalState.inbox,
        finalState.narrativeEvents,
      );
      if (repairedInbox !== finalState.inbox) {
        finalState = { ...finalState, inbox: repairedInbox };
      }

      set({ gameState: finalState });
    },
  };
}
