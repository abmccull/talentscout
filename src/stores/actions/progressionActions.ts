/**
 * Career progression, inbox, gossip, NPC management, travel, and
 * narrative event actions extracted from gameStore.
 *
 * Handles job acceptance/decline, inbox management, gossip actions,
 * NPC scout territory assignment, manager/board meetings,
 * specialization unlocks, international travel, and narrative events.
 */
import type { GetState, SetState } from "./types";
import type {
  GameState,
  Scout,
  InboxMessage,
  Specialization,
  ActionableGossipItem,
  GossipAction,
  ChainConsequence,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  assignTerritory,
  canUnlockSecondarySpec,
  unlockSecondarySpecialization,
  processManagerMeeting,
} from "@/engine/career/index";
import { calculateSigningBonus } from "@/engine/finance";
import { processBoardMeeting } from "@/engine/firstTeam/boardAI";
import {
  bookTravel,
  getTravelDuration,
  getScoutHomeCountry as getScoutHome,
} from "@/engine/world/index";
import {
  resolveEventChoice,
  acknowledgeEvent,
  computeChainChoiceEffects,
} from "@/engine/events";
import {
  resolvePoachCounterBid,
  isNemesis,
} from "@/engine/rivals";

/**
 * Apply ChainConsequence[] to a GameState, returning a new GameState.
 * Pure helper for A5 chain consequence system.
 */
