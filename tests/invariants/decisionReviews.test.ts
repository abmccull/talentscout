import { deriveProfessionalCaseAccountability } from "@/engine/reports/caseAccountability";
import { describe, expect, it } from "vitest";
import type { GameState, Player, PlayerMovementEvent, ScoutReport } from "@/engine/core/types";
import { createScoutingDecisionReceipt, completeScoutingDecisionReview, reconcileScoutingDecisionReviews, processScoutingDecisionReviews } from "@/engine/youth/decisionReviews";
import { ensureScoutingCaseForReport } from "@/engine/reports/scoutingCases";
import { selectLatestReportsByCase, selectMatureReportCasesForValidation } from "@/engine/reports/reportAccountability";

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-a", caseId: "case-a", playerId: "player-a", scoutId: "scout-a",
    submittedWeek: 4, submittedSeason: 1, conviction: "note", recommendedAction: "pass",
    summary: "The current evidence does not justify another allocation of attention.",
    attributeAssessments: [{ attribute: "passing", estimatedValue: 9, confidenceRange: [6, 12], domain: "technical" }],
    strengths: [], weaknesses: ["Unknown under pressure"], estimatedValue: 1000, qualityScore: 70,
    perceivedPARange: [1, 4], evidenceObservationIds: ["observation-a"], ...overrides,
  };
}
function state(original = report()): GameState {
  const linked = ensureScoutingCaseForReport({}, original);
  const preserved = { ...linked.report, decisionReceipt: createScoutingDecisionReceipt(linked.report) };
  return {
    currentWeek: 4, currentSeason: 1,
    players: {}, unsignedYouth: {}, retiredPlayers: {},
    reports: { [preserved.id]: preserved }, scoutingCases: linked.scoutingCases,
    recommendationReviews: {}, playerMovementHistory: [], clubDecisions: {}, inbox: [],
    scout: { id: "scout-a", reputation: 20, reportsSubmitted: 0 },
  } as unknown as GameState;
}
function movement(overrides: Partial<PlayerMovementEvent> = {}): PlayerMovementEvent {
  return { id: "movement-a", playerId: "player-a", week: 8, season: 1, type: "youthSigning", toClubId: "club-other", ...overrides };
}
function reviewedPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-a", firstName: "Milo", lastName: "Vale", currentAbility: 30, potentialAbility: 60,
    seasonRatings: [{ season: 1, appearances: 25, avgRating: 7.2, goals: 2, assists: 4, cleanSheets: 0 }],
    ...overrides,
  } as Player;
}

