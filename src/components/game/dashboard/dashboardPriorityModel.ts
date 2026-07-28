import { countOpenScheduleDays, getScheduledActivityInstances } from "@/engine/core/calendar";
import {
  addGameWeeks,
  gameWeeksBetween,
  getSeasonLength,
} from "@/engine/core/gameDate";
import type {
  DashboardActionTarget,
  DashboardPriorityCandidate,
  DashboardPriorityCategory,
  DashboardPriorityCollector,
  DashboardPriorityItem,
  DashboardPriorityScoreFactor,
  DashboardPrioritySeverity,
  DashboardPrioritySourceSystem,
} from "@/engine/dashboard/types";
import { migrateDashboardState } from "@/engine/dashboard/state";
import {
  buildCareerStageQueue,
  deriveCareerStageProfile,
} from "@/engine/dashboard/careerStage";
import type {
  ActivityType,
  ClubDecision,
  GameState,
  InboxMessage,
  NarrativeEvent,
  ReportWorkItem,
  RivalScout,
  ScoutReport,
  ScoutingCase,
  WeekSchedule,
} from "@/engine/core/types";
import type { DecisionRecord } from "@/engine/consequences/types";
import {
  deriveRivalMarketPressure,
  getOpenRivalOrganizationOpportunities,
} from "@/engine/rivals/organizations";
import type { RivalCampaign } from "@/engine/rivals/campaigns";
import * as inboxActionAuthority from "@/engine/world/inboxActionAuthority";
import { getResolvedPlayerIds, resolvePlayerEntity } from "@/lib/playerResolution";
export type {
  DashboardActionTarget,
  DashboardPriorityCandidate,
  DashboardPriorityCategory,
  DashboardPriorityCollector,
  DashboardPriorityItem,
  DashboardPriorityScoreFactor,
  DashboardPrioritySeverity,
  DashboardPrioritySourceSystem,
} from "@/engine/dashboard/types";

