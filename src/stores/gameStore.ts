import { create } from "zustand";
import { captureException } from "@/lib/sentry";
import { createNavigationActions } from "./actions/navigationActions";
import { createObservationActions } from "./actions/observationActions";
import { createReportActions } from "./actions/reportActions";
import { createProgressionActions } from "./actions/progressionActions";
import { createFinanceActions } from "./actions/financeActions";
import { createWeeklyActions } from "./actions/weeklyActions";
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
import { generateSeasonTournaments } from "@/engine/youth";
import { createLeaderboardEntry, submitLeaderboardEntry } from "@/lib/leaderboard";
import { generateBoardProfile } from "@/engine/firstTeam/boardAI";
import { deriveTacticalStyleFromPhilosophy } from "@/engine/firstTeam/tacticalStyle";
import { createRNG } from "@/engine/rng";
import { generateSeasonEvents, getActiveSeasonEvents } from "@/engine/core/seasonEvents";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
} from "@/engine/core/transferWindow";
import { initializeWorld } from "@/engine/world";
import { createScout } from "@/engine/scout/creation";
import { generateStartingContacts, generateContactForType } from "@/engine/network/contacts";
import { createWeekSchedule, getAvailableActivities } from "@/engine/core/calendar";
import { initializeRegionalKnowledge } from "@/engine/specializations/regionalKnowledge";
import { generateManagerProfiles } from "@/engine/analytics";
import { generateRegionalYouth } from "@/engine/youth/generation";
import {
  initializeFinances,
  migrateFinancialRecord,
  migrateEmployeeSkillsInRecord,
  migrateReportListingBids,
  migrateEquipmentLevel,
} from "@/engine/finance";
import type { EquipmentItemId } from "@/engine/finance";
import type { EmployeeAssignment, ClientRelationship } from "@/engine/core/types";
import {
  generateRivalScouts,
} from "@/engine/rivals";
import { getCountryDataSync, getSecondaryCountries } from "@/data/index";
import {
  saveGame as dbSaveGame,
  loadGame as dbLoadGame,
  listSaves as dbListSaves,
  deleteSave as dbDeleteSave,
  type SaveRecord,
  AUTOSAVE_SLOT,
  MAX_MANUAL_SLOTS,
} from "@/lib/db";
import { useTutorialStore } from "@/stores/tutorialStore";
import {
  applyScenarioSetup,
  applyScenarioOverrides,
} from "@/engine/scenarios";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import type { ScenarioProgress } from "@/engine/scenarios";
import {
  generateLegacyProfile as generateLegacyProfileEngine,
  applyLegacyPerks as applyLegacyPerksEngine,
  readLegacyProfile,
  writeLegacyProfile,
} from "@/engine/career/legacy";

export type GameScreen =
  | "mainMenu"
  | "newGame"
  | "dashboard"
  | "calendar"
  | "match"
  | "observation"
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
  | "performance"
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
  | "rivals"
  | "reportComparison"
  | "negotiation"
  | "seasonAwards"
  | "freeAgents";

export interface GameStoreState {
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
    /** Behavioral traits discovered during the match */
    traitDiscoveries?: Array<{ playerName: string; trait: string }>;
    /** Per-player match ratings (1-10 scale) */
    playerRatings?: Record<string, PlayerMatchRating>;
    /** Card events that occurred during the match. */
    cardEvents?: CardEvent[];
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
  requestWeekAdvance: () => void;
  advanceWeek: () => void;

  // Quick Scout Mode (F17)
  autoSchedule: (priorities?: QuickScoutPriorities) => void;
  batchAdvance: (weeks: number, priorities?: QuickScoutPriorities) => void;
  delegateScouting: (npcScoutId: string, playerId: string) => void;
  batchSummary: BatchAdvanceResult | null;
  dismissBatchSummary: () => void;

  // Season event actions
  resolveSeasonEvent: (eventId: string, choiceIndex: number) => void;

  // Day-by-day simulation
  weekSimulation: WeekSimulationState | null;
  startWeekSimulation: () => void;
  chooseSimulationInteraction: (optionId: string, focusedPlayerIds?: string[]) => void;
  advanceDay: () => void;
  fastForwardWeek: () => void;

