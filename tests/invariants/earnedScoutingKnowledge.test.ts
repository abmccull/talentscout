import { describe, expect, it } from "vitest";
import type { AttributeReading, Observation, Player, Scout, ScoutCueReading } from "@/engine/core/types";
import type { PlayerMoment } from "@/engine/observation/types";
import { generatePlayer } from "@/engine/players/generation";
import { checkPersonalityReveal } from "@/engine/players/personalityReveal";
import { generatePersonalityProfile, progressivePersonalityReveal } from "@/engine/players/personalityEffects";
import { createRNG } from "@/engine/rng";
import { observePlayerLight } from "@/engine/scout/perception";
import { buildObservedAttributeReadings } from "@/engine/scout/observedKnowledge";
import { generateAbilityReading } from "@/engine/scout/starRating";

const scout = {
  id: "scout", primarySpecialization: "youth", fatigue: 0,
  skills: { technicalEye: 15, physicalAssessment: 15, psychologicalRead: 15,
    tacticalUnderstanding: 15, playerJudgment: 15, potentialAssessment: 15, dataLiteracy: 15 },
} as Scout;

function player(): Player {
  return generatePlayer(createRNG("earned-player"), {
    position: "CM", ageRange: [16, 16], abilityRange: [55, 55],
    nationality: "English", clubId: "", firstName: "Ari", lastName: "Vale",
  });
}

function evidence(playerId: string, quality: number, clarity: ScoutCueReading["clarity"] = "strong") {
  const moment: PlayerMoment = {
    id: "moment", playerId, quality, momentType: "technicalAction",
    attributesHinted: ["passing", "professionalism"], description: "A passing action.",
    vagueDescription: "An action off to one side.", pressureContext: false, isStandout: quality >= 8,
  };
  const cue = {
    id: "cue", sessionId: "session", momentId: moment.id, playerId,
    phaseIndex: 0, confidence: 0.7, clarity,
    attributesHinted: ["passing", "professionalism"],
    direction: quality >= 7 ? "positive" : "negative",
  } as ScoutCueReading;
  return { moment, cue };
}

function readings(value: number): AttributeReading[] {
  return (["passing", "firstTouch", "pace", "stamina", "composure", "workRate",
    "positioning", "decisionMaking", "dribbling", "agility", "teamwork", "offTheBall"] as const)
    .map((attribute) => ({ attribute, perceivedValue: value, confidence: 0.75, observationCount: 1 }));
}

function observation(playerId: string, index: number, context: Observation["context"] = "schoolMatch"): Observation {
  return {
    id: `obs-${index}`, sourceSessionId: `session-${index}`, playerId, scoutId: scout.id,
    week: index + 1, season: 1, context, attributeReadings: readings(10), notes: [], flaggedMoments: [],
  };
}

