import { describe, expect, it } from "vitest";

import type { CulturalInsight, NewGameConfig } from "@/engine/core/types";
import {
  applyAtmosphereToObservationSituation,
  createObservationSituation,
  getObservationSituationAttributeModifier,
} from "@/engine/observation/situations";
import type { AtmosphereEvent, VenueAtmosphere } from "@/engine/observation/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { observePlayerLight } from "@/engine/scout/perception";
import {
  hydrateCulturalInsight,
  resolveCulturalInsightEffects,
} from "@/engine/world/footballCulture";

const SCOUT_CONFIG: NewGameConfig = {
  scoutFirstName: "Situation",
  scoutLastName: "Tester",
  scoutAge: 32,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "observation-situations",
  startingCountry: "england",
  selectedCountries: ["england", "brazil"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

const LEGACY_INSIGHT: CulturalInsight = {
  type: "developmentCulture",
  description: "Mixed formal and informal development pathways.",
  gameplayEffect: "Local context helps interpret development evidence.",
};

describe("observation situations", () => {
  it("is stable for one seed and records materially different situation keys", () => {
    const first = createObservationSituation({
      activityType: "attendMatch",
      seed: "stable-watch",
      venueType: "league-match",
      countryId: "england",
    });
    const replay = createObservationSituation({
      activityType: "attendMatch",
      seed: "stable-watch",
      venueType: "league-match",
      countryId: "england",
    });
    const trial = createObservationSituation({
      activityType: "trialMatch",
      seed: "stable-watch",
      venueType: "league-match",
      countryId: "england",
    });

    expect(replay).toEqual(first);
    expect(trial.repetitionKey).not.toBe(first.repetitionKey);
    expect(trial.stakes).toBe("careerDefining");
  });

  it("turns adverse atmosphere into visible evidence uncertainty without changing the situation identity", () => {
    const original = createObservationSituation({
      activityType: "attendMatch",
      seed: "storm-watch",
      countryId: "england",
    });
    const atmosphere: VenueAtmosphere = {
      venueType: "senior-stadium",
      chaosLevel: 0.8,
      crowdIntensity: 0.9,
      weather: "heavy_rain",
      amplifiedAttributes: ["composure"],
      dampenedAttributes: ["passing", "firstTouch"],
      description: "A driving storm and hostile crowd make clean actions difficult to read.",
    };
    const event: AtmosphereEvent = {
      id: "pitch-invasion_12",
      description: "A long stoppage destroys the rhythm of the sample.",
      effect: "distraction",
      affectedAttributes: ["decisionMaking", "passing"],
      noiseDelta: 0.25,
    };
    const adverse = applyAtmosphereToObservationSituation(original, atmosphere, [event]);

    expect(adverse.id).toBe(original.id);
    expect(adverse.competitionLevel).toBe(original.competitionLevel);
    expect(adverse.stakes).toBe(original.stakes);
    expect(adverse.tacticalFrame).toBe(original.tacticalFrame);
    expect(adverse.uncertaintyMultiplier).toBeGreaterThan(original.uncertaintyMultiplier);
    expect(adverse.atmosphereEventIds).toEqual(["pitch-invasion"]);
    expect(getObservationSituationAttributeModifier(adverse, "passing").noiseMultiplier)
      .toBeGreaterThan(getObservationSituationAttributeModifier(original, "passing").noiseMultiplier);
  });

  it("hydrates legacy football-culture knowledge into bounded interpretation effects", () => {
    const effects = resolveCulturalInsightEffects("Brazil", LEGACY_INSIGHT);
    const hydrated = hydrateCulturalInsight("Brazil", LEGACY_INSIGHT);
    const withoutCulture = createObservationSituation({
      activityType: "academyVisit",
      seed: "culture-watch",
      countryId: "brazil",
    });
    const withCulture = createObservationSituation({
      activityType: "academyVisit",
      seed: "culture-watch",
      countryId: "brazil",
      culturalInsights: [LEGACY_INSIGHT],
    });

    expect(hydrated.id).toBe("culture:brazil:developmentCulture:v1");
    expect(hydrated.effects).toEqual(effects);
    expect(withCulture.culturalInsightIds).toEqual([hydrated.id]);
    expect(withCulture.signalByDomain.technical).not.toBe(withoutCulture.signalByDomain.technical);
    expect(withCulture.uncertaintyMultiplier).toBeGreaterThanOrEqual(0.7);
    expect(withCulture.uncertaintyMultiplier).toBeLessThanOrEqual(1.6);
    expect(JSON.stringify(withCulture)).not.toMatch(/currentAbility|potentialAbility|trueAttributes/);
  });

  it("makes trip posture affect filed evidence and persists the player-facing cause", () => {
    const scout = createScout(SCOUT_CONFIG, new RNG("situation-scout"));
    const player = generatePlayer(new RNG("situation-player"), {
      position: "CM",
      ageRange: [17, 17],
      abilityRange: [90, 90],
      nationality: "Brazilian",
      clubId: "club-brazil",
    });
    const deepDive = createObservationSituation({
      activityType: "attendMatch",
      seed: "posture-watch",
      countryId: "brazil",
      travelPosture: "deepDive",
    });
    const blitz = createObservationSituation({
      activityType: "attendMatch",
      seed: "posture-watch",
      countryId: "brazil",
      travelPosture: "opportunityBlitz",
    });
    const deepObservation = observePlayerLight(
      new RNG("posture-evidence"),
      player,
      scout,
      "liveMatch",
      [],
      0,
      { situation: deepDive },
    );
    const blitzObservation = observePlayerLight(
      new RNG("posture-evidence"),
      player,
      scout,
      "liveMatch",
      [],
      0,
      { situation: blitz },
    );
    const averageConfidence = (values: typeof deepObservation.attributeReadings) =>
      values.reduce((sum, reading) => sum + reading.confidence, 0) / values.length;

    expect(deepDive.uncertaintyMultiplier).toBeLessThan(blitz.uncertaintyMultiplier);
    expect(averageConfidence(deepObservation.attributeReadings))
      .toBeGreaterThan(averageConfidence(blitzObservation.attributeReadings));
    expect(deepObservation.situation).toEqual(deepDive);
    expect(blitzObservation.situation?.contextTags).toContain("travel-posture:opportunityBlitz");
  });
});
