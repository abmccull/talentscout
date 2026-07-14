import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  return {
    storage,
    unlockAchievement: vi.fn(),
  };
});

vi.mock("@/lib/achievements", () => ({
  ACHIEVEMENTS: [
    { id: "first-week" },
    { id: "first-match" },
  ],
  checkAchievements: () => ["first-week", "first-match"],
}));

vi.mock("@/engine/core/achievementEngine", () => ({
  getAchievementProgress: () => ({ current: 1, target: 1, percentage: 100 }),
  createUnlockRecord: (achievementId: string, week: number, season: number) => ({
    achievementId,
    unlockedAt: 1,
    week,
    season,
  }),
}));

vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => ({ unlockAchievement: mocks.unlockAchievement }),
}));

import {
  TOTAL_ACHIEVEMENT_COUNT,
  useAchievementStore,
} from "@/stores/achievementStore";

describe("Youth Early Access achievement scope", () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.unlockAchievement.mockClear();
    useAchievementStore.setState({
      unlockedAchievements: new Set(),
      pendingToasts: [],
      unlockRecords: {},
      progressCache: {},
    });
  });

  it("uses only currently available achievements in release totals", () => {
    expect(TOTAL_ACHIEVEMENT_COUNT).toBe(1);
  });

  it("cannot unlock, persist, notify, or Steam-sync unavailable achievements", () => {
    useAchievementStore
      .getState()
      .checkAndUnlock({ currentWeek: 2, currentSeason: 1 } as GameState);

    const state = useAchievementStore.getState();
    expect([...state.unlockedAchievements]).toEqual(["first-week"]);
    expect(state.pendingToasts).toEqual(["first-week"]);
    expect(Object.keys(state.unlockRecords)).toEqual(["first-week"]);
    expect(Object.keys(state.progressCache)).toEqual(["first-week"]);
    expect(JSON.parse(mocks.storage.get("talentscout_achievements") ?? "[]"))
      .toEqual(["first-week"]);
    expect(mocks.unlockAchievement).toHaveBeenCalledTimes(1);
    expect(mocks.unlockAchievement).toHaveBeenCalledWith("FIRST_WEEK");
  });
});