describe("earned scouting knowledge", () => {
  it("cannot derive readings or ability from an interactive session without usable evidence", () => {
    const subject = player();
    const result = observePlayerLight(createRNG("no-cues"), subject, scout, "schoolMatch", [], 20, {
      sourceSessionId: "session", observedCues: [evidence(subject.id, 10, "glimpse")],
      evidenceAttributes: ["passing"], evidencePasses: 3, confidenceBonus: 1,
    });
    expect(result.attributeReadings).toEqual([]);
    expect(result.abilityReading).toBeUndefined();
    expect(result.revealedPersonalityTrait).toBeUndefined();
    expect(result.updatedPersonalityProfile).toBeUndefined();
  });

  it("preserves the event read when true ability, potential and attributes change", () => {
    const subject = player();
    const changedTruth: Player = {
      ...subject, currentAbility: 190, potentialAbility: 200,
      attributes: Object.fromEntries(Object.keys(subject.attributes).map((attribute) => [attribute, 20])) as Player["attributes"],
    };
    const options = { sourceSessionId: "session", observedCues: [evidence(subject.id, 3)] };
    const first = observePlayerLight(createRNG("fixed-cue"), subject, scout, "schoolMatch", [], undefined, options);
    const second = observePlayerLight(createRNG("fixed-cue"), changedTruth, scout, "schoolMatch", [], undefined, options);
    expect(first).toEqual(second);
    expect(first.attributeReadings.map((reading) => reading.attribute)).toEqual(["passing"]);
  });

  it("improves the provisional reading for a better observed action without changing hidden truth", () => {
    const subject = player();
    const low = buildObservedAttributeReadings(createRNG("performance"), subject.id, [evidence(subject.id, 2)], []);
    const high = buildObservedAttributeReadings(createRNG("performance"), subject.id, [evidence(subject.id, 9)], []);
    expect(high[0].perceivedValue).toBeGreaterThan(low[0].perceivedValue);
    expect(high[0].confidence).toBe(low[0].confidence);
  });

  it("does not count duplicated moments or restored observations as independent proof", () => {
    const subject = player();
    const cue = evidence(subject.id, 7);
    const prior = observation(subject.id, 1);
    const one = buildObservedAttributeReadings(createRNG("dedup"), subject.id, [cue], [prior]);
    const duplicates = buildObservedAttributeReadings(createRNG("dedup"), subject.id, [cue, cue], [prior, prior]);
    expect(duplicates).toEqual(one);
    expect(one[0].observationCount).toBe(2);
    expect(one[0].rangeHigh! - one[0].rangeLow!).toBeGreaterThanOrEqual(6);
  });

  it("narrows corroborated independent evidence but widens a contradicted read", () => {
    const subject = player();
    const cue = evidence(subject.id, 7);
    const fresh = buildObservedAttributeReadings(createRNG("corroboration"), subject.id, [cue], [])[0];
    const history = Array.from({ length: 10 }, (_, index) => ({
      ...observation(subject.id, index), attributeReadings: [{ ...fresh }],
    }));
    const corroborated = buildObservedAttributeReadings(createRNG("corroboration"), subject.id, [cue], history)[0];
    const contradicted = buildObservedAttributeReadings(createRNG("corroboration"), subject.id, [cue],
      history.map((entry) => ({ ...entry, attributeReadings: [{ ...fresh, perceivedValue: 2 }] })))[0];
    expect(corroborated.confidence).toBeGreaterThan(fresh.confidence);
    expect(corroborated.rangeHigh! - corroborated.rangeLow!).toBeLessThan(fresh.rangeHigh! - fresh.rangeLow!);
    expect(contradicted.confidence).toBeLessThan(corroborated.confidence);
    expect(contradicted.rangeHigh! - contradicted.rangeLow!).toBeGreaterThan(corroborated.rangeHigh! - corroborated.rangeLow!);
  });

  it("keeps youth forecasts independent of true PA and broad after repeated same-context sightings", () => {
    const subject = player();
    const history = Array.from({ length: 20 }, (_, index) => observation(subject.id, index));
    const lowTruth = { ...subject, potentialAbility: 70 };
    const highTruth = { ...subject, potentialAbility: 200 };
    const low = generateAbilityReading(createRNG("forecast-a"), lowTruth, scout, history, "schoolMatch", undefined, readings(10));
    const high = generateAbilityReading(createRNG("forecast-b"), highTruth, scout, history, "schoolMatch", undefined, readings(10));
    expect(high).toEqual(low);
    expect(low.perceivedPAHigh - low.perceivedPALow).toBeGreaterThanOrEqual(1.5);
    expect(low.paConfidence).toBeLessThan(0.65);
  });

  it("uses changed observed traits to change a forecast and caps unsupported confidence", () => {
    const subject = player();
    const low = generateAbilityReading(createRNG("low"), subject, scout, [], "schoolMatch", undefined, readings(7));
    const high = generateAbilityReading(createRNG("high"), subject, scout, [], "schoolMatch", undefined, readings(15));
    expect(high.perceivedCA).toBeGreaterThan(low.perceivedCA);
    expect(high.perceivedPAHigh).toBeGreaterThan(low.perceivedPAHigh);
    expect(high.paConfidence).toBeLessThan(high.caConfidence);
  });

  it("does not reveal unrelated personality traits after a successful context roll", () => {
    const hidden = { personalityTraits: ["professional"] as const, personalityRevealed: [] };
    const subject = { ...hidden, personalityTraits: [...hidden.personalityTraits] };
    expect(checkPersonalityReveal({ next: () => 0 }, scout, subject, { activityType: "liveMatch" })).toBeNull();
    expect(checkPersonalityReveal({ next: () => 0 }, scout, subject, { activityType: "unknownVenue" })).toBeNull();
    expect(checkPersonalityReveal({ next: () => 0 }, scout, subject, { activityType: "trainingGround" })).toBe("professional");
  });

  it("never reveals a whole profile or archetype merely from observation count", () => {
    const subject = player();
    subject.personalityTraits = ["professional", "ambitious", "leader"];
    const profile = generatePersonalityProfile(createRNG("personality"), subject);
    const many = progressivePersonalityReveal({ next: () => 0 }, profile, 100, 20);
    expect(many).toBe(profile);
    const supported = progressivePersonalityReveal({ next: () => 0 }, profile, 100, 20, ["professional"]);
    expect(supported.revealedTraits).toEqual(["professional"]);
    expect(supported.hiddenUntilRevealed).toBe(true);
  });
});
