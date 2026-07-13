/**
 * Navigation & UI state actions extracted from gameStore.
 *
 * Handles screen navigation, selection state, comparison panel,
 * dismiss actions, and other lightweight UI-only actions.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStore";
import type { InboxMessage, Contact, HiddenIntel } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { getHiddenAttributeIntel } from "@/engine/network/contacts";
import { updateRichPresence } from "@/lib/steam/richPresence";
import {
  getResolvedContactIntel,
  resolvePlayerEntity,
} from "@/lib/playerResolution";
import { useTutorialStore } from "@/stores/tutorialStore";

export function createNavigationActions(get: GetState, set: SetState) {
  return {
    setScreen: (screen: GameScreen) => {
      set({ currentScreen: screen });
      const gs = get().gameState;
      const activeMatch = get().activeMatch;
      let matchFixture: string | undefined;
      if (screen === "match" && activeMatch && gs) {
        const fixture = gs.fixtures[activeMatch.fixtureId];
        if (fixture) {
          const home = gs.clubs[fixture.homeClubId]?.name ?? fixture.homeClubId;
          const away = gs.clubs[fixture.awayClubId]?.name ?? fixture.awayClubId;
          matchFixture = `${home} vs ${away}`;
        }
      }
      updateRichPresence(screen, {
        currentCountry: gs?.countries?.[0],
        currentSeason: gs?.currentSeason,
        currentWeek: gs?.currentWeek,
        matchFixture,
        activeScenarioId: gs?.activeScenarioId,
      });

      // Tutorial: record screen visit and fire navigation-based milestones
      if (gs) {
        const tut = useTutorialStore.getState();
        tut.recordScreenVisit(screen);
        if (screen === "dashboard") tut.completeMilestone("viewedDashboard");
        if (screen === "calendar") tut.completeMilestone("openedCalendar");
      }
    },

    dismissWeekSummary: () => set({ lastWeekSummary: null }),
    dismissBatchSummary: () => set({ batchSummary: null }),

    setSelectedScenario: (id: string | null) => set({ selectedScenarioId: id }),
    dismissScenarioOutcome: () => set({
      scenarioOutcome: null,
      scenarioOutcomeScenarioId: null,
      scenarioProgress: null,
    }),
    dismissCelebration: () => set({ pendingCelebration: null }),
    dismissSeasonAwards: () => {
      const { gameState } = get();
      if (!gameState?.seasonAwardsData) return;
      set({
        gameState: {
          ...gameState,
          seasonAwardsData: undefined,
        },
      });
    },

    setPendingFixtureClubFilter: (filter: string | null) => set({ pendingFixtureClubFilter: filter }),
    setPendingCalendarActivity: (pending: { type: string; targetId: string; label: string } | null) => set({ pendingCalendarActivity: pending }),
    setPendingInternationalCountry: (country: string | null) => set({ pendingInternationalCountry: country }),

    addToComparison: (reportId: string) => {
      const current = get().comparisonReportIds;
      if (current.includes(reportId) || current.length >= 3) return;
      set({ comparisonReportIds: [...current, reportId] });
    },
    removeFromComparison: (reportId: string) => {
      set({ comparisonReportIds: get().comparisonReportIds.filter((id) => id !== reportId) });
    },
    clearComparison: () => {
      set({ comparisonReportIds: [] });
    },

    selectPlayer: (playerId: string | null) => set({ selectedPlayerId: playerId }),
    selectFixture: (fixtureId: string | null) => set({ selectedFixtureId: fixtureId }),

    tapNetworkForPlayer: (playerId: string) => {
      const state = get();
      if (!state.gameState) return null;
      const resolvedPlayer = resolvePlayerEntity(state.gameState, playerId);
      if (!resolvedPlayer) return null;

      const player = resolvedPlayer.player;
      const canonicalPlayerId = resolvedPlayer.playerId;

      const contacts = Object.values(state.gameState.contacts);
      if (contacts.length === 0) return null;

      const rng = createRNG(
        `${state.gameState.seed}-tapnet-${playerId}-${state.gameState.currentWeek}`,
      );

      let updatedIntel = { ...(state.gameState.contactIntel ?? {}) };
      const existingIntel = getResolvedContactIntel(state.gameState, canonicalPlayerId);
      let found = false;
      let usedContactId: string | null = null;
      let usedContactName: string | undefined;
      let resultTitle = "";
      let resultBody = "";
      const messages: InboxMessage[] = [];

      for (const contact of contacts) {
        const intel = getHiddenAttributeIntel(
          rng,
          contact,
          canonicalPlayerId,
          player,
          undefined,
          { week: state.gameState.currentWeek, season: state.gameState.currentSeason },
        );
        if (intel) {
          // Avoid duplicate intel for the same attribute
          const alreadyHas = existingIntel.some((e) => e.attribute === intel.attribute);
          if (!alreadyHas) {
            updatedIntel = {
              ...updatedIntel,
              [canonicalPlayerId]: [...(updatedIntel[canonicalPlayerId] ?? []), intel],
            };
            found = true;
            usedContactId = contact.id;
            usedContactName = contact.name;
            resultTitle = `Network Intel: ${player.firstName} ${player.lastName}`;
            resultBody = `Your contact ${contact.name} shared intel on ${player.firstName} ${player.lastName}: "${intel.hint}"`;
            messages.push({
              id: `tapnet-${canonicalPlayerId}-${contact.id}-w${state.gameState.currentWeek}`,
              week: state.gameState.currentWeek,
              season: state.gameState.currentSeason,
              type: "feedback" as const,
              title: resultTitle,
              body: resultBody,
              read: true, // Mark read — user sees it inline
              actionRequired: false,
              relatedId: canonicalPlayerId,
              relatedEntityType: "player" as const,
            });
            break; // One intel per tap
          }
        }
      }

      if (!found) {
        resultTitle = `Network Intel: ${player.firstName} ${player.lastName}`;
        resultBody = `You reached out to your contacts about ${player.firstName} ${player.lastName}, but nobody had new information to share right now. Try again after building stronger relationships.`;
        messages.push({
          id: `tapnet-noresult-${canonicalPlayerId}-w${state.gameState.currentWeek}`,
          week: state.gameState.currentWeek,
          season: state.gameState.currentSeason,
          type: "feedback" as const,
          title: resultTitle,
          body: resultBody,
          read: true,
          actionRequired: false,
        });
      }

      // --- Cost: fatigue +3 and relationship decay -2 on the used contact ---
      const updatedScout = {
        ...state.gameState.scout,
        fatigue: Math.min(100, state.gameState.scout.fatigue + 3),
      };
      const updatedContacts = { ...state.gameState.contacts };
      if (usedContactId && updatedContacts[usedContactId]) {
        const c = updatedContacts[usedContactId];
        updatedContacts[usedContactId] = {
          ...c,
          relationship: Math.max(0, c.relationship - 2),
          lastInteractionWeek: state.gameState.currentWeek,
        };
      }

      set({
        gameState: {
          ...state.gameState,
          scout: updatedScout,
          contacts: updatedContacts,
          contactIntel: updatedIntel,
          inbox: [...state.gameState.inbox, ...messages],
        },
      });

      return { title: resultTitle, body: resultBody, contactName: usedContactName };
    },

    toggleWatchlist: (playerId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const canonicalPlayerId = resolvePlayerEntity(gameState, playerId)?.playerId ?? playerId;
      const idx = gameState.watchlist.indexOf(canonicalPlayerId);
      const next =
        idx >= 0
          ? gameState.watchlist.filter((id) => id !== canonicalPlayerId)
          : [...gameState.watchlist, canonicalPlayerId];
      set({ gameState: { ...gameState, watchlist: next } });
    },
  };
}