  // Match actions
  scheduleMatch: (fixtureId: string) => boolean;
  startMatch: (fixtureId: string) => void;
  advancePhase: () => void;
  setFocus: (playerId: string, lens: FocusSelection["lens"]) => void;
  endMatch: () => void;

  // Observation session actions
  activeSession: ObservationSession | null;
  sessionReturnScreen: GameScreen | null;
  lastReflectionResult: any | null;
  startObservationSession: (
    activityType: string,
    playerPool: Array<{ playerId: string; name: string; position: string }>,
    targetPlayerId?: string,
    options?: {
      activityInstanceId?: string;
      returnScreen?: GameScreen;
    },
  ) => void;
  beginSession: () => void;
  advanceSessionPhase: () => void;
  allocateSessionFocus: (playerId: string, lens: LensType) => void;
  removeSessionFocus: (playerId: string) => void;
  flagSessionMoment: (momentId: string, reaction: SessionFlaggedMoment['reaction']) => void;
  addSessionNote: (note: string) => void;
  addSessionHypothesis: (playerId: string, text: string, domain: string) => void;
  endObservationSession: () => void;

  // Insight actions
  useInsight: (actionId: InsightActionId) => void;
  lastInsightResult: InsightActionResult | null;
  dismissInsightResult: () => void;

  // Report actions
  startReport: (playerId: string) => void;
  submitReport: (conviction: ConvictionLevel, summary: string, strengths: string[], weaknesses: string[]) => void;

  // Career actions
  acceptJob: (offerId: string) => void;
  declineJob: (offerId: string) => void;

  // Inbox
  markMessageRead: (messageId: string) => void;
  markAllRead: () => void;

  // Gossip actions (A3)
  handleGossipAction: (gossipId: string, action: GossipAction) => void;
  getActiveGossip: () => ActionableGossipItem[];

  // Entity selection
  selectPlayer: (playerId: string | null) => void;
  selectFixture: (fixtureId: string | null) => void;

  // NPC Scout Management
  assignNPCScoutTerritory: (npcScoutId: string, territoryId: string) => void;
  reviewNPCReport: (reportId: string) => void;

  // Career Management
  meetManager: () => void;
  presentToBoard: () => void;
  meetBoard: () => void;
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
  acceptMarketplaceBid: (bidId: string) => void;
  declineMarketplaceBid: (bidId: string) => void;
  acceptRetainerContract: (contract: RetainerContract) => void;
  cancelRetainerContract: (contractId: string) => void;
  enrollInCourse: (courseId: string) => void;
  upgradeAgencyOffice: (tier: OfficeTier) => void;
  hireAgencyEmployee: (role: AgencyEmployeeRole) => void;
  fireAgencyEmployee: (employeeId: string) => void;

  // Phase 2: Employee assignment
  assignAgencyEmployee: (employeeId: string, assignment: EmployeeAssignment) => void;

  // Phase 3: Business development
  pitchToClient: (clubId: string, pitchType: "coldCall" | "referral" | "showcase") => void;

  // Phase 4: Employee event resolution
  resolveAgencyEmployeeEvent: (eventId: string, optionIndex: number) => void;
  adjustEmployeeSalary: (employeeId: string, newSalary: number) => void;

  // Phase 5: International expansion
  openAgencySatelliteOffice: (region: string) => void;
  closeAgencySatelliteOffice: (officeId: string) => void;
  assignEmployeeToAgencySatellite: (employeeId: string, officeId: string) => void;

  // Phase 5: Employee skills training (implementation provided by backend)
  trainAgencyEmployee: (employeeId: string, skillIndex: 1 | 2 | 3) => void;

  takeLoanAction: (type: LoanType, amount: number) => void;
  repayLoanAction: () => void;
  sellEquipmentForCashAction: (itemValue: number) => void;
  acceptConsultingContract: (contract: ConsultingContract) => void;
  declineRetainerOffer: (contractId: string) => void;
  declineConsultingOffer: (contractId: string) => void;
  completeConsultingContract: (contractId: string) => void;

  // F14: Financial Strategy Layer — infrastructure investments
  purchaseDataSubscriptionAction: (tier: DataSubscriptionTier) => void;
  upgradeTravelBudgetAction: (tier: TravelBudgetTier) => void;
  upgradeOfficeEquipmentAction: (tier: OfficeEquipmentTier) => void;

