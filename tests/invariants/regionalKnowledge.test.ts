import { describe, expect, it } from "vitest";
import type { Activity, GameState, RegionalKnowledge, Scout, UnsignedYouth } from "@/engine/core/types";
import { addActivity, createWeekSchedule } from "@/engine/core/calendar";
import { createRNG } from "@/engine/rng";
import { processRegionalKnowledgeGrowth } from "@/engine/specializations/regionalKnowledge";
import { getYouthVenuePool } from "@/engine/youth/venues";
import { buildScoutQualityData } from "@/stores/actions/weeklySimulationSupport";

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

function schedule(activity: Activity) {
  return addActivity(createWeekSchedule(10, 1), activity, 0);
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
        schedule: schedule({
          type: "attendMatch",
          slots: 1,
          description: "Watch a local league match",
        }),
      }),
      createRNG("home-growth"),
    );

    expect(result.regionalKnowledge.england.knowledgeLevel).toBe(26.5);
    expect(result.regionalKnowledge.spain.knowledgeLevel).toBe(80);
    expect(result.regionalKnowledge.england.knowledgeLedger?.[0]).toMatchObject({
      source: "fieldActivity",
      amount: 1.5,
      activityType: "attendMatch",
    });
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
            posture: "deepDive",
          },
        }),
        regionalKnowledge: {
          england: knowledge("england", 25),
          spain: knowledge("spain", 10),
        },
        schedule: schedule({
          type: "trainingVisit",
          slots: 1,
          description: "Study a local training environment",
        }),
      }),
      createRNG("away-growth"),
    );

    expect(result.regionalKnowledge.england.knowledgeLevel).toBe(25);
    expect(result.regionalKnowledge.spain.knowledgeLevel).toBe(12.03);
  });

  it("does not turn idle physical presence into passive mastery", () => {
    const result = processRegionalKnowledgeGrowth(state(), createRNG("idle-does-not-teach"));

    expect(result.regionalKnowledge.england.knowledgeLevel).toBe(25);
    expect(result.regionalKnowledge.england.knowledgeLedger).toEqual([]);
    expect(result.regionalKnowledge.england.processedMetrics).toEqual({
      reportsSubmitted: 0,
      successfulFinds: 0,
      contactCount: 0,
    });
  });

  it("applies each scheduled evidence source once even if regional processing is replayed", () => {
    const initial = state({
      schedule: schedule({
        type: "academyVisit",
        slots: 1,
        description: "Study the academy pathway",
      }),
    });
    const first = processRegionalKnowledgeGrowth(initial, createRNG("ledger-once"));
    const replay = processRegionalKnowledgeGrowth(
      { ...initial, regionalKnowledge: first.regionalKnowledge },
      createRNG("ledger-once"),
    );

    expect(first.regionalKnowledge.england.knowledgeLevel).toBe(26.25);
    expect(replay.regionalKnowledge.england.knowledgeLevel).toBe(26.25);
    expect(replay.regionalKnowledge.england.knowledgeLedger).toHaveLength(1);
  });

  it("pays report counter deltas once and never back-pays an unwatermarked legacy career", () => {
    const currentScout = scout();
    currentScout.countryReputations.england.reportsSubmitted = 1;
    const initialKnowledge = {
      ...knowledge("england", 20),
      processedMetrics: { reportsSubmitted: 0, successfulFinds: 0, contactCount: 0 },
    };
    const initial = state({
      scout: currentScout,
      regionalKnowledge: { england: initialKnowledge },
    });
    const first = processRegionalKnowledgeGrowth(initial, createRNG("report-watermark"));
    const replay = processRegionalKnowledgeGrowth(
      { ...initial, regionalKnowledge: first.regionalKnowledge },
      createRNG("report-watermark"),
    );
    const legacy = processRegionalKnowledgeGrowth(
      state({ scout: currentScout, regionalKnowledge: { england: knowledge("england", 20) } }),
      createRNG("legacy-watermark"),
    );

    expect(first.regionalKnowledge.england.knowledgeLevel).toBe(21);
    expect(replay.regionalKnowledge.england.knowledgeLevel).toBe(21);
    expect(legacy.regionalKnowledge.england.knowledgeLevel).toBe(20);
  });

  it("materializes earned contacts and executable culture insights at thresholds", () => {
    const contactResult = processRegionalKnowledgeGrowth(
      state({
        regionalKnowledge: { england: knowledge("england", 14) },
        schedule: schedule({
          type: "grassrootsTournament",
          slots: 1,
          description: "Work a grassroots tournament",
        }),
      }),
      createRNG("material-contact"),
    );
    const insightResult = processRegionalKnowledgeGrowth(
      state({
        regionalKnowledge: { england: knowledge("england", 9) },
        schedule: schedule({
          type: "schoolMatch",
          slots: 1,
          description: "Study a school football pathway",
        }),
      }),
      createRNG("material-insight"),
    );

    expect(contactResult.newContacts).toHaveLength(1);
    expect(contactResult.newContacts[0].contact.id).toBe(contactResult.newContacts[0].contactId);
    expect(contactResult.regionalKnowledge.england.localContacts)
      .toContain(contactResult.newContacts[0].contactId);
    expect(contactResult.newContacts[0].contact.country).toBe("england");
    expect(insightResult.newInsights).toHaveLength(1);
    expect(insightResult.newInsights[0].insight.id).toMatch(/^culture:england:/);
    expect(insightResult.newInsights[0].insight.effects?.version).toBe(1);
  });

  it("reconciles contact ids from legacy regional knowledge into real contacts", () => {
    const legacyKnowledge = knowledge("england", 30);
    legacyKnowledge.localContacts = ["legacy-local-contact"];
    const result = processRegionalKnowledgeGrowth(
      state({
        contacts: {},
        regionalKnowledge: { england: legacyKnowledge },
      }),
      createRNG("legacy-local-contact"),
    );

    expect(result.newContacts).toHaveLength(1);
    expect(result.newContacts[0]).toMatchObject({
      countryId: "england",
      contactId: "legacy-local-contact",
      contact: {
        id: "legacy-local-contact",
        country: "england",
        type: "localScout",
      },
    });
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
