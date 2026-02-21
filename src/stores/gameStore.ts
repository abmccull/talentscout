import { create } from "zustand";
import type {
  GameState,
  NewGameConfig,
  Activity,
  WeekSchedule,
  Scout,
  Player,
  Club,
  League,
  Fixture,
  Observation,
  ScoutReport,
  Contact,
  InboxMessage,
  JobOffer,
  ConvictionLevel,
  FocusSelection,
  MatchPhase,
  NPCScout,
  NPCScoutReport,
  Territory,
  Specialization,
  NarrativeEvent,
  RivalScout,
  SeasonEvent,
  DiscoveryRecord,
  ScoutPerformanceSnapshot,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  generateSeasonEvents,
  getActiveSeasonEvents,
} from "@/engine/core/seasonEvents";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
} from "@/engine/core/transferWindow";
import { initializeWorld } from "@/engine/world";
import { createScout } from "@/engine/scout/creation";
import { processWeeklyTick, advanceWeek } from "@/engine/core/gameLoop";
import { generateMatchPhases, simulateMatchResult } from "@/engine/match/phases";
import { processFocusedObservations } from "@/engine/match/focus";
import { generateReportContent, finalizeReport, calculateReportQuality } from "@/engine/reports/reporting";
import { updateReputation, generateJobOffers } from "@/engine/career/progression";
import { generateStartingContacts } from "@/engine/network/contacts";
import {
  createWeekSchedule,
  addActivity,
  removeActivity,
  getAvailableActivities,
  processCompletedWeek,
  applyWeekResults,
} from "@/engine/core/calendar";
import {
  assignTerritory,
  canUnlockSecondarySpec,
  unlockSecondarySpecialization,
  processManagerMeeting,
  recordDiscovery,
  processSeasonDiscoveries,
  processMonthlySnapshot,
} from "@/engine/career/index";
import {
  createLeaderboardEntry,
  submitLeaderboardEntry,
} from "@/lib/leaderboard";
import {
  bookTravel,
  processCrossCountryTransfers,
  processInternationalWeek,
} from "@/engine/world/index";
import { generateSeasonFixtures } from "@/engine/world/fixtures";
import {
  initializeFinances,
  processWeeklyFinances,
  purchaseEquipmentUpgrade,
} from "@/engine/finance";
import {
  generateWeeklyEvent,
  resolveEventChoice,
  acknowledgeEvent,
} from "@/engine/events";
import {
  generateRivalScouts,
  processRivalWeek,
} from "@/engine/rivals";
import { checkToolUnlocks } from "@/engine/tools";
import { generateManagerProfiles } from "@/engine/analytics";
import {
  saveGame as dbSaveGame,
  loadGame as dbLoadGame,
  autosave as dbAutosave,
  listSaves as dbListSaves,
  deleteSave as dbDeleteSave,
  type SaveRecord,
  AUTOSAVE_SLOT,
  MAX_MANUAL_SLOTS,
} from "@/lib/db";

export type GameScreen =
  | "mainMenu"
  | "newGame"
  | "dashboard"
  | "calendar"
  | "match"
  | "playerProfile"
  | "playerDatabase"
  | "reportWriter"
  | "reportHistory"
  | "career"
  | "network"
  | "settings"
  | "inbox"
  | "npcManagement"
  | "internationalView"
  | "discoveries"
  | "leaderboard"
  | "analytics";

interface GameStore {
  // Navigation
  currentScreen: GameScreen;
  setScreen: (screen: GameScreen) => void;

  // Game state
  gameState: GameState | null;
  isLoaded: boolean;

  // Active match state
  activeMatch: {
    fixtureId: string;
    phases: MatchPhase[];
    currentPhase: number;
    focusSelections: FocusSelection[];
  } | null;

  // Selected entities
  selectedPlayerId: string | null;
  selectedFixtureId: string | null;
  selectedReportId: string | null;

  // Save/Load state
  saveSlots: Omit<SaveRecord, "state">[];
  isSaving: boolean;
  isLoadingSave: boolean;

  // Actions
  startNewGame: (config: NewGameConfig) => Promise<void>;
  loadGame: (state: GameState) => void;
  saveGame: () => GameState | null;

  // Persistence actions (IndexedDB)
  saveToSlot: (slot: number, name: string) => Promise<void>;
  loadFromSlot: (slot: number) => Promise<void>;
  deleteSlot: (slot: number) => Promise<void>;
  refreshSaveSlots: () => Promise<void>;

