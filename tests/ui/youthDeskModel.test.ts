import { describe, expect, it } from "vitest";
import type { Observation, ScoutReport } from "@/engine/core/types";
import { buildYouthDeskDecisionIndex, buildYouthActiveCaseModel, type YouthDeskProspectEntry } from "@/components/game/workspace/desk/youthDeskModel";

const prospect: YouthDeskProspectEntry = {
  youth: {
    id: "youth-1",
    player: {
      id: "player-1",
      firstName: "Maya",
      lastName: "Reed",
      age: 17,
      position: "CM",
      secondaryPositions: [],
    },
  },
  observationCount: 3,
  intelCount: 0,
  reported: false,
  buzzLevel: 50,
  visibility: 50,
  hasFirmRead: true,
};

describe("buildYouthActiveCaseModel", () => {
  it("explains how the linked recruitment brief weights the active case", () => {
    const model = buildYouthActiveCaseModel({
      decisionReadyYouth: [prospect],
      evidenceQueue: [],
      observedYouthEvidence: [prospect],
      openRecruitmentBriefs: [{
        id: "brief-1",
        expiresWeek: 10,
        expiresSeason: 1,
        requiredPositions: ["CM"],
        developmentPriority: "technicalCeiling",
        weeklyWageBudget: 2_000,
        riskTolerance: "medium",
        competitionPressure: 78,
      }],
      pendingPlacementCount: 0,
      scheduledSlots: 3,
      openDayCount: 4,
    });

    expect(model.briefLine).toContain("This brief weights technical ceiling most heavily");
    expect(model.briefLine).toContain("CM pathway");
  });
});


describe("private pass desk state", () => {
  const build = (entry: YouthDeskProspectEntry) => buildYouthActiveCaseModel({
    decisionReadyYouth: [], evidenceQueue: entry.canReconsider ? [entry] : [],
    observedYouthEvidence: [entry], openRecruitmentBriefs: [], pendingPlacementCount: 0,
    scheduledSlots: 3, openDayCount: 4,
  });

  it("preserves a pass without presenting it as a recommendation or urging another look", () => {
    const model = build({ ...prospect, reported: true, passedForNow: true });
    expect(model.stageId).toBe("passed");
    expect(model.title).toContain("passed for now");
    expect(model.recommendationLine).toContain("private pass");
    expect(model.summary).toContain("Spend the next look elsewhere");
    expect(model.stageSteps.some((step) => step.label === "Recommendation" && step.complete)).toBe(false);
  });

  it("invites reconsideration only when unconsumed first-hand evidence exists", () => {
    const report = { id: "report-pass", scoutId: "scout-1", playerId: "player-1", recommendedAction: "pass",
      submittedWeek: 2, submittedSeason: 1, evidenceObservationIds: ["old-evidence"] } as ScoutReport;
    const old = { id: "old-evidence", scoutId: "scout-1", playerId: "player-1", week: 1, season: 1 } as Observation;
    const otherScout = { ...old, id: "other-scout-evidence", scoutId: "scout-2", week: 3 };
    const initial = buildYouthDeskDecisionIndex([report], [old, otherScout], "scout-1").get("player-1")!;
    expect(initial).toMatchObject({ passedForNow: true, canReconsider: false });
    const fresh = { ...old, id: "fresh-evidence", week: 3 };
    const revised = buildYouthDeskDecisionIndex([report], [old, fresh], "scout-1").get("player-1")!;
    expect(revised).toMatchObject({ passedForNow: true, canReconsider: true });
    const model = build({ ...prospect, reported: true, ...revised });
    expect(model.stageId).toBe("case");
    expect(model.stageLabel).toBe("Reconsider");
    expect(model.summary).toContain("original reason");
    expect(model.recommendationLine).toContain("without requiring a recommendation");
  });

  it("uses the latest revision and does not label a monitoring judgment as a tracked recommendation", () => {
    const pass = { id: "pass", scoutId: "scout-1", playerId: "player-1", recommendedAction: "pass", submittedWeek: 2, submittedSeason: 1, revision: 1 } as ScoutReport;
    const reconsidered = { ...pass, id: "monitor", recommendedAction: "monitor" as const, revision: 2 };
    const decision = buildYouthDeskDecisionIndex([reconsidered, pass], [], "scout-1").get("player-1")!;
    expect(decision.passedForNow).toBe(false);
    const model = build({ ...prospect, reported: true, ...decision });
    expect(model.title).toContain("filed judgment");
    expect(model.summary).toContain("keep the case under review");
  });
});
