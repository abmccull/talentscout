import { canChooseCareerPath } from "@/engine/career/pathChoice";
import { COURSE_CATALOG } from "@/engine/career/courses";
import { getActiveSeasonEvents } from "@/engine/core/seasonEvents";
import type {
  Activity,
  ConvictionLevel,
  GameState,
  MarketplaceBid,
  Observation,
  Player,
  QuickScoutPriorities,
  ReportListing,
  ScoutReport,
} from "@/engine/core/types";
import type { DecisionOption, DecisionRecord } from "@/engine/consequences/types";
import {
  getFreshReportObservationIds,
  getLatestReportInScope,
  selectLatestReportsByCase,
} from "@/engine/reports/reportAccountability";
import type { DelegationPolicyId, WeeklyIntentId } from "@/engine/core/weeklyStrategy";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { reconcileInboxActionRequirements } from "@/engine/world/inboxActionAuthority";
import { useGameStore } from "@/stores/gameStore";

const INTENT_ROTATION: WeeklyIntentId[] = [
  "balancedDesk",
  "discoveryBreadth",
  "relationshipCapital",
  "evidenceDepth",
  "assignmentDelivery",
  "speculativeEdge",
];

const DELEGATION_ROTATION: DelegationPolicyId[] = [
  "adaptiveDesk",
  "protectCoverage",
  "protectRelationships",
  "protectEvidence",
];

const COURSE_PRIORITY = [
  "fa_level_1",
  "fa_level_2",
  "fa_level_3",
  "business_fundamentals",
  "advanced_video_analysis",
  "agency_management",
] as const;

const SAFE_OPTION_HINTS = [
  "protect",
  "verify",
  "wait",
  "pass",
  "hold",
  "steady",
  "measured",
  "private",
  "document",
  "support",
  "listen",
  "staged",
  "publish-later",
] as const;

const RISKY_OPTION_HINTS = [
  "exploit",
  "gamble",
  "leak",
  "threaten",
  "public",
  "rush",
  "retaliate",
  "confront",
  "expose",
  "ultimatum",
  "burn",
  "lie",
  "bluff",
  "demand",
  "force",
  "cash-out",
  "callclub",
] as const;

export interface AutonomousCareerTelemetry {
  weeksDriven: number;
  authoredReports: number;
  listedReports: number;
  acceptedMarketplaceBids: number;
  acceptedExclusiveUpgradeBids: number;
  acceptedRetainerOffers: number;
  declinedRetainerOffers: number;
  declinedConsultingOffers: number;
  careerPathChoices: number;
  coursesEnrolled: number;
  openingChoices: number;
  seasonEventChoices: number;
  narrativeChoices: number;
  narrativeAcknowledgements: number;
  consequenceChoices: number;
  meaningfulDecisions: number;
}

export interface AutonomousWorldHealthSnapshot {
  season: number;
  activePlayers: number;
  unsignedYouth: number;
  freeAgents: number;
  freeAgentRatio: number;
  activeLoans: number;
  activeLoanRatio: number;
  reports: number;
  observations: number;
  inboxMessages: number;
  financialBalance: number | null;
  listedReports: number;
  pendingMarketplaceBids: number;
  pendingRetainerOffers: number;
  pendingConsultingOffers: number;
  unresolvedActionBacklog: number;
  meaningfulDecisions: number;
  careerTier: number;
  careerPath: GameState["scout"]["careerPath"];
  careerPathChosen: boolean;
  completedCourses: number;
  activeRetainers: number;
  activeConsultingContracts: number;
}

interface ReportCandidate {
  playerId: string;
  player: Player;
  observations: Observation[];
  freshObservationIds: string[];
  priorReport?: ScoutReport;
  score: number;
}

function round(value: number, precision = 3): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function createTelemetry(): AutonomousCareerTelemetry {
  return {
    weeksDriven: 0,
    authoredReports: 0,
    listedReports: 0,
    acceptedMarketplaceBids: 0,
    acceptedExclusiveUpgradeBids: 0,
    acceptedRetainerOffers: 0,
    declinedRetainerOffers: 0,
    declinedConsultingOffers: 0,
    careerPathChoices: 0,
    coursesEnrolled: 0,
    openingChoices: 0,
    seasonEventChoices: 0,
    narrativeChoices: 0,
    narrativeAcknowledgements: 0,
    consequenceChoices: 0,
    meaningfulDecisions: 0,
  };
}

