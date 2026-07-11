import { describe, expect, it } from "vitest";
import type { Player } from "@/engine/core/types";
import { linkReportsToTransfers } from "@/engine/firstTeam/transferTracker";
import { createRNG } from "@/engine/rng";

const player = {
  id: "p1",
  firstName: "Alex",
  lastName: "Prospect",
  currentAbility: 105,
} as Player;

describe("transfer accountability history", () => {
  it("records later career moves while suppressing the exact same transfer twice", () => {
    const reports = {
      old: {
        id: "old",
        playerId: "p1",
        scoutId: "scout",
        conviction: "recommend" as const,
        clubResponse: "signed",
        submittedWeek: 2,
        submittedSeason: 1,
      },
      recent: {
        id: "recent",
        playerId: "p1",
        scoutId: "scout",
        conviction: "strongRecommend" as const,
        clubResponse: "shortlisted",
        submittedWeek: 4,
        submittedSeason: 2,
      },
    };

    const firstMove = linkReportsToTransfers(
      createRNG("first"),
      [{ playerId: "p1", fromClubId: "a", toClubId: "b", fee: 10_000 }],
      reports,
      { p1: player },
      "scout",
      5,
      2,
      new Set(),
    );
    expect(firstMove).toHaveLength(1);
    expect(firstMove[0].reportId).toBe("recent");

    const exactTransferKey = "p1:a:b:2:5";
    expect(linkReportsToTransfers(
      createRNG("duplicate"),
      [{ playerId: "p1", fromClubId: "a", toClubId: "b", fee: 10_000 }],
      reports,
      { p1: player },
      "scout",
      5,
      2,
      new Set([exactTransferKey]),
    )).toEqual([]);

    const laterMove = linkReportsToTransfers(
      createRNG("later"),
      [{ playerId: "p1", fromClubId: "b", toClubId: "c", fee: 20_000 }],
      reports,
      { p1: player },
      "scout",
      10,
      3,
      new Set([exactTransferKey]),
    );
    expect(laterMove).toHaveLength(1);
    expect(laterMove[0]).toMatchObject({
      fromClubId: "b",
      toClubId: "c",
      transferWeek: 10,
      transferSeason: 3,
    });
  });
});
