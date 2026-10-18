import { expect, it } from "vitest";
import { buildYouthActiveCaseModel, type YouthDeskProspectEntry } from "@/components/game/workspace/desk/youthDeskModel";

it("keeps source types visible without borrowing another player's pending recommendation", () => {
  const entry: YouthDeskProspectEntry = {
    youth: { id: "y", player: { id: "p", firstName: "Tyrone", lastName: "Henderson",
      age: 16, position: "CM", secondaryPositions: [] } },
    observationCount: 1, videoCount: 2, analysisCount: 1, conversationCount: 1,
    intelCount: 0, reported: false, buzzLevel: 0, visibility: 0, hasFirmRead: false,
  };
  const model = buildYouthActiveCaseModel({ decisionReadyYouth: [], evidenceQueue: [entry],
    observedYouthEvidence: [entry], openRecruitmentBriefs: [], pendingPlacementCount: 1,
    scheduledSlots: 0, openDayCount: 7 });
  expect(model.stageId).toBe("liveLook");
  expect(model.evidenceLine).toBe("1 live look, 2 video reviews, 1 analysis record, 1 conversation record, 0 contact notes on file.");
  expect(model.networkLine).toContain("Conversations are recorded");
  expect(model.title).not.toContain("tracked recommendation");
});
