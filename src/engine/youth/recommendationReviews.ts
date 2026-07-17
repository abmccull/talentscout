/**
 * Delayed reviews for academy placement recommendations.
 *
 * Reviews deliberately avoid current ability, potential ability, and generated
 * alumni statistics. They are immutable snapshots built from the canonical
 * season-rating, movement, and injury ledgers plus the opinion preserved in the
 * scouting case.
 */

import type {
  ClubDecision,
  ConvictionLevel,
  Injury,
  PlacementReport,
  Player,
  PlayerMovementEvent,
  RecommendationReviewDimension,
  RecommendationReviewEvidenceLevel,
  RecommendationReview,
  RecommendationReviewCheckpoint,
  ScoutReport,
  ScoutingCase,
  SeasonRatingRecord,
} from "@/engine/core/types";
import type { AcademyRecruitmentBrief } from "./recruitmentBriefs";

const DEFAULT_SEASON_LENGTH = 38;

export type AcademyRecommendationVerdict =
  | "strongSuccess"
  | "onTrack"
  | "mixed"
  | "concerning"
  | "insufficientEvidence";

export type AcademyReviewEvidenceLevel = RecommendationReviewEvidenceLevel;

export type AcademyConvictionAssessment =
  | "validated"
  | "proportionate"
  | "overconfident"
  | "understated"
  | "unresolved";

export type AcademyRiskAssessment =
  | "correctlyFlagged"
  | "missed"
  | "notRealized"
  | "unresolved";

export type AcademyPathwayStatus =
  | "academy"
  | "firstTeam"
  | "loan"
  | "transferred"
  | "released"
  | "freeAgent"
  | "retired"
  | "footballExit"
  | "unknown";

export interface AcademyRecommendationOutcomeEvidence {
  seasonsReviewed: number[];
  movementIds: string[];
  injuryIds: string[];
  appearances: number;
  avgRating?: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  injuryCount: number;
  weeksMissed: number;
  pathwayStatus: AcademyPathwayStatus;
  clubIdAtReview?: string;
  contractClubIdAtReview?: string;
  ageAtReview: number;
}

/** Structural subtype of the canonical GameState recommendation review. */
export interface AcademyRecommendationReview extends RecommendationReview {
  placementReportId: string;
  placementMovementId: string;
  horizonSeasons: 1 | 2;
  reportQualityAtRecommendation: number;
  convictionAtRecommendation: ConvictionLevel;
  reportRevisionCount: number;
  opinionRevised: boolean;
  verdict?: AcademyRecommendationVerdict;
  evidenceLevel?: AcademyReviewEvidenceLevel;
  convictionAssessment?: AcademyConvictionAssessment;
  injuryRiskAssessment?: AcademyRiskAssessment;
  outcomeEvidence?: AcademyRecommendationOutcomeEvidence;
}

export type RecommendationReviewValidationFailure =
  | "caseNotPlaced"
  | "caseMismatch"
  | "placementNotAccepted"
  | "decisionMismatch"
  | "missingCanonicalYouthSigning"
  | "reviewMismatch";

export interface ScheduleAcademyRecommendationReviewsInput {
  scoutingCase: ScoutingCase;
  report: ScoutReport;
  placementReport: PlacementReport;
  clubDecision: ClubDecision;
  movementHistory: PlayerMovementEvent[];
  existingReviews?: RecommendationReview[];
  seasonLength?: number;
}

export interface ScheduleAcademyRecommendationReviewsResult {
  reviews: AcademyRecommendationReview[];
  created: AcademyRecommendationReview[];
  failures: RecommendationReviewValidationFailure[];
}

export interface CompleteAcademyRecommendationReviewInput {
  review: RecommendationReview;
  scoutingCase: ScoutingCase;
  report: ScoutReport;
  /** Every preserved report revision for this case, when available. */
  caseReports?: ScoutReport[];
  placementReport: PlacementReport;
  clubDecision: ClubDecision;
  player: Player;
  movementHistory: PlayerMovementEvent[];
  currentWeek: number;
  currentSeason: number;
  brief?: AcademyRecruitmentBrief;
  seasonLength?: number;
}

export interface CompleteAcademyRecommendationReviewResult {
  status: "notDue" | "completed" | "unchanged" | "invalid";
  review: AcademyRecommendationReview;
  failures: RecommendationReviewValidationFailure[];
}

interface GameDate {
  week: number;
  season: number;
}

