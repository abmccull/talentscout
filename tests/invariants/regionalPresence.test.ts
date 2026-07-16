import { describe, expect, it } from "vitest";
import type {
  AgencyEmployee,
  FinancialRecord,
  GameState,
  Observation,
  RegionalKnowledge,
  Scout,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  applyRegionalPresenceToObservation,
  deriveRegionalPresence,
  getRegionalTravelQuote,
} from "@/engine/world/regionalPresence";
import {
  bookTravel,
  getScoutHomeCountry,
  getTravelPostureEffects,
} from "@/engine/world/travel";
import { processRegionalKnowledgeGrowth } from "@/engine/specializations/regionalKnowledge";
import { assignEmployeeToSatellite } from "@/engine/finance/internationalExpansion";
import { fireEmployee } from "@/engine/finance/agency";
import { generateInternationalAssignment } from "@/engine/world/international";
import { createRunManifest } from "@/engine/run";
import { createWorldConditionState } from "@/engine/world/worldConditions";

function knowledge(countryId: string, level: number): RegionalKnowledge {
  return {
    countryId,
    knowledgeLevel: level,
    discoveredLeagues: [],
    culturalInsights: [],
    localContacts: [],
    scoutingEfficiency: 1,
  };
}

function scout(): Scout {
  return {
    id: "scout",
    firstName: "Rae",
    lastName: "Mora",
    age: 39,
    nationality: "English",
    homeCountry: "england",
    attributes: { adaptability: 10, intuition: 12 } as Scout["attributes"],
    skills: {} as Scout["skills"],
    primarySpecialization: "regional",
    specializationLevel: 10,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 4,
    careerPath: "independent",
    reputation: 55,
    clubTrust: 0,
    specializationReputation: 40,
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
      brazil: {
        country: "brazil",
        familiarity: 95,
        reportsSubmitted: 12,
        successfulFinds: 3,
        contactCount: 2,
      },
    },
    boardDirectives: [],
  } as Scout;
}

function employee(id: string, role: AgencyEmployee["role"] = "scout"): AgencyEmployee {
  return {
    id,
    name: id,
    role,
    quality: 14,
    salary: 1_000,
    morale: 80,
    fatigue: 10,
    hiredWeek: 1,
    hiredSeason: 1,
    reportsGenerated: [],
    experience: 0,
    weeklyLog: [],
    regionFocusWeeks: 0,
  };
}

