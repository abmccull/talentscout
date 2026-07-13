import { describe, expect, it } from "vitest";
import type { YouthRecruitmentBrief } from "@/engine/core/types";
import {
  evaluatePresentationStrategy,
  PRESENTATION_APPROACHES,
} from "@/engine/reports/presentationStrategy";

function brief(overrides: Partial<YouthRecruitmentBrief> = {}): YouthRecruitmentBrief {
  return {
    id: "brief-presentation",
    clubId: "club-1",
    type: "academyPlacement",
    createdWeek: 1,
    createdSeason: 1,
    expiresWeek: 8,
    expiresSeason: 1,
    requiredPositions: ["CM"],
    preferredRole: "boxToBox",
    developmentPriority: "highCeiling",
    maxAge: 17,
    riskTolerance: "medium",
    weeklyWageBudget: 1_000,
    competitionPressure: 50,
    status: "open",
    ...overrides,
  };
}

describe("youth presentation strategy", () => {
  it("keeps all three options mechanically distinct with an explicit tradeoff", () => {
    expect(PRESENTATION_APPROACHES.map((approach) => approach.id)).toEqual([
      "evidenceLed",
      "fitLed",
      "riskLed",
    ]);
    expect(new Set(PRESENTATION_APPROACHES.map((approach) => JSON.stringify(approach.adjustments))).size).toBe(3);
    for (const approach of PRESENTATION_APPROACHES) {
      expect(approach.emphasis.length).toBeGreaterThan(20);
      expect(approach.tradeoff.length).toBeGreaterThan(20);
      expect(Object.values(approach.adjustments).some((value) => value > 0)).toBe(true);
      expect(Object.values(approach.adjustments).some((value) => value < 0)).toBe(true);
    }
  });

  it("makes each approach strongest in a different visible room context", () => {
    const common = {
      contextCount: 3,
      hypothesisCount: 3,
      riskFactorCount: 2,
      roleMatch: true,
    };
    const evidenceRoom = PRESENTATION_APPROACHES.map((approach) => evaluatePresentationStrategy({
      ...common,
      approach: approach.id,
      intendedAudience: "headOfRecruitment",
      brief: brief({ developmentPriority: "highCeiling", riskTolerance: "medium" }),
    }));
    const pathwayRoom = PRESENTATION_APPROACHES.map((approach) => evaluatePresentationStrategy({
      ...common,
      approach: approach.id,
      intendedAudience: "academyDirector",
      brief: brief({ developmentPriority: "earlyReadiness", riskTolerance: "high" }),
    }));
    const riskRoom = PRESENTATION_APPROACHES.map((approach) => evaluatePresentationStrategy({
      ...common,
      approach: approach.id,
      intendedAudience: "academyDirector",
      brief: brief({ developmentPriority: "character", riskTolerance: "low" }),
    }));

    expect(evidenceRoom.find((impact) => impact.approach === "evidenceLed")?.presentationScore)
      .toBeGreaterThan(evidenceRoom.find((impact) => impact.approach === "fitLed")!.presentationScore);
    expect(pathwayRoom.find((impact) => impact.approach === "fitLed")?.presentationScore)
      .toBeGreaterThan(pathwayRoom.find((impact) => impact.approach === "evidenceLed")!.presentationScore);
    expect(riskRoom.find((impact) => impact.approach === "riskLed")?.presentationScore)
      .toBeGreaterThan(riskRoom.find((impact) => impact.approach === "fitLed")!.presentationScore);
  });

  it("treats legacy reports as neutral and never rerolls", () => {
    const input = {
      intendedAudience: "academyDirector" as const,
      brief: brief(),
      contextCount: 4,
      hypothesisCount: 4,
      riskFactorCount: 3,
      roleMatch: true,
    };
    const first = evaluatePresentationStrategy(input);
    const second = evaluatePresentationStrategy(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      legacyNeutral: true,
      alignmentAdjustment: 0,
      presentationScore: 50,
      adjustments: { evidence: 0, briefFit: 0, risk: 0, conviction: 0 },
    });
  });

  it("bounds room alignment even when several visible signals stack", () => {
    for (const approach of PRESENTATION_APPROACHES) {
      const impact = evaluatePresentationStrategy({
        approach: approach.id,
        intendedAudience: "academyDirector",
        brief: brief({ developmentPriority: "character", riskTolerance: "low" }),
        contextCount: 10,
        hypothesisCount: 10,
        riskFactorCount: 10,
        roleMatch: true,
      });
      expect(impact.alignmentAdjustment).toBeGreaterThanOrEqual(-3);
      expect(impact.alignmentAdjustment).toBeLessThanOrEqual(3);
      expect(impact.presentationScore).toBeGreaterThanOrEqual(20);
      expect(impact.presentationScore).toBeLessThanOrEqual(80);
    }
  });
});
