/**
 * Relegation and promotion system for end-of-season league dynamics.
 *
 * At the end of each season, at every adjacent league boundary:
 *  - Bottom 3 clubs in the upper league get relegated:
 *      reputation -10, budget -20%, 30% chance per player to become transfer-listed.
 *  - Top 3 clubs in the lower league get promoted:
 *      reputation +10, budget +15%.
 *
 * Standings-based pricing modifiers:
 *  - Bottom 5 clubs in any league: player prices -10%
 *  - Top 3 clubs in any league: player prices +10%
 *
 * Design notes:
 *  - Pure functions: no mutations, no side effects.
 *  - All randomness flows through the RNG instance.
 *  - Club.leagueId and both League.clubIds collections change atomically.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Club,
  Player,
  League,
  Fixture,
  StandingEntry,
  InboxMessage,
} from "@/engine/core/types";
import {
  buildStandings,
  buildStandingsByLeague,
  type StandingsByLeague,
} from "@/engine/core/standings";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface RelegationEvent {
  clubId: string;
  clubName: string;
  /** League the club competed in during the completed season. */
  fromLeagueId: string;
  /** League the club will compete in next season. */
  toLeagueId: string;
  type: "relegated" | "promoted";
  reputationChange: number;
  budgetMultiplier: number;
}

export interface RelegationResult {
  /** Season whose final standings produced this result. */
  season: number;
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
      b.goalsFor - a.goalsFor ||
      a.clubId.localeCompare(b.clubId),
  );
}

/**
 * Get sorted standings for a league.
 */
function getLeagueStandingsSorted(
  league: League,
  state: GameState,
  standingsByLeague?: StandingsByLeague,
): StandingEntry[] {
  const standingsMap = standingsByLeague?.[league.id]
    ?? buildStandings(
      league.id,
      state.fixtures,
      state.clubs,
      state.currentSeason,
    );
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
 * Find the adjacent league for promotion/relegation within the same country.
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
  const standingsByLeague = buildStandingsByLeague(
    state.fixtures,
    state.clubs,
    state.currentSeason,
  );

  const upperLeagues = Object.values(state.leagues)
    .filter((league) =>
      findPairedLeague(league, state.leagues, league.tier + 1) !== null,
    )
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        a.tier - b.tier ||
        a.id.localeCompare(b.id),
    );

  for (const upperLeague of upperLeagues) {
    const lowerLeague = findPairedLeague(
      upperLeague,
      state.leagues,
      upperLeague.tier + 1,
    );
    if (!lowerLeague) continue;

    const upperStandings = getLeagueStandingsSorted(upperLeague, state, standingsByLeague);
    const lowerStandings = getLeagueStandingsSorted(lowerLeague, state, standingsByLeague);
    // Secondary talent-pool leagues deliberately have no fixtures. They must
    // not move clubs based on an all-zero alphabetical pseudo-table.
    if (
      !upperStandings.some((entry) => entry.played > 0) ||
      !lowerStandings.some((entry) => entry.played > 0)
    ) {
      continue;
    }
    const movementCount = Math.min(
      RELEGATION_ZONE_SIZE,
      PROMOTION_ZONE_SIZE,
      upperStandings.length,
      lowerStandings.length,
    );
    if (movementCount === 0) continue;

    for (const entry of upperStandings.slice(-movementCount)) {
      const club = state.clubs[entry.clubId];
      if (!club) continue;

      events.push({
        clubId: club.id,
        clubName: club.name,
        fromLeagueId: upperLeague.id,
        toLeagueId: lowerLeague.id,
        type: "relegated",
        reputationChange: -RELEGATION_REPUTATION_PENALTY,
        budgetMultiplier: RELEGATION_BUDGET_MULTIPLIER,
      });

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
        body: `${club.name} finished in the bottom ${movementCount} of ${upperLeague.name} and will compete in ${lowerLeague.name} next season. Players may become available at reduced prices.`,
        read: false,
        actionRequired: false,
        relatedId: club.id,
      });
    }

    for (const entry of lowerStandings.slice(0, movementCount)) {
      const club = state.clubs[entry.clubId];
      if (!club) continue;

      events.push({
        clubId: club.id,
        clubName: club.name,
        fromLeagueId: lowerLeague.id,
        toLeagueId: upperLeague.id,
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
        body: `${club.name} finished in the top ${movementCount} of ${lowerLeague.name} and will compete in ${upperLeague.name} next season. They'll be looking to strengthen their squad.`,
        read: false,
        actionRequired: false,
        relatedId: club.id,
      });
    }
  }

  return {
    season: state.currentSeason,
    events,
    flaggedPlayerIds: [...new Set(flaggedPlayerIds)],
    messages,
  };
}

