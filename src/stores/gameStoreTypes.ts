import type {
  ActionableGossipItem,
  Activity,
  AgencyEmployeeRole,
  BatchAdvanceResult,
  BoardMeetingApproach,
  CardEvent,
  CareerPath,
  Club,
  ConsultingContract,
  ConvictionLevel,
  DataSubscriptionTier,
  DiscoveryRecord,
  EmployeeAssignment,
  Fixture,
  FocusSelection,
  GameState,
  InitialAssessmentInput,
  GossipAction,
  LeaderboardEntry,
  LegacyProfile,
  League,
  LifestyleLevel,
  LoanType,
  ManagerMeetingApproach,
  MatchPhase,
  NarrativeEvent,
  NewGameConfig,
  NPCScout,
  NPCScoutReport,
  Observation,
  OfficeEquipmentTier,
  OfficeTier,
  Player,
  PlayerMatchRating,
  QuickScoutPriorities,
  RetainerContract,
  RivalScout,
  ScoutPerformanceSnapshot,
  ScoutReport,
  EvidenceClassificationId,
  ObservationHalftimeApproach,
  ScoutingQuestionId,
  SeasonEvent,
  Specialization,
  StructuredReportInput,
  Territory,
  TravelBudgetTier,
  TravelPosture,
  WeekSimulationState,
} from "@/engine/core/types";
import type { WeeklyWorkerTelemetry } from "@/engine/core/weeklyTransactionProtocol";
import type { LeadershipResponsibilityChoice } from "@/engine/career/leadership";
import type { CareerRecoveryPlanId } from "@/engine/career/recovery";
import type { EquipmentItemId } from "@/engine/finance";
import type { InsightActionId, InsightActionResult } from "@/engine/insight/types";
import type {
  ObservationSession,
  SessionFlaggedMoment,
  LensType,
} from "@/engine/observation/types";
import type { ReflectionResult } from "@/engine/observation/reflection";
import type { ScenarioProgress } from "@/engine/scenarios";
import type { WeeklyIntentId, DelegationPolicyId } from "@/engine/core/weeklyStrategy";
import type { OpeningCaseChoiceId } from "@/engine/youth/openingCase";
import type {
  SaveArchiveSummary,
  SaveRecord,
  SaveRecoveryNotice,
  SaveUnavailableNotice,
} from "@/lib/db";
import type {
  PersistentCloudSyncStatus,
  SaveConflict,
  SaveSource,
} from "@/lib/saveProvider";

/**
 * Dependency-neutral public contract for the Zustand game store.
 *
 * Action factories depend on this type-only module instead of importing the
 * store implementation that composes them, preventing an implementation cycle.
 */
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
  | "futureRoadmap"
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
  recovery?: SaveRecoveryNotice;
  unavailable?: SaveUnavailableNotice;
  localUnavailable?: SaveUnavailableNotice;
};

export interface SaveConflictState {
  slot: number;
  conflict: SaveConflict;
}

export interface WeekSummary {
  /**
   * Screen that should open after the player acknowledges this summary.
   * End-of-season processing uses this to preserve the causal order:
   * completed week, earned milestone, then season review.
   */
  continueScreen?: GameScreen;
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
  activityQualities: Array<{
    activityType: string;
    tier: string;
    narrative: string;
  }>;
  playersDiscovered: number;
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
  zone: "promotion" | "relegation" | "normal";
}

export interface GameStoreState {
  currentScreen: GameScreen;
  setScreen: (screen: GameScreen) => void;

  gameState: GameState | null;
  isLoaded: boolean;

  activeMatch: {
    fixtureId: string;
    phases: MatchPhase[];
    currentPhase: number;
    focusSelections: FocusSelection[];
  } | null;

  lastWeekSummary: WeekSummary | null;
  dismissWeekSummary: () => void;

  lastMatchResult: {
    fixtureId: string;
    focusedPlayerIds: string[];
    homeGoals: number;
    awayGoals: number;
    continueScreen: GameScreen;
    traitDiscoveries?: Array<{ playerName: string; trait: string }>;
    playerRatings?: Record<string, PlayerMatchRating>;
    cardEvents?: CardEvent[];
  } | null;

  selectedPlayerId: string | null;
  selectedFixtureId: string | null;
  saveSlots: SaveSlotSummary[];
  saveRecoveryCopies: SaveArchiveSummary[];
  saveSyncStatus: PersistentCloudSyncStatus;
  isSaving: boolean;
  isLoadingSave: boolean;
  saveConflict: SaveConflictState | null;
  isResolvingSaveConflict: boolean;
  autosaveError: string | null;

  selectedScenarioId: string | null;
  setSelectedScenario: (id: string | null) => void;
  scenarioProgress: ScenarioProgress | null;
  scenarioOutcome: "victory" | "failure" | null;
  scenarioOutcomeScenarioId: string | null;
  dismissScenarioOutcome: () => void;

  pendingCelebration: {
    tier: "minor" | "major" | "epic";
    title: string;
    description: string;
  } | null;
  dismissCelebration: () => void;
  acknowledgeCareerMoment: (momentId: string) => void;
  suppressCareerMoments: (reason?: string) => void;
  suppressCareerMoment: (momentId: string, reason?: string) => void;
  dismissSeasonAwards: () => void;

