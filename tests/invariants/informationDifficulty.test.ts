import { describe, expect, it } from "vitest";

import {
  DIFFICULTY_DESCRIPTIONS,
  calculatePublicRevisionReputationCost,
  getDifficultyChallengeProfile,
} from "@/engine/core/difficulty";
import type { DifficultyLevel } from "@/engine/core/types";
import {
  applyInformationDifficultyToObservationModifier,
  createObservationSituation,
  getObservationSituationAttributeModifier,
  type ObservationSituationAttributeModifier,
} from "@/engine/observation/situations";

const LEVELS: readonly DifficultyLevel[] = ["casual", "normal", "hard", "ironman"];

const BASE_MODIFIER: ObservationSituationAttributeModifier = {
  signalMultiplier: 1.12,
  noiseMultiplier: 1.08,
  confidenceDelta: 0.015,
};

describe("information-problem difficulty", () => {
  it("increases information pressure monotonically without changing the normal baseline", () => {
    const profiles = LEVELS.map(getDifficultyChallengeProfile);

    expect(profiles.map((profile) => profile.evidenceNoiseMultiplier))
      .toEqual([0.84, 1, 1.14, 1.28]);
    expect(profiles.map((profile) => profile.sourceReliabilityMultiplier))
      .toEqual([1.08, 1, 0.9, 0.82]);
    expect(profiles.map((profile) => profile.verificationWindowOffsetWeeks))
      .toEqual([2, 0, -1, -2]);
    expect(profiles.map((profile) => profile.publicRevisionCostMultiplier))
      .toEqual([0.75, 1, 1.2, 1.4]);

    const adjusted = LEVELS.map((level) =>
      applyInformationDifficultyToObservationModifier(BASE_MODIFIER, level));
    expect(adjusted.map((modifier) => modifier.noiseMultiplier))
      .toEqual([...adjusted].map((modifier) => modifier.noiseMultiplier).sort((a, b) => a - b));
    expect(adjusted.map((modifier) => modifier.signalMultiplier))
      .toEqual([...adjusted].map((modifier) => modifier.signalMultiplier).sort((a, b) => b - a));
    expect(adjusted[1]).toEqual(BASE_MODIFIER);
  });

  it("is deterministic, bounded, and does not mutate its evidence input", () => {
    const extreme: ObservationSituationAttributeModifier = {
      signalMultiplier: Number.POSITIVE_INFINITY,
      noiseMultiplier: Number.NaN,
      confidenceDelta: Number.NEGATIVE_INFINITY,
    };
    const before = { ...extreme };

    const first = applyInformationDifficultyToObservationModifier(extreme, "ironman");
    const replay = applyInformationDifficultyToObservationModifier(extreme, "ironman");

    expect(replay).toEqual(first);
    expect(extreme).toEqual(before);
    expect(first.signalMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(first.signalMultiplier).toBeLessThanOrEqual(1.55);
    expect(first.noiseMultiplier).toBeGreaterThanOrEqual(0.65);
    expect(first.noiseMultiplier).toBeLessThanOrEqual(1.75);
    expect(first.confidenceDelta).toBeGreaterThanOrEqual(-0.08);
    expect(first.confidenceDelta).toBeLessThanOrEqual(0.08);
  });

  it("applies difficulty through the situation modifier seam without mutating situation or player truth", () => {
    const situation = createObservationSituation({
      activityType: "parentCoachMeeting",
      seed: "information-difficulty",
      countryId: "england",
    });
    const situationBefore = structuredClone(situation);
    const playerTruth = {
      currentAbility: 91,
      potentialAbility: 154,
      attributes: { passing: 13 },
    };
    const truthBefore = structuredClone(playerTruth);

    const casual = getObservationSituationAttributeModifier(situation, "passing", "casual");
    const normal = getObservationSituationAttributeModifier(situation, "passing", "normal");
    const hard = getObservationSituationAttributeModifier(situation, "passing", "hard");
    const ironman = getObservationSituationAttributeModifier(situation, "passing", "ironman");

    expect(casual.noiseMultiplier).toBeLessThan(normal.noiseMultiplier);
    expect(hard.noiseMultiplier).toBeGreaterThan(normal.noiseMultiplier);
    expect(ironman.noiseMultiplier).toBeGreaterThanOrEqual(hard.noiseMultiplier);
    expect(casual.confidenceDelta).toBeGreaterThan(normal.confidenceDelta);
    expect(ironman.confidenceDelta).toBeLessThan(hard.confidenceDelta);
    expect(situation).toEqual(situationBefore);
    expect(playerTruth).toEqual(truthBefore);
    expect(JSON.stringify({ casual, hard, ironman })).not.toMatch(
      /currentAbility|potentialAbility|attributes/,
    );
  });

  it("describes each information profile in player-facing language", () => {
    expect(DIFFICULTY_DESCRIPTIONS.casual.description).toContain("clearer evidence");
    expect(DIFFICULTY_DESCRIPTIONS.normal.description).toContain("neutral evidence clarity");
    expect(DIFFICULTY_DESCRIPTIONS.hard.description).toContain("Noisier evidence");
    expect(DIFFICULTY_DESCRIPTIONS.ironman.description).toContain("noisy evidence");
  });

  it("charges only material public revisions and scales that consequence by difficulty", () => {
    const previous = {
      conviction: "recommend" as const,
      projectedRole: "boxToBox" as const,
      recommendedAction: "inviteForTrial" as const,
    };
    const clarification = { ...previous };
    const changed = { ...previous, conviction: "tablePound" as const };

    expect(calculatePublicRevisionReputationCost(previous, clarification, "ironman")).toBe(0);
    expect(LEVELS.map((level) =>
      calculatePublicRevisionReputationCost(previous, changed, level)))
      .toEqual([2, 3, 4, 4]);
  });
});
