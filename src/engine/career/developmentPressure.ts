import type {
  FinancialRecord,
  GameState,
  Scout,
  StaffScoutingWorkProduct,
  WeekSchedule,
} from "@/engine/core/types";
import {
  COURSE_CATALOG,
  countScheduledStudySessions,
  getCoursePlannerStatusModel,
} from "./courses";
import {
  deriveAgencyStrategicHealth,
  isAgencyCareer,
} from "@/engine/finance/agency";
import { rankStaffWorkProducts } from "@/engine/finance/staffWorkReview";
import type { SeasonReviewMetrics } from "./seasonReviewContext";

export type DevelopmentPressureFamily =
  | "courseStudy"
  | "staffReview"
  | "agencyHealth";

export type DevelopmentPressureSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type DevelopmentPressureAction =
  | "scheduleStudy"
  | "reviewStaffWork"
  | "stabilizeAgency";

export interface DevelopmentPressureFront {
  id: string;
  family: DevelopmentPressureFamily;
  severity: DevelopmentPressureSeverity;
  score: number;
  title: string;
  cause: string;
  consequence: string;
  action: DevelopmentPressureAction;
  actionLabel: string;
  evidenceIds: string[];
  dueWeek?: number;
  dueSeason?: number;
}

export interface DevelopmentPressureProjection {
  fronts: DevelopmentPressureFront[];
  rawScore: number;
  youthPayoffOffset: number;
  netScore: number;
  seasonReviewPenalty: number;
  youthPayoffSummary?: string;
}

export interface ProjectDevelopmentPressureInput {
  scout: Scout;
  finances?: FinancialRecord | null;
  schedule?: WeekSchedule | null;
  currentWeek: number;
  currentSeason: number;
  seasonLength: number;
  seasonReviewMetrics?: SeasonReviewMetrics;
}

const SEVERITY_RANK: Record<DevelopmentPressureSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// The most urgent front carries the decision, while concurrent fronts still
// consume bounded attention. Diminishing weights keep the projection legible
// and prevent three moderate problems from inflating beyond the 0-100 scale.
const CONCURRENT_FRONT_WEIGHTS = [1, 0.25, 0.125] as const;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function activeEnrollmentWasEmployerFunded(finances: FinancialRecord): boolean {
  const enrollment = finances.activeEnrollment;
  if (!enrollment) return false;
  const referenceId = `course-enrollment:${enrollment.courseId}:s${enrollment.startSeason}w${enrollment.startWeek}`;
  return finances.transactions.some((transaction) =>
    transaction.referenceId === referenceId
    && /employer funded/i.test(transaction.description),
  );
}

function coursePressure(
  input: ProjectDevelopmentPressureInput,
  finances: FinancialRecord,
): DevelopmentPressureFront | undefined {
  const enrollment = finances.activeEnrollment;
  if (!enrollment) return undefined;
  const course = COURSE_CATALOG.find((candidate) => candidate.id === enrollment.courseId);
  const scheduledStudySessions = countScheduledStudySessions(input.schedule);
  const status = getCoursePlannerStatusModel({
    activeEnrollment: enrollment,
    courseDurationWeeks: course?.durationWeeks,
    currentWeek: input.currentWeek,
    currentSeason: input.currentSeason,
    scheduledStudySessions,
    seasonLength: input.seasonLength,
  });
  if (!status || status.studyWeeksPlanned > 0) return undefined;

  const employerFunded = activeEnrollmentWasEmployerFunded(finances);
  const title = employerFunded
    ? `${course?.name ?? "Funded course"} is using club backing without study time`
    : `${course?.name ?? "Your course"} will not advance this week`;
  return {
    id: `development-pressure:course:${enrollment.courseId}:s${input.currentSeason}w${input.currentWeek}`,
    family: "courseStudy",
    severity: employerFunded ? "high" : "medium",
    score: employerFunded ? 72 : 58,
    title,
    cause: `${status.progressLabel}; ${status.workloadLabel.toLowerCase()}.`,
    consequence: employerFunded
      ? "The qualification slips, the club's education investment is visibly unused, and the same missing qualification can block the next career tier."
      : "The qualification slips by another week and can leave the next career tier behind its formal course gate.",
    action: "scheduleStudy",
    actionLabel: "Book study in Planner",
    evidenceIds: [
      enrollment.courseId,
      ...finances.transactions
        .filter((transaction) => transaction.referenceId === `course-enrollment:${enrollment.courseId}:s${enrollment.startSeason}w${enrollment.startWeek}`)
        .flatMap((transaction) => transaction.referenceId ? [transaction.referenceId] : []),
    ],
  };
}

