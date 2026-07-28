import { describe, expect, it } from "vitest";

import {
  buildSectionNavigatorItems,
  buildSuggestedDescriptorDraft,
} from "@/components/game/report-writer/helpers";

describe("report writer helpers", () => {
  it("drops weakness suggestions that overlap selected strength attributes", () => {
    const descriptorDraft = buildSuggestedDescriptorDraft({
      draft: {
        suggestedStrengthClaims: [
          {
            descriptor: "Explosive first step",
            attributes: ["pace"],
            estimatedValue: 15,
            confidence: 0.8,
          },
        ],
        suggestedWeaknessClaims: [
          {
            descriptor: "Loose first touch",
            attributes: ["firstTouch"],
            estimatedValue: 9,
            confidence: 0.7,
          },
          {
            descriptor: "Pace concerns",
            attributes: ["pace"],
            estimatedValue: 8,
            confidence: 0.6,
          },
        ],
      },
      strengthClaimsByDescriptor: new Map([
        [
          "Explosive first step",
          {
            descriptor: "Explosive first step",
            attributes: ["pace"],
            estimatedValue: 15,
            confidence: 0.8,
          },
        ],
      ]),
      weaknessClaimsByDescriptor: new Map(),
    });

    expect(descriptorDraft.strengths).toEqual(["Explosive first step"]);
    expect(descriptorDraft.weaknesses).toEqual(["Loose first touch"]);
  });

  it("builds the youth workflow navigator from status counts and risk blockers", () => {
    const items = buildSectionNavigatorItems({
      conciseOpeningMode: false,
      isYouthCase: true,
      canSubmit: false,
      reportStatus: {
        blockers: [
          {
            id: "risk-posture",
            stepId: "risk",
            message: "Record a risk stance",
          },
        ],
        canSubmit: false,
        countsByStep: {
          assessment: 0,
          brief: 0,
          case: 2,
          risk: 1,
          final: 3,
        },
        primaryBlocker: "Record a risk stance",
        totalRemaining: 6,
      },
      activeBriefClubName: "Northbridge",
      completedJudgmentCount: 1,
      selectedRiskAssessmentsLength: 0,
      riskSignalCount: 0,
      privateNarrativeNote: "",
      convictionLabel: "Recommend",
    });

    expect(items.map((item) => item.id)).toEqual(["brief", "case", "risk", "final"]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        complete: true,
        detail: "Northbridge selected",
      }),
    );
    expect(items[1].detail).toBe("2 decisions still need support");
    expect(items[2].detail).toBe("Record a risk stance");
    expect(items[3].detail).toBe("6 issues to resolve");
  });
});
