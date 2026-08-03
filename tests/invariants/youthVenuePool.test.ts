import { describe, expect, it } from "vitest";
import type {
  Scout,
  TournamentEvent,
  UnsignedYouth,
  YouthVenueType,
} from "@/engine/core/types";
import { createRNG, type RNG } from "@/engine/rng";
import { getYouthVenuePool, type ScoutQualityData } from "@/engine/youth/venues";

interface VenuePoolCase {
  name: string;
  venueType: YouthVenueType;
  unsignedYouth: Record<string, UnsignedYouth>;
  filtered: UnsignedYouth[];
  scout: Scout;
  scoutQualityData: ScoutQualityData;
  subRegionId?: string;
  youthDiscoveryBonus?: number;
  currentWeek?: number;
  tournament?: TournamentEvent;
}

const VENUE_POOL_SIZES: Record<YouthVenueType, { minPoolSize: number; maxPoolSize: number }> = {
  schoolMatch: { minPoolSize: 3, maxPoolSize: 6 },
  grassrootsTournament: { minPoolSize: 5, maxPoolSize: 10 },
  streetFootball: { minPoolSize: 2, maxPoolSize: 5 },
  academyTrialDay: { minPoolSize: 4, maxPoolSize: 8 },
  youthFestival: { minPoolSize: 8, maxPoolSize: 15 },
  followUpSession: { minPoolSize: 1, maxPoolSize: 1 },
  parentCoachMeeting: { minPoolSize: 1, maxPoolSize: 1 },
};

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Casey",
    lastName: "Reader",
    age: 31,
    nationality: "English",
    skills: {} as Scout["skills"],
    attributes: { intuition: 14 } as Scout["attributes"],
    primarySpecialization: "youth",
    specializationLevel: 12,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 1,
    careerPath: "independent",
    reputation: 10,
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
    npcScoutIds: [],
    countryReputations: {
      england: {
        country: "england",
        familiarity: 75,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
    ...overrides,
  } as Scout;
}

function makeYouth(
  id: string,
  potentialAbility: number,
  overrides: Partial<UnsignedYouth> & {
    age?: number;
    visibility?: number;
    buzzLevel?: number;
    country?: string;
    regionId?: string;
  } = {},
): UnsignedYouth {
  const age = overrides.age ?? 15;
  const visibility = overrides.visibility ?? 10;
  const buzzLevel = overrides.buzzLevel ?? 45;
  const country = overrides.country ?? "england";
  const regionId = overrides.regionId ?? "england-north";

  return {
    id,
    player: {
      id: `player-${id}`,
      firstName: "Alex",
      lastName: "Prospect",
      age,
      potentialAbility,
    } as UnsignedYouth["player"],
    visibility,
    buzzLevel,
    discoveredBy: [],
    regionId,
    country,
    venueAppearances: [],
    generatedSeason: 1,
    placed: false,
    retired: false,
    ...overrides,
  };
}

function toRecord(youth: UnsignedYouth[]): Record<string, UnsignedYouth> {
  return Object.fromEntries(youth.map((entry) => [entry.id, entry]));
}

function computeQualityWeightReference(data: ScoutQualityData): number {
  let weight = 0.08 + ((data.intuition - 1) / 19) * 0.28;

  if (data.regionalKnowledge >= 80) weight += 0.12;
  else if (data.regionalKnowledge >= 50) weight += 0.06;

  if (data.isYouthSpecialist) {
    weight += (data.specializationLevel / 50) * 0.14;
  }

  return Math.min(0.65, Math.max(0.05, weight));
}

