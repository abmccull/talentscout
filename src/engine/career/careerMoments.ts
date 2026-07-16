import type {
  NarrativeEvent,
  NarrativeEventType,
  PerformanceReview,
} from "../core/types";
import type { EntityRef, GameDate } from "../consequences/types";
import type { CareerRecoveryEpisode } from "./recovery";
import type { LeadershipResponsibility } from "./leadership";

export const CAREER_MOMENT_STATE_VERSION = 1 as const;
export const CAREER_MOMENT_PENDING_LIMIT = 12;
export const CAREER_MOMENT_HISTORY_LIMIT = 96;

export type CareerMomentCategory =
  | "discovery"
  | "conviction"
  | "vindication"
  | "failure"
  | "betrayal"
  | "comeback"
  | "promotion"
  | "farewell";

export type CareerMomentTone =
  | "positive"
  | "mixed"
  | "negative"
  | "tense"
  | "reflective";

export type CareerMomentMagnitude = "minor" | "major" | "careerDefining";
export type CareerMomentCue =
  | "discovery"
  | "conviction"
  | "vindication"
  | "failure"
  | "betrayal"
  | "comeback"
  | "promotion"
  | "farewell";

export interface CareerMoment {
  id: string;
  source: EntityRef;
  occurredAt: GameDate;
  category: CareerMomentCategory;
  tone: CareerMomentTone;
  magnitude: CareerMomentMagnitude;
  cue: CareerMomentCue;
  title: string;
  summary: string;
  presentationSeed: string;
  playerId?: string;
  reportId?: string;
  stakeholderIds: string[];
  tags: string[];
}

export interface CareerMomentDelivery {
  moment: CareerMoment;
  status: "presented" | "suppressed";
  deliveredAt: GameDate;
  reason?: string;
}

export interface CareerMomentState {
  version: typeof CAREER_MOMENT_STATE_VERSION;
  pending: CareerMoment[];
  history: CareerMomentDelivery[];
  lastPresentedAt?: GameDate;
}

const MAGNITUDE_WEIGHT: Record<CareerMomentMagnitude, number> = {
  minor: 1,
  major: 2,
  careerDefining: 3,
};

function compareDate(left: GameDate, right: GameDate): number {
  return left.season - right.season || left.week - right.week;
}

function comparePriority(left: CareerMoment, right: CareerMoment): number {
  return MAGNITUDE_WEIGHT[right.magnitude] - MAGNITUDE_WEIGHT[left.magnitude]
    || compareDate(left.occurredAt, right.occurredAt)
    || left.id.localeCompare(right.id);
}

export function createCareerMomentState(
  partial: Partial<CareerMomentState> = {},
): CareerMomentState {
  const history = [...(partial.history ?? [])]
    .sort((left, right) =>
      compareDate(left.deliveredAt, right.deliveredAt) || left.moment.id.localeCompare(right.moment.id),
    )
    .slice(-CAREER_MOMENT_HISTORY_LIMIT);
  const deliveredIds = new Set(history.map((delivery) => delivery.moment.id));
  const pending = [...(partial.pending ?? [])]
    .filter((moment, index, all) =>
      !deliveredIds.has(moment.id) && all.findIndex((candidate) => candidate.id === moment.id) === index,
    )
    .sort(comparePriority)
    .slice(0, CAREER_MOMENT_PENDING_LIMIT);
  return {
    version: CAREER_MOMENT_STATE_VERSION,
    pending,
    history,
    lastPresentedAt: partial.lastPresentedAt ? { ...partial.lastPresentedAt } : undefined,
  };
}

function delivery(
  moment: CareerMoment,
  status: CareerMomentDelivery["status"],
  at: GameDate,
  reason?: string,
): CareerMomentDelivery {
  return { moment, status, deliveredAt: { ...at }, reason };
}

/**
 * Enqueue new causal moments exactly once. When the queue is saturated, lower
 * priority moments are explicitly recorded as suppressed rather than silently
 * disappearing or being rediscovered after load.
 */
export function enqueueCareerMoments(
  current: CareerMomentState | undefined,
  candidates: readonly CareerMoment[],
  now: GameDate,
): CareerMomentState {
  const state = createCareerMomentState(current);
  const knownIds = new Set([
    ...state.pending.map((moment) => moment.id),
    ...state.history.map((item) => item.moment.id),
  ]);
  const fresh = candidates.filter((moment, index, all) =>
    !knownIds.has(moment.id) && all.findIndex((candidate) => candidate.id === moment.id) === index,
  );
  const ranked = [...state.pending, ...fresh].sort(comparePriority);
  const pending = ranked.slice(0, CAREER_MOMENT_PENDING_LIMIT);
  const pendingIds = new Set(pending.map((moment) => moment.id));
  const suppressed = ranked
    .filter((moment) => !pendingIds.has(moment.id))
    .map((moment) => delivery(moment, "suppressed", now, "Presentation queue capacity reached."));

  return createCareerMomentState({
    ...state,
    pending,
    history: [...state.history, ...suppressed],
  });
}