/**
 * Resolve promotion and relegation from the completed table, including match
 * results produced by the current weekly tick but not yet committed to state.
 * This prevents the final round from being silently excluded at rollover.
 */
export function processRelegationPromotionIncludingFixtures(
  state: GameState,
  fixturesPlayedThisTick: readonly Fixture[],
  rng: RNG,
): RelegationResult {
  if (fixturesPlayedThisTick.length === 0) {
    return processRelegationPromotion(state, rng);
  }

  const completedFixtures = { ...state.fixtures };
  for (const fixture of fixturesPlayedThisTick) {
    completedFixtures[fixture.id] = fixture;
  }

  return processRelegationPromotion(
    { ...state, fixtures: completedFixtures },
    rng,
  );
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
): {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  leagues: Record<string, League>;
} {
  const updatedClubs = { ...state.clubs };
  const updatedPlayers = { ...state.players };
  const updatedLeagues = Object.fromEntries(
    Object.entries(state.leagues).map(([id, league]) => [
      id,
      { ...league, clubIds: [...league.clubIds] },
    ]),
  );
  const appliedRelegatedClubIds = new Set<string>();

  // Apply league membership, reputation, and budget in one transaction. A
  // replayed result is a no-op because the club is no longer in fromLeagueId.
  for (const event of result.events) {
    const club = updatedClubs[event.clubId];
    const fromLeague = updatedLeagues[event.fromLeagueId];
    const toLeague = updatedLeagues[event.toLeagueId];
    if (!club || !fromLeague || !toLeague) continue;
    if (club.leagueId !== event.fromLeagueId) continue;

    const newReputation = Math.max(
      MIN_CLUB_REPUTATION,
      Math.min(MAX_CLUB_REPUTATION, club.reputation + event.reputationChange),
    );
    const newBudget = Math.round(club.budget * event.budgetMultiplier);

    updatedClubs[event.clubId] = {
      ...club,
      leagueId: event.toLeagueId,
      reputation: newReputation,
      budget: newBudget,
    };

    fromLeague.clubIds = fromLeague.clubIds.filter((id) => id !== club.id);
    if (!toLeague.clubIds.includes(club.id)) {
      toLeague.clubIds = [...toLeague.clubIds, club.id];
    }
    if (event.type === "relegated") {
      appliedRelegatedClubIds.add(club.id);
    }
  }

  // Flag players at relegated clubs: lower morale to make them transfer-eligible
  for (const playerId of result.flaggedPlayerIds) {
    const player = updatedPlayers[playerId];
    if (!player) continue;
    const owningClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    if (!appliedRelegatedClubIds.has(owningClubId)) continue;

    updatedPlayers[playerId] = {
      ...player,
      morale: Math.max(1, player.morale - 3), // Drop morale significantly
    };
  }

  return { clubs: updatedClubs, players: updatedPlayers, leagues: updatedLeagues };
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
  standingsByLeague?: StandingsByLeague,
): number {
  const club = state.clubs[clubId];
  if (!club) return 1.0;

  const league = state.leagues[club.leagueId];
  if (!league) return 1.0;

  const standings = getLeagueStandingsSorted(league, state, standingsByLeague);
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
  _leagueTier: number,
  hasLowerTier: boolean,
  hasUpperTier: boolean,
): StandingZone {
  // Top clubs in any non-top division with an adjacent upper league.
  if (hasUpperTier && position < PROMOTION_ZONE_SIZE) {
    return "promotion";
  }

  // Bottom clubs only show as relegation candidates when a real lower league
  // exists. This keeps the UI aligned with the structural world transition.
  if (hasLowerTier && position >= totalClubs - RELEGATION_ZONE_SIZE) {
    return "relegation";
  }

  return "normal";
}
