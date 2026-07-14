import type {
  CareerTier,
  GameState,
  InboxMessage,
  WeekSchedule,
} from "../core/types";
import { addGameWeeks, getSeasonLength } from "../core/gameDate";
import {
  createDecisionRecord,
  registerDecision,
  selectDecisionOption,
  compareGameDates,
} from "../consequences/decisionLedger";
import { createRNG } from "../rng";
import { generateJobOffersForTier } from "./progression";
import {
  getReportCaseKey,
  selectLatestReportsByCase,
} from "../reports/reportAccountability";

export type CareerSetbackKind = "warning" | "firing" | "bankruptcy";
export type CareerRecoveryPlanId =
  | "proveTheWork"
  | "rebuildTheNetwork"
  | "stepBack";
export type CareerRecoveryStatus =
  | "awaitingChoice"
  | "active"
  | "completed"
  | "failed";

export interface CareerRecoveryEpisode {
  id: string;
  decisionId: string;
  kind: CareerSetbackKind;
  previousTier: CareerTier;
  previousClubId?: string;
  triggeredWeek: number;
  triggeredSeason: number;
  choiceDueWeek: number;
  choiceDueSeason: number;
  status: CareerRecoveryStatus;
  planId?: CareerRecoveryPlanId;
  selectedWeek?: number;
  selectedSeason?: number;
  deadlineWeek?: number;
  deadlineSeason?: number;
  target: number;
  progress: number;
  /** Distinct players, contacts, or quiet-week dates that actually advanced the plan. */
  progressSourceIds: string[];
  /** Reports that existed before the setback cannot be recycled into a comeback. */
  baselineReportIds: string[];
  /** Stable case identities present before the setback; IDs alone miss later revisions. */
  baselineReportCaseKeys?: string[];
  resolvedWeek?: number;
  resolvedSeason?: number;
  outcomeSummary?: string;
  comebackOfferId?: string;
}

export interface CareerRecoveryState {
  version: 1;
  current?: CareerRecoveryEpisode;
  history: CareerRecoveryEpisode[];
}

export interface CareerRecoveryPlanOption {
  id: CareerRecoveryPlanId;
  label: string;
  description: string;
  tradeoffs: string[];
  target: number;
  targetLabel: string;
  available: boolean;
  unavailableReason?: string;
}

export interface OpenCareerSetbackInput {
  kind: CareerSetbackKind;
  previousTier?: CareerTier;
  previousClubId?: string;
}

export interface ChooseCareerRecoveryResult {
  state: GameState;
  accepted: boolean;
  reason?: string;
}

const RECOVERY_HISTORY_LIMIT = 8;
const QUALIFYING_REPORT_SCORE = 70;

function reportCaseKeys(state: GameState): string[] {
  return [...new Set(
    Object.values(state.reports ?? {}).map(getReportCaseKey),
  )].sort();
}

export function createCareerRecoveryState(
  partial: Partial<CareerRecoveryState> = {},
): CareerRecoveryState {
  return {
    version: 1,
    current: partial.current ? { ...partial.current } : undefined,
    history: [...(partial.history ?? [])].slice(-RECOVERY_HISTORY_LIMIT),
  };
}

function currentRecoveryState(state: GameState): CareerRecoveryState {
  return createCareerRecoveryState(state.careerRecovery);
}

function isTerminal(episode: CareerRecoveryEpisode): boolean {
  return episode.status === "completed" || episode.status === "failed";
}

function setbackTitle(kind: CareerSetbackKind): string {
  if (kind === "warning") return "Performance plan required";
  if (kind === "bankruptcy") return "Choose how to rebuild";
  return "Your comeback starts here";
}

function setbackBody(kind: CareerSetbackKind, tier: CareerTier): string {
  const stage = tier >= 4 ? "At leadership level, the response will become part of your legacy." : "The next few weeks will shape which doors reopen.";
  if (kind === "warning") {
    return `The warning is now a playable performance plan, not a passive penalty. Choose whether to rebuild through evidence, stakeholder trust, or reduced scope. ${stage}`;
  }
  if (kind === "bankruptcy") {
    return `The business has failed, but the career is not over. Choose a recovery route now; normal work and any comeback offer remain constrained until the mandatory financial cooldown ends. ${stage}`;
  }
  return `Your employment ended, but your record remains. Choose a recovery route: prove your judgment again, call on distinct relationships, or accept a slower step back. ${stage}`;
}

