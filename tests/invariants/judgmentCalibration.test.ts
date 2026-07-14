import { describe, expect, it } from "vitest";
import type { ConvictionLevel, Player, ScoutReport } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { buildJudgmentCalibrationProfile } from "@/engine/scout/judgmentCalibration";

function player(id: string, age: number): Player {
  return {
    ...generatePlayer(new RNG(`calibration-${id}`), {
      position: "CM",
      ageRange: [age, age],
      abilityRange: [90, 90],
      nationality: "English",
      clubId: "club",
      firstName: "Case",
      lastName: id,
    }),
    id,
    age,
  };
}

function report(
  id: string,
  playerId: string,
  caseId: string,
  conviction: ConvictionLevel,
  rating?: number,
  revision = 1,
): ScoutReport {
  return {
    id,
    caseId,
    revision,
    playerId,
    scoutId: "scout",
    submittedWeek: revision,
    submittedSeason: 2,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction,
    summary: "A professional judgment with a recorded level of conviction.",
    estimatedValue: 500_000,
    qualityScore: 70,
    ...(rating === undefined ? {} : { postTransferRating: rating }),
  };
}

describe("judgment calibration", () => {
  it("uses one latest report per case and leaves unresolved careers pending", () => {
    const first = player("one", 22);
    const second = player("two", 23);
    const third = player("three", 20);
    const profile = buildJudgmentCalibrationProfile({
      scout: { id: "scout" },
      currentSeason: 3,
      players: { one: first, two: second, three: third },
      retiredPlayers: {},
      reports: {
        obsolete: report("obsolete", "one", "case-one", "strongRecommend", 10, 1),
        latest: report("latest", "one", "case-one", "strongRecommend", 80, 2),
        second: report("second", "two", "case-two", "tablePound", 50),
        pending: report("pending", "three", "case-three", "recommend"),
      },
    });

    expect(profile.distinctCaseCount).toBe(3);
    expect(profile.evaluatedCaseCount).toBe(2);
    expect(profile.pendingCaseCount).toBe(1);
    expect(profile.maturity).toBe(66.7);
    expect(profile.averageOutcome).toBe(65);
    expect(profile.tendency).toBe("overconfident");
    expect(profile.signals.some((signal) => signal.dimension === "position" && signal.label === "CM")).toBe(true);
  });

  it("does not claim accuracy before a case has produced a mature review", () => {
    const prospect = player("pending", 18);
    const profile = buildJudgmentCalibrationProfile({
      scout: { id: "scout" },
      currentSeason: 1,
      players: { pending: prospect },
      reports: {
        pending: report("pending", "pending", "case-pending", "tablePound"),
      },
    });

    expect(profile.tendency).toBe("awaiting-outcomes");
    expect(profile.evaluatedCaseCount).toBe(0);
    expect(profile.pendingCaseCount).toBe(1);
    expect(profile.averageOutcome).toBeUndefined();
  });
});
