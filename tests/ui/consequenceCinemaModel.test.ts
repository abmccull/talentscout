import { describe, expect, it } from "vitest";
import type {
  DiscoveryRecord,
  RecommendationReview,
  ScoutReport,
} from "@/engine/core/types";
import type {
  ConsequenceEngineState,
  DecisionRecord,
} from "@/engine/consequences/types";
import {
  buildCareerStoryReel,
  selectCareerStoryTemplate,
  type ConsequenceCinemaSource,
} from "@/components/game/consequence-cinema/consequenceCinemaModel";

function emptyConsequenceState(): ConsequenceEngineState {
  return {
    decisions: {},
    consequences: {},
    callbacks: {},
    facts: {},
    memories: {},
    obligations: {},
    opportunityLocks: {},
    metrics: {},
    appliedEffects: {},
    history: [],
  };
}

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-1",
    caseId: "case-1",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 5,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Reads space early"],
    weaknesses: ["Limited evidence against stronger opposition"],
    conviction: "strongRecommend",
    summary: "I backed the player for a patient academy pathway.",
    estimatedValue: 150_000,
    qualityScore: 78,
    recommendedAction: "offerAcademyPlace",
    recruitmentNeed: "A long-term central creator",
    riskFactors: ["Physical adaptation remains uncertain"],
    validationSnapshot: { pace: 20 },
    ...overrides,
  };
}

function discovery(overrides: Partial<DiscoveryRecord> = {}): DiscoveryRecord {
  return {
    playerId: "player-1",
    discoveredWeek: 2,
    discoveredSeason: 1,
    initialCA: 47,
    initialPA: 191,
    careerSnapshots: [],
    wasWonderkid: false,
    ...overrides,
  };
}

function source(overrides: Partial<ConsequenceCinemaSource> = {}): ConsequenceCinemaSource {
  return {
    rootSeed: "career-seed-a",
    players: {
      "player-1": { id: "player-1", firstName: "Maya", lastName: "Okafor" },
    },
    retiredPlayers: {},
    clubs: {
      "club-a": { id: "club-a", name: "Northbridge Academy", shortName: "NBA" },
      "club-b": { id: "club-b", name: "Riverside Athletic", shortName: "RIV" },
    },
    contacts: {
      "contact-1": { id: "contact-1", name: "Elena Rossi", organization: "Northbridge Academy" },
    },
    rivalOrganizations: {},
    reports: {},
    recommendationReviews: {},
    discoveryRecords: [],
    playerMovementHistory: [],
    consequenceState: emptyConsequenceState(),
    ...overrides,
  };
}

