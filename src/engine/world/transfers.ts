/**
 * Cross-league transfer simulation for the TalentScout world engine.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects, no I/O.
 *  - All randomness flows through the RNG instance passed in.
 *  - Mirrors the layered architecture of gameLoop.ts — helpers are private,
 *    public API is the three exported functions + the TransferResult type.
 *
 * Transfer flow model:
 *  - High-ability players (CA > 80) are eligible for cross-country moves.
 *  - Destination country is selected via a weighted flow matrix derived from
 *    real-world transfer patterns (Brazilian players to England/Spain, etc.).
 *  - Fee = player.marketValue * uniform(0.8, 1.2) to model negotiation variance.
 *  - Each week 0–3 cross-country transfers occur globally.
 */

import type { RNG } from "@/engine/rng";
import type { Player, Club, League } from "@/engine/core/types";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/**
 * Result of a single completed cross-country transfer.
 * Extends the base Transfer concept with country metadata so callers can
 * generate news items and update NPC scout discovery records.
 */
export interface TransferResult {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  /** Transfer fee in game currency. */
  fee: number;
  fromCountry: string;
  toCountry: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum current ability for a player to be considered for a cross-country
 * transfer. Below this threshold players lack the market profile to attract
 * interest from foreign clubs.
 */
const MIN_ABILITY_FOR_CROSS_COUNTRY = 80;

/**
 * Maximum number of cross-country transfers per weekly tick.
 * The actual count is sampled uniformly from [0, MAX_TRANSFERS_PER_WEEK].
 */
const MAX_TRANSFERS_PER_WEEK = 3;

/**
 * How closely a destination club's reputation must match the player's
 * ability-implied reputation. A wider window finds more candidates;
 * a narrow window ensures quality alignment.
 */
const REPUTATION_MATCH_WINDOW = 20;

// =============================================================================
// TRANSFER FLOW MATRIX
// =============================================================================

/**
 * Nested map of directional transfer flow probabilities.
 * Outer key = source country, inner key = destination country.
 *
 * Probabilities represent the relative likelihood that a transfer FROM the
 * source country flows TO the destination country. They do not need to sum
 * to 1.0 per row — the weighted picker normalises them automatically.
 *
 * Same-country probability is defined separately via SAME_COUNTRY_FLOW and
 * is injected at runtime so that the matrix stays extensible.
 *
 * Sources: Transfermarkt aggregate data patterns, 2018–2024.
 */
const TRANSFER_FLOW_MATRIX: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // Core countries
  Brazil: {
    England: 0.15,
    Spain: 0.12,
    France: 0.10,
    Germany: 0.08,
  },
  Argentina: {
    Spain: 0.15,
    England: 0.10,
    France: 0.08,
  },
  England: {
    Spain: 0.05,
    Germany: 0.04,
    France: 0.04,
  },
  Spain: {
    England: 0.06,
  },
  Germany: {
    England: 0.05,
  },
  France: {
    England: 0.05,
  },
  // Francophone Africa → France
  "Ivory Coast": {
    France: 0.25,
    England: 0.05,
    Belgium: 0.05,
  },
  Senegal: {
    France: 0.25,
    England: 0.05,
    Spain: 0.03,
  },
  Cameroon: {
    France: 0.20,
    Germany: 0.05,
    England: 0.05,
  },
  // Anglophone Africa → England
  Nigeria: {
    England: 0.20,
    France: 0.05,
    Germany: 0.05,
    Spain: 0.03,
  },
  Ghana: {
    England: 0.15,
    Germany: 0.05,
    France: 0.05,
  },
  // North/Southern Africa
  Egypt: {
    "Saudi Arabia": 0.10,
    England: 0.08,
    France: 0.06,
    Spain: 0.05,
  },
  "South Africa": {
    England: 0.10,
    France: 0.05,
  },
  // East Asia
  Japan: {
    Germany: 0.08,
    England: 0.08,
    France: 0.05,
    Spain: 0.04,
  },
  "South Korea": {
    Germany: 0.08,
    England: 0.08,
    France: 0.04,
  },
  China: {
    England: 0.04,
    Brazil: 0.03,
  },
  // Middle East
  "Saudi Arabia": {
    England: 0.03,
  },
  // Oceania
  Australia: {
    England: 0.12,
    Germany: 0.04,
    France: 0.03,
  },
  "New Zealand": {
    Australia: 0.10,
    England: 0.06,
  },
  // North America
  USA: {
    England: 0.08,
    Germany: 0.05,
    Spain: 0.03,
  },
  Mexico: {
    Spain: 0.10,
    England: 0.05,
    France: 0.03,
  },
  Canada: {
    England: 0.06,
    France: 0.04,
  },
};

