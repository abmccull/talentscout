import { describe, expect, it } from "vitest";
import type { GameState, RegionalKnowledge, Scout, UnsignedYouth } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { processRegionalKnowledgeGrowth } from "@/engine/specializations/regionalKnowledge";
import { getYouthVenuePool } from "@/engine/youth/venues";
import { buildScoutQualityData } from "@/stores/actions/weeklyActions";

function knowledge(countryId: string, knowledgeLevel: number): RegionalKnowledge {
  return {
    countryId,
    knowledgeLevel,
    discoveredLeagues: [],
    culturalInsights: [],
    localContacts: [],
    scoutingEfficiency: 1,
  };
}

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Casey",
    lastName: "Reader",
    age: 30,
    nationality: "English",
    skills: {} as Scout["skills"],
    attributes: { intuition: 12 } as Scout["attributes"],
    primarySpecialization: "youth",
    specializationLevel: 7,
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
        familiarity: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
    ...overrides,
  } as Scout;
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    currentWeek: 10,
    currentSeason: 1,
    countries: ["england", "spain"],
    regionalKnowledge: {
      england: knowledge("england", 25),
      spain: knowledge("spain", 0),
    },
    scout: scout(),
    ...overrides,
  } as GameState;
}

function unsignedYouth(id: string, country: string): UnsignedYouth {
  return {
    id,
    player: {
      id: `player-${id}`,
      firstName: "Alex",
      lastName: "Prospect",
      age: 15,
      potentialAbility: 140,
    } as UnsignedYouth["player"],
    visibility: 10,
    buzzLevel: 10,
    discoveredBy: [],
    regionId: `${country}-r1`,
    country,
    venueAppearances: [],
    generatedSeason: 1,
    placed: false,
    retired: false,
  };
}

describe("regional knowledge invariants", () => {
  it("grows domestic knowledge from the scout's actual home country, not countries[0]", () => {
    const result = processRegionalKnowledgeGrowth(
      state({
        countries: ["spain", "england"],
        scout: scout({
          primarySpecialization: "regional",
          countryReputations: {
            england: {
              country: "england",
              familiarity: 50,
              reportsSubmitted: 0,
              successfulFinds: 0,
              contactCount: 0,
            },
            spain: {
              country: "spain",
              familiarity: 80,
              reportsSubmitted: 0,
              successfulFinds: 0,
              contactCount: 0,
            },
          },
        }),
        regionalKnowledge: {
          england: knowledge("england", 25),
          spain: knowledge("spain", 80),
        },
      }),
      createRNG("home-growth"),
    );

    expect(result.regionalKnowledge.england.knowledgeLevel).toBe(28);
    expect(result.regionalKnowledge.spain.knowledgeLevel).toBe(80);
  });

  it("applies foreign growth to the travel destination while abroad", () => {
    const result = processRegionalKnowledgeGrowth(
      state({
        scout: scout({
          primarySpecialization: "regional",
          travelBooking: {
            destinationCountry: "Spain",
            departureWeek: 9,
            returnWeek: 11,
            cost: 0,
            isAbroad: true,
          },
        }),
        regionalKnowledge: {
          england: knowledge("england", 25),
          spain: knowledge("spain", 10),
        },
      }),
      createRNG("away-growth"),
    );

    expect(result.regionalKnowledge.england.knowledgeLevel).toBe(25);
    expect(result.regionalKnowledge.spain.knowledgeLevel).toBe(13);
  });

  it("filters youth venues by the effective destination country using canonical country keys", () => {
    const pool = getYouthVenuePool(
      createRNG("venue-country"),
      "schoolMatch",
      {
        korea: unsignedYouth("korea", "southkorea"),
        england: unsignedYouth("england", "england"),
      },
      scout({
        travelBooking: {
          destinationCountry: "South Korea",
          departureWeek: 9,
          returnWeek: 11,
          cost: 0,
          isAbroad: true,
        },
      }),
      undefined,
      undefined,
      undefined,
      10,
    );

    expect(pool.map((player) => player.id)).toEqual(["korea"]);
  });

  it("builds youth venue quality from canonical regional knowledge, not country reputations", () => {
    const quality = buildScoutQualityData(
      scout({
        countryReputations: {
          england: {
            country: "england",
            familiarity: 95,
            reportsSubmitted: 0,
            successfulFinds: 0,
            contactCount: 0,
          },
        },
      }),
      {
        england: knowledge("england", 5),
        southkorea: knowledge("southkorea", 63),
      },
      "South Korea",
    );

    expect(quality.regionalKnowledge).toBe(63);
    expect(quality.isYouthSpecialist).toBe(true);
  });
});