  // Calendar actions
  scheduleActivity: (activity: Activity, dayIndex: number) => void;
  unscheduleActivity: (dayIndex: number) => void;
  advanceWeek: () => void;

  // Match actions
  startMatch: (fixtureId: string) => void;
  advancePhase: () => void;
  setFocus: (playerId: string, lens: FocusSelection["lens"]) => void;
  endMatch: () => void;

  // Report actions
  startReport: (playerId: string) => void;
  submitReport: (conviction: ConvictionLevel, summary: string, strengths: string[], weaknesses: string[]) => void;

  // Career actions
  acceptJob: (offerId: string) => void;
  declineJob: (offerId: string) => void;

  // Inbox
  markMessageRead: (messageId: string) => void;

  // Entity selection
  selectPlayer: (playerId: string | null) => void;
  selectFixture: (fixtureId: string | null) => void;

  // NPC Scout Management
  assignNPCScoutTerritory: (npcScoutId: string, territoryId: string) => void;
  reviewNPCReport: (reportId: string) => void;

  // Career Management
  meetManager: () => void;
  presentToBoard: () => void;
  unlockSecondarySpecialization: (spec: Specialization) => void;

  // Travel
  bookInternationalTravel: (country: string) => void;

  // Phase 2 actions
  acknowledgeNarrativeEvent: (eventId: string) => void;
  resolveNarrativeEventChoice: (eventId: string, choiceIndex: number) => void;
  purchaseEquipment: () => void;

  // Leaderboard
  submitToLeaderboard: () => Promise<void>;

  // Helpers
  getPlayer: (id: string) => Player | undefined;
  getClub: (id: string) => Club | undefined;
  getLeague: (id: string) => League | undefined;
  getFixture: (id: string) => Fixture | undefined;
  getUpcomingFixtures: (week: number, count: number) => Fixture[];
  getPlayerObservations: (playerId: string) => Observation[];
  getPlayerReports: (playerId: string) => ScoutReport[];
  getScoutedPlayers: () => Player[];
  getLeagueStandings: (leagueId: string) => ClubStanding[];
  getNPCScout: (id: string) => NPCScout | undefined;
  getNPCReports: () => NPCScoutReport[];
  getTerritory: (id: string) => Territory | undefined;
  getActiveNarrativeEvents: () => NarrativeEvent[];
  getRivalScouts: () => RivalScout[];
  getActiveSeasonEvents: () => SeasonEvent[];
  getDiscoveryRecords: () => DiscoveryRecord[];
  getPerformanceHistory: () => ScoutPerformanceSnapshot[];
}

export interface ClubStanding {
  clubId: string;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Navigation
  currentScreen: "mainMenu",
  setScreen: (screen) => set({ currentScreen: screen }),

  // State
  gameState: null,
  isLoaded: false,
  activeMatch: null,
  selectedPlayerId: null,
  selectedFixtureId: null,
  selectedReportId: null,
  saveSlots: [],
  isSaving: false,
  isLoadingSave: false,