describe("preserved decisions and non-placement career reviews", () => {
  it("records a private pass without inventing a club and schedules two unique checkpoints", () => {
    const original = state();
    const scheduled = reconcileScoutingDecisionReviews(original);
    expect(Object.values(scheduled.recommendationReviews)).toHaveLength(2);
    expect(Object.values(scheduled.recommendationReviews)).toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: "decision", decisionKind: "pass", dueWeek: 4, dueSeason: 2, clubId: undefined }),
      expect.objectContaining({ dueSeason: 3 }),
    ]));
    expect(reconcileScoutingDecisionReviews(scheduled)).toBe(scheduled);
    expect(scheduled.scout).toBe(original.scout);
    expect(scheduled.scoutingCases["case-a"].status).toBe("closed");
    expect(scheduled.scoutingCases["case-a"].reviewIds).toHaveLength(2);
  });

  it("copies decision evidence and projection instead of retaining mutable draft arrays", () => {
    const draft = report();
    const receipt = createScoutingDecisionReceipt(draft);
    draft.evidenceObservationIds!.push("later-observation");
    draft.perceivedPARange![1] = 5;
    expect(receipt.evidenceObservationIds).toEqual(["observation-a"]);
    expect(receipt.potentialRange).toEqual([1, 4]);
    expect(createScoutingDecisionReceipt({ ...draft, decisionReceipt: receipt })).toBe(receipt);
  });

  it("does not silently turn missing outcomes into failure or issue a second callback on replay", () => {
    const scheduled = reconcileScoutingDecisionReviews(state());
    const completed = processScoutingDecisionReviews({ ...scheduled, currentSeason: 2 });
    const review = Object.values(completed.recommendationReviews).find((item) => item.checkpoint === "oneSeason")!;
    expect(review).toMatchObject({ status: "complete", decisionOutcome: "unresolved" });
    expect(completed.inbox).toHaveLength(1);
    expect(completed.inbox[0].body).toContain("Missing evidence is not failure");
    expect(completed.scout).toBe(scheduled.scout);
    expect(deriveProfessionalCaseAccountability(completed, "case-a")).toMatchObject({
      completedReview: true, reviewId: review.id,
      headline: "The checkpoint remains unresolved. Missing career evidence is not failure.",
    });
    expect(processScoutingDecisionReviews(completed)).toBe(completed);
  });

  it("uses observable career records and produces exactly the same review under different hidden ability", () => {
    const scheduled = reconcileScoutingDecisionReviews(state(report({ submittedWeek: 1 })));
    const source = scheduled.reports["report-a"];
    const review = Object.values(scheduled.recommendationReviews).find((item) => item.checkpoint === "oneSeason")!;
    const input = { review, report: source, movements: [movement()], currentWeek: 4, currentSeason: 2 };
    const low = completeScoutingDecisionReview({ ...input, player: reviewedPlayer() });
    const elite = completeScoutingDecisionReview({ ...input, player: reviewedPlayer({ currentAbility: 190, potentialAbility: 200 }) });
    expect(elite).toEqual(low);
    expect(low).toMatchObject({ decisionOutcome: "progressed" });
    expect(low.overallScore).toBeUndefined();
    expect(low.confidenceCalibration).toBeUndefined();
    expect(low.evidence?.map((entry) => entry.source)).toEqual(["movement", "seasonRating"]);
    expect(low.findings?.join(" ")).toContain("original uncertainty was unreasonable");
  });

  it("does not incorporate future seasons or movements into a checkpoint completed late", () => {
    const scheduled = reconcileScoutingDecisionReviews(state(report({ submittedWeek: 1 })));
    const review = Object.values(scheduled.recommendationReviews).find((item) => item.checkpoint === "oneSeason")!;
    const player = reviewedPlayer({ seasonRatings: [
      { season: 1, appearances: 25, avgRating: 7.2, goals: 2, assists: 4, cleanSheets: 0 },
      { season: 3, appearances: 0, avgRating: 0, goals: 0, assists: 0, cleanSheets: 0 },
    ] });
    const completed = completeScoutingDecisionReview({ review, report: scheduled.reports["report-a"], player,
      movements: [movement(), movement({ id: "future-release", season: 3, type: "release" })], currentWeek: 30, currentSeason: 4 });
    expect(completed).toMatchObject({ decisionOutcome: "progressed", completedWeek: 1, completedSeason: 2 });
    expect(completed.evidence?.map((entry) => entry.sourceId)).not.toContain("future-release");
    expect(completeScoutingDecisionReview({ review: completed, report: scheduled.reports["report-a"], player: reviewedPlayer(), movements: [], currentWeek: 1, currentSeason: 8 })).toBe(completed);
  });

  it("excludes annual totals from before a mid-season decision", () => {
    const scheduled = reconcileScoutingDecisionReviews(state());
    const review = Object.values(scheduled.recommendationReviews).find((item) => item.checkpoint === "oneSeason")!;
    const completed = completeScoutingDecisionReview({ review, report: scheduled.reports["report-a"],
      player: reviewedPlayer(), movements: [], currentWeek: 4, currentSeason: 2 });
    expect(completed.decisionOutcome).toBe("unresolved");
    expect(completed.evidence).toEqual([]);
  });

  it("does not call a signing alone a successful career", () => {
    const scheduled = reconcileScoutingDecisionReviews(state());
    const next = processScoutingDecisionReviews({ ...scheduled, currentSeason: 2, playerMovementHistory: [movement()] });
    const review = Object.values(next.recommendationReviews).find((item) => item.checkpoint === "oneSeason")!;
    expect(review.decisionOutcome).toBe("unresolved");
    expect(review.findings?.join(" ")).toContain("signing alone does not establish career success");
  });

  it("recognizes an ignored recommendation and a competitor signing without fabricating legacy receipts", () => {
    const ignored = state(report({ recommendedAction: "offerAcademyPlace", intendedClubId: "club-target", clubResponse: "ignored" }));
    expect(Object.values(reconcileScoutingDecisionReviews(ignored).recommendationReviews)[0].decisionKind).toBe("ignored");
    const monitored = state(report({ recommendedAction: "monitor", intendedClubId: "club-target" }));
    expect(Object.values(reconcileScoutingDecisionReviews(monitored).recommendationReviews)).toHaveLength(0);
    const elsewhere = reconcileScoutingDecisionReviews({ ...monitored, playerMovementHistory: [movement()] });
    expect(Object.values(elsewhere.recommendationReviews)[0].decisionKind).toBe("elsewhere");
    const legacy = { ...ignored, reports: { "report-a": { ...ignored.reports["report-a"], decisionReceipt: undefined } } };
    expect(Object.values(reconcileScoutingDecisionReviews(legacy).recommendationReviews)).toHaveLength(0);
  });

  it("does not let a later private pass erase an earlier accountable recommendation", () => {
    const publicReport = report({ recommendedAction: "offerAcademyPlace", conviction: "tablePound" });
    const laterPass = report({ id: "report-b", submittedWeek: 10, revision: 2 });
    expect(selectLatestReportsByCase([publicReport, laterPass])).toEqual([publicReport]);
    expect(selectMatureReportCasesForValidation([publicReport, laterPass], 5)[0].latestReport).toEqual(publicReport);
  });

  it("excludes private passes from career rewards while retaining their history and later reconsideration", () => {
    const original = report();
    expect(selectLatestReportsByCase([original])).toEqual([]);
    expect(selectMatureReportCasesForValidation([original], 5)).toEqual([]);
    const linked = ensureScoutingCaseForReport({}, original);
    const revised = report({ id: "report-b", recommendedAction: "inviteForTrial", submittedWeek: 8, revision: 2 });
    const reopened = ensureScoutingCaseForReport(linked.scoutingCases, revised);
    expect(reopened.scoutingCase.status).toBe("reported");
    expect(reopened.scoutingCase.reportIds).toEqual([original.id, revised.id]);
    expect(selectLatestReportsByCase([original, revised])).toEqual([revised]);
  });
});
