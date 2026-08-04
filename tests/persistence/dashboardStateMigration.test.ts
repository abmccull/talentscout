import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  cleanupDashboardState,
  createDashboardState,
  migrateDashboardState,
} from "@/engine/dashboard/state";
import { migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

describe("dashboard state migration", () => {
  it("creates the minimal persisted dashboard state shape", () => {
    expect(createDashboardState()).toEqual({
      version: 1,
      focusedItemId: null,
      focusedThreadId: null,
      recentItemIds: [],
      itemDispositions: {},
      recentlyResolved: [],
      insightLedger: {},
      surfacing: {
        lastVisibleItemIds: [],
        lastVisibleInsightIds: [],
      },
      legacyRecordIds: [],
      careerThreads: {},
    });
  });

  it("normalizes dashboard intent/history references without persisting copied payloads", () => {
    const migrated = migrateDashboardState({
      focusedItemId: "  dashboard-report-work-player-1  ",
      focusedThreadId: "",
      recentItemIds: ["item-1", "", "item-1", "item-2", null],
      itemDispositions: {
        itemA: {
          itemId: "item-1",
          kind: "dismissed",
          updatedAt: { season: 2, week: 7 },
          title: "Copied UI payload should be dropped",
        },
        itemB: {
          itemId: "item-2",
          kind: "snoozed",
          updatedAt: { season: 2, week: 7 },
          snoozedUntil: { season: 2, week: 9 },
        },
        broken: {
          itemId: "",
          kind: "dismissed",
          updatedAt: { season: 0, week: 0 },
        },
      },
      careerThreads: {
        "thread-1": {
          type: "alumni_callback",
          primaryItemId: "item-1",
          relatedItemIds: ["item-1", "", "item-2"],
          playerId: "player-1",
          lastTouchedSeason: 2,
          lastTouchedWeek: 7,
          archived: true,
          whatHappened: ["Signed for Braga", "Became a starter"],
          careerImpact: "Your late-developer judgment was validated.",
          explanation: "Copied truth payload should be dropped",
        },
      },
    });

    expect(migrated).toEqual({
      version: 1,
      focusedItemId: "dashboard-report-work-player-1",
      focusedThreadId: null,
      recentItemIds: ["item-1", "item-2"],
      itemDispositions: {
        itemA: {
          itemId: "item-1",
          state: "dismissed",
          changedWeek: 7,
          changedSeason: 2,
        },
        itemB: {
          itemId: "item-2",
          state: "snoozed",
          changedWeek: 7,
          changedSeason: 2,
          snoozedUntilWeek: 9,
          snoozedUntilSeason: 2,
        },
      },
      recentlyResolved: [],
      insightLedger: {},
      surfacing: {
        lastVisibleItemIds: [],
        lastVisibleInsightIds: [],
      },
      legacyRecordIds: [],
      careerThreads: {
        "thread-1": {
          id: "thread-1",
          type: "alumni_callback",
          primaryItemId: "item-1",
          relatedItemIds: ["item-1", "item-2"],
          playerId: "player-1",
          title: "Career thread",
          summary: "",
          whatHappened: ["Signed for Braga", "Became a starter"],
          careerImpact: "Your late-developer judgment was validated.",
          evidenceIds: [],
          lastUpdatedAt: { season: 2, week: 7 },
          archived: true,
        },
      },
    });
    expect(cleanupDashboardState(migrated)).toEqual(migrated);
  });

  it("adds and preserves dashboard state at the canonical save boundary", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };

    const migrated = migrateSaveState({
      ...legacy.state,
      dashboardState: {
        focusedItemId: " item-1 ",
        recentItemIds: ["item-1", "item-1", ""],
      },
    });
    const reloaded = migrateSaveState(migrated);

    expect(migrated.dashboardState).toEqual({
      version: 1,
      focusedItemId: "item-1",
      focusedThreadId: null,
      recentItemIds: ["item-1"],
      itemDispositions: {},
      recentlyResolved: [],
      insightLedger: {},
      surfacing: {
        lastVisibleItemIds: [],
        lastVisibleInsightIds: [],
      },
      legacyRecordIds: [],
      careerThreads: {},
    });
    expect(reloaded).toEqual(migrated);
  });
});
