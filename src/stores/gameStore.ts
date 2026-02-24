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
  HiddenIntel,
  UnsignedYouth,
  ManagerDirective,
  RetainerContract,
  ConsultingContract,
  OfficeTier,
  AgencyEmployeeRole,
  LoanType,
  LifestyleLevel,
  CareerPath,
  DayResult,
  WeekSimulationState,
} from "@/engine/core/types";
import {
  generateDirectives,
  evaluateReportAgainstDirectives,
  generateClubResponse,
  processTrialOutcome,
  updateTransferRecords,
} from "@/engine/firstTeam";
import {
  executeDatabaseQuery,
  executeDeepVideoAnalysis,
  generateStatsBriefing,
  validateAnomalyFromObservation,
  resolvePredictions,
  generateAnalystReport,
  updateAnalystMorale,
  generateAnalystCandidate,
  createPrediction,
  generatePredictionSuggestions,
} from "@/engine/data";
import { createRNG } from "@/engine/rng";
import { rollActivityQuality, MULTI_DAY_CONTINUATIONS } from "@/engine/core/activityQuality";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";
import {
  generateSeasonEvents,
  getActiveSeasonEvents,
} from "@/engine/core/seasonEvents";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
  generateUrgentAssessment,
  isDeadlineDayPressure,
} from "@/engine/core/transferWindow";
import { initializeWorld } from "@/engine/world";
import { createScout } from "@/engine/scout/creation";
import { processWeeklyTick, advanceWeek } from "@/engine/core/gameLoop";
import { generateMatchPhases, simulateMatchResult } from "@/engine/match/phases";
import { processFocusedObservations } from "@/engine/match/focus";
import { observePlayerLight } from "@/engine/scout/perception";
import { generateReportContent, finalizeReport, calculateReportQuality, trackPostTransfer } from "@/engine/reports/reporting";
import { updateReputation, generateJobOffers, calculatePerformanceReview, type TierReviewContext } from "@/engine/career/progression";
import { generateStartingContacts, meetContact, generateContactForType } from "@/engine/network/contacts";
import {
  createWeekSchedule,
  addActivity,
  removeActivity,
  canAddActivity,
  getAvailableActivities,
  processCompletedWeek,
  applyWeekResults,
  ACTIVITY_SLOT_COSTS,
  ACTIVITY_SKILL_XP as ACTIVITY_SKILL_XP_MAP,
  ACTIVITY_FATIGUE_COSTS as ACTIVITY_FATIGUE_COSTS_MAP,
  EMPTY_DAY_FATIGUE_RECOVERY,
} from "@/engine/core/calendar";
import {
  assignTerritory,
  canUnlockSecondarySpec,
  unlockSecondarySpecialization,
  processManagerMeeting,
  recordDiscovery,
  processSeasonDiscoveries,
  processMonthlySnapshot,
  checkIndependentTierAdvancement,
  advanceIndependentTier,
} from "@/engine/career/index";
import { chooseCareerPath, canChooseIndependentPath } from "@/engine/career/pathChoice";
import { processWeeklyCourseProgress, enrollInCourse } from "@/engine/career/courses";
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
  purchaseEquipmentItem,
  sellEquipmentItem,
  equipItem,
  getActiveEquipmentBonuses,
  migrateEquipmentLevel,
  migrateFinancialRecord,
  processMarketplaceSales,
  expireOldListings,
  processRetainerDeliveries,
  processLoanPayment,
  processConsultingDeadline,
  processEmployeeWeek,
  changeLifestyle,
  listReport,
  withdrawListing,
  acceptRetainer,
  cancelRetainer,
  upgradeOffice,
  hireEmployee,
  fireEmployee,
  takeLoan,
  repayLoanEarly,
  acceptConsulting,
  generateRetainerOffers,
  generateConsultingOffers,
} from "@/engine/finance";
import type { EquipmentItemId } from "@/engine/finance";
import {
  generateWeeklyEvent,
  resolveEventChoice,
  acknowledgeEvent,
  updateMarketTemperature,
  generateEconomicEvent,
  applyEconomicEvent,
  expireEconomicEvents,
  checkStorylineTriggers,
  processActiveStorylines,
} from "@/engine/events";
import {
  generateRivalScouts,
  processRivalWeek,
} from "@/engine/rivals";
import { checkToolUnlocks } from "@/engine/tools";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import { generateManagerProfiles } from "@/engine/analytics";
import { generateRegionalYouth, generateAcademyIntake } from "@/engine/youth/generation";
import {
  calculateClubAcceptanceChance,
  processPlacementOutcome,
  createAlumniRecord,
} from "@/engine/youth";
import {
  getYouthVenuePool,
  processVenueObservation,
  processParentCoachMeeting,
  mapVenueTypeToContext,
} from "@/engine/youth/venues";
import { getCountryDataSync, getSecondaryCountries } from "@/data/index";
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
import { useTutorialStore, resolveOnboardingSequence } from "@/stores/tutorialStore";
import { IS_DEMO, isDemoLimitReached, DEMO_ALLOWED_SPECS } from "@/lib/demo";
import {
  applyScenarioSetup,
  applyScenarioOverrides,
  checkScenarioObjectives,
  isScenarioFailed,
} from "@/engine/scenarios";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import type { ScenarioProgress } from "@/engine/scenarios";
import { updateRichPresence } from "@/lib/steam/richPresence";

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
  | "fixtureBrowser"
  | "youthScouting"
  | "alumniDashboard"
  | "finances"
  | "handbook"
  | "achievements"
  | "scenarioSelect"
  | "hallOfFame"
  | "demoEnd"
  | "equipment"
  | "agency"
  | "weekSimulation"
  | "training"
  | "rivals";

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
  // Save/Load state
  saveSlots: Omit<SaveRecord, "state">[];
  isSaving: boolean;
  isLoadingSave: boolean;

  // Autosave error state
  autosaveError: string | null;

  // Scenario transient state
  selectedScenarioId: string | null;
  setSelectedScenario: (id: string | null) => void;
  scenarioProgress: ScenarioProgress | null;
  scenarioOutcome: "victory" | "failure" | null;
  dismissScenarioOutcome: () => void;

  // Celebration transient state
  pendingCelebration: { tier: "minor" | "major" | "epic"; title: string; description: string } | null;
  dismissCelebration: () => void;

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

  // Day-by-day simulation
  weekSimulation: WeekSimulationState | null;
  startWeekSimulation: () => void;
  advanceDay: () => void;
  fastForwardWeek: () => void;

  // Match actions
  scheduleMatch: (fixtureId: string) => boolean;
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

  // Equipment loadout actions
  purchaseEquipItem: (itemId: EquipmentItemId) => void;
  sellEquipItem: (itemId: EquipmentItemId) => void;
  equipEquipItem: (itemId: EquipmentItemId) => void;

  // Economics actions
  chooseCareerPath: (path: CareerPath) => void;
  changeLifestyle: (level: LifestyleLevel) => void;
  listReportForSale: (reportId: string, price: number, isExclusive: boolean, targetClubId?: string) => void;
  withdrawReportListing: (listingId: string) => void;
  acceptRetainerContract: (contract: RetainerContract) => void;
  cancelRetainerContract: (contractId: string) => void;
  enrollInCourse: (courseId: string) => void;
  upgradeAgencyOffice: (tier: OfficeTier) => void;
  hireAgencyEmployee: (role: AgencyEmployeeRole) => void;
  fireAgencyEmployee: (employeeId: string) => void;
  takeLoanAction: (type: LoanType, amount: number) => void;
  repayLoanAction: () => void;
  acceptConsultingContract: (contract: ConsultingContract) => void;
  declineRetainerOffer: (contractId: string) => void;
  declineConsultingOffer: (contractId: string) => void;

  // Cross-screen fixture filter (set from PlayerProfile → consumed by FixtureBrowser)
  pendingFixtureClubFilter: string | null;
  setPendingFixtureClubFilter: (filter: string | null) => void;

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
  getAvailableCalendarActivities: () => Activity[];
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
  /** Activity quality outcomes for this week */
  activityQualities: Array<{
    activityType: string;
    tier: string;
    narrative: string;
  }>;
  /** Players discovered this week through scouting activities */
  playersDiscovered: number;
  /** Total observations generated this week (all activities) */
  observationsGenerated: number;
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

// Module-level flag to prevent autosave race condition (Fix #24)
let _autosavePending = false;

