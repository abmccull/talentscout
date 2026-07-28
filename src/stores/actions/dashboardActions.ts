import { getSeasonLength } from "@/engine/core/gameDate";
import {
  cleanupDashboardState,
  migrateDashboardState,
} from "@/engine/dashboard/state";
import type { DashboardItemDisposition } from "@/engine/dashboard/types";
import type { GetState, SetState } from "./types";

const MAX_VISIBLE_IDS = 32;

function updateDisposition(
  get: GetState,
  set: SetState,
  itemId: string,
  change: (current: DashboardItemDisposition | undefined, week: number, season: number) => DashboardItemDisposition,
): void {
  const gameState = get().gameState;
  if (!gameState || !itemId) return;
  const dashboardState = migrateDashboardState(gameState.dashboardState);
  const nextDisposition = change(
    dashboardState.itemDispositions[itemId],
    gameState.currentWeek,
    gameState.currentSeason,
  );
  set({
    gameState: {
      ...gameState,
      dashboardState: cleanupDashboardState({
        ...dashboardState,
        focusedItemId: itemId,
        itemDispositions: {
          ...dashboardState.itemDispositions,
          [itemId]: nextDisposition,
        },
      }),
    },
  });
}

export function createDashboardActions(get: GetState, set: SetState) {
  return {
    markDashboardItemViewed: (itemId: string, fingerprint?: string) => {
      updateDisposition(get, set, itemId, (current, changedWeek, changedSeason) => ({
        itemId,
        state: current?.state === "snoozed" ? "snoozed" : "viewed",
        changedWeek,
        changedSeason,
        ...(current?.snoozedUntilWeek ? { snoozedUntilWeek: current.snoozedUntilWeek } : {}),
        ...(current?.snoozedUntilSeason ? { snoozedUntilSeason: current.snoozedUntilSeason } : {}),
        ...(current?.pinned ? { pinned: true } : {}),
        ...(fingerprint ? { fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
      }));
    },

    snoozeDashboardItemUntilNextWeek: (itemId: string, fingerprint?: string) => {
      updateDisposition(get, set, itemId, (current, changedWeek, changedSeason) => {
        const gameState = get().gameState!;
        const seasonLength = getSeasonLength(gameState.fixtures, changedSeason);
        const rollsSeason = changedWeek >= seasonLength;
        return {
          itemId,
          state: "snoozed",
          changedWeek,
          changedSeason,
          snoozedUntilWeek: rollsSeason ? 1 : changedWeek + 1,
          snoozedUntilSeason: rollsSeason ? changedSeason + 1 : changedSeason,
          ...(current?.pinned ? { pinned: true } : {}),
          ...(fingerprint ? { fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
        };
      });
    },

    toggleDashboardItemPinned: (itemId: string, fingerprint?: string) => {
      updateDisposition(get, set, itemId, (current, changedWeek, changedSeason) => ({
        itemId,
        state: current?.state === "new" || !current ? "viewed" : current.state,
        changedWeek,
        changedSeason,
        pinned: !current?.pinned,
        ...(current?.snoozedUntilWeek ? { snoozedUntilWeek: current.snoozedUntilWeek } : {}),
        ...(current?.snoozedUntilSeason ? { snoozedUntilSeason: current.snoozedUntilSeason } : {}),
        ...(fingerprint ? { fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
      }));
    },

    dismissDashboardItem: (itemId: string, fingerprint?: string) => {
      updateDisposition(get, set, itemId, (current, changedWeek, changedSeason) => ({
        itemId,
        state: "dismissed",
        changedWeek,
        changedSeason,
        ...(current?.pinned ? { pinned: true } : {}),
        ...(fingerprint ? { fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
      }));
    },

    syncDashboardVisibleItems: (visibleItemIds: string[]) => {
      const gameState = get().gameState;
      if (!gameState) return;
      const dashboardState = migrateDashboardState(gameState.dashboardState);
      const nextVisible = [...new Set(visibleItemIds.filter(Boolean))].slice(-MAX_VISIBLE_IDS);
      const active = new Set(nextVisible);
      const newlyResolved = dashboardState.surfacing.lastVisibleItemIds
        .filter((itemId) => {
          if (active.has(itemId)) return false;
          const disposition = dashboardState.itemDispositions[itemId];
          return disposition?.state !== "snoozed" && disposition?.state !== "dismissed";
        })
        .map((itemId) => ({
          itemId,
          resolvedWeek: gameState.currentWeek,
          resolvedSeason: gameState.currentSeason,
        }));
      if (
        newlyResolved.length === 0
        && nextVisible.length === dashboardState.surfacing.lastVisibleItemIds.length
        && nextVisible.every((id, index) => id === dashboardState.surfacing.lastVisibleItemIds[index])
      ) return;

      const resolvedIds = new Set(newlyResolved.map((reference) => reference.itemId));
      const itemDispositions = { ...dashboardState.itemDispositions };
      for (const itemId of resolvedIds) {
        const current = itemDispositions[itemId];
        itemDispositions[itemId] = {
          itemId,
          state: "resolved",
          changedWeek: gameState.currentWeek,
          changedSeason: gameState.currentSeason,
          ...(current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
        };
      }

      set({
        gameState: {
          ...gameState,
          dashboardState: cleanupDashboardState({
            ...dashboardState,
            itemDispositions,
            recentlyResolved: [...dashboardState.recentlyResolved, ...newlyResolved],
            recentItemIds: nextVisible,
            surfacing: {
              ...dashboardState.surfacing,
              lastVisibleItemIds: nextVisible,
              lastGeneratedWeek: gameState.currentWeek,
              lastGeneratedSeason: gameState.currentSeason,
            },
          }),
        },
      });
    },

    dismissDashboardInsight: (insightId: string, fingerprint?: string) => {
      const gameState = get().gameState;
      if (!gameState || !insightId) return;
      const dashboardState = migrateDashboardState(gameState.dashboardState);
      const current = dashboardState.insightLedger[insightId];
      set({
        gameState: {
          ...gameState,
          dashboardState: cleanupDashboardState({
            ...dashboardState,
            insightLedger: {
              ...dashboardState.insightLedger,
              [insightId]: {
                insightId,
                firstGeneratedWeek: current?.firstGeneratedWeek ?? gameState.currentWeek,
                lastGeneratedWeek: gameState.currentWeek,
                firstGeneratedSeason: current?.firstGeneratedSeason ?? gameState.currentSeason,
                lastGeneratedSeason: gameState.currentSeason,
                dismissedWeek: gameState.currentWeek,
                dismissedSeason: gameState.currentSeason,
                ...(fingerprint ? { fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
              },
            },
          }),
        },
      });
    },

    syncDashboardInsights: (insights: Array<{ id: string; fingerprint?: string }>) => {
      const gameState = get().gameState;
      if (!gameState) return;
      const dashboardState = migrateDashboardState(gameState.dashboardState);
      const ids = [...new Set(insights.map((insight) => insight.id).filter(Boolean))];
      if (
        ids.length === dashboardState.surfacing.lastVisibleInsightIds.length
        && ids.every((id, index) => id === dashboardState.surfacing.lastVisibleInsightIds[index])
        && dashboardState.surfacing.lastGeneratedWeek === gameState.currentWeek
        && dashboardState.surfacing.lastGeneratedSeason === gameState.currentSeason
      ) return;
      const insightLedger = { ...dashboardState.insightLedger };
      for (const insight of insights) {
        const current = insightLedger[insight.id];
        insightLedger[insight.id] = {
          insightId: insight.id,
          firstGeneratedWeek: current?.firstGeneratedWeek ?? gameState.currentWeek,
          lastGeneratedWeek: gameState.currentWeek,
          firstGeneratedSeason: current?.firstGeneratedSeason ?? gameState.currentSeason,
          lastGeneratedSeason: gameState.currentSeason,
          ...(current?.lastViewedWeek ? { lastViewedWeek: current.lastViewedWeek } : {}),
          ...(current?.lastViewedSeason ? { lastViewedSeason: current.lastViewedSeason } : {}),
          ...(current?.dismissedWeek ? { dismissedWeek: current.dismissedWeek } : {}),
          ...(current?.dismissedSeason ? { dismissedSeason: current.dismissedSeason } : {}),
          ...(insight.fingerprint ? { fingerprint: insight.fingerprint } : current?.fingerprint ? { fingerprint: current.fingerprint } : {}),
        };
      }
      set({
        gameState: {
          ...gameState,
          dashboardState: cleanupDashboardState({
            ...dashboardState,
            insightLedger,
            surfacing: {
              ...dashboardState.surfacing,
              lastVisibleInsightIds: ids,
              lastGeneratedWeek: gameState.currentWeek,
              lastGeneratedSeason: gameState.currentSeason,
            },
          }),
        },
      });
    },
  };
}