  startNewGame: (config: NewGameConfig) => Promise<void>;
  loadGame: (state: unknown) => void;
  saveGame: () => GameState | null;

  saveToSlot: (slot: number, name: string) => Promise<void>;
  loadFromSlot: (slot: number) => Promise<void>;
  deleteSlot: (slot: number) => Promise<void>;
  refreshSaveSlots: () => Promise<void>;
  refreshSaveSyncStatus: () => Promise<void>;
  restoreSaveRecoveryCopy: (archiveId: string) => Promise<void>;
  retryPendingSaveSync: () => Promise<void>;
  dismissSaveConflict: () => void;
  resolveSaveConflict: (slot: number, preferredSource: SaveSource) => Promise<void>;

  scheduleActivity: (activity: Activity, dayIndex: number) => void;
  unscheduleActivity: (dayIndex: number) => void;
  setWeeklyIntent: (intentId: WeeklyIntentId) => void;
  setDelegationPolicy: (policyId: DelegationPolicyId) => void;
  requestWeekAdvance: () => void;
  advanceWeek: () => void;
  advanceWeekAsync: () => Promise<void>;
  isAdvancingWeek: boolean;
  lastWeeklyExecutionRoute: "worker" | "main-thread-fallback" | null;
  lastWeeklyWorkerTelemetry: WeeklyWorkerTelemetry | null;
  weeklyTransactionError: string | null;

  autoSchedule: (priorities?: QuickScoutPriorities) => void;
  batchAdvance: (weeks: number, priorities?: QuickScoutPriorities) => Promise<void>;
  delegateScouting: (npcScoutId: string, playerId: string) => void;
  resolveLeadershipResponsibility: (
    responsibilityId: string,
    choice: LeadershipResponsibilityChoice,
    npcScoutId?: string,
  ) => void;
  batchSummary: BatchAdvanceResult | null;
  dismissBatchSummary: () => void;

  resolveSeasonEvent: (eventId: string, choiceIndex: number) => void;

  weekSimulation: WeekSimulationState | null;
  startWeekSimulation: () => void;
  chooseSimulationInteraction: (
    optionId: string,
    focusedPlayerIds?: string[],
  ) => void;
  advanceDay: () => Promise<void>;
  fastForwardWeek: () => Promise<void>;

  scheduleMatch: (fixtureId: string) => boolean;
  startMatch: (fixtureId: string) => void;
  advancePhase: () => void;
  setFocus: (playerId: string, lens: FocusSelection["lens"]) => void;
  endMatch: () => void;

  activeSession: ObservationSession | null;
  sessionReturnScreen: GameScreen | null;
  lastReflectionResult: ReflectionResult | null;
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
  setSessionScoutingQuestion: (questionId: ScoutingQuestionId) => void;
  advanceSessionPhase: () => void;
  allocateSessionFocus: (playerId: string, lens: LensType) => void;
  removeSessionFocus: (playerId: string) => void;
  flagSessionMoment: (
    momentId: string,
    reaction: SessionFlaggedMoment["reaction"],
  ) => void;
  setSessionHalftimeApproach: (approach: ObservationHalftimeApproach) => void;
  classifySessionEvidence: (
    cueId: string,
    classification: EvidenceClassificationId,
  ) => void;
  selectDialogueOption: (nodeId: string, optionId: string) => void;
  selectDataPoint: (pointId: string) => void;
  selectStrategicChoice: (choiceId: string) => void;
  addSessionNote: (note: string) => void;
  endObservationSession: () => void;
  resolveOpeningDiscoveryChoice: (choiceId: OpeningCaseChoiceId) => void;

  useInsight: (actionId: InsightActionId) => boolean;
  lastInsightResult: InsightActionResult | null;
  dismissInsightResult: () => void;

  startReport: (playerId: string) => void;
  submitReport: (
    conviction: ConvictionLevel,
    summary: string,
    strengths: string[],
    weaknesses: string[],
    structured?: StructuredReportInput,
    initialAssessment?: InitialAssessmentInput,
  ) => void;

  chooseCareerRecovery: (planId: CareerRecoveryPlanId) => void;
  acceptJob: (offerId: string) => void;
  declineJob: (offerId: string) => void;

  markMessageRead: (messageId: string) => void;
  markAllRead: () => void;

  handleGossipAction: (gossipId: string, action: GossipAction) => void;
  getActiveGossip: () => ActionableGossipItem[];

  selectPlayer: (playerId: string | null) => void;
  selectFixture: (fixtureId: string | null) => void;

  assignNPCScoutTerritory: (npcScoutId: string, territoryId: string) => void;
  reviewNPCReport: (reportId: string) => void;

  meetManager: (approach: ManagerMeetingApproach) => void;
  meetBoard: (approach: BoardMeetingApproach) => void;
  unlockSecondarySpecialization: (spec: Specialization) => void;