  // Start new game
  startNewGame: async (config) => {
    const selectedCountries = config.selectedCountries ?? ["england"];
    const rng = createRNG(config.worldSeed);
    const { leagues, clubs, players, fixtures, territories } = await initializeWorld(
      rng,
      selectedCountries,
    );
    const scout = createScout(config, rng);
    const contacts: Record<string, Contact> = {};
    const startingContacts = generateStartingContacts(rng, scout);
    for (const c of startingContacts) {
      contacts[c.id] = c;
    }

    // Generate season events and transfer windows for season 1
    const initialSeasonEvents = generateSeasonEvents(1);
    const initialTransferWindows = initializeTransferWindows(1);
    const initialTransferWindow = getCurrentTransferWindow(
      initialTransferWindows.map((w) => ({ ...w, isOpen: isTransferWindowOpen([w], 1) })),
      1,
    );

    // Build a temporary state object so Phase 2 generators can read world data
    const tempState: GameState = {
      seed: config.worldSeed,
      currentWeek: 1,
      currentSeason: 1,
      scout,
      leagues,
      clubs,
      players,
      fixtures,
      observations: {},
      reports: {},
      contacts,
      schedule: createWeekSchedule(1, 1),
      jobOffers: [],
      performanceReviews: [],
      inbox: [],
      npcScouts: {},
      npcReports: {},
      territories,
      countries: selectedCountries,
      narrativeEvents: [],
      rivalScouts: {},
      unlockedTools: [],
      managerProfiles: {},
      seasonEvents: initialSeasonEvents,
      transferWindow: initialTransferWindow,
      discoveryRecords: [],
      performanceHistory: [],
      createdAt: Date.now(),
      lastSaved: Date.now(),
      totalWeeksPlayed: 0,
    };

    // ── Phase 2 initialization ──────────────────────────────────────────────

    // 1. Initialize finances
    const finances = initializeFinances(scout);

    // 2. Generate rival scouts (uses a dedicated seed)
    const rivalRng = createRNG(`${config.worldSeed}-rivals-init`);
    const rivalScouts = generateRivalScouts(rivalRng, tempState);

    // 3. Generate manager profiles for all clubs
    const managerRng = createRNG(`${config.worldSeed}-managers-init`);
    const managerProfiles = generateManagerProfiles(managerRng, clubs);

    // 4. Check for any starting tools the scout might already qualify for
    const startingTools = checkToolUnlocks(scout, []);

    const gameState: GameState = {
      ...tempState,
      inbox: [
        {
          id: "welcome",
          week: 1,
          season: 1,
          type: "event",
          title: "Welcome to TalentScout",
          body: `Welcome, ${scout.firstName}. Your career as a ${config.specialization} scout begins now. Start by checking the fixture calendar and scheduling your first match observation.`,
          read: false,
          actionRequired: false,
        },
      ],
      // Phase 2 populated values
      finances,
      rivalScouts,
      managerProfiles,
      unlockedTools: startingTools,
    };

    set({
      gameState,
      isLoaded: true,
      currentScreen: "dashboard",
    });
  },

  loadGame: (state) => {
    set({ gameState: state, isLoaded: true, currentScreen: "dashboard" });
  },

  saveGame: () => {
    const { gameState } = get();
    if (!gameState) return null;
    const saved = { ...gameState, lastSaved: Date.now() };
    set({ gameState: saved });
    return saved;
  },

  // Persistence (IndexedDB)
  saveToSlot: async (slot, name) => {
    const { gameState } = get();
    if (!gameState) return;
    set({ isSaving: true });
    try {
      const saved = { ...gameState, lastSaved: Date.now() };
      await dbSaveGame(slot, name, saved);
      set({ gameState: saved });
      await get().refreshSaveSlots();
    } finally {
      set({ isSaving: false });
    }
  },

  loadFromSlot: async (slot) => {
    set({ isLoadingSave: true });
    try {
      const state = await dbLoadGame(slot);
      if (state) {
        set({ gameState: state, isLoaded: true, currentScreen: "dashboard" });
      }
    } finally {
      set({ isLoadingSave: false });
    }
  },

  deleteSlot: async (slot) => {
    await dbDeleteSave(slot);
    await get().refreshSaveSlots();
  },

  refreshSaveSlots: async () => {
    const slots = await dbListSaves();
    set({ saveSlots: slots });
  },

  // Calendar
  scheduleActivity: (activity, dayIndex) => {
    const { gameState } = get();
    if (!gameState) return;
    const schedule = addActivity(gameState.schedule, activity, dayIndex);
    set({ gameState: { ...gameState, schedule } });
  },

  unscheduleActivity: (dayIndex) => {
    const { gameState } = get();
    if (!gameState) return;
    const schedule = removeActivity(gameState.schedule, dayIndex);
    set({ gameState: { ...gameState, schedule } });
  },

