import { describe, expect, it } from "vitest";

import {
  buildSectionNavigatorItems,
  buildSuggestedDescriptorDraft,
  buildStructuredReportInput,
} from "@/components/game/report-writer/helpers";
import { FORMAL_CATEGORY_UNKNOWN_OPTIONS } from "@/engine/scout/evidenceModel";
import { validateStructuredReportInput } from "@/engine/reports/structuredYouthReport";

function riskReportArgs(): Parameters<typeof buildStructuredReportInput>[0] {
  return {
    initialAssessmentMode: false, isYouthCase: true,
    activeBrief: { id: "brief", clubId: "club", status: "open", expiresWeek: 8, expiresSeason: 1 } as never,
    projectedRole: "poacher", intendedAudience: "academyDirector", presentationApproach: "evidenceLed",
    recruitmentNeed: "A young forward", recommendedAction: "monitor", estimatedWeeklyWage: 500,
    alternativePlayerId: "", initialAssessmentCards: [],
    categoryDrafts: Object.fromEntries((["potential", "roleFit", "characterRisk"] as const).map(category => [category, {
      status: "notAssessed", evidenceCardId: "", claimOptionId: "", confidence: "low",
      unknownOptionId: FORMAL_CATEGORY_UNKNOWN_OPTIONS[category][0].id,
    }])) as Parameters<typeof buildStructuredReportInput>[0]["categoryDrafts"],
    selectedRiskAssessments: [{ id: "pressureResponse", label: "Pressure response", status: "observed", evidenceIds: ["risk-cue", "risk-cue"] }],
  };
}

describe("report writer helpers", () => {
  it("declares risk-only evidence once without inventing a category judgment", () => {
    const args = riskReportArgs(), before = JSON.stringify(args);
    const report = buildStructuredReportInput(args)!;
    expect(report.evidenceIds).toEqual(["risk-cue"]);
    expect(Object.values(report.categoryVerdicts).every(v => v.status === "notAssessed" && v.evidenceIds?.length === 0)).toBe(true);
    expect(validateStructuredReportInput(report, args.activeBrief, new Set(["risk-cue"]))).toEqual({ valid: true, errors: [] });
    expect(JSON.stringify(args)).toBe(before);
  });

  it("still rejects unavailable risk evidence and clears references when a concern is untested", () => {
    const args = riskReportArgs();
    const invalid = validateStructuredReportInput(buildStructuredReportInput(args)!, args.activeBrief, new Set());
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("Pressure response references evidence that is no longer available.");
    args.selectedRiskAssessments = [{ id: "pressureResponse", label: "Pressure response", status: "untested", evidenceIds: [] }];
    const untested = buildStructuredReportInput(args)!;
    expect(untested.evidenceIds).toEqual([]);
    expect(validateStructuredReportInput(untested, args.activeBrief, new Set()).valid).toBe(true);
  });
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
      initialAssessmentMode: false,
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
