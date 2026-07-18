import { describe, expect, it } from "vitest";

import type {
  Observation,
  ObservationContext,
  PlayerAttribute,
} from "@/engine/core/types";
import {
  buildFollowUpObservationComparisons,
  compareObservationEvidence,
} from "@/engine/observation/informationGain";
import { createObservationSituation } from "@/engine/observation/situations";

function observation(input: {
  id: string;
  sessionId: string;
  week: number;
  context: ObservationContext;
  values: Partial<Record<PlayerAttribute, number>>;
  confidence?: number;
  situationSeed: string;
  tacticalFrame?: "unstructured" | "direct" | "transitionHeavy" | "possession" | "pressing" | "structured";
}): Observation {
  const situation = createObservationSituation({
    activityType: input.context === "trainingGround" ? "trainingVisit" : "schoolMatch",
    seed: input.situationSeed,
    countryId: "england",
  });
  return {
    id: input.id,
    playerId: "player-1",
    scoutId: "scout-1",
    sourceSessionId: input.sessionId,
    week: input.week,
    season: 1,
    context: input.context,
    attributeReadings: Object.entries(input.values).map(([attribute, perceivedValue]) => ({
      attribute: attribute as PlayerAttribute,
      perceivedValue,
      confidence: input.confidence ?? 0.68,
      observationCount: 1,
    })),
    notes: [],
    flaggedMoments: [],
    situation: {
      ...situation,
      tacticalFrame: input.tacticalFrame ?? situation.tacticalFrame,
      repetitionKey: `${situation.repetitionKey}:${input.tacticalFrame ?? situation.tacticalFrame}`,
    },
  };
}

describe("longitudinal observation comparisons", () => {
  it("strengthens a working pattern only when an independent context broadly agrees", () => {
    const first = observation({
      id: "obs-1",
      sessionId: "session-1",
      week: 2,
      context: "schoolMatch",
      values: { firstTouch: 13, passing: 14 },
      situationSeed: "school-context",
      tacticalFrame: "direct",
    });
    const second = observation({
      id: "obs-2",
      sessionId: "session-2",
      week: 5,
      context: "trainingGround",
      values: { firstTouch: 14, passing: 13 },
      situationSeed: "training-context",
      tacticalFrame: "pressing",
    });

    const comparison = compareObservationEvidence(first, second);
    expect(comparison).toMatchObject({
      verdict: "supportsPattern",
      independent: true,
      contextChanged: true,
      sharedAttributeCount: 2,
    });
    expect(comparison.contextChanges.map((change) => change.kind)).toEqual(
      expect.arrayContaining(["context", "competition", "tacticalFrame"]),
    );
    expect(comparison.summary).toContain("working pattern");
  });

  it("keeps a disagreement open rather than silently averaging it away", () => {
    const first = observation({
      id: "obs-1",
      sessionId: "session-1",
      week: 2,
      context: "schoolMatch",
      values: { firstTouch: 15, passing: 15 },
      situationSeed: "challenge-one",
    });
    const second = observation({
      id: "obs-2",
      sessionId: "session-2",
      week: 6,
      context: "youthTournament",
      values: { firstTouch: 10, passing: 11 },
      situationSeed: "challenge-two",
    });

    const comparison = compareObservationEvidence(first, second);
    expect(comparison.verdict).toBe("challengesPattern");
    expect(comparison.summary).toContain("remain open");
  });

  it("does not count duplicate records from one session as confirmation", () => {
    const first = observation({
      id: "obs-a",
      sessionId: "same-session",
      week: 2,
      context: "schoolMatch",
      values: { firstTouch: 14 },
      situationSeed: "duplicate-context",
    });
    const duplicate = observation({
      id: "obs-b",
      sessionId: "same-session",
      week: 2,
      context: "schoolMatch",
      values: { firstTouch: 14 },
      situationSeed: "duplicate-context",
    });

    expect(compareObservationEvidence(first, duplicate)).toMatchObject({
      verdict: "inconclusive",
      independent: false,
    });
    expect(buildFollowUpObservationComparisons([first, duplicate], "player-1")).toEqual([]);
  });

  it("returns a bounded latest sequence for a long case", () => {
    const observations = Array.from({ length: 7 }, (_, index) => observation({
      id: `obs-${index}`,
      sessionId: `session-${index}`,
      week: index + 1,
      context: index % 2 === 0 ? "schoolMatch" : "trainingGround",
      values: { firstTouch: 12 + (index % 2), passing: 13 },
      situationSeed: `bounded-${index}`,
    }));

    const comparisons = buildFollowUpObservationComparisons(observations, "player-1", 3);
    expect(comparisons).toHaveLength(3);
    expect(comparisons[0].firstObservationId).toBe("obs-3");
    expect(comparisons[2].secondObservationId).toBe("obs-6");
    expect(JSON.stringify(comparisons)).not.toMatch(/currentAbility|potentialAbility|validationSnapshot/);
  });
});
