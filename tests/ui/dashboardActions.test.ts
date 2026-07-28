import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { createDashboardActions } from "@/stores/actions/dashboardActions";
import type { GameStoreState } from "@/stores/gameStoreTypes";

function createHarness(week = 4, season = 1) {
  const state = {
    gameState: {
      currentWeek: week,
      currentSeason: season,
      fixtures: {},
    } as GameState,
  } as GameStoreState;
  const get = () => state;
  const set = (partial: Partial<GameStoreState> | ((current: GameStoreState) => Partial<GameStoreState>)) => {
    Object.assign(state, typeof partial === "function" ? partial(state) : partial);
  };
  return { state, actions: createDashboardActions(get, set) };
}

describe("dashboardActions", () => {
  it("persists reviewed, pinned, snoozed, and dismissed intent", () => {
    const harness = createHarness();
    harness.actions.markDashboardItemViewed("item-1", "fingerprint-1");
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]?.state).toBe("viewed");

    harness.actions.toggleDashboardItemPinned("item-1", "fingerprint-1");
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]?.pinned).toBe(true);

    harness.actions.snoozeDashboardItemUntilNextWeek("item-1", "fingerprint-1");
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]).toMatchObject({
      state: "snoozed",
      snoozedUntilWeek: 5,
      snoozedUntilSeason: 1,
    });

    harness.actions.dismissDashboardItem("item-1", "fingerprint-1");
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]?.state).toBe("dismissed");
  });

  it("moves disappeared visible priorities into bounded recent resolution history", () => {
    const harness = createHarness();
    harness.actions.syncDashboardVisibleItems(["item-1", "item-2"]);
    harness.actions.syncDashboardVisibleItems(["item-2"]);
    expect(harness.state.gameState?.dashboardState?.recentlyResolved).toContainEqual({
      itemId: "item-1",
      resolvedWeek: 4,
      resolvedSeason: 1,
    });
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]?.state).toBe("resolved");
  });

  it("does not misclassify a snoozed item as resolved when it leaves the visible queue", () => {
    const harness = createHarness();
    harness.actions.syncDashboardVisibleItems(["item-1"]);
    harness.actions.snoozeDashboardItemUntilNextWeek("item-1", "fingerprint-1");
    harness.actions.syncDashboardVisibleItems([]);
    expect(harness.state.gameState?.dashboardState?.itemDispositions["item-1"]?.state).toBe("snoozed");
    expect(harness.state.gameState?.dashboardState?.recentlyResolved).toHaveLength(0);
  });

  it("records insight surfacing metadata without copying the insight payload", () => {
    const harness = createHarness();
    harness.actions.syncDashboardInsights([{ id: "insight-1", fingerprint: "evidence-a" }]);
    expect(harness.state.gameState?.dashboardState?.insightLedger["insight-1"]).toMatchObject({
      insightId: "insight-1",
      firstGeneratedWeek: 4,
      lastGeneratedWeek: 4,
      fingerprint: "evidence-a",
    });
    expect(harness.state.gameState?.dashboardState?.surfacing.lastVisibleInsightIds).toEqual(["insight-1"]);
  });
});