export interface BuildDashboardPriorityModelInput {
  gameState: GameState;
  pendingListingReportId?: string | null;
  maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 5;

const COLLECTOR_PRECEDENCE: Record<DashboardPriorityCollector, number> = {
  inbox: 0,
  offered_decision: 1,
  narrative_event: 2,
  reports: 3,
  planner: 4,
  rivals: 5,
};

const CATEGORY_BASE_SCORE: Record<DashboardPriorityCategory, number> = {
  required_action: 100,
  deadline: 80,
  opportunity: 60,
  risk: 70,
  career_story: 40,
};

const OBSERVATION_ACTIVITY_TYPES = new Set<ActivityType>([
  "attendMatch",
  "watchVideo",
  "trainingVisit",
  "academyVisit",
  "youthTournament",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "followUpSession",
  "parentCoachMeeting",
  "reserveMatch",
  "scoutingMission",
  "oppositionAnalysis",
  "trialMatch",
  "agencyShowcase",
]);

type MaybeLiveInboxSelector = (state: GameState) => InboxMessage[];
type MaybeOfferedDecisionSelector = (state: GameState) => DecisionRecord[];
type MaybeNarrativeSelector = (state: GameState) => NarrativeEvent[];

function uniqueIds(ids: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of ids) {
    if (typeof value !== "string" || value.trim().length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatWeekSeason(week: number, season: number): string {
  return `S${season} W${week}`;
}

function getPlayerName(state: GameState, playerId: string): string {
  const player = resolvePlayerEntity(state, playerId)?.player;
  return player ? `${player.firstName} ${player.lastName}` : "Unknown player";
}

function weeksUntil(
  state: GameState,
  due: { season: number; week: number } | null | undefined,
): number | null {
  if (!due) return null;
  return gameWeeksBetween(
    state.fixtures,
    { season: state.currentSeason, week: state.currentWeek },
    due,
  );
}

function addScoreFactor(
  breakdown: DashboardPriorityScoreFactor[],
  factor: DashboardPriorityScoreFactor["factor"],
  score: number,
  note: string,
): void {
  if (score === 0) return;
  breakdown.push({ factor, score, note });
}

function buildScore(input: {
  category: DashboardPriorityCategory;
  dueInWeeks?: number | null;
  mustResolveBeforeAdvance?: boolean;
  rivalActive?: boolean;
  scarceOpening?: boolean;
  alreadyScheduled?: boolean;
}): { score: number; scoreBreakdown: DashboardPriorityScoreFactor[] } {
  const scoreBreakdown: DashboardPriorityScoreFactor[] = [];
  addScoreFactor(
    scoreBreakdown,
    "base_priority",
    CATEGORY_BASE_SCORE[input.category],
    `${formatLabel(input.category)} base priority.`,
  );
  if (input.mustResolveBeforeAdvance) {
    addScoreFactor(
      scoreBreakdown,
      "must_resolve_before_advance",
      100,
      "This blocks a live decision or the week flow until you address it.",
    );
  }
  if (input.dueInWeeks != null) {
    if (input.dueInWeeks <= 0) {
      addScoreFactor(
        scoreBreakdown,
        "deadline_this_week",
        60,
        "Deadline is this week or already at risk.",
      );
    } else if (input.dueInWeeks === 1) {
      addScoreFactor(
        scoreBreakdown,
        "deadline_next_week",
        30,
        "Deadline lands next week.",
      );
    }
  }
  if (input.rivalActive) {
    addScoreFactor(
      scoreBreakdown,
      "rival_active",
      35,
      "A rival is actively moving on the same target or pathway.",
    );
  }
  if (input.scarceOpening) {
    addScoreFactor(
      scoreBreakdown,
      "scarce_opening",
      25,
      "The window is time-limited and may disappear quickly.",
    );
  }
  if (input.alreadyScheduled) {
    addScoreFactor(
      scoreBreakdown,
      "already_scheduled",
      -40,
      "The responsibility is already on the planner, so it should not read as unowned.",
    );
  }
  return {
    score: scoreBreakdown.reduce((sum, factor) => sum + factor.score, 0),
    scoreBreakdown,
  };
}

function deriveSeverity(
  score: number,
  dueInWeeks: number | null | undefined,
  category: DashboardPriorityCategory,
): DashboardPrioritySeverity {
  if (category === "required_action" && dueInWeeks != null && dueInWeeks <= 0) return "critical";
  if (score >= 190) return "critical";
  if (score >= 125) return "high";
  if (score >= 75) return "medium";
  return "low";
}

function compareRank(left: DashboardPriorityCandidate, right: DashboardPriorityCandidate): number {
  const leftDue = left.dueInWeeks ?? Number.POSITIVE_INFINITY;
  const rightDue = right.dueInWeeks ?? Number.POSITIVE_INFINITY;
  return right.score - left.score
    || leftDue - rightDue
    || COLLECTOR_PRECEDENCE[left.collector] - COLLECTOR_PRECEDENCE[right.collector]
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id);
}

function normalizeCandidate(
  input: Omit<DashboardPriorityCandidate, "severity" | "score" | "scoreBreakdown"> & {
    mustResolveBeforeAdvance?: boolean;
    rivalActive?: boolean;
    scarceOpening?: boolean;
    alreadyScheduled?: boolean;
  },
): DashboardPriorityCandidate {
  const { score, scoreBreakdown } = buildScore({
    category: input.category,
    dueInWeeks: input.dueInWeeks,
    mustResolveBeforeAdvance: input.mustResolveBeforeAdvance,
    rivalActive: input.rivalActive,
    scarceOpening: input.scarceOpening,
    alreadyScheduled: input.alreadyScheduled,
  });
  return {
    ...input,
    severity: deriveSeverity(score, input.dueInWeeks, input.category),
    score,
    scoreBreakdown,
    mustResolve: Boolean(input.mustResolveBeforeAdvance),
    dismissible: !input.mustResolveBeforeAdvance,
    snoozable: !input.mustResolveBeforeAdvance,
    pinnable: true,
  };
}

function candidateFingerprint(candidate: DashboardPriorityCandidate): string {
  return candidate.fingerprint ?? [
    candidate.canonicalKey,
    candidate.category,
    candidate.severity,
    candidate.deadlineSeason ?? "",
    candidate.deadlineWeek ?? "",
    candidate.title,
    candidate.explanation,
    candidate.consequence ?? "",
  ].join("|");
}

function isAtOrPastDate(
  currentSeason: number,
  currentWeek: number,
  targetSeason?: number,
  targetWeek?: number,
): boolean {
  if (!targetWeek) return true;
  const season = targetSeason ?? currentSeason;
  return currentSeason > season || (currentSeason === season && currentWeek >= targetWeek);
}

function applyDashboardDisposition(
  state: GameState,
  candidate: DashboardPriorityCandidate,
): DashboardPriorityCandidate | null {
  const dashboardState = migrateDashboardState(state.dashboardState);
  const disposition = dashboardState.itemDispositions[candidate.id]
    ?? dashboardState.itemDispositions[candidate.canonicalKey];
  const fingerprint = candidateFingerprint(candidate);
  const isCritical =
    candidate.severity === "critical"
    || candidate.mustResolve
    || (candidate.dueInWeeks != null && candidate.dueInWeeks <= 0);
  const sameSituation = !disposition?.fingerprint || disposition.fingerprint === fingerprint;

  if (!isCritical && sameSituation && disposition) {
    if (disposition.state === "dismissed" || disposition.state === "resolved") return null;
    if (
      disposition.state === "snoozed"
      && !isAtOrPastDate(
        state.currentSeason,
        state.currentWeek,
        disposition.snoozedUntilSeason,
        disposition.snoozedUntilWeek,
      )
    ) return null;
  }

  let score = candidate.score;
  const scoreBreakdown = [...candidate.scoreBreakdown];
  if (
    sameSituation
    && disposition?.state === "viewed"
    && disposition.changedSeason === state.currentSeason
    && disposition.changedWeek === state.currentWeek
  ) {
    score -= 10;
    scoreBreakdown.push({
      factor: "viewed_this_week",
      score: -10,
      note: "Already reviewed this week.",
    });
  }
  if (!isCritical && disposition?.pinned) {
    score += 20;
    scoreBreakdown.push({
      factor: "pinned",
      score: 20,
      note: "Pinned by the player for continued attention.",
    });
  }

  return {
    ...candidate,
    score,
    scoreBreakdown,
    fingerprint,
    dismissible: !isCritical,
    snoozable: !isCritical,
    pinnable: true,
  };
}

function getScheduledPlayerIds(
  schedule: WeekSchedule,
  types?: ReadonlySet<ActivityType>,
): Set<string> {
  const scheduled = new Set<string>();
  for (const instance of getScheduledActivityInstances(schedule)) {
    if (!instance.activity.targetId) continue;
    if (types && !types.has(instance.activity.type)) continue;
    scheduled.add(instance.activity.targetId);
  }
  return scheduled;
}

function findPlacementReportByDecisionId(
  state: GameState,
  decisionId: string,
) {
  return Object.values(state.placementReports ?? {}).find((report) => report.decisionId === decisionId) ?? null;
}

function getReportForCase(state: GameState, scoutingCase: ScoutingCase): ScoutReport | null {
  const reportId = scoutingCase.activeReportId ?? scoutingCase.reportIds.at(-1);
  return reportId ? state.reports[reportId] ?? null : null;
}

function compareClubDecisionDate(left: ClubDecision, right: ClubDecision): number {
  return right.decidedSeason - left.decidedSeason
    || right.decidedWeek - left.decidedWeek
    || right.id.localeCompare(left.id);
}

function getLatestCaseDecision(
  state: GameState,
  scoutingCase: ScoutingCase,
): ClubDecision | null {
  const caseDecisionIds = new Set(scoutingCase.decisionIds ?? []);
  const decisions = Object.values(state.clubDecisions ?? {})
    .filter((decision) => decision.caseId === scoutingCase.id || caseDecisionIds.has(decision.id))
    .sort(compareClubDecisionDate);
  return decisions[0] ?? null;
}

function findInboxLinkedDecision(
  state: GameState,
  message: InboxMessage,
): DecisionRecord | undefined {
  if (!message.relatedId) return undefined;
  return Object.values(state.consequenceState?.decisions ?? {}).find((decision) =>
    decision.status === "offered"
    && (decision.id === message.relatedId || decision.source.id === message.relatedId)
  );
}

function isPlayerVisibleToScout(state: GameState, playerId: string): boolean {
  const resolvedIds = new Set(getResolvedPlayerIds(state, playerId));
  const discoveryCredits = new Set(state.scout.discoveryCredits ?? []);
  for (const id of resolvedIds) {
    if (discoveryCredits.has(id)) return true;
    if ((state.contactIntel?.[id]?.length ?? 0) > 0) return true;
  }

  const resolvedEntity = resolvePlayerEntity(state, playerId);
  if (resolvedEntity?.unsignedYouth?.discoveredBy.includes(state.scout.id)) return true;

  if (Object.values(state.observations ?? {}).some((observation) =>
    observation.scoutId === state.scout.id && resolvedIds.has(observation.playerId),
  )) {
    return true;
  }

  if (Object.values(state.reports ?? {}).some((report) =>
    report.scoutId === state.scout.id && resolvedIds.has(report.playerId),
  )) {
    return true;
  }

  return false;
}

function getLiveInboxActionMessages(state: GameState): InboxMessage[] {
  const selectors = inboxActionAuthority as Record<string, unknown>;
  const selectLiveInboxActionMessages = selectors.selectLiveInboxActionMessages as
    | MaybeLiveInboxSelector
    | undefined;
  if (typeof selectLiveInboxActionMessages === "function") {
    return selectLiveInboxActionMessages(state);
  }
  return inboxActionAuthority
    .reconcileInboxActionRequirements(state)
    .filter((message) => message.actionRequired);
}

function getOfferedCareerDecisions(state: GameState): DecisionRecord[] {
  const selectors = inboxActionAuthority as Record<string, unknown>;
  const selectOfferedInboxCareerDecisions = selectors.selectOfferedInboxCareerDecisions as
    | MaybeOfferedDecisionSelector
    | undefined;
  if (typeof selectOfferedInboxCareerDecisions === "function") {
    return selectOfferedInboxCareerDecisions(state);
  }
  return Object.values(state.consequenceState?.decisions ?? {})
    .filter((decision) => decision.status === "offered")
    .sort((left, right) =>
      left.deadlineAt.season - right.deadlineAt.season
      || left.deadlineAt.week - right.deadlineAt.week
      || left.id.localeCompare(right.id),
    );
}

function getActiveNarrativeEvents(state: GameState): NarrativeEvent[] {
  const selectors = inboxActionAuthority as Record<string, unknown>;
  const selectActiveInboxNarrativeEvents = selectors.selectActiveInboxNarrativeEvents as
    | MaybeNarrativeSelector
    | undefined;
  if (typeof selectActiveInboxNarrativeEvents === "function") {
    return selectActiveInboxNarrativeEvents(state);
  }
  return (state.narrativeEvents ?? [])
    .filter((event) =>
      (event.choices?.length ?? 0) > 0
      && event.selectedChoice === undefined
      && !event.resolved,
    )
    .sort((left, right) =>
      left.season - right.season
      || left.week - right.week
      || left.id.localeCompare(right.id),
    );
}

function inferSourceSystemFromDecision(decision: DecisionRecord): DashboardPrioritySourceSystem {
  switch (decision.source.kind) {
    case "rivalCampaign":
    case "rivalOrganization":
      return "rivals";
    case "stakeholder":
    case "relationshipConflict":
      return "relationships";
    case "report":
    case "scoutingCase":
      return "reports";
    default:
      return "career";
  }
}

function parseInboxDedupKey(message: InboxMessage): { canonicalKey: string; aliasKeys: string[] } {
  if (message.id.startsWith("report-work-ready-") && message.relatedId) {
    return {
      canonicalKey: `report-work:${message.relatedId}`,
      aliasKeys: [`report-player:${message.relatedId}`],
    };
  }
  if (message.id.startsWith("placement-follow-up-")) {
    const reportId = message.id.slice("placement-follow-up-".length);
    return {
      canonicalKey: `report-follow-up:${reportId}`,
      aliasKeys: uniqueIds([
        reportId ? `report:${reportId}` : null,
        message.relatedId ? `report-player:${message.relatedId}` : null,
      ]),
    };
  }
  if (message.id.startsWith("rival-organization-opportunity-") && message.relatedId) {
    return {
      canonicalKey: `rival-opportunity:${message.relatedId}`,
      aliasKeys: [],
    };
  }
  if (message.id.startsWith("rival-campaign-decision:") && message.relatedId) {
    return {
      canonicalKey: `decision:${message.relatedId}`,
      aliasKeys: uniqueIds([`decision-source:narrative:${message.relatedId}`]),
    };
  }
  if (message.relatedEntityType === "narrative" && message.relatedId) {
    return {
      canonicalKey: `decision-source:narrative:${message.relatedId}`,
      aliasKeys: uniqueIds([`narrative:${message.relatedId}`]),
    };
  }
  if (message.relatedEntityType && message.relatedId) {
    return {
      canonicalKey: `${message.relatedEntityType}:${message.relatedId}`,
      aliasKeys: [],
    };
  }
  return { canonicalKey: `inbox:${message.id}`, aliasKeys: [] };
}

function collectInboxCandidates(state: GameState): DashboardPriorityCandidate[] {
  return getLiveInboxActionMessages(state)
    .filter((message) => message.actionRequired)
    .map((message) => {
      const decision = findInboxLinkedDecision(state, message);
      const due = decision?.deadlineAt;
      const dueInWeeks = weeksUntil(state, due);
      const dedupe = parseInboxDedupKey(message);
      return normalizeCandidate({
        id: `dashboard-inbox-${message.id}`,
        collector: "inbox",
        category: due ? "deadline" : "required_action",
        title: message.title,
        explanation: message.body,
        consequence: due
          ? `The window closes by ${formatWeekSeason(due.week, due.season)}.`
          : "Leaving this in the inbox keeps a live decision unresolved.",
        deadlineWeek: due?.week,
        deadlineSeason: due?.season,
        dueInWeeks,
        relatedEntityIds: uniqueIds([message.id, message.relatedId]),
        sourceSystem: "inbox",
        actionLabel: "Open inbox",
        actionTarget: {
          screen: "inbox",
          messageId: message.id,
          decisionId: decision?.id,
          relatedId: message.relatedId,
        },
        canonicalKey: dedupe.canonicalKey,
        aliasKeys: dedupe.aliasKeys,
        mustResolveBeforeAdvance: true,
      });
    });
}

function collectOfferedDecisionCandidates(state: GameState): DashboardPriorityCandidate[] {
  return getOfferedCareerDecisions(state).map((decision) => {
    const dueInWeeks = weeksUntil(state, decision.deadlineAt);
    const sourceLabel = formatLabel(decision.source.kind);
    const optionLabels = decision.options.map((option) => option.label).filter(Boolean);
    return normalizeCandidate({
      id: `dashboard-decision-${decision.id}`,
      collector: "offered_decision",
      category: "required_action",
      title: `Decision waiting: ${sourceLabel}`,
      explanation: optionLabels.length > 0
        ? `${sourceLabel} is unresolved. Options on the table: ${optionLabels.join(", ")}.`
        : `${sourceLabel} is unresolved and remains a live career decision.`,
      consequence: `If you do nothing, the decision can expire on ${formatWeekSeason(decision.deadlineAt.week, decision.deadlineAt.season)}.`,
      deadlineWeek: decision.deadlineAt.week,
      deadlineSeason: decision.deadlineAt.season,
      dueInWeeks,
      relatedEntityIds: uniqueIds([decision.id, decision.source.id]),
      sourceSystem: inferSourceSystemFromDecision(decision),
      actionLabel: "Open inbox",
      actionTarget: {
        screen: "inbox",
        decisionId: decision.id,
        relatedId: decision.source.id,
      },
      canonicalKey: `decision:${decision.id}`,
      aliasKeys: uniqueIds([
        `decision-source:${decision.source.kind}:${decision.source.id}`,
        decision.source.id ? `${decision.source.kind}:${decision.source.id}` : null,
      ]),
      mustResolveBeforeAdvance: true,
    });
  });
}

function collectNarrativeEventCandidates(state: GameState): DashboardPriorityCandidate[] {
  return getActiveNarrativeEvents(state)
    .filter((event) =>
      (event.choices?.length ?? 0) > 0
      && event.selectedChoice === undefined
      && !event.resolved,
    )
    .map((event) => {
    const deadlineAt = event.decisionDeadlineWeeks != null
      ? addGameWeeks(
          state.fixtures,
          { season: event.season, week: event.week },
          Math.max(0, event.decisionDeadlineWeeks),
        )
      : undefined;
    return normalizeCandidate({
      id: `dashboard-narrative-${event.id}`,
      collector: "narrative_event",
      category: deadlineAt ? "deadline" : "required_action",
      title: event.title,
      explanation: event.description,
      consequence: deadlineAt
        ? `The choice window closes by ${formatWeekSeason(deadlineAt.week, deadlineAt.season)}.`
        : "The event stays live until you resolve it from the inbox.",
      deadlineWeek: deadlineAt?.week,
      deadlineSeason: deadlineAt?.season,
      dueInWeeks: weeksUntil(state, deadlineAt),
      relatedEntityIds: uniqueIds([event.id, ...event.relatedIds]),
      sourceSystem: "inbox",
      actionLabel: "Open inbox",
      actionTarget: {
        screen: "inbox",
        narrativeEventId: event.id,
        relatedId: event.id,
      },
      canonicalKey: `narrative:${event.id}`,
      aliasKeys: uniqueIds([`decision-source:narrative:${event.id}`]),
      mustResolveBeforeAdvance: true,
    });
    });
}

function collectReportCandidates(
  state: GameState,
  pendingListingReportId: string | null | undefined,
): DashboardPriorityCandidate[] {
  const reportPlanningTypes = new Set<ActivityType>([
    "writeReport",
    "writePlacementReport",
    "followUpSession",
    "parentCoachMeeting",
  ]);
  const scheduledReportPlayers = getScheduledPlayerIds(state.schedule, reportPlanningTypes);
  const candidates: DashboardPriorityCandidate[] = [];

  for (const workItem of Object.values(state.reportWorkItems ?? {})) {
    if (workItem.scoutId !== state.scout.id) continue;
    if (workItem.status !== "ready" || workItem.consumedByReportId) continue;
    const playerName = getPlayerName(state, workItem.playerId);
    const alreadyScheduled = scheduledReportPlayers.has(workItem.playerId);
    candidates.push(normalizeCandidate({
      id: `dashboard-report-work-${workItem.id}`,
      collector: "reports",
      category: "required_action",
      title: `Write the report on ${playerName}`,
      explanation: "Desk preparation is ready, but the recommendation still needs your authored judgment.",
      consequence: "Prepared notes do not count as a filed decision until you submit the report yourself.",
      relatedEntityIds: uniqueIds([workItem.id, workItem.playerId]),
      sourceSystem: "reports",
      actionLabel: alreadyScheduled ? "Review planner" : "Write report",
      actionTarget: alreadyScheduled
        ? {
            screen: "calendar",
            week: state.currentWeek,
            season: state.currentSeason,
            playerId: workItem.playerId,
            focusActivityType: "writeReport",
          }
        : {
            screen: "reportWriter",
            playerId: workItem.playerId,
            reportWorkItemId: workItem.id,
          },
      canonicalKey: workItem.id,
      aliasKeys: uniqueIds([`report-work:${workItem.playerId}`, `report-player:${workItem.playerId}`]),
      alreadyScheduled,
    }));
  }

  if (pendingListingReportId) {
    const pendingReport = state.reports[pendingListingReportId];
    if (pendingReport && pendingReport.scoutId === state.scout.id) {
      const playerName = getPlayerName(state, pendingReport.playerId);
      candidates.push(normalizeCandidate({
        id: `dashboard-pending-listing-${pendingReport.id}`,
        collector: "reports",
        category: "opportunity",
        title: `Price the ${playerName} report`,
        explanation: "A finished report is waiting for a marketplace decision on price, exclusivity, and route.",
        consequence: "Until you price it, the report cannot reach a buyer through the authoritative report workspace.",
        relatedEntityIds: uniqueIds([pendingReport.id, pendingReport.playerId, pendingReport.caseId]),
        sourceSystem: "reports",
        actionLabel: "Open report history",
        actionTarget: {
          screen: "reportHistory",
          reportId: pendingReport.id,
          playerId: pendingReport.playerId,
          pendingListingReportId: pendingReport.id,
        },
        canonicalKey: `report-listing:${pendingReport.id}`,
        aliasKeys: uniqueIds([`report:${pendingReport.id}`]),
        scarceOpening: true,
      }));
    }
  }

  for (const scoutingCase of Object.values(state.scoutingCases ?? {})) {
    if (scoutingCase.scoutId !== state.scout.id) continue;
    if (scoutingCase.status !== "reported" || scoutingCase.deliveryIds.length > 0) continue;
    const report = getReportForCase(state, scoutingCase);
    if (!report) continue;
    const playerName = getPlayerName(state, scoutingCase.playerId);
    const due = report.decisionDeadlineWeek != null && report.decisionDeadlineSeason != null
      ? { week: report.decisionDeadlineWeek, season: report.decisionDeadlineSeason }
      : null;
    const alreadyScheduled = scheduledReportPlayers.has(scoutingCase.playerId);
    candidates.push(normalizeCandidate({
      id: `dashboard-report-delivery-${scoutingCase.id}`,
      collector: "reports",
      category: due ? "deadline" : "required_action",
      title: `Deliver the ${playerName} case`,
      explanation: "The recommendation is authored, but it still has not reached its decision-maker.",
      consequence: due
        ? `Its current decision window closes by ${formatWeekSeason(due.week, due.season)}.`
        : "The case cannot create a club response while it stays undelivered.",
      deadlineWeek: due?.week,
      deadlineSeason: due?.season,
      dueInWeeks: weeksUntil(state, due),
      relatedEntityIds: uniqueIds([scoutingCase.id, report.id, scoutingCase.playerId, report.briefId]),
      sourceSystem: "reports",
      actionLabel: alreadyScheduled ? "Review planner" : "Open report history",
      actionTarget: alreadyScheduled
        ? {
            screen: "calendar",
            week: state.currentWeek,
            season: state.currentSeason,
            playerId: scoutingCase.playerId,
            briefId: report.briefId,
            focusActivityType: "writePlacementReport",
          }
        : {
            screen: "reportHistory",
            reportId: report.id,
            caseId: scoutingCase.id,
            playerId: scoutingCase.playerId,
          },
      canonicalKey: `report-delivery:${scoutingCase.id}`,
      aliasKeys: uniqueIds([
        report.id ? `report:${report.id}` : null,
        report.briefId ? `brief:${report.briefId}` : null,
      ]),
      alreadyScheduled,
    }));
  }

  for (const scoutingCase of Object.values(state.scoutingCases ?? {})) {
    if (scoutingCase.scoutId !== state.scout.id) continue;
    const decision = getLatestCaseDecision(state, scoutingCase);
    if (!decision) continue;
    if (decision.outcome !== "followUpRequested") continue;
    const due = decision.followUpDueWeek != null && decision.followUpDueSeason != null
      ? { week: decision.followUpDueWeek, season: decision.followUpDueSeason }
      : null;
    const report = decision.reportId
      ? state.reports[decision.reportId] ?? null
      : getReportForCase(state, scoutingCase);
    const playerId = report?.playerId ?? scoutingCase.playerId;
    if (!playerId) continue;
    const playerName = getPlayerName(state, playerId);
    const placementReport = findPlacementReportByDecisionId(state, decision.id);
    const alreadyScheduled = scheduledReportPlayers.has(playerId);
    const requestedCategory = decision.requestedEvidenceCategory
      ? formatLabel(decision.requestedEvidenceCategory)
      : "supporting evidence";
    candidates.push(normalizeCandidate({
      id: `dashboard-report-follow-up-${decision.id}`,
      collector: "reports",
      category: "deadline",
      title: `Follow up on ${playerName}`,
      explanation: `The club asked for clearer ${requestedCategory.toLowerCase()} before it will commit.`,
      consequence: due
        ? `The follow-up is due by ${formatWeekSeason(due.week, due.season)}.`
        : "The club will stay unconvinced until you answer the requested evidence gap.",
      deadlineWeek: due?.week,
      deadlineSeason: due?.season,
      dueInWeeks: weeksUntil(state, due),
      relatedEntityIds: uniqueIds([
        decision.id,
        decision.reportId,
        decision.caseId,
        playerId,
        placementReport?.id,
      ]),
      sourceSystem: "reports",
      actionLabel: alreadyScheduled ? "Review planner" : "Review report",
      actionTarget: alreadyScheduled
        ? {
            screen: "calendar",
            week: state.currentWeek,
            season: state.currentSeason,
            playerId,
            focusActivityType: "followUpSession",
          }
        : {
            screen: "reportHistory",
            reportId: decision.reportId,
            caseId: scoutingCase.id,
            decisionId: decision.id,
            playerId,
          },
      canonicalKey: `report-follow-up:${decision.id}`,
      aliasKeys: uniqueIds([
        decision.reportId ? `report:${decision.reportId}` : null,
        placementReport ? `report-follow-up:${placementReport.id}` : null,
        `report-player:${playerId}`,
      ]),
      alreadyScheduled,
    }));
  }

  return candidates;
}

function collectPlannerCandidate(state: GameState): DashboardPriorityCandidate[] {
  const openDays = countOpenScheduleDays(state.schedule);
  if (openDays <= 0) return [];
  const scheduledInstances = getScheduledActivityInstances(state.schedule);
  const scheduledObservationCount = scheduledInstances.filter((instance) =>
    OBSERVATION_ACTIVITY_TYPES.has(instance.activity.type),
  ).length;
  return [normalizeCandidate({
    id: `dashboard-planner-gap-s${state.currentSeason}w${state.currentWeek}`,
    collector: "planner",
    category: "required_action",
    title: openDays === 1
      ? "1 day is still unallocated this week"
      : `${openDays} days are still unallocated this week`,
    explanation: scheduledObservationCount > 0
      ? `You already have ${scheduledObservationCount} observation block${scheduledObservationCount === 1 ? "" : "s"} booked, but unused planner space still leaves attention on the table.`
      : "The current week still has no complete plan, so your next evidence and recovery tradeoffs remain undefined.",
    consequence: "Unused planner space turns into lost attention when the week advances.",
    relatedEntityIds: [],
    sourceSystem: "planner",
    actionLabel: "Open planner",
    actionTarget: {
      screen: "calendar",
      week: state.currentWeek,
      season: state.currentSeason,
    },
    canonicalKey: `planner-gap:s${state.currentSeason}:w${state.currentWeek}`,
    aliasKeys: [],
    mustResolveBeforeAdvance: true,
  })];
}

function getActiveRivalCampaigns(state: GameState): RivalCampaign[] {
  return Object.values(state.rivalOrganizationState?.campaignState?.campaigns ?? {})
    .filter((campaign) => campaign.status === "active")
    .sort((left, right) => {
      const leftDue = left.responseDueAt
        ? (weeksUntil(state, left.responseDueAt) ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const rightDue = right.responseDueAt
        ? (weeksUntil(state, right.responseDueAt) ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      return leftDue - rightDue
        || left.id.localeCompare(right.id);
    });
}

function collectRivalCandidates(state: GameState): DashboardPriorityCandidate[] {
  const candidates: DashboardPriorityCandidate[] = [];

  for (const opportunity of getOpenRivalOrganizationOpportunities(state.rivalOrganizationState)) {
    candidates.push(normalizeCandidate({
      id: `dashboard-rival-opportunity-${opportunity.id}`,
      collector: "rivals",
      category: "opportunity",
      title: opportunity.title,
      explanation: opportunity.description,
      consequence: `The opening expires by ${formatWeekSeason(opportunity.expiresWeek, opportunity.expiresSeason)}.`,
      deadlineWeek: opportunity.expiresWeek,
      deadlineSeason: opportunity.expiresSeason,
      dueInWeeks: weeksUntil(state, {
        season: opportunity.expiresSeason,
        week: opportunity.expiresWeek,
      }),
      relatedEntityIds: uniqueIds([opportunity.id, opportunity.relatedPlayerId, opportunity.organizationId]),
      sourceSystem: "rivals",
      actionLabel: "Open rivals",
      actionTarget: {
        screen: "rivals",
        opportunityId: opportunity.id,
        playerId: opportunity.relatedPlayerId,
      },
      canonicalKey: `rival-opportunity:${opportunity.id}`,
      aliasKeys: [],
      rivalActive: true,
      scarceOpening: true,
    }));
  }

  for (const campaign of getActiveRivalCampaigns(state)) {
    if (campaign.phase !== "contest" && campaign.phase !== "response") continue;
    const signal = campaign.visibleSignals[0];
    candidates.push(normalizeCandidate({
      id: `dashboard-rival-campaign-${campaign.id}`,
      collector: "rivals",
      category: campaign.phase === "response" ? "required_action" : "risk",
      title: signal?.headline ?? "A rival campaign is active",
      explanation: signal?.detail ?? `A rival campaign is building around ${campaign.target.label}.`,
      consequence: campaign.responseDueAt
        ? `The response window closes by ${formatWeekSeason(campaign.responseDueAt.week, campaign.responseDueAt.season)}.`
        : "If you wait, the rival keeps the initiative on this pressure point.",
      deadlineWeek: campaign.responseDueAt?.week,
      deadlineSeason: campaign.responseDueAt?.season,
      dueInWeeks: weeksUntil(state, campaign.responseDueAt),
      relatedEntityIds: uniqueIds([campaign.id, campaign.responseDecisionId, campaign.relatedPlayerId, campaign.organizationId]),
      sourceSystem: "rivals",
      actionLabel: "Open rivals",
      actionTarget: {
        screen: "rivals",
        campaignId: campaign.id,
        playerId: campaign.relatedPlayerId,
      },
      canonicalKey: `rival-campaign:${campaign.id}`,
      aliasKeys: uniqueIds([
        campaign.responseDecisionId ? `decision:${campaign.responseDecisionId}` : null,
      ]),
      mustResolveBeforeAdvance: campaign.phase === "response",
      rivalActive: true,
    }));
  }

  const contestedPlayerIds = new Set<string>();
  for (const rival of Object.values(state.rivalScouts ?? {}) as RivalScout[]) {
    if (rival.currentTarget) contestedPlayerIds.add(rival.currentTarget);
    for (const playerId of rival.competingForPlayers ?? []) {
      contestedPlayerIds.add(playerId);
    }
    for (const playerId of rival.targetPlayerIds ?? []) {
      contestedPlayerIds.add(playerId);
    }
  }
  for (const playerId of contestedPlayerIds) {
    if (!isPlayerVisibleToScout(state, playerId)) continue;
    const pressure = deriveRivalMarketPressure(state, playerId);
    if (pressure.band !== "contested" && pressure.band !== "closing") continue;
    candidates.push(normalizeCandidate({
      id: `dashboard-rival-pressure-${playerId}`,
      collector: "rivals",
      category: pressure.band === "closing" ? "opportunity" : "risk",
      title: `${getPlayerName(state, playerId)} is under rival pressure`,
      explanation: pressure.reasons[0] ?? "Rival scouts are materially involved on this player.",
      consequence: pressure.band === "closing"
        ? "If you wait, the market can close before you strengthen your position."
        : "The longer you wait, the easier it becomes for another desk to control the story.",
      relatedEntityIds: uniqueIds([playerId, ...pressure.watchers.map((watcher) => watcher.rivalId)]),
      sourceSystem: "rivals",
      actionLabel: "Open player",
      actionTarget: {
        screen: "playerProfile",
        playerId,
      },
      canonicalKey: `rival-market:${playerId}`,
      aliasKeys: [],
      rivalActive: true,
      scarceOpening: pressure.band === "closing",
    }));
  }

  return candidates;
}

function dedupeCandidates(candidates: DashboardPriorityCandidate[]): DashboardPriorityCandidate[] {
  const usedKeys = new Set<string>();
  const dedupeOrder = [...candidates].sort((left, right) =>
    COLLECTOR_PRECEDENCE[left.collector] - COLLECTOR_PRECEDENCE[right.collector]
    || compareRank(left, right),
  );
  const result: DashboardPriorityCandidate[] = [];
  for (const candidate of dedupeOrder) {
    const dedupeKeys = [candidate.canonicalKey, ...candidate.aliasKeys];
    if (dedupeKeys.some((key) => usedKeys.has(key))) continue;
    result.push(candidate);
    for (const key of dedupeKeys) usedKeys.add(key);
  }
  return result;
}

export function buildDashboardPriorityCandidates(
  input: BuildDashboardPriorityModelInput,
): DashboardPriorityCandidate[] {
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const allCandidates = [
    ...collectInboxCandidates(input.gameState),
    ...collectOfferedDecisionCandidates(input.gameState),
    ...collectNarrativeEventCandidates(input.gameState),
    ...collectReportCandidates(input.gameState, input.pendingListingReportId),
    ...collectPlannerCandidate(input.gameState),
    ...collectRivalCandidates(input.gameState),
  ];
  const dispositionAware = dedupeCandidates(allCandidates)
    .map((candidate) => applyDashboardDisposition(input.gameState, candidate))
    .filter((candidate): candidate is DashboardPriorityCandidate => candidate !== null)
    .sort(compareRank);
  const adaptiveQueue = buildCareerStageQueue(
    dispositionAware,
    deriveCareerStageProfile(input.gameState),
    Math.max(0, maxItems),
  );
  return adaptiveQueue.selected.map(({ candidate, adjustedScore, track, scoreDelta }) => ({
    ...candidate,
    careerTrack: track === "planner" || track === "unknown" ? "craft" : track,
    score: adjustedScore,
    scoreBreakdown: scoreDelta === 0
      ? candidate.scoreBreakdown
      : [
          ...candidate.scoreBreakdown,
          {
            factor: "career_stage_fit" as const,
            score: scoreDelta,
            note: `Adjusted for the current career stage and ${track} responsibilities.`,
          },
        ],
  })).sort(compareRank);
}

export function buildDashboardPriorityItems(
  input: BuildDashboardPriorityModelInput,
): DashboardPriorityItem[] {
  return buildDashboardPriorityCandidates(input).map((candidate) => ({
    id: candidate.id,
    category: candidate.category,
    severity: candidate.severity,
    title: candidate.title,
    explanation: candidate.explanation,
    consequence: candidate.consequence,
    deadlineWeek: candidate.deadlineWeek,
    relatedEntityIds: candidate.relatedEntityIds,
    sourceSystem: candidate.sourceSystem,
    actionLabel: candidate.actionLabel,
    actionTarget: candidate.actionTarget,
  }));
}

export interface DashboardWeekSummary {
  headline: string;
  availableAttentionDays: number;
  plannedObservationCount: number;
  plannedReportCount: number;
  travelSummary: string;
  unallocatedDays: number;
  actionLabel: string;
  actionTarget: Extract<DashboardActionTarget, { screen: "calendar" }>;
}

export function buildDashboardWeekSummary(
  state: GameState,
): DashboardWeekSummary {
  const openDays = countOpenScheduleDays(state.schedule);
  const instances = getScheduledActivityInstances(state.schedule);
  const plannedObservationCount = instances.filter((instance) =>
    OBSERVATION_ACTIVITY_TYPES.has(instance.activity.type),
  ).length;
  const plannedReportCount = instances.filter((instance) =>
    instance.activity.type === "writeReport" || instance.activity.type === "writePlacementReport",
  ).length;
  const travelBooking = state.scout.travelBooking;
  const travelSummary = travelBooking?.isAbroad
    ? `Abroad in ${travelBooking.destinationCountry} until week ${travelBooking.returnWeek}.`
    : travelBooking
      ? `Travel booked for ${travelBooking.destinationCountry} from week ${travelBooking.departureWeek} to week ${travelBooking.returnWeek}.`
      : "No travel conflict recorded.";

  return {
    headline: openDays === 0
      ? "This week is fully committed."
      : `${openDays} ${openDays === 1 ? "day" : "days"} of attention still need a plan.`,
    availableAttentionDays: openDays,
    plannedObservationCount,
    plannedReportCount,
    travelSummary,
    unallocatedDays: openDays,
    actionLabel: openDays > 0 ? "Open planner" : "Review planner",
    actionTarget: {
      screen: "calendar",
      week: state.currentWeek,
      season: state.currentSeason,
    },
  };
}

export function getCurrentSeasonLength(state: GameState): number {
  return getSeasonLength(state.fixtures, state.currentSeason);
}
