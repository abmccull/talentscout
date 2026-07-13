import { create } from "zustand";
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
import { migrateLegacyTransferParticipation } from "@/engine/firstTeam/transferTracker";
import { checkToolUnlocks } from "@/engine/tools";
import { classifyStandingZone } from "@/engine/world/index";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import {
  generateSeasonTournaments,
  generateYouthRecruitmentBriefs,
} from "@/engine/youth";
import { createLeaderboardEntry, submitLeaderboardEntry } from "@/lib/leaderboard";
import { generateBoardProfile } from "@/engine/firstTeam/boardAI";
import { deriveTacticalStyleFromPhilosophy } from "@/engine/firstTeam/tacticalStyle";
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
  repairRunManifest,
  validateRunManifest,
} from "@/engine/run";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createEventDirectorState } from "@/engine/events/eventDirector";
import { generateSeasonEvents, getActiveSeasonEvents } from "@/engine/core/seasonEvents";
import { createEmptyPool } from "@/engine/freeAgents/pool";
import {
  initializeTransferWindows,
  isTransferWindowOpen,
  getCurrentTransferWindow,
} from "@/engine/core/transferWindow";
import { initializeWorld } from "@/engine/world";
import { createScout } from "@/engine/scout/creation";
import {
  generateStartingContacts,
  generateContactForType,
  getContactCoverageCountry,
} from "@/engine/network/contacts";
import { createWeekSchedule, getAvailableActivities } from "@/engine/core/calendar";
import {
  initializeRegionalKnowledge,
  synchronizeRegionalFamiliarity,
} from "@/engine/specializations/regionalKnowledge";
import { getUnlockedPerks } from "@/engine/specializations/perks";
import { generateManagerProfiles } from "@/engine/analytics";
import { generateRegionalYouth, generateSubRegions } from "@/engine/youth/generation";
import {
  initializeFinances,
  applyBalanceTransaction,
  migrateFinancialRecord,
  migrateEmployeeSkillsInRecord,
  normalizeEmployeeContractsInRecord,
  migrateReportListingBids,
  migrateEquipmentLevel,
} from "@/engine/finance";
import type { EquipmentItemId } from "@/engine/finance";
import type { EmployeeAssignment, ClientRelationship } from "@/engine/core/types";
import {
  createRivalOrganizationState,
  generateRivalScouts,
  getRivalOrganizationContentDefinitionIds,
  initializeRivalOrganizations,
  migrateRivalOrganizationState,
} from "@/engine/rivals";
import { getCountryDataSync, getSecondaryCountries } from "@/data/index";
import {
  migrateSaveState,
  migrateFreeAgentGeography,
  type SaveRecord,
  AUTOSAVE_SLOT,
} from "@/lib/db";
import type { SaveConflict, SaveSource } from "@/lib/saveProvider";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { useTutorialStore } from "@/stores/tutorialStore";
import {
  applyScenarioSetup,
  applyScenarioOverrides,
  getInvalidScenarioReason,
  reconcileScenarioAuthority,
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
import { migrateScoutingCases } from "@/engine/reports";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";
import { migratePoliticalMeetingState } from "@/engine/career/politicalMeetings";
import { migrateObservationSessionInteractions } from "@/engine/observation/interactionSelection";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import {
  createOpeningCase,
  type OpeningCaseChoiceId,
} from "@/engine/youth/openingCase";
import { resolveCareerOpeningMode } from "@/engine/youth/openingMode";
import {
  readPlayerExperience,
  recordVeteranPrologueTemplate,
} from "@/lib/playerExperience";

export type GameScreen =
  | "mainMenu"
  | "newGame"
  | "dashboard"
  | "calendar"
  | "match"
  | "observation"
  | "openingDiscovery"
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

export type SaveSlotSummary = Omit<
  SaveRecord,
  "state" | "schemaVersion" | "rulesVersion" | "buildVersion"
> & {
  source: SaveSource;
};

export interface SaveConflictState {
  slot: number;
  conflict: SaveConflict;
}

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
  saveSlots: SaveSlotSummary[];
  isSaving: boolean;
  isLoadingSave: boolean;
  saveConflict: SaveConflictState | null;
  isResolvingSaveConflict: boolean;

  // Autosave error state
  autosaveError: string | null;

  // Scenario transient state
  selectedScenarioId: string | null;
  setSelectedScenario: (id: string | null) => void;
  scenarioProgress: ScenarioProgress | null;
  scenarioOutcome: "victory" | "failure" | null;
  scenarioOutcomeScenarioId: string | null;
  dismissScenarioOutcome: () => void;

  // Celebration transient state
  pendingCelebration: { tier: "minor" | "major" | "epic"; title: string; description: string } | null;
  dismissCelebration: () => void;
  dismissSeasonAwards: () => void;

  // Actions
  startNewGame: (config: NewGameConfig) => Promise<void>;
  loadGame: (state: GameState) => void;
  saveGame: () => GameState | null;

  // Persistence actions (IndexedDB)
  saveToSlot: (slot: number, name: string) => Promise<void>;
  loadFromSlot: (slot: number) => Promise<void>;
  deleteSlot: (slot: number) => Promise<void>;
  refreshSaveSlots: () => Promise<void>;
  dismissSaveConflict: () => void;
  resolveSaveConflict: (slot: number, preferredSource: SaveSource) => Promise<void>;

  // Calendar actions
  scheduleActivity: (activity: Activity, dayIndex: number) => void;
  unscheduleActivity: (dayIndex: number) => void;
  requestWeekAdvance: () => void;
  advanceWeek: () => void;

  // Quick Scout Mode (F17)
  autoSchedule: (priorities?: QuickScoutPriorities) => void;
  batchAdvance: (weeks: number, priorities?: QuickScoutPriorities) => void;
  delegateScouting: (npcScoutId: string, playerId: string) => void;
  resolveLeadershipResponsibility: (
    responsibilityId: string,
    choice: import("@/engine/career/leadership").LeadershipResponsibilityChoice,
    npcScoutId?: string,
  ) => void;
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
      contactId?: string;
    },
  ) => void;
  beginSession: () => void;
  advanceSessionPhase: () => void;
  allocateSessionFocus: (playerId: string, lens: LensType) => void;
  removeSessionFocus: (playerId: string) => void;
  flagSessionMoment: (momentId: string, reaction: SessionFlaggedMoment['reaction']) => void;
  selectDialogueOption: (nodeId: string, optionId: string) => void;
  selectDataPoint: (pointId: string) => void;
  selectStrategicChoice: (choiceId: string) => void;
  addSessionNote: (note: string) => void;
  addSessionHypothesis: (playerId: string, text: string, domain: string) => void;
  endObservationSession: () => void;
  resolveOpeningDiscoveryChoice: (choiceId: OpeningCaseChoiceId) => void;

  // Insight actions
  useInsight: (actionId: InsightActionId) => boolean;
  lastInsightResult: InsightActionResult | null;
  dismissInsightResult: () => void;

  // Report actions
  startReport: (playerId: string) => void;
  submitReport: (
    conviction: ConvictionLevel,
    summary: string,
    strengths: string[],
    weaknesses: string[],
    structured?: StructuredReportInput,
  ) => void;

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
  meetManager: (approach: ManagerMeetingApproach) => void;
  meetBoard: (approach: BoardMeetingApproach) => void;
  unlockSecondarySpecialization: (spec: Specialization) => void;

  // Travel
  bookInternationalTravel: (
    country: string,
    options?: { duration?: number; assignmentId?: string },
  ) => boolean;

  // Phase 2 actions
  acknowledgeNarrativeEvent: (eventId: string) => void;
  resolveNarrativeEventChoice: (eventId: string, choiceIndex: number) => void;
  resolveRivalOrganizationOpportunity: (
    opportunityId: string,
    response: "exploit" | "decline",
  ) => void;

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
  acceptExclusiveUpgradeBid: (bidId: string) => void;
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

  // Cross-screen international pre-fill (set from PlayerProfile → consumed by InternationalScreen)
  pendingInternationalCountry: string | null;
  setPendingInternationalCountry: (country: string | null) => void;

  // Post-submit listing prompt (transient — not persisted in save)
  pendingListingReportId: string | null;
  dismissPendingListing: () => void;

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
  retireLegacyCareer: () => LegacyProfile | null;
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
  reputationChange: number;
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

  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const freshEvents = generateSeasonEvents(state.currentSeason, seasonLength);
  const existingByName = new Map(
    state.seasonEvents.map((event) => [event.name, event]),
  );

  // Reapply persisted decisions to the freshly scaled canonical calendar.
  state.seasonEvents = freshEvents.map((template) => {
    const existing = existingByName.get(template.name);
    return existing
      ? {
          ...template,
          resolved: existing.resolved ?? false,
          choiceSelected: existing.choiceSelected,
        }
      : template;
  });
}