function recordMeaningfulDecision(
  telemetry: AutonomousCareerTelemetry,
  key:
    | "acceptedMarketplaceBids"
    | "acceptedExclusiveUpgradeBids"
    | "acceptedRetainerOffers"
    | "declinedRetainerOffers"
    | "declinedConsultingOffers"
    | "careerPathChoices"
    | "coursesEnrolled"
    | "openingChoices"
    | "seasonEventChoices"
    | "narrativeChoices"
    | "narrativeAcknowledgements"
    | "consequenceChoices",
): void {
  telemetry[key] += 1;
  telemetry.meaningfulDecisions += 1;
}

function scheduleIndex(state: GameState): number {
  return Math.max(0, (state.currentSeason - 1) * 64 + state.currentWeek - 1);
}

function chooseWeeklyIntent(state: GameState): WeeklyIntentId {
  return INTENT_ROTATION[scheduleIndex(state) % INTENT_ROTATION.length];
}

function chooseDelegationPolicy(state: GameState): DelegationPolicyId {
  return DELEGATION_ROTATION[scheduleIndex(state) % DELEGATION_ROTATION.length];
}

function buildPriorities(state: GameState): QuickScoutPriorities {
  const intent = chooseWeeklyIntent(state);
  const observedCounts = new Map<string, number>();
  for (const observation of Object.values(state.observations)) {
    if (observation.scoutId !== state.scout.id) continue;
    observedCounts.set(observation.playerId, (observedCounts.get(observation.playerId) ?? 0) + 1);
  }
  const targetPlayerIds = [...observedCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([playerId]) => playerId);
  return {
    targetPlayerIds,
    trainWeakSkills: intent === "balancedDesk",
    maintainContacts: intent !== "evidenceDepth" && intent !== "speculativeEdge",
    writeReports: intent !== "discoveryBreadth" && intent !== "relationshipCapital",
  };
}

function scoreText(...parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function safeChoiceScore(text: string): number {
  let score = 0;
  for (const hint of SAFE_OPTION_HINTS) {
    if (text.includes(hint)) score += 3;
  }
  for (const hint of RISKY_OPTION_HINTS) {
    if (text.includes(hint)) score -= 4;
  }
  return score;
}

function chooseSafeOptionIndex(
  choices: Array<{ label?: string; description?: string; effect?: string }>,
): number {
  if (choices.length === 0) return 0;
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [index, choice] of choices.entries()) {
    const score = safeChoiceScore(scoreText(choice.label, choice.description, choice.effect));
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function chooseSafeDecisionOption(decision: DecisionRecord): DecisionOption {
  const defaultOption = decision.defaultOptionId
    ? decision.options.find((option) => option.id === decision.defaultOptionId)
    : undefined;
  if (defaultOption) return defaultOption;

  let best = decision.options[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const option of decision.options) {
    const score = safeChoiceScore(scoreText(option.id, option.label, ...option.knownTradeoffs));
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

function clearWeekSchedule(): void {
  const store = useGameStore.getState();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    store.unscheduleActivity(dayIndex);
  }
}

function ensureScheduledWork(): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state) return;
  if (state.schedule.activities.some((activity) => activity !== null)) return;
  const restActivity: Activity = {
    type: "rest",
    slots: 1,
    description: "Autonomous recovery day",
  };
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    store.scheduleActivity(restActivity, dayIndex);
  }
}

function chooseDayInteraction(
  activity: Activity | null,
  observations: Array<{ playerId: string }>,
): { optionId: "scan" | "focus" | "network"; focusedPlayerIds?: string[] } {
  if (!activity) return { optionId: "scan" };
  const focusedPlayerIds = observations.slice(0, 2).map((entry) => entry.playerId);
  switch (activity.type) {
    case "networkMeeting":
    case "parentCoachMeeting":
    case "agentShowcase":
    case "contractNegotiation":
      return { optionId: "network" };
    case "writeReport":
    case "writePlacementReport":
    case "followUpSession":
    case "deepVideoAnalysis":
    case "oppositionAnalysis":
    case "academyVisit":
      return { optionId: "focus", focusedPlayerIds };
    case "rest":
    case "study":
      return { optionId: "scan" };
    default:
      return focusedPlayerIds.length > 0
        ? { optionId: "focus", focusedPlayerIds }
        : { optionId: "scan" };
  }
}

