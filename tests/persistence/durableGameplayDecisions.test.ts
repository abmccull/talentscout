import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Club, GameState, NewGameConfig, ScoutReport } from "@/engine/core/types";

const provider = vi.hoisted(() => ({ saveState: vi.fn() }));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => provider }));
import { deleteSave, loadGameWithRecovery, migrateSaveState, saveGameWithResult } from "@/lib/db";
import { initializeFinances } from "@/engine/finance/expenses";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";
import { createSession } from "@/engine/observation/session";
import { useGameStore } from "@/stores/gameStore";
import { createDurableGameplaySetter } from "@/stores/actions/durableGameplayCommit";
import { resetGameplayAutosaveWatermark } from "@/stores/actions/persistGameplayAutosave";

const config: NewGameConfig = {
  scoutFirstName: "Durable", scoutLastName: "Decisions", scoutAge: 30, specialization: "youth", difficulty: "normal",
  worldSeed: "durable-decisions", startingCountry: "england", selectedCountries: ["england"],
  skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1, tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
};
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url)), "utf8"));
function career(): GameState {
  const scout = createScout(config, new RNG("durable-decisions"));
  return migrateSaveState({ ...fixture.state, seed: config.worldSeed, scout, finances: initializeFinances(scout, "independent", "normal") });
}
const waitForSave = async () => {
  await vi.waitFor(async () => expect(await loadGameWithRecovery(0)).not.toBeNull(), { timeout: 5_000 });
  return (await loadGameWithRecovery(0))!.state;
};
beforeEach(async () => {
  resetGameplayAutosaveWatermark();
  await deleteSave(0);
  provider.saveState.mockReset();
  provider.saveState.mockImplementation(async (_slot, state, name) => saveGameWithResult(0, name, state));
  useGameStore.setState({ gameState: career(), activeSession: null, autosaveError: null });
});
afterEach(() => {
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: null, activeSession: null });
});

describe("durable gameplay decision commits", () => {
  it("persists a purchased and equipped item with the live observation session without a lifecycle flush", async () => {
    const before = useGameStore.getState().gameState!.finances!.balance;
    const session = createSession({ activityType: "schoolMatch", specialization: "youth", seed: "live-observation", week: 7, season: 2, playerPool: [] }, new RNG("live-observation"));
    useGameStore.setState({ activeSession: session });
    useGameStore.getState().purchaseEquipItem("notebook_t2");
    useGameStore.getState().equipEquipItem("notebook_t2");
    const saved = await waitForSave();
    expect(saved.finances!.balance).toBe(before - 300);
    expect(saved.finances!.equipment!.ownedItems).toContain("notebook_t2");
    expect(Object.values(saved.finances!.equipment!.loadout)).toContain("notebook_t2");
    expect(saved.activeObservationSession).toMatchObject(session);
    expect(provider.saveState).toHaveBeenCalledTimes(1);
  });

  it("persists accepted employment and consumed offers, and a double acceptance pays no second reward", async () => {
    const state = useGameStore.getState().gameState!;
    const club: Club = { id: "club-durable", name: "Durable FC", shortName: "DFC", managerId: "manager", leagueId: "league", reputation: 50, budget: 1_000_000, scoutingPhilosophy: "academyFirst", playerIds: [], academyPlayerIds: [], youthAcademyRating: 12 };
    useGameStore.setState({ gameState: { ...state, clubs: { [club.id]: club }, jobOffers: [{ id: "offer-durable", clubId: club.id, tier: 2, role: "Youth Scout", salary: 600, contractLength: 2, expiresWeek: 12 }] } });
    useGameStore.getState().acceptJob("offer-durable");
    const accepted = useGameStore.getState().gameState;
    useGameStore.getState().acceptJob("offer-durable");
    expect(useGameStore.getState().gameState).toBe(accepted);
    const saved = await waitForSave();
    expect(saved.scout.currentClubId).toBe(club.id);
    expect(saved.scout.careerPath).toBe("club");
    expect(saved.finances!.careerPath).toBe("club");
    expect(saved.jobOffers).toEqual([]);
    expect(provider.saveState).toHaveBeenCalledTimes(1);
  });

  it("does not save failed choices, equivalent clones, or inbox-only rejection feedback", async () => {
    useGameStore.getState().purchaseEquipItem("notebook_t1");
    useGameStore.getState().acceptJob("missing");
    const commit = createDurableGameplaySetter(useGameStore.getState, useGameStore.setState);
    const state = useGameStore.getState().gameState!;
    commit({ gameState: structuredClone(state) });
    commit({ gameState: { ...state, inbox: [...state.inbox, { id: "rejected", title: "Unavailable" } as GameState["inbox"][number]] } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(provider.saveState).not.toHaveBeenCalled();
    expect(await loadGameWithRecovery(0)).toBeNull();
  });

  it("keeps later decisions after an in-flight real IndexedDB save", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    provider.saveState.mockImplementationOnce(async (_slot, state, name) => { await gate; return saveGameWithResult(0, name, state); });
    useGameStore.getState().purchaseEquipItem("notebook_t2");
    await vi.waitFor(() => expect(provider.saveState).toHaveBeenCalledTimes(1));
    useGameStore.getState().equipEquipItem("notebook_t1");
    release();
    await vi.waitFor(async () => {
      const saved = await loadGameWithRecovery(0);
      expect(Object.values(saved?.state.finances?.equipment?.loadout ?? {})).toContain("notebook_t1");
    }, { timeout: 5_000 });
    expect(provider.saveState).toHaveBeenCalledTimes(2);
  });

  it("does not queue an older decision if a synchronous subscriber replaces its career", async () => {
    const before = useGameStore.getState().gameState!;
    const replacement = career();
    const commit = createDurableGameplaySetter(useGameStore.getState, (patch) => {
      useGameStore.setState(patch);
      useGameStore.setState({ gameState: replacement });
    });
    commit({ gameState: { ...before, watchlist: ["a"] } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(useGameStore.getState().gameState).toBe(replacement);
    expect(provider.saveState).not.toHaveBeenCalled();
  });

  it("cannot list or settle stale bids for a private pass receipt", async () => {
    const state = useGameStore.getState().gameState!;
    const report = { id: "private-pass", scoutId: state.scout.id, playerId: "player", recommendedAction: "pass" } as unknown as ScoutReport;
    const withPass = { ...state, reports: { [report.id]: report }, finances: { ...state.finances!, reportListings: [{ id: "stale-pass-listing", reportId: report.id, bids: [{ id: "pass-bid", status: "pending", isExclusiveUpgrade: true }] }] } } as GameState;
    useGameStore.setState({ gameState: withPass });
    useGameStore.getState().listReportForSale(report.id, 100, false);
    useGameStore.getState().acceptMarketplaceBid("pass-bid");
    useGameStore.getState().acceptExclusiveUpgradeBid("pass-bid");
    expect(useGameStore.getState().gameState).toBe(withPass);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(provider.saveState).not.toHaveBeenCalled();
  });
});
