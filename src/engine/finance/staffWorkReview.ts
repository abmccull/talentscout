import type {
  ConsultingContract,
  FinancialRecord,
  GameDate,
  RetainerContract,
  StaffScoutingWorkProduct,
} from "../core/types";
import {
  addGameWeeksWithSeasonLength,
  gameWeeksBetweenWithSeasonLength,
} from "../core/gameDate";

export type StaffWorkReviewPriority = "critical" | "high" | "standard" | "internal";
export type StaffWorkDeliveryRisk = "internal" | "safe" | "atRisk" | "blocked";

export interface StaffWorkReviewPreview {
  priority: StaffWorkReviewPriority;
  priorityLabel: string;
  priorityReason: string;
  priorityScore: number;
  waitWeeks: number;
  reviewDebtPenalty: number;
  signedOffQualityScore: number;
  nextWeekSignedOffQualityScore: number;
  deliveryThreshold: number | null;
  deliveryRisk: StaffWorkDeliveryRisk;
  deliveryRiskLabel: string;
  deadline?: GameDate;
}

const PRIORITY_GRACE_WEEKS: Record<StaffWorkReviewPriority, number> = {
  critical: 0,
  high: 1,
  standard: 2,
  internal: 3,
};

const PRIORITY_DEBT_PER_WEEK: Record<StaffWorkReviewPriority, number> = {
  critical: 6,
  high: 4,
  standard: 3,
  internal: 2,
};

const MAX_REVIEW_DEBT_PENALTY = 18;

interface PriorityAssessment {
  priority: StaffWorkReviewPriority;
  priorityLabel: string;
  priorityReason: string;
  priorityScore: number;
  deadline?: GameDate;
  deliveryThreshold: number | null;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function getFallbackRetainerDeadline(
  currentDate: GameDate,
  seasonLength: number,
): GameDate {
  const weeksUntilSettlement = (4 - ((currentDate.week - 1) % 4)) % 4;
  return addGameWeeksWithSeasonLength(currentDate, weeksUntilSettlement, seasonLength);
}

function assessConsultingPriority(
  contract: ConsultingContract,
  currentDate: GameDate,
  seasonLength: number,
): PriorityAssessment | null {
  if (contract.status !== "active") return null;
  const reportsDeliverable = (contract.deliverables ?? []).find((deliverable) =>
    deliverable.type === "reports"
  );
  const reportsRemaining = Math.max(
    0,
    (reportsDeliverable?.required ?? 0) - (reportsDeliverable?.delivered ?? 0),
  );
  if (reportsRemaining <= 0) return null;

  const deadline = {
    week: contract.deadline,
    season: contract.deadlineSeason,
  };
  const weeksRemaining = Math.max(
    0,
    gameWeeksBetweenWithSeasonLength(currentDate, deadline, seasonLength),
  );
  const reviewWindowsRemaining = weeksRemaining + 1;
  const priority: StaffWorkReviewPriority = reportsRemaining >= reviewWindowsRemaining
    ? "critical"
    : weeksRemaining <= 2 || reportsRemaining + 1 >= reviewWindowsRemaining
      ? "high"
      : "standard";

  return {
    priority,
    priorityLabel: priority === "critical"
      ? "Critical client"
      : priority === "high"
        ? "High client"
        : "Standard client",
    priorityReason: `${reportsRemaining} consulting ${pluralize(reportsRemaining, "report", "reports")} due by S${deadline.season} W${deadline.week}.`,
    priorityScore: 140
      + reportsRemaining * 12
      + Math.max(0, 6 - weeksRemaining) * 6,
    deadline,
    deliveryThreshold: 50,
  };
}

function assessRetainerPriority(
  contract: RetainerContract,
  currentDate: GameDate,
  seasonLength: number,
): PriorityAssessment | null {
  if (contract.status !== "active" && contract.status !== "suspended") return null;

  const reportsRemaining = Math.max(
    0,
    contract.requiredReportsPerMonth - contract.reportsDeliveredThisMonth,
  );
  if (reportsRemaining <= 0) return null;

  const deadline = Number.isInteger(contract.nextSettlementWeek)
    && Number.isInteger(contract.nextSettlementSeason)
    ? {
        week: contract.nextSettlementWeek!,
        season: contract.nextSettlementSeason!,
      }
    : getFallbackRetainerDeadline(currentDate, seasonLength);
  const weeksRemaining = Math.max(
    0,
    gameWeeksBetweenWithSeasonLength(currentDate, deadline, seasonLength),
  );
  const reviewWindowsRemaining = weeksRemaining + 1;
  const priority: StaffWorkReviewPriority = reportsRemaining >= reviewWindowsRemaining
    ? "critical"
    : weeksRemaining <= 1 || reportsRemaining + 1 >= reviewWindowsRemaining
      ? "high"
      : "standard";

  return {
    priority,
    priorityLabel: priority === "critical"
      ? "Critical client"
      : priority === "high"
        ? "High client"
        : "Standard client",
    priorityReason: `${reportsRemaining} retainer ${pluralize(reportsRemaining, "delivery", "deliveries")} needed before settlement in S${deadline.season} W${deadline.week}.`,
    priorityScore: 90
      + reportsRemaining * 10
      + Math.max(0, 4 - weeksRemaining) * 7,
    deadline,
    deliveryThreshold: contract.brief?.minimumReportQuality ?? null,
  };
}

function getPriorityAssessment(
  finances: Pick<FinancialRecord, "retainerContracts" | "consultingContracts">,
  product: StaffScoutingWorkProduct,
  currentDate: GameDate,
  seasonLength: number,
): PriorityAssessment {
  if (!product.clientClubId) {
    return {
      priority: "internal",
      priorityLabel: "Internal queue",
      priorityReason: "No client delivery is attached. Reviewing this lead protects your watchlist only.",
      priorityScore: 20,
      deliveryThreshold: null,
    };
  }

  const consulting = finances.consultingContracts
    .filter((contract) => contract.clubId === product.clientClubId)
    .map((contract) => assessConsultingPriority(contract, currentDate, seasonLength))
    .filter((assessment): assessment is PriorityAssessment => assessment != null)
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];
  if (consulting) return consulting;