function staffReviewPressure(
  input: ProjectDevelopmentPressureInput,
  finances: FinancialRecord,
): DevelopmentPressureFront | undefined {
  const awaitingReview = (finances.staffWorkProducts ?? []).filter(
    (product): product is StaffScoutingWorkProduct => product.status === "awaitingReview",
  );
  if (awaitingReview.length === 0) return undefined;
  const ranked = rankStaffWorkProducts(
    awaitingReview,
    finances,
    { week: input.currentWeek, season: input.currentSeason },
    input.seasonLength,
  );
  const next = ranked[0];
  if (!next) return undefined;
  const { product, preview } = next;
  if (
    preview.priority !== "critical"
    && preview.priority !== "high"
    && preview.deliveryRisk !== "atRisk"
    && preview.deliveryRisk !== "blocked"
    && preview.reviewDebtPenalty === 0
  ) return undefined;

  const severity: DevelopmentPressureSeverity = preview.deliveryRisk === "blocked"
    ? "critical"
    : preview.priority === "critical" || preview.deliveryRisk === "atRisk"
      ? "high"
      : "medium";
  const qualityLoss = Math.max(
    0,
    preview.signedOffQualityScore - preview.nextWeekSignedOffQualityScore,
  );
  return {
    id: `development-pressure:staff-review:${product.id}`,
    family: "staffReview",
    severity,
    score: clamp(
      45
      + preview.reviewDebtPenalty * 2
      + (preview.priority === "critical" ? 25 : preview.priority === "high" ? 12 : 0)
      + (preview.deliveryRisk === "blocked" ? 20 : preview.deliveryRisk === "atRisk" ? 10 : 0),
    ),
    title: `${product.employeeName}'s lead needs your sign-off`,
    cause: `${preview.priorityReason} ${preview.deliveryRiskLabel}.`,
    consequence: qualityLoss > 0
      ? `Deferring one more week removes another ${qualityLoss} quality points before sign-off and can turn staff capacity into a client delivery failure.`
      : "Deferring leaves the client deadline and your agency's delivery standard exposed.",
    action: "reviewStaffWork",
    actionLabel: "Review staff work",
    evidenceIds: [
      product.id,
      product.playerId,
      product.employeeId,
      ...(product.clientClubId ? [product.clientClubId] : []),
    ],
    ...(preview.deadline
      ? { dueWeek: preview.deadline.week, dueSeason: preview.deadline.season }
      : {}),
  };
}

function agencyPressure(
  input: ProjectDevelopmentPressureInput,
  finances: FinancialRecord,
): DevelopmentPressureFront | undefined {
  if (!isAgencyCareer(input.scout, finances)) return undefined;
  const health = deriveAgencyStrategicHealth(finances, input.scout);
  if (health.status === "stable" || health.status === "resilient") return undefined;
  const severity: DevelopmentPressureSeverity = health.status === "critical"
    ? "critical"
    : health.status === "fragile"
      ? "high"
      : "medium";
  const primaryPressure = health.pressurePoints[0]
    ?? health.promotionBlockers[0]
    ?? "The agency is carrying more risk than its current operating base can defend.";
  return {
    id: `development-pressure:agency:${health.status}:${health.policy}`,
    family: "agencyHealth",
    severity,
    score: clamp(100 - health.score),
    title: `Agency health is ${health.status}`,
    cause: primaryPressure,
    consequence: health.seniorAgencyReady
      ? "The current strain will compound through cash, delivery quality, or reputation unless the operating policy changes."
      : `${health.promotionBlockers[0] ?? "The agency is not ready to scale."} Senior independent progression remains blocked while this is true.`,
    action: "stabilizeAgency",
    actionLabel: "Open agency strategy",
    evidenceIds: [
      `agency-health:${health.status}`,
      `agency-policy:${health.policy}`,
      ...health.failureModes.map((mode) => `agency-risk:${mode}`),
    ],
  };
}

function youthPayoff(metrics: SeasonReviewMetrics | undefined): {
  offset: number;
  summary?: string;
} {
  if (!metrics) return { offset: 0 };
  const placements = Math.max(0, metrics.successfulPlacements);
  const milestones = Math.max(0, metrics.alumniMilestonesThisSeason);
  const discoveries = Math.max(0, metrics.unsignedYouthDiscovered);
  const offset = Math.min(24, placements * 8 + milestones * 6 + Math.min(6, discoveries));
  if (offset === 0) return { offset: 0 };
  return {
    offset,
    summary: `${placements} successful placement${placements === 1 ? "" : "s"}, ${milestones} alumni milestone${milestones === 1 ? "" : "s"}, and ${discoveries} youth discover${discoveries === 1 ? "y" : "ies"} earned evidence that the operational tradeoffs produced scouting value.`,
  };
}

/**
 * Compose the existing course, staff-review, agency-health, and youth-outcome
 * authorities into one read-only pressure loop. Nothing here owns a balance,
 * course clock, delivery score, or promotion gate.
 */
export function projectDevelopmentPressure(
  input: ProjectDevelopmentPressureInput,
): DevelopmentPressureProjection {
  const finances = input.finances;
  const fronts = finances
    ? [
        coursePressure(input, finances),
        staffReviewPressure(input, finances),
        agencyPressure(input, finances),
      ].filter((front): front is DevelopmentPressureFront => Boolean(front))
    : [];
  fronts.sort((left, right) =>
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]
    || right.score - left.score
    || left.id.localeCompare(right.id),
  );

  const rawScore = clamp(Math.round(fronts.reduce(
    (total, front, index) =>
      total + front.score * (CONCURRENT_FRONT_WEIGHTS[index] ?? 0),
    0,
  )));
  const payoff = youthPayoff(input.seasonReviewMetrics);
  const hasCritical = fronts.some((front) => front.severity === "critical");
  const netScore = fronts.length === 0
    ? 0
    : Math.max(hasCritical ? 75 : 0, rawScore - payoff.offset);
  return {
    fronts,
    rawScore,
    youthPayoffOffset: payoff.offset,
    netScore,
    seasonReviewPenalty: Math.min(12, Math.max(0, Math.round(netScore / 10))),
    ...(payoff.summary ? { youthPayoffSummary: payoff.summary } : {}),
  };
}

export function projectDevelopmentPressureForState(
  state: GameState,
  seasonLength: number,
  seasonReviewMetrics?: SeasonReviewMetrics,
): DevelopmentPressureProjection {
  return projectDevelopmentPressure({
    scout: state.scout,
    finances: state.finances,
    schedule: state.schedule,
    currentWeek: state.currentWeek,
    currentSeason: state.currentSeason,
    seasonLength,
    seasonReviewMetrics,
  });
}
