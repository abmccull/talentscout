/**
 * Week Preview — generates a preview of the upcoming week's fixtures,
 * highlighting matches featuring tracked/targeted players and suggesting
 * an optimal schedule.
 *
 * Pure engine module: no React imports, no side effects.
 */

import type {
  GameState,
  Fixture,
  Player,
  Club,
  Activity,
  ManagerDirective,
} from "./types";
import { ACTIVITY_SLOT_COSTS } from "./calendar";
import { isScoutAbroad } from "../world/travel";

// =============================================================================
// Types (F16)
// =============================================================================

/** A fixture that features a player of interest to the scout. */
export interface PreviewMatch {
  fixtureId: string;
  homeClubId: string;
  awayClubId: string;
  leagueId: string;
  /** Player IDs from the scout's watchlist appearing in this fixture. */
  watchlistPlayerIds: string[];
  /** Player IDs relevant to active manager directives in this fixture. */
  directivePlayerIds: string[];
  /** Combined relevance score (higher = more important to attend). */
  relevanceScore: number;
}

/** Congestion level for the week. */
export type CongestionLevel = "light" | "moderate" | "heavy";

/** A suggestion for a single day slot in the schedule. */
export interface ScheduleSuggestion {
  dayIndex: number;
  activity: Activity;
  reason: string;
}

/** Priority weights the player can set for schedule suggestions. */
export interface SchedulePriorities {
  /** Weight given to watching tracked/targeted players (0-1). */
  watchlistWeight: number;
  /** Weight given to fulfilling manager directives (0-1). */
  directiveWeight: number;
  /** Weight given to rest/fatigue recovery (0-1). */
  restWeight: number;
}

/** Complete week preview result from generateWeekPreview. */
export interface WeekPreview {
  /** Fixtures featuring players of interest, sorted by relevance. */
  relevantMatches: PreviewMatch[];
  /** Total number of fixtures this week across all leagues. */
  totalFixtures: number;
  /** Congestion level based on fixture density. */
  congestion: CongestionLevel;
  /** Whether the scout should consider resting based on fatigue. */
  fatigueWarning: boolean;
  /** Whether the scout is abroad this week. */
  isAbroad: boolean;
  /** Suggested schedule with reasons. */
  suggestions: ScheduleSuggestion[];
}

// =============================================================================
// Constants
// =============================================================================

/** Fatigue threshold above which a rest warning is generated. */
const FATIGUE_WARNING_THRESHOLD = 60;

/** Number of fixtures considered "heavy" congestion. */
const HEAVY_CONGESTION_THRESHOLD = 10;

/** Number of fixtures considered "moderate" congestion. */
const MODERATE_CONGESTION_THRESHOLD = 5;

/** Maximum number of match suggestions per week to avoid overwhelming the UI. */
const MAX_MATCH_SUGGESTIONS = 3;

/** Default priorities if none specified. */
const DEFAULT_PRIORITIES: SchedulePriorities = {
  watchlistWeight: 0.5,
  directiveWeight: 0.4,
  restWeight: 0.1,
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a lookup: clubId -> set of playerIds belonging to that club.
 */
function buildClubPlayerIndex(
  players: Record<string, Player>,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const player of Object.values(players)) {
    let set = index.get(player.clubId);
    if (!set) {
      set = new Set();
      index.set(player.clubId, set);
    }
    set.add(player.id);
  }
  return index;
}

/**
 * Find all player IDs from a given set that belong to either club in a fixture.
 */
function findPlayersInFixture(
  fixture: Fixture,
  targetPlayerIds: Set<string>,
  clubPlayerIndex: Map<string, Set<string>>,
): string[] {
  const found: string[] = [];
  const homePlayerIds = clubPlayerIndex.get(fixture.homeClubId);
  const awayPlayerIds = clubPlayerIndex.get(fixture.awayClubId);

  for (const pid of targetPlayerIds) {
    if (homePlayerIds?.has(pid) || awayPlayerIds?.has(pid)) {
      found.push(pid);
    }
  }
  return found;
}

/**
 * Collect player IDs relevant to unfulfilled manager directives.
 * These are players at clubs whose positions match what the directive asks for.
 */
