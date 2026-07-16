import { describe, expect, it } from "vitest";

import {
  getHighestValueNextContext,
  rankNextObservationContexts,
  summarizeObservationKnowledge,
} from "@/engine/observation/informationGain";
import type {
  Observation,
  ObservationContext,
  PlayerAttribute,
} from "@/engine/core/types";
import {
  createObservationSituation,
  type ObservationSituationSnapshot,
} from "@/engine/observation/situations";

const PLAYER_ID = "player-1";

function observation(
  id: string,
  context: ObservationContext,
  sourceSessionId: string,
  attributes: readonly PlayerAttribute[] = ["firstTouch"],
  situation?: ObservationSituationSnapshot,
): Observation {
  return {
    id,
    playerId: PLAYER_ID,
    scoutId: "scout-1",
    sourceSessionId,
    week: 1,
    season: 1,
    context,
    attributeReadings: attributes.map((attribute) => ({
      attribute,
      perceivedValue: 12,
      confidence: 0.5,
      observationCount: 1,
    })),
    notes: [],
    flaggedMoments: [],
    situation,
  };
}

function collectObjectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectKeys(entry, keys);
    return keys;
  }
  if (value === null || typeof value !== "object") return keys;

  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(entry, keys);
  }
  return keys;
}

describe("observation information gain", () => {
  it("applies progressively diminishing returns to independent observations in one context", () => {
    const histories = [
      [],
      [observation("obs-1", "liveMatch", "session-1")],
      [
        observation("obs-1", "liveMatch", "session-1"),
        observation("obs-2", "liveMatch", "session-2"),
      ],
      [
        observation("obs-1", "liveMatch", "session-1"),
        observation("obs-2", "liveMatch", "session-2"),
        observation("obs-3", "liveMatch", "session-3"),
      ],
    ] satisfies Observation[][];

    const scores = histories.map((observations) =>
      getHighestValueNextContext({
        observations,
        playerId: PLAYER_ID,
        candidateContexts: ["liveMatch"],
        targetDomains: ["technical"],
      })?.score,
    );

    expect(scores.every((score) => score !== undefined)).toBe(true);
    expect(scores[0]).toBeGreaterThan(scores[1] ?? Number.POSITIVE_INFINITY);
    expect(scores[1]).toBeGreaterThan(scores[2] ?? Number.POSITIVE_INFINITY);
    expect(scores[2]).toBeGreaterThan(scores[3] ?? Number.POSITIVE_INFINITY);
  });

  it("does not treat duplicate records from one source as independent evidence", () => {
    const oneRecord = [observation("obs-1", "videoAnalysis", "session-1")];
    const duplicateRecords = [
      ...oneRecord,
      observation("obs-duplicate", "videoAnalysis", "session-1"),
    ];
    const request = {
      playerId: PLAYER_ID,
      candidateContexts: ["videoAnalysis"] as const,
      targetDomains: ["technical"] as const,
    };

    const singleResult = getHighestValueNextContext({ ...request, observations: oneRecord });
    const duplicateResult = getHighestValueNextContext({
      ...request,
      observations: duplicateRecords,
    });
    const duplicateSummary = summarizeObservationKnowledge(duplicateRecords, PLAYER_ID);

    expect(duplicateResult?.score).toBe(singleResult?.score);
    expect(duplicateResult?.repetitionMultiplier).toBe(singleResult?.repetitionMultiplier);
    expect(duplicateSummary).toMatchObject({
      rawObservationCount: 2,
      independentSourceCount: 1,
      duplicateObservationCount: 1,
      independentSourcesByContext: { videoAnalysis: 1 },
      independentSourcesByDomain: { technical: 1 },
    });
  });

  it("rewards a novel context and independent source family over repeating comparable evidence", () => {
    const ranked = rankNextObservationContexts({
      observations: [observation("obs-1", "liveMatch", "session-1")],
      playerId: PLAYER_ID,
      candidateContexts: ["liveMatch", "trainingGround"],
      targetDomains: ["technical"],
    });

    expect(ranked.map((entry) => entry.context)).toEqual([
      "trainingGround",
      "liveMatch",
    ]);
    expect(ranked[0]).toMatchObject({
      contextIsNovel: true,
      sourceFamilyIsNovel: true,
    });
    expect(ranked[1]).toMatchObject({
      contextIsNovel: false,
      sourceFamilyIsNovel: false,
    });
  });

  it("rewards a materially new situation without pretending the context itself is new", () => {
    const repeated = createObservationSituation({
      activityType: "trainingVisit",
      seed: "known-training-situation",
      venueType: "first-team-training",
    });
    const novel: ObservationSituationSnapshot = {
      ...repeated,
      weather: "heavy_rain",
      repetitionKey: `${repeated.repetitionKey}:adverse`,
    };
    const observations = [
      observation("obs-known", "trainingGround", "session-known", ["firstTouch"], repeated),
    ];
    const repeatedResult = getHighestValueNextContext({
      observations,
      playerId: PLAYER_ID,
      candidateContexts: ["trainingGround"],
      candidateSituations: { trainingGround: repeated },
    });
    const novelResult = getHighestValueNextContext({
      observations,
      playerId: PLAYER_ID,
      candidateContexts: ["trainingGround"],
      candidateSituations: { trainingGround: novel },
    });

    expect(repeatedResult).toMatchObject({
      contextIsNovel: false,
      situationIsNovel: false,
    });
    expect(novelResult).toMatchObject({
      contextIsNovel: false,
      situationIsNovel: true,
    });
    expect(novelResult?.score).toBeGreaterThan(repeatedResult?.score ?? Number.POSITIVE_INFINITY);
    expect(novelResult?.reasons).toContain(
      "Revisits a known context under materially different football conditions.",
    );
  });

  it("prioritizes contexts that address the scout's selected information need", () => {
    const ranked = rankNextObservationContexts({
      observations: [],
      playerId: PLAYER_ID,
      candidateContexts: ["streetFootball", "oppositionAnalysis"],
      targetDomains: ["tactical"],
    });

    expect(ranked[0]).toMatchObject({
      context: "oppositionAnalysis",
      targetAlignment: 1,
    });
    expect(ranked[1]).toMatchObject({
      context: "streetFootball",
      targetAlignment: 0,
    });
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("keeps candidate order stable on ties and returns the top-ranked context", () => {
    const request = {
      observations: [],
      playerId: PLAYER_ID,
      candidateContexts: ["trainingGround", "academyVisit"] as const,
    };

    const ranked = rankNextObservationContexts(request);
    const highest = getHighestValueNextContext(request);

    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked.map((entry) => entry.context)).toEqual([
      "trainingGround",
      "academyVisit",
    ]);
    expect(highest).toEqual(ranked[0]);
    expect(getHighestValueNextContext({ ...request, candidateContexts: [] })).toBeNull();
  });

  it("never returns canonical attributes, ability, or potential values", () => {
    const secretPerceivedCA = 4.987654321;
    const secretPerceivedPA = 4.876543219;
    const ranked = rankNextObservationContexts({
      observations: [{
        ...observation(
          "obs-hidden",
          "parentCoachMeeting",
          "session-hidden",
          ["professionalism"],
        ),
        abilityReading: {
          perceivedCA: secretPerceivedCA,
          caConfidence: 0.7,
          perceivedPALow: 3.5,
          perceivedPAHigh: secretPerceivedPA,
          paConfidence: 0.4,
        },
      }],
      playerId: PLAYER_ID,
      candidateContexts: ["parentCoachMeeting", "trainingGround"],
      targetDomains: ["hidden"],
    });
    const keys = collectObjectKeys(ranked);
    const forbiddenKeys = [
      "attributes",
      "trueAttributes",
      "currentAbility",
      "potentialAbility",
      "abilityReading",
      "perceivedCA",
      "perceivedPALow",
      "perceivedPAHigh",
      "caConfidence",
      "paConfidence",
    ];
    const serialized = JSON.stringify(ranked);

    expect(forbiddenKeys.filter((key) => keys.has(key))).toEqual([]);
    expect(serialized).not.toContain(String(secretPerceivedCA));
    expect(serialized).not.toContain(String(secretPerceivedPA));
  });
});