function getPlayerForReport(state: GameState, playerId: string): Player | undefined {
  return resolvePlayerEntity(state, playerId)?.player;
}

function getReportCandidates(state: GameState): ReportCandidate[] {
  const grouped = new Map<string, Observation[]>();
  for (const observation of Object.values(state.observations)) {
    if (observation.scoutId !== state.scout.id) continue;
    const bucket = grouped.get(observation.playerId) ?? [];
    bucket.push(observation);
    grouped.set(observation.playerId, bucket);
  }

  const reports = Object.values(state.reports);
  const candidates: ReportCandidate[] = [];
  for (const [playerId, observations] of grouped.entries()) {
    const player = getPlayerForReport(state, playerId);
    if (!player) continue;
    const priorReport = getLatestReportInScope(reports, state.scout.id, playerId);
    const freshObservationIds = getFreshReportObservationIds(observations, priorReport);
    const minimumFresh = priorReport ? 2 : 3;
    if (freshObservationIds.length < minimumFresh || observations.length < 3) continue;
    const unsignedYouth = Object.values(state.unsignedYouth ?? {}).find((entry) => entry.player.id === playerId);
    const score = freshObservationIds.length * 12
      + observations.length * 5
      + (unsignedYouth?.buzzLevel ?? 0)
      + (priorReport ? 0 : 10);
    candidates.push({
      playerId,
      player,
      observations: [...observations].sort((left, right) =>
        left.season - right.season
        || left.week - right.week
        || left.id.localeCompare(right.id)
      ),
      freshObservationIds,
      priorReport,
      score,
    });
  }

  return candidates.sort((left, right) => right.score - left.score || left.playerId.localeCompare(right.playerId));
}

function attributeSummary(
  observations: Observation[],
): { strengths: string[]; weaknesses: string[] } {
  const aggregate = new Map<string, { total: number; count: number }>();
  for (const observation of observations) {
    for (const reading of observation.attributeReadings) {
      const current = aggregate.get(reading.attribute) ?? { total: 0, count: 0 };
      current.total += reading.perceivedValue;
      current.count += 1;
      aggregate.set(reading.attribute, current);
    }
  }

  const ranked = [...aggregate.entries()]
    .map(([attribute, value]) => ({
      attribute,
      average: value.total / Math.max(1, value.count),
      count: value.count,
    }))
    .sort((left, right) => right.average - left.average || right.count - left.count);

  const strengths = ranked.slice(0, 3).map((entry) => entry.attribute.replace(/([A-Z])/g, " $1").trim());
  const weaknesses = [...ranked]
    .reverse()
    .slice(0, 2)
    .map((entry) => entry.attribute.replace(/([A-Z])/g, " $1").trim());

  return {
    strengths: strengths.length > 0 ? strengths : ["Competitive mentality", "Technical base"],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["Needs another live sample"],
  };
}

function buildReportSubmission(candidate: ReportCandidate): {
  conviction: ConvictionLevel;
  summary: string;
  strengths: string[];
  weaknesses: string[];
} {
  const { strengths, weaknesses } = attributeSummary(candidate.observations);
  const conviction: ConvictionLevel = candidate.observations.length >= 6
    ? "strongRecommend"
    : "recommend";
  return {
    conviction,
    summary: `${candidate.player.firstName} ${candidate.player.lastName} now has ${candidate.observations.length} direct observations across varied contexts. The evidence base is strong enough for a professional recommendation and a clear next-action conversation.`,
    strengths,
    weaknesses,
  };
}

