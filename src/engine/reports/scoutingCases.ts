import type {
  ClubDecision,
  ClubDecisionOutcome,
  GameState,
  MarketplaceBid,
  PlacementReport,
  ProfessionalCaseContext,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
  ScoutingQuestionId,
} from "@/engine/core/types";
import {
  addGameWeeksWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";
import {
  buildFollowUpObservationComparisons,
  type FollowUpObservationComparison,
  type ObservationContextChange,
} from "@/engine/observation/informationGain";

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function laterDate(
  left: { week: number; season: number },
  right: { week: number; season: number },
): { week: number; season: number } {
  if (right.season > left.season) return right;
  if (right.season === left.season && right.week > left.week) return right;
  return left;
}

export function nextGameWeek(
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): { week: number; season: number } {
  return addGameWeeksWithSeasonLength({ week, season }, 1, seasonLength);
}

export function isGameDateDue(
  currentWeek: number,
  currentSeason: number,
  dueWeek: number,
  dueSeason: number,
): boolean {
  return isGameDateAtOrAfter(
    { week: currentWeek, season: currentSeason },
    { week: dueWeek, season: dueSeason },
  );
}

export function getScoutingCaseId(scoutId: string, playerId: string, briefId?: string): string {
  return briefId
    ? `case_${scoutId}_${playerId}_${briefId}`
    : `case_${scoutId}_${playerId}`;
}

function normalizeCase(record: ScoutingCase): ScoutingCase {
  return {
    ...record,
    status: record.status ?? "open",
    reportIds: record.reportIds ?? [],
    listingIds: record.listingIds ?? [],
    deliveryIds: record.deliveryIds ?? [],
    decisionIds: record.decisionIds ?? [],
    placementReportIds: record.placementReportIds ?? [],
    hypothesisIds: record.hypothesisIds ?? [],
    reviewIds: record.reviewIds ?? [],
    professionalContext: record.professionalContext
      ? {
          ...record.professionalContext,
          stakeholderRefs: record.professionalContext.stakeholderRefs ?? [],
          judgmentDecisionIds: record.professionalContext.judgmentDecisionIds ?? [],
        }
      : undefined,
  };
}

function createCase(
  id: string,
  scoutId: string,
  playerId: string,
  week: number,
  season: number,
  legacyUnlinked = false,
): ScoutingCase {
  return {
    id,
    scoutId,
    playerId,
    openedWeek: week,
    openedSeason: season,
    lastUpdatedWeek: week,
    lastUpdatedSeason: season,
    status: "open",
    reportIds: [],
    listingIds: [],
    deliveryIds: [],
    decisionIds: [],
    placementReportIds: [],
    hypothesisIds: [],
    reviewIds: [],
    ...(legacyUnlinked ? { legacyUnlinked: true } : {}),
  };
}

export interface ScoutingCaseQuestion {
  text: string;
  source: "professionalContext" | "structuredAssessment" | "recruitmentNeed" | "caseFallback";
  persistent: boolean;
  questionId?: ScoutingQuestionId;
  reportId?: string;
}

export interface ScoutingCaseUnknownSummary {
  id: string;
  statement: string;
  category?: string;
  status: "open" | "reframed";
  firstRaisedReportId: string;
  latestReportId: string;
  sourceEvidenceIds: string[];
}

export interface ScoutingCaseContextChange extends ObservationContextChange {
  comparisonId: string;
  observationId: string;
  week: number;
  season: number;
}

export interface ScoutingCaseCallbackSummary {
  id: string;
  week: number;
  season: number;
  kind: "professionalConsequence" | "pathwayFollowUp";
  title: string;
  detail: string;
}

export interface ScoutingCaseAccountability {
  status:
    | "buildingEvidence"
    | "awaitingDecision"
    | "activeDecision"
    | "awaitingOutcome"
    | "vindicated"
    | "mixed"
    | "challenged"
    | "closed";
  stakedConviction?: ScoutReport["conviction"];
  latestDecisionId?: string;
  latestDecisionOutcome?: ClubDecision["outcome"];
  latestReviewId?: string;
  latestReviewScore?: number;
  summary: string;
}

/** Derived longitudinal state; persisted observations and reports remain authoritative. */
export interface ScoutingCaseDepth {
  caseId: string;
  playerId: string;
  centralQuestion: ScoutingCaseQuestion;
  questionHistory: ScoutingCaseQuestion[];
  unknowns: ScoutingCaseUnknownSummary[];
  comparisons: FollowUpObservationComparison[];
  contextChanges: ScoutingCaseContextChange[];
  callbacks: ScoutingCaseCallbackSummary[];
  accountability: ScoutingCaseAccountability;
}

export interface ScoutingCaseDepthIndex {
  reportsByCaseId: Map<string, ScoutReport[]>;
  decisionsByCaseId: Map<string, ClubDecision[]>;
  observationsByPlayerId: Map<string, Array<GameState["observations"][string]>>;
  reviewsByCaseId: Map<string, Array<GameState["recommendationReviews"][string]>>;
  professionalFactsByCaseId: Map<
    string,
    Array<GameState["consequenceState"]["facts"][string]>
  >;
  followUpMessagesByCaseId: Map<string, GameState["inbox"]>;
}

function pushIndexed<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

/** Enumerate the casebook once for screens or weekly projections that open many cases. */
export function buildScoutingCaseDepthIndex(state: GameState): ScoutingCaseDepthIndex {
  const reportsByCaseId = new Map<string, ScoutReport[]>();
  for (const report of Object.values(state.reports ?? {})) {
    if (report.caseId) pushIndexed(reportsByCaseId, report.caseId, report);
  }
  const decisionsByCaseId = new Map<string, ClubDecision[]>();
  for (const decision of Object.values(state.clubDecisions ?? {})) {
    if (decision.caseId) pushIndexed(decisionsByCaseId, decision.caseId, decision);
  }
  const observationsByPlayerId = new Map<string, Array<GameState["observations"][string]>>();
  for (const observation of Object.values(state.observations ?? {})) {
    pushIndexed(observationsByPlayerId, observation.playerId, observation);
  }
  const reviewsByCaseId = new Map<string, Array<GameState["recommendationReviews"][string]>>();
  for (const review of Object.values(state.recommendationReviews ?? {})) {
    if (review.caseId) pushIndexed(reviewsByCaseId, review.caseId, review);
  }
  const professionalFactsByCaseId = new Map<
    string,
    Array<GameState["consequenceState"]["facts"][string]>
  >();
  for (const fact of Object.values(state.consequenceState?.facts ?? {})) {
    const caseId = fact.kind === "professionalCaseCallback"
      && typeof fact.metadata?.caseId === "string"
      ? fact.metadata.caseId
      : undefined;
    if (caseId) pushIndexed(professionalFactsByCaseId, caseId, fact);
  }
  const followUpMessagesByCaseId = new Map<string, GameState["inbox"]>();
  for (const message of state.inbox ?? []) {
    if (!message.id.startsWith("prospect-follow-up:")) continue;
    const caseId = message.id.slice("prospect-follow-up:".length).split(":", 1)[0];
    if (caseId) pushIndexed(followUpMessagesByCaseId, caseId, message);
  }
  return {
    reportsByCaseId,
    decisionsByCaseId,
    observationsByPlayerId,
    reviewsByCaseId,
    professionalFactsByCaseId,
    followUpMessagesByCaseId,
  };
}

const ASSESSMENT_QUESTION_TEXT: Record<ScoutingQuestionId, string> = {
  execution: "Will the player's technique hold when time and space shrink?",
  decisions: "Will the player's decisions remain sound when the picture changes faster?",
  movement: "Will the player's movement still create value in a different tactical role?",
  pressure: "What changes when pressure, mistakes, and setbacks accumulate?",
  repeatability: "Can the player repeat the useful action across a full and different test?",
  projection: "Which current quality is most likely to translate to the next level?",
};

function isOnOrAfterCase(
  week: number,
  season: number,
  scoutingCase: ScoutingCase,
): boolean {
  return season > scoutingCase.openedSeason
    || (season === scoutingCase.openedSeason && week >= scoutingCase.openedWeek);
}

function reportsForCase(
  state: GameState,
  scoutingCase: ScoutingCase,
  index: ScoutingCaseDepthIndex,
): ScoutReport[] {
  const reports = new Map(
    (index.reportsByCaseId.get(scoutingCase.id) ?? []).map((report) => [report.id, report]),
  );
  for (const reportId of scoutingCase.reportIds ?? []) {
    const report = state.reports?.[reportId];
    if (report) reports.set(report.id, report);
  }
  return [...reports.values()]
    .sort((left, right) =>
      left.submittedSeason - right.submittedSeason
      || left.submittedWeek - right.submittedWeek
      || (left.revision ?? 1) - (right.revision ?? 1)
      || left.id.localeCompare(right.id),
    );
}

function questionFromReport(report: ScoutReport): ScoutingCaseQuestion | undefined {
  const questionId = report.evidenceAssessment?.nextTest.questionId
    ?? report.evidenceAssessment?.questionId;
  if (questionId) {
    return {
      text: ASSESSMENT_QUESTION_TEXT[questionId],
      source: "structuredAssessment",
      persistent: true,
      questionId,
      reportId: report.id,
    };
  }
  const need = report.recruitmentNeed?.trim();
  if (!need) return undefined;
  return {
    text: `Can this player meet ${need.toLowerCase()} without the recommendation outrunning the evidence?`,
    source: "recruitmentNeed",
    persistent: true,
    reportId: report.id,
  };
}

function deriveQuestions(
  scoutingCase: ScoutingCase,
  reports: readonly ScoutReport[],
): { centralQuestion: ScoutingCaseQuestion; history: ScoutingCaseQuestion[] } {
  const professionalQuestion = scoutingCase.professionalContext?.centralQuestion.trim();
  const history: ScoutingCaseQuestion[] = [];
  if (professionalQuestion) {
    history.push({
      text: professionalQuestion,
      source: "professionalContext",
      persistent: true,
    });
  }
  for (const report of reports) {
    const question = questionFromReport(report);
    if (question && !history.some((candidate) =>
      candidate.text === question.text && candidate.questionId === question.questionId,
    )) {
      history.push(question);
    }
  }
  const centralQuestion = history[0] ?? {
    text: "What new evidence would change the current recommendation?",
    source: "caseFallback" as const,
    persistent: false,
  };
  return { centralQuestion, history: history.length > 0 ? history : [centralQuestion] };
}

function deriveUnknowns(reports: readonly ScoutReport[]): ScoutingCaseUnknownSummary[] {
  const latest = reports.at(-1);
  const activeIds = new Set(latest?.evidenceAssessment?.unknowns.map((unknown) => unknown.id) ?? []);
  const byId = new Map<string, ScoutingCaseUnknownSummary>();
  for (const report of reports) {
    for (const unknown of report.evidenceAssessment?.unknowns ?? []) {
      const existing = byId.get(unknown.id);
      byId.set(unknown.id, {
        id: unknown.id,
        statement: unknown.statement,
        category: unknown.category,
        status: activeIds.has(unknown.id) ? "open" : "reframed",
        firstRaisedReportId: existing?.firstRaisedReportId ?? report.id,
        latestReportId: report.id,
        sourceEvidenceIds: [...new Set([
          ...(existing?.sourceEvidenceIds ?? []),
          ...unknown.sourceEvidenceIds,
        ])],
      });
    }
  }
  return [...byId.values()].sort((left, right) =>
    (left.status === "open" ? 0 : 1) - (right.status === "open" ? 0 : 1)
    || left.id.localeCompare(right.id),
  );
}

function deriveCallbacks(
  scoutingCase: ScoutingCase,
  index: ScoutingCaseDepthIndex,
): ScoutingCaseCallbackSummary[] {
  const callbacks: ScoutingCaseCallbackSummary[] = [];
  for (const fact of index.professionalFactsByCaseId.get(scoutingCase.id) ?? []) {
    callbacks.push({
      id: fact.id,
      week: fact.observedAt.week,
      season: fact.observedAt.season,
      kind: "professionalConsequence",
      title: fact.metadata?.outcome === "setback" || fact.value === "setback"
        ? "The accepted risk came due"
        : "The earlier judgment created an opening",
      detail: typeof fact.metadata?.detail === "string"
        ? fact.metadata.detail
        : "A delayed consequence entered the permanent case record.",
    });
  }
  for (const message of index.followUpMessagesByCaseId.get(scoutingCase.id) ?? []) {
    callbacks.push({
      id: message.id,
      week: message.week,
      season: message.season,
      kind: "pathwayFollowUp",
      title: message.title,
      detail: message.body,
    });
  }
  return callbacks.sort((left, right) =>
    left.season - right.season
    || left.week - right.week
    || left.id.localeCompare(right.id),
  );
}

function deriveAccountability(
  state: GameState,
  scoutingCase: ScoutingCase,
  reports: readonly ScoutReport[],
  index: ScoutingCaseDepthIndex,
): ScoutingCaseAccountability {
  const decisionMap = new Map(
    (index.decisionsByCaseId.get(scoutingCase.id) ?? []).map((decision) => [decision.id, decision]),
  );
  for (const decisionId of scoutingCase.decisionIds ?? []) {
    const decision = state.clubDecisions?.[decisionId];
    if (decision) decisionMap.set(decision.id, decision);
  }
  const decisions = [...decisionMap.values()]
    .sort((left, right) =>
      left.decidedSeason - right.decidedSeason
      || left.decidedWeek - right.decidedWeek
      || left.id.localeCompare(right.id),
    );
  const reviewMap = new Map(
    (index.reviewsByCaseId.get(scoutingCase.id) ?? []).map((review) => [review.id, review]),
  );
  for (const reviewId of scoutingCase.reviewIds ?? []) {
    const review = state.recommendationReviews?.[reviewId];
    if (review) reviewMap.set(review.id, review);
  }
  const reviews = [...reviewMap.values()]
    .sort((left, right) =>
      (left.completedSeason ?? left.dueSeason) - (right.completedSeason ?? right.dueSeason)
      || (left.completedWeek ?? left.dueWeek) - (right.completedWeek ?? right.dueWeek)
      || left.id.localeCompare(right.id),
    );
  const latestReport = reports.at(-1);
  const latestDecision = decisions.at(-1);
  const latestReview = reviews.filter((review) => review.status === "complete").at(-1);
  const reviewScore = latestReview?.overallScore;

  if (reviewScore !== undefined) {
    const status = reviewScore >= 70 ? "vindicated" : reviewScore < 50 ? "challenged" : "mixed";
    return {
      status,
      stakedConviction: latestReport?.conviction,
      latestDecisionId: latestDecision?.id,
      latestDecisionOutcome: latestDecision?.outcome,
      latestReviewId: latestReview?.id,
      latestReviewScore: reviewScore,
      summary: status === "vindicated"
        ? "Later observable career evidence supported the recommendation, and the original stake remains on record."
        : status === "challenged"
          ? "Later observable career evidence challenged the recommendation; the miss remains part of the scout's record."
          : "The later evidence is mixed, so the recommendation remains a qualified lesson rather than a clean win or miss.",
    };
  }
  if (latestDecision?.outcome === "accepted") {
    return {
      status: "awaitingOutcome",
      stakedConviction: latestReport?.conviction,
      latestDecisionId: latestDecision.id,
      latestDecisionOutcome: latestDecision.outcome,
      summary: "The recommendation produced a placement, but the long-term review has not settled the quality of the judgment.",
    };
  }
  if (latestDecision?.outcome === "trial" || latestDecision?.outcome === "followUpRequested") {
    return {
      status: "activeDecision",
      stakedConviction: latestReport?.conviction,
      latestDecisionId: latestDecision.id,
      latestDecisionOutcome: latestDecision.outcome,
      summary: "The recommendation remains active and the next evidence test can still change the club's decision.",
    };
  }
  if (latestDecision?.outcome === "rejected") {
    return {
      status: "closed",
      stakedConviction: latestReport?.conviction,
      latestDecisionId: latestDecision.id,
      latestDecisionOutcome: latestDecision.outcome,
      summary: "The club declined the recommendation; the case preserves what was known and what remained uncertain at the time.",
    };
  }
  return latestReport
    ? {
        status: "awaitingDecision",
        stakedConviction: latestReport.conviction,
        summary: "A judgment has been filed and remains accountable to the next club decision and later career evidence.",
      }
    : {
        status: "buildingEvidence",
        summary: "The case is still building evidence and no formal recommendation has been staked.",
      };
}

export function buildScoutingCaseDepth(
  state: GameState,
  caseId: string,
  providedIndex?: ScoutingCaseDepthIndex,
): ScoutingCaseDepth | null {
  const scoutingCase = state.scoutingCases?.[caseId];
  if (!scoutingCase) return null;
  const index = providedIndex ?? buildScoutingCaseDepthIndex(state);
  const reports = reportsForCase(state, scoutingCase, index);
  const questions = deriveQuestions(scoutingCase, reports);
  const observations = (index.observationsByPlayerId.get(scoutingCase.playerId) ?? []).filter((observation) =>
    observation.playerId === scoutingCase.playerId
    && isOnOrAfterCase(observation.week, observation.season, scoutingCase),
  );
  const comparisons = buildFollowUpObservationComparisons(
    observations,
    scoutingCase.playerId,
    4,
  );
  const contextChanges = comparisons.flatMap((comparison) =>
    comparison.contextChanges.map((change) => ({
      ...change,
      comparisonId: comparison.id,
      observationId: comparison.secondObservationId,
      week: comparison.secondDate.week,
      season: comparison.secondDate.season,
    })),
  );

  return {
    caseId: scoutingCase.id,
    playerId: scoutingCase.playerId,
    centralQuestion: questions.centralQuestion,
    questionHistory: questions.history,
    unknowns: deriveUnknowns(reports),
    comparisons,
    contextChanges,
    callbacks: deriveCallbacks(scoutingCase, index),
    accountability: deriveAccountability(state, scoutingCase, reports, index),
  };
}

export interface OpenProfessionalScoutingCaseInput {
  scoutingCases: Record<string, ScoutingCase>;
  scoutId: string;
  playerId: string;
  week: number;
  season: number;
  context: ProfessionalCaseContext;
  briefId?: string;
}

/**
 * Open or enrich a case before a report exists. This lets discovery dilemmas,
 * evidence plans and stakeholder choices become part of the same causal case
 * that later owns the report, delivery and outcome.
 */
export function openProfessionalScoutingCase(
  input: OpenProfessionalScoutingCaseInput,
): { scoutingCases: Record<string, ScoutingCase>; scoutingCase: ScoutingCase } {
  const id = getScoutingCaseId(input.scoutId, input.playerId, input.briefId);
  const base = normalizeCase(
    input.scoutingCases[id]
      ?? createCase(id, input.scoutId, input.playerId, input.week, input.season),
  );
  const touched = laterDate(
    { week: base.lastUpdatedWeek, season: base.lastUpdatedSeason },
    { week: input.week, season: input.season },
  );
  const priorContext = base.professionalContext;
  const scoutingCase: ScoutingCase = {
    ...base,
    briefId: input.briefId ?? base.briefId,
    professionalContext: {
      ...(priorContext ?? input.context),
      stakeholderRefs: [
        ...new Set([
          ...(priorContext?.stakeholderRefs ?? []),
          ...input.context.stakeholderRefs,
        ]),
      ],
      judgmentDecisionIds: [
        ...new Set([
          ...(priorContext?.judgmentDecisionIds ?? []),
          ...input.context.judgmentDecisionIds,
        ]),
      ],
    },
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...input.scoutingCases, [id]: scoutingCase },
    scoutingCase,
  };
}

