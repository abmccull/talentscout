/**
 * Achievement Engine — pure engine module for evaluating achievement conditions.
 *
 * No React imports. All functions are pure: state in, data out.
 *
 * This module provides:
 *  - `evaluateAchievements(state)` — checks all achievement conditions against game state
 *  - `getAchievementProgress(state, achievementId)` — returns progress toward an achievement
 *  - `unlockAchievement(state, achievementId)` — marks achievement as unlocked with timestamp
 *
 * Achievement definitions live in `src/lib/achievements.ts` (shared with UI).
 * This engine module is purely for evaluation logic that can be called from
 * the game loop without any UI dependencies.
 */

import type { GameState, Position } from "./types";

// =============================================================================
// TYPES
// =============================================================================

/** Rarity tiers for achievements, based on how hard they are to earn. */
export type AchievementRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Progress information for a multi-step achievement. */
export interface AchievementProgress {
  /** Current progress value. */
  current: number;
  /** Target value required to unlock. */
  target: number;
  /** Progress as a percentage 0–100. */
  percentage: number;
}

/** Result of evaluating a single achievement condition. */
export interface AchievementEvaluation {
  achievementId: string;
  satisfied: boolean;
  progress?: AchievementProgress;
}

/** Timestamp record for when an achievement was unlocked. */
export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: number; // Unix timestamp ms
  week: number;
  season: number;
}

// =============================================================================
// PROGRESS EVALUATION HELPERS
// =============================================================================

/**
 * Compute progress toward a numeric threshold achievement.
 * Returns an AchievementProgress with current, target, and percentage.
 */
function numericProgress(current: number, target: number): AchievementProgress {
  return {
    current: Math.min(current, target),
    target,
    percentage: Math.min(100, Math.round((current / target) * 100)),
  };
}

// =============================================================================
// PROGRESS PREDICATES
// =============================================================================

/**
 * Map of achievement IDs to progress calculator functions.
 * Only achievements with meaningful multi-step progress are included.
 * Achievements that are binary (yes/no) are omitted.
 */
const PROGRESS_CALCULATORS: Record<
  string,
  (state: GameState) => AchievementProgress