function actionMessage(
  state: GameState,
  episode: CareerRecoveryEpisode,
): InboxMessage {
  return {
    id: `career-recovery-choice:${episode.id}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: setbackTitle(episode.kind),
    body: setbackBody(episode.kind, episode.previousTier),
    read: false,
    actionRequired: true,
    relatedId: episode.id,
  };
}

function stableRoll(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function getCareerRecoveryPlanOptions(
  state: GameState,
  episode = currentRecoveryState(state).current,
): CareerRecoveryPlanOption[] {
  if (!episode) return [];
  const lateCareer = episode.previousTier >= 4;
  const evidenceTarget = lateCareer ? 4 : 3;
  const contactCount = Object.keys(state.contacts ?? {}).length;
  const networkTarget = Math.min(lateCareer ? 3 : 2, contactCount);
  const quietWeekTarget = lateCareer ? 6 : 4;

  return [
    {
      id: "proveTheWork",
      label: lateCareer ? "Put your judgment on trial" : "Prove the work",
      description: `File ${evidenceTarget} high-quality reports on different players. Only new, accountable work scoring ${QUALIFYING_REPORT_SCORE}+ counts.`,
      tradeoffs: [
        "Fastest route back to the level you lost",
        "Consumes observation and report-writing time",
        "Missing the deadline creates a second public failure",
      ],
      target: evidenceTarget,
      targetLabel: `${evidenceTarget} distinct ${QUALIFYING_REPORT_SCORE}+ reports`,
      available: true,
    },
    {
      id: "rebuildTheNetwork",
      label: "Rebuild through relationships",
      description: networkTarget > 0
        ? `Hold substantive meetings with ${networkTarget} different contacts. Repeating the same friendly conversation does not count twice.`
        : "Use trusted contacts to rebuild access and credibility.",
      tradeoffs: [
        "Slower reputation recovery but a safer employment tier",
        "Uses scarce weekly slots and depends on a broad network",
        "The people you approach become part of the recovery record",
      ],
      target: networkTarget,
      targetLabel: `${networkTarget} distinct contact meetings`,
      available: networkTarget > 0,
      unavailableReason: networkTarget > 0 ? undefined : "You need at least one contact before this route is credible.",
    },
    {
      id: "stepBack",
      label: lateCareer ? "Take a real sabbatical" : "Reduce the scope",
      description: `Complete ${quietWeekTarget} quiet weeks containing only rest or no scheduled work. Working through the break does not advance it.`,
      tradeoffs: [
        "Guaranteed fatigue recovery and no craft target",
        "Costs 3 reputation immediately",
        "Any return offer will be below the level you lost",
      ],
      target: quietWeekTarget,
      targetLabel: `${quietWeekTarget} genuinely quiet weeks`,
      available: true,
    },
  ];
}

export function openCareerSetback(
  state: GameState,
  input: OpenCareerSetbackInput,
): GameState {
  const recovery = currentRecoveryState(state);
  const previousTier = input.previousTier ?? state.scout.careerTier;
  const id = `career-recovery:${input.kind}:s${state.currentSeason}w${state.currentWeek}:${state.scout.id}`;
  if (recovery.current?.id === id) return state;

  const history = [...recovery.history];
  if (recovery.current) {
    history.push(isTerminal(recovery.current)
      ? recovery.current
      : {
          ...recovery.current,
          status: "failed",
          resolvedWeek: state.currentWeek,
          resolvedSeason: state.currentSeason,
          outcomeSummary: "A new career crisis overtook the unfinished recovery plan.",
        });
  }

  const choiceDue = addGameWeeks(
    state.fixtures,
    { week: state.currentWeek, season: state.currentSeason },
    2,
  );
  const decisionId = `decision:${id}`;
  const episode: CareerRecoveryEpisode = {
    id,
    decisionId,
    kind: input.kind,
    previousTier,
    previousClubId: input.previousClubId,
    triggeredWeek: state.currentWeek,
    triggeredSeason: state.currentSeason,
    choiceDueWeek: choiceDue.week,
    choiceDueSeason: choiceDue.season,
    status: "awaitingChoice",
    target: 0,
    progress: 0,
    progressSourceIds: [],
    baselineReportIds: Object.keys(state.reports ?? {}),
    baselineReportCaseKeys: reportCaseKeys(state),
  };
  const options = getCareerRecoveryPlanOptions(state, episode);
  const decision = createDecisionRecord({
    id: decisionId,
    source: { kind: "careerSetback", id },
    offeredAt: { week: state.currentWeek, season: state.currentSeason },
    deadlineAt: choiceDue,
    visibility: input.kind === "warning" ? "stakeholders" : "public",
    stakeholders: input.previousClubId
      ? [{ kind: "club", id: input.previousClubId }]
      : [],
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      knownTradeoffs: option.tradeoffs,
      immediateEffects: [],
      scheduledConsequences: [],
    })),
    defaultOptionId: "stepBack",
    outcomeRoll: stableRoll(`${state.seed}:${decisionId}`),
    metadata: {
      title: setbackTitle(input.kind),
      setbackKind: input.kind,
      previousTier,
    },
  });
  const registered = registerDecision(state.consequenceState, decision);
  const clearOffers = input.kind !== "warning";
  const pendingOfferIds = new Set(state.jobOffers.map((offer) => offer.id));

  return {
    ...state,
    careerRecovery: {
      version: 1,
      current: episode,
      history: history.slice(-RECOVERY_HISTORY_LIMIT),
    },
    consequenceState: registered.state,
    jobOffers: clearOffers ? [] : state.jobOffers,
    inbox: [
      ...state.inbox.map((message) =>
        clearOffers && message.relatedId && pendingOfferIds.has(message.relatedId)
          ? { ...message, read: true, actionRequired: false }
          : message,
      ),
      actionMessage(state, episode),
    ],
  };
}

function planDurationWeeks(planId: CareerRecoveryPlanId, previousTier: CareerTier): number {
  const lateCareer = previousTier >= 4;
  if (planId === "proveTheWork") return lateCareer ? 18 : 14;
  if (planId === "rebuildTheNetwork") return lateCareer ? 14 : 10;
  return lateCareer ? 12 : 8;
}

export function chooseCareerRecoveryPlan(
  state: GameState,
  planId: CareerRecoveryPlanId,
  selectionKind: "player" | "default" = "player",
): ChooseCareerRecoveryResult {
  const recovery = currentRecoveryState(state);
  const episode = recovery.current;
  if (!episode || episode.status !== "awaitingChoice") {
    return { state, accepted: false, reason: "There is no unresolved career recovery choice." };
  }
  const option = getCareerRecoveryPlanOptions(state, episode).find((candidate) => candidate.id === planId);
  if (!option) return { state, accepted: false, reason: "Unknown recovery plan." };
  if (!option.available) return { state, accepted: false, reason: option.unavailableReason };

  const selectedAt = selectionKind === "default"
    ? { week: episode.choiceDueWeek, season: episode.choiceDueSeason }
    : { week: state.currentWeek, season: state.currentSeason };
  const selected = selectDecisionOption(
    state.consequenceState,
    episode.decisionId,
    planId,
    selectedAt,
    selectionKind,
  );
  if (selected.error) {
    return { state, accepted: false, reason: selected.error };
  }
  const bankruptcyDelay = episode.kind === "bankruptcy"
    ? state.finances?.bankruptcyRecoveryCooldown ?? 0
    : 0;
  const deadline = addGameWeeks(
    state.fixtures,
    { week: state.currentWeek, season: state.currentSeason },
    planDurationWeeks(planId, episode.previousTier) + bankruptcyDelay,
  );
  const reputationCost = planId === "stepBack" ? 3 : 0;
  const selectedEpisode: CareerRecoveryEpisode = {
    ...episode,
    status: "active",
    planId,
    selectedWeek: state.currentWeek,
    selectedSeason: state.currentSeason,
    deadlineWeek: deadline.week,
    deadlineSeason: deadline.season,
    target: option.target,
    progress: 0,
    progressSourceIds: [],
    baselineReportIds: Object.keys(state.reports ?? {}),
    baselineReportCaseKeys: reportCaseKeys(state),
  };
  const choiceMessageId = `career-recovery-choice:${episode.id}`;
  const selectedMessage: InboxMessage = {
    id: `career-recovery-selected:${episode.id}:${planId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: `${option.label} selected`,
    body: `${option.targetLabel}. Deadline: Season ${deadline.season}, Week ${deadline.week}.${bankruptcyDelay > 0 ? ` The ${bankruptcyDelay}-week financial cooldown must also finish before your comeback can resolve.` : ""}`,
    read: false,
    actionRequired: false,
    relatedId: episode.id,
  };

  return {
    accepted: true,
    state: {
      ...state,
      scout: {
        ...state.scout,
        reputation: Math.max(0, state.scout.reputation - reputationCost),
      },
      consequenceState: selected.state,
      careerRecovery: { ...recovery, current: selectedEpisode },
      inbox: [
        ...state.inbox.map((message) =>
          message.id === choiceMessageId
            ? { ...message, read: true, actionRequired: false }
            : message,
        ),
        selectedMessage,
      ],
    },
  };
}

function quietSchedule(schedule: WeekSchedule): boolean {
  return schedule.activities.every((activity) => !activity || activity.type === "rest");
}

function recoveryOfferTier(episode: CareerRecoveryEpisode, succeeded: boolean): CareerTier {
  if (episode.kind === "bankruptcy") {
    const bankruptcyDrop = succeeded && episode.planId === "proveTheWork"
      ? 1
      : succeeded && episode.planId === "rebuildTheNetwork"
        ? 2
        : 3;
    return Math.max(2, episode.previousTier - bankruptcyDrop) as CareerTier;
  }
  if (succeeded && episode.planId === "proveTheWork") return Math.max(2, episode.previousTier) as CareerTier;
  const drop = succeeded && episode.planId === "rebuildTheNetwork" ? 1 : 2;
  return Math.max(2, episode.previousTier - drop) as CareerTier;
}

function generateComebackOffer(
  state: GameState,
  episode: CareerRecoveryEpisode,
  succeeded: boolean,
) {
  if (episode.kind === "warning" || state.scout.currentClubId) return undefined;
  const withoutFormerEmployer = Object.fromEntries(
    Object.entries(state.clubs).filter(([clubId]) => clubId !== episode.previousClubId),
  );
  const candidates = Object.keys(withoutFormerEmployer).length > 0
    ? withoutFormerEmployer
    : state.clubs;
  const targetTier = recoveryOfferTier(episode, succeeded);
  const offer = generateJobOffersForTier(
    createRNG(`${state.seed}:${episode.id}:${succeeded ? "success" : "failure"}:offer`),
    state.scout,
    candidates,
    state.currentSeason,
    targetTier,
  )[0];
  if (!offer) return undefined;
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  return {
    ...offer,
    // The normal generator is tuned for season-end reviews. A recovery can
    // finish in any week, so never create an offer whose deadline has already
    // passed before the player sees it.
    expiresWeek: Math.max(
      offer.expiresWeek,
      Math.min(seasonLength, state.currentWeek + 3),
    ),
  };
}

function recoveryFact(
  state: GameState,
  episode: CareerRecoveryEpisode,
  status: "completed" | "failed",
) {
  return {
    id: `career-recovery-fact:${episode.id}:${status}`,
    kind: "careerRecoveryOutcome",
    subject: { kind: "scout", id: state.scout.id },
    value: {
      setbackKind: episode.kind,
      planId: episode.planId ?? "none",
      status,
      previousTier: episode.previousTier,
    },
    observedAt: { week: state.currentWeek, season: state.currentSeason },
    visibility: episode.kind === "warning" ? "stakeholders" as const : "public" as const,
    sourceDecisionId: episode.decisionId,
  };
}

function resolveRecovery(
  state: GameState,
  episode: CareerRecoveryEpisode,
  succeeded: boolean,
): GameState {
  const status = succeeded ? "completed" : "failed";
  const reputationDelta = succeeded
    ? episode.planId === "proveTheWork" ? 8 : episode.planId === "rebuildTheNetwork" ? 5 : 0
    : -3;
  const clubTrustDelta = episode.kind === "warning"
    ? succeeded ? (episode.planId === "proveTheWork" ? 8 : 5) : -10
    : 0;
  const fatigue = succeeded && episode.planId === "stepBack"
    ? Math.min(state.scout.fatigue, 20)
    : state.scout.fatigue;
  const offer = generateComebackOffer(state, episode, succeeded);
  const summary = succeeded
    ? episode.kind === "warning"
      ? "You answered the warning with a completed plan. The club has recorded the recovery, not only the original failure."
      : offer
        ? `Your recovery produced a concrete comeback opportunity at Tier ${offer.tier}.`
        : "Your recovery is now part of the permanent career record, even though no suitable club opening exists this week."
    : episode.kind === "warning"
      ? "The performance plan expired unfinished. Club trust and reputation have fallen, but the career remains playable."
      : offer
        ? `The plan failed, but a lower-tier club is willing to offer one last route back.`
        : "The plan failed. You remain independent and can rebuild through normal work, but no club has offered an immediate route back.";
  const resolvedEpisode: CareerRecoveryEpisode = {
    ...episode,
    status,
    resolvedWeek: state.currentWeek,
    resolvedSeason: state.currentSeason,
    outcomeSummary: summary,
    comebackOfferId: offer?.id,
  };
  const fact = recoveryFact(state, resolvedEpisode, status);
  const outcomeMessage: InboxMessage = {
    id: `career-recovery-outcome:${episode.id}:${status}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: offer ? "jobOffer" : "feedback",
    title: succeeded ? "Career recovery complete" : "Recovery plan missed",
    body: summary,
    read: false,
    actionRequired: Boolean(offer),
    relatedId: offer?.id ?? episode.id,
    relatedEntityType: offer ? "jobOffer" : undefined,
  };

  return {
    ...state,
    scout: {
      ...state.scout,
      reputation: Math.max(0, Math.min(100, state.scout.reputation + reputationDelta)),
      clubTrust: Math.max(0, Math.min(100, state.scout.clubTrust + clubTrustDelta)),
      fatigue,
    },
    jobOffers: offer ? [...state.jobOffers, offer] : state.jobOffers,
    careerRecovery: {
      ...currentRecoveryState(state),
      current: resolvedEpisode,
    },
    consequenceState: {
      ...state.consequenceState,
      facts: { ...state.consequenceState.facts, [fact.id]: fact },
    },
    inbox: [...state.inbox, outcomeMessage],
  };
}

/**
 * Advance an active recovery exactly once for the completed week. The caller
 * supplies the schedule that was actually processed because GameState has
 * already advanced to the next date by this point.
 */
export function processCareerRecoveryWeek(
  state: GameState,
  completedSchedule: WeekSchedule,
): GameState {
  const recovery = currentRecoveryState(state);
  const episode = recovery.current;
  if (!episode || isTerminal(episode)) return state;

  if (episode.status === "awaitingChoice") {
    const afterChoiceDeadline = compareGameDates(
      { week: state.currentWeek, season: state.currentSeason },
      { week: episode.choiceDueWeek, season: episode.choiceDueSeason },
    ) > 0;
    if (!afterChoiceDeadline) return state;
    return chooseCareerRecoveryPlan(state, "stepBack", "default").state;
  }
  if (!episode.planId || episode.deadlineWeek === undefined || episode.deadlineSeason === undefined) {
    return state;
  }

  const progressSources = new Set(episode.progressSourceIds);
  if (episode.planId === "proveTheWork") {
    const baselineCases = new Set(
      episode.baselineReportCaseKeys
      ?? episode.baselineReportIds
        .flatMap((reportId) => {
          const report = state.reports[reportId];
          return report ? [getReportCaseKey(report)] : [];
        }),
    );
    const qualifying = selectLatestReportsByCase(Object.values(state.reports))
      .filter((report) =>
        report.scoutId === state.scout.id
        && !baselineCases.has(getReportCaseKey(report))
        && report.qualityScore >= QUALIFYING_REPORT_SCORE
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const report of qualifying) progressSources.add(`player:${report.playerId}`);
  } else if (episode.planId === "rebuildTheNetwork") {
    for (const activity of completedSchedule.activities) {
      if (activity?.type === "networkMeeting" && activity.targetId) {
        progressSources.add(`contact:${activity.targetId}`);
      }
    }
  } else if (quietSchedule(completedSchedule)) {
    progressSources.add(`quiet:s${completedSchedule.season}w${completedSchedule.week}`);
  }

  const progress = Math.min(episode.target, progressSources.size);
  const progressedEpisode = {
    ...episode,
    progress,
    progressSourceIds: [...progressSources].sort(),
  };
  const progressedState: GameState = {
    ...state,
    careerRecovery: { ...recovery, current: progressedEpisode },
  };
  const financialClearance = episode.kind !== "bankruptcy"
    || (state.finances?.bankruptcyRecoveryCooldown ?? 0) <= 0;
  if (progress >= episode.target && financialClearance) {
    return resolveRecovery(progressedState, progressedEpisode, true);
  }

  const deadlinePassed = compareGameDates(
    { week: state.currentWeek, season: state.currentSeason },
    { week: episode.deadlineWeek, season: episode.deadlineSeason },
  ) > 0;
  return deadlinePassed
    ? resolveRecovery(progressedState, progressedEpisode, false)
    : progressedState;
}

export function isCareerRecoveryBlockingOffers(state: GameState): boolean {
  const episode = state.careerRecovery?.current;
  return Boolean(
    episode
    && episode.kind !== "warning"
    && (episode.status === "awaitingChoice" || episode.status === "active"),
  );
}