/** Link an authored report to the stable scout/player case, idempotently. */
export function ensureScoutingCaseForReport(
  scoutingCases: Record<string, ScoutingCase>,
  report: ScoutReport,
): {
  scoutingCases: Record<string, ScoutingCase>;
  scoutingCase: ScoutingCase;
  report: ScoutReport;
} {
  const id = report.caseId ?? getScoutingCaseId(report.scoutId, report.playerId, report.briefId);
  const base = normalizeCase(
    scoutingCases[id]
      ?? createCase(id, report.scoutId, report.playerId, report.submittedWeek, report.submittedSeason),
  );
  const touched = laterDate(
    { week: base.lastUpdatedWeek, season: base.lastUpdatedSeason },
    { week: report.submittedWeek, season: report.submittedSeason },
  );
  const reportHypothesisIds = Object.values(report.categoryVerdicts ?? {})
    .flatMap((verdict) => verdict?.hypothesisIds ?? []);
  const scoutingCase: ScoutingCase = {
    ...base,
    legacyUnlinked: false,
    status: base.status === "placed" ? "placed" : "reported",
    briefId: report.briefId ?? base.briefId,
    activeReportId: report.id,
    hypothesisIds: [...new Set([...(base.hypothesisIds ?? []), ...reportHypothesisIds])],
    reportIds: appendUnique(base.reportIds, report.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...scoutingCases, [id]: scoutingCase },
    scoutingCase,
    report: report.caseId === id ? report : { ...report, caseId: id },
  };
}

