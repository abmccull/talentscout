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
import { generateStartingContacts, meetContact, generateContactForType } from "@/engine/network/contacts";
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
  | "matchSummary"
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
  | "analytics"
  | "fixtureBrowser";

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

  // Last week summary — shown after advanceWeek() completes
  lastWeekSummary: WeekSummary | null;
  dismissWeekSummary: () => void;

  // Last match result — persisted so MatchSummaryScreen can read it after activeMatch is cleared
  lastMatchResult: {
    fixtureId: string;
    focusedPlayerIds: string[];
    homeGoals: number;
    awayGoals: number;
    /** Screen to navigate to when the user clicks "Continue" */
    continueScreen: GameScreen;
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

  // Watchlist
  toggleWatchlist: (playerId: string) => void;

  // Leaderboard
  submitToLeaderboard: () => Promise<void>;

  // Helpers
  getPendingMatches: () => string[];
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

export interface WeekSummary {
  fatigueChange: number;
  skillXpGained: Record<string, number>;
  attributeXpGained: Record<string, number>;
  matchesAttended: number;
  reportsWritten: number;
  meetingsHeld: number;
  newMessages: number;
  rivalAlerts: number;
  financeSummary?: { income: number; expenses: number } | null;
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
  lastWeekSummary: null,
  dismissWeekSummary: () => set({ lastWeekSummary: null }),
  lastMatchResult: null,
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

    // Populate knownPlayerIds for each contact using their region to prefer local players.
    // This is done after world generation so all player/club/league data is available.
    const regionToCountry: Record<string, string> = {
      England: "england",
      Spain: "spain",
      Germany: "germany",
      France: "france",
      Italy: "italy",
      Portugal: "portugal",
      Netherlands: "netherlands",
      Brazil: "brazil",
      Argentina: "argentina",
      Belgium: "belgium",
      Scandinavia: "sweden", // best approximation for multi-country region
      "Eastern Europe": "czech", // best approximation for multi-country region
    };
    const allPlayerIds = Object.keys(players);

    for (const c of startingContacts) {
      const countryCode = regionToCountry[c.region ?? ""];
      const candidateIds = countryCode
        ? allPlayerIds.filter((id) => {
            const p = players[id];
            const club = p ? clubs[p.clubId] : undefined;
            const league = club ? leagues[club.leagueId] : undefined;
            return league?.country === countryCode;
          })
        : [];
      const pool = candidateIds.length > 0 ? candidateIds : allPlayerIds;
      const count = 4 + Math.floor(rng.nextFloat(0, 1) * 5); // 4–8 players
      const picked: string[] = [];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const idx = rng.nextInt(0, pool.length - 1);
        if (!picked.includes(pool[idx])) {
          picked.push(pool[idx]);
        }
      }
      contacts[c.id] = { ...c, knownPlayerIds: picked };
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
      playedFixtures: [],
      watchlist: [],
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

    const specializationLabel =
      config.specialization === "youth" ? "Youth Scout"
      : config.specialization === "firstTeam" ? "First Team Scout"
      : config.specialization === "regional" ? "Regional Expert"
      : "Data Scout";

    const employmentIntro = scout.currentClubId
      ? `You are employed as a club scout with a weekly salary of £${scout.salary}. Your club expects reports aligned with their scouting priorities. Build trust with your employer to earn more influence over signings.`
      : `You are a freelance scout. You earn fees for every report you submit. Build your reputation to attract club offers and secure a full-time contract.`;

    const gameState: GameState = {
      ...tempState,
      inbox: [
        {
          id: "welcome",
          week: 1,
          season: 1,
          type: "event",
          title: "Welcome to TalentScout",
          body: [
            `Welcome, ${scout.firstName} ${scout.lastName}. Your career as a ${specializationLabel} begins now.`,
            "",
            employmentIntro,
            "",
            "YOUR ROLE",
            "As a scout, your job is to find players worth signing and write convincing reports that persuade clubs to act. You observe players at matches, through video analysis, and via contacts on the ground.",
            "",
            "SCHEDULING ACTIVITIES",
            "Open the Calendar screen each week to plan your time. You have 7 day-slots (Monday through Sunday). Schedule activities such as attending matches, writing reports, networking meetings, or rest. Once your week is planned, press Advance Week to simulate it.",
            "",
            "SCOUTING MATCHES",
            "Find an upcoming fixture in the Calendar or Fixture list and schedule an Attend Match activity. During the match you can focus on up to 3 players — choose a lens (Technical, Physical, Mental, or Tactical) to direct your observations. The more sessions you spend watching a player, the narrower your confidence ranges become on their report.",
            "",
            "WRITING REPORTS",
            "After observing a player at least once, open their Player Profile and navigate to the Report Writer. Choose your conviction level carefully: a Table Pound stakes your personal reputation and should only be used when you are certain about a player.",
            "",
            "BUILDING YOUR NETWORK",
            "Schedule networking meetings to develop contacts — agents, academy coaches, club staff, and journalists. High-quality contacts share tips about players you have not yet spotted yourself.",
            "",
            "REPUTATION AND CAREER PROGRESSION",
            "Every report you submit affects your reputation. Accurate reports on players who go on to succeed will build your standing. As your reputation grows, clubs will offer you contracts with better salaries and wider territories. Your long-term goal is to rise from the starting tier all the way to Head of Scouting.",
            "",
            "Good luck, scout. The pitch is waiting.",
          ].join("\n"),
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

    // ── Gate: play all scheduled attendMatch fixtures interactively first ───
    // Find every attendMatch activity in this week's schedule that has a
    // targetId (fixture ID) which hasn't been played via the MatchScreen yet.
    const pendingFixtureIds = get().getPendingMatches();
    if (pendingFixtureIds.length > 0) {
      // Launch the first unplayed fixture. The user will call endMatch(), which
      // records it in playedFixtures. They then click "Advance Week" again and
      // this gate re-evaluates — eventually clearing all pending matches.
      get().startMatch(pendingFixtureIds[0]);
      return;
    }

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

    // d) Network meetings — call meetContact() for each meeting and apply results
    if (weekResult.meetingsHeld.length > 0) {
      const updatedContacts = { ...stateWithScheduleApplied.contacts };
      const meetingMessages: InboxMessage[] = [];

      for (const contactId of weekResult.meetingsHeld) {
        const contact = updatedContacts[contactId];
        if (!contact) continue;

        const meetingRng = createRNG(
          `${gameState.seed}-meeting-${contactId}-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const result = meetContact(meetingRng, stateWithScheduleApplied.scout, contact);

        // Apply relationship change — clamp to 0–100
        const newRelationship = Math.max(
          0,
          Math.min(100, contact.relationship + result.relationshipChange),
        );
        updatedContacts[contactId] = { ...contact, relationship: newRelationship };

        // Build meeting summary message
        const parts: string[] = [
          `You met with ${contact.name} (${contact.type}).`,
          `Relationship ${result.relationshipChange >= 0 ? "improved" : "declined"} by ${Math.abs(result.relationshipChange)} points (now ${newRelationship}/100).`,
        ];

        for (const intel of result.intel) {
          const player = stateWithScheduleApplied.players[intel.playerId];
          const playerName = player
            ? `${player.firstName} ${player.lastName}`
            : "a player";
          parts.push("");
          parts.push(`INTEL on ${playerName}: ${intel.hint}`);
        }

        for (const tip of result.tips) {
          const player = stateWithScheduleApplied.players[tip.playerId];
          const playerName = player
            ? `${player.firstName} ${player.lastName}`
            : "a player";
          parts.push("");
          parts.push(`TIP: ${playerName} ${tip.description}`);
        }

        meetingMessages.push({
          id: `meeting-${contactId}-w${gameState.currentWeek}-s${gameState.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "event" as const,
          title: `Meeting with ${contact.name}`,
          body: parts.join("\n"),
          read: false,
          actionRequired: false,
        });
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        contacts: updatedContacts,
        inbox: [...stateWithScheduleApplied.inbox, ...meetingMessages],
      };
    }

    // e) Write Reports — process scheduled writeReport activities into actual reports
    if (weekResult.reportsWritten.length > 0) {
      const updatedReports = { ...stateWithScheduleApplied.reports };
      let reportScout = { ...stateWithScheduleApplied.scout };
      let reportDiscoveries = [...(stateWithScheduleApplied.discoveryRecords ?? [])];
      const reportMessages: InboxMessage[] = [];

      for (const playerId of weekResult.reportsWritten) {
        const player = stateWithScheduleApplied.players[playerId];
        if (!player) continue;

        const playerObs = Object.values(stateWithScheduleApplied.observations).filter(
          (o) => o.playerId === playerId,
        );
        if (playerObs.length === 0) continue;

        const draft = generateReportContent(player, playerObs, reportScout);
        const report = finalizeReport(
          draft,
          "recommend",
          `Scouting report on ${player.firstName} ${player.lastName} based on ${playerObs.length} observation${playerObs.length !== 1 ? "s" : ""}.`,
          draft.suggestedStrengths ?? [],
          draft.suggestedWeaknesses ?? [],
          reportScout,
          stateWithScheduleApplied.currentWeek,
          stateWithScheduleApplied.currentSeason,
          playerId,
        );
        const quality = calculateReportQuality(report, player);
        const scoredReport = { ...report, qualityScore: quality };
        updatedReports[scoredReport.id] = scoredReport;

        const repBefore = reportScout.reputation;
        reportScout = updateReputation(reportScout, { type: "reportSubmitted", quality });
        reportScout = { ...reportScout, reportsSubmitted: reportScout.reportsSubmitted + 1 };
        const repDelta = +(reportScout.reputation - repBefore).toFixed(1);

        // Record discovery
        const alreadyDiscovered = reportDiscoveries.some((r) => r.playerId === playerId);
        if (!alreadyDiscovered) {
          const disc = recordDiscovery(player, reportScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason);
          reportDiscoveries = [...reportDiscoveries, disc];
        }

        reportMessages.push({
          id: `auto-report-${playerId}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `Report Filed: ${player.firstName} ${player.lastName}`,
          body: `Your scouting report on ${player.firstName} ${player.lastName} has been filed.\nQuality: ${quality}/100 | Reputation ${repDelta >= 0 ? "+" : ""}${repDelta}`,
          read: false,
          actionRequired: false,
          relatedId: scoredReport.id,
        });
      }

      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        reports: updatedReports,
        scout: reportScout,
        discoveryRecords: reportDiscoveries,
        inbox: [...stateWithScheduleApplied.inbox, ...reportMessages],
      };
    }

    // f) Activity XP feedback — generate inbox messages for silent activities
    {
      const activityFeedbackTypes: Record<string, string> = {
        watchVideo: "Video Analysis Complete",
        trainingVisit: "Training Visit Complete",
        study: "Study Session Complete",
      };
      const seenTypes = new Set<string>();
      const feedbackMessages: InboxMessage[] = [];
      for (const act of stateWithScheduleApplied.schedule.activities) {
        if (!act || seenTypes.has(act.type) || !(act.type in activityFeedbackTypes)) continue;
        seenTypes.add(act.type);

        const skillXp = weekResult.skillXpGained;
        const attrXp = weekResult.attributeXpGained;
        const parts: string[] = [];
        // Show XP from this specific activity type
        const SKILL_LABELS_MAP: Record<string, string> = {
          technicalEye: "Technical Eye", physicalAssessment: "Physical Assessment",
          psychologicalRead: "Psychological Read", tacticalUnderstanding: "Tactical Understanding",
          dataLiteracy: "Data Literacy",
        };
        for (const [skill, val] of Object.entries(skillXp)) {
          if (val && val > 0) parts.push(`${SKILL_LABELS_MAP[skill] ?? skill} +${val} XP`);
        }
        for (const [attr, val] of Object.entries(attrXp)) {
          if (val && val > 0) parts.push(`${attr.charAt(0).toUpperCase() + attr.slice(1)} +${val} XP`);
        }
        parts.push(`Fatigue ${weekResult.fatigueChange >= 0 ? "+" : ""}${weekResult.fatigueChange}.`);

        feedbackMessages.push({
          id: `activity-${act.type}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: activityFeedbackTypes[act.type],
          body: parts.join(", "),
          read: false,
          actionRequired: false,
        });
      }
      if (feedbackMessages.length > 0) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          inbox: [...stateWithScheduleApplied.inbox, ...feedbackMessages],
        };
      }
    }

    // g) New contact generation — every 8th week, 30% chance
    if (stateWithScheduleApplied.currentWeek % 8 === 0) {
      const contactRng = createRNG(
        `${gameState.seed}-newcontact-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      if (contactRng.nextFloat(0, 1) < 0.3) {
        const contactTypes: Array<"agent" | "scout" | "clubStaff" | "journalist" | "academyCoach" | "sportingDirector"> = [
          "agent", "scout", "clubStaff", "journalist", "academyCoach", "sportingDirector",
        ];
        const type = contactRng.pick(contactTypes);
        const orgs = ["Base Soccer", "Elite Scouting", "Global Football Network", "Football Insights"];
        const org = contactRng.pick(orgs);
        const newContact = generateContactForType(contactRng, type, org);
        // Populate knownPlayerIds with random players
        const allPIds = Object.keys(stateWithScheduleApplied.players);
        const knownCount = contactRng.nextInt(3, 7);
        const knownIds: string[] = [];
        for (let i = 0; i < knownCount && allPIds.length > 0; i++) {
          const idx = contactRng.nextInt(0, allPIds.length - 1);
          if (!knownIds.includes(allPIds[idx])) knownIds.push(allPIds[idx]);
        }
        const contactWithPlayers = { ...newContact, knownPlayerIds: knownIds };
        const contactMsg: InboxMessage = {
          id: `new-contact-${newContact.id}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "event" as const,
          title: `New Contact: ${newContact.name}`,
          body: `You've been introduced to ${newContact.name} (${type}) from ${org}${newContact.region ? `, covering ${newContact.region}` : ""}. They know ${knownCount} player${knownCount !== 1 ? "s" : ""} and appear in your contact network.`,
          read: false,
          actionRequired: false,
          relatedId: newContact.id,
        };
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          contacts: { ...stateWithScheduleApplied.contacts, [newContact.id]: contactWithPlayers },
          inbox: [...stateWithScheduleApplied.inbox, contactMsg],
        };
      }
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
      newState = {
        ...newState,
        seasonEvents: newSeasonEvents,
        transferWindow: newTransferWindow,
        // Reset at the start of each new season — every fixture is fresh
        playedFixtures: [],
      };
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

    // ── Build week summary for UI feedback ──────────────────────────────────
    const newInboxCount = newState.inbox.length - gameState.inbox.length;
    const isPayWeek = gameState.currentWeek % 4 === 0;
    const weekSummary: WeekSummary = {
      fatigueChange: weekResult.fatigueChange,
      skillXpGained: weekResult.skillXpGained as Record<string, number>,
      attributeXpGained: weekResult.attributeXpGained as Record<string, number>,
      matchesAttended: weekResult.matchesAttended.length,
      reportsWritten: weekResult.reportsWritten.length,
      meetingsHeld: weekResult.meetingsHeld.length,
      newMessages: Math.max(0, newInboxCount),
      rivalAlerts: rivalInboxMessages.length,
      financeSummary: isPayWeek && gameState.finances
        ? {
            income: gameState.finances.monthlyIncome,
            expenses: Object.values(gameState.finances.expenses).reduce((s, v) => s + v, 0),
          }
        : null,
    };

    set({ gameState: newState, lastWeekSummary: weekSummary });
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
      set({ activeMatch: null, lastMatchResult: null, currentScreen: "dashboard" });
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

    // Mark this fixture as interactively played so advanceWeek() won't re-queue it
    const alreadyPlayed = gameState.playedFixtures.includes(activeMatch.fixtureId);
    const updatedPlayedFixtures = alreadyPlayed
      ? gameState.playedFixtures
      : [...gameState.playedFixtures, activeMatch.fixtureId];

    const updatedGameState: GameState = {
      ...gameState,
      observations: newObservations,
      fixtures: { ...gameState.fixtures, [fixture.id]: updatedFixture },
      playedFixtures: updatedPlayedFixtures,
    };

    // Determine where to navigate when the user dismisses the summary screen.
    // If this match was launched from the advanceWeek() gate (i.e., it was a
    // scheduled attendMatch activity), return to the calendar so the user can
    // click "Advance Week" again and either play the next pending match or
    // proceed with the week. Otherwise go to the dashboard as before.
    const wasScheduled = gameState.schedule.activities.some(
      (a) => a?.type === "attendMatch" && a.targetId === activeMatch.fixtureId,
    );
    const continueScreen: GameScreen = wasScheduled ? "calendar" : "dashboard";

    set({
      gameState: updatedGameState,
      activeMatch: null,
      lastMatchResult: {
        fixtureId: activeMatch.fixtureId,
        focusedPlayerIds: activeMatch.focusSelections.map((f) => f.playerId),
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        continueScreen,
      },
      currentScreen: "matchSummary",
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

    const repBefore = gameState.scout.reputation;
    const baseUpdatedScout = updateReputation(gameState.scout, {
      type: "reportSubmitted",
      quality,
    });
    const updatedScout = { ...baseUpdatedScout, reportsSubmitted: baseUpdatedScout.reportsSubmitted + 1 };
    const reputationDelta = +(updatedScout.reputation - repBefore).toFixed(1);
    const scoredReport = { ...report, qualityScore: quality, reputationDelta };

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

  toggleWatchlist: (playerId: string) => {
    const { gameState } = get();
    if (!gameState) return;
    const idx = gameState.watchlist.indexOf(playerId);
    const next =
      idx >= 0
        ? gameState.watchlist.filter((id) => id !== playerId)
        : [...gameState.watchlist, playerId];
    set({ gameState: { ...gameState, watchlist: next } });
  },

  // Helpers

  getPendingMatches: () => {
    const { gameState } = get();
    if (!gameState) return [];
    // Collect unique fixture IDs from attendMatch activities in this week's
    // schedule that have not yet been played interactively.
    const pendingIds: string[] = [];
    for (const activity of gameState.schedule.activities) {
      if (
        activity?.type === "attendMatch" &&
        activity.targetId &&
        !gameState.playedFixtures.includes(activity.targetId) &&
        !pendingIds.includes(activity.targetId)
      ) {
        pendingIds.push(activity.targetId);
      }
    }
    return pendingIds;
  },

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
