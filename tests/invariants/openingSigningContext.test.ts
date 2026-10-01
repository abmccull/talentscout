import { describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import * as lifecycle from "@/engine/world/playerLifecycle";
import type { LifecycleResolution, LifecycleWorldState, PlayerMovementIntent } from "@/engine/world/playerLifecycle";
import * as economics from "@/engine/finance/clubEconomics";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import { RNG } from "@/engine/rng";

type Signing = Extract<PlayerMovementIntent, { type: "freeAgentSigning" }>;
type SigningFactory = (input: LifecycleWorldState, week: number, season: number) => (intent: Signing) => LifecycleResolution;

function factory(): SigningFactory {
  const value = (lifecycle as unknown as { createFreeAgentSigningResolver?: SigningFactory }).createFreeAgentSigningResolver;
  expect(value, "A reusable resolver must preserve sequential free-agent decisions").toBeTypeOf("function");
  return value!;
}

function world(): GameState {
  const players = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`p-${index}`, {
    id: `p-${index}`, clubId: "club", contractClubId: "club", position: "CM", age: 24,
    contractExpiry: 5, wage: 500, currentAbility: 100,
  }]));
  for (let index = 0; index < 16; index++) {
    const id = `available-${index}`;
    players[id] = { id, clubId: "", contractClubId: "", position: index < 4 ? "GK" : "CM",
      age: 25, contractExpiry: 2, wage: 500, currentAbility: 100 };
  }
  return {
    seed: "opening-context", currentSeason: 3, currentWeek: 1, managerProfiles: {}, leagues: {},
    players, clubs: { club: { id: "club", name: "Club", leagueId: "league", reputation: 55,
      budget: 50_000, weeklyWageBudget: 20_000, scoutingPhilosophy: "marketSmart", youthAcademyRating: 10,
      playerIds: Object.keys(players).filter(id => id.startsWith("p-")) } },
    freeAgentPool: { agents: Object.keys(players).filter(id => id.startsWith("available-")).map(playerId => ({
      playerId, status: "available", weeksInPool: 2, maxWeeksInPool: 100,
      wageExpectation: 500, signingBonusExpectation: 1_000, npcInterest: [],
    })), totalSignedThisSeason: 0, totalRetiredThisSeason: 0, totalReleasedThisSeason: 0 },
  } as unknown as GameState;
}

function offer(playerId: string, overrides: Partial<Signing> = {}): Signing {
  return { type: "freeAgentSigning", playerId, toClubId: "club", wage: 500,
    signingBonus: 1_000, contractLength: 3, ...overrides };
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

describe("sequential opening signing context", () => {
  it("initializes whole-world lifecycle economics at most once per recruitment phase", () => {
    const input = world();
    const original = JSON.stringify(input);
    const normalize = vi.spyOn(economics, "normalizeClubEconomicsMap");
    try {
      const rng = new RNG("opening-context-cost");
      rng.chance = () => true;
      const result = recruitForSeasonOpening(input, rng);
      expect(result.freeAgentPool.totalSignedThisSeason).toBe(8);
      expect(result.clubs.club.budget).toBe(42_000);
      expect(result.clubs.club.playerIds).toHaveLength(18);
      expect(normalize.mock.calls.length, "Eight accepted offers must not repeat whole-world initialization eight times").toBeLessThanOrEqual(3);
      expect(JSON.stringify(input)).toBe(original);
    } finally { normalize.mockRestore(); }
  });

  it.each(["cash", "wages", "missing-player", "missing-club", "already-owned"] as const)(
    "matches standalone outcomes after a %s refusal followed by sequential agreements", reason => {
      const input = world();
      const raw = lifecycle.getLifecycleWorld(input);
      raw.clubs.club.budget = 2_500;
      raw.clubs.club.weeklyWageBudget = 20_000;
      const first = offer("available-4", reason === "cash" ? { signingBonus: 100_000 }
        : reason === "wages" ? { wage: 100_000 }
          : reason === "missing-player" ? { playerId: "absent" }
            : reason === "missing-club" ? { toClubId: "absent" }
              : { playerId: "p-0" });
      const sequence = [first, offer("available-0"), offer("available-4"), offer("available-5"), offer("available-0")];
      const original = JSON.stringify(raw);
      freeze(raw);
      const resolve = factory()(raw, 1, 3);
      let reference = raw;
      for (const intent of sequence) {
        const expected = lifecycle.resolvePlayerMovements(reference, [intent], 1, 3);
        const actual = resolve(intent);
        expect(actual.applied).toEqual(expected.applied);
        expect(actual.rejected).toEqual(expected.rejected);
        if (expected.applied.length) {
          expect(actual.state).toEqual(expected.state);
          reference = expected.state;
        }
      }
      expect(reference.clubs.club.budget).toBe(500);
      expect(reference.freeAgentPool.totalSignedThisSeason).toBe(2);
      expect(reference.playerMovementHistory).toHaveLength(2);
      expect(JSON.stringify(raw)).toBe(original);
    },
  );

  it("repairs duplicate registrations and keeps movement indices and source history unchanged", () => {
    const raw = lifecycle.getLifecycleWorld(world());
    raw.clubs.other = { ...raw.clubs.club, id: "other", playerIds: ["available-0"], academyPlayerIds: ["available-0"] };
    raw.clubs.club.loanedInPlayerIds = ["available-0"];
    raw.players.owned = { ...raw.players["p-0"], id: "owned" } as Player;
    raw.freeAgentPool.agents.push({ ...raw.freeAgentPool.agents[0], playerId: "owned" });
    const original = JSON.stringify(raw);
    freeze(raw);
    const resolve = factory()(raw, 1, 3);
    const first = resolve(offer("available-0"));
    expect(first.applied).toHaveLength(1);
    expect(first.state.clubs.other.playerIds).toEqual([]);
    expect(first.state.clubs.other.academyPlayerIds).toEqual([]);
    expect(first.state.clubs.club.loanedInPlayerIds).toEqual([]);
    expect(first.state.clubs.club.playerIds.filter(id => id === "available-0")).toHaveLength(1);
    expect(first.state.freeAgentPool.agents.some(agent => agent.playerId === "owned")).toBe(false);
    const second = resolve(offer("available-4"));
    const expected = lifecycle.resolvePlayerMovements(lifecycle.resolvePlayerMovements(raw, [offer("available-0")], 1, 3).state,
      [offer("available-4")], 1, 3);
    expect(second.state).toEqual(expected.state);
    expect(second.applied).toEqual(expected.applied);
    expect(JSON.stringify(raw)).toBe(original);
  });

  it("keeps original game-state identity when every approach is declined", () => {
    const input = world();
    const original = JSON.stringify(input);
    const rng = new RNG("declined-context");
    rng.chance = () => false;
    expect(recruitForSeasonOpening(input, rng)).toBe(input);
    expect(JSON.stringify(input)).toBe(original);
  });
});