  advanceWeek: () => {
    const { gameState } = get();
    if (!gameState) return;
    const rng = createRNG(`${gameState.seed}-week-${gameState.currentWeek}-${gameState.currentSeason}`);

    // Process scheduled activities → fatigue, skill XP, attribute XP
    const weekResult = processCompletedWeek(gameState.schedule, gameState.scout, rng);
    const updatedScout = applyWeekResults(gameState.scout, weekResult);
    let stateWithScheduleApplied = { ...gameState, scout: updatedScout };

    // ── Process week results for new activity types ─────────────────────────

    // a) NPC reports reviewed — mark each report as reviewed
    if (weekResult.npcReportsReviewed.length > 0) {
      const updatedNpcReports = { ...stateWithScheduleApplied.npcReports };
      for (const reportId of weekResult.npcReportsReviewed) {
        const report = updatedNpcReports[reportId];
        if (report) {
          updatedNpcReports[reportId] = { ...report, reviewed: true };
        }
      }
      stateWithScheduleApplied = { ...stateWithScheduleApplied, npcReports: updatedNpcReports };
    }

    // b) Manager meeting — call processManagerMeeting and apply relationship changes
    if (weekResult.managerMeetingExecuted && stateWithScheduleApplied.scout.managerRelationship) {
      const meetingRng = createRNG(
        `${gameState.seed}-manager-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const { updatedRelationship } = processManagerMeeting(
        meetingRng,
        stateWithScheduleApplied.scout,
        stateWithScheduleApplied.scout.managerRelationship,
      );
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        scout: { ...stateWithScheduleApplied.scout, managerRelationship: updatedRelationship },
      };
    }

    // c) Board presentation — apply reputation boost for tier 5 scouts
    if (
      weekResult.boardPresentationExecuted &&
      stateWithScheduleApplied.scout.careerTier === 5
    ) {
      const BOARD_PRESENTATION_REPUTATION_BOOST = 2;
      const newReputation = Math.min(
        100,
        stateWithScheduleApplied.scout.reputation + BOARD_PRESENTATION_REPUTATION_BOOST,
      );
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        scout: { ...stateWithScheduleApplied.scout, reputation: newReputation },
      };
    }

    // ── Process cross-country transfers (only when multiple countries are active) ──
    if (stateWithScheduleApplied.countries.length > 1) {
      const transferRng = createRNG(
        `${gameState.seed}-transfers-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const transferResults = processCrossCountryTransfers(
        transferRng,
        stateWithScheduleApplied.players,
        stateWithScheduleApplied.clubs,
        stateWithScheduleApplied.leagues,
        stateWithScheduleApplied.countries,
      );
      if (transferResults.length > 0) {
        // Apply transfers: move players to their new clubs
        const updatedPlayers = { ...stateWithScheduleApplied.players };
        const updatedClubs = { ...stateWithScheduleApplied.clubs };
        for (const transfer of transferResults) {
          const player = updatedPlayers[transfer.playerId];
          const fromClub = updatedClubs[transfer.fromClubId];
          const toClub = updatedClubs[transfer.toClubId];
          if (!player || !fromClub || !toClub) continue;

          // Update player's club assignment
          updatedPlayers[transfer.playerId] = { ...player, clubId: transfer.toClubId };

          // Remove from old club's player list
          updatedClubs[transfer.fromClubId] = {
            ...fromClub,
            playerIds: fromClub.playerIds.filter((id) => id !== transfer.playerId),
          };

          // Add to new club's player list
          updatedClubs[transfer.toClubId] = {
            ...toClub,
            playerIds: [...toClub.playerIds, transfer.playerId],
          };
        }
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          players: updatedPlayers,
          clubs: updatedClubs,
        };
      }
    }

    // ── Process international system — generate/expire assignments periodically ──
    const internationalRng = createRNG(
      `${gameState.seed}-international-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const internationalResult = processInternationalWeek(
      internationalRng,
      stateWithScheduleApplied.scout,
      stateWithScheduleApplied,
    );

    // Surface new international assignments as inbox messages so the player is notified
    let stateWithInternational = stateWithScheduleApplied;
    if (internationalResult.newAssignments.length > 0) {
      const newMessages: InboxMessage[] = internationalResult.newAssignments.map((assignment) => ({
        id: `assignment-${assignment.id}`,
        week: stateWithScheduleApplied.currentWeek,
        season: stateWithScheduleApplied.currentSeason,
        type: "assignment" as const,
        title: `International Assignment: ${assignment.country}`,
        body: assignment.description,
        read: false,
        actionRequired: true,
        relatedId: assignment.id,
      }));
      stateWithInternational = {
        ...stateWithScheduleApplied,
        inbox: [...stateWithScheduleApplied.inbox, ...newMessages],
      };
    }

    // ── Phase 2: Finance, Rivals, Narrative Events, Tools ──────────────────

    let stateWithPhase2 = stateWithInternational;

    // 1. Process finances (only acts on weeks that are multiples of 4)
    if (stateWithPhase2.finances) {
      const financeRng = createRNG(
        `${gameState.seed}-finance-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      void financeRng; // seed is consumed for determinism; finance is pure math
      const updatedFinances = processWeeklyFinances(
        stateWithPhase2.finances,
        stateWithPhase2.scout,
        stateWithPhase2.currentWeek,
        stateWithPhase2.currentSeason,
      );
      stateWithPhase2 = { ...stateWithPhase2, finances: updatedFinances };
    }

    // 2. Process rival scouts for this week
    const rivalRng = createRNG(
      `${gameState.seed}-rivals-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const rivalResult = processRivalWeek(rivalRng, stateWithPhase2.rivalScouts, stateWithPhase2);
    let rivalInboxMessages: InboxMessage[] = [];
    if (rivalResult.poachWarnings.length > 0) {
      rivalInboxMessages = rivalResult.poachWarnings.map((warning) => {
        const rivalScout = rivalResult.updatedRivals[warning.rivalId];
        const player = stateWithPhase2.players[warning.playerId];
        const rivalName = rivalScout?.name ?? "A rival scout";
        const playerName = player
          ? `${player.firstName} ${player.lastName}`
          : "a player you have reported on";
        return {
          id: `rival-poach-${warning.rivalId}-${warning.playerId}-w${stateWithPhase2.currentWeek}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "event" as const,
          title: "Rival Scout Alert",
          body: `${rivalName} is now tracking ${playerName} — a player you have already reported on. Consider submitting a stronger recommendation before they act.`,
          read: false,
          actionRequired: false,
          relatedId: warning.playerId,
        };
      });
    }
    stateWithPhase2 = {
      ...stateWithPhase2,
      rivalScouts: rivalResult.updatedRivals,
      inbox: [...stateWithPhase2.inbox, ...rivalInboxMessages],
    };

    // 3. Generate narrative event (5% weekly chance)
    const eventRng = createRNG(
      `${gameState.seed}-events-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const narrativeEvent = generateWeeklyEvent(eventRng, stateWithPhase2);
    if (narrativeEvent) {
      const eventInboxMessage: InboxMessage = {
        id: `narrative-${narrativeEvent.id}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: narrativeEvent.title,
        body: narrativeEvent.description,
        read: false,
        actionRequired: (narrativeEvent.choices?.length ?? 0) > 0,
        relatedId: narrativeEvent.id,
      };
      stateWithPhase2 = {
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, narrativeEvent],
        inbox: [...stateWithPhase2.inbox, eventInboxMessage],
      };
    }

    // 4. Check for newly unlocked tools
    const toolRng = createRNG(
      `${gameState.seed}-tools-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    void toolRng; // deterministic seed; unlock check is pure
    const newlyUnlocked = checkToolUnlocks(stateWithPhase2.scout, stateWithPhase2.unlockedTools);
    if (newlyUnlocked.length > 0) {
      const toolMessages: InboxMessage[] = newlyUnlocked.map((toolId) => ({
        id: `tool-unlocked-${toolId}-w${stateWithPhase2.currentWeek}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: "New Tool Unlocked",
        body: `You have unlocked a new scouting tool: ${toolId}. Check your tools panel to see the bonuses it provides.`,
        read: false,
        actionRequired: false,
        relatedId: toolId,
      }));
      stateWithPhase2 = {
        ...stateWithPhase2,
        unlockedTools: [...stateWithPhase2.unlockedTools, ...newlyUnlocked],
        inbox: [...stateWithPhase2.inbox, ...toolMessages],
      };
    }

    // ── Core game loop tick ─────────────────────────────────────────────────

    const tickResult = processWeeklyTick(stateWithPhase2, rng);
    let newState = advanceWeek(stateWithPhase2, tickResult);

    // ── Monthly performance snapshot (uses post-tick state for accuracy) ────
    const monthlySnapshot = processMonthlySnapshot(newState);
    if (monthlySnapshot) {
      newState = {
        ...newState,
        performanceHistory: [...newState.performanceHistory, monthlySnapshot],
      };
    }

    // ── Season transition: regenerate events, fixtures, and transfer windows ─
    if (tickResult.endOfSeasonTriggered) {
      // Process end-of-season discoveries before transitioning
      const updatedDiscoveryRecords = processSeasonDiscoveries(
        newState.discoveryRecords,
        newState.players,
        stateWithPhase2.currentSeason,
      );
      newState = { ...newState, discoveryRecords: updatedDiscoveryRecords };

      // Generate new season fixtures for all leagues
      const fixtureRng = createRNG(`${gameState.seed}-fixtures-s${newState.currentSeason}`);
      const newFixtures: Record<string, Fixture> = {};
      for (const league of Object.values(newState.leagues)) {
        const leagueFixtures = generateSeasonFixtures(fixtureRng, league, newState.currentSeason);
        for (const f of leagueFixtures) {
          newFixtures[f.id] = f;
        }
      }
      newState = { ...newState, fixtures: newFixtures };

      const newSeasonEvents = generateSeasonEvents(newState.currentSeason);
      const newTransferWindows = initializeTransferWindows(newState.currentSeason);
      const newTransferWindow = getCurrentTransferWindow(
        newTransferWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      newState = { ...newState, seasonEvents: newSeasonEvents, transferWindow: newTransferWindow };
    } else {
      // Keep season events as-is; update transfer window open/closed state
      const existingWindows = initializeTransferWindows(newState.currentSeason);
      const updatedTransferWindow = getCurrentTransferWindow(
        existingWindows.map((w) => ({
          ...w,
          isOpen: isTransferWindowOpen([w], newState.currentWeek),
        })),
        newState.currentWeek,
      );
      newState = { ...newState, transferWindow: updatedTransferWindow };
    }

    // Prune inbox to keep the most recent 200 messages
    if (newState.inbox.length > 200) {
      newState = { ...newState, inbox: newState.inbox.slice(-200) };
    }

    set({ gameState: newState });
    // Autosave after each week advance
    dbAutosave(newState).catch((err) => {
      console.warn("Autosave failed:", err);
    });
  },

  // Match
  startMatch: (fixtureId) => {
    const { gameState } = get();
    if (!gameState) return;
    const fixture = gameState.fixtures[fixtureId];
    if (!fixture) return;

    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    if (!homeClub || !awayClub) return;

    const homePlayers = homeClub.playerIds
      .map((id) => gameState.players[id])
      .filter((p): p is Player => !!p)
      .slice(0, 11);
    const awayPlayers = awayClub.playerIds
      .map((id) => gameState.players[id])
      .filter((p): p is Player => !!p)
      .slice(0, 11);

    const rng = createRNG(`${gameState.seed}-match-${fixtureId}`);
    const phases = generateMatchPhases(rng, {
      fixture,
      homePlayers,
      awayPlayers,
      weather: fixture.weather || "clear",
    });

    set({
      activeMatch: {
        fixtureId,
        phases,
        currentPhase: 0,
        focusSelections: [],
      },
      currentScreen: "match",
    });
  },

  advancePhase: () => {
    const { activeMatch } = get();
    if (!activeMatch) return;
    if (activeMatch.currentPhase >= activeMatch.phases.length) return;
    set({
      activeMatch: {
        ...activeMatch,
        currentPhase: activeMatch.currentPhase + 1,
      },
    });
  },

  setFocus: (playerId, lens) => {
    const { activeMatch } = get();
    if (!activeMatch) return;
    const existing = activeMatch.focusSelections.find((f) => f.playerId === playerId);
    if (existing) {
      set({
        activeMatch: {
          ...activeMatch,
          focusSelections: activeMatch.focusSelections.map((f) =>
            f.playerId === playerId
              ? { ...f, lens, phases: [...f.phases, activeMatch.currentPhase] }
              : f
          ),
        },
      });
    } else {
      if (activeMatch.focusSelections.length >= 3) return; // Max 3 focus players
      set({
        activeMatch: {
          ...activeMatch,
          focusSelections: [
            ...activeMatch.focusSelections,
            { playerId, phases: [activeMatch.currentPhase], lens },
          ],
        },
      });
    }
  },

  endMatch: () => {
    const { activeMatch, gameState } = get();
    if (!activeMatch || !gameState) return;

    const rng = createRNG(`${gameState.seed}-observe-${activeMatch.fixtureId}`);
    const newObservations = { ...gameState.observations };

    for (const focus of activeMatch.focusSelections) {
      const player = gameState.players[focus.playerId];
      if (!player) continue;
      const existingObs = Object.values(gameState.observations).filter(
        (o) => o.playerId === focus.playerId
      );
      const observation = processFocusedObservations(
        rng,
        player,
        gameState.scout,
        activeMatch.phases,
        focus,
        "liveMatch",
        existingObs
      );
      observation.week = gameState.currentWeek;
      observation.season = gameState.currentSeason;
      observation.matchId = activeMatch.fixtureId;
      newObservations[observation.id] = observation;
    }

    // Simulate match result
    const fixture = gameState.fixtures[activeMatch.fixtureId];
    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    if (!homeClub || !awayClub) {
      set({ activeMatch: null, currentScreen: "dashboard" });
      return;
    }
    const homePlayers = homeClub.playerIds
      .map((id) => gameState.players[id])
      .filter((p): p is Player => !!p);
    const awayPlayers = awayClub.playerIds
      .map((id) => gameState.players[id])
      .filter((p): p is Player => !!p);
    const resultRng = createRNG(`${gameState.seed}-result-${activeMatch.fixtureId}`);
    const result = simulateMatchResult(resultRng, homeClub, awayClub, homePlayers, awayPlayers);

    const updatedFixture: Fixture = {
      ...fixture,
      played: true,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    };

    set({
      gameState: {
        ...gameState,
        observations: newObservations,
        fixtures: { ...gameState.fixtures, [fixture.id]: updatedFixture },
      },
      activeMatch: null,
      currentScreen: "dashboard",
    });
  },

  // Reports
  startReport: (playerId) => {
    set({ selectedPlayerId: playerId, currentScreen: "reportWriter" });
  },

  submitReport: (conviction, summary, strengths, weaknesses) => {
    const { gameState, selectedPlayerId } = get();
    if (!gameState || !selectedPlayerId) return;

    const player = gameState.players[selectedPlayerId];
    if (!player) return;

    const observations = Object.values(gameState.observations).filter(
      (o) => o.playerId === selectedPlayerId
    );
    const draft = generateReportContent(player, observations, gameState.scout);
    const report = finalizeReport(
      draft,
      conviction,
      summary,
      strengths,
      weaknesses,
      gameState.scout,
      gameState.currentWeek,
      gameState.currentSeason,
      selectedPlayerId
    );

    const quality = calculateReportQuality(report, player);
    const scoredReport = { ...report, qualityScore: quality };

    const baseUpdatedScout = updateReputation(gameState.scout, {
      type: "reportSubmitted",
      quality,
    });
    const updatedScout = { ...baseUpdatedScout, reportsSubmitted: baseUpdatedScout.reportsSubmitted + 1 };

    // Record discovery if this player has not been tracked before
    const alreadyDiscovered = gameState.discoveryRecords.some(
      (r) => r.playerId === selectedPlayerId,
    );
    const newDiscoveryRecord = alreadyDiscovered
      ? null
      : recordDiscovery(player, gameState.scout, gameState.currentWeek, gameState.currentSeason);

    const updatedDiscoveryRecords = newDiscoveryRecord
      ? [...gameState.discoveryRecords, newDiscoveryRecord]
      : gameState.discoveryRecords;

    set({
      gameState: {
        ...gameState,
        reports: { ...gameState.reports, [scoredReport.id]: scoredReport },
        scout: updatedScout,
        discoveryRecords: updatedDiscoveryRecords,
      },
      currentScreen: "reportHistory",
    });
  },

  // Career
  acceptJob: (offerId) => {
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
    };

    set({
      gameState: {
        ...gameState,
        scout: updatedScout,
        jobOffers: gameState.jobOffers.filter((o) => o.id !== offerId),
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
        ],
      },
    });
  },

  declineJob: (offerId) => {
    const { gameState } = get();
    if (!gameState) return;
    set({
      gameState: {
        ...gameState,
        jobOffers: gameState.jobOffers.filter((o) => o.id !== offerId),
      },
    });
  },

  // Inbox
  markMessageRead: (messageId) => {
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

  // Selection
  selectPlayer: (playerId) => set({ selectedPlayerId: playerId }),
  selectFixture: (fixtureId) => set({ selectedFixtureId: fixtureId }),

  // ── NPC Scout Management ────────────────────────────────────────────────────

  assignNPCScoutTerritory: (npcScoutId, territoryId) => {
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

  reviewNPCReport: (reportId) => {
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

  // ── Career Management ────────────────────────────────────────────────────────

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

  unlockSecondarySpecialization: (spec) => {
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

  // ── Travel ──────────────────────────────────────────────────────────────────

  bookInternationalTravel: (country) => {
    const { gameState } = get();
    if (!gameState) return;

    // Default travel duration: 2 weeks, departing next week
    const DEFAULT_TRAVEL_DURATION = 2;
    const departureWeek = gameState.currentWeek + 1;

    const updatedScout = bookTravel(
      gameState.scout,
      country,
      departureWeek,
      DEFAULT_TRAVEL_DURATION,
    );

    set({
      gameState: {
        ...gameState,
        scout: updatedScout,
      },
    });
  },

  // ── Phase 2 Actions ──────────────────────────────────────────────────────

  acknowledgeNarrativeEvent: (eventId) => {
    const { gameState } = get();
    if (!gameState) return;
    const updatedEvents = acknowledgeEvent(gameState.narrativeEvents, eventId);
    set({ gameState: { ...gameState, narrativeEvents: updatedEvents } });
  },

  resolveNarrativeEventChoice: (eventId, choiceIndex) => {
    const { gameState } = get();
    if (!gameState) return;

    const event = gameState.narrativeEvents.find((e) => e.id === eventId);
    if (!event) return;

    const resolveRng = createRNG(
      `${gameState.seed}-event-resolve-${eventId}-${choiceIndex}`,
    );

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

    const newReputation = Math.min(
      100,
      Math.max(0, gameState.scout.reputation + result.reputationChange),
    );

    set({
      gameState: {
        ...gameState,
        narrativeEvents: updatedEvents,
        scout: { ...gameState.scout, reputation: newReputation },
        inbox: [...gameState.inbox, ...result.messages],
      },
    });
  },

  purchaseEquipment: () => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;

    const updatedFinances = purchaseEquipmentUpgrade(
      gameState.finances,
      gameState.currentWeek,
      gameState.currentSeason,
    );

    if (!updatedFinances) return; // Cannot afford or already at max level

    set({ gameState: { ...gameState, finances: updatedFinances } });
  },

  // Helpers
  getPlayer: (id) => get().gameState?.players[id],
  getClub: (id) => get().gameState?.clubs[id],
  getLeague: (id) => get().gameState?.leagues[id],
  getFixture: (id) => get().gameState?.fixtures[id],

  getUpcomingFixtures: (week, count) => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.fixtures)
      .filter((f) => f.week >= week && !f.played)
      .sort((a, b) => a.week - b.week)
      .slice(0, count);
  },

  getPlayerObservations: (playerId) => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.observations).filter(
      (o) => o.playerId === playerId
    );
  },

  getPlayerReports: (playerId) => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.reports).filter(
      (r) => r.playerId === playerId
    );
  },

  getScoutedPlayers: () => {
    const { gameState } = get();
    if (!gameState) return [];
    const observedIds = new Set(
      Object.values(gameState.observations).map((o) => o.playerId)
    );
    return Array.from(observedIds)
      .map((id) => gameState.players[id])
      .filter((p): p is Player => !!p);
  },

  getLeagueStandings: (leagueId) => {
    const { gameState } = get();
    if (!gameState) return [];
    const league = gameState.leagues[leagueId];
    if (!league) return [];

    const standings: Record<string, ClubStanding> = {};
    for (const clubId of league.clubIds) {
      const club = gameState.clubs[clubId];
      standings[clubId] = {
        clubId,
        clubName: club?.name || "Unknown",
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }

    for (const fixture of Object.values(gameState.fixtures)) {
      if (fixture.leagueId !== leagueId || !fixture.played) continue;
      const home = standings[fixture.homeClubId];
      const away = standings[fixture.awayClubId];
      if (!home || !away || fixture.homeGoals === undefined || fixture.awayGoals === undefined) continue;

      home.played++;
      away.played++;
      home.goalsFor += fixture.homeGoals;
      home.goalsAgainst += fixture.awayGoals;
      away.goalsFor += fixture.awayGoals;
      away.goalsAgainst += fixture.homeGoals;

      if (fixture.homeGoals > fixture.awayGoals) {
        home.won++;
        home.points += 3;
        away.lost++;
      } else if (fixture.homeGoals < fixture.awayGoals) {
        away.won++;
        away.points += 3;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst;
      away.goalDifference = away.goalsFor - away.goalsAgainst;
    }

    return Object.values(standings).sort(
      (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
    );
  },

  getNPCScout: (id) => get().gameState?.npcScouts[id],

  getNPCReports: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.npcReports);
  },

  getTerritory: (id) => get().gameState?.territories[id],

  getActiveNarrativeEvents: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return gameState.narrativeEvents.filter((e) => !e.acknowledged);
  },

  getRivalScouts: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.rivalScouts);
  },

  getActiveSeasonEvents: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return getActiveSeasonEvents(gameState.seasonEvents, gameState.currentWeek);
  },

  getDiscoveryRecords: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return gameState.discoveryRecords;
  },

  getPerformanceHistory: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return gameState.performanceHistory;
  },

  submitToLeaderboard: async () => {
    const { gameState } = get();
    if (!gameState) return;
    const entry = createLeaderboardEntry(
      gameState.scout,
      gameState,
      gameState.currentSeason,
    );
    await submitLeaderboardEntry(entry);
  },
}));
