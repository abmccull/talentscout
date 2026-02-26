/**
 * Player Match Rating Engine
 *
 * Computes 1-10 match ratings with position-appropriate weighting.
 * Under 5 = bad, 6 = average, 7 = good, 8 = great, 9-10 = spectacular.
 *
 * Two modes:
 *  - Attended matches: uses full match phase events for detailed ratings.
 *  - Simulated matches: generates synthetic ratings from CA + noise.
 */

import type { RNG } from "@/engine/rng";
import type {
  Player,
  Position,
  MatchPhase,
  MatchEventType,
  PlayerMatchRating,
  MatchPlayerStats,
  MatchFormEntry,
  SeasonRatingRecord,
} from "@/engine/core/types";
import { applyPersonalityToMatchRating, applyPersonalityToForm } from "@/engine/players/personalityEffects";

// =============================================================================
// POSITION EVENT WEIGHTS
// =============================================================================

/**
 * How much each event type matters for each position.
 * Weights are relative — they don't need to sum to 1.0; they're normalised
 * at calculation time. Unlisted events get DEFAULT_WEIGHT.
 */
const DEFAULT_WEIGHT = 0.02;

const POSITION_EVENT_WEIGHTS: Record<Position, Partial<Record<MatchEventType, number>>> = {
  GK: {
    save: 0.35, positioning: 0.25, error: 0.15,
    pass: 0.10, leadership: 0.10,
  },
  CB: {
    tackle: 0.18, aerialDuel: 0.15, interception: 0.15, positioning: 0.15,
    header: 0.08, error: 0.08, pass: 0.06, goal: 0.05, leadership: 0.05,
  },
  LB: {
    cross: 0.15, tackle: 0.12, sprint: 0.12, positioning: 0.12,
    interception: 0.10, pass: 0.08, dribble: 0.08, assist: 0.06, goal: 0.05, error: 0.05,
  },
  RB: {
    cross: 0.15, tackle: 0.12, sprint: 0.12, positioning: 0.12,
    interception: 0.10, pass: 0.08, dribble: 0.08, assist: 0.06, goal: 0.05, error: 0.05,
  },
  CDM: {
    tackle: 0.15, interception: 0.15, pass: 0.15, positioning: 0.12,
    aerialDuel: 0.08, leadership: 0.08, error: 0.06, throughBall: 0.05, goal: 0.05, assist: 0.05,
  },
  CM: {
    pass: 0.18, throughBall: 0.12, positioning: 0.10, assist: 0.10,
    tackle: 0.08, dribble: 0.08, shot: 0.08, goal: 0.08, sprint: 0.05, interception: 0.05,
  },
  CAM: {
    throughBall: 0.15, assist: 0.15, pass: 0.12, dribble: 0.12, goal: 0.12,
    shot: 0.08, cross: 0.06, holdUp: 0.06, positioning: 0.05, error: 0.04,
  },
  LW: {
    goal: 0.15, dribble: 0.15, sprint: 0.12, cross: 0.12, assist: 0.12,
    shot: 0.08, pass: 0.06, holdUp: 0.05, positioning: 0.04, error: 0.04,
  },
  RW: {
    goal: 0.15, dribble: 0.15, sprint: 0.12, cross: 0.12, assist: 0.12,
    shot: 0.08, pass: 0.06, holdUp: 0.05, positioning: 0.04, error: 0.04,
  },
  ST: {
    goal: 0.25, shot: 0.15, holdUp: 0.10,
    dribble: 0.08, header: 0.08, assist: 0.08, positioning: 0.06, aerialDuel: 0.05, sprint: 0.05, pass: 0.04,
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getWeight(position: Position, eventType: MatchEventType): number {
  return POSITION_EVENT_WEIGHTS[position]?.[eventType] ?? DEFAULT_WEIGHT;
}

// =============================================================================
// STAT EXTRACTION
// =============================================================================

/**
 * Extract position-relevant stats from a player's match events.
 */
export function extractMatchStats(
  playerId: string,
  events: Array<{ type: MatchEventType; playerId: string; quality: number }>,
  goalsAgainst: number,
): MatchPlayerStats {
  const playerEvents = events.filter((e) => e.playerId === playerId);
  const stats: MatchPlayerStats = {};

  let qualitySum = 0;
  for (const e of playerEvents) {
    qualitySum += e.quality;
    switch (e.type) {
      case "goal": stats.goals = (stats.goals ?? 0) + 1; break;
      case "assist": stats.assists = (stats.assists ?? 0) + 1; break;
      case "shot": stats.shots = (stats.shots ?? 0) + 1; break;
      case "throughBall": stats.keyPasses = (stats.keyPasses ?? 0) + 1; break;
      case "cross": stats.crosses = (stats.crosses ?? 0) + 1; break;
      case "dribble": stats.dribbles = (stats.dribbles ?? 0) + 1; break;
      case "tackle": stats.tackles = (stats.tackles ?? 0) + 1; break;
      case "interception": stats.interceptions = (stats.interceptions ?? 0) + 1; break;
      case "aerialDuel": stats.aerialDuelsWon = (stats.aerialDuelsWon ?? 0) + 1; break;
      case "save": stats.saves = (stats.saves ?? 0) + 1; break;
      case "error": stats.errors = (stats.errors ?? 0) + 1; break;
    }
  }

  if (playerEvents.length > 0) {
    stats.avgEventQuality = round1(qualitySum / playerEvents.length);
  }

  // GK-specific: goals conceded and clean sheet are derived from match result
  // These are set by the caller who has match context
  // We store goalsConceded and cleanSheet placeholders here only if the player had save events
  if (stats.saves !== undefined) {
    stats.goalsConceded = goalsAgainst;
    stats.cleanSheet = goalsAgainst === 0;
  }

  return stats;
}

// =============================================================================
// ATTENDED MATCH RATING
// =============================================================================

/**
 * Calculate a position-weighted match rating for a player based on real events.
 *
 * @param isImportantMatch - When true, personality big-match modifier is applied.
 */
export function calculatePlayerMatchRating(
  player: Player,
  events: Array<{ type: MatchEventType; playerId: string; quality: number }>,
  teamGoals: number,
  opponentGoals: number,
  goalsAgainst: number,
  fixtureId: string,
  isImportantMatch = false,
): PlayerMatchRating {
  const playerEvents = events.filter((e) => e.playerId === player.id);
  const stats = extractMatchStats(player.id, events, goalsAgainst);

  // If player had no events, return a baseline rating
  if (playerEvents.length === 0) {
    const baselineRating = buildBaselineRating(player, teamGoals - opponentGoals);
    return {
      playerId: player.id,
      fixtureId,
      rating: baselineRating,
      eventCount: 0,
      stats,
      source: "attended",
    };
  }

  // Step 1: Weighted average of event qualities using position weights
  let weightedQualitySum = 0;
  let totalWeight = 0;
  for (const e of playerEvents) {
    const w = getWeight(player.position, e.type);
    weightedQualitySum += e.quality * w;
    totalWeight += w;
  }
  let rating = totalWeight > 0 ? weightedQualitySum / totalWeight : 5.0;

  // Step 2: Discrete bonuses
  rating += (stats.goals ?? 0) * 0.5;
  rating += (stats.assists ?? 0) * 0.3;
  rating -= (stats.errors ?? 0) * 0.4;

  // Step 3: Team result nudge
  const goalDiff = teamGoals - opponentGoals;
  rating += clamp(goalDiff * 0.15, -0.5, 0.5);

  // Step 4: Position-specific bonuses
  rating += positionBonuses(player.position, stats);

  // Step 5: Personality big-match modifier
  rating = applyPersonalityToMatchRating(player.personalityProfile, rating, isImportantMatch);

  // Step 6: Clamp and round
  rating = round1(clamp(rating, 1.0, 10.0));

  return {
    playerId: player.id,
    fixtureId,
    rating,
    eventCount: playerEvents.length,
    stats,
    source: "attended",
  };
}

/** Position-specific bonuses based on stats. */
function positionBonuses(position: Position, stats: MatchPlayerStats): number {
  let bonus = 0;

  switch (position) {
    case "GK":
      if (stats.cleanSheet) bonus += 0.5;
      if ((stats.goalsConceded ?? 0) >= 3) bonus -= 0.3;
      bonus += (stats.saves ?? 0) * 0.15;
      break;
    case "CB":
    case "CDM":
      if ((stats.tackles ?? 0) >= 3) bonus += 0.2;
      if ((stats.interceptions ?? 0) >= 3) bonus += 0.2;
      if ((stats.aerialDuelsWon ?? 0) >= 3) bonus += 0.15;
      break;
    case "LB":
    case "RB":
      if ((stats.crosses ?? 0) >= 2) bonus += 0.15;
      if ((stats.tackles ?? 0) >= 2) bonus += 0.15;
      break;
    case "CM":
      if ((stats.keyPasses ?? 0) >= 3) bonus += 0.2;
      if ((stats.goals ?? 0) >= 1) bonus += 0.3; // Goal from midfield
      break;
    case "CAM":
    case "LW":
    case "RW":
      if ((stats.dribbles ?? 0) >= 2) bonus += 0.15;
      if ((stats.keyPasses ?? 0) >= 2) bonus += 0.15;
      break;
    case "ST":
      if ((stats.goals ?? 0) >= 3) bonus += 0.5; // Hat trick
      break;
  }

  return bonus;
}

/**
 * Baseline rating for a player with no events.
 * Range ~4.5-7.5 based on CA + team result nudge.
 */
function buildBaselineRating(player: Player, goalDiff: number): number {
  const caComponent = (player.currentAbility / 200) * 3.0;
  const nudge = clamp(goalDiff * 0.15, -0.5, 0.5);
  return round1(clamp(4.5 + caComponent + nudge, 1.0, 10.0));
}

// =============================================================================
// ATTENDED MATCH: FULL CALCULATION
// =============================================================================

/**
 * Calculate match ratings for all players in an attended match,
 * using the full match phase event data.
 */
export function calculateAttendedMatchRatings(
  phases: MatchPhase[],
  homePlayers: Player[],
  awayPlayers: Player[],
  homeGoals: number,
  awayGoals: number,
  fixtureId: string,
): Record<string, PlayerMatchRating> {
  // Flatten all events across all phases
  const allEvents = phases.flatMap((p) => p.events);

  const ratings: Record<string, PlayerMatchRating> = {};

  for (const player of homePlayers) {
    ratings[player.id] = calculatePlayerMatchRating(
      player, allEvents, homeGoals, awayGoals, awayGoals, fixtureId,
    );
  }

  for (const player of awayPlayers) {
    ratings[player.id] = calculatePlayerMatchRating(
      player, allEvents, awayGoals, homeGoals, homeGoals, fixtureId,
    );
  }

  return ratings;
}

// =============================================================================
// SIMULATED MATCH RATINGS
// =============================================================================

/** Stat generation templates by position. */
function generateSyntheticStats(
  rng: RNG,
  player: Player,
  scorerIds: Set<string>,
  assistIds: Set<string>,
  goalsAgainst: number,
): MatchPlayerStats {
  const stats: MatchPlayerStats = {};

  // Goals and assists from scorer/assist lists
  if (scorerIds.has(player.id)) {
    stats.goals = 1; // May be >1 if appears multiple times, handled by caller
  }
  if (assistIds.has(player.id)) {
    stats.assists = 1;
  }

  switch (player.position) {
    case "GK":
      stats.saves = rng.nextInt(1, 6);
      stats.goalsConceded = goalsAgainst;
      stats.cleanSheet = goalsAgainst === 0;
      break;
    case "CB":
      stats.tackles = rng.nextInt(1, 5);
      stats.interceptions = rng.nextInt(0, 4);
      stats.aerialDuelsWon = rng.nextInt(1, 6);
      break;
    case "LB":
    case "RB":
      stats.tackles = rng.nextInt(0, 3);
      stats.crosses = rng.nextInt(0, 4);
      stats.dribbles = rng.nextInt(0, 2);
      break;
    case "CDM":
      stats.tackles = rng.nextInt(1, 4);
      stats.interceptions = rng.nextInt(1, 4);
      stats.keyPasses = rng.nextInt(0, 2);
      break;
    case "CM":
      stats.keyPasses = rng.nextInt(0, 3);
      stats.tackles = rng.nextInt(0, 2);
      stats.dribbles = rng.nextInt(0, 2);
      break;
    case "CAM":
      stats.keyPasses = rng.nextInt(0, 4);
      stats.dribbles = rng.nextInt(0, 3);
      stats.shots = rng.nextInt(0, 3);
      break;
    case "LW":
    case "RW":
      stats.dribbles = rng.nextInt(0, 4);
      stats.crosses = rng.nextInt(0, 3);
      stats.shots = rng.nextInt(0, 3);
      break;
    case "ST":
      stats.shots = rng.nextInt(1, 5);
      stats.aerialDuelsWon = rng.nextInt(0, 4);
      break;
  }

  return stats;
}

/**
 * Generate simulated match ratings for all players in a non-attended fixture.
 * Uses CA as baseline + gaussian noise + team result modifier + scorer bonus.
 */
export function generateSimulatedMatchRatings(
  rng: RNG,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeGoals: number,
  awayGoals: number,
  scorers: Array<{ playerId: string; minute: number }>,
  fixtureId: string,
): Record<string, PlayerMatchRating> {
  const ratings: Record<string, PlayerMatchRating> = {};

  // Count goals per scorer (handle braces)
  const goalsPerPlayer = new Map<string, number>();
  for (const s of scorers) {
    goalsPerPlayer.set(s.playerId, (goalsPerPlayer.get(s.playerId) ?? 0) + 1);
  }
  const scorerIds = new Set(scorers.map((s) => s.playerId));

  // Simple assist attribution: randomly assign assists (not to self)
  const assistIds = new Set<string>();

  const generateForTeam = (
    players: Player[],
    teamGoals: number,
    opponentGoals: number,
    goalsAgainst: number,
  ) => {
    const goalDiff = teamGoals - opponentGoals;
    const resultMod = clamp(goalDiff * 0.15, -0.5, 0.5);

    for (const player of players) {
      const caBase = 4.5 + (player.currentAbility / 200) * 3.0;
      let rating = rng.gaussian(caBase, 0.6) + resultMod;

      // Scorer bonus
      const playerGoals = goalsPerPlayer.get(player.id) ?? 0;
      if (playerGoals > 0) {
        rating += 0.8;
        if (playerGoals >= 3) rating += 0.5; // Hat trick extra
      }

      const stats = generateSyntheticStats(rng, player, scorerIds, assistIds, goalsAgainst);
      // Override goals count with actual
      if (playerGoals > 0) stats.goals = playerGoals;

      // Position-specific bonuses from generated stats
      rating += positionBonuses(player.position, stats);

      rating = round1(clamp(rating, 1.0, 10.0));

      ratings[player.id] = {
        playerId: player.id,
        fixtureId,
        rating,
        eventCount: 0,
        stats,
        source: "simulated",
      };
    }
  };

  generateForTeam(homePlayers, homeGoals, awayGoals, awayGoals);
  generateForTeam(awayPlayers, awayGoals, homeGoals, homeGoals);

  return ratings;
}

// =============================================================================
// FORM CALCULATION
// =============================================================================

/** Form weight multipliers for last 6 matches (most recent first). */
const FORM_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4, 0.3];

/**
 * Compute form value [-3, 3] from the last N match ratings.
 * Uses a weighted average with recency bias.
 *
 * When a player's personality profile is provided, form volatility is applied:
 * high-volatility players have amplified form swings, while low-volatility
 * players have dampened swings toward the mean.
 */
export function computeFormFromRatings(
  recentRatings: MatchFormEntry[],
  player?: Pick<Player, "personalityProfile">,
): number {
  if (recentRatings.length === 0) return 0;

  // Most recent first (assume already ordered, but be safe)
  const sorted = [...recentRatings].sort(
    (a, b) => b.season - a.season || b.week - a.week,
  );
  const slice = sorted.slice(0, 6);

  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < slice.length; i++) {
    const w = FORM_WEIGHTS[i] ?? 0.3;
    weightedSum += slice[i].rating * w;
    totalWeight += w;
  }

  const avg = weightedSum / totalWeight;

  // Map average rating to form [-3, 3]
  let form: number;
  if (avg >= 8.0) form = 3;
  else if (avg >= 7.5) form = 2;
  else if (avg >= 6.5) form = 1;
  else if (avg >= 5.5) form = 0;
  else if (avg >= 5.0) form = -1;
  else if (avg >= 4.5) form = -2;
  else form = -3;

  // Apply personality form volatility modifier
  return applyPersonalityToForm(player?.personalityProfile, form);
}

