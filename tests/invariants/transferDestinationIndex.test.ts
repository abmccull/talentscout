import { describe, expect, it } from "vitest";
import type { Club, GameState, League, Player, Position } from "@/engine/core/types";
import {
  createTransferDestinationIndex,
  findTransferDestination,
} from "@/engine/core/gameLoop";
import { RNG } from "@/engine/rng";

function club(
  id: string,
  leagueId: string,
  reputation: number,
  playerIds: string[],
): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId,
    reputation,
    budget: 20_000_000,
    scoutingPhilosophy: id === "global" ? "globalRecruiter" : "marketSmart",
    managerId: `manager-${id}`,
    playerIds,
    youthAcademyRating: 10,
  };
}

function player(id: string, clubId: string, position: Position): Player {
  return {
    id,
    firstName: id,
    lastName: "Indexed",
    age: 24,
    nationality: "English",
    position,
    secondaryPositions: [],
    clubId,
    contractClubId: clubId,
    contractExpiry: 4,
    currentAbility: 110,
    potentialAbility: 130,
    marketValue: 2_000_000,
    morale: 5,
    form: 0,
    injured: false,
    injuryWeeksRemaining: 0,
    attributes: {},
  } as unknown as Player;
}

function league(id: string, country: string, clubIds: string[]): League {
  return {
    id,
    name: id,
    shortName: id,
    country,
    tier: 1,
    clubIds,
    season: 1,
  };
}

describe("AI transfer destination index", () => {
  it("preserves weighted destination and RNG position while indexing squad roles once", () => {
    const players = {
      source: player("source", "source-club", "CM"),
      cm1: player("cm1", "patient", "CM"),
      cm2: player("cm2", "patient", "CM"),
      cb1: player("cb1", "global", "CB"),
      st1: player("st1", "value", "ST"),
    };
    const clubs = {
      "source-club": club("source-club", "england", 55, ["source"]),
      patient: club("patient", "england", 58, ["cm1", "cm2", "cm1", "missing"]),
      global: club("global", "spain", 62, ["cb1"]),
      value: club("value", "france", 50, ["st1"]),
      distant: club("distant", "france", 90, []),
    };
    const state = {
      currentSeason: 1,
      players,
      clubs,
      leagues: {
        england: league("england", "England", ["source-club", "patient"]),
        spain: league("spain", "Spain", ["global"]),
        france: league("france", "France", ["value", "distant"]),
      },
    } as unknown as GameState;
    const index = createTransferDestinationIndex(state);

    expect(index.clubs).toEqual(Object.values(clubs));
    for (const candidate of Object.values(clubs)) {
      for (const position of ["CM", "CB", "ST"] as const) {
        const reference = candidate.playerIds.reduce(
          (count, playerId) => players[playerId as keyof typeof players]?.position === position
            ? count + 1
            : count,
          0,
        );
        expect(index.primaryPositionCountByClub.get(candidate.id)?.get(position) ?? 0)
          .toBe(reference);
      }
    }

    for (const seed of ["destination-a", "destination-b", "destination-c"]) {
      const referenceRng = new RNG(seed);
      const indexedRng = new RNG(seed);
      const reference = findTransferDestination(
        players.source,
        clubs["source-club"],
        state,
        referenceRng,
      );
      const optimized = findTransferDestination(
        players.source,
        clubs["source-club"],
        state,
        indexedRng,
        index,
      );

      expect(optimized?.id).toBe(reference?.id);
      expect(indexedRng.nextFloat(0, 1)).toBe(referenceRng.nextFloat(0, 1));
    }
  });
});