function finances(): FinancialRecord {
  return {
    balance: 50_000,
    transactions: [],
    employees: [employee("local-scout"), employee("analyst", "analyst")],
    satelliteOffices: [
      {
        id: "office-brazil",
        region: "brazil",
        monthlyCost: 1_200,
        qualityBonus: 0.1,
        maxEmployees: 3,
        employeeIds: ["local-scout", "analyst"],
        openedWeek: 1,
        openedSeason: 1,
      },
    ],
  } as unknown as FinancialRecord;
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: "regional-presence",
    currentWeek: 8,
    currentSeason: 2,
    scout: scout(),
    countries: ["england", "brazil"],
    territories: {
      england: {
        id: "england",
        name: "England",
        country: "England",
        countryKey: "england",
        leagueIds: ["eng-league"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
      brazil: {
        id: "brazil",
        name: "Brazil",
        country: "Brazil",
        countryKey: "brazil",
        leagueIds: ["bra-league"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
    },
    leagues: {
      "eng-league": { id: "eng-league", country: "England", clubIds: ["eng-club"] },
      "bra-league": { id: "bra-league", country: "Brazil", clubIds: ["bra-club"] },
    },
    clubs: {
      "eng-club": { id: "eng-club", leagueId: "eng-league" },
      "bra-club": { id: "bra-club", leagueId: "bra-league" },
    },
    players: {
      prospect: {
        id: "prospect",
        clubId: "bra-club",
        firstName: "Jo",
        lastName: "Silva",
      },
    },
    fixtures: {
      "eng-fixture": { id: "eng-fixture", leagueId: "eng-league" },
      "bra-fixture": { id: "bra-fixture", leagueId: "bra-league" },
    },
    subRegions: {
      england: { id: "england", name: "London", country: "England", countryKey: "england", familiarity: 0 },
      brazil: { id: "brazil", name: "Sao Paulo", country: "Brazil", countryKey: "brazil", familiarity: 0 },
    },
    unsignedYouth: {},
    youthTournaments: {},
    regionalKnowledge: {
      england: knowledge("england", 25),
      brazil: knowledge("brazil", 65),
    },
    contacts: {
      brazilAgent: {
        id: "brazilAgent",
        name: "Ana Costa",
        type: "agent",
        organization: "Costa Football",
        relationship: 80,
        reliability: 70,
        knownPlayerIds: ["prospect"],
        country: "brazil",
        trustLevel: 75,
      },
    },
    finances: finances(),
    assistantScouts: [],
    npcScouts: {},
    ...overrides,
  } as unknown as GameState;
}

describe("regional presence invariants", () => {
  it("keeps legacy bookings neutral and persists a posture on every new trip", () => {
    const neutralEffects = {
      observationSignalMultiplier: 1,
      observationUncertaintyMultiplier: 1,
      regionalKnowledgeMultiplier: 1,
      contactQualityMultiplier: 1,
      discoveryMultiplier: 1,
      opportunityMultiplier: 1,
      costMultiplier: 1,
      fatigueMultiplier: 1,
    };
    expect(getTravelPostureEffects(undefined)).toEqual(neutralEffects);
    expect(getTravelPostureEffects("legacy-posture" as never)).toEqual(neutralEffects);
    expect(bookTravel(scout(), "brazil", 9, 2).travelBooking?.posture)
      .toBe("assignmentFirst");
  });

  it("keeps the permanent home base stable when foreign familiarity overtakes it", () => {
    expect(getScoutHomeCountry(state().scout)).toBe("england");
  });

  it("turns offices, assigned staff, contacts, and knowledge into bounded effects", () => {
    const established = deriveRegionalPresence(state(), "Brazil");
    const remote = deriveRegionalPresence(
      state({
        finances: { ...finances(), satelliteOffices: [] },
        contacts: {},
        regionalKnowledge: {
          england: knowledge("england", 25),
          brazil: knowledge("brazil", 0),
        },
      }),
      "brazil",
    );

    expect(established.generatedWorldEligible).toBe(true);
    expect(established.accessScore).toBeGreaterThan(remote.accessScore);
    expect(established.dimensions.access).toBeGreaterThan(remote.dimensions.access);
    expect(established.dimensions.intelligence).toBeGreaterThan(remote.dimensions.intelligence);
    expect(established.dimensions.relationships).toBeGreaterThan(remote.dimensions.relationships);
    expect(established.dimensions.logistics).toBeGreaterThan(remote.dimensions.logistics);
    expect(established.effects.discoveryMultiplier).toBeGreaterThan(1);
    expect(established.effects.observationConfidenceBonus).toBeGreaterThan(0);
    expect(established.effects.dataConfidenceBonus).toBeGreaterThan(0);
    expect(established.effects.opportunityMultiplier).toBeGreaterThan(1);
    expect(established.effects.travelCostMultiplier).toBeLessThan(1);
    expect(established.effects.travelFatigueMultiplier).toBeLessThan(1);
    expect(established.effects.travelSlotReduction).toBe(1);
    expect(established.effects.passiveKnowledgeGain).toBeGreaterThan(0);
  });

  it("lets specialist staff improve the capability they actually provide", () => {
    const analystRecord = finances();
    analystRecord.employees = [employee("specialist", "analyst")];
    analystRecord.satelliteOffices[0].employeeIds = ["specialist"];
    const administratorRecord = finances();
    administratorRecord.employees = [employee("specialist", "administrator")];
    administratorRecord.satelliteOffices[0].employeeIds = ["specialist"];

    const analystPresence = deriveRegionalPresence(state({ finances: analystRecord }), "brazil");
    const administratorPresence = deriveRegionalPresence(
      state({ finances: administratorRecord }),
      "brazil",
    );

    expect(analystPresence.dimensions.intelligence)
      .toBeGreaterThan(administratorPresence.dimensions.intelligence);
    expect(administratorPresence.dimensions.logistics)
      .toBeGreaterThan(analystPresence.dimensions.logistics);
  });

  it("quotes a staffed route cheaper, shorter, and less fatiguing than base travel", () => {
    const quote = getRegionalTravelQuote(state(), "brazil");

    expect(quote.cost).toBeLessThan(quote.baseCost);
    expect(quote.slots).toBeLessThanOrEqual(quote.baseSlots);
    expect(quote.duration).toBeLessThanOrEqual(quote.baseDuration);
    expect(quote.fatigueMultiplier).toBeLessThan(1);
  });

  it("makes trip postures create real cost, fatigue, and opportunity tradeoffs", () => {
    const assignmentQuote = getRegionalTravelQuote(state(), "brazil", "assignmentFirst");
    const deepDiveQuote = getRegionalTravelQuote(state(), "brazil", "deepDive");
    const blitzQuote = getRegionalTravelQuote(state(), "brazil", "opportunityBlitz");
    const assignmentScout = scout();
    assignmentScout.travelBooking = {
      destinationCountry: "brazil",
      departureWeek: 7,
      returnWeek: 10,
      cost: assignmentQuote.cost,
      isAbroad: true,
      posture: "assignmentFirst",
    };
    const blitzScout = {
      ...assignmentScout,
      travelBooking: {
        ...assignmentScout.travelBooking,
        cost: blitzQuote.cost,
        posture: "opportunityBlitz" as const,
      },
    };
    const assignmentPresence = deriveRegionalPresence(
      state({ scout: assignmentScout }),
      "brazil",
    );
    const blitzPresence = deriveRegionalPresence(state({ scout: blitzScout }), "brazil");

    expect(deepDiveQuote.cost).toBeGreaterThan(assignmentQuote.cost);
    expect(blitzQuote.cost).toBeGreaterThan(deepDiveQuote.cost);
    expect(blitzQuote.fatigueMultiplier).toBeGreaterThan(deepDiveQuote.fatigueMultiplier);
    expect(blitzPresence.effects.discoveryMultiplier)
      .toBeGreaterThan(assignmentPresence.effects.discoveryMultiplier);
    expect(blitzPresence.effects.opportunityMultiplier)
      .toBeGreaterThan(assignmentPresence.effects.opportunityMultiplier);

    const quoteFromControlledTrip = getRegionalTravelQuote(
      state({ scout: assignmentScout }),
      "brazil",
      "deepDive",
    );
    const quoteFromBlitzTrip = getRegionalTravelQuote(
      state({ scout: blitzScout }),
      "brazil",
      "deepDive",
    );
    expect(quoteFromBlitzTrip.fatigueMultiplier)
      .toBeCloseTo(quoteFromControlledTrip.fatigueMultiplier, 8);
  });

  it("turns a seeded regional transport shock into real quote and explanation changes", () => {
    let conditioned: GameState | undefined;
    for (let index = 0; index < 500 && !conditioned; index += 1) {
      const runManifest = createRunManifest({
        rootSeed: `transport-condition-${index}`,
        specialization: "regional",
        difficulty: "normal",
        selectedCountries: ["england", "brazil"],
        worldTraitIds: [],
      });
      const worldConditionState = createWorldConditionState(
        runManifest,
        ["england", "brazil"],
        2,
      );
      if (worldConditionState.active.some((condition) =>
        condition.definitionId === "transport-disruption"
        && condition.countryId === "brazil"
      )) {
        conditioned = state({ runManifest, worldConditionState });
      }
    }
    expect(conditioned).toBeDefined();

    const baseline = getRegionalTravelQuote(
      state({ worldConditionState: undefined }),
      "brazil",
    );
    const shocked = getRegionalTravelQuote(conditioned!, "brazil");
    const presence = deriveRegionalPresence(conditioned!, "brazil");

    expect(shocked.cost).toBeGreaterThan(baseline.cost);
    expect(shocked.duration).toBeGreaterThanOrEqual(baseline.duration + 1);
    expect(shocked.fatigueMultiplier).toBeGreaterThan(baseline.fatigueMultiplier);
    expect(presence.worldConditionNames).toContain("Transport Disruption");
    expect(presence.summary).toContain("Seasonal context");
  });

  it("turns regional opportunity coverage into a materially different assignment mix", () => {
    const rng = createRNG("presence-opportunity-mix");
    const counts = { brazil: 0, spain: 0 };
    const assignmentScout = scout();
    assignmentScout.countryReputations.brazil.familiarity = 50;

    for (let index = 0; index < 400; index++) {
      const assignment = generateInternationalAssignment(
        rng,
        assignmentScout,
        ["brazil", "spain"],
        9,
        undefined,
        new Map([
          ["brazil", 1.45],
          ["spain", 0.75],
        ]),
      );
      if (assignment?.country === "brazil" || assignment?.country === "spain") {
        counts[assignment.country] += 1;
      }
    }

    expect(counts.brazil).toBeGreaterThan(counts.spain);
    expect(counts.brazil + counts.spain).toBe(400);
  });

  it("applies regional confidence once and records the player-facing cause", () => {
    const observation: Observation = {
      id: "observation",
      playerId: "prospect",
      scoutId: "scout",
      week: 8,
      season: 2,
      context: "liveMatch",
      attributeReadings: [{
        attribute: "passing",
        perceivedValue: 13,
        confidence: 0.5,
        observationCount: 1,
        rangeLow: 10,
        rangeHigh: 16,
      }],
      notes: [],
      flaggedMoments: [],
    };

    const applied = applyRegionalPresenceToObservation(state(), observation);
    const replayed = applyRegionalPresenceToObservation(state(), applied);

    expect(applied.attributeReadings[0].confidence).toBeGreaterThan(0.5);
    expect(applied.regionalContext).toMatchObject({ countryId: "brazil" });
    expect(applied.notes.join(" ")).toContain("Regional context");
    expect(replayed).toEqual(applied);
  });

  it("lets maintained infrastructure grow knowledge while the player is elsewhere", () => {
    const before = state();
    const result = processRegionalKnowledgeGrowth(before, createRNG("presence-growth"));

    expect(result.regionalKnowledge.brazil.knowledgeLevel).toBeGreaterThan(65);
  });

  it("keeps an employee assigned to at most one satellite office", () => {
    const record = finances();
    record.satelliteOffices.push({
      id: "office-england",
      region: "england",
      monthlyCost: 1_200,
      qualityBonus: 0.1,
      maxEmployees: 3,
      employeeIds: [],
      openedWeek: 2,
      openedSeason: 1,
    });

    const reassigned = assignEmployeeToSatellite(record, "local-scout", "office-england");
    const memberships = reassigned.satelliteOffices.filter(
      (office) => office.employeeIds.includes("local-scout"),
    );

    expect(memberships.map((office) => office.id)).toEqual(["office-england"]);
  });

  it("removes fired employees from regional office coverage", () => {
    const fired = fireEmployee(finances(), "local-scout", 8, 2);

    expect(fired.employees.some((candidate) => candidate.id === "local-scout")).toBe(false);
    expect(
      fired.satelliteOffices.some((office) => office.employeeIds.includes("local-scout")),
    ).toBe(false);
  });

  it("does not create presence effects for a ghost country", () => {
    const ghost = deriveRegionalPresence(state(), "spain");
    expect(ghost.generatedWorldEligible).toBe(false);
    expect(ghost.accessScore).toBe(0);
    expect(ghost.dimensions).toEqual({
      access: 0,
      intelligence: 0,
      relationships: 0,
      logistics: 0,
    });
    expect(ghost.effects.discoveryMultiplier).toBe(0);
    expect(ghost.effects.opportunityMultiplier).toBe(0);
  });
});