/** Probability weight for same-country transfers (domestic moves). */
const SAME_COUNTRY_FLOW = 0.30;

/** Fallback probability weight for country pairs not in the flow matrix. */
const DEFAULT_FLOW = 0.02;

// =============================================================================
// 1. getTransferFlowProbability
// =============================================================================

/**
 * Return the probability weight (0.0–1.0) that a transfer flows from
 * `fromCountry` to `toCountry`.
 *
 * Same-country transfers always return SAME_COUNTRY_FLOW (0.30).
 * Known directional pairs use the flow matrix values.
 * All other pairs fall back to DEFAULT_FLOW (0.02).
 */
export function getTransferFlowProbability(
  fromCountry: string,
  toCountry: string,
): number {
  if (fromCountry === toCountry) {
    return SAME_COUNTRY_FLOW;
  }

  const fromRow = TRANSFER_FLOW_MATRIX[fromCountry];
  if (fromRow !== undefined) {
    const prob = fromRow[toCountry];
    if (prob !== undefined) {
      return prob;
    }
  }

  return DEFAULT_FLOW;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build a weighted list of (country → probability) entries for all destination
 * countries given a source country. Excludes the source country itself —
 * cross-country transfers only.
 *
 * @param fromCountry  - The source country.
 * @param allCountries - All countries active in the game world.
 * @returns            - Array suitable for rng.pickWeighted().
 */
function buildDestinationWeights(
  fromCountry: string,
  allCountries: string[],
): Array<{ item: string; weight: number }> {
  return allCountries
    .filter((c) => c !== fromCountry)
    .map((country) => ({
      item: country,
      weight: getTransferFlowProbability(fromCountry, country),
    }))
    .filter((entry) => entry.weight > 0);
}

/**
 * Derive the "implied reputation" of a player from their current ability.
 * Current ability runs 1–200; club reputation runs 1–100.
 * This maps CA proportionally: CA 80 → rep 40, CA 140 → rep 70.
 */
function abilityToReputation(currentAbility: number): number {
  return Math.round((currentAbility / 200) * 100);
}

/**
 * Find all clubs in a specific country (identified via their league's country
 * field) that are a good reputational match for the player.
 *
 * Matching criteria:
 *  - Club's league.country === targetCountry
 *  - |club.reputation - playerReputation| <= REPUTATION_MATCH_WINDOW
 *  - Club has sufficient budget to pay the estimated fee
 */
function findCandidateClubs(
  player: Player,
  clubs: Record<string, Club>,
  leagues: Record<string, League>,
  targetCountry: string,
  estimatedFee: number,
): Club[] {
  const playerReputation = abilityToReputation(player.currentAbility);

  return Object.values(clubs).filter((club) => {
    // Skip the player's current club
    if (club.id === player.clubId) return false;

    // Club must be in the target country
    const league = leagues[club.leagueId];
    if (!league || league.country !== targetCountry) return false;

    // Reputation match
    const repDiff = Math.abs(club.reputation - playerReputation);
    if (repDiff > REPUTATION_MATCH_WINDOW) return false;

    // Budget check: club must be able to afford at least 80% of the fee
    if (club.budget < estimatedFee * 0.8) return false;

    return true;
  });
}

/**
 * Determine the country a club belongs to by looking up its league.
 * Returns null if the league is not found (data integrity gap).
 */
function clubCountry(
  club: Club,
  leagues: Record<string, League>,
): string | null {
  const league = leagues[club.leagueId];
  return league ? league.country : null;
}

// =============================================================================
// 2. findCrossCountryTransferDestination
// =============================================================================

/**
 * Find a cross-country transfer destination for the given player.
 *
 * Eligibility: player.currentAbility must be > MIN_ABILITY_FOR_CROSS_COUNTRY.
 *
 * Algorithm:
 *  1. Build a weighted list of destination countries (excluding fromCountry).
 *  2. Pick a destination country using flow probabilities.
 *  3. Filter clubs in that country by reputation and budget.
 *  4. Pick a random club from the candidates.
 *  5. Compute the transfer fee with ±20% variance.
 *
 * Returns null when:
 *  - The player's ability is too low.
 *  - No other countries are active in the game world.
 *  - No suitable club exists in the chosen destination.
 *
 * @param rng         - Seeded RNG instance (mutated in place).
 * @param player      - The player being transferred.
 * @param clubs       - All clubs in the game world.
 * @param leagues     - All leagues in the game world.
 * @param fromCountry - The country the player is currently based in.
 * @returns           - { clubId, fee } or null.
 */
export function findCrossCountryTransferDestination(
  rng: RNG,
  player: Player,
  clubs: Record<string, Club>,
  leagues: Record<string, League>,
  fromCountry: string,
): { clubId: string; fee: number } | null {
  // Ability gate
  if (player.currentAbility <= MIN_ABILITY_FOR_CROSS_COUNTRY) {
    return null;
  }

  // Collect all distinct countries from the league data
  const allCountries = [...new Set(Object.values(leagues).map((l) => l.country))];

  // Build weighted destination list (cross-country only)
  const destinationWeights = buildDestinationWeights(fromCountry, allCountries);
  if (destinationWeights.length === 0) {
    return null;
  }

  // Pick destination country
  const targetCountry = rng.pickWeighted(destinationWeights);

  // Estimate the fee so we can budget-check candidates up front
  const feeVariance = rng.nextFloat(0.8, 1.2);
  const fee = Math.round(player.marketValue * feeVariance);

  // Find clubs that match the player's profile in the target country
  const candidates = findCandidateClubs(player, clubs, leagues, targetCountry, fee);
  if (candidates.length === 0) {
    return null;
  }

  // Pick a random club from the candidates
  const destination = rng.pick(candidates);

  return { clubId: destination.id, fee };
}

// =============================================================================
// 3. processCrossCountryTransfers
// =============================================================================

/**
 * Simulate cross-country transfer activity for one weekly tick.
 *
 * Each week, 0–MAX_TRANSFERS_PER_WEEK cross-country transfers are attempted.
 * For each attempt:
 *  1. Pick a random high-ability player from the world.
 *  2. Determine their current country.
 *  3. Find a cross-country destination.
 *  4. If successful, record the TransferResult.
 *
 * A player can only transfer once per tick (deduplicated by playerId).
 * Players with no club record or no country mapping are silently skipped.
 *
 * @param rng       - Seeded RNG instance (mutated in place).
 * @param players   - All players in the game world.
 * @param clubs     - All clubs in the game world.
 * @param leagues   - All leagues in the game world.
 * @param countries - Active country list (used to guide destination sampling).
 * @returns         - Array of TransferResult (may be empty).
 */
export function processCrossCountryTransfers(
  rng: RNG,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  leagues: Record<string, League>,
  countries: string[],
): TransferResult[] {
  const results: TransferResult[] = [];

  // Build a pool of high-ability players eligible for cross-country transfers
  const eligiblePlayers = Object.values(players).filter(
    (p) => p.currentAbility > MIN_ABILITY_FOR_CROSS_COUNTRY && !p.injured,
  );

  if (eligiblePlayers.length === 0) {
    return results;
  }

  // Decide how many transfers to attempt this week (0–MAX)
  const attemptCount = rng.nextInt(0, MAX_TRANSFERS_PER_WEEK);

  // Track which players have already transferred this tick
  const transferredPlayerIds = new Set<string>();

  for (let i = 0; i < attemptCount; i++) {
    // Pick a random eligible player who hasn't transferred yet this tick
    const available = eligiblePlayers.filter(
      (p) => !transferredPlayerIds.has(p.id),
    );
    if (available.length === 0) break;

    const player = rng.pick(available);

    // Resolve the player's current club and country
    const fromClub = clubs[player.clubId];
    if (!fromClub) continue;

    const fromCountry = clubCountry(fromClub, leagues);
    if (!fromCountry) continue;

    // Attempt to find a destination (countries list is passed for context but
    // findCrossCountryTransferDestination derives active countries from leagues)
    void countries; // acknowledged — leagues is the authoritative source here

    const destination = findCrossCountryTransferDestination(
      rng,
      player,
      clubs,
      leagues,
      fromCountry,
    );
    if (!destination) continue;

    // Resolve the destination club's country for the result record
    const toClub = clubs[destination.clubId];
    if (!toClub) continue;

    const toCountry = clubCountry(toClub, leagues);
    if (!toCountry) continue;

    results.push({
      playerId: player.id,
      fromClubId: fromClub.id,
      toClubId: destination.clubId,
      fee: destination.fee,
      fromCountry,
      toCountry,
    });

    transferredPlayerIds.add(player.id);
  }

  return results;
}
