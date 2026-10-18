import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { calculateContractRenewalChance, processContractExpiries } from "@/engine/freeAgents/expiry";

function world(count = 1): GameState {
  const players = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const id = `p-${index}`;
    return [id, { id, firstName: "Contract", lastName: id, age: 20, position: "CM", secondaryPositions: [],
      clubId: "club", contractClubId: "club", contractExpiry: 6, wage: 500,
      currentAbility: 100, potentialAbility: 120, form: 0, morale: 7 }];
  }));
  return { currentWeek: 46, currentSeason: 6, players,
    clubs: { club: { id: "club", name: "Club", leagueId: "league", reputation: 50,
      budget: 500_000, weeklyWageBudget: 1_000_000, youthAcademyRating: 10, playerIds: Object.keys(players) } },
    leagues: { league: { country: "England" } }, fixtures: {}, matchRatings: {}, managerProfiles: {},
  } as unknown as GameState;
}

function addMatch(state: GameState, id: string, fixture: Record<string, unknown> = {}, rating: Record<string, unknown> = {}): void {
  state.fixtures[id] = { id, season: 6, played: true, homeClubId: "club", awayClubId: "other", ...fixture } as never;
  state.matchRatings[id] = { "p-0": { playerId: "p-0", minutesPlayed: 90, started: true, ...rating } } as never;
}

describe("contract expiry appearance indexing", () => {
  it.each([0, 1, 5, 6, 11, 12])("preserves renewal scoring and terms at %s appearances", count => {
    const state = world();
    for (let index = 0; index < count; index++) addMatch(state, `usage-${index}`);
    const expectedChance = calculateContractRenewalChance(state.players["p-0"], state.clubs.club, state);
    const probabilities: number[] = [];
    const result = processContractExpiries(state, { chance: (value: number) => { probabilities.push(value); return true; },
      nextInt: (min: number) => min } as never);
    expect(probabilities[0]).toBe(expectedChance);
    expect(result.renewals[0].contractLength).toBe(count >= 6 ? 4 : 3);
  });

  it("retains direct rating lookup semantics for inherited and non-enumerable entries", () => {
    const state = world();
    for (let index = 0; index < 6; index++) {
      addMatch(state, `legacy-${index}`);
      const rating = { playerId: "another-id", minutesPlayed: 90, started: true };
      state.matchRatings[`legacy-${index}`] = (index % 2 === 0
        ? Object.create({ "p-0": rating })
        : Object.defineProperty({}, "p-0", { value: rating, enumerable: false })) as never;
    }
    const willing = { chance: () => true, nextInt: (min: number) => min };
    expect(processContractExpiries(state, willing as never).renewals[0].contractLength).toBe(4);
  });

  it("visits each retained fixture once for a full renewal batch", () => {
    const state = world(6);
    for (let index = 0; index < 400; index++) {
      addMatch(state, `fixture-${index}`);
      state.matchRatings[`fixture-${index}`] = Object.fromEntries(Object.keys(state.players).map(playerId => [
        playerId, { playerId, minutesPlayed: 90, started: true },
      ])) as never;
    }
    let reads = 0;
    state.fixtures = new Proxy(state.fixtures, { get(target, key, receiver) {
      if (typeof key === "string" && Object.hasOwn(target, key)) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const original = JSON.stringify(state);
    // Exclude the input serialization's fixture reads from the measured work.
    reads = 0;
    const result = processContractExpiries(state, { chance: () => true, nextInt: (min: number) => min } as never);
    expect(result.renewals).toHaveLength(6);
    expect(reads, "Renewals must not rescan all retained fixtures per player or per negotiation stage").toBeLessThanOrEqual(400);
    expect(JSON.stringify(state)).toBe(original);
  });

  it.each([false, true])("preserves precise legacy participation and rating-key semantics for loaned=%s", loaned => {
    const state = world();
    if (loaned) {
      state.players["p-0"].clubId = "borrower";
      state.players["p-0"].loanParentClubId = "club";
      state.players["p-0"].onLoan = true;
      state.clubs.club.playerIds = [];
    }
    // These six count under the existing expiry rule, including a malformed
    // rating.playerId and an absent legacy started field. Current roster
    // membership, rating score and rating.playerId do not decide expiry usage.
    addMatch(state, "positive", {}, { started: false, minutesPlayed: 1 });
    addMatch(state, "legacy-start", {}, { minutesPlayed: undefined, started: true });
    addMatch(state, "legacy-absent", {}, { minutesPlayed: undefined, started: undefined });
    addMatch(state, "wrong-payload-id", {}, { playerId: "someone-else" });
    addMatch(state, "away-club", { homeClubId: "other", awayClubId: "club" });
    addMatch(state, "self-fixture", { awayClubId: "club" });
    addMatch(state, "unused", {}, { minutesPlayed: 0, started: true });
    addMatch(state, "negative", {}, { minutesPlayed: -1, started: true });
    addMatch(state, "nonfinite", {}, { minutesPlayed: Number.NaN, started: true });
    addMatch(state, "legacy-bench", {}, { minutesPlayed: undefined, started: false });
    addMatch(state, "old", { season: 5 });
    addMatch(state, "unplayed", { played: false });
    addMatch(state, "no-season", { season: undefined });
    addMatch(state, "string-season", { season: "6" });
    addMatch(state, "unrelated", { homeClubId: "other", awayClubId: "third" });
    addMatch(state, "wrong-key");
    state.matchRatings["wrong-key"] = { other: { playerId: "p-0", minutesPlayed: 90, started: true } } as never;
    state.matchRatings.missingFixture = state.matchRatings.positive;
    const planningClub = { ...state.clubs.club, playerIds: loaned ? [] : ["p-0"] };
    const expectedChance = calculateContractRenewalChance(state.players["p-0"], planningClub, state);
    const probabilities: number[] = [];
    const result = processContractExpiries(state, { chance: (value: number) => { probabilities.push(value); return true; },
      nextInt: (min: number) => min } as never);
    expect(probabilities[0]).toBe(expectedChance);
    expect(result.renewals[0]).toMatchObject({ playerId: "p-0", contractLength: 4 });
    // A self-fixture must count once; reaching12 rather than6 would raise wages.
    const sixOnly = world();
    if (loaned) { sixOnly.players["p-0"] = { ...state.players["p-0"] }; sixOnly.clubs.club.playerIds = []; }
    for (let index = 0; index < 6; index++) addMatch(sixOnly, `canonical-${index}`);
    expect(result).toEqual(processContractExpiries(sixOnly, { chance: () => true, nextInt: (min: number) => min } as never));
  });

  it("rebuilds usage between calls when ratings, fixtures or the season change", () => {
    const state = world();
    const willing = { chance: () => true, nextInt: (min: number) => min };
    const unused = processContractExpiries(state, willing as never);
    expect(unused.renewals[0].contractLength).toBe(3);
    for (let index = 0; index < 6; index++) addMatch(state, `current-${index}`);
    expect(processContractExpiries(state, willing as never).renewals[0].contractLength).toBe(4);
    state.currentSeason = 7;
    expect(processContractExpiries(state, willing as never).renewals[0].contractLength).toBe(3);
    state.fixtures["current-0"].season = 7;
    state.matchRatings["current-0"]["p-0"].minutesPlayed = 0;
    expect(processContractExpiries(state, willing as never).renewals[0].contractLength).toBe(3);
  });
});
