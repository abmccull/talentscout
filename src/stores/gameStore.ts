import { create } from "zustand";
import { createNavigationActions } from "./actions/navigationActions";
import { createObservationActions } from "./actions/observationActions";
import { createReportActions } from "./actions/reportActions";
import { createProgressionActions } from "./actions/progressionActions";
import { createFinanceActions } from "./actions/financeActions";
import { createWeeklyActions } from "./actions/weeklyActions";
import { createWeeklyAsyncActions } from "./actions/weeklyAsyncActions";
import { terminateWeeklySimulationWorker } from "@/lib/weeklySimulationWorkerClient";
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
  AnomalyFlag,
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
  LeaderboardEntry,
  PlayerMatchRating,
  BatchAdvanceResult,
  QuickScoutPriorities,
  DataSubscriptionTier,
  TravelBudgetTier,
  OfficeEquipmentTier,
  TransferRecord,
  TransferAddOn,
  LegacyProfile,
  ActionableGossipItem,
  GossipAction,
  ChainConsequence,
  BoardSatisfactionDelta,
  DifficultyLevel,
  CareerTier,
  GutFeeling,
  StructuredReportInput,
  ManagerMeetingApproach,
  BoardMeetingApproach,
} from "@/engine/core/types";
import type { ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import type { LensType } from "@/engine/observation/types";
import type { InsightActionId, InsightActionResult } from "@/engine/insight/types";
import type { CardEvent } from "@/engine/core/types";
import type { ActivityChoiceId } from "@/engine/core/activityInteractions";
import type { ActivityQualityResult, ActivityQualityTier } from "@/engine/core/activityQuality";
import { generateDirectives } from "@/engine/firstTeam";
import { checkToolUnlocks } from "@/engine/tools";
import { classifyStandingZone } from "@/engine/world/index";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import {
  generateSeasonTournaments,
  generateYouthRecruitmentBriefs,
} from "@/engine/youth";
import { createLeaderboardEntry, submitLeaderboardEntry } from "@/lib/leaderboard";
import { generateBoardProfile } from "@/engine/firstTeam/boardAI";
import { createRNG } from "@/engine/rng";
import { getSeasonLength } from "@/engine/core/gameDate";
import {
  createRunManifest,
  deriveWorldTraitIds,
  applyScoutIdentityContactEffects,
  formatScoutIdentityBrief,
  formatWorldTraitBrief,
  getScoutIdentityContentDefinitionIds,
  getRunSimulationModifiers,
  getWorldTraitContentDefinitionIds,
} from "@/engine/run";
import { getRunContentDefinitionIds } from "@/engine/content/registry";
import { getGameModeIdForSpecialization } from "@/engine/content/modeDefinitions";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createEventDirectorState } from "@/engine/events/eventDirector";
import { generateSeasonEvents, getActiveSeasonEvents } from "@/engine/core/seasonEvents";
import { createEmptyPool } from "@/engine/freeAgents/pool";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
} from "@/engine/core/transferWindow";
import {
  applyWorldConditionSeasonStart,
  createWorldConditionState,
  getTravelEligibleCountryKeys,
  getWorldConditionContentDefinitionIds,
  getWorldConditionModifiers,
  initializeWorld,
} from "@/engine/world";
import { createScout } from "@/engine/scout/creation";
import {
  generateStartingContacts,
  generateContactForType,
  getContactCoverageCountry,
} from "@/engine/network/contacts";
import { createWeekSchedule, getAvailableActivities } from "@/engine/core/calendar";
import {
  createWeeklyStrategyState,
  type DelegationPolicyId,
  type WeeklyIntentId,
} from "@/engine/core/weeklyStrategy";
import {
  initializeRegionalKnowledge,
  synchronizeRegionalFamiliarity,
} from "@/engine/specializations/regionalKnowledge";
import { getUnlockedPerks } from "@/engine/specializations/perks";
import { generateManagerProfiles } from "@/engine/analytics";
import { generateRegionalYouth } from "@/engine/youth/generation";
import {
  initializeFinances,
  applyBalanceTransaction,
} from "@/engine/finance";
import type { EquipmentItemId } from "@/engine/finance";
import type { EmployeeAssignment, ClientRelationship } from "@/engine/core/types";
import {
  createRivalOrganizationState,
  generateRivalScouts,
  getRivalOrganizationContentDefinitionIds,
  initializeRivalOrganizations,
} from "@/engine/rivals";
import { getCountryDataSync, getSecondaryCountries } from "@/data/index";
import {
  migrateSaveState,
  type SaveRecord,
  AUTOSAVE_SLOT,
} from "@/lib/db";
import {
  loadResultGameState,
  persistGameState,
  type SaveConflict,
  type SaveSource,
} from "@/lib/saveProvider";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { useTutorialStore } from "@/stores/tutorialStore";
import {
  applyScenarioSetup,
  applyScenarioOverrides,
  getInvalidScenarioReason,
} from "@/engine/scenarios";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import type { ScenarioProgress } from "@/engine/scenarios";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { normalizeCountryKey } from "@/lib/country";
import {
  generateLegacyProfile as generateLegacyProfileEngine,
  applyLegacyPerks as applyLegacyPerksEngine,
  hasRepresentedCareerCompletionState,
  markCareerVoluntarilyRetired,
  readLegacyProfile,
  writeLegacyProfile,
} from "@/engine/career/legacy";
import {
  getResolvedPlayerIds,
  resolvePlayerEntity,
} from "@/lib/playerResolution";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import {
  createOpeningCase,
  type OpeningCaseChoiceId,
} from "@/engine/youth/openingCase";
import { resolveCareerOpeningMode } from "@/engine/youth/openingMode";
import {
  readPlayerExperience,
  recordVeteranPrologueTemplate,
} from "@/lib/playerExperience";

