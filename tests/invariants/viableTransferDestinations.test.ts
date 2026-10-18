import { describe, expect, it, vi } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import { createTransferDestinationIndex, selectViableAITransferDestination } from "@/engine/core/gameLoop";
import { proposeTransferAgreement } from "@/engine/transfers/transferAgreement";
import { RNG } from "@/engine/rng";

function fixture(): { state: GameState; player: Player; seller: Club } {
  const player = { id: "target", firstName: "Dean", lastName: "Test", age: 23, nationality: "English",
    position: "LB", secondaryPositions: [], clubId: "seller", contractClubId: "seller", contractExpiry: 2,
    currentAbility: 60, potentialAbility: 90, marketValue: 50_000, wage: 1_000,
    form: 0, morale: 1, injured: false, attributes: {}, personalityProfile: { transferWillingness: 0.9 },
    seasonRatings: [], recentMatchRatings: [] } as unknown as Player;
  const club = (id: string, wageBudget: number): Club => ({ id, name: id, shortName: id,
    leagueId: "england", reputation: 30, budget: 250_000, weeklyWageBudget: wageBudget,
    scoutingPhilosophy: "winNow", youthAcademyRating: 4, managerId: `manager-${id}`,
    playerIds: id === "seller" ? [player.id] : [], academyPlayerIds: [], financialObligations: [] });
  const seller = club("seller", 50_000);
  const state = { seed: "feasible-destination", currentWeek: 10, currentSeason: 1,
    players: { target: player }, clubs: { seller, unaffordable: club("unaffordable", 100), viable: club("viable", 50_000) },
    leagues: { england: { id: "england", country: "England", tier: 4, clubIds: ["seller", "unaffordable", "viable"] } },
    managerProfiles: {}, fixtures: {}, matchRatings: {}, reports: {}, playerMovementHistory: [],
  } as unknown as GameState;
  return { state, player, seller };
}

describe("feasible AI transfer destinations", () => {
  it("draws once among genuinely viable packages and reuses the selected terms", () => {
    const { state, player, seller } = fixture();
    expect(proposeTransferAgreement({ player, sellingClub: seller, buyingClub: state.clubs.unaffordable, state }).viable).toBe(false);
    const expected = proposeTransferAgreement({ player, sellingClub: seller, buyingClub: state.clubs.viable, state });
    expect(expected.viable).toBe(true);
    const before = JSON.stringify(state);
    const rng = new RNG("one-draw");
    const draw = vi.spyOn(rng, "pickWeighted");
    const selected = selectViableAITransferDestination(player, seller, state, rng);
    expect(selected?.destination.id).toBe("viable");
    expect(selected?.agreement).toEqual(expected);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][0].map((entry) => (entry.item as Club).id)).toEqual(["viable"]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("does not draw or reroll when no package is affordable", () => {
    const { state, player, seller } = fixture();
    state.clubs.viable.weeklyWageBudget = 100;
    const rng = new RNG("no-eligible");
    const draw = vi.spyOn(rng, "pickWeighted");
    expect(selectViableAITransferDestination(player, seller, state, rng)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it.each(["cash", "wages", "roster"] as const)("honors pending %s reservations before choosing", (reservation) => {
    const { state, player, seller } = fixture();
    const index = createTransferDestinationIndex(state);
    const proposal = proposeTransferAgreement({ player, sellingClub: seller, buyingClub: state.clubs.viable, state });
    const spentBudget = new Map<string, number>();
    if (reservation === "cash") spentBudget.set("viable", proposal.affordability.result.remainingBudgetAfterReserve + 1);
    if (reservation === "wages") index.reservedWeeklyCommitmentByClub.set("viable", proposal.affordability.result.remainingWeeklyHeadroom + 1);
    if (reservation === "roster") index.reservedIncomingByClub.set("viable", 30);
    const rng = new RNG(`reserved-${reservation}`);
    const draw = vi.spyOn(rng, "pickWeighted");
    expect(selectViableAITransferDestination(player, seller, state, rng, { index, spentBudget })).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it("preserves player availability instead of bypassing movement policy", () => {
    const { state, player, seller } = fixture();
    player.injured = true;
    const rng = new RNG("unavailable-player");
    const draw = vi.spyOn(rng, "pickWeighted");
    expect(selectViableAITransferDestination(player, seller, state, rng)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it("reuses one payroll view without scanning the player world per destination", () => {
    const { state, player, seller } = fixture();
    let worldScans = 0;
    state.players = new Proxy(state.players, { ownKeys(target) { worldScans += 1; return Reflect.ownKeys(target); } });
    const index = createTransferDestinationIndex(state);
    expect(worldScans).toBeGreaterThan(0);
    worldScans = 0;
    expect(selectViableAITransferDestination(player, seller, state, new RNG("cached-payroll"), { index })?.destination.id).toBe("viable");
    expect(worldScans).toBe(0);
  });

  it("cached affordability preserves the full package and ignores a mismatched club context", () => {
    const { state, player, seller } = fixture();
    const index = createTransferDestinationIndex(state);
    const input = { player, sellingClub: seller, buyingClub: state.clubs.viable, state };
    const direct = proposeTransferAgreement(input);
    expect(proposeTransferAgreement({ ...input, affordabilityContext: index.affordabilityByClub.viable })).toEqual(direct);
    expect(proposeTransferAgreement({ ...input, affordabilityContext: index.affordabilityByClub.unaffordable })).toEqual(direct);
  });
});