describe("career consequence cinema model", () => {
  it("builds a completed recommendation review from opinion and observable findings only", () => {
    const original = report();
    const review: RecommendationReview = {
      id: "review-1",
      caseId: "case-1",
      reportId: original.id,
      playerId: "player-1",
      clubId: "club-a",
      checkpoint: "oneSeason",
      dueWeek: 5,
      dueSeason: 2,
      status: "complete",
      completedWeek: 6,
      completedSeason: 2,
      overallScore: 82,
      clubFitScore: 86,
      timingScore: 74,
      confidenceCalibration: 79,
      findings: ["The recommendation matched the academy pathway."],
      evidence: [{ source: "minutes", description: "Recorded 1,420 academy minutes." }],
    };
    const input = source({
      reports: { [original.id]: original },
      recommendationReviews: { [review.id]: review },
    });

    const [story] = buildCareerStoryReel(input);
    expect(story.kind).toBe("recommendationReview");
    expect(story.reportId).toBe(original.id);
    expect(story.original.body).toBe(original.summary);
    expect(story.outcome.body).toContain("matched the academy pathway");
    expect(story.outcome.details).toContain("Recorded 1,420 academy minutes.");

    const renderedModel = JSON.stringify(story);
    expect(renderedModel).not.toContain("validationSnapshot");
    expect(renderedModel).not.toContain("initialPA");
    expect(renderedModel).not.toContain('"pace"');
  });

  it("links a discovered-player movement only to a report that existed before it", () => {
    const earlyReport = report({ id: "early", submittedWeek: 4, submittedSeason: 1 });
    const laterReport = report({ id: "later", submittedWeek: 20, submittedSeason: 3 });
    const input = source({
      reports: { early: earlyReport, later: laterReport },
      discoveryRecords: [discovery()],
      playerMovementHistory: [{
        id: "move-1",
        playerId: "player-1",
        type: "permanentTransfer",
        week: 8,
        season: 2,
        fromClubId: "club-a",
        toClubId: "club-b",
        fee: 2_500_000,
        reason: "First-team pathway agreed",
      }],
    });

    const [story] = buildCareerStoryReel(input);
    expect(story.kind).toBe("playerMovement");
    expect(story.reportId).toBe("early");
    expect(story.subtitle).toBe("Northbridge Academy to Riverside Athletic");
    expect(story.outcome.body).toBe("First-team pathway agreed");
    expect(story.outcome.details.join(" ")).toContain("£2,500,000");
  });

  it("reveals a resolved choice, recognized outcome, stakeholder memory, and obligation", () => {
    const resolvedDecision: DecisionRecord = {
      id: "decision-1",
      source: { kind: "narrativeEvent", id: "event-1" },
      offeredAt: { season: 2, week: 10 },
      deadlineAt: { season: 2, week: 12 },
      status: "resolved",
      visibility: "stakeholders",
      stakeholders: [{ kind: "contact", id: "contact-1" }],
      options: [{
        id: "all-in",
        label: "Stake your reputation",
        knownTradeoffs: ["Maximum credit", "Maximum personal exposure"],
        immediateEffects: [],
        scheduledConsequences: [],
      }],
      selectedOptionId: "all-in",
      selectedAt: { season: 2, week: 11 },
      selectionKind: "player",
      resolvedAt: { season: 2, week: 17 },
      outcomeRoll: 0.24,
      consequenceIds: ["consequence-1"],
      metadata: {
        title: "Put Your Name On It",
        relatedPlayerId: "player-1",
        reportId: "report-1",
      },
    };
    const original = report();
    const consequences = emptyConsequenceState();
    consequences.decisions[resolvedDecision.id] = resolvedDecision;
    consequences.consequences["consequence-1"] = {
      id: "consequence-1",
      decisionId: resolvedDecision.id,
      templateId: "outcome",
      dueAt: { season: 2, week: 17 },
      status: "applied",
      effects: [],
      conditions: [],
      probability: 1,
      outcomeRoll: 0.24,
      tags: ["turning-point"],
      resolvedAt: { season: 2, week: 17 },
      resolution: "effectsApplied",
    };
    consequences.facts["fact-1"] = {
      id: "fact-1",
      kind: "CareerCrossroadsOutcome",
      subject: { kind: "player", id: "player-1" },
      value: {
        succeeded: true,
        approach: "all-in",
        reputationDelta: 12,
        secretTruth: "NEVER_RENDER_THIS",
      },
      observedAt: { season: 2, week: 17 },
      visibility: "public",
      sourceDecisionId: resolvedDecision.id,
    };
    consequences.memories["memory-1"] = {
      id: "memory-1",
      stakeholder: { kind: "contact", id: "contact-1" },
      subject: { kind: "player", id: "player-1" },
      tags: ["conviction", "kept word"],
      valence: 7,
      intensity: 78,
      salience: 83,
      visibility: "stakeholders",
      createdAt: { season: 2, week: 17 },
      sourceDecisionId: resolvedDecision.id,
    };
    consequences.obligations["obligation-1"] = {
      id: "obligation-1",
      debtor: { kind: "scout", id: "scout-1" },
      creditor: { kind: "contact", id: "contact-1" },
      kind: "followUp",
      terms: "Share the next academy update privately.",
      status: "active",
      createdAt: { season: 2, week: 11 },
      dueAt: { season: 2, week: 20 },
      sourceDecisionId: resolvedDecision.id,
    };
    const input = source({
      reports: { [original.id]: original },
      consequenceState: consequences,
    });

    const [story] = buildCareerStoryReel(input);
    expect(story.kind).toBe("resolvedDecision");
    expect(story.title).toBe("Put Your Name On It");
    expect(story.original.headline).toBe("Stake your reputation");
    expect(story.outcome.body).toBe("The recorded career gamble succeeded.");
    expect(story.memories[0]).toMatchObject({ holder: "Elena Rossi", intensity: 78, salience: 83 });
    expect(story.obligations[0].terms).toBe("Share the next academy update privately.");
    expect(JSON.stringify(story)).not.toContain("NEVER_RENDER_THIS");
  });

  it("assigns presentation templates deterministically and keeps an empty save honest", () => {
    const first = selectCareerStoryTemplate("seed", "story", "resolvedDecision");
    const second = selectCareerStoryTemplate("seed", "story", "resolvedDecision");
    expect(second).toBe(first);
    const seededVariety = new Set(
      ["a", "b", "c", "d", "e"].map((storyId) =>
        selectCareerStoryTemplate("seed", storyId, "resolvedDecision"),
      ),
    );
    expect(seededVariety.size).toBeGreaterThan(1);
    expect(buildCareerStoryReel(source())).toEqual([]);
  });
});