function applyConsequences(state: GameState, consequences: ChainConsequence[]): GameState {
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
            finances: {
              ...updated.finances,
              balance: updated.finances.balance + c.value,
            },
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

export function createProgressionActions(get: GetState, set: SetState) {
  return {
    // ── Career ────────────────────────────────────────────────────────────────

    acceptJob: (offerId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const offer = gameState.jobOffers.find((o) => o.id === offerId);
      if (!offer) return;

      const updatedScout: Scout = {
        ...gameState.scout,
        currentClubId: offer.clubId,
        careerTier: offer.tier,
        salary: offer.salary,
        contractEndSeason: gameState.currentSeason + offer.contractLength,
        clubTrust: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
      };

      // B9: Auto-initialize tier 3+ specialization income fields on promotion
      let updatedFinances = gameState.finances;
      if (offer.tier >= 3 && gameState.scout.careerTier < 3 && updatedFinances) {
        const spec = updatedScout.primarySpecialization;
        if (spec === "youth" && (updatedFinances.academyPartnerships ?? 0) === 0) {
          updatedFinances = { ...updatedFinances, academyPartnerships: 1 };
        } else if (spec === "regional" && !updatedFinances.regionalExpertiseRegion) {
          const homeCountry = gameState.countries[0] ?? "england";
          updatedFinances = { ...updatedFinances, regionalExpertiseRegion: homeCountry };
        }
      }

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
          ...gameState,
          scout: updatedScout,
          finances: updatedFinances,
          jobOffers: gameState.jobOffers.filter((o) => o.id !== offerId),
          systemFitCache: {},
          inbox: [
            ...gameState.inbox,
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
      set({
        gameState: {
          ...gameState,
          jobOffers: gameState.jobOffers.filter((o) => o.id !== offerId),
        },
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
      const gossipIndex = gameState.gossipItems.findIndex((g) => g.id === gossipId);
      if (gossipIndex === -1) return;
      const gossip = gameState.gossipItems[gossipIndex];
      const updatedGossip: ActionableGossipItem = {
        ...gossip,
        actionTaken: action,
        dismissed: action === "dismiss",
      };
      const updatedGossipItems = [...gameState.gossipItems];
      updatedGossipItems[gossipIndex] = updatedGossip;

      // If the scout chose to "act on" the gossip, add the subject to the watchlist
      let updatedWatchlist = gameState.watchlist;
      if (action === "actOn" && gossip.subjectPlayerId && !gameState.watchlist.includes(gossip.subjectPlayerId)) {
        updatedWatchlist = [...gameState.watchlist, gossip.subjectPlayerId];
      }

      set({
        gameState: {
          ...gameState,
          gossipItems: updatedGossipItems,
          watchlist: updatedWatchlist,
        },
      });
    },

    getActiveGossip: (): ActionableGossipItem[] => {
      const { gameState } = get();
      if (!gameState) return [];
      return gameState.gossipItems.filter((g) => !g.dismissed && !g.actionTaken);
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

    meetManager: () => {
      const { gameState } = get();
      if (!gameState) return;

      const { managerRelationship } = gameState.scout;
      if (!managerRelationship) return;

      const rng = createRNG(
        `${gameState.seed}-manager-action-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const { updatedRelationship } = processManagerMeeting(
        rng,
        gameState.scout,
        managerRelationship,
        gameState.currentWeek,
      );

      set({
        gameState: {
          ...gameState,
          scout: { ...gameState.scout, managerRelationship: updatedRelationship },
        },
      });
    },

    presentToBoard: () => {
      const { gameState } = get();
      if (!gameState) return;

      // Only tier 5 scouts can present to the board; applies a +2 reputation boost
      if (gameState.scout.careerTier !== 5) return;

      const BOARD_PRESENTATION_REPUTATION_BOOST = 2;
      const newReputation = Math.min(
        100,
        gameState.scout.reputation + BOARD_PRESENTATION_REPUTATION_BOOST,
      );

      set({
        gameState: {
          ...gameState,
          scout: { ...gameState.scout, reputation: newReputation },
        },
      });
    },

    meetBoard: () => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.scout.careerTier < 5) return;

      const rng = createRNG(
        `${gameState.seed}-board-meeting-${gameState.currentWeek}-${gameState.currentSeason}`,
      );

      const result = processBoardMeeting(gameState, rng);
      if (!result) return;

      set({
        gameState: {
          ...gameState,
          boardProfile: result.updatedProfile,
          inbox: [...gameState.inbox, result.message],
        },
      });
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

    bookInternationalTravel: (country: string) => {
      const { gameState } = get();
      if (!gameState) return;

      const homeCountry = getScoutHome(gameState.scout);
      const duration = getTravelDuration(homeCountry, country);
      const departureWeek = gameState.currentWeek + 1;

      const updatedScout = bookTravel(
        gameState.scout,
        country,
        departureWeek,
        duration,
      );

      set({
        gameState: {
          ...gameState,
          scout: updatedScout,
        },
      });
    },

    // ── Phase 2 Actions (Narrative Events) ────────────────────────────────────

    acknowledgeNarrativeEvent: (eventId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const event = gameState.narrativeEvents.find((e) => e.id === eventId);
      const updatedEvents = acknowledgeEvent(gameState.narrativeEvents, eventId);
      // A5: Apply consequences if the event has them and no choices (auto-apply on acknowledge)
      let updatedState: GameState = { ...gameState, narrativeEvents: updatedEvents };
      if (event?.consequences && event.consequences.length > 0 && (!event.choices || event.choices.length === 0)) {
        updatedState = applyConsequences(updatedState, event.consequences);
      }
      set({ gameState: updatedState });
    },

    resolveNarrativeEventChoice: (eventId: string, choiceIndex: number) => {
      const { gameState } = get();
      if (!gameState) return;

      const event = gameState.narrativeEvents.find((e) => e.id === eventId);
      if (!event) return;

      const resolveRng = createRNG(
        `${gameState.seed}-event-resolve-${eventId}-${choiceIndex}`,
      );

      // F2: If event is part of a chain, record choice and compute chain effects
      let chainRepChange = 0;
      let chainFatigueChange = 0;
      let updatedChains = gameState.eventChains ?? [];
      if (event.chainId) {
        const chain = updatedChains.find((c) => c.id === event.chainId);
        if (chain && !chain.resolved) {
          const effects = computeChainChoiceEffects(chain, choiceIndex, resolveRng);
          chainRepChange = effects.reputationChange;
          chainFatigueChange = effects.fatigueChange;
          const newChoiceHistory = [...chain.choiceHistory];
          newChoiceHistory[chain.currentStep - 1] = choiceIndex;
          updatedChains = updatedChains.map((c) =>
            c.id === chain.id ? { ...c, choiceHistory: newChoiceHistory } : c,
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

      const totalRepChange = result.reputationChange + chainRepChange;
      const totalFatigueChange = result.fatigueChange + chainFatigueChange;

      const newReputation = Math.min(
        100,
        Math.max(0, gameState.scout.reputation + totalRepChange),
      );

      const newFatigue = Math.min(
        100,
        Math.max(0, gameState.scout.fatigue + totalFatigueChange),
      );

      let finalState: GameState = {
        ...gameState,
        narrativeEvents: updatedEvents,
        eventChains: updatedChains,
        scout: {
          ...gameState.scout,
          reputation: newReputation,
          fatigue: newFatigue,
        },
        inbox: [...gameState.inbox, ...result.messages],
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
                : `Counter-Bid Failed: ${player.firstName} ${player.lastName}`,
              body: bidResult.success
                ? `Your counter-bid of ${bidResult.cost.toLocaleString()} succeeded! ` +
                  `${player.firstName} ${player.lastName} will join your club. ` +
                  `Your decisive action has boosted your reputation.`
                : `Your counter-bid of ${bidResult.cost.toLocaleString()} was rejected. ` +
                  `${rival.name} secured the deal. The cost has been absorbed and ` +
                  `your reputation takes a hit.`,
              read: false,
              actionRequired: false,
              relatedId: playerId,
            };

            finalState = {
              ...finalState,
              scout: { ...finalState.scout, reputation: bidRep },
              rivalScouts: updatedRivals,
              inbox: [...finalState.inbox, outcomeMessage],
            };

            // Check if rival has become a nemesis
            const updatedRival = updatedRivals[rivalId];
            if (updatedRival && !bidResult.success && isNemesis(updatedRival)) {
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
            updatedRivals[rivalId] = {
              ...rival,
              winsAgainstPlayer: (rival.winsAgainstPlayer ?? 0) + 1,
              lossesToPlayer: rival.lossesToPlayer ?? 0,
            };

            finalState = {
              ...finalState,
              rivalScouts: updatedRivals,
            };

            const concedeRival = updatedRivals[rivalId];
            if (concedeRival && isNemesis(concedeRival)) {
              const nemesisMsg: InboxMessage = {
                id: `nemesis-${rivalId}-w${finalState.currentWeek}`,
                week: finalState.currentWeek,
                season: finalState.currentSeason,
                type: "event" as const,
                title: `Nemesis: ${rival.name}`,
                body: `You've lost ${concedeRival.winsAgainstPlayer} players to ${rival.name}. They're becoming your nemesis.`,
                read: false,
                actionRequired: false,
              };
              finalState = {
                ...finalState,
                inbox: [...finalState.inbox, nemesisMsg],
              };
            }
          }
        }
      }

      set({ gameState: finalState });
    },
  };
}
