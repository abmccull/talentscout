/**
 * Achievement store — tracks which achievements have been unlocked and
 * manages a queue of toast notifications for newly earned achievements.
 *
 * `unlockedAchievements` is persisted to localStorage so progress carries
 * across sessions. Also tracks unlock timestamps and achievement progress.
 */

import { create } from "zustand";
import type { GameState } from "@/engine/core/types";
import { ACHIEVEMENTS, checkAchievements } from "@/lib/achievements";
import { getSteam } from "@/lib/steam/steamInterface";
import { getSteamAchievementName } from "@/lib/steam/achievementMap";
import type { AchievementProgress, AchievementUnlock } from "@/engine/core/achievementEngine";
import { getAchievementProgress, createUnlockRecord } from "@/engine/core/achievementEngine";

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = "talentscout_achievements";
const UNLOCK_STORAGE_KEY = "talentscout_achievement_unlocks";

// =============================================================================
// PERSISTENCE HELPERS
// =============================================================================

function readPersistedAchievements(): Set<string> {
  try {
    if (typeof window === "undefined") return new Set();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writePersistedAchievements(unlocked: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    // localStorage unavailable — silently ignore.
  }
}

function readPersistedUnlocks(): Record<string, AchievementUnlock> {
  try {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, AchievementUnlock>;
  } catch {
    return {};
  }
}

function writePersistedUnlocks(unlocks: Record<string, AchievementUnlock>): void {
  try {
    localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(unlocks));
  } catch {
    // localStorage unavailable — silently ignore.
  }
}

// =============================================================================
// STORE SHAPE
// =============================================================================

export interface AchievementState {
  /** Set of achievement IDs that have been unlocked. Persisted to localStorage. */
  unlockedAchievements: Set<string>;
  /** Queue of achievement IDs waiting to be shown as toast notifications. */
  pendingToasts: string[];
  /** Unlock records with timestamps, keyed by achievement ID. */
  unlockRecords: Record<string, AchievementUnlock>;
  /** Cached progress data for in-progress achievements. */
  progressCache: Record<string, AchievementProgress>;

  /**
   * Run all achievement checks against the provided game state.
   * Any newly unlocked achievements are added to both `unlockedAchievements`
   * and `pendingToasts`. Progress is updated for all tracked achievements.
   */
  checkAndUnlock: (state: GameState) => void;

  /**
   * Remove the given achievement ID from the pending toast queue.
   * Called after the toast has been displayed and auto-dismissed.
   */
  dismissToast: (id: string) => void;

  /** Returns true if the given achievement ID has been unlocked. */
  isUnlocked: (id: string) => boolean;

  /** Get progress for a specific achievement. Returns undefined if not trackable. */
  getProgress: (id: string) => AchievementProgress | undefined;

  /** Reset all achievements (useful for debugging / new game). */
  reset: () => void;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

// Read from localStorage at module evaluation time (browser-only, safe after
// hydration).
const persisted = readPersistedAchievements();
const persistedUnlocks = readPersistedUnlocks();

export const useAchievementStore = create<AchievementState>((set, get) => ({
  unlockedAchievements: persisted,
  pendingToasts: [],
  unlockRecords: persistedUnlocks,
  progressCache: {},

  checkAndUnlock(state: GameState) {
    const { unlockedAchievements, unlockRecords } = get();

    // Determine which achievements are currently satisfied.
    const satisfied = checkAchievements(state);

    // Filter to only those not yet unlocked.
    const newlyUnlocked = satisfied.filter(
      (id) => !unlockedAchievements.has(id),
    );

    // Update progress cache for all achievements with progress tracking.
    const newProgressCache: Record<string, AchievementProgress> = {};
    for (const achievement of ACHIEVEMENTS) {
      if (unlockedAchievements.has(achievement.id) && !newlyUnlocked.includes(achievement.id)) {
        continue; // Skip already-unlocked achievements
      }
      const progress = getAchievementProgress(state, achievement.id);
      if (progress) {
        newProgressCache[achievement.id] = progress;
      }
    }

    if (newlyUnlocked.length === 0) {
      // Even if nothing new was unlocked, update progress cache.
      set({ progressCache: newProgressCache });
      return;
    }

    // Build the updated set.
    const next = new Set(unlockedAchievements);
    const updatedUnlocks = { ...unlockRecords };
    for (const id of newlyUnlocked) {
      next.add(id);
      updatedUnlocks[id] = createUnlockRecord(
        id,
        state.currentWeek,
        state.currentSeason,
      );
    }

    // Persist to localStorage.
    writePersistedAchievements(next);
    writePersistedUnlocks(updatedUnlocks);

    // Sync with Steam (no-op in web builds).
    const steam = getSteam();
    for (const id of newlyUnlocked) {
      const steamName = getSteamAchievementName(id);
      if (steamName) {
        steam.unlockAchievement(steamName);
      }
    }

    set((prev) => ({
      unlockedAchievements: next,
      pendingToasts: [...prev.pendingToasts, ...newlyUnlocked],
      unlockRecords: updatedUnlocks,
      progressCache: newProgressCache,
    }));
  },

  dismissToast(id: string) {
    set((prev) => ({
      pendingToasts: prev.pendingToasts.filter((toastId) => toastId !== id),
    }));
  },

  isUnlocked(id: string) {
    return get().unlockedAchievements.has(id);
  },

  getProgress(id: string) {
    return get().progressCache[id];
  },

  reset() {
    writePersistedAchievements(new Set());
    writePersistedUnlocks({});
    set({
      unlockedAchievements: new Set(),
      pendingToasts: [],
      unlockRecords: {},
      progressCache: {},
    });
  },
}));

// =============================================================================
// SELECTORS
// =============================================================================

/** Returns the count of unlocked achievements. */
export function selectUnlockedCount(state: AchievementState): number {
  return state.unlockedAchievements.size;
}

/** Returns the total achievement count. */
export const TOTAL_ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;
