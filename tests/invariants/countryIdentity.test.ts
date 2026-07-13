import { describe, expect, it } from "vitest";
import type {
  CountryReputation,
  Club,
  Fixture,
  League,
  Scout,
  SubRegion,
  Territory,
  TournamentEvent,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  getContactCoverageCountry,
  getCountryDisplayName,
} from "@/engine/network/contacts";
import { RNG } from "@/engine/rng";
import {
  generateSeasonTournaments,
  discoverTournamentsPassive,
} from "@/engine/youth/tournaments";
import {
  getAccessibleFixtures,
  getContinentId,
  getTravelCost,
} from "@/engine/world/travel";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { getEligibleClubsForPlacement } from "@/engine/youth/placement";

function reputation(country: string): CountryReputation {
  return {
    country,
    familiarity: 100,
    reportsSubmitted: 0,
    successfulFinds: 0,
    contactCount: 0,
  };
}

function scout(homeCountry: string, careerTier = 4): Scout {
  return {
    careerTier,
    countryReputations: {
      [homeCountry]: reputation(homeCountry),
    },
  } as Scout;
}

describe("country identity invariants", () => {
  it("canonicalizes multi-word countries across contacts, travel, and transfer routes", () => {
    expect(getContactCoverageCountry({ region: " South Korea " })).toBe("southkorea");
    expect(getContactCoverageCountry({ country: "Saudi Arabia" })).toBe("saudiarabia");
    expect(getCountryDisplayName("newzealand")).toBe("New Zealand");

    expect(getContinentId("South Africa")).toBe("africa");
    expect(getTravelCost("South Africa", "New Zealand")).toBe(3000);

    expect(getTransferFlowProbability("Ivory Coast", "France")).toBe(0.24);
    expect(getTransferFlowProbability("South Korea", "Germany")).toBe(0.09);
  });

  it("builds domestic tournaments from display-name country inputs using canonical keys", () => {
    const tournaments = generateSeasonTournaments(
      {
        next: () => 0,
        nextInt: (min: number) => min,
      } as unknown as RNG,
      2,
      ["South Korea", "Saudi Arabia", "New Zealand", "Ivory Coast", "South Africa"],
      scout("South Korea"),
    );

    const domesticCountries = [...new Set(
      Object.values(tournaments)
        .filter((t) => t.category === "named")
        .map((t) => t.country),
    )].sort();

    expect(domesticCountries).toEqual([
      "ivorycoast",
      "newzealand",
      "saudiarabia",
      "southafrica",
      "southkorea",
    ]);
  });

  it("matches display-name territories and subregions to canonical tournament and travel records", () => {
    const fixtures: Record<string, Fixture> = {
      seoul: { id: "seoul", homeClubId: "a", awayClubId: "b", leagueId: "k-league", week: 4, played: false },
      tokyo: { id: "tokyo", homeClubId: "c", awayClubId: "d", leagueId: "j-league", week: 4, played: false },
    };
    const territories: Record<string, Territory> = {
      southKorea: {
        id: "southKorea",
        name: "South Korea",
        country: "South Korea",
        leagueIds: ["k-league"],
        maxScouts: 1,
        assignedScoutIds: [],
      },
      japan: {
        id: "japan",
        name: "Japan",
        country: "Japan",
        leagueIds: ["j-league"],
        maxScouts: 1,
        assignedScoutIds: [],
      },
    };

    expect(getAccessibleFixtures(scout("South Korea"), 4, fixtures, territories)).toEqual(["seoul"]);

    const tournaments: Record<string, TournamentEvent> = {
      seoulCup: {
        id: "seoulCup",
        name: "Seoul Youth Cup",
        country: "southkorea",
        participantCountries: ["southkorea"],
        category: "named",
        prestige: "regional",
        startWeek: 4,
        endWeek: 5,
        season: 2,
        discovered: false,
        attended: false,
        poolSizeMultiplier: 1.1,
        observationBonus: 1,
        extraAttributes: 0,
      },
    };
    const subRegions: Record<string, SubRegion> = {
      seoul: {
        id: "seoul",
        name: "Seoul",
        country: "South Korea",
        familiarity: 100,
      },
    };

    const result = discoverTournamentsPassive(
      {
        next: () => 0,
      } as unknown as RNG,
      tournaments,
      subRegions,
      1,
      "South Korea",
    );

    expect(result.discovered.map((t) => t.id)).toEqual(["seoulCup"]);
    expect(result.updatedTournaments.seoulCup.discoverySource).toBe("familiarity");
  });

  it("keeps youth placements on credible domestic or established cross-border pathways", () => {
    const clubs = [
      { id: "madrid", leagueId: "spain", youthAcademyRating: 10, playerIds: [], academyPlayerIds: [] },
      { id: "london", leagueId: "england", youthAcademyRating: 15, playerIds: [], academyPlayerIds: [] },
      { id: "tokyo", leagueId: "japan", youthAcademyRating: 20, playerIds: [], academyPlayerIds: [] },
    ] as unknown as Club[];
    const leagues = {
      spain: { id: "spain", country: "Spain" },
      england: { id: "england", country: "England" },
      japan: { id: "japan", country: "Japan" },
    } as unknown as Record<string, League>;
    const youth = {
      country: "spain",
      player: { age: 17 },
    } as UnsignedYouth;

    const targets = getEligibleClubsForPlacement(
      youth,
      clubs,
      scout("spain"),
      leagues,
    );

    expect(targets.map((club) => club.id)).toEqual(["madrid", "london"]);
  });

  it("keeps an eligible authored-report audience inside the bounded club shortlist", () => {
    const clubs = Array.from({ length: 12 }, (_, index) => ({
      id: `club-${index}`,
      leagueId: "england",
      youthAcademyRating: 20 - index,
      reputation: 50,
      playerIds: [],
      academyPlayerIds: [],
    })) as unknown as Club[];
    const leagues = {
      england: { id: "england", country: "England" },
    } as unknown as Record<string, League>;
    const youth = {
      country: "england",
      player: { age: 15 },
    } as UnsignedYouth;

    const ordinary = getEligibleClubsForPlacement(
      youth,
      clubs,
      scout("england"),
      leagues,
    );
    expect(ordinary).toHaveLength(10);
    expect(ordinary.map((club) => club.id)).not.toContain("club-11");

    const preferred = getEligibleClubsForPlacement(
      youth,
      clubs,
      scout("england"),
      leagues,
      { preferredClubId: "club-11" },
    );
    expect(preferred).toHaveLength(10);
    expect(preferred[0].id).toBe("club-11");

    const fullPreferred = clubs.map((club) =>
      club.id === "club-11"
        ? { ...club, playerIds: Array.from({ length: 40 }, (_, index) => `player-${index}`) }
        : club,
    );
    const stillIneligible = getEligibleClubsForPlacement(
      youth,
      fullPreferred,
      scout("england"),
      leagues,
      { preferredClubId: "club-11" },
    );
    expect(stillIneligible.map((club) => club.id)).not.toContain("club-11");
  });
});
