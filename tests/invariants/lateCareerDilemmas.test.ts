import { describe, expect, it } from "vitest";
import {
  getEligibleLateCareerDilemmas,
  selectLateCareerDilemma,
} from "@/engine/career/lateCareerDilemmas";

describe("late-career dilemma definitions", () => {
  it("makes path and specialization change the eligible arc set", () => {
    const clubYouth = getEligibleLateCareerDilemmas({
      careerTier: 5,
      careerPath: "club",
      specialization: "youth",
      staffCount: 3,
      seasonsCompleted: 8,
    }).map((item) => item.id);
    const independentData = getEligibleLateCareerDilemmas({
      careerTier: 5,
      careerPath: "independent",
      specialization: "data",
      staffCount: 3,
      seasonsCompleted: 8,
    }).map((item) => item.id);

    expect(clubYouth).toContain("clubDoctrineCollision");
    expect(clubYouth).toContain("youthGuardianship");
    expect(clubYouth).not.toContain("agencyIndependenceCrossroads");
    expect(independentData).toContain("agencyIndependenceCrossroads");
    expect(independentData).toContain("dataModelCrisis");
    expect(independentData).not.toContain("clubDoctrineCollision");
  });

  it("does not repeat a seen arc and selects deterministically", () => {
    const input = {
      rootSeed: "career-seed",
      season: 9,
      week: 12,
      context: {
        careerTier: 5 as const,
        careerPath: "club" as const,
        specialization: "firstTeam" as const,
        staffCount: 2,
        seasonsCompleted: 8,
      },
      seenIds: new Set(["reputationMortgage"]),
    };
    const first = selectLateCareerDilemma(input);
    const replay = selectLateCareerDilemma(input);

    expect(first).toEqual(replay);
    expect(first?.id).not.toBe("reputationMortgage");
  });

  it("keeps all choices explicit about immediate and delayed consequences", () => {
    const eligible = getEligibleLateCareerDilemmas({
      careerTier: 5,
      careerPath: "club",
      specialization: "regional",
      staffCount: 3,
      seasonsCompleted: 10,
    });
    expect(eligible.length).toBeGreaterThan(0);
    for (const dilemma of eligible) {
      expect(dilemma.stages.map((stage) => stage.id)).toEqual(["opening", "reckoning", "callback"]);
      for (const option of dilemma.options) {
        expect(option.knownTradeoffs.length).toBeGreaterThanOrEqual(3);
        expect(option.immediateOutcomeTags.length).toBeGreaterThan(0);
        expect(option.delayedOutcomeTags.length).toBeGreaterThan(0);
      }
    }
  });
});
