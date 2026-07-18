import { describe, expect, it } from "vitest";

import type {
  NewGameConfig,
  Observation,
  ObservationContext,
  Player,
} from "@/engine/core/types";
import {
  deriveObservationContextResolution,
} from "@/engine/observation/contextResolution";
import { createObservationSituation } from "@/engine/observation/situations";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { observePlayerLight } from "@/engine/scout/perception";

const SCOUT_CONFIG: NewGameConfig = {
  scoutFirstName: "Context",
  scoutLastName: "Tester",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "observation-context-resolution",
  startingCountry: "england",
  selectedCountries: ["england", "brazil"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 2,
    dataLiteracy: 0,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

function createPlayer(overrides: Partial<Player> = {}): Player {
  const generated = generatePlayer(new RNG("context-player"), {
    position: "RB",
    ageRange: [17, 17],
    abilityRange: [92, 92],
    nationality: "Brazilian",
    clubId: "club-test",
  });
  return {
    ...generated,
    naturalRole: "invertedFullBack",
    ...overrides,
  };
}

function createObservationStub(
  id: string,
  playerId: string,
  context: ObservationContext,
  repetitionKey: string,
): Observation {
  return {
    id,
    playerId,
    scoutId: "scout-1",
    week: 1,
    season: 1,
    context,
    attributeReadings: [{
      attribute: "passing",
      perceivedValue: 12,
      confidence: 0.5,
      observationCount: 1,
      rangeLow: 10,
      rangeHigh: 14,
    }],
    notes: [],
    flaggedMoments: [],
    situation: {
      ...createObservationSituation({
        activityType: context === "streetFootball" ? "streetFootball" : "schoolMatch",
        seed: `${id}-${context}`,
      }),
      repetitionKey,
    },
  };
}

function averageConfidenceByAttributes(
  observation: Observation,
  attributes: readonly string[],
): number {
  const relevant = observation.attributeReadings.filter((reading) =>
    attributes.includes(reading.attribute),
  );
  if (relevant.length === 0) return 0;
  return relevant.reduce((sum, reading) => sum + reading.confidence, 0) / relevant.length;
}

describe("observation context resolution", () => {
  it("rewards changed context and punishes repeating the same situation", () => {
    const player = createPlayer();
    const schoolSituation = createObservationSituation({
      activityType: "schoolMatch",
      seed: "changed-context-school",
      countryId: "brazil",
    });
    const trialSituation = createObservationSituation({
      activityType: "academyTrialDay",
      seed: "changed-context-trial",
      countryId: "brazil",
    });
    const history = [
      createObservationStub(
        "history-school",
        player.id,
        "schoolMatch",
        schoolSituation.repetitionKey,
      ),
    ];

    const repeated = deriveObservationContextResolution({
      player,
      context: "schoolMatch",
      existingObservations: history,
      situation: schoolSituation,
    });
    const changed = deriveObservationContextResolution({
      player,
      context: "academyTrialDay",
      existingObservations: history,
      situation: trialSituation,
    });

    expect(repeated.changedContext).toBe(false);
    expect(changed.changedContext).toBe(true);
    expect(changed.attributeBudgetDelta).toBeGreaterThan(repeated.attributeBudgetDelta);
    expect(changed.evidencePassBonus).toBeGreaterThan(repeated.evidencePassBonus);
    expect(changed.notes.join(" ")).toContain("Changed context directly tests");
    expect(repeated.notes.join(" ")).toContain("Repeating the same context");
  });

  it("marks structured-role reads as unsafe in loose school environments", () => {
    const player = createPlayer({ position: "RB", naturalRole: "invertedFullBack" });
    const schoolSituation = createObservationSituation({
      activityType: "schoolMatch",
      seed: "role-mismatch-school",
      countryId: "brazil",
    });

    const resolution = deriveObservationContextResolution({
      player,
      context: "schoolMatch",
      existingObservations: [],
      situation: schoolSituation,
    });

    expect((resolution.signalByDomain.tactical ?? 1)).toBeLessThan(0.62);
    expect((resolution.confidenceByDomain.tactical ?? 0)).toBeLessThan(-0.05);
    expect(resolution.notes.join(" ")).toContain("too loose to trust a clean role-fit read");
  });

  it("makes training a clearer tactical context than an agent showcase in actual observation output", () => {
    const scout = createScout(SCOUT_CONFIG, new RNG("context-scout"));
    const player = createPlayer({ position: "CM", naturalRole: "deepLyingPlaymaker" });
    const trainingSituation = createObservationSituation({
      activityType: "trainingVisit",
      seed: "training-resolution",
      countryId: "england",
    });
    const showcaseSituation = createObservationSituation({
      activityType: "agentShowcase",
      seed: "showcase-resolution",
      countryId: "england",
    });

    const training = observePlayerLight(
      new RNG("actual-training"),
      player,
      scout,
      "trainingGround",
      [],
      4,
      { situation: trainingSituation },
    );
    const showcase = observePlayerLight(
      new RNG("actual-showcase"),
      player,
      scout,
      "agentShowcase",
      [],
      4,
      { situation: showcaseSituation },
    );

    expect(
      averageConfidenceByAttributes(training, ["positioning", "vision", "teamwork", "marking"]),
    ).toBeGreaterThan(
      averageConfidenceByAttributes(showcase, ["positioning", "vision", "teamwork", "marking"]),
    );
    expect(training.notes.join(" ")).toContain("Training reveals coached role execution");
    expect(showcase.notes.join(" ")).toContain("curated and incentive-distorted");
  });

  it("keeps weak repeated same-situation samples deterministic and narrow", () => {
    const scout = createScout(SCOUT_CONFIG, new RNG("weak-signal-scout"));
    const player = createPlayer({ position: "LW", naturalRole: "winger" });
    const streetSituation = createObservationSituation({
      activityType: "streetFootball",
      seed: "weak-signal-street",
      countryId: "brazil",
    });
    const history = [
      createObservationStub("street-1", player.id, "streetFootball", streetSituation.repetitionKey),
      createObservationStub("street-2", player.id, "streetFootball", streetSituation.repetitionKey),
    ];

    const first = observePlayerLight(
      new RNG("weak-repeat"),
      player,
      scout,
      "streetFootball",
      history,
      2,
      { situation: streetSituation },
    );
    const replay = observePlayerLight(
      new RNG("weak-repeat"),
      player,
      scout,
      "streetFootball",
      history,
      2,
      { situation: streetSituation },
    );

    expect(replay).toEqual(first);
    expect(first.attributeReadings.length).toBeLessThanOrEqual(2);
    expect(first.notes.join(" ")).toContain("narrow evidence is safe to log");
  });
});