  // F14: Financial Strategy Layer — assistant scouts
  hireAssistantScoutAction: () => void;
  fireAssistantScoutAction: (scoutId: string) => void;
  assignAssistantScoutAction: (scoutId: string, task: { playerId?: string; region?: string }) => void;
  unassignAssistantScoutAction: (scoutId: string) => void;

  // Transfer Negotiation actions (F4)
  activeNegotiationId: string | null;
  initiateTransferNegotiation: (playerId: string) => void;
  submitTransferOffer: (negotiationId: string, amount: number, addOns?: import("@/engine/core/types").TransferAddOn[]) => void;
  acceptNegotiation: (negotiationId: string) => void;
  walkAway: (negotiationId: string) => void;

  // Free Agent actions
  initiateFreeAgentNegotiation: (playerId: string, wage: number, bonus: number, contractLength: number) => void;
  submitFreeAgentOffer: (playerId: string, wage: number, bonus: number, contractLength: number) => void;

  // Player Loan actions
  recommendPlayerForLoan: (playerId: string, targetClubId: string, rationale: "development" | "playing-time" | "experience" | "squad-depth", duration: number) => void;
  submitLoanMonitoringReport: (loanDealId: string) => void;
  recallLoanPlayer: (loanDealId: string) => void;

  // Cross-screen fixture filter (set from PlayerProfile → consumed by FixtureBrowser)
  pendingFixtureClubFilter: string | null;
  setPendingFixtureClubFilter: (filter: string | null) => void;

  // Cross-screen calendar pre-fill (set from PlayerProfile → consumed by CalendarScreen)
  pendingCalendarActivity: { type: string; targetId: string; label: string } | null;
  setPendingCalendarActivity: (pending: { type: string; targetId: string; label: string } | null) => void;

  // Tap network for hidden attribute intel on a player
  tapNetworkForPlayer: (playerId: string) => { title: string; body: string; contactName?: string } | null;

  // Watchlist
  toggleWatchlist: (playerId: string) => void;

  // Report comparison (F11)
  comparisonReportIds: string[];
  addToComparison: (reportId: string) => void;
  removeFromComparison: (reportId: string) => void;
  clearComparison: () => void;

  // Leaderboard
  submitToLeaderboard: () => Promise<LeaderboardEntry | null>;

  // New Game+ / Legacy Mode (F19)
  completeLegacyCareer: () => LegacyProfile | null;
  startNewGamePlus: (config: NewGameConfig, selectedPerkIds: string[]) => Promise<void>;

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
  /** Relegation/promotion zone classification for UI coloring. */
  zone: "promotion" | "relegation" | "normal";
}


// ---------------------------------------------------------------------------
// Migration: Player roles, traits & tactical depth expansion
// ---------------------------------------------------------------------------
function migratePlayerRolesAndTraits(state: GameState): void {
  const clampAttr = (v: number) => Math.round(Math.max(1, Math.min(20, v)));

  // Migrate players: derive new attributes from existing ones
  for (const player of Object.values(state.players)) {
    const a = player.attributes;
    // Only migrate if new attributes are missing
    if (a.tackling === undefined) {
      a.tackling = clampAttr(a.defensiveAwareness * 0.6 + a.strength * 0.4);
      a.finishing = clampAttr(a.shooting * 0.7 + a.composure * 0.3);
      a.jumping = clampAttr(a.heading * 0.5 + a.strength * 0.3 + a.agility * 0.2);
      a.balance = clampAttr(a.agility * 0.6 + a.strength * 0.4);
      a.anticipation = clampAttr(a.positioning * 0.5 + a.decisionMaking * 0.5);
      a.vision = clampAttr(a.passing * 0.5 + a.decisionMaking * 0.5);
      a.marking = clampAttr(a.defensiveAwareness * 0.7 + a.positioning * 0.3);
      a.teamwork = clampAttr(a.workRate * 0.6 + a.decisionMaking * 0.4);
    }
    // Default empty trait arrays
    if (!player.playerTraits) player.playerTraits = [];
    if (!player.playerTraitsRevealed) player.playerTraitsRevealed = [];
  }

  // Migrate unsigned youth (same attribute derivation)
  if (state.unsignedYouth) {
    for (const youth of Object.values(state.unsignedYouth)) {
      const a = (youth as unknown as Player).attributes;
      if (a && a.tackling === undefined) {
        a.tackling = clampAttr(a.defensiveAwareness * 0.6 + a.strength * 0.4);
        a.finishing = clampAttr(a.shooting * 0.7 + a.composure * 0.3);
        a.jumping = clampAttr(a.heading * 0.5 + a.strength * 0.3 + a.agility * 0.2);
        a.balance = clampAttr(a.agility * 0.6 + a.strength * 0.4);
        a.anticipation = clampAttr(a.positioning * 0.5 + a.decisionMaking * 0.5);
        a.vision = clampAttr(a.passing * 0.5 + a.decisionMaking * 0.5);
        a.marking = clampAttr(a.defensiveAwareness * 0.7 + a.positioning * 0.3);
        a.teamwork = clampAttr(a.workRate * 0.6 + a.decisionMaking * 0.4);
      }
    }
  }

  // Migrate clubs: generate tactical style from philosophy + reputation
  for (const club of Object.values(state.clubs)) {
    if (!club.tacticalStyle) {
      club.tacticalStyle = deriveTacticalStyleFromPhilosophy(
        club.scoutingPhilosophy,
        club.reputation,
      );
    }
  }

  // Clear system fit cache (will recompute with new formula)
  state.systemFitCache = {};
}

