/**
 * Relegation and promotion system for end-of-season league dynamics.
 *
 * At the end of each season:
 *  - Bottom 3 clubs in top-tier (tier 1) leagues get relegated:
 *      reputation -10, budget -20%, 30% chance per player to become transfer-listed.
 *  - Top 3 clubs in second-tier (tier 2) leagues get promoted:
 *      reputation +10, budget +15%.
 *  - Countries with no tier 2 league still penalize bottom clubs in tier 1.
 *
 * Standings-based pricing modifiers:
 *  - Bottom 5 clubs in any league: player prices -10%
 *  - Top 3 clubs in any league: player prices +10%
 *
 * Design notes:
 *  - Pure functions: no mutations, no side effects.
 *  - All randomness flows through the RNG instance.
 *  - Does not move clubs between leagues -- only adjusts reputation, budget,
 *    and player transfer availability flags.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Club,
  Player,
  League,
  StandingEntry,
  InboxMessage,
} from "@/engine/core/types";
import { buildStandings } from "@/engine/core/standings";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface RelegationEvent {
  clubId: string;
  clubName: string;
  leagueId: string;
  type: "relegated" | "promoted";
  reputationChange: number;
  budgetMultiplier: number;
}

export interface RelegationResult {
  events: RelegationEvent[];
  /** Player IDs flagged as available for transfer due to relegation. */
  flaggedPlayerIds: string[];
  messages: InboxMessage[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RELEGATION_ZONE_SIZE = 3;
const PROMOTION_ZONE_SIZE = 3;

const RELEGATION_REPUTATION_PENALTY = 10;
const PROMOTION_REPUTATION_BONUS = 10;

const RELEGATION_BUDGET_MULTIPLIER = 0.80; // lose 20%
const PROMOTION_BUDGET_MULTIPLIER = 1.15;  // gain 15%

const MIN_CLUB_REPUTATION = 10;
const MAX_CLUB_REPUTATION = 95;

/** Probability each player at a relegated club becomes transfer-listed. */
const RELEGATION_TRANSFER_FLAG_CHANCE = 0.30;

// =============================================================================
// STANDINGS HELPERS
// =============================================================================

/**
 * Sort standings entries by points (desc), goal difference (desc), goals for (desc).
 */
function sortStandings(entries: StandingEntry[]): StandingEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor,
  );
}

/**
 * Get sorted standings for a league.
 */
function getLeagueStandingsSorted(
  league: League,
  state: GameState,
): StandingEntry[] {
  const standingsMap = buildStandings(league.id, state.fixtures, state.clubs);
  return sortStandings(Object.values(standingsMap));
}

// =============================================================================
// CORE LOGIC
// =============================================================================

/**
 * Generate a unique message ID for relegation/promotion messages.
 */
function makeMessageId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `msg_${prefix}_${id}`;
}

/**
 * Find the paired league for promotion/relegation within the same country.
 *
 * For a tier 1 league, returns the tier 2 league in the same country (if any).
 * For a tier 2 league, returns the tier 1 league in the same country (if any).
 */
function findPairedLeague(
  league: League,
  leagues: Record<string, League>,
  targetTier: number,
): League | null {
  for (const other of Object.values(leagues)) {
    if (other.country === league.country && other.tier === targetTier) {
      return other;
    }
  }
  return null;
}

/**
 * Process end-of-season relegation and promotion for all leagues.
 *
 * This is the main entry point. Call it at season end, after standings
 * are finalized.
 *
 * @param state - Current game state (not mutated).
 * @param rng   - Seeded RNG for player flagging randomness.
 * @returns     - RelegationResult with all events and messages.
 */
export function processRelegationPromotion(
  state: GameState,
  rng: RNG,
): RelegationResult {
  const events: RelegationEvent[] = [];
  const flaggedPlayerIds: string[] = [];
  const messages: InboxMessage[] = [];

  // Track which leagues we've already processed to avoid double-processing
  const processedLeagueIds = new Set<string>();

  for (const league of Object.values(state.leagues)) {
    if (processedLeagueIds.has(league.id)) continue;

    if (league.tier === 1) {
      processedLeagueIds.add(league.id);

      const standings = getLeagueStandingsSorted(league, state);
      if (standings.length < RELEGATION_ZONE_SIZE) continue;

      // Bottom 3 get relegated
      const relegated = standings.slice(-RELEGATION_ZONE_SIZE);
      for (const entry of relegated) {
        const club = state.clubs[entry.clubId];
        if (!club) continue;

        events.push({
          clubId: club.id,
          clubName: club.name,
          leagueId: league.id,
          type: "relegated",
          reputationChange: -RELEGATION_REPUTATION_PENALTY,
          budgetMultiplier: RELEGATION_BUDGET_MULTIPLIER,
        });

        // Flag players for transfer
        for (const playerId of club.playerIds) {
          if (rng.chance(RELEGATION_TRANSFER_FLAG_CHANCE)) {
            flaggedPlayerIds.push(playerId);
          }
        }

        messages.push({
          id: makeMessageId("relegation", rng),
          week: state.currentWeek,
          season: state.currentSeason,
          type: "news",
          title: `${club.name} has been relegated!`,
          body: `${club.name} finished in the bottom ${RELEGATION_ZONE_SIZE} of ${league.name} and has been relegated. Players may become available at reduced prices.`,
          read: false,
          actionRequired: false,
          relatedId: club.id,
        });
      }

      // Check for a tier 2 league in the same country for promotion
      const tier2League = findPairedLeague(league, state.leagues, 2);
      if (tier2League) {
        processedLeagueIds.add(tier2League.id);

        const tier2Standings = getLeagueStandingsSorted(tier2League, state);
        if (tier2Standings.length < PROMOTION_ZONE_SIZE) continue;

        // Top 3 get promoted
        const promoted = tier2Standings.slice(0, PROMOTION_ZONE_SIZE);
        for (const entry of promoted) {
          const club = state.clubs[entry.clubId];
          if (!club) continue;

          events.push({
            clubId: club.id,
            clubName: club.name,
            leagueId: tier2League.id,
            type: "promoted",
            reputationChange: PROMOTION_REPUTATION_BONUS,
            budgetMultiplier: PROMOTION_BUDGET_MULTIPLIER,
          });

          messages.push({
            id: makeMessageId("promotion", rng),
            week: state.currentWeek,
            season: state.currentSeason,
            type: "news",
            title: `${club.name} promoted!`,
            body: `${club.name} finished in the top ${PROMOTION_ZONE_SIZE} of ${tier2League.name} and has been promoted! They'll be looking to strengthen their squad.`,
            read: false,
            actionRequired: false,
            relatedId: club.id,
          });
        }
      }
    }
  }

  return { events, flaggedPlayerIds, messages };
}

