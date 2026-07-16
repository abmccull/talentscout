import { describe, expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import {
  deriveClubRecruitmentMemory,
  scoreRecruitmentMemoryFit,
} from "@/engine/world/recruitmentMemory";

const player = {
  id: "p1",
  age: 23,
  position: "ST",
  clubId: "destination",
  contractClubId: "destination",
} as Player;

function state(): GameState {
  const ratings = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
    `fixture-${index}`,
    { p1: { playerId: "p1", rating: 7.2, started: true, minutesPlayed: 90 } },
  ]));
  const fixtures = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
    `fixture-${index}`,
    {
      id: `fixture-${index}`,
      season: 3,
      week: index + 2,
      homeClubId: "destination",
      awayClubId: "other",
      played: true,
    },
  ]));
  return {
    currentSeason: 4,
    players: { p1: player },
    retiredPlayers: {},
    clubs: {
      source: { id: "source", leagueId: "source-league" },
      destination: { id: "destination", leagueId: "destination-league" },
    },
    leagues: {
      "source-league": { country: "Spain" },
      "destination-league": { country: "England" },
    },
    fixtures,
    matchRatings: ratings,
    playerMovementHistory: [{
      id: "arrival",
      playerId: "p1",
      type: "permanentTransfer",
      season: 3,
      week: 1,
      fromClubId: "source",
      toClubId: "destination",
      fee: 2_000_000,
    }],
  } as unknown as GameState;
}

describe("club recruitment memory", () => {
  it("learns only from observable movement and participation evidence", () => {
    const memory = deriveClubRecruitmentMemory(state(), "destination");

    expect(memory).toMatchObject({
      evaluatedSignings: 1,
      successes: 1,
      failures: 0,
      crossBorderSuccessRate: 100,
      youngSuccessRate: 100,
    });
    expect(memory.outcomes[0]).toMatchObject({
      appearances: 10,
      averageRating: 7.2,
      outcome: "success",
    });
  });

  it("keeps small samples as a bounded nudge", () => {
    const memory = deriveClubRecruitmentMemory(state(), "destination");
    const multiplier = scoreRecruitmentMemoryFit(memory, player, true);

    expect(multiplier).toBeGreaterThan(1);
    expect(multiplier).toBeLessThanOrEqual(1.18);
  });
});