function migrateInboxMessages(state: GameState): void {
  if (!state.inbox || state.inbox.length === 0 || !state.seasonEvents) return;

  const seasonEventsByName = new Map(
    state.seasonEvents.map((event) => [event.name, event]),
  );

  state.inbox = state.inbox.map((message) => {
    if (message.type !== "event") return message;

    const titleBase = message.title.replace(/\s+— Decision Required$/, "");
    const seasonEvent = seasonEventsByName.get(titleBase);
    if (!seasonEvent) return message;

    const actionable = !seasonEvent.resolved && (
      !seasonEvent.relevantSpecializations ||
      seasonEvent.relevantSpecializations.includes(state.scout.primarySpecialization)
    );

    return {
      ...message,
      title: actionable ? `${seasonEvent.name} — Decision Required` : seasonEvent.name,
      body: actionable
        ? `${seasonEvent.description}. You have a decision to make regarding your scouting strategy during this period.`
        : `${seasonEvent.description}. This shapes the wider football landscape, but there is nothing you need to decide directly right now.`,
      actionRequired: actionable,
      relatedId: seasonEvent.id,
      relatedEntityType: "seasonEvent",
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
    const startingCountry =
      normalizeCountryKey(getScoutHomeCountry(state.scout))
      ?? normalizeCountryKey(countries[0])
      ?? "england";
    s.regionalKnowledge = initializeRegionalKnowledge(countries, startingCountry);
  }
  if (!state.subRegions || Object.keys(state.subRegions).length === 0) {
    const generatedSubRegions: GameState["subRegions"] = {};
    for (const countryKey of state.countries ?? []) {
      const countryData = getCountryDataSync(countryKey);
      if (!countryData) continue;
      for (const subRegion of generateSubRegions(countryData.name)) {
        generatedSubRegions[subRegion.id] = subRegion;
      }
    }
    state.subRegions = generatedSubRegions;
  }
  for (const subRegion of Object.values(state.subRegions ?? {})) {
    subRegion.countryKey ??= normalizeCountryKey(subRegion.country);
  }
  for (const territory of Object.values(state.territories ?? {})) {
    territory.countryKey ??=
      normalizeCountryKey(territory.country)
      ?? normalizeCountryKey(territory.id.replace(/^territory_/, ""));
  }
  for (const tournament of Object.values(state.youthTournaments ?? {})) {
    tournament.countryKey ??= normalizeCountryKey(tournament.country);
  }
  const synchronized = synchronizeRegionalFamiliarity(
    state.scout,
    state.subRegions,
    state.regionalKnowledge,
  );
  state.scout = synchronized.scout;
  state.subRegions = synchronized.subRegions;
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
  lastMatchResult: null,
  selectedPlayerId: null,
  selectedFixtureId: null,
  saveSlots: [],
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
        ...getWorldTraitContentDefinitionIds(),
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
    const worldCountries = [
      ...new Set([
        ...selectedCountries,
        ...getSecondaryCountries(),
        "england",
        "spain",
        "germany",
        "france",
        "brazil",
        "argentina",
      ]),
    ];
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
        12,
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
      jobOffers: [],
      performanceReviews: [],
      inbox: [],
      npcScouts: {},
      npcReports: {},
      npcDelegations: {},
      territories,
      countries: worldCountries,
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

  loadGame: (state) => {
    // Deep-spread to avoid mutating the caller's object (Fix #23)
    const migrated: GameState = {
      ...state,
      scout: { ...state.scout, skills: { ...state.scout.skills } },
      finances: state.finances ? { ...state.finances } : state.finances,
      npcDelegations: { ...(state.npcDelegations ?? {}) },
      transferRecords: (state.transferRecords ?? []).map((record) => ({
        ...record,
        seasonParticipation: record.seasonParticipation?.map((season) => ({ ...season })),
        outcomeEvidence: record.outcomeEvidence ? [...record.outcomeEvidence] : undefined,
      })),
    };
    if (!migrated.runManifest) {
      const legacyCountries = migrated.countries?.length
        ? migrated.countries
        : ["england"];
      migrated.runManifest = createRunManifest({
        rootSeed: migrated.seed || "legacy-import",
        specialization: migrated.scout.primarySpecialization ?? "youth",
        difficulty: migrated.difficulty ?? "normal",
        selectedCountries: legacyCountries,
        startingCountry: legacyCountries[0],
        integrity: "legacy-import",
        creationRulesVersion: "legacy-pre-run-manifest",
      });
    } else {
      try {
        if (validateRunManifest(migrated.runManifest, migrated.seed).length > 0) {
          migrated.runManifest = repairRunManifest(
            migrated.runManifest,
            migrated.seed || migrated.runManifest.rootSeed,
          );
        }
      } catch {
        const legacyCountries = migrated.countries?.length
          ? migrated.countries
          : ["england"];
        migrated.runManifest = createRunManifest({
          rootSeed: migrated.seed || "legacy-import",
          specialization: migrated.scout.primarySpecialization ?? "youth",
          difficulty: migrated.difficulty ?? "normal",
          selectedCountries: legacyCountries,
          startingCountry: legacyCountries[0],
          integrity: "legacy-import",
          creationRulesVersion: "legacy-pre-run-manifest",
        });
      }
    }
    migrated.consequenceState = createConsequenceEngineState(
      migrated.consequenceState,
    );
    migrated.eventDirector = createEventDirectorState(migrated.eventDirector);
    migrateFreeAgentGeography(migrated);
    // Migration: add new scout skills if loading an older save
    if (migrated.scout.skills.playerJudgment === undefined) {
      migrated.scout.skills.playerJudgment = 5;
      migrated.scout.skills.potentialAssessment = 5;
    }
    // Migration: add careerPath to scout if missing
    if (migrated.scout.careerPath === undefined) {
      migrated.scout.careerPath = migrated.scout.currentClubId
        ? "club"
        : "independent";
    }
    // Legacy compatibility: an established Tier-2+ career (or any active club
    // contract) is treated as an already-made choice so an old save is never
    // interrupted by a retroactive fork. Only an unemployed Tier-1 scout keeps
    // the new deliberate choice ahead of them.
    if (migrated.scout.careerPathChosen === undefined) {
      migrated.scout.careerPathChosen = Boolean(
        migrated.scout.currentClubId || migrated.scout.careerTier >= 2,
      );
    }
    // Migration: convert old equipmentLevel to new equipment loadout system
    if (migrated.finances && !migrated.finances.equipment) {
      migrated.finances.equipment = migrateEquipmentLevel(migrated.finances.equipmentLevel);
    }
    // Migration: economics revamp — add new financial fields
    if (migrated.finances) {
      migrated.finances = migrateFinancialRecord(migrated.finances, migrated.scout);
    }
    // Migration: employee skills system
    if (migrated.finances && migrated.finances.employees.some((e) => !e.skills)) {
      const rng = createRNG(`${migrated.seed}-skill-migrate`);
      migrated.finances = migrateEmployeeSkillsInRecord(migrated.finances, rng);
    }
    // Migration: enforce deterministic employee market bands and initialize
    // pay satisfaction. Legacy £1/negative contracts move to the nearest legal
    // floor and receive a zero-value audit-ledger entry.
    if (migrated.finances) {
      migrated.finances = normalizeEmployeeContractsInRecord(
        migrated.finances,
        migrated.scout.reputation,
        migrated.currentWeek,
        migrated.currentSeason,
      );
    }
    // Migration: report listing bids
    if (migrated.finances) {
      migrated.finances = migrateReportListingBids(
        migrated.finances,
        getSeasonLength(migrated.fixtures, migrated.currentSeason),
      );
    }
    // Migration: Player roles, traits & tactical depth expansion
    migratePlayerRolesAndTraits(migrated);
    // Migration: Match rating system
    migrateMatchRatings(migrated);
    // Migration: replace fabricated transfer appearances and unsupported causes
    migrated.transferRecords = migrateLegacyTransferParticipation(
      migrated.transferRecords,
    );
    // Migration: Season event effects (F1)
    migrateSeasonEvents(migrated);
    migrateInboxMessages(migrated);
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
    // Migration: causal report -> delivery -> decision -> alumni history.
    migrateScoutingCases(migrated);
    // Migration: F4 Transfer Negotiation System
    // eslint-disable-next-line
    (migrated as any).activeNegotiations ??= [];
    // Migration: F8 Rival Scouts Enhancement
    migrateRivalScouts(migrated);
    migrated.rivalOrganizationState = migrateRivalOrganizationState(
      migrated.seed,
      migrated.rivalScouts,
      migrated.rivalOrganizationState,
      Math.max(1, migrated.currentSeason),
    );
    // Migration: NPC delegation persistence
    if (!(migrated as GameState & { npcDelegations?: GameState["npcDelegations"] }).npcDelegations) {
      (migrated as GameState & { npcDelegations: GameState["npcDelegations"] }).npcDelegations = {};
    }
    // Migration: F2 Event Chains
    // eslint-disable-next-line
    (migrated as any).eventChains ??= [];
    // Migration: F3 Contact Network Depth
    migrateContactNetworkDepth(migrated);
    // Migration: persisted international assignment queue
    if (!(migrated as GameState & { internationalAssignments?: GameState["internationalAssignments"] }).internationalAssignments) {
      (migrated as GameState & { internationalAssignments: GameState["internationalAssignments"] }).internationalAssignments = [];
    }
    migrated.internationalAssignments = migrated.internationalAssignments.map(
      migrateInternationalAssignment,
    );
    if ((migrated as GameState & { activeInternationalAssignment?: GameState["activeInternationalAssignment"] }).activeInternationalAssignment === undefined) {
      (migrated as GameState & { activeInternationalAssignment: GameState["activeInternationalAssignment"] }).activeInternationalAssignment = null;
    }
    if (migrated.activeInternationalAssignment) {
      migrated.activeInternationalAssignment = {
        ...migrateInternationalAssignment(migrated.activeInternationalAssignment),
        acceptedWeek: migrated.activeInternationalAssignment.acceptedWeek ?? migrated.currentWeek,
        acceptedSeason: migrated.activeInternationalAssignment.acceptedSeason ?? migrated.currentSeason,
      };
    }
    migrated.internationalAssignmentHistory = (
      migrated.internationalAssignmentHistory ?? []
    ).map(migrateInternationalAssignment);
    // Migration: F10 Dynamic Board Expectations
    // eslint-disable-next-line
    (migrated as any).boardReactions ??= [];
    if (
      migrated.boardProfile?.ultimatumIssued
      && migrated.boardProfile.ultimatumDeadline !== undefined
      && migrated.boardProfile.ultimatumDeadlineSeason === undefined
    ) {
      migrated.boardProfile.ultimatumDeadlineSeason = migrated.currentSeason;
    }
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
    if (migrated.scout.specializationXp === undefined) migrated.scout.specializationXp = 0;
    migrated.scout.unlockedPerks = Array.from(new Set([
      ...(migrated.scout.unlockedPerks ?? []),
      ...getUnlockedPerks(
        migrated.scout.primarySpecialization,
        migrated.scout.specializationLevel ?? 1,
      ).map((perk) => perk.id),
    ]));
    if (migrated.scout.avatarId === undefined) migrated.scout.avatarId = 1;
    // Migration: Youth Tournament System
    // eslint-disable-next-line
    if (!(migrated as any).youthTournaments) (migrated as any).youthTournaments = {};
    migrated.youthRecruitmentBriefs ??= {};
    migrated.recommendationReviews ??= {};
    // Migration: Player Loan System
    // eslint-disable-next-line
    (migrated as any).activeLoans ??= [];
    // eslint-disable-next-line
    (migrated as any).loanHistory ??= [];
    // eslint-disable-next-line
    (migrated as any).loanRecommendations ??= [];
    (migrated as any).retiredPlayers ??= {};
    (migrated as any).playerMovementHistory ??= [];
    for (const player of Object.values(migrated.players ?? {})) {
      if (player.contractClubId === undefined) {
        player.contractClubId = (player.loanParentClubId ?? player.clubId) || undefined;
      }
    }
    // Ensure clubs have loan tracking arrays
    for (const club of Object.values(migrated.clubs ?? {})) {
      if (!(club as any).loanedOutPlayerIds) (club as any).loanedOutPlayerIds = [];
      if (!(club as any).loanedInPlayerIds) (club as any).loanedInPlayerIds = [];
      if (!(club as any).academyPlayerIds) (club as any).academyPlayerIds = [];
    }
    const compactedHistoryState = compactLongCareerHistory(migrated);
    const scenarioSafeState = reconcileScenarioAuthority(
      migratePoliticalMeetingState(compactedHistoryState),
    );
    const serializedSession = scenarioSafeState.activeObservationSession
      ? migrateObservationSessionInteractions(scenarioSafeState.activeObservationSession)
      : null;
    const serializedCompletionId = serializedSession?.activityInstanceId
      ?? serializedSession?.id;
    const resumableSession = serializedSession
      && serializedSession.state !== "complete"
      && !(scenarioSafeState.completedInteractiveSessions ?? []).includes(
        serializedCompletionId ?? "",
      )
        ? serializedSession
        : null;
    scenarioSafeState.activeObservationSession = resumableSession;
    const awaitingOpeningDecision = scenarioSafeState.openingCase?.stage === "decision";
    set({
      gameState: scenarioSafeState,
      isLoaded: true,
      currentScreen: resumableSession
        ? "observation"
        : awaitingOpeningDecision
          ? "openingDiscovery"
          : "dashboard",
      selectedPlayerId: scenarioSafeState.openingCase?.playerId ?? null,
      scenarioProgress: null,
      scenarioOutcome: null,
      scenarioOutcomeScenarioId: null,
      pendingCelebration: null,
      activeSession: resumableSession,
      sessionReturnScreen: resumableSession ? "dashboard" : null,
      weekSimulation: null,
      lastWeekSummary: null,
      batchSummary: null,
      saveConflict: null,
      isResolvingSaveConflict: false,
    });

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
    const { gameState, activeSession } = get();
    if (!gameState) return null;
    const saved = {
      ...gameState,
      activeObservationSession: activeSession,
      lastSaved: Date.now(),
    };
    set({ gameState: saved });
    getActiveSaveProvider()
      .then((provider) => provider.save("autosave", JSON.stringify(saved), "Autosave"))
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
      await provider.save(
        slotNumberToSaveName(slot),
        JSON.stringify(saved),
        name,
      );
      set({ gameState: saved });
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

      const state = migrateSaveState(JSON.parse(loaded.data) as unknown);
      assertEarlyAccessSaveCompatibility(state);
      get().loadGame(state);
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
    const seen = new Set<string>();
    const slots: SaveSlotSummary[] = [];

    for (const entry of entries) {
      if (seen.has(entry.slotName)) continue;
      seen.add(entry.slotName);
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
      });
    }

    set({ saveSlots: slots });
  },

  dismissSaveConflict: () => {
    set({ saveConflict: null });
  },

  resolveSaveConflict: async (slot, preferredSource) => {
    set({ isResolvingSaveConflict: true });
    try {
      const provider = await getActiveSaveProvider();
      const slotName = slotNumberToSaveName(slot);
      const resolved = await provider.loadFromSource(slotName, preferredSource);
      if (!resolved) return;

      await provider.save(slotName, resolved.data, resolved.name, {
        waitForCloud: true,
      });

      const state = migrateSaveState(JSON.parse(resolved.data) as unknown);
      assertEarlyAccessSaveCompatibility(state);
      get().loadGame(state);
      set({ saveConflict: null });
      await get().refreshSaveSlots();
    } finally {
      set({ isResolvingSaveConflict: false });
    }
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