export interface CareerMomentPresentationPolicy {
  cinematicMoments: "full" | "reduced" | "off";
  allowMinor?: boolean;
}

export function selectNextCareerMoment(
  current: CareerMomentState | undefined,
  policy: CareerMomentPresentationPolicy,
): CareerMoment | undefined {
  if (policy.cinematicMoments === "off") return undefined;
  const state = createCareerMomentState(current);
  return state.pending.find((moment) => policy.allowMinor !== false || moment.magnitude !== "minor");
}

export function acknowledgeCareerMoment(
  current: CareerMomentState | undefined,
  momentId: string,
  at: GameDate,
): CareerMomentState {
  const state = createCareerMomentState(current);
  const moment = state.pending.find((candidate) => candidate.id === momentId);
  if (!moment) return state;
  return createCareerMomentState({
    ...state,
    pending: state.pending.filter((candidate) => candidate.id !== momentId),
    history: [...state.history, delivery(moment, "presented", at)],
    lastPresentedAt: { ...at },
  });
}

export function suppressPendingCareerMoments(
  current: CareerMomentState | undefined,
  at: GameDate,
  reason = "Cinematic moments are disabled.",
): CareerMomentState {
  const state = createCareerMomentState(current);
  return createCareerMomentState({
    ...state,
    pending: [],
    history: [
      ...state.history,
      ...state.pending.map((moment) => delivery(moment, "suppressed", at, reason)),
    ],
  });
}

/** Suppress one queued moment while leaving later eligible moments available. */
export function suppressCareerMoment(
  current: CareerMomentState | undefined,
  momentId: string,
  at: GameDate,
  reason = "Automatic presentation is disabled for this moment.",
): CareerMomentState {
  const state = createCareerMomentState(current);
  const moment = state.pending.find((candidate) => candidate.id === momentId);
  if (!moment) return state;
  return createCareerMomentState({
    ...state,
    pending: state.pending.filter((candidate) => candidate.id !== momentId),
    history: [...state.history, delivery(moment, "suppressed", at, reason)],
  });
}

export function createCareerMoment(input: Omit<CareerMoment, "presentationSeed"> & {
  rootSeed: string;
}): CareerMoment {
  const { rootSeed, ...moment } = input;
  return {
    ...moment,
    stakeholderIds: [...new Set(moment.stakeholderIds)].sort(),
    tags: [...new Set(moment.tags)].sort(),
    presentationSeed: `${rootSeed}:career-moment:v1:${moment.id}`,
  };
}

const BETRAYAL_EVENTS = new Set<NarrativeEventType>([
  "contactBetrayal",
  "agentDoubleDealing",
  "agentDeception",
  "journalistExpose",
]);
const VINDICATION_EVENTS = new Set<NarrativeEventType>([
  "debutHatTrick",
  "hiddenGemVindication",
  "debutBrilliance",
  "lateBloomingSurprise",
  "reportCitedInBoardMeeting",
  "scoutingAwardNomination",
]);
const DISCOVERY_EVENTS = new Set<NarrativeEventType>([
  "exclusiveTip",
  "exclusiveAccess",
  "networkExpansion",
  "internationalTournament",
]);
const FAILURE_EVENTS = new Set<NarrativeEventType>([
  "targetInjured",
  "burnout",
  "healthScare",
  "budgetCut",
  "scoutingDeptRestructure",
  "clubFinancialTrouble",
  "injurySetback",
]);

export function careerMomentFromNarrativeEvent(
  event: NarrativeEvent,
  rootSeed: string,
): CareerMoment | undefined {
  let category: CareerMomentCategory | undefined;
  if (BETRAYAL_EVENTS.has(event.type)) category = "betrayal";
  else if (VINDICATION_EVENTS.has(event.type)) category = "vindication";
  else if (DISCOVERY_EVENTS.has(event.type)) category = "discovery";
  else if (FAILURE_EVENTS.has(event.type)) category = "failure";
  if (!category) return undefined;
  const negative = category === "betrayal" || category === "failure";
  return createCareerMoment({
    rootSeed,
    id: `narrative:${event.id}`,
    source: { kind: "narrativeEvent", id: event.id },
    occurredAt: { week: event.week, season: event.season },
    category,
    tone: negative ? "negative" : "positive",
    magnitude: category === "betrayal" || category === "vindication" ? "major" : "minor",
    cue: category,
    title: event.title,
    summary: event.description,
    stakeholderIds: event.relatedIds,
    tags: [event.type, category],
  });
}

