import { describe, expect, it } from "vitest";
import { buildYouthActiveCaseModel, type YouthDeskProspectEntry } from "./youthDeskModel";

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
