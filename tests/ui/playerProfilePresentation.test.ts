import { describe, expect, it } from "vitest";

import {
  evidenceOpportunityLabel,
  getLatestPlayerReport,
  selectMostRelevantScoutingCase,
  summarizeUnknownAttributes,
} from "@/components/game/player-profile/playerProfilePresentation";

describe("playerProfilePresentation", () => {
  it("uses the latest dated revision when a scout changes a recommendation to monitoring", () => {
    const reports = [
      { id: "previous-season", submittedSeason: 1, submittedWeek: 45, revision: 9, recommendedAction: "sign" },
      { id: "monitor", submittedSeason: 2, submittedWeek: 2, revision: 2, recommendedAction: "monitor" },
      { id: "earlier-revision", submittedSeason: 2, submittedWeek: 2, revision: 1, recommendedAction: "sign" },
    ];
    const originalOrder = reports.map((report) => report.id);
    expect(getLatestPlayerReport(reports as never)?.recommendedAction).toBe("monitor");
    expect(reports.map((report) => report.id)).toEqual(originalOrder);
    expect(getLatestPlayerReport([])).toBeUndefined();
  });

  it("prefers the scouting case with the strongest active professional trail", () => {
    const selected = selectMostRelevantScoutingCase({
      scoutingCases: {
        early: {
          id: "early",
          playerId: "p1",
          scoutId: "s1",
          status: "open",
          reportIds: ["r1"],
          listingIds: [],
          deliveryIds: [],
          decisionIds: [],
          placementReportIds: [],
        },
        active: {
          id: "active",
          playerId: "p1",
          scoutId: "s1",
          status: "reported",
          reportIds: ["r2", "r3"],
          listingIds: [],
          deliveryIds: [],
          decisionIds: ["d1"],
          placementReportIds: [],
          reviewIds: ["review-1"],
          activeReportId: "r3",
          professionalContext: {
            title: "Academy placement",
            centralQuestion: "Can he handle the move?",
            stakeholderRefs: [],
            judgmentDecisionIds: [],
          },
        },
      },
    } as never, "p1");

    expect(selected?.id).toBe("active");
  });

  it("counts repetitive unknown attributes so the UI can collapse them by default", () => {
    const summary = summarizeUnknownAttributes([
      ["Finishing", { value: 12 }],
      ["Crossing", undefined],
      ["Vision", undefined],
    ]);

    expect(summary.visibleCount).toBe(1);
    expect(summary.hiddenCount).toBe(2);
    expect(summary.hiddenLabels).toEqual(["Crossing", "Vision"]);
  });

  it("shows evidence value as a judgment band rather than an optimizer score", () => {
    expect(evidenceOpportunityLabel("high")).toBe("Strong evidence fit");
    expect(evidenceOpportunityLabel("medium")).toBe("Useful evidence fit");
    expect(evidenceOpportunityLabel("low")).toBe("Exploratory evidence");
  });
});