export function careerMomentFromPerformanceReview(
  review: PerformanceReview,
  rootSeed: string,
  occurredAt: GameDate = { season: review.season, week: 38 },
): CareerMoment | undefined {
  if (review.outcome === "retained") return undefined;
  const positive = review.outcome === "promoted";
  const category: CareerMomentCategory = positive ? "promotion" : "failure";
  return createCareerMoment({
    rootSeed,
    id: `performance-review:s${review.season}:${review.outcome}`,
    source: { kind: "performanceReview", id: `s${review.season}` },
    occurredAt,
    category,
    tone: positive ? "positive" : review.outcome === "warning" ? "tense" : "negative",
    magnitude: review.outcome === "fired" ? "careerDefining" : "major",
    cue: positive ? "promotion" : "failure",
    title: positive ? "Your remit just changed" : review.outcome === "fired" ? "The club ended your employment" : "Your work is under formal review",
    summary: `${review.reportsSubmitted} reports, ${review.averageQuality}/100 average quality, and ${review.successfulRecommendations} successful recommendations produced a ${review.outcome} review.`,
    stakeholderIds: [],
    tags: ["performanceReview", review.outcome],
  });
}

export function careerMomentFromRecovery(
  episode: CareerRecoveryEpisode,
  rootSeed: string,
): CareerMoment | undefined {
  if (episode.status !== "completed" && episode.status !== "failed") return undefined;
  const completed = episode.status === "completed";
  return createCareerMoment({
    rootSeed,
    id: `career-recovery:${episode.id}:${episode.status}`,
    source: { kind: "careerRecovery", id: episode.id },
    occurredAt: {
      season: episode.resolvedSeason ?? episode.triggeredSeason,
      week: episode.resolvedWeek ?? episode.triggeredWeek,
    },
    category: completed ? "comeback" : "failure",
    tone: completed ? "positive" : "negative",
    magnitude: episode.previousTier >= 4 ? "careerDefining" : "major",
    cue: completed ? "comeback" : "failure",
    title: completed ? "The comeback is now part of your record" : "The recovery plan expired",
    summary: episode.outcomeSummary ?? `The ${episode.planId ?? "unselected"} recovery route ${episode.status}.`,
    playerId: episode.triggerPlayerId,
    reportId: episode.triggerReportId,
    stakeholderIds: (episode.affectedStakeholders ?? []).map((stakeholder) => stakeholder.id),
    tags: ["careerRecovery", episode.kind, episode.planId ?? "none", episode.status],
  });
}

export function careerMomentFromLeadership(
  responsibility: LeadershipResponsibility,
  rootSeed: string,
): CareerMoment | undefined {
  if (!["succeeded", "failed", "rejected"].includes(responsibility.status)) return undefined;
  const succeeded = responsibility.status === "succeeded";
  return createCareerMoment({
    rootSeed,
    id: `leadership:${responsibility.id}:${responsibility.status}`,
    source: { kind: "leadershipResponsibility", id: responsibility.id },
    occurredAt: {
      season: responsibility.resolvedSeason ?? responsibility.dueSeason,
      week: responsibility.resolvedWeek ?? responsibility.dueWeek,
    },
    category: succeeded ? "vindication" : "failure",
    tone: succeeded ? "positive" : "negative",
    magnitude: responsibility.priority === "critical" ? "major" : "minor",
    cue: succeeded ? "vindication" : "failure",
    title: responsibility.title,
    summary: responsibility.outcomeReason ?? responsibility.description,
    playerId: responsibility.playerId,
    stakeholderIds: [responsibility.sourceContactId, responsibility.clubId].filter((id): id is string => Boolean(id)),
    tags: ["leadership", responsibility.choice ?? "unowned", responsibility.status],
  });
}

export function createFarewellCareerMoment(input: {
  rootSeed: string;
  scoutId: string;
  date: GameDate;
  title: string;
  summary: string;
  stakeholderIds?: string[];
}): CareerMoment {
  return createCareerMoment({
    rootSeed: input.rootSeed,
    id: `farewell:${input.scoutId}:s${input.date.season}w${input.date.week}`,
    source: { kind: "retirement", id: input.scoutId },
    occurredAt: input.date,
    category: "farewell",
    tone: "reflective",
    magnitude: "careerDefining",
    cue: "farewell",
    title: input.title,
    summary: input.summary,
    stakeholderIds: input.stakeholderIds ?? [],
    tags: ["farewell", "retirement"],
  });
}