function authorReports(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  let state = store.gameState;
  if (!state) return;

  const maxReportsThisWeek = state.scout.careerPathChosen ? 2 : 1;
  const candidates = getReportCandidates(state).slice(0, maxReportsThisWeek);
  for (const candidate of candidates) {
    const beforeCount = Object.keys(state.reports).length;
    const submission = buildReportSubmission(candidate);
    store.startReport(candidate.playerId);
    store.submitReport(
      submission.conviction,
      submission.summary,
      submission.strengths,
      submission.weaknesses,
    );
    state = useGameStore.getState().gameState;
    if (!state) return;
    if (Object.keys(state.reports).length > beforeCount) {
      telemetry.authoredReports += 1;
    }
  }
}

function listingExistsForReport(listings: ReportListing[], reportId: string): boolean {
  return listings.some((listing) =>
    listing.reportId === reportId
    && (listing.status === "active" || (listing.isExclusive && listing.status === "sold"))
  );
}

function listingPriceForReport(report: ScoutReport): number {
  return Math.max(200, Math.round(report.qualityScore * 10));
}

function listFreshReports(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state || !state.finances || state.scout.careerPath !== "independent") return;

  const listings = state.finances.reportListings ?? [];
  const latestReports = selectLatestReportsByCase(Object.values(state.reports))
    .filter((report) => report.scoutId === state.scout.id)
    .filter((report) => report.qualityScore >= 45)
    .filter((report) => !listingExistsForReport(listings, report.id));

  for (const report of latestReports.slice(0, 2)) {
    store.listReportForSale(
      report.id,
      listingPriceForReport(report),
      false,
      report.intendedClubId,
    );
    telemetry.listedReports += 1;
  }

  if (store.pendingListingReportId) {
    store.dismissPendingListing();
  }
}

function chooseBestPendingBid(listing: ReportListing): {
  bid: MarketplaceBid;
  exclusiveUpgrade: boolean;
} | null {
  const pending = listing.bids.filter((bid) => bid.status === "pending");
  if (pending.length === 0) return null;

  const standard = pending
    .filter((bid) => !bid.isExclusiveUpgrade)
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id))[0];
  const upgrade = pending
    .filter((bid) => bid.isExclusiveUpgrade)
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id))[0];

  if (upgrade && (!standard || upgrade.amount >= standard.amount * 1.2)) {
    return { bid: upgrade, exclusiveUpgrade: true };
  }
  if (standard) {
    return { bid: standard, exclusiveUpgrade: false };
  }
  if (upgrade) {
    return { bid: upgrade, exclusiveUpgrade: true };
  }
  return null;
}

function resolveCommercialInbox(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state || !state.finances) return;

  for (const listing of state.finances.reportListings) {
    const choice = chooseBestPendingBid(listing);
    if (!choice) continue;
    if (choice.exclusiveUpgrade) {
      store.acceptExclusiveUpgradeBid(choice.bid.id);
      recordMeaningfulDecision(telemetry, "acceptedExclusiveUpgradeBids");
    } else {
      store.acceptMarketplaceBid(choice.bid.id);
      recordMeaningfulDecision(telemetry, "acceptedMarketplaceBids");
    }
  }
}

function resolveAgencyOffers(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state || !state.finances) return;

  const finances = state.finances;
  const activeRetainers = finances.retainerContracts.filter((contract) => contract.status === "active").length;
  const maxRetainers = state.scout.careerTier >= 4 ? 3 : state.scout.careerTier >= 3 ? 2 : 1;
  let accepted = activeRetainers;

  for (const contract of [...(finances.pendingRetainerOffers ?? [])]) {
    if (accepted < maxRetainers) {
      store.acceptRetainerContract(contract);
      accepted += 1;
      recordMeaningfulDecision(telemetry, "acceptedRetainerOffers");
    } else {
      store.declineRetainerOffer(contract.id);
      recordMeaningfulDecision(telemetry, "declinedRetainerOffers");
    }
  }

  for (const contract of [...(finances.pendingConsultingOffers ?? [])]) {
    store.declineConsultingOffer(contract.id);
    recordMeaningfulDecision(telemetry, "declinedConsultingOffers");
  }
}

function chooseCareerPathIfReady(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state || !state.finances) return;
  if (!canChooseCareerPath(state.scout, state.finances)) return;
  store.chooseCareerPath("independent");
  recordMeaningfulDecision(telemetry, "careerPathChoices");
}