/**
 * Migration: Add match rating system fields to existing saves.
 * Players get empty recentMatchRatings and seasonRatings arrays.
 * GameState gets empty matchRatings record.
 */
function migrateMatchRatings(state: GameState): void {
  // eslint-disable-next-line
  if ((state as any).matchRatings === undefined) {
    (state as any).matchRatings = {};
  }
  for (const player of Object.values(state.players)) {
    if (!player.recentMatchRatings) {
      (player as Player).recentMatchRatings = [];
    }
    if (!player.seasonRatings) {
      (player as Player).seasonRatings = [];
    }
  }
  // Also migrate unsigned youth players
  if (state.unsignedYouth) {
    for (const youth of Object.values(state.unsignedYouth)) {
      const p = youth.player;
      if (p && !p.recentMatchRatings) {
        p.recentMatchRatings = [];
      }
      if (p && !p.seasonRatings) {
        p.seasonRatings = [];
      }
    }
  }
}

/**
 * Migration: Add injury system fields to existing saves.
 * Players get default injuryHistory and currentInjury derived from existing injury state.
 */
function migrateInjurySystem(state: GameState): void {
  for (const player of Object.values(state.players)) {
    // Default new fields if missing
    player.injuryHistory ??= {
      playerId: player.id,
      injuries: [],
      totalWeeksMissed: 0,
      injuryProneness: 0,
      reinjuryWindowWeeksLeft: 0,
    };
    // If player is currently injured but has no currentInjury object, synthesize one
    if (player.injured && !player.currentInjury) {
      player.currentInjury = {
        id: `inj_migrated_${player.id}`,
        playerId: player.id,
        type: "knock",
        severity: player.injuryWeeksRemaining <= 2 ? "minor" : player.injuryWeeksRemaining <= 5 ? "moderate" : "serious",
        recoveryWeeks: player.injuryWeeksRemaining,
        weeksRemaining: player.injuryWeeksRemaining,
        reinjuryRisk: 0,
        occurredWeek: state.currentWeek,
        occurredSeason: state.currentSeason,
      };
    }
  }
  // Also migrate unsigned youth players
  if (state.unsignedYouth) {
    for (const youth of Object.values(state.unsignedYouth)) {
      const p = youth.player;
      if (p) {
        p.injuryHistory ??= {
          playerId: p.id,
          injuries: [],
          totalWeeksMissed: 0,
          injuryProneness: 0,
          reinjuryWindowWeeksLeft: 0,
        };
      }
    }
  }
}

/**
 * Migration: Add effects, choices, and resolved fields to existing season events.
 * Older saves have bare-bones SeasonEvent objects without mechanical effects.
 * We regenerate from the template to pick up the new fields.
 */
