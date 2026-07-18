import { describe, expect, it } from "vitest";

import {
  evidenceOpportunityLabel,
  selectMostRelevantScoutingCase,
  summarizeUnknownAttributes,
} from "@/components/game/player-profile/playerProfilePresentation";

describe("playerProfilePresentation", () => {
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
