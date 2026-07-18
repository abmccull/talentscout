import type {
  AttributeDomain,
  ClubDecision,
  GameState,
  Observation,
  ObservationContext,
  RecommendationReview,
  ReportCategoryVerdict,
  ReflectionHypothesisRecord,
  ScoutReport,
  ScoutingCase,
  ScoutingQuestionId,
} from "@/engine/core/types";
import {
  deriveObservationObjective,
  deriveObservationObjectiveTargetDomains,
  rankObservationContextsForObjective,
  type ObservationObjective,
  type ObservationObjectiveFamily,
} from "@/engine/observation/objectives";
import { deriveProfessionalCaseAccountability } from "@/engine/reports/caseAccountability";
import {
  buildScoutingCaseDepth,
  selectObservationsForScoutingCase,
} from "@/engine/reports/scoutingCases";

export interface CaseContextRecommendation {
  context: ObservationContext;
  score: number;
  reason: string;
}

export interface CaseQuestion {
  id: string;
  family: ObservationObjectiveFamily;
  questionId?: ScoutingQuestionId;
  targetDomains: AttributeDomain[];
  prompt: string;
  whyNow: string;
  evidenceGap: string;
  recommendedContexts: CaseContextRecommendation[];
  comparisonPrompt?: string;
}

export interface CaseCallback {
  id: string;
  title: string;
  summary: string;
  source: "clubDecision" | "followUp" | "review" | "career";
}

export interface ScoutingCaseQuestionSnapshot {
  caseId: string;
  playerId: string;
  status: ScoutingCase["status"];
  centralQuestion: string;
  observedContexts: ObservationContext[];
  activeQuestions: CaseQuestion[];
  callbacks: CaseCallback[];
  nextBestObjective?: ObservationObjective;
}

export interface ScoutingCaseObservationFocus {
  caseId: string;
  scoutingQuestionId?: ScoutingQuestionId;
  scoutingQuestionIds: ScoutingQuestionId[];
}

type CaseState = Pick<
  GameState,
  | "scoutingCases"
  | "reports"
  | "observations"
  | "clubDecisions"
  | "recommendationReviews"
  | "inbox"
  | "players"
  | "reflectionJournal"
  | "youthRecruitmentBriefs"
>;

function compareBySubmittedDate<T extends { submittedSeason: number; submittedWeek: number }>(
  left: T,
  right: T,
): number {
  return right.submittedSeason - left.submittedSeason
    || right.submittedWeek - left.submittedWeek;
}