export const useGameStore = create<GameStore>((set, get) => ({
  // Navigation
  currentScreen: "mainMenu",
  setScreen: (screen) => {
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
  },

  // State
  gameState: null,
  isLoaded: false,
  activeMatch: null,
  lastWeekSummary: null,
  dismissWeekSummary: () => set({ lastWeekSummary: null }),
  lastMatchResult: null,
  selectedPlayerId: null,
  selectedFixtureId: null,
  saveSlots: [],
  isSaving: false,
  isLoadingSave: false,
  autosaveError: null,

  // Scenario transient state
  selectedScenarioId: null,
  setSelectedScenario: (id) => set({ selectedScenarioId: id }),
  scenarioProgress: null,
  scenarioOutcome: null,
  dismissScenarioOutcome: () => set({ scenarioOutcome: null }),

  // Celebration transient state
  pendingCelebration: null,
  dismissCelebration: () => set({ pendingCelebration: null }),

  // Cross-screen fixture filter
  pendingFixtureClubFilter: null,
  setPendingFixtureClubFilter: (filter) => set({ pendingFixtureClubFilter: filter }),

  // Day-by-day simulation state
  weekSimulation: null,

  // Start new game
  startNewGame: async (config) => {
    // Apply scenario config overrides before world generation
    const scenarioId = get().selectedScenarioId;
    const scenario = scenarioId ? getScenarioById(scenarioId) : undefined;
    const effectiveConfig = scenario ? applyScenarioSetup(config, scenario) : config;

    const selectedCountries = effectiveConfig.selectedCountries ?? ["england"];
    const rng = createRNG(effectiveConfig.worldSeed);
    const { leagues, clubs, players, fixtures, territories } = await initializeWorld(
      rng,
      selectedCountries,
    );
    const scout = createScout(effectiveConfig, rng);
    const contacts: Record<string, Contact> = {};
    const startingContacts = generateStartingContacts(rng, scout);

    // Generate initial unsigned youth so the pool is populated from game start.
    // Country data is loaded into SYNC_REGISTRY by initializeWorld, so getCountryDataSync works.
    const initialUnsignedYouth: Record<string, UnsignedYouth> = {};
    if (effectiveConfig.specialization === "youth") {
      const youthRng = createRNG(`${effectiveConfig.worldSeed}-youth-s1`);
      const allCountryKeys = [...selectedCountries, ...getSecondaryCountries()];
      for (const countryKey of allCountryKeys) {
        const countryData = getCountryDataSync(countryKey);
        if (!countryData) continue;
        // Call multiple times per country to overcome 30% chance gate
        for (let attempt = 0; attempt < 10; attempt++) {
          const batch = generateRegionalYouth(youthRng, countryData, 1, attempt + 1, []);
          for (const y of batch) initialUnsignedYouth[y.id] = y;
        }
      }
    }

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
      // Secondary regions
      USA: "usa",
      Mexico: "mexico",
      Canada: "canada",
      Nigeria: "nigeria",
      Ghana: "ghana",
      "Ivory Coast": "ivorycoast",
      Egypt: "egypt",
      "South Africa": "southafrica",
      Senegal: "senegal",
      Cameroon: "cameroon",
      Japan: "japan",
      "South Korea": "southkorea",
      "Saudi Arabia": "saudiarabia",
      China: "china",
      Australia: "australia",
      "New Zealand": "newzealand",
    };
    const allPlayerIds = Object.keys(players);

    // Youth-focused contact types should reference unsigned youth, not seniors
    const YOUTH_CONTACT_TYPES = new Set([
      "academyCoach", "grassrootsOrganizer", "schoolCoach",
      "youthAgent", "academyDirector", "localScout",
    ]);

    for (const c of startingContacts) {
      const countryCode = regionToCountry[c.region ?? ""];
      const isYouthContact = YOUTH_CONTACT_TYPES.has(c.type)
        && effectiveConfig.specialization === "youth";

      let pool: string[];
      if (isYouthContact) {
        // Use unsigned youth IDs so tips/intel reference youth players
        const youthIds = Object.values(initialUnsignedYouth)
          .filter(y => !y.placed && !y.retired)
          .filter(y => !countryCode || y.country.toLowerCase() === countryCode)
          .map(y => y.id);
        pool = youthIds.length > 0 ? youthIds : Object.keys(initialUnsignedYouth);
      } else {
        const candidateIds = countryCode
          ? allPlayerIds.filter((id) => {
              const p = players[id];
              const club = p ? clubs[p.clubId] : undefined;
              const league = club ? leagues[club.leagueId] : undefined;
              return league?.country === countryCode;
            })
          : [];
        pool = candidateIds.length > 0 ? candidateIds : allPlayerIds;
      }
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
      seed: effectiveConfig.worldSeed,
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
      countries: [...selectedCountries, ...getSecondaryCountries()],
      narrativeEvents: [],
      activeStorylines: [],
      rivalScouts: {},
      unlockedTools: [],
      managerProfiles: {},
      seasonEvents: initialSeasonEvents,
      transferWindow: initialTransferWindow,
      discoveryRecords: [],
      performanceHistory: [],
      playedFixtures: [],
      watchlist: [],
      contactIntel: {},
      unsignedYouth: initialUnsignedYouth,
      placementReports: {},
      gutFeelings: [],
      alumniRecords: [],
      legacyScore: {
        youthFound: 0,
        firstTeamBreakthroughs: 0,
        internationalCapsFromFinds: 0,
        totalScore: 0,
        clubsWorkedAt: 0,
        countriesScouted: 0,
        careerHighTier: 0,
        totalSeasons: 0,
        bestDiscoveryName: "",
        bestDiscoveryPA: 0,
        scenariosCompleted: 0,
      },
      subRegions: {},
      retiredPlayerIds: [],
      // First-Team Scouting System
      managerDirectives: [],
      clubResponses: [],
      transferRecords: [],
      systemFitCache: {},
      // Data Scouting System
      predictions: [],
      dataAnalysts: [],
      statisticalProfiles: {},
      anomalyFlags: [],
      analystReports: {},
      createdAt: Date.now(),
      lastSaved: Date.now(),
      totalWeeksPlayed: 0,
    };

    // ── Phase 2 initialization ──────────────────────────────────────────────

    // 1. Initialize finances
    const finances = initializeFinances(scout);

    // 2. Generate rival scouts (uses a dedicated seed)
    const rivalRng = createRNG(`${effectiveConfig.worldSeed}-rivals-init`);
    const rivalScouts = generateRivalScouts(rivalRng, tempState);

    // 3. Generate manager profiles for all clubs
    const managerRng = createRNG(`${effectiveConfig.worldSeed}-managers-init`);
    const managerProfiles = generateManagerProfiles(managerRng, clubs);

    // 4. Check for any starting tools the scout might already qualify for
    const startingTools = checkToolUnlocks(scout, []);

    // 5. Generate initial manager directives for first-team scouts
    let initialDirectives: ManagerDirective[] = [];
    if (effectiveConfig.specialization === "firstTeam" && scout.currentClubId) {
      const directiveRng = createRNG(`${effectiveConfig.worldSeed}-directives-s1`);
      const club = clubs[scout.currentClubId];
      const manager = managerProfiles[scout.currentClubId];
      if (club && manager) {
        initialDirectives = generateDirectives(
          directiveRng,
          club,
          manager,
          players,
          1,
        );
      }
    }

    const specializationLabel =
      effectiveConfig.specialization === "youth" ? "Youth Scout"
      : effectiveConfig.specialization === "firstTeam" ? "First Team Scout"
      : effectiveConfig.specialization === "regional" ? "Regional Expert"
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
      managerDirectives: initialDirectives,
    };

    // Apply scenario GameState overrides (week, season, reputation, tier, activeScenarioId)
    const finalGameState = scenario ? applyScenarioOverrides(gameState, scenario) : gameState;

    set({
      gameState: finalGameState,
      isLoaded: true,
      currentScreen: "dashboard",
      selectedScenarioId: null,
      scenarioProgress: null,
      scenarioOutcome: null,
    });

    // Trigger specialization-aware onboarding tutorial
    const onboardingId = resolveOnboardingSequence(
      effectiveConfig.specialization,
      !!effectiveConfig.startingClubId,
    );
    useTutorialStore.getState().startSequence(onboardingId);
  },

  loadGame: (state) => {
    // Deep-spread to avoid mutating the caller's object (Fix #23)
    const migrated = {
      ...state,
      scout: { ...state.scout, skills: { ...state.scout.skills } },
      finances: state.finances ? { ...state.finances } : state.finances,
    };
    // Migration: add new scout skills if loading an older save
    if (migrated.scout.skills.playerJudgment === undefined) {
      migrated.scout.skills.playerJudgment = 5;
      migrated.scout.skills.potentialAssessment = 5;
    }
    // Migration: add careerPath to scout if missing
    if (migrated.scout.careerPath === undefined) {
      migrated.scout.careerPath = "club";
    }
    // Migration: convert old equipmentLevel to new equipment loadout system
    if (migrated.finances && !migrated.finances.equipment) {
      migrated.finances.equipment = migrateEquipmentLevel(migrated.finances.equipmentLevel);
    }
    // Migration: economics revamp — add new financial fields
    if (migrated.finances && migrated.finances.careerPath === undefined) {
      migrated.finances = migrateFinancialRecord(migrated.finances, migrated.scout);
    }
    set({ gameState: migrated, isLoaded: true, currentScreen: "dashboard" });
  },

  saveGame: () => {
    const { gameState } = get();
    if (!gameState) return null;
    const saved = { ...gameState, lastSaved: Date.now() };
    set({ gameState: saved });
    // Persist to IndexedDB (autosave slot 0) — fire and forget (Fix #4)
    dbSaveGame(AUTOSAVE_SLOT, "autosave", saved).catch((err) => {
      console.warn("saveGame: IndexedDB persist failed:", err);
    });
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
        // Migration: add new scout skills if loading an older save
        if (state.scout.skills.playerJudgment === undefined) {
          state.scout.skills.playerJudgment = 5;
          state.scout.skills.potentialAssessment = 5;
        }
        // Migration: add careerPath to scout if missing
        if (state.scout.careerPath === undefined) {
          (state.scout as Scout & { careerPath?: string }).careerPath = "club";
        }
        // Migration: economics revamp
        if (state.finances && state.finances.careerPath === undefined) {
          state.finances = migrateFinancialRecord(state.finances, state.scout);
        }
        // Migration: storyline system
        if (!Array.isArray(state.activeStorylines)) {
          state.activeStorylines = [];
        }
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

    // Tutorial auto-advance — generic and specialization-specific conditions.
    const tutorial = useTutorialStore.getState();
    tutorial.checkAutoAdvance("activityScheduled");

    const YOUTH_ACTIVITIES = new Set([
      "schoolMatch", "grassrootsTournament", "streetFootball",
      "academyTrialDay", "youthFestival", "youthTournament",
    ]);
    if (YOUTH_ACTIVITIES.has(activity.type)) {
      tutorial.checkAutoAdvance("youthActivityScheduled");
    }

    const DATA_ACTIVITIES = new Set([
      "databaseQuery", "deepVideoAnalysis", "statsBriefing",
      "algorithmCalibration", "marketInefficiency",
    ]);
    if (DATA_ACTIVITIES.has(activity.type)) {
      tutorial.checkAutoAdvance("dataActivityScheduled");
    }
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

    // ── Demo limit gate ────────────────────────────────────────────────────
    if (isDemoLimitReached(gameState.currentSeason)) {
      set({ currentScreen: "demoEnd" as GameScreen });
      return;
    }

    // ── Gate: play all scheduled attendMatch fixtures interactively first ───
    // Find every attendMatch activity in this week's schedule that has a
    // targetId (fixture ID) which hasn't been played via the MatchScreen yet.
    // Youth scouts skip this gate — they cannot attend first-team matches.
    if (gameState.scout.primarySpecialization !== "youth") {
      const pendingFixtureIds = get().getPendingMatches();
      if (pendingFixtureIds.length > 0) {
        // Launch the first unplayed fixture. The user will call endMatch(), which
        // records it in playedFixtures. They then click "Advance Week" again and
        // this gate re-evaluates — eventually clearing all pending matches.
        get().startMatch(pendingFixtureIds[0]);
        return;
      }
    }

    const rng = createRNG(`${gameState.seed}-week-${gameState.currentWeek}-${gameState.currentSeason}`);

    // Process scheduled activities → fatigue, skill XP, attribute XP
    const weekResult = processCompletedWeek(gameState.schedule, gameState.scout, rng);

    // ── Roll activity quality for each unique activity type ─────────────────
    const qualityRng = createRNG(
      `${gameState.seed}-quality-${gameState.currentWeek}-${gameState.currentSeason}`,
    );
    const qualityRolls: ActivityQualityResult[] = [];
    const qualitySeenTypes = new Set<string>();
    for (const act of gameState.schedule.activities) {
      if (!act || qualitySeenTypes.has(act.type)) continue;
      // Skip rest/travel — no quality dimension
      if (act.type === "rest" || act.type === "travel" || act.type === "internationalTravel") continue;
      qualitySeenTypes.add(act.type);
      qualityRolls.push(rollActivityQuality(qualityRng, act.type, gameState.scout));
    }

    // Apply blended XP multiplier from quality rolls
    if (qualityRolls.length > 0) {
      const avgMultiplier =
        qualityRolls.reduce((sum, q) => sum + q.multiplier, 0) / qualityRolls.length;
      for (const skill of Object.keys(weekResult.skillXpGained) as Array<keyof typeof weekResult.skillXpGained>) {
        const val = weekResult.skillXpGained[skill];
        if (val) weekResult.skillXpGained[skill] = Math.round(val * avgMultiplier);
      }
      for (const attr of Object.keys(weekResult.attributeXpGained) as Array<keyof typeof weekResult.attributeXpGained>) {
        const val = weekResult.attributeXpGained[attr];
        if (val) weekResult.attributeXpGained[attr] = Math.round(val * avgMultiplier);
      }
    }

    let updatedScout = applyWeekResults(gameState.scout, weekResult);

    // Issue 5c+5d: Apply tool fatigue reduction bonuses
    const weekToolBonuses = getActiveToolBonuses(gameState.unlockedTools);
    const fatigueReduction = weekToolBonuses.fatigueReduction ?? 0;
    const travelFatigueReduction = weekToolBonuses.travelFatigueReduction ?? 0;
    if (fatigueReduction > 0 || travelFatigueReduction > 0) {
      // Check if any travel activities were scheduled this week
      const hasTravelActivity = gameState.schedule.activities.some(
        (a) => a?.type === "internationalTravel" || a?.type === "travel",
      );
      const totalReduction = fatigueReduction + (hasTravelActivity ? travelFatigueReduction : 0);
      if (totalReduction > 0) {
        updatedScout = {
          ...updatedScout,
          fatigue: Math.max(0, updatedScout.fatigue - totalReduction),
        };
      }
    }

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
        gameState.currentWeek,
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
      let updatedIntel = { ...(stateWithScheduleApplied.contactIntel ?? {}) };

      // Issue 5b: Get tool bonuses for relationship gain
      const meetingToolBonuses = getActiveToolBonuses(stateWithScheduleApplied.unlockedTools);
      const meetingEquipBonuses = stateWithScheduleApplied.finances?.equipment
        ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
        : undefined;

      for (const contactId of weekResult.meetingsHeld) {
        const contact = updatedContacts[contactId];
        if (!contact) continue;

        const meetingRng = createRNG(
          `${gameState.seed}-meeting-${contactId}-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const result = meetContact(meetingRng, stateWithScheduleApplied.scout, contact);

        // Issue 5b: Apply relationship gain bonus from tools + equipment
        const relBonus = (meetingToolBonuses.relationshipGainBonus ?? 0) + (meetingEquipBonuses?.relationshipGainBonus ?? 0);
        const adjustedChange = result.relationshipChange >= 0
          ? Math.round(result.relationshipChange * (1 + relBonus))
          : result.relationshipChange;

        // Apply relationship change — clamp to 0–100
        const newRelationship = Math.max(
          0,
          Math.min(100, contact.relationship + adjustedChange),
        );
        updatedContacts[contactId] = { ...contact, relationship: newRelationship };

        // Issue 7: Store contact intel entries
        for (const hint of result.intel) {
          const existing = updatedIntel[hint.playerId] ?? [];
          updatedIntel[hint.playerId] = [...existing, hint];
        }

        // Build meeting summary message
        const parts: string[] = [
          `You met with ${contact.name} (${contact.type}).`,
          `Relationship ${adjustedChange >= 0 ? "improved" : "declined"} by ${Math.abs(adjustedChange)} points (now ${newRelationship}/100).`,
        ];

        for (const intel of result.intel) {
          const seniorPlayer = stateWithScheduleApplied.players[intel.playerId];
          const youthEntry = stateWithScheduleApplied.unsignedYouth[intel.playerId];
          const resolvedPlayer = seniorPlayer ?? youthEntry?.player;
          const playerName = resolvedPlayer
            ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
            : "a player";
          parts.push("");
          parts.push(`INTEL on ${playerName}: ${intel.hint}`);
        }

        for (const tip of result.tips) {
          const seniorPlayer = stateWithScheduleApplied.players[tip.playerId];
          const youthEntry = stateWithScheduleApplied.unsignedYouth[tip.playerId];
          const resolvedPlayer = seniorPlayer ?? youthEntry?.player;
          const playerName = resolvedPlayer
            ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
            : "a player";
          parts.push("");
          parts.push(`TIP: ${playerName} ${tip.description}`);
        }

        // Youth scout: boost visibility/buzz for youth mentioned in tips
        if (stateWithScheduleApplied.scout.primarySpecialization === "youth") {
          for (const tip of result.tips) {
            const youth = stateWithScheduleApplied.unsignedYouth[tip.playerId];
            if (!youth || youth.placed || youth.retired) continue;
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              unsignedYouth: {
                ...stateWithScheduleApplied.unsignedYouth,
                [tip.playerId]: {
                  ...youth,
                  visibility: Math.min(100, youth.visibility + 5),
                  buzzLevel: Math.min(100, youth.buzzLevel + 5),
                  discoveredBy: youth.discoveredBy.includes(stateWithScheduleApplied.scout.id)
                    ? youth.discoveredBy
                    : [...youth.discoveredBy, stateWithScheduleApplied.scout.id],
                },
              },
            };
          }
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
        contactIntel: updatedIntel,
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
        if (playerObs.length === 0) {
          reportMessages.push({
            id: `report-noobs-${playerId}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Report Failed: ${player.firstName} ${player.lastName}`,
            body: `You attempted to write a report on ${player.firstName} ${player.lastName}, but you have no observations on this player yet. Scout them first through match attendance, training visits, or venue activities before writing a report.`,
            read: false,
            actionRequired: false,
            relatedId: playerId,
            relatedEntityType: "player" as const,
          });
          continue;
        }

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
          relatedId: playerId,
          relatedEntityType: "player" as const,
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

    // f) Activity feedback — narrative-driven feedback using quality rolls
    //    Scouting activities (academy/tournament/training/video) skip here;
    //    their narratives are prepended to observation messages in section (g).
    {
      const SCOUTING_TYPES = new Set([
        "academyVisit", "youthTournament", "trainingVisit", "watchVideo",
        "schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay",
        "youthFestival", "followUpSession", "parentCoachMeeting",
        "reserveMatch", "scoutingMission", "oppositionAnalysis", "agentShowcase", "trialMatch",
        "databaseQuery", "deepVideoAnalysis", "statsBriefing", "algorithmCalibration",
        "marketInefficiency", "analyticsTeamMeeting",
      ]);
      const ACTIVITY_LABELS: Record<string, string> = {
        attendMatch: "Match Attendance",
        watchVideo: "Video Analysis",
        writeReport: "Report Writing",
        networkMeeting: "Network Meeting",
        trainingVisit: "Training Visit",
        study: "Study Session",
        academyVisit: "Academy Visit",
        youthTournament: "Youth Tournament",
      };
      const SKILL_LABELS_MAP: Record<string, string> = {
        technicalEye: "Technical Eye", physicalAssessment: "Physical Assessment",
        psychologicalRead: "Psychological Read", tacticalUnderstanding: "Tactical Understanding",
        dataLiteracy: "Data Literacy", playerJudgment: "Player Judgment",
        potentialAssessment: "Potential Assessment",
      };
      const TIER_LABELS: Record<string, string> = {
        poor: "Poor", average: "Average", good: "Good",
        excellent: "Excellent", exceptional: "Exceptional",
      };

      const feedbackMessages: InboxMessage[] = [];
      for (const qr of qualityRolls) {
        // Skip scouting types — they get narratives prepended in section (g)
        if (SCOUTING_TYPES.has(qr.activityType)) continue;

        const label = ACTIVITY_LABELS[qr.activityType] ?? qr.activityType;
        const tierLabel = TIER_LABELS[qr.tier] ?? qr.tier;

        const parts: string[] = [qr.narrative, ""];
        const skillXp = weekResult.skillXpGained;
        const attrXp = weekResult.attributeXpGained;
        for (const [skill, val] of Object.entries(skillXp)) {
          if (val && val > 0) parts.push(`${SKILL_LABELS_MAP[skill] ?? skill} +${val} XP`);
        }
        for (const [attr, val] of Object.entries(attrXp)) {
          if (val && val > 0) parts.push(`${attr.charAt(0).toUpperCase() + attr.slice(1)} +${val} XP`);
        }
        parts.push(`Fatigue ${weekResult.fatigueChange >= 0 ? "+" : ""}${weekResult.fatigueChange}.`);

        feedbackMessages.push({
          id: `activity-${qr.activityType}-w${stateWithScheduleApplied.currentWeek}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: `${label} (${tierLabel})`,
          body: parts.join("\n"),
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

    // g) Activity-based observations — academy visits, youth tournaments,
    //    training visits, and video analysis generate player observations.
    //    Quality rolls modify discovery counts and prepend narratives.
    let weekPlayersDiscovered = 0;
    let weekObservationsGenerated = 0;
    {
      const actObsRng = createRNG(
        `${gameState.seed}-actobs-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const updatedObservations = { ...stateWithScheduleApplied.observations };
      let actDiscoveries = [...(stateWithScheduleApplied.discoveryRecords ?? [])];
      const actObsMessages: InboxMessage[] = [];
      const allPlayers = Object.values(stateWithScheduleApplied.players);
      const existingObs = Object.values(updatedObservations);
      const observedPlayerIds = new Set(existingObs.map((o) => o.playerId));
      const currentScout = stateWithScheduleApplied.scout;

      // Lookup quality roll for a given activity type
      const qualityMap = new Map(qualityRolls.map((q) => [q.activityType, q]));

      const TIER_LABELS: Record<string, string> = {
        poor: "Poor", average: "Average", good: "Good",
        excellent: "Excellent", exceptional: "Exceptional",
      };

      // Helper: apply discovery modifier to base range, clamped to min 1
      function adjustedRange(baseMin: number, baseMax: number, mod: number): [number, number] {
        return [Math.max(1, baseMin + mod), Math.max(1, baseMax + mod)];
      }

      // --- Academy Visit: base 2-3, modified by quality ---
      // Youth scouts use the proper youth venue system to draw from unsignedYouth.
      if (weekResult.academyVisitsExecuted > 0) {
        const qr = qualityMap.get("academyVisit");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: use getYouthVenuePool to draw from unsigned youth
          const venuePool = getYouthVenuePool(
            actObsRng,
            "academyTrialDay", // academyVisit maps to academyTrialDay venue
            stateWithScheduleApplied.unsignedYouth,
            currentScout,
          );
          const count = Math.min(venuePool.length, actObsRng.nextInt(rangeMin, rangeMax));
          for (let i = 0; i < count; i++) {
            const youth = venuePool[i];
            const existingObsForYouth = Object.values(updatedObservations).filter(
              (o) => o.playerId === youth.player.id,
            );
            const result = processVenueObservation(
              actObsRng, currentScout, youth, "academyVisit",
              existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
            );
            updatedObservations[result.observation.id] = result.observation;
            weekObservationsGenerated++;
            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }
            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-academy-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You observed ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} during an academy visit. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        } else {
          // Non-youth scouts: existing behaviour using signed players
          const youthPool = allPlayers.filter(
            (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
          );
          const count = Math.min(youthPool.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count && youthPool.length > 0; i++) {
            const idx = actObsRng.nextInt(0, youthPool.length - 1);
            const player = youthPool[idx];
            youthPool.splice(idx, 1);

            const obs = observePlayerLight(actObsRng, player, currentScout, "academyVisit", Object.values(updatedObservations));
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            updatedObservations[obs.id] = obs;
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-academy-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Academy Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during an academy visit. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }
        }
      }

      // --- Youth Tournament: base 3-5, modified by quality ---
      // Youth scouts use the proper youth venue system to draw from unsignedYouth.
      if (weekResult.youthTournamentsExecuted > 0) {
        const qr = qualityMap.get("youthTournament");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(3, 5, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: use getYouthVenuePool with youthFestival venue type
          const venuePool = getYouthVenuePool(
            actObsRng,
            "youthFestival", // youthTournament maps to youthFestival venue
            stateWithScheduleApplied.unsignedYouth,
            currentScout,
          );
          const count = Math.min(venuePool.length, actObsRng.nextInt(rangeMin, rangeMax));
          for (let i = 0; i < count; i++) {
            const youth = venuePool[i];
            const existingObsForYouth = Object.values(updatedObservations).filter(
              (o) => o.playerId === youth.player.id,
            );
            const result = processVenueObservation(
              actObsRng, currentScout, youth, "youthTournament",
              existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
            );
            updatedObservations[result.observation.id] = result.observation;
            weekObservationsGenerated++;
            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }
            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-tournament-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You spotted ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country} at a youth tournament. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        } else {
          // Non-youth scouts: existing behaviour using signed players
          const youthPool = allPlayers.filter(
            (p) => p.age <= 21 && !observedPlayerIds.has(p.id),
          );
          const count = Math.min(youthPool.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count && youthPool.length > 0; i++) {
            const idx = actObsRng.nextInt(0, youthPool.length - 1);
            const player = youthPool[idx];
            youthPool.splice(idx, 1);

            const obs = observePlayerLight(actObsRng, player, currentScout, "youthTournament", Object.values(updatedObservations));
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            updatedObservations[obs.id] = obs;
            observedPlayerIds.add(player.id);
            weekObservationsGenerated++;

            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-tournament-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Youth Tournament${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} at a youth tournament. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }
        }
      }

      // --- Training Visit: base 1-2, modified by quality ---
      if (weekResult.trainingVisitsExecuted > 0) {
        const qr = qualityMap.get("trainingVisit");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const clubId = currentScout.currentClubId;
        const candidatePool = clubId
          ? allPlayers.filter((p) => p.clubId === clubId)
          : allPlayers;
        const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers];
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "trainingGround", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-training-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Training Visit${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during training. ${obs.attributeReadings.length} attributes assessed with high accuracy. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Video Analysis: base 1-2, modified by quality ---
      if (weekResult.videoSessionsExecuted > 0) {
        const qr = qualityMap.get("watchVideo");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        if (currentScout.primarySpecialization === "youth") {
          // Youth scouts: map video choice to a youth venue pool
          const videoActivity = gameState.schedule.activities.find(a => a?.type === "watchVideo");
          const venueMapping: Record<string, string> = {
            "video-academy": "academyTrialDay",
            "video-grassroots": "grassrootsTournament",
            "video-school": "schoolMatch",
          };
          const venueType = (venueMapping[videoActivity?.targetId ?? ""] ?? "youthFestival") as
            "academyTrialDay" | "grassrootsTournament" | "schoolMatch" | "youthFestival";
          const venuePool = getYouthVenuePool(
            actObsRng, venueType,
            stateWithScheduleApplied.unsignedYouth, currentScout,
          );
          const count = Math.min(venuePool.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count; i++) {
            const youth = venuePool[i];
            const existingObsForYouth = Object.values(updatedObservations).filter(
              (o) => o.playerId === youth.player.id,
            );
            const result = processVenueObservation(
              actObsRng, currentScout, youth, "videoAnalysis",
              existingObsForYouth, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason,
            );
            updatedObservations[result.observation.id] = result.observation;
            weekObservationsGenerated++;
            const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
            if (!alreadyDiscovered) {
              actDiscoveries = [...actDiscoveries, recordDiscovery(youth.player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
              weekPlayersDiscovered++;
            }
            // Smaller visibility/buzz boost for video vs physical venue
            const updatedYouth = stateWithScheduleApplied.unsignedYouth[youth.id];
            if (updatedYouth) {
              stateWithScheduleApplied = {
                ...stateWithScheduleApplied,
                unsignedYouth: {
                  ...stateWithScheduleApplied.unsignedYouth,
                  [youth.id]: {
                    ...updatedYouth,
                    visibility: Math.min(100, updatedYouth.visibility + 2),
                    buzzLevel: Math.min(100, updatedYouth.buzzLevel + 2),
                    discoveredBy: updatedYouth.discoveredBy.includes(currentScout.id)
                      ? updatedYouth.discoveredBy
                      : [...updatedYouth.discoveredBy, currentScout.id],
                  },
                },
              };
            }
            const topAttrs = result.observation.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-video-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${narrativePrefix}You reviewed footage of ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        } else {
          // Non-youth scouts: existing senior player video analysis
          const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
          const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
          const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));

          for (let i = 0; i < count && pool.length > 0; i++) {
            const idx = actObsRng.nextInt(0, pool.length - 1);
            const player = pool[idx];
            pool.splice(idx, 1);

            const obs = observePlayerLight(actObsRng, player, currentScout, "videoAnalysis", Object.values(updatedObservations));
            obs.week = stateWithScheduleApplied.currentWeek;
            obs.season = stateWithScheduleApplied.currentSeason;
            updatedObservations[obs.id] = obs;
            weekObservationsGenerated++;

            const topAttrs = obs.attributeReadings
              .sort((a, b) => b.perceivedValue - a.perceivedValue)
              .slice(0, 3)
              .map((r) => `${r.attribute} ${r.perceivedValue}`)
              .join(", ");
            const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
            actObsMessages.push({
              id: `obs-video-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Video Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
              body: `${narrativePrefix}You reviewed video footage of ${player.firstName} ${player.lastName} (${player.position}). ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. This supplements your existing observations.`,
              read: false,
              actionRequired: false,
              relatedId: player.id,
              relatedEntityType: "player" as const,
            });
          }
        }
      }

      // --- Reserve Match: observe 2-4 fringe players from scout's own club ---
      if (weekResult.reserveMatchesExecuted > 0) {
        const qr = qualityMap.get("reserveMatch");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(2, 4, discMod);
        const clubId = currentScout.currentClubId;
        const candidatePool = clubId
          ? allPlayers.filter((p) => p.clubId === clubId && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id));
        const pool = candidatePool.length > 0 ? [...candidatePool] : [...allPlayers.filter((p) => !observedPlayerIds.has(p.id))];
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "reserveMatch", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-reserve-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Reserve Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You observed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} in a reserve fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Scouting Mission: observe 4-6 players across one league ---
      if (weekResult.scoutingMissionsExecuted > 0) {
        const qr = qualityMap.get("scoutingMission");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(4, 6, discMod);
        // Pick players from a random league's clubs (prefer scout's territory)
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        const targetLeagueId = leagueIds.length > 0
          ? leagueIds[actObsRng.nextInt(0, leagueIds.length - 1)]
          : null;
        const targetLeague = targetLeagueId ? stateWithScheduleApplied.leagues[targetLeagueId] : null;
        const leagueClubIds = targetLeague ? new Set(targetLeague.clubIds) : new Set<string>();
        const pool = (targetLeague && leagueClubIds.size > 0
          ? allPlayers.filter((p) => leagueClubIds.has(p.clubId) && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
        ).slice();
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "liveMatch", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-mission-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Scouting Mission${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You spotted ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} during a scouting mission. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Opposition Analysis: observe 2-3 players from an opposing team ---
      if (weekResult.oppositionAnalysesExecuted > 0) {
        const qr = qualityMap.get("oppositionAnalysis");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        // Pick a random opposing club (any club that is not the scout's own)
        const clubIds = Object.keys(stateWithScheduleApplied.clubs).filter(
          (id) => id !== currentScout.currentClubId,
        );
        const targetClubId = clubIds.length > 0
          ? clubIds[actObsRng.nextInt(0, clubIds.length - 1)]
          : null;
        const pool = (targetClubId
          ? allPlayers.filter((p) => p.clubId === targetClubId && !observedPlayerIds.has(p.id))
          : allPlayers.filter((p) => !observedPlayerIds.has(p.id))
        ).slice();
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "oppositionAnalysis", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-opposition-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Opposition Analysis${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}You analysed ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} ahead of a fixture. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Agent Showcase: observe 2-3 players presented by agents ---
      if (weekResult.agentShowcasesExecuted > 0) {
        const qr = qualityMap.get("agentShowcase");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(2, 3, discMod);
        const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "agentShowcase", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-showcase-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Agent Showcase${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}An agent presented ${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} to you directly. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Trial Match: observe 1-2 players in a controlled trial ---
      if (weekResult.trialMatchesExecuted > 0) {
        const qr = qualityMap.get("trialMatch");
        const discMod = qr?.discoveryModifier ?? 0;
        const [rangeMin, rangeMax] = adjustedRange(1, 2, discMod);
        const pool = allPlayers.filter((p) => !observedPlayerIds.has(p.id)).slice();
        const count = Math.min(pool.length, actObsRng.nextInt(rangeMin, rangeMax));
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";

        for (let i = 0; i < count && pool.length > 0; i++) {
          const idx = actObsRng.nextInt(0, pool.length - 1);
          const player = pool[idx];
          pool.splice(idx, 1);

          const obs = observePlayerLight(actObsRng, player, currentScout, "trialMatch", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          observedPlayerIds.add(player.id);
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(player, currentScout, stateWithScheduleApplied.currentWeek, stateWithScheduleApplied.currentSeason)];
            weekPlayersDiscovered++;
          }

          // Resolve trial outcome for any pending trial responses
          if (currentScout.currentClubId) {
            const trialRng = createRNG(
              `${gameState.seed}-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
            );
            const trialClub = stateWithScheduleApplied.clubs[currentScout.currentClubId];
            if (trialClub) {
              const trialOutcome = processTrialOutcome(
                trialRng,
                player,
                trialClub,
                stateWithScheduleApplied.players,
              );
              // Update any pending trial ClubResponse with the resolved outcome
              const updatedClubResponses = stateWithScheduleApplied.clubResponses.map((resp) =>
                resp.response === "trial" && !resp.directiveId
                  ? { ...resp, response: trialOutcome }
                  : resp,
              );
              stateWithScheduleApplied = {
                ...stateWithScheduleApplied,
                clubResponses: updatedClubResponses,
              };
            }
          }

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const club = player.clubId ? stateWithScheduleApplied.clubs[player.clubId] : undefined;
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-trial-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Trial Match${tierLabel ? ` (${tierLabel})` : ""}: ${player.firstName} ${player.lastName}`,
            body: `${narrativePrefix}${player.firstName} ${player.lastName} (age ${player.age}, ${player.position}) from ${club?.name ?? "Unknown"} participated in a trial match. Closely assessed under controlled conditions. ${obs.attributeReadings.length} attributes recorded. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Contract Negotiations: no observations — just XP and inbox message ---
      if (weekResult.contractNegotiationsExecuted > 0) {
        actObsMessages.push({
          id: `obs-negotiation-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Contract Negotiation Assistance",
          body: `You assisted the club's negotiation team this week. Your insight into the player's strengths and market value helped structure the offer. XP gained in persuasion and network skills.`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Database Query: generate statistical profiles for league players ---
      if (weekResult.databaseQueriesExecuted > 0) {
        const dbRng = createRNG(
          `${gameState.seed}-dbquery-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        if (leagueIds.length > 0) {
          const targetLeagueId = leagueIds[dbRng.nextInt(0, leagueIds.length - 1)];
          const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
          if (targetLeague) {
            const queryResult = executeDatabaseQuery(
              dbRng,
              currentScout,
              targetLeague,
              stateWithScheduleApplied.players,
              {},
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
            );
            const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
            for (const profile of queryResult.profiles) {
              updatedProfiles[profile.playerId] = profile;
            }
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              statisticalProfiles: updatedProfiles,
            };
            const playerNames = queryResult.playerIds
              .slice(0, 5)
              .map((id) => {
                const p = stateWithScheduleApplied.players[id];
                return p ? `${p.firstName} ${p.lastName}` : id;
              })
              .join(", ");
            actObsMessages.push({
              id: `obs-dbquery-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Database Query: ${targetLeague.name}`,
              body: `Your database query returned ${queryResult.playerIds.length} player${queryResult.playerIds.length !== 1 ? "s" : ""} in ${targetLeague.name}. Statistical profiles generated. Key finds: ${playerNames || "none"}.`,
              read: false,
              actionRequired: false,
            });
          }
        }
      }

      // --- Deep Video Analysis: enhanced statistical profile + observation ---
      if (weekResult.deepVideoAnalysesExecuted > 0) {
        const deepVideoRng = createRNG(
          `${gameState.seed}-deepvideo-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const previouslyObserved = allPlayers.filter((p) => observedPlayerIds.has(p.id));
        const pool = previouslyObserved.length > 0 ? [...previouslyObserved] : [...allPlayers];
        if (pool.length > 0) {
          const player = pool[deepVideoRng.nextInt(0, pool.length - 1)];
          const existingProfile = stateWithScheduleApplied.statisticalProfiles[player.id];
          const deepProfile = executeDeepVideoAnalysis(
            deepVideoRng,
            currentScout,
            player,
            stateWithScheduleApplied.currentSeason,
            stateWithScheduleApplied.currentWeek,
            existingProfile,
          );
          const updatedProfiles = {
            ...stateWithScheduleApplied.statisticalProfiles,
            [player.id]: deepProfile,
          };

          const obs = observePlayerLight(deepVideoRng, player, currentScout, "videoAnalysis", Object.values(updatedObservations));
          obs.week = stateWithScheduleApplied.currentWeek;
          obs.season = stateWithScheduleApplied.currentSeason;
          updatedObservations[obs.id] = obs;
          weekObservationsGenerated++;

          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            statisticalProfiles: updatedProfiles,
          };

          const topAttrs = obs.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          actObsMessages.push({
            id: `obs-deepvideo-${player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Deep Video Analysis: ${player.firstName} ${player.lastName}`,
            body: `You conducted an intensive video analysis session on ${player.firstName} ${player.lastName} (${player.position}). Statistical profile ${existingProfile ? "refined" : "created"}. ${obs.attributeReadings.length} attributes assessed. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Stats Briefing: generate anomaly flags and highlights ---
      if (weekResult.statsBriefingsExecuted > 0) {
        const briefingRng = createRNG(
          `${gameState.seed}-briefing-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const leagueIds = Object.keys(stateWithScheduleApplied.leagues);
        if (leagueIds.length > 0) {
          const targetLeagueId = leagueIds[briefingRng.nextInt(0, leagueIds.length - 1)];
          const targetLeague = stateWithScheduleApplied.leagues[targetLeagueId];
          if (targetLeague) {
            const briefing = generateStatsBriefing(
              briefingRng,
              currentScout,
              targetLeague,
              stateWithScheduleApplied.players,
              stateWithScheduleApplied.currentSeason,
              stateWithScheduleApplied.currentWeek,
            );
            const updatedAnomalyFlags = [
              ...stateWithScheduleApplied.anomalyFlags,
              ...briefing.anomalies,
            ];
            stateWithScheduleApplied = {
              ...stateWithScheduleApplied,
              anomalyFlags: updatedAnomalyFlags,
            };
            actObsMessages.push({
              id: `obs-briefing-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "feedback" as const,
              title: `Stats Briefing: ${targetLeague.name}`,
              body: briefing.highlights.join("\n"),
              read: false,
              actionRequired: false,
            });
          }
        }
      }

      // --- Data Conference: no observations — XP and networking ---
      if (weekResult.dataConferencesExecuted > 0) {
        actObsMessages.push({
          id: `obs-conference-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Data Conference Attended",
          body: `You attended a data analytics conference this week. Networking with analysts and data scientists from across football expanded your professional network and sharpened your statistical toolkit. XP gained in data literacy.`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Algorithm Calibration: improve accuracy of statistical profiles ---
      if (weekResult.algorithmCalibrationsExecuted > 0) {
        const calibrationRng = createRNG(
          `${gameState.seed}-calibration-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        // Reduce noise in existing profiles by re-running deep analysis on a sample
        const profiledPlayerIds = Object.keys(stateWithScheduleApplied.statisticalProfiles);
        const calibrated = Math.min(3, profiledPlayerIds.length);
        const sampleIds = calibrationRng.shuffle(profiledPlayerIds).slice(0, calibrated);
        if (sampleIds.length > 0) {
          const updatedProfiles = { ...stateWithScheduleApplied.statisticalProfiles };
          for (const playerId of sampleIds) {
            const player = stateWithScheduleApplied.players[playerId];
            const existingProfile = updatedProfiles[playerId];
            if (player && existingProfile) {
              updatedProfiles[playerId] = executeDeepVideoAnalysis(
                calibrationRng,
                currentScout,
                player,
                stateWithScheduleApplied.currentSeason,
                stateWithScheduleApplied.currentWeek,
                existingProfile,
              );
            }
          }
          stateWithScheduleApplied = {
            ...stateWithScheduleApplied,
            statisticalProfiles: updatedProfiles,
          };
        }
        actObsMessages.push({
          id: `obs-calibration-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Algorithm Calibration Complete",
          body: `You recalibrated your statistical models this week. ${calibrated} player profile${calibrated !== 1 ? "s" : ""} refined with improved accuracy. Future database queries will return more reliable data.`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Market Inefficiency Scan: identify undervalued players ---
      if (weekResult.marketInefficienciesExecuted > 0) {
        const marketRng = createRNG(
          `${gameState.seed}-market-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        // Find players whose CA significantly exceeds their market value expectations
        const undervalued = allPlayers
          .filter((p) => {
            const caExpectedValue = p.currentAbility * 50000;
            return p.marketValue < caExpectedValue * 0.7;
          })
          .slice();
        const sampleSize = Math.min(5, undervalued.length);
        const finds = marketRng.shuffle(undervalued).slice(0, sampleSize);
        const findsText = finds.length > 0
          ? finds.map((p) => {
              const club = p.clubId ? stateWithScheduleApplied.clubs[p.clubId] : undefined;
              return `${p.firstName} ${p.lastName} (${p.position}, ${club?.name ?? "Unknown"})`;
            }).join("; ")
          : "No significant inefficiencies found this week.";
        actObsMessages.push({
          id: `obs-market-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Market Inefficiency Scan",
          body: `Your scan identified ${finds.length} potentially undervalued player${finds.length !== 1 ? "s" : ""} this week.\n\n${findsText}`,
          read: false,
          actionRequired: false,
        });
      }

      // --- Analytics Team Meeting: generate analyst reports and update morale ---
      if (weekResult.analyticsTeamMeetingsExecuted > 0) {
        const meetingRng = createRNG(
          `${gameState.seed}-analystmeeting-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const updatedAnalysts = [...stateWithScheduleApplied.dataAnalysts];
        const updatedAnalystReports = { ...stateWithScheduleApplied.analystReports };

        for (let analystIdx = 0; analystIdx < updatedAnalysts.length; analystIdx++) {
          const analyst = updatedAnalysts[analystIdx];
          if (!analyst.assignedLeagueId) continue;
          const analystLeague = stateWithScheduleApplied.leagues[analyst.assignedLeagueId];
          if (!analystLeague) continue;

          const reportId = `analyst-report-${analyst.id}-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`;
          const report = generateAnalystReport(
            meetingRng,
            analyst,
            analystLeague,
            stateWithScheduleApplied.players,
            stateWithScheduleApplied.currentSeason,
            stateWithScheduleApplied.currentWeek,
            reportId,
          );
          updatedAnalystReports[reportId] = report;

          // Morale improves when a meeting is held
          updatedAnalysts[analystIdx] = updateAnalystMorale(analyst, { hadMeeting: true });
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          dataAnalysts: updatedAnalysts,
          analystReports: updatedAnalystReports,
        };

        actObsMessages.push({
          id: `obs-analystmeeting-w${stateWithScheduleApplied.currentWeek}-s${stateWithScheduleApplied.currentSeason}`,
          week: stateWithScheduleApplied.currentWeek,
          season: stateWithScheduleApplied.currentSeason,
          type: "feedback" as const,
          title: "Analytics Team Meeting",
          body: `You held a team meeting with your data analysts this week. ${updatedAnalysts.length > 0 ? `${updatedAnalysts.length} analyst${updatedAnalysts.length !== 1 ? "s" : ""} reported in. Reports are available in your analytics dashboard.` : "No analysts are currently assigned to your team."}`,
          read: false,
          actionRequired: false,
        });
      }

      // ── Youth-exclusive activity observation handlers ──────────────────────
      // These use the proper youth venue system (getYouthVenuePool + processVenueObservation)
      // which draws from unsignedYouth rather than signed professionals.

      // Check for pre-computed results from week simulation
      const simYouthResults = get().weekSimulation?.youthVenueResults;
      if (simYouthResults) {
        // Apply pre-computed youth venue results (avoids double-processing)
        Object.assign(updatedObservations, simYouthResults.newObservations);
        const dedupedNewDiscoveries = simYouthResults.newDiscoveries.filter(
          (nd) => !actDiscoveries.some((d) => d.playerId === nd.playerId),
        );
        actDiscoveries = [...actDiscoveries, ...dedupedNewDiscoveries];
        weekObservationsGenerated += simYouthResults.totalObservations;
        weekPlayersDiscovered += simYouthResults.totalDiscoveries;
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          unsignedYouth: { ...stateWithScheduleApplied.unsignedYouth, ...simYouthResults.updatedUnsignedYouth },
          observations: updatedObservations,
          discoveryRecords: actDiscoveries,
        };
      } else {
      // Fallback: process youth venues (for old saves without youthVenueResults)

      let updatedUnsignedYouthObs = { ...stateWithScheduleApplied.unsignedYouth };

      // Helper for youth venue observation processing
      const processYouthVenueActivity = (
        venueType: "schoolMatch" | "grassrootsTournament" | "streetFootball" | "academyTrialDay" | "youthFestival",
        executedCount: number,
        activityLabel: string,
        msgPrefix: string,
      ) => {
        if (executedCount <= 0) return;
        const qr = qualityMap.get(venueType);
        const discMod = qr?.discoveryModifier ?? 0;
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
        const equipBonuses = stateWithScheduleApplied.finances?.equipment
          ? getActiveEquipmentBonuses(stateWithScheduleApplied.finances.equipment.loadout)
          : { youthDiscoveryBonus: 0 };
        const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;

        const pool = getYouthVenuePool(
          actObsRng,
          venueType,
          updatedUnsignedYouthObs,
          currentScout,
          undefined,
          undefined,
          youthBonus,
        );

        // Apply quality modifier to pool size
        const adjustedCount = Math.max(1, pool.length + discMod);
        const finalPool = pool.slice(0, adjustedCount);

        for (let i = 0; i < finalPool.length; i++) {
          const youth = finalPool[i];
          const context = mapVenueTypeToContext(venueType);
          const existingObsForYouth = Object.values(updatedObservations).filter(
            (o) => o.playerId === youth.player.id,
          );
          const result = processVenueObservation(
            actObsRng,
            currentScout,
            youth,
            context,
            existingObsForYouth,
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
          );

          updatedObservations[result.observation.id] = result.observation;
          updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
          weekObservationsGenerated++;

          const alreadyDiscovered = actDiscoveries.some((r) => r.playerId === youth.player.id);
          if (!alreadyDiscovered) {
            actDiscoveries = [...actDiscoveries, recordDiscovery(
              youth.player,
              currentScout,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
            )];
            weekPlayersDiscovered++;
          }

          const topAttrs = result.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const narrativePrefix = qr && i === 0 ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-${venueType}-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `${activityLabel}${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}${msgPrefix} ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}) from ${youth.country}. ${result.observation.attributeReadings.length} attributes assessed. Notable: ${topAttrs}. Buzz +${result.buzzIncrease}, Visibility +${result.visibilityIncrease}.`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      };

      processYouthVenueActivity(
        "schoolMatch",
        weekResult.schoolMatchesExecuted,
        "School Match",
        "You watched",
      );
      processYouthVenueActivity(
        "grassrootsTournament",
        weekResult.grassrootsTournamentsExecuted,
        "Grassroots Tournament",
        "You scouted",
      );
      processYouthVenueActivity(
        "streetFootball",
        weekResult.streetFootballExecuted,
        "Street Football",
        "You observed",
      );
      processYouthVenueActivity(
        "academyTrialDay",
        weekResult.academyTrialDaysExecuted,
        "Academy Trial Day",
        "You evaluated",
      );
      processYouthVenueActivity(
        "youthFestival",
        weekResult.youthFestivalsExecuted,
        "Youth Festival",
        "You spotted",
      );

      // --- Follow-Up Session: deepens observation on a specific youth ---
      if (weekResult.followUpSessionsExecuted > 0) {
        const qr = qualityMap.get("followUpSession");
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
        // Find the followUpSession activity to get its targetId
        const followUpActivities = stateWithScheduleApplied.schedule.activities.filter(
          (a) => a?.type === "followUpSession" && a.targetId,
        );
        for (const followUpAct of followUpActivities) {
          if (!followUpAct?.targetId) continue;
          const targetYouthId = followUpAct.targetId;
          const pool = getYouthVenuePool(
            actObsRng,
            "followUpSession",
            updatedUnsignedYouthObs,
            currentScout,
            undefined,
            targetYouthId,
          );
          if (pool.length === 0) continue;
          const youth = pool[0];
          const existingObsForYouth = Object.values(updatedObservations).filter(
            (o) => o.playerId === youth.player.id,
          );
          const result = processVenueObservation(
            actObsRng,
            currentScout,
            youth,
            "followUpSession",
            existingObsForYouth,
            stateWithScheduleApplied.currentWeek,
            stateWithScheduleApplied.currentSeason,
          );

          updatedObservations[result.observation.id] = result.observation;
          updatedUnsignedYouthObs[youth.id] = result.updatedYouth;
          weekObservationsGenerated++;

          const topAttrs = result.observation.attributeReadings
            .sort((a, b) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");
          const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-followup-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Follow-Up Session${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}You conducted a focused follow-up session on ${youth.player.firstName} ${youth.player.lastName} (age ${youth.player.age}, ${youth.player.position}). This deeper assessment refines your earlier observations. ${result.observation.attributeReadings.length} attributes assessed with higher confidence. Notable: ${topAttrs}.`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // --- Parent/Coach Meeting: reveals hidden intel, no attribute observations ---
      if (weekResult.parentCoachMeetingsExecuted > 0) {
        const qr = qualityMap.get("parentCoachMeeting");
        const tierLabel = qr ? TIER_LABELS[qr.tier] ?? qr.tier : "";
        const meetingActivities = stateWithScheduleApplied.schedule.activities.filter(
          (a) => a?.type === "parentCoachMeeting" && a.targetId,
        );
        for (const meetingAct of meetingActivities) {
          if (!meetingAct?.targetId) continue;
          const targetYouthId = meetingAct.targetId;
          const youth = updatedUnsignedYouthObs[targetYouthId];
          if (!youth || youth.placed || youth.retired) continue;

          const meetingResult = processParentCoachMeeting(actObsRng, currentScout, youth);

          const intelLines = [
            ...meetingResult.hiddenIntel.map((h) => `Intel: ${h}`),
            ...meetingResult.characterNotes.map((c) => `Character: ${c}`),
          ];
          const narrativePrefix = qr ? `${qr.narrative}\n\n` : "";
          actObsMessages.push({
            id: `obs-parentcoach-${youth.player.id}-w${stateWithScheduleApplied.currentWeek}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "feedback" as const,
            title: `Parent/Coach Meeting${tierLabel ? ` (${tierLabel})` : ""}: ${youth.player.firstName} ${youth.player.lastName}`,
            body: `${narrativePrefix}You met with ${youth.player.firstName} ${youth.player.lastName}'s family and coaching staff.\n\n${intelLines.join("\n")}`,
            read: false,
            actionRequired: false,
            relatedId: youth.player.id,
            relatedEntityType: "player" as const,
          });
        }
      }

      // Apply updated unsigned youth back to state
      stateWithScheduleApplied = {
        ...stateWithScheduleApplied,
        unsignedYouth: updatedUnsignedYouthObs,
      };

      if (actObsMessages.length > 0 || Object.keys(updatedObservations).length !== Object.keys(stateWithScheduleApplied.observations).length) {
        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          observations: updatedObservations,
          discoveryRecords: actDiscoveries,
          inbox: [...stateWithScheduleApplied.inbox, ...actObsMessages],
        };
      }
      } // end else (fallback for old saves)
    }

    // ── Youth placement resolution ────────────────────────────────────────
    // When a writePlacementReport activity was completed, process pending
    // placement reports: roll acceptance chance, convert youth to signed
    // players on success, create alumni records, and send inbox notifications.
    if (weekResult.writePlacementReportsExecuted > 0) {
      const placementRng = createRNG(
        `${gameState.seed}-placement-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const pendingReports = Object.values(stateWithScheduleApplied.placementReports).filter(
        (r) => r.clubResponse === "pending",
      );

      if (pendingReports.length > 0) {
        let updatedPlacementReports = { ...stateWithScheduleApplied.placementReports };
        let updatedUnsignedYouth = { ...stateWithScheduleApplied.unsignedYouth };
        let updatedPlayers = { ...stateWithScheduleApplied.players };
        let updatedClubs = { ...stateWithScheduleApplied.clubs };
        let updatedAlumniRecords = [...stateWithScheduleApplied.alumniRecords];
        const placementMessages: InboxMessage[] = [];
        const currentScoutForPlacement = stateWithScheduleApplied.scout;

        // Check if this is the scout's first-ever placement report (for first-outcome guarantee)
        const hasAnyPriorOutcome = Object.values(gameState.placementReports).some(
          (r) => r.clubResponse === "accepted" || r.clubResponse === "rejected",
        );

        for (const report of pendingReports) {
          const youth = updatedUnsignedYouth[report.unsignedYouthId];
          const club = updatedClubs[report.targetClubId];
          if (!youth || !club) continue;

          let chance = calculateClubAcceptanceChance(
            report,
            youth,
            club,
            currentScoutForPlacement,
          );

          // First-outcome guarantee: youth scout's first-ever placement gets 95% chance
          if (
            !hasAnyPriorOutcome &&
            currentScoutForPlacement.primarySpecialization === "youth"
          ) {
            chance = 0.95;
          }

          const outcome = processPlacementOutcome(
            placementRng,
            report,
            chance,
            youth,
            club,
          );

          if (outcome.success && outcome.newPlayer) {
            // Update placement report as accepted
            updatedPlacementReports[report.id] = {
              ...report,
              clubResponse: "accepted",
              placementType: outcome.placementType ?? undefined,
            };

            // Mark youth as placed
            updatedUnsignedYouth[report.unsignedYouthId] = outcome.updatedYouth;

            // Add the new signed player
            updatedPlayers[outcome.newPlayer.id] = outcome.newPlayer;

            // Add player to club roster
            updatedClubs[report.targetClubId] = {
              ...club,
              playerIds: [...club.playerIds, outcome.newPlayer.id],
            };

            // Create alumni record
            const alumniRecord = createAlumniRecord(
              youth,
              club.id,
              stateWithScheduleApplied.currentWeek,
              stateWithScheduleApplied.currentSeason,
            );
            updatedAlumniRecords = [...updatedAlumniRecords, alumniRecord];

            placementMessages.push({
              id: `placement-accepted-${report.id}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "event" as const,
              title: `Placement Accepted: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${club.name} accepted your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}! The ${outcome.placementType === "academyIntake" ? "academy intake" : "youth contract"} has been finalized. You can track their career progress in your alumni records.`,
              read: false,
              actionRequired: false,
              relatedId: outcome.newPlayer.id,
              relatedEntityType: "player" as const,
            });
          } else {
            // Update placement report as rejected
            updatedPlacementReports[report.id] = {
              ...report,
              clubResponse: "rejected",
            };

            placementMessages.push({
              id: `placement-rejected-${report.id}`,
              week: stateWithScheduleApplied.currentWeek,
              season: stateWithScheduleApplied.currentSeason,
              type: "event" as const,
              title: `Placement Declined: ${youth.player.firstName} ${youth.player.lastName}`,
              body: `${club.name} has declined your placement recommendation for ${youth.player.firstName} ${youth.player.lastName}. Consider building more observations or targeting a different club.`,
              read: false,
              actionRequired: false,
              relatedId: youth.player.id,
              relatedEntityType: "player" as const,
            });
          }
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          placementReports: updatedPlacementReports,
          unsignedYouth: updatedUnsignedYouth,
          players: updatedPlayers,
          clubs: updatedClubs,
          alumniRecords: updatedAlumniRecords,
          inbox: [...stateWithScheduleApplied.inbox, ...placementMessages],
        };
      }
    }

    // h) New contact generation — every 8th week, 30% chance
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
          relatedEntityType: "contact" as const,
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
        // Generate transfer update inbox messages for scouted players
        const scoutedPlayerIds = new Set(
          Object.values(stateWithScheduleApplied.reports).map((r) => r.playerId),
        );
        const transferInboxMessages: typeof stateWithScheduleApplied.inbox = [];
        for (const transfer of transferResults) {
          if (!scoutedPlayerIds.has(transfer.playerId)) continue;
          const player = updatedPlayers[transfer.playerId];
          if (!player) continue;
          const fromClub = updatedClubs[transfer.fromClubId] ?? stateWithScheduleApplied.clubs[transfer.fromClubId];
          const toClub = updatedClubs[transfer.toClubId] ?? stateWithScheduleApplied.clubs[transfer.toClubId];
          const playerName = `${player.firstName} ${player.lastName}`;
          const fee = transfer.fee >= 1_000_000
            ? `£${(transfer.fee / 1_000_000).toFixed(1)}M`
            : `£${Math.round(transfer.fee / 1_000)}K`;
          transferInboxMessages.push({
            id: `transfer_${transfer.playerId}_${stateWithScheduleApplied.currentWeek}_${stateWithScheduleApplied.currentSeason}`,
            week: stateWithScheduleApplied.currentWeek,
            season: stateWithScheduleApplied.currentSeason,
            type: "transferUpdate",
            title: `Transfer: ${playerName}`,
            body: `${playerName} has completed a move from ${fromClub?.shortName ?? transfer.fromClubId} to ${toClub?.shortName ?? transfer.toClubId} for ${fee}. You previously submitted a scouting report on this player.`,
            read: false,
            actionRequired: false,
            relatedId: transfer.playerId,
            relatedEntityType: "player",
          });
        }

        stateWithScheduleApplied = {
          ...stateWithScheduleApplied,
          players: updatedPlayers,
          clubs: updatedClubs,
          inbox: [...stateWithScheduleApplied.inbox, ...transferInboxMessages],
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

    // 1a. Economics revamp: process marketplace, retainers, loans, consulting, courses, agency, economic events
    if (stateWithPhase2.finances) {
      const econRng = createRNG(
        `${gameState.seed}-econ-${gameState.currentWeek}-${gameState.currentSeason}`,
      );

      let econFinances = stateWithPhase2.finances;

      // Market temperature update
      const newTemp = updateMarketTemperature(
        stateWithPhase2.transferWindow,
        stateWithPhase2.currentWeek,
      );
      econFinances = { ...econFinances, marketTemperature: newTemp };

      // Economic events: generate and expire
      econFinances = expireEconomicEvents(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);
      const newEvent = generateEconomicEvent(econRng, econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);
      if (newEvent) {
        econFinances = applyEconomicEvent(econFinances, newEvent);
      }

      // Report marketplace: process sales for independent scouts
      if (stateWithPhase2.scout.careerPath === "independent") {
        econFinances = processMarketplaceSales(
          econRng,
          econFinances,
          stateWithPhase2.clubs,
          stateWithPhase2.reports,
          stateWithPhase2.scout,
          stateWithPhase2.currentWeek,
          stateWithPhase2.currentSeason,
        );
        econFinances = expireOldListings(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);
      }

      // Retainer deliveries (monthly)
      econFinances = processRetainerDeliveries(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);

      // Loan payments (monthly)
      econFinances = processLoanPayment(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);

      // Consulting deadlines
      econFinances = processConsultingDeadline(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);

      // Course progress
      econFinances = processWeeklyCourseProgress(econFinances, stateWithPhase2.currentWeek, stateWithPhase2.currentSeason);

      // Agency employee processing
      if (econFinances.employees.length > 0) {
        econFinances = processEmployeeWeek(econRng, econFinances);
      }

      // Generate pending retainer/consulting offers for independent scouts
      if (stateWithPhase2.scout.careerPath === "independent") {
        const retainerOffers = generateRetainerOffers(
          econRng, stateWithPhase2.scout, econFinances, stateWithPhase2.clubs,
        );
        if (retainerOffers.length > 0) {
          econFinances = {
            ...econFinances,
            pendingRetainerOffers: [...(econFinances.pendingRetainerOffers ?? []), ...retainerOffers],
          };
        }
        const consultingOffers = generateConsultingOffers(
          econRng, stateWithPhase2.scout, econFinances, stateWithPhase2.clubs,
          stateWithPhase2.currentWeek, stateWithPhase2.currentSeason,
        );
        if (consultingOffers.length > 0) {
          econFinances = {
            ...econFinances,
            pendingConsultingOffers: [...(econFinances.pendingConsultingOffers ?? []), ...consultingOffers],
          };
        }
      }

      // Independent tier advancement check
      if (stateWithPhase2.scout.careerPath === "independent") {
        const nextTier = checkIndependentTierAdvancement(stateWithPhase2.scout, econFinances);
        if (nextTier) {
          const { scout: advancedScout, finances: advancedFinances } = advanceIndependentTier(
            stateWithPhase2.scout, econFinances, nextTier,
          );
          stateWithPhase2 = { ...stateWithPhase2, scout: advancedScout };
          econFinances = advancedFinances;
        }
      }

      stateWithPhase2 = { ...stateWithPhase2, finances: econFinances };
    }

    // 1b. Transfer window urgency — generate urgent assessments during open windows
    const activeTransferWindow = stateWithPhase2.transferWindow;
    if (activeTransferWindow?.isOpen) {
      const twRng = createRNG(
        `${gameState.seed}-tw-${gameState.currentWeek}-${gameState.currentSeason}`,
      );
      const urgent = generateUrgentAssessment(twRng, stateWithPhase2);
      if (urgent) {
        const urgentPlayer = stateWithPhase2.players[urgent.playerId];
        const urgentMsg: InboxMessage = {
          id: `urgent-${urgent.id}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "assignment" as const,
          title: "Urgent Assessment Request",
          body: `${urgent.requestedBy} needs a report on ${urgentPlayer ? `${urgentPlayer.firstName} ${urgentPlayer.lastName}` : "a player"} by day ${urgent.deadline}. Reward: +${urgent.reputationReward} reputation.`,
          read: false,
          actionRequired: true,
          relatedId: urgent.playerId,
          relatedEntityType: "player" as const,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, urgentMsg],
        };
      }
      if (isDeadlineDayPressure(activeTransferWindow, stateWithPhase2.currentWeek)) {
        const deadlineMsg: InboxMessage = {
          id: `deadline-w${stateWithPhase2.currentWeek}-s${stateWithPhase2.currentSeason}`,
          week: stateWithPhase2.currentWeek,
          season: stateWithPhase2.currentSeason,
          type: "news" as const,
          title: "Transfer Deadline Approaching",
          body: "The transfer window closes this week. Clubs are making final decisions — file any outstanding reports now.",
          read: false,
          actionRequired: false,
        };
        stateWithPhase2 = {
          ...stateWithPhase2,
          inbox: [...stateWithPhase2.inbox, deadlineMsg],
        };
      }
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
          relatedEntityType: "player" as const,
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
        relatedEntityType: "narrative" as const,
      };
      stateWithPhase2 = {
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, narrativeEvent],
        inbox: [...stateWithPhase2.inbox, eventInboxMessage],
      };
    }

    // 3b. Storyline system — trigger new storylines and advance active ones
    const storylineRng = createRNG(
      `${gameState.seed}-storylines-${gameState.currentWeek}-${gameState.currentSeason}`,
    );

    // Attempt to start a new storyline (5% weekly chance, max 2 active)
    const newStoryline = checkStorylineTriggers(stateWithPhase2, storylineRng);
    if (newStoryline) {
      stateWithPhase2 = {
        ...stateWithPhase2,
        activeStorylines: [...stateWithPhase2.activeStorylines, newStoryline],
      };
    }

    // Advance all active storylines that are due this week
    const { events: storylineEvents, updatedStorylines } = processActiveStorylines(
      stateWithPhase2,
      storylineRng,
    );

    if (updatedStorylines !== stateWithPhase2.activeStorylines || storylineEvents.length > 0) {
      const storylineInboxMessages: InboxMessage[] = storylineEvents.map((evt) => ({
        id: `narrative-${evt.id}`,
        week: stateWithPhase2.currentWeek,
        season: stateWithPhase2.currentSeason,
        type: "event" as const,
        title: evt.title,
        body: evt.description,
        read: false,
        actionRequired: (evt.choices?.length ?? 0) > 0,
        relatedId: evt.id,
        relatedEntityType: "narrative" as const,
      }));

      stateWithPhase2 = {
        ...stateWithPhase2,
        narrativeEvents: [...stateWithPhase2.narrativeEvents, ...storylineEvents],
        inbox: [...stateWithPhase2.inbox, ...storylineInboxMessages],
        activeStorylines: updatedStorylines,
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
        relatedEntityType: "tool" as const,
      }));
      stateWithPhase2 = {
        ...stateWithPhase2,
        unlockedTools: [...stateWithPhase2.unlockedTools, ...newlyUnlocked],
        inbox: [...stateWithPhase2.inbox, ...toolMessages],
      };
    }

    // ── First-Team Weekly System Processing ─────────────────────────────────

    if (stateWithPhase2.scout.primarySpecialization === "firstTeam") {
      // Process any pending trial ClubResponses that need resolution this week
      const pendingTrials = stateWithPhase2.clubResponses.filter(
        (resp) => resp.response === "trial",
      );
      if (pendingTrials.length > 0 && stateWithPhase2.scout.currentClubId) {
        const trialResolutionRng = createRNG(
          `${gameState.seed}-trialresolve-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const trialClub = stateWithPhase2.clubs[stateWithPhase2.scout.currentClubId];
        if (trialClub) {
          const resolvedResponses = stateWithPhase2.clubResponses.map((resp) => {
            if (resp.response !== "trial") return resp;
            // Only resolve trials that have been pending for at least 1 week
            const player = stateWithPhase2.players[resp.reportId] ??
              Object.values(stateWithPhase2.players).find((p) =>
                stateWithPhase2.reports[resp.reportId]?.playerId === p.id,
              );
            if (!player) return resp;
            const outcome = processTrialOutcome(
              trialResolutionRng,
              player,
              trialClub,
              stateWithPhase2.players,
            );
            return { ...resp, response: outcome };
          });
          stateWithPhase2 = { ...stateWithPhase2, clubResponses: resolvedResponses };
        }
      }
    }

    // ── Data Scout Weekly System Processing ─────────────────────────────────

    if (stateWithPhase2.scout.primarySpecialization === "data") {
      // 1. Generate passive analyst reports for assigned analysts
      if (stateWithPhase2.dataAnalysts.length > 0) {
        const passiveReportRng = createRNG(
          `${gameState.seed}-passivereports-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const updatedAnalysts = [...stateWithPhase2.dataAnalysts];
        const updatedAnalystReports = { ...stateWithPhase2.analystReports };
        const hadMeetingThisWeek = weekResult.analyticsTeamMeetingsExecuted > 0;

        for (let i = 0; i < updatedAnalysts.length; i++) {
          const analyst = updatedAnalysts[i];
          if (!analyst.assignedLeagueId) {
            // Analyst is unassigned — apply idle morale decay
            updatedAnalysts[i] = updateAnalystMorale(analyst, { ignored: true });
            continue;
          }
          const analystLeague = stateWithPhase2.leagues[analyst.assignedLeagueId];
          if (!analystLeague) continue;

          const reportId = `passive-${analyst.id}-w${stateWithPhase2.currentWeek}-s${stateWithPhase2.currentSeason}`;
          // Only generate if no meeting report was already created for this analyst this week
          if (!updatedAnalystReports[reportId]) {
            const report = generateAnalystReport(
              passiveReportRng,
              analyst,
              analystLeague,
              stateWithPhase2.players,
              stateWithPhase2.currentSeason,
              stateWithPhase2.currentWeek,
              reportId,
            );
            updatedAnalystReports[reportId] = report;
          }

          // Update morale: decay if no meeting held this week
          if (!hadMeetingThisWeek) {
            updatedAnalysts[i] = updateAnalystMorale(analyst, { ignored: false });
          }
        }

        stateWithPhase2 = {
          ...stateWithPhase2,
          dataAnalysts: updatedAnalysts,
          analystReports: updatedAnalystReports,
        };
      }

      // 2. Resolve predictions whose deadline season has passed
      if (stateWithPhase2.predictions.length > 0) {
        const predRng = createRNG(
          `${gameState.seed}-predresolve-${gameState.currentWeek}-${gameState.currentSeason}`,
        );
        const resolvedPredictions = resolvePredictions(
          stateWithPhase2.predictions,
          stateWithPhase2.players,
          stateWithPhase2.currentSeason,
          stateWithPhase2.currentWeek,
          predRng,
        );
        if (resolvedPredictions.some((p, i) => p !== stateWithPhase2.predictions[i])) {
          stateWithPhase2 = { ...stateWithPhase2, predictions: resolvedPredictions };
        }
      }
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

      const seasonEndMessages: InboxMessage[] = [];
      const completedSeason = stateWithPhase2.currentSeason;

      // ── Issue 3: Performance review ──────────────────────────────────────
      const seasonReports = Object.values(newState.reports).filter(
        (r) => r.submittedSeason === completedSeason,
      );
      const tierContext: TierReviewContext = {
        countriesScoutedThisSeason: newState.countries,
        homeCountry: newState.countries[0],
        npcScouts: Object.values(newState.npcScouts),
        managerRelationship: newState.scout.managerRelationship,
        boardDirectives: newState.scout.boardDirectives,
      };
      const review = calculatePerformanceReview(
        newState.scout,
        seasonReports,
        completedSeason,
        tierContext,
      );
      newState = {
        ...newState,
        performanceReviews: [...newState.performanceReviews, review],
      };

      // Apply reputation change from review
      const reviewedScout = updateReputation(newState.scout, {
        type: "seasonEnd",
        reviewOutcome: review.outcome,
      });
      newState = { ...newState, scout: reviewedScout };

      // If promoted, advance career tier
      if (review.outcome === "promoted" && newState.scout.careerTier < 5) {
        newState = {
          ...newState,
          scout: {
            ...newState.scout,
            careerTier: (newState.scout.careerTier + 1) as 1 | 2 | 3 | 4 | 5,
          },
        };
      }

      const reviewOutcomeText =
        review.outcome === "promoted"
          ? "Congratulations! You have been promoted."
          : review.outcome === "retained"
            ? "You have been retained for next season."
            : review.outcome === "warning"
              ? "You have received a formal warning. Improve your performance next season."
              : "Your contract has been terminated.";
      seasonEndMessages.push({
        id: `review-s${completedSeason}`,
        week: newState.currentWeek,
        season: newState.currentSeason,
        type: "feedback" as const,
        title: `Season ${completedSeason} Performance Review`,
        body: `Reports submitted: ${review.reportsSubmitted} | Avg quality: ${review.averageQuality}/100\nSuccessful recommendations: ${review.successfulRecommendations}\nReputation change: ${review.reputationChange >= 0 ? "+" : ""}${review.reputationChange}\n\n${reviewOutcomeText}`,
        read: false,
        actionRequired: false,
      });

      // ── Issue 1: Generate job offers ─────────────────────────────────────
      const seasonEndRng = createRNG(`${gameState.seed}-seasonend-${completedSeason}`);
      const offers = generateJobOffers(seasonEndRng, newState.scout, newState.clubs, newState.currentSeason);
      if (offers.length > 0) {
        newState = { ...newState, jobOffers: [...newState.jobOffers, ...offers] };
        for (const offer of offers) {
          const club = newState.clubs[offer.clubId];
          seasonEndMessages.push({
            id: `job-offer-${offer.id}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Job Offer: ${club?.name ?? "Unknown"}`,
            body: `You've been offered a ${offer.role} position. Salary: £${offer.salary}/month. Contract: ${offer.contractLength} season${offer.contractLength !== 1 ? "s" : ""}. Expires week ${offer.expiresWeek}.`,
            type: "jobOffer" as const,
            read: false,
            actionRequired: true,
            relatedId: offer.id,
            relatedEntityType: "jobOffer" as const,
          });
        }
      }

      // ── Issue 8: Post-transfer retrospective accuracy ────────────────────
      const signedReports = Object.values(newState.reports).filter(
        (r) => r.clubResponse === "signed" && completedSeason - r.submittedSeason >= 2,
      );
      if (signedReports.length > 0) {
        const updatedReports = { ...newState.reports };
        for (const report of signedReports) {
          if (report.postTransferRating !== undefined) continue; // already rated
          const player = newState.players[report.playerId];
          if (!player) continue;
          const seasonsSinceSigning = completedSeason - report.submittedSeason;
          const accuracy = trackPostTransfer(report, player, seasonsSinceSigning);
          updatedReports[report.id] = { ...report, postTransferRating: accuracy };
          seasonEndMessages.push({
            id: `retro-${report.id}-s${completedSeason}`,
            week: newState.currentWeek,
            season: newState.currentSeason,
            title: `Report Validated: ${player.firstName} ${player.lastName}`,
            body: `Your report on ${player.firstName} ${player.lastName} from season ${report.submittedSeason} has been validated after ${seasonsSinceSigning} seasons. Accuracy: ${accuracy}/100.`,
            type: "feedback" as const,
            read: false,
            actionRequired: false,
            relatedId: player.id,
            relatedEntityType: "player" as const,
          });
        }
        newState = { ...newState, reports: updatedReports };
      }

      // Add all season-end messages to inbox
      if (seasonEndMessages.length > 0) {
        newState = { ...newState, inbox: [...newState.inbox, ...seasonEndMessages] };
      }

      // Generate new season fixtures for core leagues only (skip secondary talent pools)
      const fixtureRng = createRNG(`${gameState.seed}-fixtures-s${newState.currentSeason}`);
      const newFixtures: Record<string, Fixture> = {};
      const secondaryCountryKeys = new Set(getSecondaryCountries());
      for (const league of Object.values(newState.leagues)) {
        // Derive country key from territory to skip secondary leagues
        const territory = Object.values(newState.territories).find(
          (t) => t.leagueIds.includes(league.id),
        );
        const countryKey = territory
          ? territory.id.replace("territory_", "")
          : "";
        if (secondaryCountryKeys.has(countryKey)) continue;

        const leagueFixtures = generateSeasonFixtures(fixtureRng, league, newState.currentSeason);
        for (const f of leagueFixtures) {
          newFixtures[f.id] = f;
        }
      }
      newState = { ...newState, fixtures: { ...newState.fixtures, ...newFixtures } };

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

      // ── Generate unsigned youth and academy intakes for the new season ──────
      // Country data was loaded into the sync registry during startNewGame, so
      // getCountryDataSync is safe to call here without awaiting.
      const youthRng = createRNG(`${gameState.seed}-youth-s${newState.currentSeason}`);
      const newYouth: UnsignedYouth[] = [];
      const newAcademyPlayers: Player[] = [];

      for (const countryKey of newState.countries) {
        const countryData = getCountryDataSync(countryKey);
        if (!countryData) continue;

        // Regional youth generation
        const countrySubRegions = Object.values(newState.subRegions).filter(
          (sr) => sr.country.toLowerCase() === countryData.name.toLowerCase(),
        );
        // Use week=1 for the season-start batch (season boundary context)
        const batch = generateRegionalYouth(
          youthRng,
          countryData,
          newState.currentSeason,
          1,
          countrySubRegions,
        );
        newYouth.push(...batch);

        // Academy intake for all clubs in this country
        const countryClubs = Object.values(newState.clubs).filter((c) => {
          const league = newState.leagues[c.leagueId];
          return league?.country.toLowerCase() === countryData.name.toLowerCase();
        });
        for (const club of countryClubs) {
          const intake = generateAcademyIntake(
            youthRng,
            club,
            countryData,
            newState.currentSeason,
          );
          newAcademyPlayers.push(...intake);
        }
      }

      // Merge unsigned youth pool
      if (newYouth.length > 0) {
        const updatedUnsignedYouth = { ...newState.unsignedYouth };
        for (const y of newYouth) {
          updatedUnsignedYouth[y.id] = y;
        }
        newState = { ...newState, unsignedYouth: updatedUnsignedYouth };
      }

      // Merge academy intake players into players + club rosters
      if (newAcademyPlayers.length > 0) {
        const updatedPlayers = { ...newState.players };
        const updatedClubs = { ...newState.clubs };
        for (const p of newAcademyPlayers) {
          updatedPlayers[p.id] = p;
          const club = updatedClubs[p.clubId];
          if (club) {
            updatedClubs[p.clubId] = {
              ...club,
              playerIds: [...club.playerIds, p.id],
            };
          }
        }
        newState = { ...newState, players: updatedPlayers, clubs: updatedClubs };
      }

      // ── First-team season-end: regenerate directives and update transfer records ──
      if (newState.scout.primarySpecialization === "firstTeam") {
        // Generate new manager directives for the new season
        if (newState.scout.currentClubId) {
          const newSeasonDirectiveRng = createRNG(
            `${gameState.seed}-directives-s${newState.currentSeason}`,
          );
          const scoutClub = newState.clubs[newState.scout.currentClubId];
          const scoutManager = newState.managerProfiles[newState.scout.currentClubId];
          if (scoutClub && scoutManager) {
            const newDirectives = generateDirectives(
              newSeasonDirectiveRng,
              scoutClub,
              scoutManager,
              newState.players,
              newState.currentSeason,
            );
            newState = { ...newState, managerDirectives: newDirectives };
          }
        }

        // Update transfer records with end-of-season performance
        if (newState.transferRecords.length > 0) {
          const transferRecordRng = createRNG(
            `${gameState.seed}-transferrecords-s${completedSeason}`,
          );
          const updatedTransferRecords = updateTransferRecords(
            transferRecordRng,
            newState.transferRecords,
            newState.players,
            completedSeason,
          );
          newState = { ...newState, transferRecords: updatedTransferRecords };
        }
      }

      // ── Data scout season-end: resolve predictions and generate new analyst candidates ──
      if (newState.scout.primarySpecialization === "data") {
        // Resolve all outstanding predictions for the completed season
        if (newState.predictions.length > 0) {
          const endSeasonPredRng = createRNG(
            `${gameState.seed}-predend-s${completedSeason}`,
          );
          const resolvedAtSeasonEnd = resolvePredictions(
            newState.predictions,
            newState.players,
            completedSeason,
            newState.currentWeek,
            endSeasonPredRng,
          );
          newState = { ...newState, predictions: resolvedAtSeasonEnd };
        }

        // Generate a new analyst candidate as an end-of-season event
        const analystCandidateRng = createRNG(
          `${gameState.seed}-analystcandidate-s${newState.currentSeason}`,
        );
        const candidate = generateAnalystCandidate(
          analystCandidateRng,
          newState.currentSeason,
          `season-${newState.currentSeason}`,
        );
        const candidateMsg: InboxMessage = {
          id: `analyst-candidate-s${newState.currentSeason}`,
          week: newState.currentWeek,
          season: newState.currentSeason,
          type: "event" as const,
          title: "New Analyst Candidate Available",
          body: `A data analyst has expressed interest in joining your team. ${candidate.name} (Skill: ${candidate.skill}/20, Focus: ${candidate.focus}) is available for £${candidate.salary}/week. Review their profile in your analytics dashboard.`,
          read: false,
          actionRequired: false,
        };
        newState = {
          ...newState,
          inbox: [...newState.inbox, candidateMsg],
        };
      }
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

    // Prune inbox to keep most recent messages, but never drop unread action-required ones (Fix #57)
    if (newState.inbox.length > 200) {
      const priority = newState.inbox.filter((m) => m.actionRequired && !m.read);
      const rest = newState.inbox.filter((m) => !(m.actionRequired && !m.read));
      const trimmedRest = rest.slice(-Math.max(0, 200 - priority.length));
      newState = { ...newState, inbox: [...trimmedRest, ...priority] };
    }

    // Issue 17: Prune old acknowledged narrative events (keep last 10 weeks)
    if (newState.narrativeEvents.length > 0) {
      const prunedNarratives = newState.narrativeEvents.filter(
        (e) => !e.acknowledged || newState.currentWeek - e.week < 10,
      );
      newState = { ...newState, narrativeEvents: prunedNarratives };
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
      activityQualities: qualityRolls.map((q) => ({
        activityType: q.activityType,
        tier: q.tier,
        narrative: q.narrative,
      })),
      playersDiscovered: weekPlayersDiscovered,
      observationsGenerated: weekObservationsGenerated,
    };

    // ── Scenario objective checking ─────────────────────────────────────────
    const scenarioId = newState.activeScenarioId;
    let scenarioOutcomeUpdate: "victory" | "failure" | null = null;
    let scenarioProgressUpdate: ScenarioProgress | null = null;
    if (scenarioId) {
      const progress = checkScenarioObjectives(newState, scenarioId);
      const failCheck = isScenarioFailed(newState, scenarioId);
      scenarioProgressUpdate = progress;
      if (progress.allRequiredComplete) {
        scenarioOutcomeUpdate = "victory";
      } else if (failCheck.failed) {
        scenarioOutcomeUpdate = "failure";
      }
    }

    // ── Celebration detection (highest priority wins per week) ──────────────
    type CelebrationPayload = { tier: "minor" | "major" | "epic"; title: string; description: string };
    let pendingCelebration: CelebrationPayload | null = null;

    // Epic: new wonderkid discovery this week
    const prevDiscoveryIds = new Set(gameState.discoveryRecords.map((d) => d.playerId));
    const newWonderkidDiscoveries = newState.discoveryRecords.filter(
      (d) => d.wasWonderkid && !prevDiscoveryIds.has(d.playerId),
    );
    if (newWonderkidDiscoveries.length > 0) {
      const first = newWonderkidDiscoveries[0];
      const wkPlayer = first ? newState.players[first.playerId] : undefined;
      const wkName = wkPlayer ? `${wkPlayer.firstName} ${wkPlayer.lastName}` : "a player";
      pendingCelebration = {
        tier: "epic",
        title: "Wonderkid Discovered!",
        description: `You've uncovered a generational talent: ${wkName}. This could be the find of your career.`,
      };
    }

    // Major: tier promotion (overrides minor, but not epic)
    const tierPromoted = newState.scout.careerTier > gameState.scout.careerTier;
    if (!pendingCelebration && tierPromoted) {
      pendingCelebration = {
        tier: "major",
        title: "Career Promotion!",
        description: `You've been promoted to Tier ${newState.scout.careerTier}. New opportunities await.`,
      };
    }

    // Major: scenario victory
    if (!pendingCelebration && scenarioOutcomeUpdate === "victory") {
      const victoryScenario = scenarioId ? getScenarioById(scenarioId) : undefined;
      pendingCelebration = {
        tier: "major",
        title: "Scenario Complete!",
        description: victoryScenario
          ? `You completed "${victoryScenario.name}". All objectives achieved.`
          : "All scenario objectives achieved!",
      };
    }

    // Minor: new tool unlocked (perk-equivalent trigger)
    if (!pendingCelebration && newlyUnlocked.length > 0) {
      pendingCelebration = {
        tier: "minor",
        title: "New Tool Unlocked",
        description: `You unlocked a new scouting tool: ${newlyUnlocked[0]}.`,
      };
    }

    // ── Tutorial trigger: career progression ─────────────────────────────────
    if (tierPromoted) {
      useTutorialStore.getState().startSequence("careerProgression");
    }

    // ── Aha moment triggers ────────────────────────────────────────────────
    const tutorialState = useTutorialStore.getState();

    // Youth aha: first placement accepted this week
    const hadAcceptedBefore = Object.values(gameState.placementReports).some(
      (r) => r.clubResponse === "accepted",
    );
    const hasAcceptedNow = Object.values(newState.placementReports).some(
      (r) => r.clubResponse === "accepted",
    );
    if (
      newState.scout.primarySpecialization === "youth" &&
      !tutorialState.completedSequences.has("ahaMoment:youth") &&
      !hadAcceptedBefore &&
      hasAcceptedNow
    ) {
      tutorialState.queueSequence("ahaMoment:youth");
    }

    // Data aha: first anomaly flags generated this week
    if (
      newState.scout.primarySpecialization === "data" &&
      !tutorialState.completedSequences.has("ahaMoment:data") &&
      gameState.anomalyFlags.length === 0 &&
      newState.anomalyFlags.length > 0
    ) {
      tutorialState.queueSequence("ahaMoment:data");
    }

    set({
      gameState: newState,
      lastWeekSummary: weekSummary,
      ...(scenarioProgressUpdate !== null ? { scenarioProgress: scenarioProgressUpdate } : {}),
      ...(scenarioOutcomeUpdate !== null ? { scenarioOutcome: scenarioOutcomeUpdate } : {}),
      ...(pendingCelebration !== null ? { pendingCelebration } : {}),
    });
    // Autosave after each week advance — guard against race condition (Fix #24)
    set({ autosaveError: null });
    if (!_autosavePending) {
      _autosavePending = true;
      dbAutosave(newState)
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("Autosave failed:", err);
          set({ autosaveError: message });
        })
        .finally(() => {
          _autosavePending = false;
        });
    }
  },

  // ── Day-by-day simulation actions ──────────────────────────────────────────

  startWeekSimulation: () => {
    const { gameState } = get();
    if (!gameState) return;

    // Demo limit gate
    if (isDemoLimitReached(gameState.currentSeason)) {
      set({ currentScreen: "demoEnd" as GameScreen });
      return;
    }

    // Gate: play all scheduled attendMatch fixtures interactively first
    // Youth scouts skip — they cannot attend first-team matches.
    if (gameState.scout.primarySpecialization !== "youth") {
      const pendingFixtureIds = get().getPendingMatches();
      if (pendingFixtureIds.length > 0) {
        get().startMatch(pendingFixtureIds[0]);
        return;
      }
    }

    // Build day-by-day results
    const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const rng = createRNG(`${gameState.seed}-daysim-${gameState.currentWeek}-${gameState.currentSeason}`);
    const qualityRng = createRNG(`${gameState.seed}-dayquality-${gameState.currentWeek}-${gameState.currentSeason}`);

    // Pre-scan schedule to build activity spans for multi-day XP splitting
    const activitySpans = new Map<string, number[]>();
    for (let i = 0; i < 7; i++) {
      const act = gameState.schedule.activities[i];
      if (!act) continue;
      const key = `${act.type}-${act.targetId ?? ""}-${act.description}`;
      const existing = activitySpans.get(key);
      if (existing) {
        existing.push(i);
      } else {
        activitySpans.set(key, [i]);
      }
    }

    const dayResults: DayResult[] = [];
    const rolledQualities = new Map<string, { narrative: string }>();

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const activity = gameState.schedule.activities[dayIndex];

      if (!activity) {
        dayResults.push({
          dayIndex,
          dayName: DAY_NAMES[dayIndex],
          activity: null,
          observations: [],
          playersDiscovered: 0,
          reportsWritten: [],
          profilesGenerated: 0,
          anomaliesFound: 0,
          xpGained: {},
          fatigueChange: EMPTY_DAY_FATIGUE_RECOVERY,
          narrative: "A quiet day off. You recover a little energy.",
          inboxMessages: [],
        });
        continue;
      }

      const actKey = `${activity.type}-${activity.targetId ?? ""}-${activity.description}`;
      const span = activitySpans.get(actKey) ?? [dayIndex];
      const totalDays = span.length;
      const occurrenceIndex = span.indexOf(dayIndex);

      // Roll quality only on the first occurrence
      let narrative = "";
      if (occurrenceIndex === 0) {
        if (activity.type !== "rest" && activity.type !== "travel" && activity.type !== "internationalTravel") {
          const qr = rollActivityQuality(qualityRng, activity.type, gameState.scout);
          narrative = qr.narrative;
          rolledQualities.set(actKey, { narrative: qr.narrative });
        }
      } else {
        // Continuation day — pick a continuation narrative
        const contTemplates = MULTI_DAY_CONTINUATIONS[activity.type];
        if (contTemplates && contTemplates.length > 0) {
          narrative = contTemplates[Math.min(occurrenceIndex - 1, contTemplates.length - 1)];
        } else {
          const label = activity.type.replace(/([A-Z])/g, " $1").toLowerCase().trim();
          narrative = `You continue your ${label} activity.`;
        }
      }

      // Get total XP from the activity type, then split across days
      const skillXp = ACTIVITY_SKILL_XP_MAP[activity.type];
      let xpGained: Partial<Record<string, number>> = {};
      if (skillXp && totalDays > 1) {
        // Split XP: first day gets ceil, subsequent get floor
        const split: Partial<Record<string, number>> = {};
        for (const [skill, xp] of Object.entries(skillXp)) {
          if (occurrenceIndex === 0) {
            split[skill] = Math.ceil(xp / totalDays);
          } else {
            split[skill] = Math.floor(xp / totalDays);
          }
        }
        xpGained = split;
      } else if (skillXp) {
        xpGained = { ...skillXp };
      }

      // Get fatigue from the activity type, split across days
      const rawFatigue = ACTIVITY_FATIGUE_COSTS_MAP[activity.type] ?? 0;
      const endurance = gameState.scout.attributes.endurance;
      const totalFatigue = rawFatigue < 0
        ? rawFatigue
        : Math.round(rawFatigue * (1 - Math.min(0.75, endurance / 40)));
      const fatigueCost = totalDays > 1
        ? Math.round(totalFatigue / totalDays)
        : totalFatigue;

      if (!narrative && activity.type === "rest") {
        narrative = "You take a well-deserved rest day to recover your energy.";
      } else if (!narrative) {
        narrative = `You complete your scheduled ${activity.type} activity.`;
      }

      dayResults.push({
        dayIndex,
        dayName: DAY_NAMES[dayIndex],
        activity,
        observations: [], // Populated by youth discovery pre-computation below
        playersDiscovered: 0,
        reportsWritten: activity.type === "writeReport" && activity.targetId ? [activity.targetId] : [],
        profilesGenerated: 0,
        anomaliesFound: 0,
        xpGained: xpGained as Partial<Record<import("@/engine/core/types").ScoutSkill, number>>,
        fatigueChange: fatigueCost,
        narrative,
        inboxMessages: [],
      });
    }

    // ── Youth venue discovery pre-computation ───────────────────────────
    // Process youth venues now so players see discoveries during the simulation.
    const YOUTH_VENUE_TYPES = ["schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay", "youthFestival"] as const;
    type YouthVenueType = typeof YOUTH_VENUE_TYPES[number];

    const currentScout = gameState.scout;
    let youthVenueResults: WeekSimulationState["youthVenueResults"] | undefined;

    if (currentScout.primarySpecialization === "youth") {
      const obsRng = createRNG(`${gameState.seed}-simobs-${gameState.currentWeek}-${gameState.currentSeason}`);
      const updatedUnsignedYouth = { ...gameState.unsignedYouth };
      const newObservations: Record<string, Observation> = {};
      const newDiscoveries: DiscoveryRecord[] = [];
      let totalObservations = 0;
      let totalDiscoveries = 0;

      // Deduplicate: process each unique youth venue activity once
      const processedVenueKeys = new Set<string>();

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const act = gameState.schedule.activities[dayIndex];
        if (!act) continue;
        if (!(YOUTH_VENUE_TYPES as readonly string[]).includes(act.type)) continue;
        const venueKey = `${act.type}-${act.targetId ?? ""}-${act.description}`;
        if (processedVenueKeys.has(venueKey)) continue;
        processedVenueKeys.add(venueKey);

        const venueType = act.type as YouthVenueType;
        const equipBonuses = gameState.finances?.equipment
          ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
          : { youthDiscoveryBonus: 0 };
        const youthBonus = equipBonuses.youthDiscoveryBonus ?? 0;

        const pool = getYouthVenuePool(
          obsRng,
          venueType,
          updatedUnsignedYouth,
          currentScout,
          undefined,
          undefined,
          youthBonus,
        );

        const observations: DayResult["observations"] = [];

        for (const youth of pool) {
          const existingObs = [
            ...Object.values(newObservations),
            ...Object.values(gameState.observations),
          ].filter((o) => o.playerId === youth.player.id);

          const result = processVenueObservation(
            obsRng,
            currentScout,
            youth,
            mapVenueTypeToContext(venueType),
            existingObs,
            gameState.currentWeek,
            gameState.currentSeason,
          );

          newObservations[result.observation.id] = result.observation;
          updatedUnsignedYouth[youth.id] = result.updatedYouth;
          totalObservations++;

          const alreadyDiscovered = newDiscoveries.some((r) => r.playerId === youth.player.id)
            || (gameState.discoveryRecords ?? []).some((r: DiscoveryRecord) => r.playerId === youth.player.id);
          if (!alreadyDiscovered) {
            newDiscoveries.push(recordDiscovery(
              youth.player,
              currentScout,
              gameState.currentWeek,
              gameState.currentSeason,
            ));
            totalDiscoveries++;
          }

          const topAttrs = result.observation.attributeReadings
            .sort((a: { perceivedValue: number }, b: { perceivedValue: number }) => b.perceivedValue - a.perceivedValue)
            .slice(0, 3)
            .map((r: { attribute: string; perceivedValue: number }) => `${r.attribute} ${r.perceivedValue}`)
            .join(", ");

          observations.push({
            playerId: youth.player.id,
            playerName: `${youth.player.firstName} ${youth.player.lastName}`,
            topAttributes: topAttrs,
          });
        }

        // Assign observations and discovery counts to the first day of this activity
        if (observations.length > 0) {
          const dayResult = dayResults[dayIndex];
          dayResult.observations = observations;
          dayResult.playersDiscovered = observations.filter((obs) =>
            newDiscoveries.some((d) => d.playerId === obs.playerId),
          ).length;
        }
      }

      if (totalObservations > 0) {
        youthVenueResults = {
          updatedUnsignedYouth,
          newObservations,
          newDiscoveries,
          totalObservations,
          totalDiscoveries,
        };
      }
    }

    set({
      weekSimulation: {
        dayResults,
        currentDay: 0,
        pendingWorldTick: false,
        youthVenueResults,
      },
      currentScreen: "weekSimulation",
    });
  },

  advanceDay: () => {
    const sim = get().weekSimulation;
    if (!sim || sim.currentDay >= 7) return;

    const nextDay = sim.currentDay + 1;
    const isDone = nextDay >= sim.dayResults.length;

    if (isDone) {
      // All days shown — run the full advanceWeek to process everything
      set({
        weekSimulation: {
          ...sim,
          currentDay: 7,
          pendingWorldTick: true,
        },
      });
      // Trigger the actual week advancement
      get().advanceWeek();
      set({ weekSimulation: null, currentScreen: "calendar" });
    } else {
      set({
        weekSimulation: {
          ...sim,
          currentDay: nextDay,
        },
      });
    }
  },

  fastForwardWeek: () => {
    const sim = get().weekSimulation;
    if (!sim) return;

    // Skip to end and run the full advanceWeek
    set({ weekSimulation: null });
    get().advanceWeek();
    set({ currentScreen: "calendar" });
  },

  // Match scheduling (calendar-based)
  scheduleMatch: (fixtureId) => {
    const { gameState } = get();
    if (!gameState) return false;
    // Youth scouts cannot attend first-team matches
    if (gameState.scout.primarySpecialization === "youth") return false;

    const fixture = gameState.fixtures[fixtureId];
    if (!fixture) return false;

    // Guard: already scheduled
    const alreadyScheduled = gameState.schedule.activities.some(
      (a) => a !== null && a.type === "attendMatch" && a.targetId === fixtureId,
    );
    if (alreadyScheduled) return false;

    const slotCost = ACTIVITY_SLOT_COSTS.attendMatch;
    const homeClub = gameState.clubs[fixture.homeClubId];
    const awayClub = gameState.clubs[fixture.awayClubId];
    const activity: Activity = {
      type: "attendMatch",
      slots: slotCost,
      targetId: fixture.id,
      description: `Scout: ${homeClub?.shortName ?? "?"} vs ${awayClub?.shortName ?? "?"}`,
    };

    // Find first available consecutive slot window
    for (let dayIndex = 0; dayIndex <= 7 - slotCost; dayIndex++) {
      if (canAddActivity(gameState.schedule, activity, dayIndex)) {
        get().scheduleActivity(activity, dayIndex);
        return true;
      }
    }

    return false; // no room
  },

  // Match
  startMatch: (fixtureId) => {
    const { gameState } = get();
    if (!gameState) return;
    // Youth scouts cannot attend first-team league matches
    if (gameState.scout.primarySpecialization === "youth") return;
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

    // Trigger first-match tutorial if the scout has never attended a match
    if (gameState.playedFixtures.length === 0) {
      useTutorialStore.getState().startSequence("firstMatch");
    }
  },

  advancePhase: () => {
    const { activeMatch } = get();
    if (!activeMatch) return;
    if (activeMatch.currentPhase >= activeMatch.phases.length - 1) return;
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
              ? {
                  ...f,
                  lens,
                  // Guard against duplicate phase indices (Fix #59)
                  phases: f.phases.includes(activeMatch.currentPhase)
                    ? f.phases
                    : [...f.phases, activeMatch.currentPhase],
                }
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
    // Tutorial auto-advance: step expects "playerFocused"
    useTutorialStore.getState().checkAutoAdvance("playerFocused");
  },

  endMatch: () => {
    const { activeMatch, gameState } = get();
    if (!activeMatch || !gameState) return;

    const rng = createRNG(`${gameState.seed}-observe-${activeMatch.fixtureId}`);
    const newObservations = { ...gameState.observations };

    // Issue 5a+6: Compute tool and equipment bonuses for observation confidence
    const toolBonuses = getActiveToolBonuses(gameState.unlockedTools);
    const equipBonuses = gameState.finances?.equipment
      ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
      : undefined;
    const equipBonus = equipBonuses?.observationConfidence ?? 0;

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

      // Apply tool confidence bonus + equipment observation bonus to readings
      const confBoost = (toolBonuses.confidenceBonus ?? 0) + equipBonus;
      if (confBoost > 0) {
        observation.attributeReadings = observation.attributeReadings.map((r) => ({
          ...r,
          confidence: Math.min(1, r.confidence + confBoost),
        }));
      }

      newObservations[observation.id] = observation;
    }

    // Simulate match result
    const fixture = gameState.fixtures[activeMatch.fixtureId];
    if (!fixture) {
      set({ activeMatch: null, lastMatchResult: null, currentScreen: "dashboard" });
      return;
    }
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

    let updatedGameState: GameState = {
      ...gameState,
      observations: newObservations,
      fixtures: { ...gameState.fixtures, [fixture.id]: updatedFixture },
      playedFixtures: updatedPlayedFixtures,
    };

    // --- Data anomaly validation ---
    // When a data scout attends a match where a flagged player is observed,
    // validate/refute the anomaly using the live observations.
    let anyAnomalyValidated = false;
    if (
      gameState.scout.primarySpecialization === "data" &&
      gameState.anomalyFlags.length > 0
    ) {
      const uninvestigated = gameState.anomalyFlags.filter((a) => !a.investigated);
      const observedPlayerIds = new Set(
        activeMatch.focusSelections.map((f) => f.playerId),
      );

      let updatedAnomalyFlags = [...gameState.anomalyFlags];

      for (const anomaly of uninvestigated) {
        if (!observedPlayerIds.has(anomaly.playerId)) continue;

        const playerObs = Object.values(newObservations).filter(
          (o) => o.playerId === anomaly.playerId,
        );
        const player = gameState.players[anomaly.playerId];
        if (!player) continue;

        const result = validateAnomalyFromObservation(anomaly, player, playerObs);

        updatedAnomalyFlags = updatedAnomalyFlags.map((a) =>
          a.id === anomaly.id ? result.updatedAnomaly : a,
        );

        if (result.validated) anyAnomalyValidated = true;
      }

      updatedGameState = { ...updatedGameState, anomalyFlags: updatedAnomalyFlags };
    }

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

    // Regional aha moment: first match in a region where the scout has familiarity >= 20
    if (
      gameState.scout.primarySpecialization === "regional" &&
      !useTutorialStore.getState().completedSequences.has("ahaMoment:regional")
    ) {
      const fixtureLeague = gameState.leagues[fixture.leagueId];
      if (fixtureLeague) {
        const matchCountry = fixtureLeague.country;
        const hasRegionalFamiliarity = Object.values(gameState.subRegions).some(
          (sr) => sr.country === matchCountry && sr.familiarity >= 20,
        );
        if (hasRegionalFamiliarity) {
          useTutorialStore.getState().queueSequence("ahaMoment:regional");
        }
      }
    }

    // Data aha: first anomaly validated via live observation
    if (
      anyAnomalyValidated &&
      !useTutorialStore.getState().completedSequences.has("ahaMoment:data")
    ) {
      useTutorialStore.getState().queueSequence("ahaMoment:data");
    }
  },

  // Reports
  startReport: (playerId) => {
    set({ selectedPlayerId: playerId, currentScreen: "reportWriter" });
    // Use the more detailed firstReportWriting tutorial for first-timers
    useTutorialStore.getState().startSequence("firstReportWriting");
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

    // First-team: evaluate report against directives and generate club response
    let updatedClubResponses = gameState.clubResponses;
    let responseInboxMessage: InboxMessage | null = null;
    let updatedScoutAfterResponse = updatedScout;
    let firstTeamAhaTriggered = false;

    if (
      gameState.scout.primarySpecialization === "firstTeam" &&
      gameState.scout.currentClubId
    ) {
      const responseRng = createRNG(
        `${gameState.seed}-response-${scoredReport.id}`,
      );
      const responsePlayer = gameState.players[selectedPlayerId];
      const responseClub = gameState.clubs[gameState.scout.currentClubId];
      const responseManager = gameState.managerProfiles[gameState.scout.currentClubId];

      if (responsePlayer && responseClub && responseManager) {
        const directiveMatch = evaluateReportAgainstDirectives(
          scoredReport,
          gameState.managerDirectives,
          responsePlayer,
          responseClub,
        );
        const matchedDirective = directiveMatch
          ? gameState.managerDirectives.find((d) => d.id === directiveMatch.directiveId)
          : undefined;
        let clubResponse = generateClubResponse(
          responseRng,
          scoredReport,
          responsePlayer,
          responseClub,
          responseManager,
          matchedDirective,
          updatedScout,
        );

        // First-outcome guarantee: first report with conviction >= recommend
        // always gets at least "interested" to ensure the aha moment fires early.
        const GUARANTEED_CONVICTIONS = new Set(["recommend", "strongRecommend", "tablePound"]);
        const hasNoPriorResponses = gameState.clubResponses.length === 0;
        const NEGATIVE_RESPONSES = new Set(["ignored", "doesNotFit", "tooExpensive"]);
        if (
          hasNoPriorResponses &&
          GUARANTEED_CONVICTIONS.has(conviction) &&
          NEGATIVE_RESPONSES.has(clubResponse.response)
        ) {
          clubResponse = {
            ...clubResponse,
            response: "interested",
            feedback: `The manager has added ${responsePlayer.firstName} ${responsePlayer.lastName} to the shortlist based on your report. Keep scouting — this is a promising start.`,
            reputationDelta: Math.max(clubResponse.reputationDelta, 2),
          };
        }

        updatedClubResponses = [...gameState.clubResponses, clubResponse];

        // Check for first-team aha moment: first positive response
        const POSITIVE_RESPONSES = new Set(["interested", "trial", "signed", "loanSigned"]);
        if (
          POSITIVE_RESPONSES.has(clubResponse.response) &&
          !gameState.clubResponses.some((r) => POSITIVE_RESPONSES.has(r.response))
        ) {
          firstTeamAhaTriggered = true;
        }

        // Apply reputation delta from club response
        const repAfterResponse = Math.max(
          0,
          Math.min(100, updatedScoutAfterResponse.reputation + clubResponse.reputationDelta),
        );
        updatedScoutAfterResponse = {
          ...updatedScoutAfterResponse,
          reputation: repAfterResponse,
        };

        responseInboxMessage = {
          id: `club-response-${scoredReport.id}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "feedback" as const,
          title: `Club Response: ${responsePlayer.firstName} ${responsePlayer.lastName}`,
          body: `${clubResponse.feedback}\n\nReputation change: ${clubResponse.reputationDelta >= 0 ? "+" : ""}${clubResponse.reputationDelta}`,
          read: false,
          actionRequired: false,
          relatedId: selectedPlayerId,
          relatedEntityType: "player" as const,
        };
      }
    }

    // Data scout: auto-generate prediction when submitting strong-conviction reports
    let updatedPredictions = gameState.predictions;
    if (
      gameState.scout.primarySpecialization === "data" &&
      (conviction === "strongRecommend" || conviction === "tablePound")
    ) {
      const predRng = createRNG(`${gameState.seed}-pred-${scoredReport.id}`);
      const suggestions = generatePredictionSuggestions(
        predRng,
        gameState.scout,
        player,
        gameState.currentSeason,
      );
      if (suggestions.length > 0) {
        const top = suggestions[0];
        const prediction = createPrediction(
          `pred_${scoredReport.id}`,
          selectedPlayerId,
          gameState.scout.id,
          top.type,
          top.statement,
          top.suggestedConfidence,
          gameState.currentSeason,
          gameState.currentWeek,
        );
        updatedPredictions = [...gameState.predictions, prediction];
      }
    }

    set({
      gameState: {
        ...gameState,
        reports: { ...gameState.reports, [scoredReport.id]: scoredReport },
        scout: updatedScoutAfterResponse,
        discoveryRecords: updatedDiscoveryRecords,
        clubResponses: updatedClubResponses,
        predictions: updatedPredictions,
        inbox: responseInboxMessage
          ? [...gameState.inbox, responseInboxMessage]
          : gameState.inbox,
      },
      currentScreen: "reportHistory",
    });
    // Tutorial auto-advance: step expects "reportSubmitted"
    const tutorialAfterReport = useTutorialStore.getState();
    tutorialAfterReport.checkAutoAdvance("reportSubmitted");

    // First-team aha moment: first positive club response
    if (firstTeamAhaTriggered) {
      tutorialAfterReport.queueSequence("ahaMoment:firstTeam");
    }
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

    const newFatigue = Math.min(
      100,
      Math.max(0, gameState.scout.fatigue + result.fatigueChange),
    );

    set({
      gameState: {
        ...gameState,
        narrativeEvents: updatedEvents,
        scout: {
          ...gameState.scout,
          reputation: newReputation,
          fatigue: newFatigue,
        },
        inbox: [...gameState.inbox, ...result.messages],
      },
    });
  },

  purchaseEquipItem: (itemId: EquipmentItemId) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;

    const updatedFinances = purchaseEquipmentItem(
      gameState.finances,
      itemId,
      gameState.currentWeek,
      gameState.currentSeason,
    );

    if (!updatedFinances) return;
    set({ gameState: { ...gameState, finances: updatedFinances } });
  },

  sellEquipItem: (itemId: EquipmentItemId) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;

    const updatedFinances = sellEquipmentItem(
      gameState.finances,
      itemId,
      gameState.currentWeek,
      gameState.currentSeason,
    );

    if (!updatedFinances) return;
    set({ gameState: { ...gameState, finances: updatedFinances } });
  },

  equipEquipItem: (itemId: EquipmentItemId) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;

    const updatedFinances = equipItem(gameState.finances, itemId);

    if (!updatedFinances) return;
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

  // Economics actions

  chooseCareerPath: (path: CareerPath) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const result = chooseCareerPath(gameState.scout, gameState.finances, path);
    set({
      gameState: {
        ...gameState,
        scout: result.scout,
        finances: result.finances,
      },
    });
  },

  changeLifestyle: (level: LifestyleLevel) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = changeLifestyle(gameState.finances, level);
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  listReportForSale: (reportId: string, price: number, isExclusive: boolean, targetClubId?: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = listReport(
      gameState.finances, reportId, price, isExclusive,
      targetClubId, gameState.currentWeek, gameState.currentSeason,
    );
    set({ gameState: { ...gameState, finances: updated } });
  },

  withdrawReportListing: (listingId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = withdrawListing(gameState.finances, listingId);
    set({ gameState: { ...gameState, finances: updated } });
  },

  acceptRetainerContract: (contract: RetainerContract) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = acceptRetainer(gameState.finances, contract, gameState.scout);
    if (updated) {
      // Remove from pending offers
      const pendingRetainers = (updated.pendingRetainerOffers ?? []).filter(
        (r) => r.id !== contract.id,
      );
      set({ gameState: { ...gameState, finances: { ...updated, pendingRetainerOffers: pendingRetainers } } });
    }
  },

  cancelRetainerContract: (contractId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = cancelRetainer(gameState.finances, contractId);
    set({ gameState: { ...gameState, finances: updated } });
  },

  enrollInCourse: (courseId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = enrollInCourse(
      gameState.finances, courseId,
      gameState.currentWeek, gameState.currentSeason,
    );
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  upgradeAgencyOffice: (tier: OfficeTier) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = upgradeOffice(gameState.finances, tier);
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  hireAgencyEmployee: (role: AgencyEmployeeRole) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const rng = createRNG(`${gameState.seed}-hire-${gameState.currentWeek}`);
    const updated = hireEmployee(rng, gameState.finances, role);
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  fireAgencyEmployee: (employeeId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = fireEmployee(gameState.finances, employeeId);
    set({ gameState: { ...gameState, finances: updated } });
  },

  takeLoanAction: (type: LoanType, amount: number) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = takeLoan(
      gameState.finances, type, amount,
      gameState.currentWeek, gameState.currentSeason,
    );
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  repayLoanAction: () => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = repayLoanEarly(
      gameState.finances, gameState.currentWeek, gameState.currentSeason,
    );
    if (updated) {
      set({ gameState: { ...gameState, finances: updated } });
    }
  },

  acceptConsultingContract: (contract: ConsultingContract) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const updated = acceptConsulting(gameState.finances, contract);
    // Remove from pending offers
    const pendingConsulting = (updated.pendingConsultingOffers ?? []).filter(
      (c) => c.id !== contract.id,
    );
    set({ gameState: { ...gameState, finances: { ...updated, pendingConsultingOffers: pendingConsulting } } });
  },

  declineRetainerOffer: (contractId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const pending = (gameState.finances.pendingRetainerOffers ?? []).filter(
      (r) => r.id !== contractId,
    );
    set({ gameState: { ...gameState, finances: { ...gameState.finances, pendingRetainerOffers: pending } } });
  },

  declineConsultingOffer: (contractId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.finances) return;
    const pending = (gameState.finances.pendingConsultingOffers ?? []).filter(
      (c) => c.id !== contractId,
    );
    set({ gameState: { ...gameState, finances: { ...gameState.finances, pendingConsultingOffers: pending } } });
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

  getAvailableCalendarActivities: () => {
    const { gameState } = get();
    if (!gameState) return [];
    return getAvailableActivities(
      gameState.scout,
      gameState.currentWeek,
      Object.values(gameState.fixtures).filter(
        (f) => f.week === gameState.currentWeek && !f.played,
      ),
      Object.values(gameState.contacts),
      gameState.subRegions,
      gameState.observations,
      gameState.unsignedYouth,
    );
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