export function attachListingToCase(
  scoutingCases: Record<string, ScoutingCase>,
  caseId: string,
  listingId: string,
  week: number,
  season: number,
): Record<string, ScoutingCase> {
  const existing = scoutingCases[caseId];
  if (!existing) return scoutingCases;
  const touched = laterDate(
    { week: existing.lastUpdatedWeek, season: existing.lastUpdatedSeason },
    { week, season },
  );
  return {
    ...scoutingCases,
    [caseId]: {
      ...normalizeCase(existing),
      listingIds: appendUnique(existing.listingIds ?? [], listingId),
      lastUpdatedWeek: touched.week,
      lastUpdatedSeason: touched.season,
    },
  };
}

interface MarketplaceDeliveryInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  listing: ReportListing;
  bid: MarketplaceBid;
  week: number;
  season: number;
}

/** Record an intel sale. This function has no player/world input and cannot move a player. */
export function recordMarketplaceDelivery(input: MarketplaceDeliveryInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  delivery: ReportDelivery;
} {
  const linked = ensureScoutingCaseForReport(input.scoutingCases, input.report);
  const deliveryId = `delivery_marketplace_${input.listing.id}_${input.bid.id}`;
  const existing = input.reportDeliveries[deliveryId];
  const delivery: ReportDelivery = existing ?? {
    id: deliveryId,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    clubId: input.bid.clubId,
    channel: "marketplaceSale",
    status: "delivered",
    deliveredWeek: input.week,
    deliveredSeason: input.season,
    listingId: input.listing.id,
    bidId: input.bid.id,
    price: input.bid.amount,
  };
  const currentCase = linked.scoutingCases[linked.scoutingCase.id];
  const touched = laterDate(
    { week: currentCase.lastUpdatedWeek, season: currentCase.lastUpdatedSeason },
    { week: input.week, season: input.season },
  );
  const updatedCase: ScoutingCase = {
    ...currentCase,
    status: currentCase.status === "placed" ? "placed" : "delivered",
    listingIds: appendUnique(currentCase.listingIds, input.listing.id),
    deliveryIds: appendUnique(currentCase.deliveryIds, delivery.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...linked.scoutingCases, [updatedCase.id]: updatedCase },
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: delivery },
    report: linked.report,
    delivery,
  };
}

interface DirectPlacementDeliveryInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  placementReport: PlacementReport;
  seasonLength?: number;
}

export function recordDirectPlacementDelivery(input: DirectPlacementDeliveryInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  placementReport: PlacementReport;
  delivery: ReportDelivery;
} {
  const linked = ensureScoutingCaseForReport(input.scoutingCases, input.report);
  const deliveryId = input.placementReport.deliveryId
    ?? `delivery_placement_${input.placementReport.id}`;
  const due = input.placementReport.responseDueWeek && input.placementReport.responseDueSeason
    ? {
        week: input.placementReport.responseDueWeek,
        season: input.placementReport.responseDueSeason,
      }
    : nextGameWeek(
        input.placementReport.week,
        input.placementReport.season,
        input.seasonLength,
      );
  const placementReport: PlacementReport = {
    ...input.placementReport,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    deliveryId,
    responseDueWeek: due.week,
    responseDueSeason: due.season,
  };
  const delivery: ReportDelivery = input.reportDeliveries[deliveryId] ?? {
    id: deliveryId,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    clubId: placementReport.targetClubId,
    channel: "directPlacement",
    status: "awaitingDecision",
    deliveredWeek: placementReport.week,
    deliveredSeason: placementReport.season,
    placementReportId: placementReport.id,
  };
  const currentCase = linked.scoutingCases[linked.scoutingCase.id];
  const touched = laterDate(
    { week: currentCase.lastUpdatedWeek, season: currentCase.lastUpdatedSeason },
    { week: placementReport.week, season: placementReport.season },
  );
  const updatedCase: ScoutingCase = {
    ...currentCase,
    status: currentCase.status === "placed" ? "placed" : "delivered",
    placementReportIds: appendUnique(currentCase.placementReportIds, placementReport.id),
    deliveryIds: appendUnique(currentCase.deliveryIds, delivery.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...linked.scoutingCases, [updatedCase.id]: updatedCase },
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: delivery },
    report: linked.report,
    placementReport,
    delivery,
  };
}

