import { describe, expect, it } from "vitest";

import type {
  GameState,
  ScoutReport,
  StructuredScoutingAssessment,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import {
  buildScoutingCaseDepth,
  openProfessionalScoutingCase,
} from "@/engine/reports/scoutingCases";
import { buildScoutingCaseTimeline } from "@/engine/reports/scoutingCaseTimeline";
import { createObservationSituation } from "@/engine/observation/situations";

function assessment(
  unknownId: string,
  unknownStatement: string,
  questionId: StructuredScoutingAssessment["questionId"],
): StructuredScoutingAssessment {
  return {
    version: 1,
    kind: "formal",
    questionId,
    evidenceIds: [`evidence-${unknownId}`],
    claims: [],
    unknowns: [{
      id: unknownId,
      category: "roleFit",
      statement: unknownStatement,
      sourceEvidenceIds: [`evidence-${unknownId}`],
    }],
    nextTest: {
      id: `next-${unknownId}`,
      label: "Test the open question",
      description: "Return in a different football setting.",
      questionId,
      activityType: "followUpSession",
      contextRequirement: "A stronger opponent in a different team shape.",
    },
    recommendation: "monitor",
    confidence: "working",
    overclaimCount: 0,
    score: {
      evidenceSufficiency: 15,
      claimEvidenceFit: 15,
      contextDiversity: 10,
      calibration: 12,
      unknownHandling: 10,
      briefFit: 5,
      deliveryFit: 4,
      total: 71,
    },
    generatedSummary: "A bounded structured assessment.",
  };
}

function report(
  id: string,
  week: number,
  revision: number,
  evidenceAssessment: StructuredScoutingAssessment,
): ScoutReport {
  return {
    id,
    caseId: "case-1",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: week,
    submittedSeason: 1,
    revision,
    evidenceObservationIds: [`obs-${revision}`],
    evidenceAssessment,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: revision === 1 ? "recommend" : "strongRecommend",
    summary: evidenceAssessment.generatedSummary,
    estimatedValue: 100_000,
    qualityScore: evidenceAssessment.score.total,
  };
}

function caseState(): GameState {
  const school = createObservationSituation({
    activityType: "schoolMatch",
    seed: "case-depth-school",
    countryId: "england",
  });
  const training = createObservationSituation({
    activityType: "trainingVisit",
    seed: "case-depth-training",
    countryId: "england",
  });
  const firstReport = report(
    "report-1",
    3,
    1,
    assessment(
      "unknown-role",
      "The player's movement in a structured role remains untested.",
      "movement",
    ),
  );
  const secondReport = report(
    "report-2",
    7,
    2,
    assessment(
      "unknown-pressure",
      "The response to sustained pressure remains untested.",
      "pressure",
    ),
  );
  const consequenceState = createConsequenceEngineState();
  consequenceState.facts["callback-fact"] = {
    id: "callback-fact",
    kind: "professionalCaseCallback",
    subject: { kind: "player", id: "player-1" },
    value: "opening",
    observedAt: { week: 8, season: 1 },
    visibility: "stakeholders",
    metadata: {
      caseId: "case-1",
      outcome: "opening",
      detail: "A coach offered a targeted training look",
    },
  };

  return {
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 10,
        lastUpdatedSeason: 1,
        status: "placed",
        professionalContext: {
          modeId: "youth-scout",
          familyId: "pathway-fit",
          title: "A pathway under pressure",
          premise: "A promising player has more than one plausible development route.",
          centralQuestion: "Which environment gives this player the best chance to develop?",
          stakeholderRefs: ["family", "academy"],
          judgmentDecisionIds: ["professional-decision"],
        },
        reportIds: [firstReport.id, secondReport.id],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-1"],
        placementReportIds: [],
        reviewIds: ["review-1"],
      },
    },
    reports: {
      [firstReport.id]: firstReport,
      [secondReport.id]: secondReport,
    },
    observations: {
      "obs-1": {
        id: "obs-1",
        playerId: "player-1",
        scoutId: "scout-1",
        sourceSessionId: "session-1",
        week: 2,
        season: 1,
        context: "schoolMatch",
        attributeReadings: [{
          attribute: "firstTouch",
          perceivedValue: 13,
          confidence: 0.64,
          observationCount: 1,
        }],
        notes: [],
        flaggedMoments: [],
        situation: school,
      },
      "obs-2": {
        id: "obs-2",
        playerId: "player-1",
        scoutId: "scout-1",
        sourceSessionId: "session-2",
        week: 6,
        season: 1,
        context: "trainingGround",
        attributeReadings: [{
          attribute: "firstTouch",
          perceivedValue: 14,
          confidence: 0.72,
          observationCount: 1,
        }],
        notes: [],
        flaggedMoments: [],
        situation: training,
      },
    },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: "case-1",
        deliveryId: "delivery-1",
        reportId: "report-2",
        clubId: "club-1",
        outcome: "accepted",
        decidedWeek: 8,
        decidedSeason: 1,
      },
    },
    recommendationReviews: {
      "review-1": {
        id: "review-1",
        caseId: "case-1",
        reportId: "report-2",
        playerId: "player-1",
        clubId: "club-1",
        checkpoint: "oneSeason",
        dueWeek: 10,
        dueSeason: 2,
        status: "complete",
        completedWeek: 10,
        completedSeason: 2,
        overallScore: 82,
        playerFacingDimensions: [],
        findings: [],
      },
    },
    consequenceState,
    inbox: [{
      id: "prospect-follow-up:case-1:decision-1:early-check",
      week: 10,
      season: 1,
      type: "feedback",
      title: "First pathway check",
      body: "The first adaptation block has produced a real comparison.",
      read: false,
      actionRequired: false,
    }],
    clubs: { "club-1": { id: "club-1", name: "Northbridge Academy" } },
    reportDeliveries: {},
    discoveryRecords: [],
    reflectionJournal: {},
    alumniRecords: [],
    playerMovementHistory: [],
    activeLoans: [],
    loanHistory: [],
  } as unknown as GameState;
}