import type {
  ClubStanding,
  GameStoreState,
  SaveSlotSummary,
} from "./gameStoreTypes";
import { resolveGameScreenForBuild } from "./gameScreenScope";

export type {
  ClubStanding,
  GameScreen,
  GameStoreState,
  SaveConflictState,
  SaveSlotSummary,
  WeekSummary,
} from "./gameStoreTypes";

function slotNumberToSaveName(slot: number): string {
  return slot === AUTOSAVE_SLOT ? "autosave" : `slot_${slot}`;
}

function assertEarlyAccessSaveCompatibility(state: GameState): void {
  if (
    IS_YOUTH_EARLY_ACCESS &&
    state.scout.primarySpecialization !== "youth"
  ) {
    throw new Error(
      "This save uses a specialization that is not available in Youth Scout Early Access. The save remains safely stored for a future full-game build.",
    );
  }
}

const YOUTH_CONTACT_TYPES = new Set([
  "academyCoach",
  "grassrootsOrganizer",
  "schoolCoach",
  "youthAgent",
  "academyDirector",
  "localScout",
]);

function pickRandomUniqueIds(rng: ReturnType<typeof createRNG>, pool: string[], count: number): string[] {
  const available = [...pool];
  const picked: string[] = [];

  while (picked.length < count && available.length > 0) {
    const idx = rng.nextInt(0, available.length - 1);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  return picked;
}

function seedContactKnownPlayerIds(
  rng: ReturnType<typeof createRNG>,
  contact: Contact,
  specialization: Specialization,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  leagues: Record<string, League>,
  unsignedYouth: Record<string, UnsignedYouth>,
  fallbackCountry: string,
): string[] {
  const coverageCountry = getContactCoverageCountry(contact, fallbackCountry);
  const count = rng.nextInt(4, 8);
  const isYouthContact = YOUTH_CONTACT_TYPES.has(contact.type) && specialization === "youth";

  if (isYouthContact) {
    const youthPool = Object.values(unsignedYouth)
      .filter((youth) => !youth.placed && !youth.retired)
      .filter((youth) => !coverageCountry || youth.country === coverageCountry)
      .map((youth) => youth.id);

    return pickRandomUniqueIds(
      rng,
      youthPool.length > 0 ? youthPool : Object.keys(unsignedYouth),
      count,
    );
  }

  const allPlayerIds = Object.keys(players);
  const seniorPool = coverageCountry
    ? allPlayerIds.filter((id) => {
        const player = players[id];
        const club = player ? clubs[player.clubId] : undefined;
        const league = club ? leagues[club.leagueId] : undefined;
        return league?.country === coverageCountry;
      })
    : [];

  return pickRandomUniqueIds(
    rng,
    seniorPool.length > 0 ? seniorPool : allPlayerIds,
    count,
  );
}

// ---------------------------------------------------------------------------
// Migration: Player roles, traits & tactical depth expansion
// ---------------------------------------------------------------------------
// Module-level flag to prevent autosave race condition (Fix #24)
let _autosavePending = false;

// Type alias for backward compatibility with external references
type GameStore = GameStoreState;

// World generation crosses several asynchronous boundaries. Keep it
// single-flight so double activation cannot race two careers into one store.
let newGameStartInFlight = false;

export const useGameStore = create<GameStore>((set, get) => ({
  // Navigation
  currentScreen: "mainMenu",
  // Navigation actions (extracted to actions/navigationActions.ts)
  ...createNavigationActions(get, set),

  // State
  gameState: null,
  isLoaded: false,
  activeMatch: null,
  activeSession: null,
  sessionReturnScreen: null,
  lastReflectionResult: null,
  lastInsightResult: null,
  lastWeekSummary: null,
  batchSummary: null,
  isAdvancingWeek: false,
  lastWeeklyExecutionRoute: null,
  lastWeeklyWorkerTelemetry: null,
  weeklyTransactionError: null,
  lastMatchResult: null,
  selectedPlayerId: null,
  selectedFixtureId: null,
  saveSlots: [],
  saveRecoveryCopies: [],
  saveSyncStatus: {
    pendingCount: 0,
    failedCount: 0,
    lastError: null,
    oldestQueuedAt: null,
  },
  isSaving: false,
  isLoadingSave: false,
  saveConflict: null,
  isResolvingSaveConflict: false,
  autosaveError: null,

  // Scenario transient state
  selectedScenarioId: null,
  scenarioProgress: null,
  scenarioOutcome: null,
  scenarioOutcomeScenarioId: null,

  // Celebration transient state
  pendingCelebration: null,

  // Transfer Negotiation (F4)
  activeNegotiationId: null,

  // Cross-screen fixture filter
  pendingFixtureClubFilter: null,

  // Cross-screen calendar pre-fill
  pendingCalendarActivity: null,
  pendingInternationalCountry: null,

  // Post-submit listing prompt (transient — not persisted)
  pendingListingReportId: null,
  dismissPendingListing: () => set({ pendingListingReportId: null }),

  // Report comparison (F11) — transient UI state
  comparisonReportIds: [],

  // Day-by-day simulation state
  weekSimulation: null,

  // Start new game
  startNewGame: async (config) => {
    if (newGameStartInFlight) return;
    terminateWeeklySimulationWorker();
    set({
      isAdvancingWeek: false,
      lastWeeklyExecutionRoute: null,
      lastWeeklyWorkerTelemetry: null,
      weeklyTransactionError: null,
    });
    newGameStartInFlight = true;
    try {
    // Apply scenario config overrides before world generation
    // Scenario selection is deliberately outside the Youth EA contract. Ignore
    // any stale transient selection left by an older/full-build session.
    const scenarioId = IS_YOUTH_EARLY_ACCESS ? null : get().selectedScenarioId;
    const scenario = scenarioId ? getScenarioById(scenarioId) : undefined;
    if (scenarioId && !scenario) {
      const reason = getInvalidScenarioReason(scenarioId);
      set({
        selectedScenarioId: null,
        scenarioProgress: {
          scenarioId,
          valid: false,
          objectives: [],
          allRequiredComplete: false,
          failed: true,
          failReason: reason,
          invalidReason: reason,
        },
        scenarioOutcome: "failure",
        scenarioOutcomeScenarioId: scenarioId,
      });
      return;
    }
    const effectiveConfig = scenario ? applyScenarioSetup(config, scenario) : config;

    const selectedCountries = effectiveConfig.selectedCountries ?? ["england"];
    const startingCountry =
      effectiveConfig.startingCountry ??
      effectiveConfig.region ??
      selectedCountries[0] ??
      "england";
    const worldTraitIds = deriveWorldTraitIds(
      effectiveConfig.worldSeed,
      effectiveConfig.specialization,
    );
    const runManifest = createRunManifest({
      rootSeed: effectiveConfig.worldSeed,
      specialization: effectiveConfig.specialization,
      difficulty: effectiveConfig.difficulty,
      selectedCountries,
      startingCountry: selectedCountries.includes(startingCountry)
        ? startingCountry
        : selectedCountries[0],
      integrity: effectiveConfig.difficulty === "ironman" ? "ironman" : "standard",
      worldTraitIds,
      originId: effectiveConfig.originId,
      flawId: effectiveConfig.flawId,
      doctrineIds: effectiveConfig.doctrineIds,
      contentDefinitionIds: [
        ...getRunContentDefinitionIds(
          getGameModeIdForSpecialization(effectiveConfig.specialization),
          scenario?.id,
        ),
        ...getWorldTraitContentDefinitionIds(),
        ...getWorldConditionContentDefinitionIds(),
        ...getScoutIdentityContentDefinitionIds(),
        ...getRivalOrganizationContentDefinitionIds(),
        "narrative-catalog:youth-ea.3",
        "storyline-catalog:storylines.1",
        "consequence-engine:consequences.1",
      ],
    });
    const runModifiers = getRunSimulationModifiers(runManifest);
    const rng = createRNG(effectiveConfig.worldSeed);
    const { leagues, clubs, players, fixtures, territories, subRegions } = await initializeWorld(
      rng,
      selectedCountries,
    );
    let scout = createScout(effectiveConfig, rng);
    // `countries` is the map/travel surface, not a static data catalogue. It
    // must only contain countries actually generated into this world. All
    // secondary talent pools remain present because initializeWorld creates
    // their clubs, players and youth regions even though they have no fixtures.
    const worldCountries = getTravelEligibleCountryKeys({
      countries: [...new Set([...selectedCountries, ...getSecondaryCountries()])],
      territories,
      leagues,
      clubs,
      players,
      fixtures,
      subRegions,
      unsignedYouth: {},
      youthTournaments: {},
    });
    const worldConditionState = createWorldConditionState(
      runManifest,
      worldCountries,
      1,
    );
    const initialRegionalKnowledge = initializeRegionalKnowledge(
      worldCountries,
      effectiveConfig.startingCountry ?? effectiveConfig.region ?? selectedCountries[0] ?? "england",
    );
    const synchronizedGeography = synchronizeRegionalFamiliarity(
      scout,
      subRegions,
      initialRegionalKnowledge,
    );
    scout = synchronizedGeography.scout;
    const contacts: Record<string, Contact> = {};
    const startingContacts = applyScoutIdentityContactEffects(
      generateStartingContacts(rng, scout),
      runManifest,
    );

    // Generate initial unsigned youth so the pool is populated from game start.
    // World initialization populates the synchronous country cache, so this
    // lookup is safe without introducing an async branch into new-game setup.
    const initialUnsignedYouth: Record<string, UnsignedYouth> = {};
    if (effectiveConfig.specialization === "youth") {
      const youthRng = createRNG(`${effectiveConfig.worldSeed}-youth-s1`);
      for (const countryKey of worldCountries) {
        const countryData = getCountryDataSync(countryKey);
        if (!countryData) continue;
        // Call multiple times per country to overcome 30% chance gate
        const conditionModifiers = getWorldConditionModifiers(
          { worldConditionState },
          countryKey,
        );
        const initialGenerationAttempts = Math.max(
          5,
          Math.round(10 * conditionModifiers.discoveryMultiplier),
        );
        for (let attempt = 0; attempt < initialGenerationAttempts; attempt++) {
          const countrySubRegions = Object.values(synchronizedGeography.subRegions).filter(
            (subRegion) =>
              (subRegion.countryKey ?? normalizeCountryKey(subRegion.country)) === countryData.key,
          );
          const batch = generateRegionalYouth(
            youthRng,
            countryData,
            1,
            attempt + 1,
            countrySubRegions,
            runModifiers.youthTalentMultiplier,
            "initial",
          );
          for (const y of batch) initialUnsignedYouth[y.id] = y;
        }
      }
    }

    // Populate knownPlayerIds after world generation so contacts are grounded
    // in their actual coverage country instead of a random world region.
    const scoutHomeCountry = getScoutHomeCountry(scout);

    for (const c of startingContacts) {
      const knownPlayerIds = seedContactKnownPlayerIds(
        rng,
        c,
        effectiveConfig.specialization,
        players,
        clubs,
        leagues,
        initialUnsignedYouth,
        scoutHomeCountry,
      );
      contacts[c.id] = { ...c, knownPlayerIds };
    }

    // Generate season events and transfer windows for season 1
    const initialSeasonEvents = generateSeasonEvents(
      1,
      getSeasonLength(fixtures, 1),
    );
    const initialTransferWindows = initializeTransferWindows(1);
    const initialTransferWindow = getCurrentTransferWindow(
      initialTransferWindows.map((w) => ({ ...w, isOpen: isTransferWindowOpen([w], 1) })),
      1,
    );
    const initialRecruitmentBriefs = Object.fromEntries(
      generateYouthRecruitmentBriefs(
        createRNG(`${effectiveConfig.worldSeed}-academy-briefs-s1w1`),
        Object.values(clubs),
        players,
        1,
        1,
        {},
        Math.max(
          8,
          Math.round(
            12 * getWorldConditionModifiers({ worldConditionState })
              .opportunityMultiplier,
          ),
        ),
        getSeasonLength(fixtures, 1),
        effectiveConfig.worldSeed,
      ).map((brief) => [brief.id, brief]),
    );

    // Build a temporary state object so Phase 2 generators can read world data
    const tempState: GameState = {
      seed: effectiveConfig.worldSeed,
      runManifest,
      currentWeek: 1,
      currentSeason: 1,
      difficulty: effectiveConfig.difficulty,
      scout,
      leagues,
      clubs,
      players,
      fixtures,
      observations: {},
      reports: {},
      scoutingCases: {},
      reportDeliveries: {},
      clubDecisions: {},
      youthRecruitmentBriefs: initialRecruitmentBriefs,
      recommendationReviews: {},
      contacts,
      schedule: createWeekSchedule(1, 1),
      weeklyStrategy: createWeeklyStrategyState(1, 1),
      jobOffers: [],
      performanceReviews: [],
      inbox: [],
      npcScouts: {},
      npcReports: {},
      npcDelegations: {},
      territories,
      countries: worldCountries,
      worldConditionState,
      narrativeEvents: [],
      activeStorylines: [],
      eventDirector: createEventDirectorState(),
      consequenceState: createConsequenceEngineState(),
      eventChains: [],
      rivalScouts: {},
      rivalOrganizationState: createRivalOrganizationState(),
      rivalActivities: [],
      unlockedTools: [],
      managerProfiles: {},
      seasonEvents: initialSeasonEvents,
      transferWindow: initialTransferWindow,
      completedScenarioIds: [],
      discoveryRecords: [],
      performanceHistory: [],
      transferRecords: [],
      playedFixtures: [],
      watchlist: [],
      contactIntel: {},
      unsignedYouth: initialUnsignedYouth,
      placementReports: {},
      gutFeelings: [],
      reflectionJournal: {},
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
      subRegions: synchronizedGeography.subRegions,
      youthTournaments: {},
      internationalAssignments: [],
      activeInternationalAssignment: null,
      internationalAssignmentHistory: [],
      retiredPlayerIds: [],
      retiredPlayers: {},
      playerMovementHistory: [],
      // First-Team Scouting System
      managerDirectives: [],
      clubResponses: [],
      systemFitCache: {},
      // Transfer Negotiation System (F4)
      activeNegotiations: [],
      // Match Rating System
      matchRatings: {},
      // F14: Financial Strategy Layer
      scoutingInfrastructure: {
        dataSubscription: "none" as const,
        travelBudget: "economy" as const,
        officeEquipment: "basic" as const,
        investmentCosts: { weekly: 0, oneTime: 0 },
      },
      assistantScouts: [],
      // Data Scouting System
      predictions: [],
      dataAnalysts: [],
      statisticalProfiles: {},
      anomalyFlags: [],
      analystReports: {},
      // Discipline/Card System
      disciplinaryRecords: {},
      // Regional Scouting Depth (F13)
      regionalKnowledge: initialRegionalKnowledge,
      // Dynamic Board Expectations (F10)
      boardReactions: [],
      // Gossip actions (A3)
      gossipItems: [],
      // Board satisfaction tracking (A4)
      satisfactionHistory: [],
      // Interactive observation sessions
      completedInteractiveSessions: [],
      // Free Agent System
      freeAgentPool: createEmptyPool(1),
      freeAgentNegotiations: [],
      activeLoans: [],
      loanHistory: [],
      loanRecommendations: [],
      createdAt: Date.now(),
      lastSaved: Date.now(),
      totalWeeksPlayed: 0,
    };

    // ── Phase 2 initialization ──────────────────────────────────────────────

    // 1. Initialize finances (difficulty scales starting cash and stipend)
    const finances = initializeFinances(scout, undefined, effectiveConfig.difficulty);

    // 2. Generate rival scouts (uses a dedicated seed)
    const rivalRng = createRNG(`${effectiveConfig.worldSeed}-rivals-init`);
    const rivalScouts = generateRivalScouts(rivalRng, tempState);
    const rivalOrganizationState = initializeRivalOrganizations(
      effectiveConfig.worldSeed,
      rivalScouts,
      1,
    ).state;

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
    const scoutIdentityBrief = formatScoutIdentityBrief(runManifest);

    const employmentIntro = scout.currentClubId
      ? `You are employed as a club scout with a weekly salary of £${scout.salary}. Your club expects reports aligned with their scouting priorities. Build trust with your employer to earn more influence over signings.`
      : `You are a freelance scout. Turn distinct evidence-backed cases into marketplace sales, placements, and trusted client work. Build your reputation through delivery and the consequences of your judgment.`;

    // Generate initial youth tournaments for season 1
    const tournamentRng = createRNG(`${effectiveConfig.worldSeed}-tournaments-s1`);
    const initialTournaments = generateSeasonTournaments(tournamentRng, 1, tempState.countries, scout);

    const rawGameState: GameState = {
      ...tempState,
      youthTournaments: initialTournaments,
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
            "Your first filing opens an accountable scouting case; revisions require new evidence and do not inflate output. Delivery, calibrated conviction, and later player outcomes build or damage your standing. As your reputation grows, clubs offer better roles and wider territories.",
            "",
            "Good luck, scout. The pitch is waiting.",
          ].join("\n"),
          read: false,
          actionRequired: false,
        },
        {
          id: "starter-bonus",
          week: 1,
          season: 1,
          type: "event",
          title: "Welcome Package",
          body: "Welcome to scouting! As part of your starter package, your first report sold will earn a 50% bonus payment, and your first placement fee will earn a 25% bonus. Make them count!",
          read: false,
          actionRequired: false,
        },
        {
          id: `run-conditions-${runManifest.fingerprint}`,
          week: 1,
          season: 1,
          type: "news",
          title: "This Career's Football World",
          body: [
            "Every TalentScout career has persistent world conditions. These conditions change talent supply, rival pressure, event pacing, and the market for the entire run.",
            "",
            ...(scoutIdentityBrief
              ? ["YOUR SCOUTING DNA", scoutIdentityBrief, ""]
              : []),
            formatWorldTraitBrief(runManifest.worldTraitIds),
            "",
            `Run fingerprint: ${runManifest.fingerprint.toUpperCase()}`,
          ].join("\n"),
          read: false,
          actionRequired: false,
        },
      ],
      // Phase 2 populated values
      finances,
      rivalScouts,
      rivalOrganizationState,
      rivalActivities: [],
      managerProfiles,
      unlockedTools: startingTools,
      managerDirectives: initialDirectives,
    };
    const gameState = applyWorldConditionSeasonStart(rawGameState);

    // Apply scenario GameState overrides (week, season, reputation, tier, activeScenarioId)
    const scenarioState = scenario ? applyScenarioOverrides(gameState, scenario) : gameState;
    const tutorialState = useTutorialStore.getState();
    const openingMode = resolveCareerOpeningMode({
      requested: effectiveConfig.openingMode,
      specialization: effectiveConfig.specialization,
      hasScenario: Boolean(scenario),
      tutorialCompleted: tutorialState.guidedSessionCompleted,
      tutorialsDismissed: tutorialState.dismissed,
    });
    const openingInput = {
          seed: effectiveConfig.worldSeed,
          scout: scenarioState.scout,
          unsignedYouth: scenarioState.unsignedYouth,
          contacts: scenarioState.contacts,
          youthRecruitmentBriefs: scenarioState.youthRecruitmentBriefs,
          preferredCountry: effectiveConfig.selectedCountries?.[0] ?? "england",
          week: scenarioState.currentWeek,
          season: scenarioState.currentSeason,
    };
    const veteranPrologue = openingMode === "dynamic"
      ? (await import("@/engine/youth/veteranPrologue")).createVeteranPrologueCase({
          ...openingInput,
          persona: {
            specialization: scenarioState.scout.primarySpecialization,
            careerPath: scenarioState.scout.careerPath,
            originId: effectiveConfig.originId,
            flawId: effectiveConfig.flawId,
            doctrineIds: effectiveConfig.doctrineIds,
            nationality: effectiveConfig.nationality,
            startingCountry,
          },
          recentTemplateIds: readPlayerExperience().recentVeteranPrologueTemplateIds,
        })
      : null;
    if (veteranPrologue) {
      recordVeteranPrologueTemplate(veteranPrologue.templateId);
    }
    const openingCase = openingMode === "tutorial"
      ? createOpeningCase(openingInput)
      : veteranPrologue?.openingCase ?? null;
    const finalGameState: GameState = openingCase
      ? {
          ...scenarioState,
          openingCase,
          ...(veteranPrologue ? { veteranPrologue } : {}),
        }
      : scenarioState;

    set({
      gameState: finalGameState,
      isLoaded: true,
      currentScreen: "dashboard",
      selectedPlayerId: openingCase?.playerId ?? null,
      selectedScenarioId: null,
      scenarioProgress: null,
      scenarioOutcome: null,
    });

    // Teaching and career variety are separate: the authored case teaches the
    // loop once, while generated veteran prologues never reactivate mentor UI.
    if (openingMode === "tutorial" && openingCase) {
      useTutorialStore.getState().startGuidedSession(
        !!effectiveConfig.startingClubId,
        "discoveryHook",
        {
          forceReplay:
            tutorialState.guidedSessionCompleted || tutorialState.dismissed,
        },
      );
    } else if (effectiveConfig.specialization !== "youth" && !scenario) {
      useTutorialStore.getState().startGuidedSession(
        !!effectiveConfig.startingClubId,
        "firstWeek",
      );
    }
    if (openingCase) {
      const openingPlayerIds = new Set(openingCase.playerPoolIds);
      const openingPool = Object.values(finalGameState.unsignedYouth)
        .filter((youth) => openingPlayerIds.has(youth.player.id))
        .sort((left, right) =>
          openingCase.playerPoolIds.indexOf(left.player.id)
          - openingCase.playerPoolIds.indexOf(right.player.id)
        )
        .map((youth) => ({
          playerId: youth.player.id,
          name: `${youth.player.firstName} ${youth.player.lastName}`,
          position: youth.player.position,
        }));
      get().startObservationSession(
        veteranPrologue?.activityType ?? "schoolMatch",
        openingPool,
        openingCase.playerId,
        {
          activityInstanceId: veteranPrologue?.activityInstanceId ?? openingCase.id,
          returnScreen: "reportWriter",
          contactId: openingCase.sourceContactId,
        },
      );
    } else {
      // The standard path lands on the dashboard before the guided session starts.
      useTutorialStore.getState().completeMilestone("viewedDashboard");
    }
    } finally {
      newGameStartInFlight = false;
    }
  },

  loadGame: (rawState) => {
    terminateWeeklySimulationWorker();
    // Every runtime entrypoint, including direct test/import loads, passes
    // through the same pure and idempotent migration used by save providers.
    const scenarioSafeState = migrateSaveState(rawState);
    assertEarlyAccessSaveCompatibility(scenarioSafeState);
    const resumableSession = scenarioSafeState.activeObservationSession ?? null;
    const awaitingOpeningDecision = scenarioSafeState.openingCase?.stage === "decision";
    const restoreScreen = resumableSession
      ? "observation"
      : awaitingOpeningDecision
        ? "openingDiscovery"
        : "dashboard";
    set({
      gameState: scenarioSafeState,
      isLoaded: true,
      currentScreen: resolveGameScreenForBuild(restoreScreen, true),
      selectedPlayerId: scenarioSafeState.openingCase?.playerId ?? null,
      scenarioProgress: null,
      scenarioOutcome: null,
      scenarioOutcomeScenarioId: null,
      pendingCelebration: null,
      activeSession: resumableSession,
      sessionReturnScreen: resumableSession
        ? resolveGameScreenForBuild("dashboard", true)
        : null,
      weekSimulation: null,
      lastWeekSummary: null,
      batchSummary: null,
      saveConflict: null,
      isResolvingSaveConflict: false,
      isAdvancingWeek: false,
      lastWeeklyExecutionRoute: null,
      lastWeeklyWorkerTelemetry: null,
      weeklyTransactionError: null,
    });

    const tutState = useTutorialStore.getState();
    if (!tutState.dismissed && !tutState.guidedSessionCompleted) {
      const hasIncomplete = Object.values(tutState.guidedMilestones).some((value) => !value);
      if (hasIncomplete) useTutorialStore.setState({ guidedSessionActive: true });
    }
  },

  saveGame: () => {
    const { gameState, activeSession } = get();
    if (!gameState) return null;
    const saved = {
      ...gameState,
      activeObservationSession: activeSession,
      lastSaved: Date.now(),
    };
    set({ gameState: saved });
    getActiveSaveProvider()
      .then((provider) => persistGameState(provider, "autosave", saved, "Autosave"))
      .then((commit) => {
        const savedAt = commit?.record.state.lastSaved;
        if (!Number.isFinite(savedAt)) return;
        set((current) => {
          const currentState = current.gameState;
          if (!currentState || currentState.lastSaved >= savedAt!) return {};
          return {
            gameState: {
              ...currentState,
              lastSaved: savedAt!,
            },
          };
        });
      })
      .catch((err) => {
        console.warn("saveGame: provider persist failed:", err);
        void import("@/lib/sentry").then(({ captureException }) => captureException(err));
      });
    return saved;
  },

  // Persistence (save provider)
  saveToSlot: async (slot, name) => {
    const { gameState, activeSession } = get();
    if (!gameState) return;
    set({ isSaving: true, saveConflict: null });
    try {
      const saved = {
        ...gameState,
        activeObservationSession: activeSession,
        lastSaved: Date.now(),
      };
      const provider = await getActiveSaveProvider();
      const commit = await persistGameState(
        provider,
        slotNumberToSaveName(slot),
        saved,
        name,
      );
      set({
        gameState: {
          ...saved,
          lastSaved: commit?.record.state.lastSaved ?? Date.now(),
        },
      });
      await get().refreshSaveSlots();
    } finally {
      set({ isSaving: false });
    }
  },

  loadFromSlot: async (slot) => {
    set({ isLoadingSave: true });
    try {
      const provider = await getActiveSaveProvider();
      const slotName = slotNumberToSaveName(slot);
      const conflict = await provider.checkConflict(slotName);
      if (conflict) {
        set({
          saveConflict: {
            slot,
            conflict,
          },
        });
        return;
      }

      set({ saveConflict: null });
      const loaded = await provider.load(slotName);
      if (!loaded) return;

      get().loadGame(loadResultGameState(loaded));
    } finally {
      set({ isLoadingSave: false });
    }
  },

  deleteSlot: async (slot) => {
    const provider = await getActiveSaveProvider();
    await provider.delete(slotNumberToSaveName(slot));
    await get().refreshSaveSlots();
  },

  refreshSaveSlots: async () => {
    const provider = await getActiveSaveProvider();
    const entries = await provider.listSaves();
    const slots: SaveSlotSummary[] = [];
    const bySlot = new Map<string, typeof entries>();
    for (const entry of entries) {
      const group = bySlot.get(entry.slotName) ?? [];
      group.push(entry);
      bySlot.set(entry.slotName, group);
    }

    for (const group of bySlot.values()) {
      const entry = group.find((candidate) => !candidate.unavailable) ?? group[0];
      if (!entry) continue;
      const damagedLocal = group.find(
        (candidate) => candidate.source === "local" && candidate.unavailable,
      );
      slots.push({
        slot: entry.slot,
        name: entry.name,
        savedAt: entry.savedAt,
        season: entry.season,
        week: entry.week,
        scoutName: entry.scoutName,
        specialization: entry.specialization,
        reputation: entry.reputation,
        source: entry.source,
        recovery: entry.recovery,
        unavailable: entry.unavailable,
        localUnavailable: entry.unavailable ? undefined : damagedLocal?.unavailable,
      });
    }
    slots.sort((a, b) => b.savedAt - a.savedAt);

    const [saveRecoveryCopies, saveSyncStatus] = await Promise.all([
      provider.listRecoveryCopies(),
      provider.getSyncStatus(),
    ]);
    set({ saveSlots: slots, saveRecoveryCopies, saveSyncStatus });
  },

  restoreSaveRecoveryCopy: async (archiveId) => {
    set({ isLoadingSave: true });
    try {
      const provider = await getActiveSaveProvider();
      const restored = await provider.restoreRecoveryCopy(archiveId);
      get().loadGame(loadResultGameState(restored));
      await get().refreshSaveSlots();
    } finally {
      set({ isLoadingSave: false });
    }
  },

  refreshSaveSyncStatus: async () => {
    const provider = await getActiveSaveProvider();
    const saveSyncStatus = await provider.getSyncStatus();
    set({ saveSyncStatus });
  },

  retryPendingSaveSync: async () => {
    const provider = await getActiveSaveProvider();
    const saveSyncStatus = await provider.retryPendingSync();
    set({ saveSyncStatus });
  },

  dismissSaveConflict: () => {
    set({ saveConflict: null });
  },

  resolveSaveConflict: async (slot, preferredSource) => {
    set({ isResolvingSaveConflict: true });
    try {
      const provider = await getActiveSaveProvider();
      const slotName = slotNumberToSaveName(slot);
      const resolved = await provider.resolveConflict(slotName, preferredSource);

      get().loadGame(loadResultGameState(resolved));
      set({ saveConflict: null });
      await get().refreshSaveSlots();
    } finally {
      set({ isResolvingSaveConflict: false });
    }
  },

  // Weekly cycle actions (extracted to actions/weeklyActions.ts)
  ...createWeeklyActions(get, set),
  ...createWeeklyAsyncActions(get, set),
  // Observation session & insight actions (extracted to actions/observationActions.ts)
  ...createObservationActions(get, set),

  // Report actions (extracted to actions/reportActions.ts)
  ...createReportActions(get, set),

  // Progression actions (extracted to actions/progressionActions.ts)
  ...createProgressionActions(get, set),

  // Finance actions (extracted to actions/financeActions.ts)
  ...createFinanceActions(get, set),

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

  getPlayer: (id) => {
    const { gameState } = get();
    return gameState ? resolvePlayerEntity(gameState, id)?.player : undefined;
  },
  getClub: (id) => get().gameState?.clubs[id],
  getLeague: (id) => get().gameState?.leagues[id],
  getFixture: (id) => get().gameState?.fixtures[id],

  getUpcomingFixtures: (week, count) => {
    const { gameState } = get();
    if (!gameState) return [];
    return Object.values(gameState.fixtures)
      .filter(
        (f) =>
          isFixtureInSeason(f, gameState.currentSeason) &&
          f.week >= week &&
          !f.played,
      )
      .sort((a, b) => a.week - b.week)
      .slice(0, count);
  },

  getPlayerObservations: (playerId) => {
    const { gameState } = get();
    if (!gameState) return [];
    const relatedIds = new Set(getResolvedPlayerIds(gameState, playerId));
    return Object.values(gameState.observations).filter(
      (o) => relatedIds.has(o.playerId)
    );
  },

  getPlayerReports: (playerId) => {
    const { gameState } = get();
    if (!gameState) return [];
    const relatedIds = new Set(getResolvedPlayerIds(gameState, playerId));
    return Object.values(gameState.reports).filter(
      (r) => relatedIds.has(r.playerId)
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

    const standings: Record<string, Omit<ClubStanding, "zone">> = {};
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
      if (!isFixtureInSeason(fixture, gameState.currentSeason)) continue;
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

    const sorted = Object.values(standings).sort(
      (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
    );

    // Determine if paired tiers exist in the same country for zone classification
    const hasLowerTier = Object.values(gameState.leagues).some(
      (l) => l.country === league.country && l.tier === league.tier + 1,
    );
    const hasUpperTier = Object.values(gameState.leagues).some(
      (l) => l.country === league.country && l.tier === league.tier - 1,
    );
    const hasCompetitionResults = sorted.some((entry) => entry.played > 0);

    // Classify each row's relegation/promotion zone
    return sorted.map((entry, index) => ({
      ...entry,
      zone: hasCompetitionResults
        ? classifyStandingZone(
            index,
            sorted.length,
            league.tier,
            hasLowerTier,
            hasUpperTier,
          )
        : "normal",
    }));
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
        (f) =>
          isFixtureInSeason(f, gameState.currentSeason) &&
          f.week === gameState.currentWeek &&
          !f.played,
      ),
      Object.values(gameState.contacts),
      gameState.subRegions,
      gameState.observations,
      gameState.unsignedYouth,
      gameState.players,
      {
        activeLoans: gameState.activeLoans,
        loanRecommendations: gameState.loanRecommendations,
        transferWindow: gameState.transferWindow,
      },
      gameState.youthTournaments,
      gameState.reports,
    );
  },

  submitToLeaderboard: async () => {
    const { gameState } = get();
    if (!gameState) return null;
    const entry = createLeaderboardEntry(
      gameState.scout,
      gameState,
      gameState.currentSeason,
    );
    await submitLeaderboardEntry(entry);
    return entry;
  },

  // ==========================================================================
  // New Game+ / Legacy Mode (F19)
  // ==========================================================================

  retireLegacyCareer: () => {
    const { gameState } = get();
    if (!gameState) return null;

    const retiredState = markCareerVoluntarilyRetired(gameState);
    if (!retiredState) return null;

    const existingProfile = readLegacyProfile();
    const updatedProfile = generateLegacyProfileEngine(
      retiredState,
      existingProfile,
    );
    writeLegacyProfile(updatedProfile);
    set({ gameState: retiredState, weekSimulation: null });
    return updatedProfile;
  },

  completeLegacyCareer: () => {
    const { gameState } = get();
    if (!gameState) return null;

    if (!hasRepresentedCareerCompletionState(gameState)) {
      return readLegacyProfile() ?? null;
    }

    // Read existing profile from localStorage (may be undefined for first career)
    const existingProfile = readLegacyProfile();

    // Generate updated legacy profile
    const updatedProfile = generateLegacyProfileEngine(gameState, existingProfile);

    // Persist only when this completion adds something new.
    if (!existingProfile || updatedProfile !== existingProfile) {
      writeLegacyProfile(updatedProfile);
    }

    return updatedProfile;
  },

  startNewGamePlus: async (config, selectedPerkIds) => {
    if (newGameStartInFlight) return;
    // Read legacy profile from localStorage
    const profile = readLegacyProfile();
    if (!profile) {
      // Fallback: start a regular new game if no profile exists
      await get().startNewGame(config);
      return;
    }

    // Apply legacy perks to config
    const perkResult = applyLegacyPerksEngine(config, profile, selectedPerkIds);
    const modifiedConfig = perkResult.config;

    // Start the game with the modified config (uses the existing startNewGame flow)
    await get().startNewGame(modifiedConfig);

    // Now apply post-generation bonuses that can't be expressed in NewGameConfig
    const { gameState } = get();
    if (!gameState) return;

    let updatedState = { ...gameState };
    let updatedScout = { ...updatedState.scout };

    // Apply reputation bonus
    if (perkResult.reputationBonus > 0) {
      updatedScout.reputation = Math.min(
        100,
        updatedScout.reputation + perkResult.reputationBonus,
      );
    }

    // Apply fatigue reduction
    if (perkResult.fatigueReduction > 0) {
      updatedScout.fatigue = Math.max(
        0,
        updatedScout.fatigue - perkResult.fatigueReduction,
      );
    }

    // Apply skill bonuses (clamped to 1-20 range)
    for (const [skill, bonus] of Object.entries(perkResult.skillBonuses)) {
      const key = skill as keyof typeof updatedScout.skills;
      if (key in updatedScout.skills) {
        updatedScout.skills = {
          ...updatedScout.skills,
          [key]: Math.min(20, updatedScout.skills[key] + bonus),
        };
      }
    }

    updatedState = { ...updatedState, scout: updatedScout };

    // Apply budget bonus
    if (perkResult.budgetBonusPercent > 0 && updatedState.finances) {
      const bonusAmount = Math.round(
        updatedState.finances.balance * (perkResult.budgetBonusPercent / 100),
      );
      updatedState = {
        ...updatedState,
        finances: applyBalanceTransaction(
          updatedState.finances,
          bonusAmount,
          updatedState.currentWeek,
          updatedState.currentSeason,
          "Legacy career starting budget bonus",
        ),
      };
    }

    // Apply regional knowledge retention
    if (perkResult.knowledgeRetainPercent > 0 && profile.completedCareers.length > 0) {
      // Boost all regional knowledge familiarity by the retain percentage
      const retainFactor = perkResult.knowledgeRetainPercent / 100;
      const updatedKnowledge = { ...updatedState.regionalKnowledge };
      for (const [key, knowledge] of Object.entries(updatedKnowledge)) {
        updatedKnowledge[key] = {
          ...knowledge,
          knowledgeLevel: Math.min(
            100,
            knowledge.knowledgeLevel + Math.round(25 * retainFactor),
          ),
        };
      }
      updatedState = { ...updatedState, regionalKnowledge: updatedKnowledge };
    }

    // Apply extra contacts via generateContactForType
    if (perkResult.extraContacts > 0) {
      const contactRng = createRNG(`${config.worldSeed}-legacy-contacts`);
      const contactTypes: Array<"agent" | "clubStaff" | "journalist" | "scout"> = [
        "agent", "clubStaff", "journalist", "scout",
      ];
      const contactMap = { ...updatedState.contacts };
      for (let i = 0; i < perkResult.extraContacts; i++) {
        const cType = contactTypes[i % contactTypes.length];
        const newContact = generateContactForType(
          contactRng,
          cType,
          "Legacy Network",
          undefined,
        );
        contactMap[newContact.id] = newContact;
      }
      updatedState = { ...updatedState, contacts: contactMap };
    }

    // Add a welcome message noting New Game+ mode
    const ngPlusMessage = {
      id: "ng-plus-welcome",
      week: updatedState.currentWeek,
      season: updatedState.currentSeason,
      type: "event" as const,
      title: "New Game+ Active",
      body: [
        "Your legacy carries forward into this new career.",
        "",
        `Career #${profile.completedCareers.length + 1} begins with the wisdom of your past.`,
        selectedPerkIds.length > 0
          ? `Active perks: ${selectedPerkIds.length} legacy bonus${selectedPerkIds.length > 1 ? "es" : ""} applied.`
          : "No legacy perks selected — starting fresh with your earned knowledge.",
        "",
        "Prove yourself once more. The scouting world awaits.",
      ].join("\n"),
      read: false,
      actionRequired: false,
    };

    updatedState = {
      ...updatedState,
      inbox: [ngPlusMessage, ...updatedState.inbox],
    };

    set({ gameState: updatedState });
  },

}));

// The production E2E artifact opts into this bridge at compile time. Normal
// production builds do not contain a reachable state-injection hook.
if (
  typeof window !== "undefined" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_E2E_BRIDGE === "true")
) {
  (window as any).__GAME_STORE__ = useGameStore;
}