interface ResolveDecisionInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions: Record<string, ClubDecision>;
  deliveryId: string;
  outcome: ClubDecisionOutcome;
  week: number;
  season: number;
  reason?: string;
  reasons?: string[];
  scoreBreakdown?: ClubDecision["scoreBreakdown"];
  requestedEvidenceCategory?: ClubDecision["requestedEvidenceCategory"];
  followUpDueWeek?: number;
  followUpDueSeason?: number;
}

export function resolveClubDecision(input: ResolveDecisionInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions: Record<string, ClubDecision>;
  decision?: ClubDecision;
} {
  const delivery = input.reportDeliveries[input.deliveryId];
  if (!delivery) return input;
  const decisionId = delivery.decisionId ?? `decision_${delivery.id}`;
  const existingDecision = input.clubDecisions[decisionId];
  if (existingDecision) {
    return { ...input, decision: existingDecision };
  }
  const decision: ClubDecision = {
    id: decisionId,
    caseId: delivery.caseId,
    deliveryId: delivery.id,
    reportId: delivery.reportId,
    clubId: delivery.clubId,
    outcome: input.outcome,
    decidedWeek: input.week,
    decidedSeason: input.season,
    placementReportId: delivery.placementReportId,
    reason: input.reason,
    reasons: input.reasons ?? (input.reason ? [input.reason] : []),
    scoreBreakdown: input.scoreBreakdown,
    requestedEvidenceCategory: input.requestedEvidenceCategory,
    followUpDueWeek: input.followUpDueWeek,
    followUpDueSeason: input.followUpDueSeason,
  };
  const updatedDelivery: ReportDelivery = {
    ...delivery,
    status: "resolved",
    decisionId,
    resolvedWeek: input.week,
    resolvedSeason: input.season,
  };
  const currentCase = input.scoutingCases[delivery.caseId];
  const updatedCases = currentCase
    ? {
        ...input.scoutingCases,
        [currentCase.id]: {
          ...normalizeCase(currentCase),
          status: input.outcome === "accepted"
            ? "placed" as const
            : input.outcome === "followUpRequested" || input.outcome === "trial"
              ? "reported" as const
              : "closed" as const,
          decisionIds: appendUnique(currentCase.decisionIds ?? [], decisionId),
          lastUpdatedWeek: input.week,
          lastUpdatedSeason: input.season,
        },
      }
    : input.scoutingCases;
  return {
    scoutingCases: updatedCases,
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: updatedDelivery },
    clubDecisions: { ...input.clubDecisions, [decision.id]: decision },
    decision,
  };
}