function nextCourseToEnroll(state: GameState): string | null {
  if (!state.finances || state.finances.activeEnrollment) return null;
  const completed = new Set(state.finances.completedCourses);
  for (const courseId of COURSE_PRIORITY) {
    if (completed.has(courseId)) continue;
    const course = COURSE_CATALOG.find((candidate) => candidate.id === courseId);
    if (!course) continue;
    if (state.scout.careerTier < course.minTier) continue;
    if (course.prerequisites.some((prerequisite) => !completed.has(prerequisite))) continue;
    const reserve = state.scout.careerTier >= 3 ? 1_500 : 600;
    if ((state.finances.balance ?? 0) < course.cost + reserve) continue;
    return courseId;
  }
  return null;
}

function enrollCourseIfAffordable(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state) return;
  const courseId = nextCourseToEnroll(state);
  if (!courseId) return;
  const beforeEnrollment = state.finances?.activeEnrollment?.courseId;
  store.enrollInCourse(courseId);
  const afterState = useGameStore.getState().gameState;
  if (afterState?.finances?.activeEnrollment?.courseId === courseId && beforeEnrollment !== courseId) {
    recordMeaningfulDecision(telemetry, "coursesEnrolled");
  }
}

function resolveSeasonEvents(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  for (const event of store.getActiveSeasonEvents()) {
    if (!event.choices || event.choices.length === 0) continue;
    const choiceIndex = chooseSafeOptionIndex(event.choices);
    store.resolveSeasonEvent(event.id, choiceIndex);
    recordMeaningfulDecision(telemetry, "seasonEventChoices");
  }
}

function resolveNarrativeAndConsequenceChoices(telemetry: AutonomousCareerTelemetry): void {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state) return;

  if (state.openingCase?.stage === "decision") {
    store.resolveOpeningDiscoveryChoice("verify");
    recordMeaningfulDecision(telemetry, "openingChoices");
  }

  for (const event of store.getActiveNarrativeEvents()) {
    if (event.selectedChoice !== undefined) continue;
    if (event.choices && event.choices.length > 0) {
      const choiceIndex = chooseSafeOptionIndex(event.choices);
      store.resolveNarrativeEventChoice(event.id, choiceIndex);
      recordMeaningfulDecision(telemetry, "narrativeChoices");
    } else {
      store.acknowledgeNarrativeEvent(event.id);
      recordMeaningfulDecision(telemetry, "narrativeAcknowledgements");
    }
  }

  const refreshed = useGameStore.getState().gameState;
  if (!refreshed) return;
  const offeredDecisions = Object.values(refreshed.consequenceState.decisions)
    .filter((decision) => decision.status === "offered")
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const decision of offeredDecisions) {
    const option = chooseSafeDecisionOption(decision);
    store.resolveConsequenceDecision(decision.id, option.id);
    recordMeaningfulDecision(telemetry, "consequenceChoices");
  }
}

export async function driveAutonomousYouthCareerWeek(
  telemetry: AutonomousCareerTelemetry,
): Promise<void> {
  stabilizeAutonomousCareerState(telemetry);

  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state) {
    throw new Error("Autonomous driver lost game state before scheduling.");
  }

  clearWeekSchedule();
  store.setWeeklyIntent(chooseWeeklyIntent(state));
  store.setDelegationPolicy(chooseDelegationPolicy(state));
  store.autoSchedule(buildPriorities(state));
  ensureScheduledWork();

  const sourceSeason = useGameStore.getState().gameState?.currentSeason;
  const sourceWeek = useGameStore.getState().gameState?.currentWeek;
  store.startWeekSimulation();
  let sim = useGameStore.getState().weekSimulation;
  if (!sim) {
    throw new Error(
      `Autonomous driver failed to start simulation at S${sourceSeason} W${sourceWeek}.`,
    );
  }

  while (sim) {
    if (sim.currentDay >= sim.dayResults.length) break;
    const current = sim.dayResults[sim.currentDay];
    if (current?.interaction && !current.interaction.selectedOptionId) {
      const choice = chooseDayInteraction(current.activity, current.observations);
      store.chooseSimulationInteraction(choice.optionId, choice.focusedPlayerIds);
    }
    await store.advanceDay();
    sim = useGameStore.getState().weekSimulation;
  }

  const advancedState = useGameStore.getState().gameState;
  if (
    !advancedState
    || (
      advancedState.currentSeason === sourceSeason
      && advancedState.currentWeek === sourceWeek
    )
  ) {
    throw new Error(
      `Autonomous driver stalled at S${sourceSeason} W${sourceWeek}.`,
    );
  }

  telemetry.weeksDriven += 1;
}

