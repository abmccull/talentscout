/**
 * Achievement store — tracks which achievements have been unlocked and
 * manages a queue of toast notifications for newly earned achievements.
 *
 * `unlockedAchievements` is persisted to localStorage so progress carries
 * across sessions.
 */

import { create } from "zustand";
import type { GameState } from "@/engine/core/types";
import { ACHIEVEMENTS, checkAchievements } from "@/lib/achievements";

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = "talentscout_achievements";

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

// =============================================================================
// STORE SHAPE
// =============================================================================

export interface AchievementState {
  /** Set of achievement IDs that have been unlocked. Persisted to localStorage. */
  unlockedAchievements: Set<string>;
  /** Queue of achievement IDs waiting to be shown as toast notifications. */
  pendingToasts: string[];

  /**
   * Run all achievement checks against the provided game state.
   * Any newly unlocked achievements are added to both `unlockedAchievements`
   * and `pendingToasts`.
   */
  checkAndUnlock: (state: GameState) => void;

  /**
   * Remove the given achievement ID from the pending toast queue.
   * Called after the toast has been displayed and auto-dismissed.
   */
  dismissToast: (id: string) => void;

  /** Returns true if the given achievement ID has been unlocked. */
  isUnlocked: (id: string) => boolean;

  /** Reset all achievements (useful for debugging / new game). */
  reset: () => void;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

// Read from localStorage at module evaluation time (browser-only, safe after
// hydration).
const persisted = readPersistedAchievements();

export const useAchievementStore = create<AchievementState>((set, get) => ({
  unlockedAchievements: persisted,
  pendingToasts: [],

  checkAndUnlock(state: GameState) {
    const { unlockedAchievements } = get();

    // Determine which achievements are currently satisfied.
    const satisfied = checkAchievements(state);

    // Filter to only those not yet unlocked.
    const newlyUnlocked = satisfied.filter(
      (id) => !unlockedAchievements.has(id),
    );

    if (newlyUnlocked.length === 0) return;

    // Build the updated set.
    const next = new Set(unlockedAchievements);
    for (const id of newlyUnlocked) {
      next.add(id);
    }

    // Persist to localStorage.
    writePersistedAchievements(next);

    set((prev) => ({
      unlockedAchievements: next,
      pendingToasts: [...prev.pendingToasts, ...newlyUnlocked],
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

  reset() {
    writePersistedAchievements(new Set());
    set({ unlockedAchievements: new Set(), pendingToasts: [] });
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
