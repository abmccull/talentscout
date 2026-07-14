import { describe, expect, it } from "vitest";
import type {
  GameState,
  InternationalAssignment,
  Scout,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import {
  getCountryAvailability,
  getInternationalAssignmentTypesForCountry,
  getTravelEligibleCountryKeys,
  isTravelEligibleCountry,
  type WorldCountryAvailabilitySource,
} from "@/engine/world/countryAvailability";
import { processInternationalWeek } from "@/engine/world/international";

function scout(homeCountry = "england"): Scout {
  return {
    careerTier: 3,
    countryReputations: {
      [homeCountry]: {
        country: homeCountry,
        familiarity: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
  } as Scout;
}

/**
 * England represents the selected core world. Nigeria represents an
 * intentionally generated secondary talent pool: real clubs/players/youth
 * regions, but no fixture list. Spain/Germany/Brazil/Argentina are stale
 * catalogue entries only and must never become destinations.
 */
function selectedCoreOnlyWorld(): WorldCountryAvailabilitySource {
  return {
    countries: ["england", "spain", "germany", "france", "brazil", "argentina", "nigeria"],
    territories: {
      territory_england: {
        id: "territory_england",
        name: "England",
        country: "England",
        countryKey: "england",
        leagueIds: ["eng-prem"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
      territory_nigeria: {
        id: "territory_nigeria",
        name: "Nigeria",
        country: "Nigeria",
        countryKey: "nigeria",
        leagueIds: ["ng-prem"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
    },
    leagues: {
      "eng-prem": {
        id: "eng-prem",
        name: "English Premier Division",
        shortName: "EPD",
        country: "England",
        tier: 1,
        clubIds: ["eng-club"],
        season: 1,
      },
      "ng-prem": {
        id: "ng-prem",
        name: "Nigerian Premier Division",
        shortName: "NPD",
        country: "Nigeria",
        tier: 1,
        clubIds: ["ng-club"],
        season: 1,
      },
    },
    clubs: {
      "eng-club": { id: "eng-club", leagueId: "eng-prem" },
      "ng-club": { id: "ng-club", leagueId: "ng-prem" },
    } as unknown as WorldCountryAvailabilitySource["clubs"],
    players: {
      "eng-player": { id: "eng-player", clubId: "eng-club" },
      "ng-player": { id: "ng-player", clubId: "ng-club" },
    } as unknown as WorldCountryAvailabilitySource["players"],
    fixtures: {
      "eng-fixture": {
        id: "eng-fixture",
        homeClubId: "eng-club",
        awayClubId: "eng-club",
        leagueId: "eng-prem",
        week: 1,
        played: false,
      },
    },
    subRegions: {
      "eng-london": {
        id: "eng-london",
        name: "London",
        country: "England",
        countryKey: "england",
        familiarity: 0,
      },
      "ng-lagos": {
        id: "ng-lagos",
        name: "Lagos",
        country: "Nigeria",
        countryKey: "nigeria",
        familiarity: 0,
      },
    },
    unsignedYouth: {},
    youthTournaments: {},
  };
}

describe("world country availability invariants", () => {
  it("does not scan the generated world or consume RNG before international work unlocks", () => {
    const world = selectedCoreOnlyWorld();
    let worldCollectionEnumerations = 0;
    const guard = <T extends object>(value: T): T => new Proxy(value, {
      ownKeys(target) {
        worldCollectionEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });
    const lockedScout: Scout = { ...scout(), careerTier: 2 };
    const state = {
      ...world,
      players: guard(world.players),
      fixtures: guard(world.fixtures),
      unsignedYouth: guard(world.unsignedYouth),
      seed: "locked-international",
      currentWeek: 1,
      currentSeason: 1,
      scout: lockedScout,
    } as unknown as GameState;
    const actualRng = new RNG("locked-international");
    const referenceRng = new RNG("locked-international");

    expect(processInternationalWeek(actualRng, lockedScout, state, [])).toEqual({
      newAssignments: [],
      expiredAssignmentIds: [],
    });
    expect(worldCollectionEnumerations).toBe(0);
    expect(actualRng.nextFloat(0, 1)).toBe(referenceRng.nextFloat(0, 1));
  });

  it("does not expose unselected core countries merely because a stale country list names them", () => {
    const world = selectedCoreOnlyWorld();

    expect(getTravelEligibleCountryKeys(world)).toEqual(["england", "nigeria"]);
    expect(isTravelEligibleCountry(world, "Spain")).toBe(false);
    expect(isTravelEligibleCountry(world, "Germany")).toBe(false);
    expect(isTravelEligibleCountry(world, "Brazil")).toBe(false);
    expect(isTravelEligibleCountry(world, "Argentina")).toBe(false);
  });

  it("keeps generated secondary talent pools travelable without pretending they have fixtures", () => {
    const nigeria = getCountryAvailability(selectedCoreOnlyWorld(), "Nigeria");

    expect(nigeria).toMatchObject({
      countryKey: "nigeria",
      contentTier: "talentPool",
      travelEligible: true,
      fixtureCount: 0,
      clubCount: 1,
      playerCount: 1,
      subRegionCount: 1,
    });
    expect(getInternationalAssignmentTypesForCountry(selectedCoreOnlyWorld(), "nigeria"))
      .toEqual(["youthTournament", "scoutingMission"]);
  });

  it("reserves senior-friendly work for a fixture-backed full world", () => {
    const england = getCountryAvailability(selectedCoreOnlyWorld(), "England");

    expect(england).toMatchObject({
      countryKey: "england",
      contentTier: "fullWorld",
      travelEligible: true,
      fixtureCount: 1,
    });
    expect(getInternationalAssignmentTypesForCountry(selectedCoreOnlyWorld(), "england"))
      .toContain("seniorFriendly");
  });

  it("generates assignments only for generated countries and only with fulfillable assignment types", () => {
    const world = selectedCoreOnlyWorld();
    const state = {
      ...world,
      seed: "availability-invariant",
      currentWeek: 1,
      currentSeason: 1,
      scout: scout(),
    } as unknown as GameState;

    const result = processInternationalWeek(
      new RNG("availability-invariant"),
      state.scout,
      state,
      [],
    );

    expect(result.newAssignments.length).toBeGreaterThan(0);
    expect(result.newAssignments.map((assignment) => assignment.country)).toEqual(
      Array(result.newAssignments.length).fill("nigeria"),
    );
    expect(result.newAssignments.every(
      (assignment: InternationalAssignment) => assignment.type !== "seniorFriendly",
    )).toBe(true);
  });
});