export function stabilizeAutonomousCareerState(
  telemetry: AutonomousCareerTelemetry,
): void {
  resolveSeasonEvents(telemetry);
  resolveNarrativeAndConsequenceChoices(telemetry);
  authorReports(telemetry);
  chooseCareerPathIfReady(telemetry);
  listFreshReports(telemetry);
  resolveCommercialInbox(telemetry);
  resolveAgencyOffers(telemetry);
  enrollCourseIfAffordable(telemetry);
}

function countPendingMarketplaceBids(state: GameState): number {
  return (state.finances?.reportListings ?? []).reduce(
    (sum, listing) => sum + listing.bids.filter((bid) => bid.status === "pending").length,
    0,
  );
}

function countUnresolvedActionBacklog(state: GameState): number {
  const actionableInbox = reconcileInboxActionRequirements(state, 0)
    .filter((message) => message.actionRequired && !message.read)
    .length;
  const seasonEvents = getActiveSeasonEvents(state.seasonEvents, state.currentWeek)
    .filter((event) => (event.choices?.length ?? 0) > 0)
    .length;
  const narrativeChoices = state.narrativeEvents.filter((event) =>
    !event.acknowledged
    && event.selectedChoice === undefined
    && (event.choices?.length ?? 0) > 0
  ).length;
  const offeredDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered")
    .length;
  return actionableInbox
    + seasonEvents
    + narrativeChoices
    + offeredDecisions
    + countPendingMarketplaceBids(state)
    + (state.finances?.pendingRetainerOffers?.length ?? 0)
    + (state.finances?.pendingConsultingOffers?.length ?? 0)
    + (state.openingCase?.stage === "decision" ? 1 : 0);
}

export function collectAutonomousWorldHealth(
  state: GameState,
  telemetry: AutonomousCareerTelemetry,
): AutonomousWorldHealthSnapshot {
  const activePlayers = Object.keys(state.players).length;
  const freeAgents = state.freeAgentPool?.agents.length ?? 0;
  const activeLoans = state.activeLoans?.length ?? 0;
  return {
    season: state.currentSeason,
    activePlayers,
    unsignedYouth: Object.keys(state.unsignedYouth ?? {}).length,
    freeAgents,
    freeAgentRatio: round(freeAgents / Math.max(1, activePlayers + freeAgents)),
    activeLoans,
    activeLoanRatio: round(activeLoans / Math.max(1, activePlayers)),
    reports: Object.keys(state.reports).length,
    observations: Object.keys(state.observations).length,
    inboxMessages: state.inbox.length,
    financialBalance: state.finances?.balance ?? null,
    listedReports: state.finances?.reportListings.length ?? 0,
    pendingMarketplaceBids: countPendingMarketplaceBids(state),
    pendingRetainerOffers: state.finances?.pendingRetainerOffers?.length ?? 0,
    pendingConsultingOffers: state.finances?.pendingConsultingOffers?.length ?? 0,
    unresolvedActionBacklog: countUnresolvedActionBacklog(state),
    meaningfulDecisions: telemetry.meaningfulDecisions,
    careerTier: state.scout.careerTier,
    careerPath: state.scout.careerPath,
    careerPathChosen: state.scout.careerPathChosen === true,
    completedCourses: state.finances?.completedCourses.length ?? 0,
    activeRetainers: state.finances?.retainerContracts.filter((contract) => contract.status === "active").length ?? 0,
    activeConsultingContracts: state.finances?.consultingContracts.filter((contract) => contract.status === "active").length ?? 0,
  };
}

export function createAutonomousCareerTelemetry(): AutonomousCareerTelemetry {
  return createTelemetry();
}