  bookInternationalTravel: (
    country: string,
    options?: { duration?: number; assignmentId?: string; posture?: TravelPosture },
  ) => boolean;

  acknowledgeNarrativeEvent: (eventId: string) => void;
  resolveNarrativeEventChoice: (eventId: string, choiceIndex: number) => void;
  resolveConsequenceDecision: (decisionId: string, optionId: string) => void;
  resolveRivalOrganizationOpportunity: (
    opportunityId: string,
    response: "exploit" | "decline",
  ) => void;

  purchaseEquipItem: (itemId: EquipmentItemId) => void;
  sellEquipItem: (itemId: EquipmentItemId) => void;
  equipEquipItem: (itemId: EquipmentItemId) => void;

  chooseCareerPath: (path: CareerPath) => void;
  setAgencyOperatingPolicy: (
    policy: import("@/engine/finance").AgencyOperatingPolicy,
    focusRegionId?: string,
  ) => void;
  changeLifestyle: (level: LifestyleLevel) => void;
  approveStaffWorkProduct: (workProductId: string) => void;
  rejectStaffWorkProduct: (workProductId: string) => void;
  listReportForSale: (
    reportId: string,
    price: number,
    isExclusive: boolean,
    targetClubId?: string,
  ) => void;
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
  assignAgencyEmployee: (
    employeeId: string,
    assignment: EmployeeAssignment,
  ) => void;
  pitchToClient: (
    clubId: string,
    pitchType: "coldCall" | "referral" | "showcase",
  ) => void;
  resolveAgencyEmployeeEvent: (eventId: string, optionIndex: number) => void;
  adjustEmployeeSalary: (employeeId: string, newSalary: number) => void;
  openAgencySatelliteOffice: (region: string) => void;
  closeAgencySatelliteOffice: (officeId: string) => void;
  relocateAgencyHomeBase: (country: string) => void;
  assignEmployeeToAgencySatellite: (
    employeeId: string,
    officeId: string,
  ) => void;
  trainAgencyEmployee: (employeeId: string, skillIndex: 1 | 2 | 3) => void;

  takeLoanAction: (type: LoanType, amount: number) => void;
  repayLoanAction: () => void;
  sellEquipmentForCashAction: (itemValue: number) => void;
  acceptConsultingContract: (contract: ConsultingContract) => void;
  declineRetainerOffer: (contractId: string) => void;
  declineConsultingOffer: (contractId: string) => void;
  completeConsultingContract: (contractId: string) => void;

  purchaseDataSubscriptionAction: (tier: DataSubscriptionTier) => void;
  upgradeTravelBudgetAction: (tier: TravelBudgetTier) => void;
  upgradeOfficeEquipmentAction: (tier: OfficeEquipmentTier) => void;

  hireAssistantScoutAction: () => void;
  fireAssistantScoutAction: (scoutId: string) => void;
  assignAssistantScoutAction: (
    scoutId: string,
    task: { playerId?: string; region?: string },
  ) => void;
  unassignAssistantScoutAction: (scoutId: string) => void;

  activeNegotiationId: string | null;
  initiateTransferNegotiation: (playerId: string) => void;
  submitTransferOffer: (
    negotiationId: string,
    amount: number,
    addOns?: import("@/engine/core/types").TransferAddOn[],
  ) => void;
  acceptNegotiation: (negotiationId: string) => void;
  walkAway: (negotiationId: string) => void;

  initiateFreeAgentNegotiation: (
    playerId: string,
    wage: number,
    bonus: number,
    contractLength: number,
  ) => void;
  submitFreeAgentOffer: (
    playerId: string,
    wage: number,
    bonus: number,
    contractLength: number,
  ) => void;

  recommendPlayerForLoan: (
    playerId: string,
    targetClubId: string,
    rationale: "development" | "playing-time" | "experience" | "squad-depth",
    duration: number,
  ) => void;
  submitLoanMonitoringReport: (loanDealId: string) => void;
  recallLoanPlayer: (loanDealId: string) => void;

  pendingFixtureClubFilter: string | null;
  setPendingFixtureClubFilter: (filter: string | null) => void;
  pendingCalendarActivity: {
    type: string;
    targetId: string;
    label: string;
  } | null;
  setPendingCalendarActivity: (
    pending: { type: string; targetId: string; label: string } | null,
  ) => void;
  pendingInternationalCountry: string | null;
  setPendingInternationalCountry: (country: string | null) => void;
  pendingListingReportId: string | null;
  dismissPendingListing: () => void;

  tapNetworkForPlayer: (
    playerId: string,
  ) => { title: string; body: string; contactName?: string } | null;
  toggleWatchlist: (playerId: string) => void;

  comparisonReportIds: string[];
  addToComparison: (reportId: string) => void;
  removeFromComparison: (reportId: string) => void;
  clearComparison: () => void;

  submitToLeaderboard: () => Promise<LeaderboardEntry | null>;

  completeLegacyCareer: () => LegacyProfile | null;
  retireLegacyCareer: () => LegacyProfile | null;
  startNewGamePlus: (
    config: NewGameConfig,
    selectedPerkIds: string[],
  ) => Promise<void>;

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