function compareByDecisionDate(
  left: ClubDecision,
  right: ClubDecision,
): number {
  return right.decidedSeason - left.decidedSeason
    || right.decidedWeek - left.decidedWeek;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function latestReportForCase(
  state: CaseState,
  scoutingCase: ScoutingCase,
): ScoutReport | undefined {
  const caseReportIds = new Set(scoutingCase.reportIds ?? []);
  return Object.values(state.reports)
    .filter((report) => report.caseId === scoutingCase.id || caseReportIds.has(report.id))
    .sort(compareBySubmittedDate)[0];
}

function latestDecisionForCase(
  state: CaseState,
  scoutingCase: ScoutingCase,
): ClubDecision | undefined {
  const caseDecisionIds = new Set(scoutingCase.decisionIds ?? []);
  return Object.values(state.clubDecisions ?? {})
    .filter((decision) => decision.caseId === scoutingCase.id || caseDecisionIds.has(decision.id))
    .sort(compareByDecisionDate)[0];
}

function latestReviewForCase(
  state: CaseState,
  scoutingCase: ScoutingCase,
): RecommendationReview | undefined {
  const reviewIds = new Set(scoutingCase.reviewIds ?? []);
  return Object.values(state.recommendationReviews ?? {})
    .filter((review) => review.caseId === scoutingCase.id || reviewIds.has(review.id))
    .sort((left, right) =>
      (right.completedSeason ?? right.dueSeason) - (left.completedSeason ?? left.dueSeason)
      || (right.completedWeek ?? right.dueWeek) - (left.completedWeek ?? left.dueWeek)
    )[0];
}

function familyFromRequestedEvidence(
  value: ClubDecision["requestedEvidenceCategory"] | undefined,
): ObservationObjectiveFamily | undefined {
  if (!value) return undefined;
  switch (value) {
    case "roleFit":
      return "role";
    case "characterRisk":
      return "personality";
    case "potential":
      return "upside";
  }
}

function familyFromRiskFactors(report: ScoutReport | undefined): ObservationObjectiveFamily | undefined {
  if (!report?.riskFactors?.length) return undefined;
  const joined = report.riskFactors.join(" ").toLowerCase();
  if (joined.includes("adapt") || joined.includes("pathway") || joined.includes("minutes")) return "pathway";
  if (joined.includes("personality") || joined.includes("family") || joined.includes("character")) return "personality";
  if (joined.includes("role") || joined.includes("fit") || joined.includes("position")) return "role";
  if (joined.includes("ready") || joined.includes("immediate")) return "readiness";
  return "upside";
}

function familyFromHypothesis(hypothesis: ReflectionHypothesisRecord): ObservationObjectiveFamily {
  const text = hypothesis.text.toLowerCase();
  if (hypothesis.domain === "hidden") {
    return text.includes("adapt") || text.includes("family") || text.includes("pathway")
      ? "pathway"
      : "personality";
  }
  if (hypothesis.domain === "mental") {
    return text.includes("adapt") || text.includes("support") ? "pathway" : "personality";
  }
  if (hypothesis.domain === "tactical") return "role";
  if (hypothesis.domain === "physical") return "readiness";
  return "upside";
}

function defaultQuestionIdForFamily(
  family: ObservationObjectiveFamily,
): ScoutingQuestionId {
  switch (family) {
    case "role":
      return "movement";
    case "pathway":
      return "projection";
    case "personality":
      return "pressure";
    case "readiness":
      return "repeatability";
    case "upside":
      return "projection";
  }
}

const QUESTION_FAMILY_COMPATIBILITY: Record<ScoutingQuestionId, ObservationObjectiveFamily[]> = {
  execution: ["role", "readiness"],
  decisions: ["role", "readiness"],
  movement: ["role"],
  pressure: ["personality", "pathway", "readiness"],
  repeatability: ["readiness"],
  projection: ["upside", "pathway"],
};

function isQuestionIdCompatibleWithFamily(
  questionId: ScoutingQuestionId | undefined,
  family: ObservationObjectiveFamily,
): questionId is ScoutingQuestionId {
  return Boolean(questionId && QUESTION_FAMILY_COMPATIBILITY[questionId]?.includes(family));
}

function resolveQuestionIdForFamily(
  family: ObservationObjectiveFamily,
  depth: ReturnType<typeof buildScoutingCaseDepth>,
  report?: ScoutReport,
): ScoutingQuestionId {
  const reportQuestionId = report?.evidenceAssessment?.nextTest.questionId
    ?? report?.evidenceAssessment?.questionId;
  if (isQuestionIdCompatibleWithFamily(reportQuestionId, family)) {
    return reportQuestionId;
  }

  const historicalQuestionId = [...(depth?.questionHistory ?? [])]
    .reverse()
    .map((question) => question.questionId)
    .find((questionId) => isQuestionIdCompatibleWithFamily(questionId, family));
  if (historicalQuestionId) {
    return historicalQuestionId;
  }

  return defaultQuestionIdForFamily(family);
}

function reportUncertaintyText(report: ScoutReport | undefined): string | undefined {
  if (!report?.categoryVerdicts) return undefined;
  return Object.values(report.categoryVerdicts)
    .map((verdict) => (verdict as ReportCategoryVerdict | undefined)?.acknowledgedUncertainty?.trim())
    .find((value): value is string => Boolean(value));
}

function unresolvedHypothesesForCase(
  state: CaseState,
  scoutingCase: ScoutingCase,
): ReflectionHypothesisRecord[] {
  const scopedIds = new Set(scoutingCase.hypothesisIds ?? []);
  const latestById = new Map<string, ReflectionHypothesisRecord>();

  for (const entry of Object.values(state.reflectionJournal ?? {})) {
    if (!entry.playerIds.includes(scoutingCase.playerId)) continue;
    const afterOpen = entry.season > scoutingCase.openedSeason
      || (entry.season === scoutingCase.openedSeason && entry.week >= scoutingCase.openedWeek);
    if (!afterOpen) continue;
    for (const hypothesis of entry.hypotheses ?? []) {
      if (hypothesis.playerId !== scoutingCase.playerId) continue;
      if (scopedIds.size > 0 && !scopedIds.has(hypothesis.id)) continue;
      latestById.set(hypothesis.id, hypothesis);
    }
  }

  return [...latestById.values()]
    .filter((hypothesis) => hypothesis.state !== "confirmed" && hypothesis.state !== "debunked")
    .sort((left, right) =>
      (right.lastUpdatedSeason ?? right.createdAtSeason ?? 0) - (left.lastUpdatedSeason ?? left.createdAtSeason ?? 0)
      || (right.lastUpdatedWeek ?? right.createdAtWeek) - (left.lastUpdatedWeek ?? left.createdAtWeek)
      || left.id.localeCompare(right.id),
    );
}

function buildQuestion(
  id: string,
  family: ObservationObjectiveFamily,
  prompt: string,
  whyNow: string,
  evidenceGap: string,
  questionId: ScoutingQuestionId | undefined,
  observations: Observation[],
  caseLens?: {
    player?: GameState["players"][string];
    preferredRole?: ScoutReport["projectedRole"];
  },
  targetDomains?: AttributeDomain[],
): CaseQuestion {
  const objective = deriveObservationObjective({
    id,
    family,
    prompt,
    existingObservations: observations,
    player: caseLens?.player,
    preferredRole: caseLens?.preferredRole,
    targetDomains,
  });
  const ranked = rankObservationContextsForObjective(objective)
    .slice(0, 3)
    .map((entry) => ({
      context: entry.context,
      score: entry.score,
      reason: entry.reason,
    }));
  return {
    id,
    family,
    questionId,
    targetDomains: objective.targetDomains,
    prompt,
    whyNow,
    evidenceGap,
    recommendedContexts: ranked,
    comparisonPrompt: objective.comparisonPrompt,
  };
}

function selectScoutingCaseForObservation(
  state: CaseState,
  playerId: string,
  briefId?: string,
): ScoutingCase | undefined {
  return Object.values(state.scoutingCases ?? {})
    .filter((scoutingCase) =>
      scoutingCase.playerId === playerId
      && (!briefId || scoutingCase.briefId === briefId),
    )
    .sort((left, right) => {
      const leftOpen = left.status === "open" || left.status === "reported";
      const rightOpen = right.status === "open" || right.status === "reported";
      return Number(rightOpen) - Number(leftOpen)
        || right.lastUpdatedSeason - left.lastUpdatedSeason
        || right.lastUpdatedWeek - left.lastUpdatedWeek
        || left.id.localeCompare(right.id);
    })[0];
}

export function deriveScoutingCaseObservationFocus(
  state: CaseState,
  input: { playerId: string; briefId?: string },
): ScoutingCaseObservationFocus | null {
  const scoutingCase = selectScoutingCaseForObservation(state, input.playerId, input.briefId);
  if (!scoutingCase) return null;
  const snapshot = deriveScoutingCaseQuestions(state, scoutingCase.id);
  if (!snapshot) return null;
  const scoutingQuestionIds = unique(
    snapshot.activeQuestions
      .map((question) => question.questionId)
      .filter((questionId): questionId is ScoutingQuestionId => Boolean(questionId)),
  );
  return {
    caseId: scoutingCase.id,
    scoutingQuestionId: scoutingQuestionIds[0],
    scoutingQuestionIds,
  };
}

export function deriveScoutingCaseQuestions(
  state: CaseState,
  caseId: string,
): ScoutingCaseQuestionSnapshot | null {
  const scoutingCase = state.scoutingCases?.[caseId];
  if (!scoutingCase) return null;

  const depth = buildScoutingCaseDepth(state as GameState, caseId);
  if (!depth) return null;
  const report = latestReportForCase(state, scoutingCase);
  const decision = latestDecisionForCase(state, scoutingCase);
  const review = latestReviewForCase(state, scoutingCase);
  const reports = Object.values(state.reports).filter((candidate) =>
    candidate.caseId === caseId || scoutingCase.reportIds.includes(candidate.id),
  );
  const observations = selectObservationsForScoutingCase(state, scoutingCase);
  const contexts = observations.map((observation) => observation.context);
  const activeQuestions: CaseQuestion[] = [];
  const callbacks: CaseCallback[] = [];
  const accountability = deriveProfessionalCaseAccountability(state as GameState, caseId);
  const player = state.players?.[scoutingCase.playerId];
  const linkedBrief = scoutingCase.briefId
    ? state.youthRecruitmentBriefs?.[scoutingCase.briefId]
    : Object.values(state.youthRecruitmentBriefs ?? {}).find((brief) => brief.assignedCaseId === caseId);
  const caseLens = {
    player,
    preferredRole: report?.projectedRole ?? linkedBrief?.preferredRole,
  };
  const openHypotheses = unresolvedHypothesesForCase(state, scoutingCase);

  if (observations.length < 2) {
    activeQuestions.push(
      buildQuestion(
        `${caseId}:fresh-context`,
        "upside",
        "Which second context would tell you whether the first impression was representative?",
        "The case is still leaning heavily on one independent environment.",
        "Another context is needed before the confidence level should rise much further.",
        resolveQuestionIdForFamily("upside", depth, report),
        observations,
        caseLens,
      ),
    );
  }

  const decisionFamily = familyFromRequestedEvidence(decision?.requestedEvidenceCategory);
  if (decisionFamily && decision) {
    activeQuestions.push(
      buildQuestion(
        `${caseId}:club-follow-up`,
        decisionFamily,
        decision.requestedEvidenceCategory === "characterRisk"
          ? "What fresh context would confirm whether the character concern is real?"
          : `What new evidence would answer the club's remaining ${decision.requestedEvidenceCategory} doubt?`,
        "A club explicitly kept the case alive rather than closing it.",
        decision.reasons?.[0] ?? "The next recommendation still needs one category of evidence the club can act on.",
        resolveQuestionIdForFamily(decisionFamily, depth, report),
        observations,
        caseLens,
      ),
    );
    callbacks.push({
      id: `${decision.id}:club`,
      title: "Club kept the file open",
      summary: decision.reasons?.[0] ?? "The recommendation remains active but unresolved.",
      source: "clubDecision",
    });
  }

  for (const hypothesis of openHypotheses.slice(0, 2)) {
    const family = familyFromHypothesis(hypothesis);
    activeQuestions.push(
      buildQuestion(
        `${caseId}:hypothesis:${hypothesis.id}`,
        family,
        hypothesis.text,
        "A saved working hypothesis is still unresolved on the case.",
        hypothesis.evidence?.length
          ? `Current evidence remains ${hypothesis.state}; another independent test is still needed.`
          : "You preserved the question, but you still do not have enough evidence to settle it.",
        resolveQuestionIdForFamily(family, depth, report),
        observations,
        caseLens,
        deriveObservationObjectiveTargetDomains(family),
      ),
    );
  }

  const riskFamily = familyFromRiskFactors(report);
  if (riskFamily && !activeQuestions.some((question) => question.family === riskFamily)) {
    const uncertainty = reportUncertaintyText(report);
    activeQuestions.push(
      buildQuestion(
        `${caseId}:report-risk`,
        riskFamily,
        uncertainty || "What would have to change for the current report to be wrong?",
        "The latest report still names a meaningful uncertainty.",
        report?.riskFactors?.[0] ?? "The report carries a stated risk that has not yet been cleared by a new context.",
        resolveQuestionIdForFamily(riskFamily, depth, report),
        observations,
        caseLens,
      ),
    );
  }

  if (review?.status === "complete") {
    callbacks.push({
      id: review.id,
      title: review.checkpoint === "oneSeason" ? "One-season review complete" : "Two-season review complete",
      summary: accountability?.summary
        ?? review.findings?.[0]
        ?? "The recommendation now has enough visible career evidence to judge the call.",
      source: "review",
    });
  } else if (review) {
    callbacks.push({
      id: review.id,
      title: "Recommendation review pending",
      summary: accountability?.summary
        ?? "The case remains open until the player's career produces enough visible evidence.",
      source: "career",
    });
  }

  for (const callback of depth.callbacks) {
    callbacks.push({
      id: `depth:${callback.id}`,
      title: callback.title,
      summary: callback.detail,
      source: callback.kind === "pathwayFollowUp" ? "followUp" : "career",
    });
  }

  const dedupedCallbacks = callbacks.filter((callback, index, list) =>
    list.findIndex((candidate) => candidate.id === callback.id) === index,
  );
  const nextBestObjective = activeQuestions[0]
    ? deriveObservationObjective({
      id: `${caseId}:next-best`,
      family: activeQuestions[0].family,
      prompt: activeQuestions[0].prompt,
      existingObservations: observations,
      player,
      preferredRole: caseLens.preferredRole,
      targetDomains: activeQuestions[0].targetDomains,
    })
    : undefined;

  return {
    caseId: scoutingCase.id,
    playerId: scoutingCase.playerId,
    status: scoutingCase.status,
    centralQuestion: depth.centralQuestion.text,
    observedContexts: contexts,
    activeQuestions,
    callbacks: dedupedCallbacks,
    nextBestObjective,
  };
}