function getDirectiveRelevantPlayerIds(
  directives: ManagerDirective[],
  players: Record<string, Player>,
): Set<string> {
  const activeDirectives = directives.filter((d) => !d.fulfilled);
  if (activeDirectives.length === 0) return new Set();

  const result = new Set<string>();
  for (const player of Object.values(players)) {
    for (const directive of activeDirectives) {
      // Check position match
      const posMatch =
        player.position === directive.position ||
        player.secondaryPositions.includes(directive.position);
      if (!posMatch) continue;

      // Check age range
      const [minAge, maxAge] = directive.ageRange;
      if (player.age < minAge || player.age > maxAge) continue;

      result.add(player.id);
    }
  }
  return result;
}

/**
 * Calculate the congestion level from the number of fixtures.
 */
function calculateCongestion(fixtureCount: number): CongestionLevel {
  if (fixtureCount >= HEAVY_CONGESTION_THRESHOLD) return "heavy";
  if (fixtureCount >= MODERATE_CONGESTION_THRESHOLD) return "moderate";
  return "light";
}

/**
 * Compute a relevance score for a preview match based on the number and
 * type of interesting players in it.
 */
function computeRelevanceScore(
  watchlistCount: number,
  directiveCount: number,
): number {
  // Watchlist players are the scout's direct interest — high value.
  // Directive players satisfy club needs — also high value.
  return watchlistCount * 3 + directiveCount * 2;
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Generate a preview of the upcoming week, highlighting matches with
 * tracked players, directive-relevant players, fixture congestion,
 * and travel status.
 */
export function generateWeekPreview(state: GameState): WeekPreview {
  const { currentWeek, scout, fixtures, players, watchlist, managerDirectives } =
    state;

  // 1. Get this week's unplayed fixtures
  const weekFixtures = Object.values(fixtures).filter(
    (f) => f.week === currentWeek && !f.played,
  );

  // 2. Build lookup indexes
  const clubPlayerIndex = buildClubPlayerIndex(players);
  const watchlistSet = new Set(watchlist ?? []);
  const directivePlayerIds = getDirectiveRelevantPlayerIds(
    managerDirectives ?? [],
    players,
  );

  // 3. Score each fixture
  const relevantMatches: PreviewMatch[] = [];

  for (const fixture of weekFixtures) {
    const watchlistInFixture = findPlayersInFixture(
      fixture,
      watchlistSet,
      clubPlayerIndex,
    );
    const directiveInFixture = findPlayersInFixture(
      fixture,
      directivePlayerIds,
      clubPlayerIndex,
    );

    // Only include fixtures with at least one interesting player
    if (watchlistInFixture.length > 0 || directiveInFixture.length > 0) {
      relevantMatches.push({
        fixtureId: fixture.id,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        leagueId: fixture.leagueId,
        watchlistPlayerIds: watchlistInFixture,
        directivePlayerIds: directiveInFixture,
        relevanceScore: computeRelevanceScore(
          watchlistInFixture.length,
          directiveInFixture.length,
        ),
      });
    }
  }

  // Sort by relevance descending
  relevantMatches.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // 4. Calculate congestion and fatigue warning
  const congestion = calculateCongestion(weekFixtures.length);
  const fatigueWarning = scout.fatigue >= FATIGUE_WARNING_THRESHOLD;
  const abroad = isScoutAbroad(scout, currentWeek);

  // 5. Generate schedule suggestions
  const suggestions = suggestOptimalSchedule(state, DEFAULT_PRIORITIES);

  return {
    relevantMatches,
    totalFixtures: weekFixtures.length,
    congestion,
    fatigueWarning,
    isAbroad: abroad,
    suggestions,
  };
}

/**
 * Suggest an optimal schedule for the week based on priorities.
 *
 * Algorithm:
 *  1. If fatigue is high, suggest rest on day 0.
 *  2. Fill remaining slots with the most relevant match activities.
 *  3. If still open slots, suggest study or video.
 *
 * Returns an array of suggestions that can be applied one-click.
 */
export function suggestOptimalSchedule(
  state: GameState,
  priorities: SchedulePriorities = DEFAULT_PRIORITIES,
): ScheduleSuggestion[] {
  const { currentWeek, scout, fixtures, players, watchlist, managerDirectives, clubs, schedule } =
    state;

  const suggestions: ScheduleSuggestion[] = [];
  const slotCost = ACTIVITY_SLOT_COSTS.attendMatch;

  // Track which day slots are already occupied
  const occupied = new Set<number>();
  const activities = schedule.activities ?? [];
  for (let i = 0; i < 7; i++) {
    if (activities[i] !== null) {
      occupied.add(i);
    }
  }

  // 1. If fatigue is high and rest is a priority, suggest rest first
  if (scout.fatigue >= FATIGUE_WARNING_THRESHOLD && priorities.restWeight > 0) {
    const restDay = findFirstFreeSlot(occupied, 1);
    if (restDay !== -1) {
      suggestions.push({
        dayIndex: restDay,
        activity: {
          type: "rest",
          slots: 1,
          description: "Take a day off to rest and recover fatigue",
        },
        reason: `Fatigue at ${Math.round(scout.fatigue)}% — rest recommended`,
      });
      markSlotsOccupied(occupied, restDay, 1);
    }
  }

  // 2. Get relevant matches and suggest attending the top ones
  const weekFixtures = Object.values(fixtures).filter(
    (f) => f.week === currentWeek && !f.played,
  );
  const clubPlayerIndex = buildClubPlayerIndex(players);
  const watchlistSet = new Set(watchlist ?? []);
  const directivePlayerIds = getDirectiveRelevantPlayerIds(
    managerDirectives ?? [],
    players,
  );

  // Score and sort fixtures by interest
  const scoredFixtures: Array<{
    fixture: Fixture;
    watchlistNames: string[];
    directiveNames: string[];
    score: number;
  }> = [];

  for (const fixture of weekFixtures) {
    // Skip already-scheduled fixtures
    const alreadyScheduled = activities.some(
      (a) => a !== null && a.type === "attendMatch" && a.targetId === fixture.id,
    );
    if (alreadyScheduled) continue;

    const watchlistInFixture = findPlayersInFixture(fixture, watchlistSet, clubPlayerIndex);
    const directiveInFixture = findPlayersInFixture(fixture, directivePlayerIds, clubPlayerIndex);

    const score =
      watchlistInFixture.length * 3 * priorities.watchlistWeight +
      directiveInFixture.length * 2 * priorities.directiveWeight;

    if (score > 0) {
      scoredFixtures.push({
        fixture,
        watchlistNames: watchlistInFixture.map((pid) => {
          const p = players[pid];
          return p ? `${p.firstName} ${p.lastName}` : pid.slice(0, 8);
        }),
        directiveNames: directiveInFixture.map((pid) => {
          const p = players[pid];
          return p ? `${p.firstName} ${p.lastName}` : pid.slice(0, 8);
        }),
        score,
      });
    }
  }

  scoredFixtures.sort((a, b) => b.score - a.score);

  // Suggest top matches
  let matchSuggestions = 0;
  for (const sf of scoredFixtures) {
    if (matchSuggestions >= MAX_MATCH_SUGGESTIONS) break;

    const dayIndex = findFirstFreeSlot(occupied, slotCost);
    if (dayIndex === -1) break;

    const home = clubs[sf.fixture.homeClubId];
    const away = clubs[sf.fixture.awayClubId];
    const homeName = home?.shortName ?? "???";
    const awayName = away?.shortName ?? "???";

    // Build reason text
    const reasons: string[] = [];
    if (sf.watchlistNames.length > 0) {
      reasons.push(`watchlist: ${sf.watchlistNames.join(", ")}`);
    }
    if (sf.directiveNames.length > 0) {
      reasons.push(`directive target: ${sf.directiveNames.join(", ")}`);
    }

    suggestions.push({
      dayIndex,
      activity: {
        type: "attendMatch",
        slots: slotCost,
        targetId: sf.fixture.id,
        description: `Scout: ${homeName} vs ${awayName}`,
      },
      reason: reasons.join(" | "),
    });

    markSlotsOccupied(occupied, dayIndex, slotCost);
    matchSuggestions++;
  }

  return suggestions;
}

// =============================================================================
// Internal helpers for schedule suggestion
// =============================================================================

/**
 * Find the first day index that can fit an activity with the given slot cost.
 */
function findFirstFreeSlot(occupied: Set<number>, slotCost: number): number {
  for (let i = 0; i <= 7 - slotCost; i++) {
    let fits = true;
    for (let j = 0; j < slotCost; j++) {
      if (occupied.has(i + j)) {
        fits = false;
        break;
      }
    }
    if (fits) return i;
  }
  return -1;
}

/**
 * Mark slots as occupied (mutates the set — only used for ephemeral
 * schedule-building, never touches game state).
 */
function markSlotsOccupied(
  occupied: Set<number>,
  startIndex: number,
  slotCost: number,
): void {
  for (let j = 0; j < slotCost; j++) {
    occupied.add(startIndex + j);
  }
}