// =============================================================================
// SEASON CONSOLIDATION
// =============================================================================

/**
 * Consolidate a season's worth of per-fixture match ratings into a single
 * SeasonRatingRecord for a player.
 *
 * Returns null if the player had no ratings this season.
 */
export function consolidateSeasonRatings(
  playerId: string,
  season: number,
  matchRatings: Record<string, Record<string, PlayerMatchRating>>,
): SeasonRatingRecord | null {
  // Collect all ratings for this player across all fixtures
  const playerRatings: PlayerMatchRating[] = [];
  for (const fixtureRatings of Object.values(matchRatings)) {
    const rating = fixtureRatings[playerId];
    if (rating) {
      playerRatings.push(rating);
    }
  }

  if (playerRatings.length === 0) return null;

  const avgRating = Math.round(
    (playerRatings.reduce((sum, r) => sum + r.rating, 0) / playerRatings.length) * 10,
  ) / 10;

  let goals = 0;
  let assists = 0;
  let cleanSheets = 0;
  for (const r of playerRatings) {
    goals += r.stats.goals ?? 0;
    assists += r.stats.assists ?? 0;
    if (r.stats.cleanSheet) cleanSheets++;
  }

  return {
    season,
    avgRating,
    appearances: playerRatings.length,
    goals,
    assists,
    cleanSheets,
  };
}