function latestReportForPlayer(
  reports: Record<string, ScoutReport>,
  playerId: string,
  scoutId?: string,
): ScoutReport | undefined {
  return Object.values(reports)
    .filter((report) => report.playerId === playerId && (!scoutId || report.scoutId === scoutId))
    .sort((left, right) =>
      right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || right.id.localeCompare(left.id)
    )[0];
}

/**
 * Backfill the causal spine for pre-case saves. Legacy placement records remain
 * explicit when no authored report exists; new placement creation never uses
 * that escape hatch.
 */
export function migrateScoutingCases(state: GameState): void {
  let scoutingCases = { ...(state.scoutingCases ?? {}) };
  let reportDeliveries = { ...(state.reportDeliveries ?? {}) };
  let clubDecisions = { ...(state.clubDecisions ?? {}) };
  const reports = { ...(state.reports ?? {}) };

  for (const original of Object.values(reports)) {
    const linked = ensureScoutingCaseForReport(scoutingCases, original);
    scoutingCases = linked.scoutingCases;
    reports[original.id] = linked.report;
  }

  if (state.finances) {
    state.finances = {
      ...state.finances,
      reportListings: state.finances.reportListings.map((original) => {
        const report = reports[original.reportId];
        if (!report?.caseId) return original;
        let listing: ReportListing = { ...original, caseId: report.caseId };
        scoutingCases = attachListingToCase(
          scoutingCases,
          report.caseId,
          listing.id,
          listing.listedWeek,
          listing.listedSeason,
        );
        for (const bid of listing.bids.filter((candidate) => candidate.status === "accepted")) {
          const recorded = recordMarketplaceDelivery({
            scoutingCases,
            reportDeliveries,
            report,
            listing,
            bid,
            week: bid.placedWeek,
            season: bid.placedSeason,
          });
          scoutingCases = recorded.scoutingCases;
          reportDeliveries = recorded.reportDeliveries;
          listing = {
            ...listing,
            deliveryIds: appendUnique(listing.deliveryIds ?? [], recorded.delivery.id),
          };
        }
        return listing;
      }),
    };
  }

  const placementReports = { ...(state.placementReports ?? {}) };
  for (const original of Object.values(placementReports)) {
    const youth = state.unsignedYouth?.[original.unsignedYouthId];
    const playerId = youth?.player.id;
    const source = original.reportId
      ? reports[original.reportId]
      : playerId
        ? latestReportForPlayer(reports, playerId, original.scoutId)
        : undefined;

    if (source) {
      const recorded = recordDirectPlacementDelivery({
        scoutingCases,
        reportDeliveries,
        report: source,
        placementReport: original,
      });
      scoutingCases = recorded.scoutingCases;
      reportDeliveries = recorded.reportDeliveries;
      reports[source.id] = recorded.report;
      placementReports[original.id] = recorded.placementReport;
    } else if (playerId) {
      const caseId = original.caseId ?? getScoutingCaseId(original.scoutId, playerId);
      const base = scoutingCases[caseId]
        ?? createCase(caseId, original.scoutId, playerId, original.week, original.season, true);
      const deliveryId = original.deliveryId ?? `delivery_placement_${original.id}`;
      const due = nextGameWeek(original.week, original.season);
      const placement = {
        ...original,
        caseId,
        deliveryId,
        responseDueWeek: original.responseDueWeek ?? due.week,
        responseDueSeason: original.responseDueSeason ?? due.season,
      };
      const delivery: ReportDelivery = reportDeliveries[deliveryId] ?? {
        id: deliveryId,
        caseId,
        clubId: original.targetClubId,
        channel: "directPlacement",
        status: original.clubResponse === "pending" ? "awaitingDecision" : "resolved",
        deliveredWeek: original.week,
        deliveredSeason: original.season,
        placementReportId: original.id,
      };
      scoutingCases[caseId] = {
        ...normalizeCase(base),
        status: original.clubResponse === "accepted" ? "placed" : "delivered",
        placementReportIds: appendUnique(base.placementReportIds ?? [], original.id),
        deliveryIds: appendUnique(base.deliveryIds ?? [], deliveryId),
      };
      reportDeliveries[deliveryId] = delivery;
      placementReports[original.id] = placement;
    }

    const placement = placementReports[original.id];
    if (placement?.deliveryId && placement.clubResponse && placement.clubResponse !== "pending") {
      const outcome: ClubDecisionOutcome = placement.clubResponse === "accepted"
        ? "accepted"
        : placement.clubResponse === "trial"
          ? "trial"
          : "rejected";
      const resolved = resolveClubDecision({
        scoutingCases,
        reportDeliveries,
        clubDecisions,
        deliveryId: placement.deliveryId,
        outcome,
        week: placement.week,
        season: placement.season,
        reason: "Migrated legacy placement outcome",
      });
      scoutingCases = resolved.scoutingCases;
      reportDeliveries = resolved.reportDeliveries;
      clubDecisions = resolved.clubDecisions;
      if (resolved.decision) {
        placementReports[original.id] = { ...placement, decisionId: resolved.decision.id };
      }
    }
  }

  state.alumniRecords = (state.alumniRecords ?? []).map((record) => {
    const placement = Object.values(placementReports).find((candidate) => {
      const youth = state.unsignedYouth?.[candidate.unsignedYouthId];
      return youth?.player.id === record.playerId;
    });
    const caseId = record.caseId ?? placement?.caseId;
    if (!caseId) return record;
    const currentCase = scoutingCases[caseId];
    if (currentCase) {
      scoutingCases[caseId] = {
        ...currentCase,
        status: "placed",
        alumniRecordId: record.id,
      };
    }
    return {
      ...record,
      caseId,
      placementReportId: record.placementReportId ?? placement?.id,
      originatingReportId: record.originatingReportId ?? placement?.reportId,
    };
  });

  state.reports = reports;
  state.placementReports = placementReports;
  state.scoutingCases = scoutingCases;
  state.reportDeliveries = reportDeliveries;
  state.clubDecisions = clubDecisions;
}
