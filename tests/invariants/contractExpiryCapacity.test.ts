import { describe, expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import {
  processContractExpiries,
  SENIOR_SQUAD_RENEWAL_CAP,
} from "@/engine/freeAgents/expiry";

function player(index: number): Player {
  return {
    id: `player-${String(index).padStart(2, "0")}`,
    firstName: "Squad",
    lastName: String(index),
    age: 24,
    dateOfBirth: { day: 1, month: 1, year: 2000 },
    nationality: "English",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "club",
    contractClubId: "club",
    contractExpiry: 1,
    wage: 1_000,
    marketValue: 100_000,
    attributes: {} as Player["attributes"],
    currentAbility: 40 + index,
    potentialAbility: 80 + index,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: 0,
    morale: 5,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  };
}

describe("club squad capacity", () => {
  it("releases excess depth even when the normal renewal roll would pass", () => {
    const players = Object.fromEntries(
      Array.from({ length: SENIOR_SQUAD_RENEWAL_CAP + 2 }, (_, index) => {
        const generated = player(index);
        return [generated.id, generated];
      }),
    );
    const club: Club = {
      id: "club",
      name: "Capacity FC",
      shortName: "CAP",
      leagueId: "league",
      reputation: 50,
      budget: 1_000_000,
      scoutingPhilosophy: "marketSmart",
      managerId: "manager",
      playerIds: Object.keys(players),
      academyPlayerIds: [],
      youthAcademyRating: 10,
    };
    const state = {
      currentWeek: 46,
      currentSeason: 1,
      players,
      clubs: { club },
      leagues: {
        league: { id: "league", country: "England" },
      },
    } as unknown as GameState;
    const rng = {
      chance: () => true,
      nextInt: (min: number) => min,
    };

    const result = processContractExpiries(state, rng as never);

    expect(result.releasedPlayers.map((agent) => agent.playerId).sort()).toEqual([
      "player-00",
      "player-01",
    ]);
    expect(result.renewedPlayerIds).toHaveLength(SENIOR_SQUAD_RENEWAL_CAP);
    expect(result.renewedPlayerIds).toContain("player-33");
  });
});