function migrateSeasonEvents(state: GameState): void {
  if (!state.seasonEvents || state.seasonEvents.length === 0) return;

  // Check if already migrated — presence of 'resolved' on first event indicates new format
  const first = state.seasonEvents[0];
  if (first.resolved !== undefined) return;

  // Regenerate events from templates to pick up effects/choices
  const freshEvents = generateSeasonEvents(state.currentSeason);

  // Merge: keep existing event IDs but apply new fields
  state.seasonEvents = state.seasonEvents.map((existing) => {
    const template = freshEvents.find((f) => f.id === existing.id);
    if (template) {
      return {
        ...existing,
        effects: template.effects,
        choices: template.choices,
        resolved: false,
      };
    }
    // No matching template — add defaults
    return {
      ...existing,
      resolved: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Migration: Personality profiles (F9)
// ---------------------------------------------------------------------------
function migratePersonalityProfiles(state: GameState): void {
  const migratePlayer = (player: Player) => {
    if (!player.personalityProfile) {
      const traits = player.personalityTraits ?? [];
      const traitSet = new Set(traits);

      type PA = import("@/engine/core/types").PersonalityArchetype;
      let archetype: PA = "professional";
      if (traitSet.has("leader")) archetype = "leader";
      else if (traitSet.has("bigGamePlayer") || traitSet.has("pressurePlayer")) archetype = "clutch";
      else if (traitSet.has("ambitious")) archetype = "ambitious";
      else if (traitSet.has("loyal") || traitSet.has("modelCitizen")) archetype = "loyal";
      else if (traitSet.has("temperamental") && traitSet.has("controversialCharacter")) archetype = "disruptive";
      else if (traitSet.has("temperamental")) archetype = "hothead";
      else if (traitSet.has("introvert")) archetype = "introvert";
      else if (traitSet.has("easygoing")) archetype = "professional";
      else if (traitSet.has("flair")) archetype = "ambitious";

      const DEFAULTS: Record<PA, { tw: number; dri: number; fv: number; bmm: number }> = {
        leader:       { tw: 0.3,  dri: 3,  fv: 0.3,  bmm: 1 },
        mercenary:    { tw: 0.9,  dri: -1, fv: 0.5,  bmm: 0 },
        homesick:     { tw: 0.2,  dri: 0,  fv: 0.6,  bmm: -1 },
        ambitious:    { tw: 0.7,  dri: 1,  fv: 0.4,  bmm: 1 },
        loyal:        { tw: 0.15, dri: 2,  fv: 0.25, bmm: 0 },
        disruptive:   { tw: 0.6,  dri: -2, fv: 0.7,  bmm: 0 },
        introvert:    { tw: 0.35, dri: 0,  fv: 0.35, bmm: -1 },
        professional: { tw: 0.5,  dri: 1,  fv: 0.2,  bmm: 0 },
        hothead:      { tw: 0.55, dri: -1, fv: 0.8,  bmm: -1 },
        clutch:       { tw: 0.4,  dri: 2,  fv: 0.35, bmm: 2 },
      };
      const d = DEFAULTS[archetype];

      player.personalityProfile = {
        archetype,
        traits: [...traits],
        transferWillingness: d.tw,
        dressingRoomImpact: d.dri,
        formVolatility: d.fv,
        bigMatchModifier: d.bmm,
        hiddenUntilRevealed: true,
        revealedTraits: [...(player.personalityRevealed ?? [])],
      };
    }
  };

  for (const player of Object.values(state.players)) {
    migratePlayer(player);
  }
  if (state.unsignedYouth) {
    for (const youth of Object.values(state.unsignedYouth)) {
      if (youth.player) {
        migratePlayer(youth.player);
      }
    }
  }
}

/**
 * Migration: F14 Financial Strategy Layer.
 * Ensures scoutingInfrastructure and assistantScouts exist on older saves.
 */
function migrateFinancialStrategy(state: GameState): void {
  const s = state as Record<string, any>; // eslint-disable-line
  if (s.scoutingInfrastructure === undefined) {
    s.scoutingInfrastructure = {
      dataSubscription: "none",
      travelBudget: "economy",
      officeEquipment: "basic",
      investmentCosts: { weekly: 0, oneTime: 0 },
    };
  }
  if (s.assistantScouts === undefined) {
    s.assistantScouts = [];
  }
}

/**
 * Migration: Add regional knowledge system (F13) to existing saves.
 * Initializes empty regional knowledge records for all countries.
 */
function migrateRegionalKnowledge(state: GameState): void {
  // eslint-disable-next-line
  const s = state as unknown as Record<string, unknown>;
  if (s.regionalKnowledge === undefined || s.regionalKnowledge === null) {
    const countries = state.countries ?? [];
    const startingCountry = countries[0] ?? "england";
    s.regionalKnowledge = initializeRegionalKnowledge(countries, startingCountry);
  }
}

/**
 * Migration: F12 Youth Pipeline Tracking.
 * Ensures alumni records have careerUpdates, currentStatus, seasonStats,
 * becameContact fields for existing saves.
 */
/**
 * Migration: F8 Rival Scouts Enhancement.
 * Adds new fields to existing rival scouts (scoutingProgress, aggressiveness, budgetTier)
 * and initialises rivalActivities on GameState.
 */
function migrateRivalScouts(state: GameState): void {
  // eslint-disable-next-line
  const s = state as any;
  s.rivalActivities ??= [];
  if (s.rivalScouts) {
    for (const rival of Object.values(s.rivalScouts) as any[]) {
      rival.scoutingProgress ??= {};
      if (rival.aggressiveness === undefined) {
        const bases: Record<string, number> = {
          aggressive: 0.8,
          methodical: 0.3,
          connected: 0.5,
          lucky: 0.6,
        };
        rival.aggressiveness = bases[rival.personality as string] ?? 0.5;
      }
      rival.budgetTier ??= "medium";
    }
  }
}

/**
 * Migration: F3 Contact Network Depth
 * Adds new F3 fields to existing contacts with sensible defaults.
 */
function migrateContactNetworkDepth(state: GameState): void {
  if (!state.contacts) return;
  for (const contact of Object.values(state.contacts)) {
    // eslint-disable-next-line
    const c = contact as any;
    c.trustLevel ??= c.relationship ?? 30;
    c.loyalty ??= 50;
    c.interactionHistory ??= [];
    c.gossipQueue ??= [];
    c.referralNetwork ??= [];
    c.betrayalRisk ??= 0;
    // exclusiveWindow is intentionally left undefined (optional field)
  }
}

function migrateAlumniPipeline(state: GameState): void {
  if (!state.alumniRecords) return;
  for (const record of state.alumniRecords) {
    // eslint-disable-next-line
    const r = record as any;
    r.careerUpdates ??= [];
    r.currentStatus ??= "academy";
    r.seasonStats ??= [];
    r.becameContact ??= false;
  }
}

// Module-level flag to prevent autosave race condition (Fix #24)
let _autosavePending = false;

// Type alias for backward compatibility with external references
type GameStore = GameStoreState;

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
  lastMatchResult: null,
  selectedPlayerId: null,
  selectedFixtureId: null,
  saveSlots: [],
  isSaving: false,
  isLoadingSave: false,
  autosaveError: null,

  // Scenario transient state
  selectedScenarioId: null,
  scenarioProgress: null,
  scenarioOutcome: null,

  // Celebration transient state
  pendingCelebration: null,

  // Transfer Negotiation (F4)
  activeNegotiationId: null,

  // Cross-screen fixture filter
  pendingFixtureClubFilter: null,

  // Cross-screen calendar pre-fill
  pendingCalendarActivity: null,

  // Report comparison (F11) — transient UI state
  comparisonReportIds: [],

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
      difficulty: effectiveConfig.difficulty,
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
      countries: [...new Set([...selectedCountries, ...getSecondaryCountries(), "england", "spain", "germany", "france", "brazil", "argentina"])],
      narrativeEvents: [],
      activeStorylines: [],
      eventChains: [],
      rivalScouts: {},
      rivalActivities: [],
      unlockedTools: [],
      managerProfiles: {},
      seasonEvents: initialSeasonEvents,
      transferWindow: initialTransferWindow,
      discoveryRecords: [],
      performanceHistory: [],
      transferRecords: [],
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
      youthTournaments: {},
      retiredPlayerIds: [],
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
      regionalKnowledge: initializeRegionalKnowledge(
        [...new Set([...selectedCountries, ...getSecondaryCountries(), "england", "spain", "germany", "france", "brazil", "argentina"])],
        effectiveConfig.startingCountry ?? effectiveConfig.region ?? selectedCountries[0] ?? "england",
      ),
      // Dynamic Board Expectations (F10)
      boardReactions: [],
      // Gossip actions (A3)
      gossipItems: [],
      // Board satisfaction tracking (A4)
      satisfactionHistory: [],
      // Interactive observation sessions
      completedInteractiveSessions: [],
      // Free Agent System
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: 1,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      freeAgentNegotiations: [],
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

    // Generate initial youth tournaments for season 1
    const tournamentRng = createRNG(`${effectiveConfig.worldSeed}-tournaments-s1`);
    const initialTournaments = generateSeasonTournaments(tournamentRng, 1, tempState.countries, scout);

    const gameState: GameState = {
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
            "Every report you submit affects your reputation. Accurate reports on players who go on to succeed will build your standing. As your reputation grows, clubs will offer you contracts with better salaries and wider territories. Your long-term goal is to rise from the starting tier all the way to Head of Scouting.",
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
      ],
      // Phase 2 populated values
      finances,
      rivalScouts,
      rivalActivities: [],
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

    // Start guided first-week session (replaces old onboarding sequences)
    useTutorialStore.getState().startGuidedSession(!!effectiveConfig.startingClubId);
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
    // Migration: employee skills system
    if (migrated.finances && migrated.finances.employees.some((e) => !e.skills)) {
      const rng = createRNG(`${migrated.seed}-skill-migrate`);
      migrated.finances = migrateEmployeeSkillsInRecord(migrated.finances, rng);
    }
    // Migration: report listing bids
    if (migrated.finances) {
      migrated.finances = migrateReportListingBids(migrated.finances);
    }
    // Migration: Player roles, traits & tactical depth expansion
    migratePlayerRolesAndTraits(migrated);
    // Migration: Match rating system
    migrateMatchRatings(migrated);
    // Migration: Season event effects (F1)
    migrateSeasonEvents(migrated);
    // Migration: Injury system (F7)
    migrateInjurySystem(migrated);
    // Migration: Personality profiles (F9)
    migratePersonalityProfiles(migrated);
    // Migration: F14 Financial Strategy Layer
    migrateFinancialStrategy(migrated);
    // Migration: F13 Regional Scouting Depth
    migrateRegionalKnowledge(migrated);
    // Migration: discipline/card system
    // eslint-disable-next-line
    if ((migrated as any).disciplinaryRecords === undefined) {
      (migrated as any).disciplinaryRecords = {};
    }
    // Migration: F12 Youth Pipeline Tracking
    migrateAlumniPipeline(migrated);
    // Migration: F4 Transfer Negotiation System
    // eslint-disable-next-line
    (migrated as any).activeNegotiations ??= [];
    // Migration: F8 Rival Scouts Enhancement
    migrateRivalScouts(migrated);
    // Migration: F2 Event Chains
    // eslint-disable-next-line
    (migrated as any).eventChains ??= [];
    // Migration: F3 Contact Network Depth
    migrateContactNetworkDepth(migrated);
    // Migration: F10 Dynamic Board Expectations
    // eslint-disable-next-line
    (migrated as any).boardReactions ??= [];
    // boardProfile is optional — generated on first tier 5 promotion or board meeting
    // Migration: Deep Systems Overhaul — credit score, distress, accuracy, morale
    if (migrated.finances) {
      if (migrated.finances.creditScore === undefined) migrated.finances.creditScore = 50;
      if (migrated.finances.distressLevel === undefined) migrated.finances.distressLevel = "healthy";
      if (migrated.finances.weeksInDistress === undefined) migrated.finances.weeksInDistress = 0;
      if (migrated.finances.failedContractCount === undefined) migrated.finances.failedContractCount = 0;
      if (migrated.finances.blacklistedClubs === undefined) migrated.finances.blacklistedClubs = [];
      if (migrated.finances.bankruptcyRecoveryCooldown === undefined) migrated.finances.bankruptcyRecoveryCooldown = 0;
    }
    if (!migrated.scout.accuracyHistory) migrated.scout.accuracyHistory = [];
    if (!migrated.scout.performancePulses) migrated.scout.performancePulses = [];
    if (migrated.scout.avatarId === undefined) migrated.scout.avatarId = 1;
    // Migration: Youth Tournament System
    // eslint-disable-next-line
    if (!(migrated as any).youthTournaments) (migrated as any).youthTournaments = {};
    // Migration: Player Loan System
    // eslint-disable-next-line
    (migrated as any).activeLoans ??= [];
    // eslint-disable-next-line
    (migrated as any).loanHistory ??= [];
    // eslint-disable-next-line
    (migrated as any).loanRecommendations ??= [];
    // Ensure clubs have loan tracking arrays
    for (const club of Object.values(migrated.clubs ?? {})) {
      if (!(club as any).loanedOutPlayerIds) (club as any).loanedOutPlayerIds = [];
      if (!(club as any).loanedInPlayerIds) (club as any).loanedInPlayerIds = [];
    }
    set({ gameState: migrated, isLoaded: true, currentScreen: "dashboard" });

    // Resume guided session if it wasn't completed in a previous session
    const tutState = useTutorialStore.getState();
    if (!tutState.dismissed && !tutState.guidedSessionCompleted) {
      const hasIncomplete = Object.values(tutState.guidedMilestones).some(v => !v);
      if (hasIncomplete) {
        useTutorialStore.setState({ guidedSessionActive: true });
      }
    }
  },

  saveGame: () => {
    const { gameState } = get();
    if (!gameState) return null;
    const saved = { ...gameState, lastSaved: Date.now() };
    set({ gameState: saved });
    // Persist to IndexedDB (autosave slot 0) — fire and forget (Fix #4)
    dbSaveGame(AUTOSAVE_SLOT, "autosave", saved).catch((err) => {
      console.warn("saveGame: IndexedDB persist failed:", err);
      captureException(err);
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
        // Migration: employee skills system
        if (state.finances && state.finances.employees.some((e) => !e.skills)) {
          const rng = createRNG(`${state.seed}-skill-migrate`);
          state.finances = migrateEmployeeSkillsInRecord(state.finances, rng);
        }
        // Migration: report listing bids
        if (state.finances) {
          state.finances = migrateReportListingBids(state.finances);
        }
        // Migration: storyline system
        if (!Array.isArray(state.activeStorylines)) {
          state.activeStorylines = [];
        }
        // Migration: Player roles, traits & tactical depth expansion
        migratePlayerRolesAndTraits(state);
        // Migration: Match rating system
        migrateMatchRatings(state);
        // Migration: Season event effects (F1)
        migrateSeasonEvents(state);
        // Migration: Injury system (F7)
        migrateInjurySystem(state);
        // Migration: Personality profiles (F9)
        migratePersonalityProfiles(state);
        // Migration: F14 Financial Strategy Layer
        migrateFinancialStrategy(state);
        // Migration: F13 Regional Scouting Depth
        migrateRegionalKnowledge(state);
        // Migration: discipline/card system
        // eslint-disable-next-line
        if ((state as any).disciplinaryRecords === undefined) {
          (state as any).disciplinaryRecords = {};
        }
        // Migration: F12 Youth Pipeline Tracking
        migrateAlumniPipeline(state);
        // Migration: F4 Transfer Negotiation System
        // eslint-disable-next-line
        (state as any).activeNegotiations ??= [];
        // Migration: F8 Rival Scouts Enhancement
        migrateRivalScouts(state);
        // Migration: F3 Contact Network Depth
        migrateContactNetworkDepth(state);
        // Migration: F10 Dynamic Board Expectations
        // eslint-disable-next-line
        (state as any).boardReactions ??= [];
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

  // Weekly cycle actions (extracted to actions/weeklyActions.ts)
  ...createWeeklyActions(get, set),
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

    // Classify each row's relegation/promotion zone
    return sorted.map((entry, index) => ({
      ...entry,
      zone: classifyStandingZone(
        index,
        sorted.length,
        league.tier,
        hasLowerTier,
        hasUpperTier,
      ),
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
        (f) => f.week === gameState.currentWeek && !f.played,
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

  completeLegacyCareer: () => {
    const { gameState } = get();
    if (!gameState) return null;

    // Read existing profile from localStorage (may be undefined for first career)
    const existingProfile = readLegacyProfile();

    // Generate updated legacy profile
    const updatedProfile = generateLegacyProfileEngine(gameState, existingProfile);

    // Persist to localStorage
    writeLegacyProfile(updatedProfile);

    return updatedProfile;
  },

  startNewGamePlus: async (config, selectedPerkIds) => {
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
        finances: {
          ...updatedState.finances,
          balance: updatedState.finances.balance + bonusAmount,
        },
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

// Expose store for E2E testing (dev only — stripped in production builds)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as any).__GAME_STORE__ = useGameStore;
}