  const retainer = finances.retainerContracts
    .filter((contract) => contract.clubId === product.clientClubId)
    .map((contract) => assessRetainerPriority(contract, currentDate, seasonLength))
    .filter((assessment): assessment is PriorityAssessment => assessment != null)
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];
  if (retainer) return retainer;

  return {
    priority: "standard",
    priorityLabel: "Standard client",
    priorityReason: "A client is linked, but there is no active quota pressure on this lead right now.",
    priorityScore: 55,
    deliveryThreshold: 50,
  };
}

function getReviewDebtPenalty(
  product: StaffScoutingWorkProduct,
  priority: StaffWorkReviewPriority,
  currentDate: GameDate,
  seasonLength: number,
): number {
  const waitWeeks = Math.max(
    0,
    gameWeeksBetweenWithSeasonLength(
      { week: product.createdWeek, season: product.createdSeason },
      currentDate,
      seasonLength,
    ),
  );
  const overdueWeeks = Math.max(0, waitWeeks - PRIORITY_GRACE_WEEKS[priority]);
  return Math.min(
    MAX_REVIEW_DEBT_PENALTY,
    overdueWeeks * PRIORITY_DEBT_PER_WEEK[priority],
  );
}

export function getStaffWorkReviewPreview(
  finances: Pick<FinancialRecord, "retainerContracts" | "consultingContracts">,
  product: StaffScoutingWorkProduct,
  currentDate: GameDate,
  seasonLength: number,
): StaffWorkReviewPreview {
  const priority = getPriorityAssessment(finances, product, currentDate, seasonLength);
  const waitWeeks = Math.max(
    0,
    gameWeeksBetweenWithSeasonLength(
      { week: product.createdWeek, season: product.createdSeason },
      currentDate,
      seasonLength,
    ),
  );
  const reviewDebtPenalty = getReviewDebtPenalty(
    product,
    priority.priority,
    currentDate,
    seasonLength,
  );
  const signedOffQualityScore = Math.max(0, product.qualityScore - reviewDebtPenalty);
  const nextWeekReviewDebtPenalty = Math.min(
    MAX_REVIEW_DEBT_PENALTY,
    reviewDebtPenalty + PRIORITY_DEBT_PER_WEEK[priority.priority],
  );
  const nextWeekSignedOffQualityScore = Math.max(
    0,
    product.qualityScore - nextWeekReviewDebtPenalty,
  );
  const deliveryRisk: StaffWorkDeliveryRisk = priority.deliveryThreshold == null
    ? "internal"
    : signedOffQualityScore < priority.deliveryThreshold
      ? "blocked"
      : nextWeekSignedOffQualityScore < priority.deliveryThreshold || reviewDebtPenalty > 0
        ? "atRisk"
        : "safe";
  const deliveryRiskLabel = deliveryRisk === "internal"
    ? "Does not count as client delivery"
    : deliveryRisk === "blocked"
      ? `Below client standard (${priority.deliveryThreshold}+ needed)`
      : deliveryRisk === "atRisk"
        ? "At risk if deferred"
        : "Safe to deliver";

  return {
    priority: priority.priority,
    priorityLabel: priority.priorityLabel,
    priorityReason: priority.priorityReason,
    priorityScore: priority.priorityScore + product.qualityScore + waitWeeks * 2,
    waitWeeks,
    reviewDebtPenalty,
    signedOffQualityScore,
    nextWeekSignedOffQualityScore,
    deliveryThreshold: priority.deliveryThreshold,
    deliveryRisk,
    deliveryRiskLabel,
    deadline: priority.deadline,
  };
}

export function rankStaffWorkProducts(
  products: StaffScoutingWorkProduct[],
  finances: Pick<FinancialRecord, "retainerContracts" | "consultingContracts">,
  currentDate: GameDate,
  seasonLength: number,
): Array<{ product: StaffScoutingWorkProduct; preview: StaffWorkReviewPreview }> {
  return products
    .map((product) => ({
      product,
      preview: getStaffWorkReviewPreview(finances, product, currentDate, seasonLength),
    }))
    .sort((left, right) =>
      right.preview.priorityScore - left.preview.priorityScore
      || right.preview.reviewDebtPenalty - left.preview.reviewDebtPenalty
      || left.product.createdSeason - right.product.createdSeason
      || left.product.createdWeek - right.product.createdWeek
      || left.product.id.localeCompare(right.product.id)
    );
}
