import { describe, expect, it } from "vitest";
import { createSession } from "@/engine/observation/session";
import { generateReflection } from "@/engine/observation/reflection";
import { RNG } from "@/engine/rng";

describe("reflection evidence authority", () => {
  it("creates no legacy hypotheses or invisible hypothesis reward for a new session", () => {
    const session = createSession({
      activityType: "schoolMatch",
      specialization: "youth",
      playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
      targetPlayerId: "player-1",
      seed: "reflection-authority",
      week: 2,
      season: 1,
      countryId: "england",
    }, new RNG("reflection-authority-session"));

    const result = generateReflection(
      session,
      new RNG("reflection-authority-result"),
      0,
      1,
      { paEstimate: false },
    );

    expect(result.suggestedHypotheses).toEqual([]);
    expect(result.gutFeelingCandidate).toBeNull();
    expect(result.insightPointsFromReflection).toBe(5);
  });
});
