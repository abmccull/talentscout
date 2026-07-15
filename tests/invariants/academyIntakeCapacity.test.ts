import { describe, expect, it } from "vitest";
import type { Club, Player } from "@/engine/core/types";
import {
  limitAcademyIntakeToClubCapacity,
  SIMULATED_CLUB_PLAYER_CAP,
} from "@/engine/youth/generation";

function club(overrides: Partial<Club> = {}): Club {
  return {
    id: "club",
    name: "Capacity FC",
    shortName: "CAP",
    leagueId: "league",
    reputation: 50,
    budget: 1_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: "manager",
    playerIds: [],
    academyPlayerIds: [],
    loanedOutPlayerIds: [],
    youthAcademyRating: 12,
    ...overrides,
  };
}

function intake(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `intake-${index}`,
  } as Player));
}

describe("academy intake capacity", () => {
  it("fills available detailed-world places without exceeding the club cap", () => {
    const existingIds = Array.from(
      { length: SIMULATED_CLUB_PLAYER_CAP - 1 },
      (_, index) => `existing-${index}`,
    );

    expect(limitAcademyIntakeToClubCapacity(
      club({ playerIds: existingIds }),
      intake(4),
    ).map((player) => player.id)).toEqual(["intake-0"]);
  });

  it("counts loaned-out and academy identities once and pauses a full intake", () => {
    const seniorIds = Array.from(
      { length: SIMULATED_CLUB_PLAYER_CAP - 2 },
      (_, index) => `senior-${index}`,
    );
    const fullClub = club({
      playerIds: seniorIds,
      academyPlayerIds: ["academy", "shared"],
      loanedOutPlayerIds: ["shared"],
    });

    expect(limitAcademyIntakeToClubCapacity(fullClub, intake(3))).toEqual([]);
  });

  it("keeps the complete generated intake when capacity is available", () => {
    expect(limitAcademyIntakeToClubCapacity(
      club({ playerIds: ["senior"] }),
      intake(3),
    )).toHaveLength(3);
  });
});