function legacyWeightedShuffle(
  rng: RNG,
  pool: UnsignedYouth[],
  qualityWeight: number,
): UnsignedYouth[] {
  return pool
    .map((youth) => ({
      youth,
      score:
        (youth.player.potentialAbility / 200) * qualityWeight +
        rng.next() * (1 - qualityWeight),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.youth);
}

function legacyReferencePool(rng: RNG, testCase: VenuePoolCase): string[] {
  const config = VENUE_POOL_SIZES[testCase.venueType];
  const bonusMultiplier = 1 + (testCase.youthDiscoveryBonus ?? 0);
  const tournamentMultiplier = testCase.tournament?.poolSizeMultiplier ?? 1;
  const presenceMultiplier = Math.max(
    0.75,
    Math.min(1.35, testCase.scoutQualityData.presenceDiscoveryMultiplier ?? 1),
  );
  const poolSize = Math.round(
    rng.nextInt(config.minPoolSize, config.maxPoolSize)
      * bonusMultiplier
      * tournamentMultiplier
      * presenceMultiplier,
  );
  const qualityWeight = computeQualityWeightReference(testCase.scoutQualityData);

  return legacyWeightedShuffle(rng, testCase.filtered, qualityWeight)
    .slice(0, poolSize)
    .map((player) => player.id);
}

function buildVenuePoolCases(): VenuePoolCase[] {
  const defaultScout = scout();

  const schoolEligible = Array.from({ length: 8 }, (_, index) =>
    makeYouth(`school-${index + 1}`, 112 + index * 8, {
      age: 14 + (index % 3),
      visibility: 8 + index,
    }))
  ;
  const schoolRejected = [
    makeYouth("school-too-old", 190, { age: 17, visibility: 12 }),
    makeYouth("school-too-visible", 185, { age: 15, visibility: 31 }),
    makeYouth("school-abroad", 180, { country: "spain", age: 15, visibility: 10 }),
  ];

  const grassrootsEligible = Array.from({ length: 12 }, (_, index) =>
    makeYouth(`grassroots-${index + 1}`, 104 + index * 7, {
      age: 14 + (index % 4),
      visibility: 10 + (index % 15),
      country: "england",
      buzzLevel: 20 + index,
    }))
  ;
  const grassrootsRejected = [
    makeYouth("grassroots-abroad-1", 191, { country: "spain" }),
    makeYouth("grassroots-abroad-2", 188, { country: "france" }),
  ];

  const streetEligible = Array.from({ length: 7 }, (_, index) =>
    makeYouth(`street-${index + 1}`, 118 + index * 6, {
      age: 14 + (index % 4),
      visibility: 12 + index,
      regionId: "england-north",
    }))
  ;
  const streetRejected = [
    makeYouth("street-wrong-region", 192, { regionId: "england-south", visibility: 10 }),
    makeYouth("street-too-visible", 189, { regionId: "england-north", visibility: 52 }),
  ];

  const academyEligible = Array.from({ length: 10 }, (_, index) =>
    makeYouth(`academy-${index + 1}`, 110 + index * 7, {
      age: 15 + (index % 2),
      buzzLevel: 35 + index * 4,
      visibility: 16 + index,
    }))
  ;
  const academyRejected = [
    makeYouth("academy-low-buzz-1", 195, { buzzLevel: 25 }),
    makeYouth("academy-low-buzz-2", 182, { buzzLevel: 30 }),
  ];

  const festivalEligible = [
    ...Array.from({ length: 9 }, (_, index) =>
      makeYouth(`festival-eng-${index + 1}`, 102 + index * 6, {
        country: "england",
        age: 14 + (index % 4),
        visibility: 12 + index,
      }))
    ,
    ...Array.from({ length: 9 }, (_, index) =>
      makeYouth(`festival-spain-${index + 1}`, 108 + index * 5, {
        country: "spain",
        age: 14 + (index % 4),
        visibility: 10 + index,
      }))
    ,
  ];
  const festivalRejected = [
    makeYouth("festival-too-young", 170, { country: "england", age: 13 }),
    makeYouth("festival-too-old", 171, { country: "spain", age: 18 }),
    makeYouth("festival-outside-tournament", 199, { country: "france", age: 15 }),
  ];

  return [
    {
      name: "school-match",
      venueType: "schoolMatch",
      unsignedYouth: toRecord([...schoolEligible, ...schoolRejected]),
      filtered: schoolEligible,
      scout: defaultScout,
      scoutQualityData: {
        intuition: 14,
        regionalKnowledge: 58,
        specializationLevel: 12,
        isYouthSpecialist: true,
      },
    },
    {
      name: "grassroots-tournament",
      venueType: "grassrootsTournament",
      unsignedYouth: toRecord([...grassrootsEligible, ...grassrootsRejected]),
      filtered: grassrootsEligible,
      scout: defaultScout,
      scoutQualityData: {
        intuition: 15,
        regionalKnowledge: 64,
        specializationLevel: 18,
        isYouthSpecialist: true,
        presenceDiscoveryMultiplier: 1.1,
      },
      youthDiscoveryBonus: 0.15,
    },
    {
      name: "street-football",
      venueType: "streetFootball",
      unsignedYouth: toRecord([...streetEligible, ...streetRejected]),
      filtered: streetEligible,
      scout: defaultScout,
      scoutQualityData: {
        intuition: 13,
        regionalKnowledge: 45,
        specializationLevel: 20,
        isYouthSpecialist: true,
      },
      subRegionId: "england-north",
    },
    {
      name: "academy-trial-day",
      venueType: "academyTrialDay",
      unsignedYouth: toRecord([...academyEligible, ...academyRejected]),
      filtered: academyEligible,
      scout: defaultScout,
      scoutQualityData: {
        intuition: 16,
        regionalKnowledge: 72,
        specializationLevel: 25,
        isYouthSpecialist: true,
        presenceDiscoveryMultiplier: 1.2,
      },
      youthDiscoveryBonus: 0.1,
    },
    {
      name: "youth-festival",
      venueType: "youthFestival",
      unsignedYouth: toRecord([...festivalEligible, ...festivalRejected]),
      filtered: festivalEligible,
      scout: defaultScout,
      scoutQualityData: {
        intuition: 17,
        regionalKnowledge: 82,
        specializationLevel: 28,
        isYouthSpecialist: true,
        presenceDiscoveryMultiplier: 1.25,
      },
      tournament: {
        id: "showcase-1",
        name: "Mediterranean Youth Showcase",
        country: "england",
        participantCountries: ["England", "Spain"],
        category: "international",
        prestige: "regional",
        startWeek: 10,
        endWeek: 10,
        season: 1,
        discovered: true,
        attended: false,
        poolSizeMultiplier: 1.15,
        observationBonus: 1,
        extraAttributes: 0,
      },
    },
  ];
}

describe("youth venue pool invariants", () => {
  it("matches the legacy weighted full-sort slice across representative venue pools and seeds", () => {
    const cases = buildVenuePoolCases();
    const seeds = ["alpha", "bravo", "charlie"];

    for (const testCase of cases) {
      for (const seed of seeds) {
        const actualRng = createRNG(`${testCase.name}:${seed}`);
        const expectedRng = createRNG(`${testCase.name}:${seed}`);

        const actual = getYouthVenuePool(
          actualRng,
          testCase.venueType,
          testCase.unsignedYouth,
          testCase.scout,
          testCase.subRegionId,
          undefined,
          testCase.youthDiscoveryBonus,
          testCase.currentWeek,
          testCase.tournament,
          testCase.scoutQualityData,
        );

        expect(actual.map((player) => player.id)).toEqual(
          legacyReferencePool(expectedRng, testCase),
        );
        expect(actualRng.next()).toBe(expectedRng.next());
      }
    }
  });

  it("preserves stable tie ordering while consuming one score roll per candidate", () => {
    const nextValues: number[] = [];
    const nextIntValues: number[] = [];
    const tieRng = {
      next() {
        nextValues.push(0.5);
        return 0.5;
      },
      nextInt(min: number, max: number) {
        expect(min).toBe(2);
        expect(max).toBe(5);
        nextIntValues.push(2);
        return 2;
      },
      shuffle() {
        throw new Error("shuffle should not be used when scout quality data is present");
      },
    } as unknown as RNG;

    const pool = getYouthVenuePool(
      tieRng,
      "streetFootball",
      toRecord([
        makeYouth("tie-a", 140, { regionId: "england-north", visibility: 10 }),
        makeYouth("tie-b", 140, { regionId: "england-north", visibility: 12 }),
        makeYouth("tie-c", 140, { regionId: "england-north", visibility: 14 }),
      ]),
      scout(),
      "england-north",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        intuition: 14,
        regionalKnowledge: 55,
        specializationLevel: 10,
        isYouthSpecialist: true,
      },
    );

    expect(pool.map((player) => player.id)).toEqual(["tie-a", "tie-b"]);
    expect(nextIntValues).toHaveLength(1);
    expect(nextValues).toHaveLength(3);
  });
});
