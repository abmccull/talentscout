import { describe, expect, it } from "vitest";
import type { Scout } from "@/engine/core/types";
import {
  createCareerChronologyState,
  getFinalChapterEligibility,
  processCareerSeasonRollover,
  recordCareerTierReached,
} from "@/engine/career/chronology";

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Ari",
    lastName: "Morgan",
    age: 40,
    skills: {
      technicalEye: 10,
      physicalAssessment: 10,
      psychologicalRead: 10,
      tacticalUnderstanding: 10,
      dataLiteracy: 10,
      playerJudgment: 10,
      potentialAssessment: 10,
    },
    attributes: {
      networking: 10,
      persuasion: 10,
      endurance: 10,
      adaptability: 10,
      memory: 10,
      intuition: 10,
    },
    primarySpecialization: "youth",
    specializationLevel: 1,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 1,
    careerPath: "independent",
    reputation: 0,
    clubTrust: 0,
    specializationReputation: 0,
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 0,
    skillXp: {},
    attributeXp: {},
    ...overrides,
  } as Scout;
}

describe("career chronology", () => {
  it("ages once per crossed season and is idempotent for a replayed rollover", () => {
    const initialScout = scout();
    const chronology = createCareerChronologyState({ currentSeason: 1, careerTier: 1 });
    const first = processCareerSeasonRollover({ scout: initialScout, chronology, nextSeason: 2 });
    const replay = processCareerSeasonRollover({
      scout: first.scout,
      chronology: first.chronology,
      nextSeason: 2,
    });

    expect(first.scout.age).toBe(41);
    expect(first.chronology.completedSeasons).toBe(1);
    expect(replay.scout.age).toBe(41);
    expect(replay.seasonsAged).toBe(0);
  });

  it("keeps batch and sequential season advancement equivalent", () => {
    const initialScout = scout();
    const chronology = createCareerChronologyState({ currentSeason: 2024, careerTier: 1 });
    const batch = processCareerSeasonRollover({ scout: initialScout, chronology, nextSeason: 2027 });
    const sequential = [2025, 2026, 2027].reduce(
      (result, nextSeason) => processCareerSeasonRollover({
        scout: result.scout,
        chronology: result.chronology,
        nextSeason,
      }),
      { scout: initialScout, chronology, seasonsAged: 0 },
    );

    expect(batch.scout.age).toBe(sequential.scout.age);
    expect(batch.chronology).toEqual(sequential.chronology);
  });

  it("opens an elective final chapter through age, career length, or elite tenure", () => {
    let chronology = createCareerChronologyState({ currentSeason: 1, careerTier: 5 });
    chronology = recordCareerTierReached(chronology, 5, { season: 2, week: 1 });
    chronology = { ...chronology, completedSeasons: 12 };

    expect(getFinalChapterEligibility(
      scout({ age: 60, careerTier: 5 }),
      chronology,
      { season: 5, week: 1 },
    )).toEqual({
      eligible: true,
      reasons: ["veteranAge", "longCareer", "eliteTenure"],
    });
  });
});
