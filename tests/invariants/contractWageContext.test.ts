import { describe, expect, it } from "vitest";
import type { Club, GameState } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { calculatePlayerWeeklyWage, getContractWageBaseline } from "@/engine/finance/wages";
import { createFreeAgentFromPlayer, processContractExpiries } from "@/engine/freeAgents/expiry";

describe("contract wage context", () => {
  it("preserves the original generation curve at every ability/reputation tier", () => {
    for (const ability of [10, 30, 45, 80, 120, 160, 200]) {
      for (const reputation of [10, 20, 40, 70, 95]) {
        const previous = Math.round(Math.pow(ability / 100, 2.2) * 50_000 * (reputation / 80) / 500) * 500;
        expect(calculatePlayerWeeklyWage(ability, reputation)).toBe(previous);
      }
    }
  });

  it("does not impose a top-level salary floor when an affordable lower-league contract expires", () => {
    const player = { ...generatePlayer(new RNG("small-club-wage"), { position: "CM", ageRange: [23, 23],
      abilityRange: [40, 40], nationality: "English", clubId: "club", clubReputation: 13, currentSeason: 1 }),
      wage: 1_000, contractExpiry: 2, form: 0, morale: 7 };
    const club: Club = { id: "club", name: "Local FC", shortName: "LFC", managerId: "manager", scoutingPhilosophy: "academyFirst",
      reputation: 13, budget: 100_000, weeklyWageBudget: 1_500,
      playerIds: [player.id], academyPlayerIds: [], leagueId: "league", youthAcademyRating: 5 };
    const state = { players: { [player.id]: player }, clubs: { club }, currentSeason: 2, currentWeek: 46,
      leagues: { league: { country: "england" } }, fixtures: {}, matchRatings: {}, managerProfiles: {} } as unknown as GameState;
    const renewals = Array.from({ length: 100 }, (_, index) => processContractExpiries(state, new RNG(`renewal-${index}`)))
      .flatMap((result) => result.renewals);
    expect(renewals.length).toBeGreaterThan(0);
    expect(renewals.every((renewal) => renewal.wage <= 1_500)).toBe(true);
    const released = createFreeAgentFromPlayer(player, club, 2, "england");
    expect(released.wageExpectation).toBe(1_000);
    expect(released.signingBonusExpectation).toBe(3_000);
    expect(player.contractExpiry).toBe(2);
  });

  it("keeps existing pay and higher-level ability as real negotiating anchors", () => {
    expect(getContractWageBaseline({ currentAbility: 40, wage: 5_000 }, 13)).toBe(5_000);
    expect(getContractWageBaseline({ currentAbility: 150, wage: 1_000 }, 80)).toBeGreaterThan(100_000);
    expect(getContractWageBaseline({ currentAbility: 1, wage: 0 }, 10)).toBe(100);
  });
});
