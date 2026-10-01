import { describe, expect, it } from "vitest";
import type { Club, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { estimateAcademyWeeklyWage, estimateContractWageBaseline } from "@/engine/players/wages";
import { ENGLAND_DATA } from "@/data/england";
import {
  limitAcademyIntakeToClubCapacity,
  SIMULATED_ACADEMY_PLAYER_CAP,
  generateAcademyIntake,
  generateAcademyEntryAbility,
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
  it("reserves wages across the intake and can admit a later affordable prospect", () => {
    const intake = [800, 250, 300, 250].map((wage, index) => ({ id: `intake-${index}`, wage } as Player));
    const before = JSON.stringify(intake);
    expect(limitAcademyIntakeToClubCapacity(club(), intake, 500).map(player => player.id))
      .toEqual(["intake-1", "intake-3"]);
    expect(JSON.stringify(intake)).toBe(before);
    expect(limitAcademyIntakeToClubCapacity(club(), intake, -50)).toEqual([]);
    expect(limitAcademyIntakeToClubCapacity(club(), intake, Number.NaN)).toEqual([]);
  });

  it("applies academy places and wage limits together without changing existing registrations", () => {
    const existingIds = Array.from({ length: SIMULATED_ACADEMY_PLAYER_CAP - 1 }, (_, index) => `existing-${index}`);
    const academy = club({ academyPlayerIds: existingIds });
    const intake = [{ id: "a", wage: 100 }, { id: "b", wage: 100 }] as Player[];
    expect(limitAcademyIntakeToClubCapacity(academy, intake, 200)).toEqual([intake[0]]);
    expect(academy.academyPlayerIds).toEqual(existingIds);
  });

  it("uses bounded academy registrations while retaining senior market terms for graduation", () => {
    expect(estimateAcademyWeeklyWage(120, 90)).toBeLessThan(estimateContractWageBaseline(120, 90));
    for (let seed = 0; seed < 30; seed++) {
      const players = generateAcademyIntake(new RNG(`academy-contract-${seed}`),
        club({ youthAcademyRating: 20, reputation: 90 }), ENGLAND_DATA, 9);
      for (const player of players) {
        expect(player.wage).toBeGreaterThanOrEqual(100);
        expect(player.wage).toBeLessThanOrEqual(2_000);
        expect(estimateContractWageBaseline(player.currentAbility, 90, player.wage)).toBeGreaterThanOrEqual(player.wage);
      }
    }
  });
  it("provides a modest continuing cohort without upgrading a low-rated academy's talent band", () => {
    for (let seed = 0; seed < 20; seed++) {
      const players = generateAcademyIntake(new RNG(`modest-${seed}`), club({ youthAcademyRating: 1 }), ENGLAND_DATA, 9);
      expect(players.length).toBeGreaterThanOrEqual(2);
      expect(players.length).toBeLessThanOrEqual(3);
      for (const player of players) {
        expect(player.currentAbility).toBeGreaterThanOrEqual(1);
        expect(player.currentAbility).toBeLessThan(player.potentialAbility);
        expect(player.potentialAbility).toBeLessThanOrEqual(100);
      }
    }
  });
  it("allows age-sensitive readiness and individual uncertainty without finishing prospects at intake", () => {
    const younger: number[] = [];
    const older: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const young = generateAcademyEntryAbility(new RNG(`entry-${seed}`), 14, 170, 18);
      const old = generateAcademyEntryAbility(new RNG(`entry-${seed}`), 16, 170, 18);
      younger.push(young);
      older.push(old);
      expect(old).toBeGreaterThanOrEqual(young);
      expect(old).toBeLessThan(170);
    }
    expect(Math.min(...older)).toBeLessThan(80);
    expect(Math.max(...older)).toBeGreaterThan(110);
    expect(new Set(older).size).toBeGreaterThan(30);
    expect(older.filter(value => value >= 100).length).toBeLessThan(older.length);
    expect(older.reduce((a,b) => a+b,0)).toBeGreaterThan(younger.reduce((a,b) => a+b,0));
  });
  it("keeps new academy registrations through graduation without guaranteeing a senior extension", () => {
    const ages = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const players = generateAcademyIntake(new RNG(`registration-${seed}`), club(), ENGLAND_DATA, 9);
      for (const player of players) {
        ages.add(player.age);
        for (let age = player.age; age < 18; age++) {
          expect(player.contractExpiry).toBeGreaterThan(9 + age - player.age);
        }
        expect(player.contractExpiry).toBe(9 + 18 - player.age);
        expect(player.clubId).toBe("club");
      }
    }
    expect([...ages].sort()).toEqual([14, 15, 16]);
  });
  it("fills academy places without exceeding the academy cap", () => {
    const existingIds = Array.from(
      { length: SIMULATED_ACADEMY_PLAYER_CAP - 1 },
      (_, index) => `existing-${index}`,
    );

    expect(limitAcademyIntakeToClubCapacity(
      club({ academyPlayerIds: existingIds }),
      intake(4),
    ).map((player) => player.id)).toEqual(["intake-0"]);
  });

  it("counts academy identities once and pauses a full academy intake", () => {
    const seniorIds = Array.from(
      { length: SIMULATED_ACADEMY_PLAYER_CAP - 2 },
      (_, index) => `senior-${index}`,
    );
    const fullClub = club({
      playerIds: [],
      academyPlayerIds: [...seniorIds, "academy", "shared", "shared"],
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

  it("continues recruiting replacements while the senior squad and loans are full", () => {
    const seniors = Array.from({ length: 25 }, (_, index) => `senior-${index}`);
    expect(limitAcademyIntakeToClubCapacity(
      club({ playerIds: seniors, loanedOutPlayerIds: ["loan-1", "loan-2"] }), intake(4),
    )).toHaveLength(4);
  });
});