> = {
  // Reports
  "reports-10": (s) => numericProgress(Object.keys(s.reports).length, 10),
  "reports-25": (s) => numericProgress(Object.keys(s.reports).length, 25),
  "reports-50": (s) => numericProgress(Object.keys(s.reports).length, 50),
  "reports-100": (s) => numericProgress(Object.keys(s.reports).length, 100),

  // Seasons
  "season-1": (s) => numericProgress(s.currentSeason - 1, 1),
  "season-3": (s) => numericProgress(s.currentSeason - 1, 3),
  "season-5": (s) => numericProgress(s.currentSeason - 1, 5),
  "season-10": (s) => numericProgress(s.currentSeason - 1, 10),

  // Countries
  "countries-3": (s) =>
    numericProgress(Object.keys(s.scout.countryReputations).length, 3),
  "countries-6": (s) =>
    numericProgress(Object.keys(s.scout.countryReputations).length, 6),
  "countries-10": (s) =>
    numericProgress(Object.keys(s.scout.countryReputations).length, 10),
  "countries-15": (s) =>
    numericProgress(Object.keys(s.scout.countryReputations).length, 15),

  // Alumni
  "alumni-5": (s) => numericProgress(s.alumniRecords.length, 5),
  "alumni-15": (s) => numericProgress(s.alumniRecords.length, 15),

  // Watchlist
  "watchlist-10": (s) => numericProgress(s.watchlist.length, 10),

  // Marathon
  "marathon": (s) =>
    numericProgress((s.currentSeason - 1) * 52 + s.currentWeek, 50),

  // Observations
  "observations-50": (s) =>
    numericProgress(Object.keys(s.observations).length, 50),
  "observations-200": (s) =>
    numericProgress(Object.keys(s.observations).length, 200),
  "observations-500": (s) =>
    numericProgress(Object.keys(s.observations).length, 500),

  // Matches
  "matches-25": (s) => numericProgress(s.playedFixtures.length, 25),
  "matches-50": (s) => numericProgress(s.playedFixtures.length, 50),
  "matches-100": (s) => numericProgress(s.playedFixtures.length, 100),

  // Contacts
  "contacts-5": (s) => numericProgress(
    Object.values(s.contacts).filter((c) => c.relationship >= 60).length,
    5,
  ),
  "contacts-15": (s) => numericProgress(
    Object.values(s.contacts).filter((c) => c.relationship >= 60).length,
    15,
  ),

  // Discovery
  "discoveries-5": (s) => numericProgress(s.discoveryRecords.length, 5),
  "discoveries-15": (s) => numericProgress(s.discoveryRecords.length, 15),

  // Reputation
  "rep-50": (s) => numericProgress(s.scout.reputation, 50),
  "rep-75": (s) => numericProgress(s.scout.reputation, 75),
  "rep-100": (s) => numericProgress(s.scout.reputation, 100),

  // Financial
  "savings-100k": (s) =>
    numericProgress(s.finances?.balance ?? 0, 100_000),
  "savings-500k": (s) =>
    numericProgress(s.finances?.balance ?? 0, 500_000),

  // Speedrun
  "speedrun": (s) =>
    s.scout.careerTier >= 5
      ? numericProgress(10, 10)
      : numericProgress(s.scout.careerTier, 5),

  // Position coverage
  "full-house": (s) => {
    const ALL_POS: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
    const coveredPositions = new Set<string>();
    for (const report of Object.values(s.reports)) {
      const player = s.players[report.playerId];
      if (player) coveredPositions.add(player.position);
    }
    return numericProgress(coveredPositions.size, ALL_POS.length);
  },
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get the progress toward a specific achievement.
 * Returns undefined if the achievement has no meaningful progress tracking
 * (i.e. it is binary: locked or unlocked).
 */
export function getAchievementProgress(
  state: GameState,
  achievementId: string,
): AchievementProgress | undefined {
  const calculator = PROGRESS_CALCULATORS[achievementId];
  if (!calculator) return undefined;
  try {
    return calculator(state);
  } catch {
    return undefined;
  }
}

/**
 * Get the rarity tier for an achievement based on its ID.
 * Rarity is a static classification based on how difficult the achievement
 * is to earn — it does not change based on game state.
 */
export function getAchievementRarity(achievementId: string): AchievementRarity {
  // Legendary achievements — extremely difficult long-term goals
  const legendary = new Set([
    "season-10", "reports-100", "countries-15", "generational-talent",
    "dual-mastery", "rep-100", "savings-500k", "observations-500",
    "speedrun", "against-all-odds", "alumni-15",
  ]);

  // Epic achievements — hard goals requiring significant commitment
  const epic = new Set([
    "reach-tier-5", "season-5", "reports-50", "countries-10",
    "max-spec", "mastery-perk", "equipment-maxed", "all-continents",
    "matches-100", "contacts-15", "discoveries-15", "rep-75",
    "savings-100k", "full-house",
  ]);

  // Rare achievements — moderately difficult goals
  const rare = new Set([
    "reach-tier-4", "season-3", "reports-25", "countries-6",
    "high-accuracy", "alumni-5", "alumni-international", "secondary-spec",
    "all-perks-tree", "table-pound", "matches-50", "contacts-5",
    "discoveries-5", "observations-200",
  ]);

  // Uncommon achievements — early-to-mid game goals
  const uncommon = new Set([
    "reach-tier-2", "reach-tier-3", "season-1", "reports-10",
    "countries-3", "wonderkid-found", "rep-50", "home-mastery",
    "secondary-spec", "all-activities", "matches-25", "observations-50",
  ]);

  if (legendary.has(achievementId)) return "legendary";
  if (epic.has(achievementId)) return "epic";
  if (rare.has(achievementId)) return "rare";
  if (uncommon.has(achievementId)) return "uncommon";
  return "common";
}

/**
 * Rarity display configuration — colors and labels for each tier.
 */
export const RARITY_CONFIG: Record<
  AchievementRarity,
  { label: string; colorClass: string }
> = {
  common: { label: "Common", colorClass: "text-zinc-400" },
  uncommon: { label: "Uncommon", colorClass: "text-green-400" },
  rare: { label: "Rare", colorClass: "text-blue-400" },
  epic: { label: "Epic", colorClass: "text-purple-400" },
  legendary: { label: "Legendary", colorClass: "text-amber-400" },
};

/**
 * Create an unlock record for an achievement.
 * Pure function — returns a new AchievementUnlock object.
 */
export function createUnlockRecord(
  achievementId: string,
  week: number,
  season: number,
): AchievementUnlock {
  return {
    achievementId,
    unlockedAt: Date.now(),
    week,
    season,
  };
}