/**
 * Apply relegation/promotion results to game state.
 *
 * Updates club reputation and budget, and flags players for transfer
 * by lowering their morale (which makes them transfer-eligible in the
 * existing AI transfer system).
 *
 * @param state  - Current game state (not mutated).
 * @param result - RelegationResult from processRelegationPromotion.
 * @returns      - New clubs and players records with changes applied.
 */
export function applyRelegationResult(
  state: GameState,
  result: RelegationResult,
): { clubs: Record<string, Club>; players: Record<string, Player> } {
  const updatedClubs = { ...state.clubs };
  const updatedPlayers = { ...state.players };

  // Apply club reputation and budget changes
  for (const event of result.events) {
    const club = updatedClubs[event.clubId];
    if (!club) continue;

    const newReputation = Math.max(
      MIN_CLUB_REPUTATION,
      Math.min(MAX_CLUB_REPUTATION, club.reputation + event.reputationChange),
    );
    const newBudget = Math.round(club.budget * event.budgetMultiplier);

    updatedClubs[event.clubId] = {
      ...club,
      reputation: newReputation,
      budget: newBudget,
    };
  }

  // Flag players at relegated clubs: lower morale to make them transfer-eligible
  for (const playerId of result.flaggedPlayerIds) {
    const player = updatedPlayers[playerId];
    if (!player) continue;

    updatedPlayers[playerId] = {
      ...player,
      morale: Math.max(1, player.morale - 3), // Drop morale significantly
    };
  }

  return { clubs: updatedClubs, players: updatedPlayers };
}

// =============================================================================
// STANDINGS-BASED PRICING
// =============================================================================

/**
 * Get the standings-based price modifier for a club.
 *
 * - Bottom 5 in their league: -10% (returns 0.90)
 * - Top 3 in their league: +10% (returns 1.10)
 * - Otherwise: no modifier (returns 1.00)
 *
 * @param clubId   - The club to check.
 * @param state    - Current game state.
 * @returns        - Price multiplier (0.90, 1.00, or 1.10).
 */
export function getStandingsPriceModifier(
  clubId: string,
  state: GameState,
): number {
  const club = state.clubs[clubId];
  if (!club) return 1.0;

  const league = state.leagues[club.leagueId];
  if (!league) return 1.0;

  const standings = getLeagueStandingsSorted(league, state);
  if (standings.length === 0) return 1.0;

  const position = standings.findIndex((s) => s.clubId === clubId);
  if (position === -1) return 1.0;

  // Top 3 = premium
  if (position < 3) return 1.10;

  // Bottom 5 = discount
  if (position >= standings.length - 5) return 0.90;

  return 1.0;
}

// =============================================================================
// ZONE CLASSIFICATION (for UI display)
// =============================================================================

export type StandingZone = "promotion" | "relegation" | "normal";

/**
 * Classify a club's position in the standings for UI display purposes.
 *
 * @param position     - 0-based position in sorted standings.
 * @param totalClubs   - Total number of clubs in the league.
 * @param leagueTier   - The tier of the league (1 = top, 2 = second, etc.).
 * @param hasLowerTier - Whether a lower tier league exists in the same country.
 * @param hasUpperTier - Whether an upper tier league exists in the same country.
 * @returns            - Zone classification for coloring in the UI.
 */
export function classifyStandingZone(
  position: number,
  totalClubs: number,
  leagueTier: number,
  hasLowerTier: boolean,
  hasUpperTier: boolean,
): StandingZone {
  // Top 3 in tier 2 with a tier 1 league = promotion zone
  if (leagueTier === 2 && hasUpperTier && position < PROMOTION_ZONE_SIZE) {
    return "promotion";
  }

  // Bottom 3 in tier 1 with a tier 2 league = relegation zone
  // Also apply relegation zone even without tier 2 (just reputation penalty)
  if (leagueTier === 1 && position >= totalClubs - RELEGATION_ZONE_SIZE) {
    return "relegation";
  }

  return "normal";
}