describe("longitudinal scouting case depth", () => {
  it("keeps the original professional question stable when a case is enriched", () => {
    const first = openProfessionalScoutingCase({
      scoutingCases: {},
      scoutId: "scout-1",
      playerId: "player-1",
      week: 1,
      season: 1,
      context: {
        modeId: "youth-scout",
        familyId: "first-frame",
        title: "The first frame",
        premise: "The original professional dilemma.",
        centralQuestion: "Should evidence or opportunity set the timetable?",
        stakeholderRefs: ["family"],
        judgmentDecisionIds: ["decision-a"],
      },
    });
    const enriched = openProfessionalScoutingCase({
      scoutingCases: first.scoutingCases,
      scoutId: "scout-1",
      playerId: "player-1",
      week: 4,
      season: 1,
      context: {
        modeId: "youth-scout",
        familyId: "replacement-frame",
        title: "A replacement frame",
        premise: "This must not erase the original dilemma.",
        centralQuestion: "Should this overwrite the first question?",
        stakeholderRefs: ["academy"],
        judgmentDecisionIds: ["decision-b"],
      },
    });

    expect(enriched.scoutingCase.professionalContext).toMatchObject({
      familyId: "first-frame",
      title: "The first frame",
      centralQuestion: "Should evidence or opportunity set the timetable?",
      stakeholderRefs: ["family", "academy"],
      judgmentDecisionIds: ["decision-a", "decision-b"],
    });
  });

  it("derives questions, unknowns, comparisons, callbacks, and accountability from canonical records", () => {
    const state = caseState();
    const depth = buildScoutingCaseDepth(state, "case-1");

    expect(depth?.centralQuestion).toMatchObject({
      source: "professionalContext",
      persistent: true,
      text: "Which environment gives this player the best chance to develop?",
    });
    expect(depth?.questionHistory.map((question) => question.questionId).filter(Boolean))
      .toEqual(["movement", "pressure"]);
    expect(depth?.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "unknown-pressure", status: "open" }),
      expect.objectContaining({ id: "unknown-role", status: "reframed" }),
    ]));
    expect(depth?.comparisons.at(-1)).toMatchObject({
      verdict: "supportsPattern",
      contextChanged: true,
    });
    expect(depth?.contextChanges.map((change) => change.kind)).toContain("context");
    expect(depth?.callbacks.map((callback) => callback.kind)).toEqual([
      "professionalConsequence",
      "pathwayFollowUp",
    ]);
    expect(depth?.accountability).toMatchObject({
      status: "vindicated",
      stakedConviction: "strongRecommend",
      latestDecisionOutcome: "accepted",
      latestReviewScore: 82,
    });

    const serialized = JSON.stringify(depth);
    expect(serialized).not.toMatch(/currentAbility|potentialAbility|validationSnapshot/);
  });

  it("projects the same derived case state through the existing timeline authority", () => {
    const timeline = buildScoutingCaseTimeline(caseState(), "case-1");
    expect(timeline?.centralQuestion.text).toBe(
      "Which environment gives this player the best chance to develop?",
    );
    expect(timeline?.unknowns.find((unknown) => unknown.status === "open")?.id)
      .toBe("unknown-pressure");
    expect(timeline?.comparisons).toHaveLength(1);
    expect(timeline?.accountability.status).toBe("vindicated");
  });
});