interface PathwaySnapshot {
  status: AcademyPathwayStatus;
  clubId?: string;
  contractClubId?: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function dateIndex(date: GameDate, seasonLength: number): number {
  return date.season * seasonLength + date.week - 1;
}

function compareDates(left: GameDate, right: GameDate, seasonLength: number): number {
  return dateIndex(left, seasonLength) - dateIndex(right, seasonLength);
}

function checkpointHorizon(checkpoint: RecommendationReviewCheckpoint): 1 | 2 {
  return checkpoint === "oneSeason" ? 1 : 2;
}

export function getAcademyRecommendationReviewId(
  caseId: string,
  placementReportId: string,
  checkpoint: RecommendationReviewCheckpoint,
): string {
  return `academy_review_${caseId}_${placementReportId}_${checkpoint}`;
}

function validatePlacementCausality(
  scoutingCase: ScoutingCase,
  report: ScoutReport,
  placementReport: PlacementReport,
  clubDecision: ClubDecision,
): RecommendationReviewValidationFailure[] {
  const failures: RecommendationReviewValidationFailure[] = [];
  if (scoutingCase.status !== "placed") failures.push("caseNotPlaced");
  if (
    report.caseId !== scoutingCase.id
    || report.playerId !== scoutingCase.playerId
    || report.scoutId !== scoutingCase.scoutId
    || !scoutingCase.reportIds.includes(report.id)
  ) failures.push("caseMismatch");
  if (
    placementReport.caseId !== scoutingCase.id
    || placementReport.reportId !== report.id
    || placementReport.clubResponse !== "accepted"
    || !scoutingCase.placementReportIds.includes(placementReport.id)
  ) failures.push("placementNotAccepted");
  if (
    clubDecision.outcome !== "accepted"
    || clubDecision.caseId !== scoutingCase.id
    || clubDecision.reportId !== report.id
    || clubDecision.clubId !== placementReport.targetClubId
    || clubDecision.placementReportId !== placementReport.id
    || placementReport.decisionId !== clubDecision.id
    || !scoutingCase.decisionIds.includes(clubDecision.id)
  ) failures.push("decisionMismatch");
  return failures;
}

function canonicalPlacementMovement(
  playerId: string,
  clubId: string,
  placementReport: PlacementReport,
  movements: PlayerMovementEvent[],
  seasonLength: number,
): PlayerMovementEvent | undefined {
  const reportDate = { week: placementReport.week, season: placementReport.season };
  return movements
    .filter((movement) =>
      movement.playerId === playerId
      && movement.type === "youthSigning"
      && movement.toClubId === clubId
      && compareDates(
        { week: movement.week, season: movement.season },
        reportDate,
        seasonLength,
      ) >= 0,
    )
    .sort((left, right) =>
      compareDates(
        { week: left.week, season: left.season },
        { week: right.week, season: right.season },
        seasonLength,
      ) || left.id.localeCompare(right.id),
    )[0];
}

function preservedCaseReports(
  scoutingCase: ScoutingCase,
  original: ScoutReport,
  reports: ScoutReport[] = [],
): ScoutReport[] {
  const byId = new Map<string, ScoutReport>();
  for (const report of [...reports, original]) {
    if (
      scoutingCase.reportIds.includes(report.id)
      && report.playerId === scoutingCase.playerId
      && report.scoutId === scoutingCase.scoutId
    ) byId.set(report.id, report);
  }
  return [...byId.values()].sort((left, right) =>
    left.submittedSeason - right.submittedSeason
    || left.submittedWeek - right.submittedWeek
    || (left.revision ?? 0) - (right.revision ?? 0)
    || left.id.localeCompare(right.id),
  );
}

function opinionChangedBetween(left: ScoutReport, right: ScoutReport): boolean {
  return right.conviction !== left.conviction
    || right.projectedRole !== left.projectedRole
    || JSON.stringify(right.perceivedPARange) !== JSON.stringify(left.perceivedPARange)
    || right.recommendedAction !== left.recommendedAction;
}

function didOpinionChange(reports: ScoutReport[]): boolean {
  if (reports.length < 2) return false;
  const first = reports[0];
  return reports.slice(1).some((report) => opinionChangedBetween(first, report));
}

/**
 * Persist the one- and two-season checkpoints as soon as a placement becomes
 * canonical. Calling this repeatedly returns the same IDs without duplicates.
 */
export function scheduleAcademyRecommendationReviews(
  input: ScheduleAcademyRecommendationReviewsInput,
): ScheduleAcademyRecommendationReviewsResult {
  const seasonLength = input.seasonLength ?? DEFAULT_SEASON_LENGTH;
  const failures = validatePlacementCausality(
    input.scoutingCase,
    input.report,
    input.placementReport,
    input.clubDecision,
  );
  const placementMovement = canonicalPlacementMovement(
    input.scoutingCase.playerId,
    input.placementReport.targetClubId,
    input.placementReport,
    input.movementHistory,
    seasonLength,
  );
  if (!placementMovement) failures.push("missingCanonicalYouthSigning");
  if (failures.length > 0 || !placementMovement) {
    return { reviews: [], created: [], failures };
  }

  const existingById = new Map(
    (input.existingReviews ?? []).map((review) => [review.id, review]),
  );
  const revisions = preservedCaseReports(input.scoutingCase, input.report);
  const created: AcademyRecommendationReview[] = [];
  const scheduled = (["oneSeason", "twoSeasons"] as const).map((checkpoint) => {
    const horizon = checkpointHorizon(checkpoint);
    const id = getAcademyRecommendationReviewId(
      input.scoutingCase.id,
      input.placementReport.id,
      checkpoint,
    );
    const existing = existingById.get(id);
    if (existing) return existing as AcademyRecommendationReview;
    const review: AcademyRecommendationReview = {
      id,
      caseId: input.scoutingCase.id,
      reportId: input.report.id,
      playerId: input.scoutingCase.playerId,
      clubId: input.placementReport.targetClubId,
      checkpoint,
      dueWeek: placementMovement.week,
      dueSeason: placementMovement.season + horizon,
      status: "scheduled",
      placementReportId: input.placementReport.id,
      placementMovementId: placementMovement.id,
      horizonSeasons: horizon,
      reportQualityAtRecommendation: input.report.qualityScore,
      convictionAtRecommendation: input.report.conviction,
      reportRevisionCount: revisions.length,
      opinionRevised: didOpinionChange(revisions),
    };
    created.push(review);
    return review;
  });
  return { reviews: scheduled, created, failures: [] };
}

function canonicalRatings(
  ratings: SeasonRatingRecord[],
  placementSeason: number,
  horizon: number,
): SeasonRatingRecord[] {
  const latestPerSeason = new Map<number, SeasonRatingRecord>();
  for (const rating of ratings) {
    if (rating.season >= placementSeason && rating.season < placementSeason + horizon) {
      latestPerSeason.set(rating.season, rating);
    }
  }
  return [...latestPerSeason.values()].sort((left, right) => left.season - right.season);
}

function injuriesInWindow(
  injuries: Injury[],
  placementDate: GameDate,
  dueDate: GameDate,
  seasonLength: number,
): Injury[] {
  return injuries
    .filter((injury) => {
      const occurred = { week: injury.occurredWeek, season: injury.occurredSeason };
      return compareDates(occurred, placementDate, seasonLength) >= 0
        && compareDates(occurred, dueDate, seasonLength) <= 0;
    })
    .sort((left, right) =>
      compareDates(
        { week: left.occurredWeek, season: left.occurredSeason },
        { week: right.occurredWeek, season: right.occurredSeason },
        seasonLength,
      ) || left.id.localeCompare(right.id),
    );
}

function movementsInWindow(
  movements: PlayerMovementEvent[],
  playerId: string,
  placementDate: GameDate,
  dueDate: GameDate,
  seasonLength: number,
): PlayerMovementEvent[] {
  return movements
    .filter((movement) => {
      if (movement.playerId !== playerId) return false;
      const occurred = { week: movement.week, season: movement.season };
      return compareDates(occurred, placementDate, seasonLength) >= 0
        && compareDates(occurred, dueDate, seasonLength) <= 0;
    })
    .sort((left, right) =>
      compareDates(
        { week: left.week, season: left.season },
        { week: right.week, season: right.season },
        seasonLength,
      ) || left.id.localeCompare(right.id),
    );
}

function derivePathway(
  placementClubId: string,
  movements: PlayerMovementEvent[],
  appearances: number,
  placementType: PlacementReport["placementType"],
): PathwaySnapshot {
  let clubId: string | undefined = placementClubId;
  let contractClubId: string | undefined = placementClubId;
  let onLoan = false;
  let terminal: AcademyPathwayStatus | undefined;

  for (const movement of movements) {
    switch (movement.type) {
      case "youthSigning":
      case "freeAgentSigning":
      case "permanentTransfer":
      case "loanBuyOption":
        clubId = movement.toClubId;
        contractClubId = movement.contractClubId ?? movement.toClubId;
        onLoan = false;
        terminal = movement.type === "youthSigning" ? undefined : "transferred";
        break;
      case "loanStart":
        clubId = movement.toClubId;
        contractClubId = movement.contractClubId ?? contractClubId;
        onLoan = true;
        terminal = undefined;
        break;
      case "loanReturn":
      case "loanRecall":
        clubId = movement.toClubId ?? contractClubId;
        onLoan = false;
        terminal = undefined;
        break;
      case "release":
        clubId = undefined;
        contractClubId = undefined;
        onLoan = false;
        terminal = "released";
        break;
      case "retirement":
        clubId = undefined;
        contractClubId = undefined;
        onLoan = false;
        terminal = "retired";
        break;
      case "footballExit":
        clubId = undefined;
        contractClubId = undefined;
        onLoan = false;
        terminal = "footballExit";
        break;
      case "contractRenewal":
        contractClubId = movement.contractClubId ?? contractClubId;
        break;
    }
  }

  if (terminal) return { status: terminal, clubId, contractClubId };
  if (onLoan) return { status: "loan", clubId, contractClubId };
  if (!clubId && !contractClubId) return { status: "freeAgent" };
  if (contractClubId !== placementClubId) {
    return { status: "transferred", clubId, contractClubId };
  }
  if (appearances > 0) return { status: "firstTeam", clubId, contractClubId };
  if (placementType === "academyIntake") {
    return { status: "academy", clubId, contractClubId };
  }
  return { status: "unknown", clubId, contractClubId };
}

function weightedAverageRating(ratings: SeasonRatingRecord[]): number | undefined {
  const appearances = ratings.reduce((total, rating) => total + rating.appearances, 0);
  if (appearances <= 0) return undefined;
  const weighted = ratings.reduce(
    (total, rating) => total + rating.avgRating * rating.appearances,
    0,
  );
  return Math.round(weighted / appearances * 10) / 10;
}

function pathwayScore(pathway: AcademyPathwayStatus): number {
  switch (pathway) {
    case "firstTeam": return 85;
    case "loan": return 75;
    case "transferred": return 72;
    case "academy": return 68;
    case "unknown": return 55;
    case "freeAgent": return 30;
    case "released": return 18;
    case "retired": return 10;
    case "footballExit": return 0;
  }
}

function calculatePerformanceScore(
  avgRating: number | undefined,
  appearances: number,
  horizon: number,
): number | undefined {
  if (avgRating === undefined || appearances === 0) return undefined;
  const ratingScore = clamp(Math.round((avgRating - 5.5) / 2 * 100), 0, 100);
  const opportunityScore = clamp(Math.round(appearances / (horizon * 18) * 100), 0, 100);
  return Math.round(ratingScore * 0.7 + opportunityScore * 0.3);
}

function calculateTimingScore(
  appearances: number,
  ageAtReview: number,
  pathway: AcademyPathwayStatus,
  horizon: number,
): number {
  if (pathway === "footballExit" || pathway === "retired") return 0;
  if (pathway === "released" || pathway === "freeAgent") return 20;
  if (appearances > 0) {
    return clamp(Math.round(55 + appearances / (horizon * 18) * 45), 55, 100);
  }
  if (ageAtReview <= 17) return 65;
  if (ageAtReview === 18) return 55;
  return 35;
}

function calculateClubFitScore(
  pathway: PathwaySnapshot,
  placementClubId: string,
  performanceScore: number | undefined,
): number {
  if (pathway.status === "footballExit" || pathway.status === "retired") return 0;
  if (pathway.status === "released" || pathway.status === "freeAgent") return 15;
  if (pathway.contractClubId === placementClubId) {
    const base = pathway.status === "firstTeam" ? 78 : pathway.status === "loan" ? 72 : 68;
    return performanceScore === undefined
      ? base
      : clamp(Math.round(base * 0.6 + performanceScore * 0.4), 0, 100);
  }
  return pathway.status === "transferred" ? 58 : 50;
}

function convictionImpliedConfidence(report: ScoutReport): number {
  const potentialConfidence = report.categoryVerdicts?.potential?.confidence;
  if (potentialConfidence === "high") return 90;
  if (potentialConfidence === "medium") return 65;
  if (potentialConfidence === "low") return 35;
  const convictionConfidence: Record<ConvictionLevel, number> = {
    note: 25,
    recommend: 50,
    strongRecommend: 75,
    tablePound: 95,
  };
  return convictionConfidence[report.conviction];
}

function assessConviction(
  report: ScoutReport,
  overallScore: number | undefined,
): { calibration?: number; assessment: AcademyConvictionAssessment } {
  if (overallScore === undefined) return { assessment: "unresolved" };
  const implied = convictionImpliedConfidence(report);
  const calibration = clamp(100 - Math.abs(implied - overallScore), 0, 100);
  if (overallScore >= 72 && implied >= 65) return { calibration, assessment: "validated" };
  if (overallScore >= 72 && implied < 65) return { calibration, assessment: "understated" };
  if (overallScore < 45 && implied >= 65) return { calibration, assessment: "overconfident" };
  return { calibration, assessment: "proportionate" };
}

function assessInjuryRisk(report: ScoutReport, weeksMissed: number): AcademyRiskAssessment {
  const text = [...(report.riskFactors ?? []), ...report.weaknesses].join(" ").toLowerCase();
  const flagged = /injur|fitness|availability|durability|physical fragility/.test(text);
  const realized = weeksMissed >= 6;
  if (flagged && realized) return "correctlyFlagged";
  if (!flagged && realized) return "missed";
  if (flagged && !realized) return "notRealized";
  return "unresolved";
}

function verdictFor(
  overallScore: number | undefined,
  pathway: AcademyPathwayStatus,
): AcademyRecommendationVerdict {
  if (pathway === "footballExit" || pathway === "retired" || pathway === "released") {
    return "concerning";
  }
  if (overallScore === undefined) return "insufficientEvidence";
  if (overallScore >= 80) return "strongSuccess";
  if (overallScore >= 65) return "onTrack";
  if (overallScore >= 45) return "mixed";
  return "concerning";
}

function movementDescription(movement: PlayerMovementEvent): string {
  switch (movement.type) {
    case "youthSigning": return `Signed by ${movement.toClubId ?? "the academy"}.`;
    case "permanentTransfer": return `Transferred to ${movement.toClubId ?? "another club"}.`;
    case "loanStart": return `Loaned to ${movement.toClubId ?? "another club"}.`;
    case "loanReturn": return `Returned from loan to ${movement.toClubId ?? movement.contractClubId ?? "the parent club"}.`;
    case "loanRecall": return `Recalled from loan to ${movement.toClubId ?? movement.contractClubId ?? "the parent club"}.`;
    case "loanBuyOption": return `Loan move became permanent at ${movement.toClubId ?? "the loan club"}.`;
    case "release": return "Released by the owning club.";
    case "freeAgentSigning": return `Signed as a free agent by ${movement.toClubId ?? "another club"}.`;
    case "contractRenewal": return "Signed a contract renewal.";
    case "retirement": return "Retired from football.";
    case "footballExit": return "Left professional football.";
  }
}

function evidenceLevelFor(
  ratingSeasons: number,
  horizon: number,
  appearances: number,
  pathway: AcademyPathwayStatus,
): AcademyReviewEvidenceLevel {
  if (ratingSeasons >= horizon && appearances > 0) return "full";
  if (appearances > 0 || ["released", "retired", "footballExit", "transferred"].includes(pathway)) {
    return "partial";
  }
  return "limited";
}

function reviewDimensionStatus(score: number): RecommendationReviewDimension["status"] {
  if (score >= 72) return "positive";
  if (score < 45) return "negative";
  return "mixed";
}

function formatWeeklyWage(value: number): string {
  return `GBP ${Math.round(value).toLocaleString("en-GB")}/wk`;
}

function reportsThroughDate(
  reports: ScoutReport[],
  dueDate: GameDate,
  seasonLength: number,
): ScoutReport[] {
  return reports.filter((report) =>
    compareDates(
      { week: report.submittedWeek, season: report.submittedSeason },
      dueDate,
      seasonLength,
    ) <= 0,
  );
}

function buildPriceValueDimension(input: {
  report: ScoutReport;
  brief?: AcademyRecruitmentBrief;
  overallScore: number | undefined;
  terminalFailure: boolean;
  evidenceLevel: AcademyReviewEvidenceLevel;
}): RecommendationReviewDimension {
  const estimate = input.report.estimatedWeeklyWage;
  const budget = input.brief?.weeklyWageBudget;
  if (estimate === undefined) {
    return {
      key: "priceValueCalibration",
      label: "Price/value calibration",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "No preserved wage estimate exists for this recommendation, so value calibration stays unresolved.",
    };
  }
  if (budget === undefined) {
    return {
      key: "priceValueCalibration",
      label: "Price/value calibration",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "The recommendation preserved a price ask, but the academy brief budget did not survive with it.",
    };
  }
  const outcomeScore = input.overallScore;
  if (outcomeScore === undefined && !input.terminalFailure) {
    return {
      key: "priceValueCalibration",
      label: "Price/value calibration",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "The wage context is preserved, but the pathway still lacks enough outcome evidence to judge value honestly.",
    };
  }

  const ratio = estimate / Math.max(1, budget);
  const budgetFitScore = ratio <= 1
    ? clamp(Math.round(82 + (1 - ratio) * 18), 0, 100)
    : clamp(Math.round(82 - Math.min(1.5, ratio - 1) * 55), 0, 100);
  const score = clamp(
    Math.round(budgetFitScore * 0.45 + (outcomeScore ?? 18) * 0.55),
    0,
    100,
  );
  const status = reviewDimensionStatus(score);
  const budgetLabel = formatWeeklyWage(budget);
  const estimateLabel = formatWeeklyWage(estimate);

  let summary = `The report priced the player at ${estimateLabel} against a brief budget of ${budgetLabel}.`;
  if (status === "positive") {
    summary = `${summary} The later pathway returned credible value for that ask.`;
  } else if (status === "mixed") {
    summary = `${summary} The later return stayed mixed, so the value call was only partly justified.`;
  } else {
    summary = `${summary} The later pathway did not justify that outlay.`;
  }

  return {
    key: "priceValueCalibration",
    label: "Price/value calibration",
    status,
    evidenceLevel: input.evidenceLevel === "limited" ? "partial" : input.evidenceLevel,
    score,
    summary,
  };
}

function buildSupportAdaptationDimension(input: {
  outcome: AcademyRecommendationOutcomeEvidence;
  placementClubId: string;
  horizon: number;
  ratingSeasons: number;
}): RecommendationReviewDimension {
  const { outcome, placementClubId, horizon, ratingSeasons } = input;
  const seniorExposure = outcome.appearances > 0;
  const retainedContract = outcome.contractClubIdAtReview === placementClubId;
  const activePathway = outcome.pathwayStatus === "academy" || outcome.pathwayStatus === "unknown";

  if (!seniorExposure && activePathway && outcome.movementIds.length <= 1) {
    return {
      key: "supportAdaptationFit",
      label: "Support/adaptation fit",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "The player is still inside the pathway with too little senior evidence to judge support and adaptation honestly.",
    };
  }

  let score: number;
  switch (outcome.pathwayStatus) {
    case "firstTeam":
      score = retainedContract ? 84 : 72;
      break;
    case "loan":
      score = retainedContract
        ? (seniorExposure ? 78 : 52)
        : (seniorExposure ? 64 : 45);
      break;
    case "academy":
      score = seniorExposure ? 68 : 50;
      break;
    case "transferred":
      score = seniorExposure ? 56 : 38;
      break;
    case "unknown":
      score = seniorExposure ? 58 : 42;
      break;
    case "freeAgent":
      score = 22;
      break;
    case "released":
      score = 18;
      break;
    case "retired":
      score = 12;
      break;
    case "footballExit":
      score = 0;
      break;
  }

  if (seniorExposure) {
    score = clamp(
      score + Math.round(Math.min(10, outcome.appearances / Math.max(1, horizon * 18) * 10)),
      0,
      100,
    );
  }
  const status = reviewDimensionStatus(score);
  let summary = "The destination environment is still hard to read from preserved evidence.";
  if (status === "positive") {
    summary = outcome.pathwayStatus === "loan"
      ? "The club kept the contract and used a structured loan, which suggests active support for adaptation."
      : "The player stayed inside the original pathway and reached senior minutes, which suggests the environment supported adaptation.";
  } else if (status === "mixed") {
    summary = outcome.pathwayStatus === "transferred"
      ? "The player found a route, but it moved away from the original club before support fit was clearly proven."
      : "Some adaptation support is visible, but the pathway still looks uneven rather than settled.";
  } else if (status === "negative") {
    summary = "The pathway broke before the player settled, so the support and adaptation fit looks poor.";
  }

  return {
    key: "supportAdaptationFit",
    label: "Support/adaptation fit",
    status,
    evidenceLevel: seniorExposure
      ? evidenceLevelFor(ratingSeasons, horizon, outcome.appearances, outcome.pathwayStatus)
      : ["released", "retired", "footballExit", "transferred", "freeAgent"].includes(outcome.pathwayStatus)
        ? "partial"
        : "limited",
    score,
    summary,
  };
}

function buildPathwayQualityDimension(input: {
  outcome: AcademyRecommendationOutcomeEvidence;
  performanceScore: number | undefined;
  timingScore: number;
  horizon: number;
  ratingSeasons: number;
}): RecommendationReviewDimension {
  const { outcome, performanceScore, timingScore, horizon, ratingSeasons } = input;
  const terminalOrExternal = ["released", "retired", "footballExit", "transferred", "freeAgent"]
    .includes(outcome.pathwayStatus);

  if (performanceScore === undefined && !terminalOrExternal && !(outcome.pathwayStatus === "loan" && outcome.appearances > 0)) {
    return {
      key: "pathwayQuality",
      label: "Pathway quality",
      status: "insufficientEvidence",
      evidenceLevel: evidenceLevelFor(ratingSeasons, horizon, outcome.appearances, outcome.pathwayStatus),
      summary: "The player remains on an academy track with too little match evidence to rate pathway quality honestly.",
    };
  }

  const score = performanceScore !== undefined
    ? clamp(
        Math.round(
          pathwayScore(outcome.pathwayStatus) * 0.35
          + timingScore * 0.35
          + performanceScore * 0.3,
        ),
        0,
        100,
      )
    : outcome.pathwayStatus === "loan" && outcome.appearances > 0
      ? clamp(Math.round(68 + Math.min(12, outcome.appearances / Math.max(1, horizon * 18) * 12)), 0, 100)
      : clamp(
          Math.round(pathwayScore(outcome.pathwayStatus) * 0.6 + timingScore * 0.4),
          0,
          100,
        );
  const status = reviewDimensionStatus(score);
  let summary = "The pathway is still forming.";
  if (status === "positive") {
    if (outcome.avgRating !== undefined && outcome.appearances > 0) {
      summary = `Reached ${humanizePathway(outcome.pathwayStatus)} by age ${outcome.ageAtReview} with ${outcome.appearances} appearances at ${outcome.avgRating.toFixed(1)}.`;
    } else {
      summary = `The player reached a credible ${humanizePathway(outcome.pathwayStatus)} route by age ${outcome.ageAtReview}.`;
    }
  } else if (status === "mixed") {
    summary = outcome.pathwayStatus === "loan"
      ? "A working loan pathway appeared, but the longer-term route is still only partly proven."
      : "The player found some traction, but the pathway quality stayed mixed rather than decisive.";
  } else if (status === "negative") {
    summary = "The pathway ended before the player established stable football progress.";
  }

  return {
    key: "pathwayQuality",
    label: "Pathway quality",
    status,
    evidenceLevel: evidenceLevelFor(ratingSeasons, horizon, outcome.appearances, outcome.pathwayStatus),
    score,
    summary,
  };
}

function buildRevisionQualityDimension(
  reports: ScoutReport[],
): RecommendationReviewDimension {
  if (reports.length < 2) {
    return {
      key: "revisionQuality",
      label: "Revision quality",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
    };
  }

  const seenObservationIds = new Set(reports[0].evidenceObservationIds ?? []);
  const totalNewObservationIds = new Set<string>();
  let revisionsWithNewEvidence = 0;
  let revisionsWithoutNewEvidence = 0;
  let changedWithNewEvidence = 0;

  for (let index = 1; index < reports.length; index += 1) {
    const report = reports[index];
    const newObservationIds = (report.evidenceObservationIds ?? []).filter((id) => !seenObservationIds.has(id));
    if (newObservationIds.length > 0) {
      revisionsWithNewEvidence += 1;
      newObservationIds.forEach((id) => totalNewObservationIds.add(id));
      if (opinionChangedBetween(reports[index - 1], report)) changedWithNewEvidence += 1;
    } else {
      revisionsWithoutNewEvidence += 1;
    }
    (report.evidenceObservationIds ?? []).forEach((id) => seenObservationIds.add(id));
  }

  if (revisionsWithNewEvidence === 0) {
    return {
      key: "revisionQuality",
      label: "Revision quality",
      status: "insufficientEvidence",
      evidenceLevel: "limited",
      summary: "Later revisions exist, but no new recorded observation evidence was preserved with them.",
    };
  }

  const first = reports[0];
  const last = reports[reports.length - 1];
  const qualityDelta = last.qualityScore - first.qualityScore;
  const score = clamp(
    Math.round(
      60
      + Math.min(15, totalNewObservationIds.size * 5)
      + (changedWithNewEvidence > 0 ? 10 : 0)
      + Math.max(-10, Math.min(10, qualityDelta / 2))
      - revisionsWithoutNewEvidence * 8,
    ),
    0,
    100,
  );
  const status = reviewDimensionStatus(score);
  const observationLabel = `${totalNewObservationIds.size} new observation record${totalNewObservationIds.size === 1 ? "" : "s"}`;

  let summary = `Later revisions added ${observationLabel}, but the preserved revision trail still reads mixed.`;
  if (status === "positive") {
    summary = changedWithNewEvidence > 0
      ? `Later revisions added ${observationLabel} and updated the call instead of pretending the first draft was final.`
      : `Later revisions added ${observationLabel} and strengthened the case without forcing a theatrical opinion swing.`;
  } else if (status === "negative") {
    summary = `Some later revisions added ${observationLabel}, but part of the revision trail still moved without clearly recorded new support.`;
  }

  return {
    key: "revisionQuality",
    label: "Revision quality",
    status,
    evidenceLevel: revisionsWithoutNewEvidence === 0 ? "full" : "partial",
    score,
    summary,
  };
}

function buildPlayerFacingDimensions(input: {
  report: ScoutReport;
  brief?: AcademyRecruitmentBrief;
  placementClubId: string;
  outcome: AcademyRecommendationOutcomeEvidence;
  overallScore: number | undefined;
  performanceScore: number | undefined;
  timingScore: number;
  terminalFailure: boolean;
  horizon: number;
  ratingSeasons: number;
  revisions: ScoutReport[];
}): RecommendationReviewDimension[] {
  const baseEvidenceLevel = evidenceLevelFor(
    input.ratingSeasons,
    input.horizon,
    input.outcome.appearances,
    input.outcome.pathwayStatus,
  );
  return [
    buildPriceValueDimension({
      report: input.report,
      brief: input.brief,
      overallScore: input.overallScore,
      terminalFailure: input.terminalFailure,
      evidenceLevel: baseEvidenceLevel,
    }),
    buildSupportAdaptationDimension({
      outcome: input.outcome,
      placementClubId: input.placementClubId,
      horizon: input.horizon,
      ratingSeasons: input.ratingSeasons,
    }),
    buildPathwayQualityDimension({
      outcome: input.outcome,
      performanceScore: input.performanceScore,
      timingScore: input.timingScore,
      horizon: input.horizon,
      ratingSeasons: input.ratingSeasons,
    }),
    buildRevisionQualityDimension(input.revisions),
  ];
}

function humanizePathway(pathway: AcademyPathwayStatus): string {
  switch (pathway) {
    case "firstTeam": return "first-team football";
    case "loan": return "a senior loan route";
    case "transferred": return "a transfer route";
    case "academy": return "the academy";
    case "freeAgent": return "free agency";
    case "footballExit": return "a football exit";
    default: return pathway.replace(/([A-Z])/g, " $1").toLowerCase();
  }
}

function findingsFor(
  outcome: AcademyRecommendationOutcomeEvidence,
  performanceScore: number | undefined,
  riskAssessment: AcademyRiskAssessment,
  convictionAssessment: AcademyConvictionAssessment,
): string[] {
  const findings: string[] = [];
  if (outcome.appearances > 0 && outcome.avgRating !== undefined) {
    findings.push(
      `${outcome.appearances} canonical appearances at an average rating of ${outcome.avgRating.toFixed(1)}.`,
    );
  } else {
    findings.push("No senior match-rating evidence was recorded during this checkpoint window.");
  }
  findings.push(`Pathway status at the checkpoint: ${outcome.pathwayStatus}.`);
  if (outcome.injuryCount > 0) {
    findings.push(
      `${outcome.injuryCount} recorded injuries accounted for ${outcome.weeksMissed} recovery weeks.`,
    );
  } else {
    findings.push("No injuries were recorded in the canonical injury history during the window.");
  }
  if (performanceScore === undefined) {
    findings.push("The recommendation remains open to re-evaluation because performance evidence is limited.");
  }
  if (riskAssessment === "missed") findings.push("The original report did not flag the injury risk that materialized.");
  if (riskAssessment === "correctlyFlagged") findings.push("An injury risk identified in the report later materialized.");
  if (convictionAssessment === "overconfident") findings.push("The original conviction exceeded the observed outcome evidence.");
  if (convictionAssessment === "understated") findings.push("The observed outcome exceeded the report's original conviction.");
  return findings;
}

/** Complete one scheduled checkpoint. Future data is excluded at the due date. */
export function completeAcademyRecommendationReview(
  input: CompleteAcademyRecommendationReviewInput,
): CompleteAcademyRecommendationReviewResult {
  const seasonLength = input.seasonLength ?? DEFAULT_SEASON_LENGTH;
  const existing = input.review as AcademyRecommendationReview;
  if (existing.status === "complete") {
    return { status: "unchanged", review: existing, failures: [] };
  }

  const failures = validatePlacementCausality(
    input.scoutingCase,
    input.report,
    input.placementReport,
    input.clubDecision,
  );
  const expectedId = getAcademyRecommendationReviewId(
    input.scoutingCase.id,
    input.placementReport.id,
    existing.checkpoint,
  );
  if (
    existing.id !== expectedId
    || existing.caseId !== input.scoutingCase.id
    || existing.reportId !== input.report.id
    || existing.playerId !== input.player.id
    || existing.clubId !== input.placementReport.targetClubId
  ) failures.push("reviewMismatch");

  const placementMovement = canonicalPlacementMovement(
    input.player.id,
    input.placementReport.targetClubId,
    input.placementReport,
    input.movementHistory,
    seasonLength,
  );
  if (!placementMovement) failures.push("missingCanonicalYouthSigning");
  if (failures.length > 0 || !placementMovement) {
    return { status: "invalid", review: existing, failures };
  }

  const dueDate = { week: existing.dueWeek, season: existing.dueSeason };
  if (compareDates(
    { week: input.currentWeek, season: input.currentSeason },
    dueDate,
    seasonLength,
  ) < 0) {
    return { status: "notDue", review: existing, failures: [] };
  }

  const horizon = checkpointHorizon(existing.checkpoint);
  const placementDate = { week: placementMovement.week, season: placementMovement.season };
  const ratings = canonicalRatings(input.player.seasonRatings ?? [], placementMovement.season, horizon);
  const injuries = injuriesInWindow(
    input.player.injuryHistory?.injuries ?? [],
    placementDate,
    dueDate,
    seasonLength,
  );
  const movements = movementsInWindow(
    input.movementHistory,
    input.player.id,
    placementDate,
    dueDate,
    seasonLength,
  );
  const appearances = ratings.reduce((total, rating) => total + rating.appearances, 0);
  const avgRating = weightedAverageRating(ratings);
  const weeksMissed = clamp(
    injuries.reduce((total, injury) => total + injury.recoveryWeeks, 0),
    0,
    horizon * seasonLength,
  );
  const pathway = derivePathway(
    input.placementReport.targetClubId,
    movements,
    appearances,
    input.placementReport.placementType,
  );
  const inferredAgeAtPlacement = input.brief?.fulfilledPlayerAge
    ?? Math.max(14, input.player.age - Math.max(0, input.currentSeason - placementMovement.season));
  const ageAtReview = inferredAgeAtPlacement + horizon;
  const outcome: AcademyRecommendationOutcomeEvidence = {
    seasonsReviewed: ratings.map((rating) => rating.season),
    movementIds: movements.map((movement) => movement.id),
    injuryIds: injuries.map((injury) => injury.id),
    appearances,
    avgRating,
    goals: ratings.reduce((total, rating) => total + rating.goals, 0),
    assists: ratings.reduce((total, rating) => total + rating.assists, 0),
    cleanSheets: ratings.reduce((total, rating) => total + rating.cleanSheets, 0),
    injuryCount: injuries.length,
    weeksMissed,
    pathwayStatus: pathway.status,
    clubIdAtReview: pathway.clubId,
    contractClubIdAtReview: pathway.contractClubId,
    ageAtReview,
  };

  const performanceScore = calculatePerformanceScore(avgRating, appearances, horizon);
  const availabilityScore = input.player.injuryHistory
    ? clamp(Math.round(100 - weeksMissed / (horizon * seasonLength) * 100), 0, 100)
    : undefined;
  const timingScore = calculateTimingScore(appearances, ageAtReview, pathway.status, horizon);
  const clubFitScore = calculateClubFitScore(
    pathway,
    input.placementReport.targetClubId,
    performanceScore,
  );
  const terminalFailure = ["released", "retired", "footballExit"].includes(pathway.status);
  const overallScore = performanceScore !== undefined
    ? Math.round(
        performanceScore * 0.5
        + clubFitScore * 0.25
        + timingScore * 0.15
        + (availabilityScore ?? 50) * 0.1,
      )
    : terminalFailure
      ? Math.round(
          pathwayScore(pathway.status) * 0.5
          + clubFitScore * 0.3
          + (availabilityScore ?? 50) * 0.2,
        )
      : undefined;
  const conviction = assessConviction(input.report, overallScore);
  const riskAssessment = assessInjuryRisk(input.report, weeksMissed);
  const revisions = reportsThroughDate(
    preservedCaseReports(
      input.scoutingCase,
      input.report,
      input.caseReports,
    ),
    dueDate,
    seasonLength,
  );
  const reviewEvidence: RecommendationReview["evidence"] = [
    ...movements.map((movement) => ({
      source: "movement" as const,
      description: movementDescription(movement),
      sourceId: movement.id,
    })),
    ...ratings.map((rating) => ({
      source: "seasonRating" as const,
      description: `Season ${rating.season}: ${rating.appearances} appearances, ${rating.avgRating.toFixed(1)} average rating.`,
      sourceId: `season_rating_${input.player.id}_s${rating.season}`,
    })),
    ...injuries.map((injury) => ({
      source: "injury" as const,
      description: `${injury.severity} ${injury.type} injury with ${injury.recoveryWeeks} recovery weeks.`,
      sourceId: injury.id,
    })),
  ];
  const playerFacingDimensions = buildPlayerFacingDimensions({
    report: input.report,
    brief: input.brief,
    placementClubId: input.placementReport.targetClubId,
    outcome,
    overallScore,
    performanceScore,
    timingScore,
    terminalFailure,
    horizon,
    ratingSeasons: ratings.length,
    revisions,
  });
  const verdict = verdictFor(overallScore, pathway.status);
  const findings = [
    ...playerFacingDimensions.map((dimension) => `${dimension.label}: ${dimension.summary}`),
    ...findingsFor(outcome, performanceScore, riskAssessment, conviction.assessment),
  ];

  const review: AcademyRecommendationReview = {
    ...existing,
    status: "complete",
    completedWeek: existing.dueWeek,
    completedSeason: existing.dueSeason,
    placementReportId: input.placementReport.id,
    placementMovementId: placementMovement.id,
    horizonSeasons: horizon,
    reportQualityAtRecommendation: input.report.qualityScore,
    convictionAtRecommendation: input.report.conviction,
    reportRevisionCount: revisions.length,
    opinionRevised: didOpinionChange(revisions),
    categoryScores: {
      ...(performanceScore !== undefined ? { potential: performanceScore } : {}),
      ...(performanceScore !== undefined || terminalFailure ? { roleFit: clubFitScore } : {}),
      // Character is intentionally left unresolved: ratings, movements, and
      // injuries cannot honestly prove a character judgment.
    },
    confidenceCalibration: conviction.calibration,
    clubFitScore,
    timingScore,
    overallScore,
    playerFacingDimensions,
    findings,
    evidence: reviewEvidence,
    verdict,
    evidenceLevel: evidenceLevelFor(ratings.length, horizon, appearances, pathway.status),
    convictionAssessment: conviction.assessment,
    injuryRiskAssessment: riskAssessment,
    outcomeEvidence: outcome,
  };

  return { status: "completed", review, failures: [] };
}

export interface CompleteDueAcademyRecommendationReviewsInput
  extends Omit<CompleteAcademyRecommendationReviewInput, "review"> {
  reviews: RecommendationReview[];
}

/** Complete every due scheduled checkpoint for one placement case. */
export function completeDueAcademyRecommendationReviews(
  input: CompleteDueAcademyRecommendationReviewsInput,
): {
  reviews: AcademyRecommendationReview[];
  completedIds: string[];
  invalidIds: string[];
} {
  const completedIds: string[] = [];
  const invalidIds: string[] = [];
  const reviews = input.reviews.map((review) => {
    const result = completeAcademyRecommendationReview({ ...input, review });
    if (result.status === "completed") completedIds.push(result.review.id);
    if (result.status === "invalid") invalidIds.push(result.review.id);
    return result.review;
  });
  return { reviews, completedIds, invalidIds };
}
