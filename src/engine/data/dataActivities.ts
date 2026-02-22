/**
 * Data-exclusive scouting activities for the data specialization.
 *
 * These functions simulate database queries, deep video analysis sessions, and
 * weekly stats briefings. All outputs are probabilistic and skill-gated via
 * the scout's dataLiteracy rating.
 *
 * Design notes:
 *  - Pure TypeScript: no React, no side effects, no mutation of inputs.
 *  - All randomness flows through the provided RNG instance.
 *  - No import from Next.js or any framework.
 */

import type { RNG } from "@/engine/rng";
import type {
  Scout,
  League,
  Player,
  Position,
  StatisticalProfile,
  AnomalyFlag,
} from "@/engine/core/types";

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply multiplicative noise to a base value.
 * noiseFactor=0.15 → value can deviate by up to ±15% of itself.
 */
function applyNoise(rng: RNG, base: number, noiseFactor: number): number {
  const delta = rng.gaussian(0, noiseFactor);
  return Math.max(0, base * (1 + delta));
}

/**
 * Derive the per-90 noise factor from a scout's dataLiteracy skill.
 * Skill 1-7  → ±15% noise
 * Skill 8-14 → ±8% noise
 * Skill 15-20 → ±3% noise
 */
function noiseFactorFromSkill(skill: number): number {
  if (skill <= 7) return 0.15;
  if (skill <= 14) return 0.08;
  return 0.03;
}

/**
 * Compute a stat's percentile rank within a peer group by performing a
 * simple count-based ranking.  Returns 0–100.
 */
function computePercentile(value: number, peerValues: number[]): number {
  if (peerValues.length === 0) return 50;
  const below = peerValues.filter((v) => v < value).length;
  return Math.round((below / peerValues.length) * 100);
}

/**
 * Pick a trend direction.  Biased by the player's current form modifier:
 * positive form → more likely "rising", negative form → more likely "falling".
 */
function deriveTrend(
  rng: RNG,
  form: number,
): "rising" | "stable" | "falling" {
  // form is in [-3, 3]; convert to a probability bias
  const risingProb = clamp(0.33 + form * 0.1, 0.05, 0.75);
  const fallingProb = clamp(0.33 - form * 0.1, 0.05, 0.75);

  const roll = rng.next();
  if (roll < risingProb) return "rising";
  if (roll < risingProb + fallingProb) return "falling";
  return "stable";
}

/**
 * Derive raw per-90 statistics from player attributes.
 * These are approximate values before noise is applied.
 */
function deriveRawPer90(player: Player): {
  goals: number;
  assists: number;
  passCompletion: number;
  tacklesWon: number;
  interceptions: number;
  aerialDuelsWon: number;
  dribbleSuccess: number;
  shotsOnTarget: number;
} {
  const a = player.attributes;

  // Goals — driven by shooting, composure, positioning; scale for realistic per-90 values
  const goals =
    ((a.shooting * 0.5 + a.composure * 0.25 + a.positioning * 0.25) / 20) *
    0.8;

  // Assists — driven by passing, crossing, decisionMaking
  const assists =
    ((a.passing * 0.45 + a.crossing * 0.3 + a.decisionMaking * 0.25) / 20) *
    0.5;

  // Pass completion — driven by passing, firstTouch; expressed as 0–1
  const passCompletion = clamp(
    (a.passing * 0.6 + a.firstTouch * 0.4) / 20,
    0,
    1,
  );

  // Tackles won — driven by defensiveAwareness, strength
  const tacklesWon =
    ((a.defensiveAwareness * 0.6 + a.strength * 0.4) / 20) * 3.5;

  // Interceptions — driven by defensiveAwareness, pressing, positioning
  const interceptions =
    ((a.defensiveAwareness * 0.5 + a.pressing * 0.3 + a.positioning * 0.2) /
      20) *
    2.0;

  // Aerial duels won — driven by heading, strength, jumping (use stamina as proxy)
  const aerialDuelsWon =
    ((a.heading * 0.55 + a.strength * 0.35 + a.stamina * 0.1) / 20) * 3.0;

  // Dribble success rate — driven by dribbling, agility, pace; expressed as 0–1
  const dribbleSuccess = clamp(
    (a.dribbling * 0.55 + a.agility * 0.3 + a.pace * 0.15) / 20,
    0,
    1,
  );

  // Shots on target — driven by shooting, composure
  const shotsOnTarget =
    ((a.shooting * 0.6 + a.composure * 0.4) / 20) * 1.5;

  return {
    goals,
    assists,
    passCompletion,
    tacklesWon,
    interceptions,
    aerialDuelsWon,
    dribbleSuccess,
    shotsOnTarget,
  };
}

/**
 * Build a StatisticalProfile for a single player, given noisy per-90 values
 * and a map of peer values for percentile calculation.
 */
function buildProfile(
  rng: RNG,
  player: Player,
  noiseFactor: number,
  peerMap: Record<
    string,
    {
      goals: number[];
      assists: number[];
      passCompletion: number[];
      tacklesWon: number[];
      interceptions: number[];
      aerialDuelsWon: number[];
      dribbleSuccess: number[];
      shotsOnTarget: number[];
    }
  >,
  season: number,
  week: number,
): StatisticalProfile {
  const raw = deriveRawPer90(player);

  const per90 = {
    goals: applyNoise(rng, raw.goals, noiseFactor),
    assists: applyNoise(rng, raw.assists, noiseFactor),
    passCompletion: clamp(
      applyNoise(rng, raw.passCompletion, noiseFactor),
      0,
      1,
    ),
    tacklesWon: applyNoise(rng, raw.tacklesWon, noiseFactor),
    interceptions: applyNoise(rng, raw.interceptions, noiseFactor),
    aerialDuelsWon: applyNoise(rng, raw.aerialDuelsWon, noiseFactor),
    dribbleSuccess: clamp(
      applyNoise(rng, raw.dribbleSuccess, noiseFactor),
      0,
      1,
    ),
    shotsOnTarget: applyNoise(rng, raw.shotsOnTarget, noiseFactor),
  };

  const peers = peerMap[player.position] ?? {
    goals: [],
    assists: [],
    passCompletion: [],
    tacklesWon: [],
    interceptions: [],
    aerialDuelsWon: [],
    dribbleSuccess: [],
    shotsOnTarget: [],
  };

  const percentiles = {
    goals: computePercentile(per90.goals, peers.goals),
    assists: computePercentile(per90.assists, peers.assists),
    passCompletion: computePercentile(
      per90.passCompletion,
      peers.passCompletion,
    ),
    tacklesWon: computePercentile(per90.tacklesWon, peers.tacklesWon),
    interceptions: computePercentile(
      per90.interceptions,
      peers.interceptions,
    ),
    aerialDuelsWon: computePercentile(
      per90.aerialDuelsWon,
      peers.aerialDuelsWon,
    ),
    dribbleSuccess: computePercentile(
      per90.dribbleSuccess,
      peers.dribbleSuccess,
    ),
    shotsOnTarget: computePercentile(
      per90.shotsOnTarget,
      peers.shotsOnTarget,
    ),
  };

  const trends = {
    goals: deriveTrend(rng, player.form),
    assists: deriveTrend(rng, player.form),
    passCompletion: deriveTrend(rng, player.form),
    tacklesWon: deriveTrend(rng, player.form),
    interceptions: deriveTrend(rng, player.form),
  };

  return {
    playerId: player.id,
    per90,
    percentiles,
    trends,
    season,
    lastUpdated: week,
  };
}

/**
 * Build a peer raw-stat lookup map grouped by position.
 * Used for percentile ranking after all per-90 values are computed.
 */
function buildPeerMap(
  players: Player[],
): Record<
  string,
  {
    goals: number[];
    assists: number[];
    passCompletion: number[];
    tacklesWon: number[];
    interceptions: number[];
    aerialDuelsWon: number[];
    dribbleSuccess: number[];
    shotsOnTarget: number[];
  }
> {
  const map: Record<
    string,
    {
      goals: number[];
      assists: number[];
      passCompletion: number[];
      tacklesWon: number[];
      interceptions: number[];
      aerialDuelsWon: number[];
      dribbleSuccess: number[];
      shotsOnTarget: number[];
    }
  > = {};

  for (const player of players) {
    const raw = deriveRawPer90(player);
    if (!map[player.position]) {
      map[player.position] = {
        goals: [],
        assists: [],
        passCompletion: [],
        tacklesWon: [],
        interceptions: [],
        aerialDuelsWon: [],
        dribbleSuccess: [],
        shotsOnTarget: [],
      };
    }
    map[player.position].goals.push(raw.goals);
    map[player.position].assists.push(raw.assists);
    map[player.position].passCompletion.push(raw.passCompletion);
    map[player.position].tacklesWon.push(raw.tacklesWon);
    map[player.position].interceptions.push(raw.interceptions);
    map[player.position].aerialDuelsWon.push(raw.aerialDuelsWon);
    map[player.position].dribbleSuccess.push(raw.dribbleSuccess);
    map[player.position].shotsOnTarget.push(raw.shotsOnTarget);
  }

  return map;
}

/**
 * Filters for database queries.
 */
export interface DatabaseQueryFilters {
  position?: Position;
  minAge?: number;
  maxAge?: number;
  minCA?: number;
  anomaliesOnly?: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Simulate querying a statistical database for players matching given filters.
 *
 * The scout's dataLiteracy skill determines how many players are returned and
 * how closely the generated statistics reflect true attribute values:
 *   - Low skill (1–7):  3–5 players, ±15% noise on per-90 stats
 *   - Medium (8–14):   5–10 players, ±8% noise
 *   - High (15–20):    8–15 players, ±3% noise
 *
 * @param rng        - Shared RNG instance.
 * @param scout      - The scouting doing the query (uses dataLiteracy skill).
 * @param league     - The league being queried.
 * @param allPlayers - All players in the game world.
 * @param filters    - Optional filters to narrow the query.
 * @param season     - Current season (for profile timestamping).
 * @param week       - Current week (for profile timestamping).
 */
export function executeDatabaseQuery(
  rng: RNG,
  scout: Scout,
  league: League,
  allPlayers: Record<string, Player>,
  filters: DatabaseQueryFilters,
  season: number,
  week: number,
): { playerIds: string[]; profiles: StatisticalProfile[] } {
  const skill = scout.skills.dataLiteracy;
  const noiseFactor = noiseFactorFromSkill(skill);

  // Result count range by skill tier
  let minCount: number;
  let maxCount: number;
  if (skill <= 7) {
    minCount = 3;
    maxCount = 5;
  } else if (skill <= 14) {
    minCount = 5;
    maxCount = 10;
  } else {
    minCount = 8;
    maxCount = 15;
  }

  // Gather league players and apply filters
  const leaguePlayerIds = new Set(league.clubIds.flatMap(() => []));
  // Build from allPlayers keyed lookup — players belong to clubs in the league
  const leagueClubIds = new Set(league.clubIds);
  const candidatePlayers = Object.values(allPlayers).filter((p) => {
    if (!leagueClubIds.has(p.clubId)) return false;
    if (filters.position && p.position !== filters.position) return false;
    if (filters.minAge !== undefined && p.age < filters.minAge) return false;
    if (filters.maxAge !== undefined && p.age > filters.maxAge) return false;
    if (filters.minCA !== undefined && p.currentAbility < filters.minCA)
      return false;
    if (filters.anomaliesOnly) {
      // Anomalous players: form >= 2 or form <= -2 (outlier performance signal)
      if (Math.abs(p.form) < 2) return false;
    }
    return true;
  });

  if (candidatePlayers.length === 0) {
    return { playerIds: [], profiles: [] };
  }

  // Shuffle and slice to result count
  const shuffled = rng.shuffle(candidatePlayers);
  const count = clamp(
    rng.nextInt(minCount, maxCount),
    0,
    shuffled.length,
  );
  const selected = shuffled.slice(0, count);

  // Build peer map from all league players for accurate percentile ranking
  const allLeaguePlayers = Object.values(allPlayers).filter((p) =>
    leagueClubIds.has(p.clubId),
  );
  const peerMap = buildPeerMap(allLeaguePlayers);

  // Generate profiles
  const profiles = selected.map((player) =>
    buildProfile(rng, player, noiseFactor, peerMap, season, week),
  );

  // Unused variable fix — leaguePlayerIds is not needed after building candidatePlayers
  void leaguePlayerIds;

  return {
    playerIds: selected.map((p) => p.id),
    profiles,
  };
}

/**
 * Generate an enhanced statistical profile via deep video analysis.
 *
 * dataLiteracy directly reduces noise:
 *   noise = max(0.01, (20 - skill) * 0.008)
 *
 * If an existing profile is provided, the new profile converges toward true
 * attribute values by using lower noise (average of new noise and existing).
 *
 * @param rng             - Shared RNG instance.
 * @param scout           - The scout conducting the analysis.
 * @param player          - The player being analysed.
 * @param existingProfile - Optional prior profile to merge with.
 * @param season          - Current season.
 * @param week            - Current week.
 */
export function executeDeepVideoAnalysis(
  rng: RNG,
  scout: Scout,
  player: Player,
  season: number,
  week: number,
  existingProfile?: StatisticalProfile,
): StatisticalProfile {
  const skill = scout.skills.dataLiteracy;
  const newNoise = Math.max(0.01, (20 - skill) * 0.008);

  // If there is an existing profile, convergence reduces effective noise
  const effectiveNoise = existingProfile ? newNoise * 0.6 : newNoise;

  // Build peer map from a singleton — percentiles will be approximate without
  // full league context, but we do the best we can with what we have
  const peerMap = buildPeerMap([player]);

  const profile = buildProfile(
    rng,
    player,
    effectiveNoise,
    peerMap,
    season,
    week,
  );

  // If merging with an existing profile, blend per-90 values:
  // use a weighted average leaning toward the new (lower-noise) reading
  if (existingProfile) {
    const weight = 0.6; // new reading carries 60% weight
    return {
      ...profile,
      per90: {
        goals:
          profile.per90.goals * weight +
          existingProfile.per90.goals * (1 - weight),
        assists:
          profile.per90.assists * weight +
          existingProfile.per90.assists * (1 - weight),
        passCompletion:
          profile.per90.passCompletion * weight +
          existingProfile.per90.passCompletion * (1 - weight),
        tacklesWon:
          profile.per90.tacklesWon * weight +
          existingProfile.per90.tacklesWon * (1 - weight),
        interceptions:
          profile.per90.interceptions * weight +
          existingProfile.per90.interceptions * (1 - weight),
        aerialDuelsWon:
          profile.per90.aerialDuelsWon * weight +
          existingProfile.per90.aerialDuelsWon * (1 - weight),
        dribbleSuccess:
          profile.per90.dribbleSuccess * weight +
          existingProfile.per90.dribbleSuccess * (1 - weight),
        shotsOnTarget:
          profile.per90.shotsOnTarget * weight +
          existingProfile.per90.shotsOnTarget * (1 - weight),
      },
    };
  }

  return profile;
}

// =============================================================================
// STATS BRIEFING
// =============================================================================

/** Output of a weekly stats briefing. */
export interface StatsBriefingResult {
  /** Human-readable highlights for the briefing summary. */
  highlights: string[];
  /** Statistical anomaly flags found this week. */
  anomalies: AnomalyFlag[];
  /** Player IDs of the top composite performers. */
  topPerformers: string[];
}

/**
 * Generate a weekly stats briefing for a monitored league.
 *
 * Identifies 2–4 statistical anomalies and lists the top 3–5 performers by
 * composite per-90 metrics. Higher dataLiteracy catches subtler anomalies.
 *
 * @param rng        - Shared RNG instance.
 * @param scout      - The scout requesting the briefing.
 * @param league     - The league being monitored.
 * @param allPlayers - All players in the game world.
 * @param season     - Current season.
 * @param week       - Current week.
 */
export function generateStatsBriefing(
  rng: RNG,
  scout: Scout,
  league: League,
  allPlayers: Record<string, Player>,
  season: number,
  week: number,
): StatsBriefingResult {
  const skill = scout.skills.dataLiteracy;

  // Anomaly detection threshold: lower skill = only large anomalies caught
  // Skill 1 → stddev threshold ≈ 2.5, skill 20 → threshold ≈ 1.0
  const anomalyThreshold = 2.5 - (skill / 20) * 1.5;

  const leagueClubIds = new Set(league.clubIds);
  const leaguePlayers = Object.values(allPlayers).filter((p) =>
    leagueClubIds.has(p.clubId),
  );

  if (leaguePlayers.length === 0) {
    return { highlights: [], anomalies: [], topPerformers: [] };
  }

  // Derive raw per-90 for all players, keyed by position for z-score calculation
  const rawByPosition: Record<string, number[]> = {};
  const rawGoalsByPlayer: Record<string, number> = {};

  for (const player of leaguePlayers) {
    const raw = deriveRawPer90(player);
    rawGoalsByPlayer[player.id] = raw.goals;
    if (!rawByPosition[player.position]) {
      rawByPosition[player.position] = [];
    }
    rawByPosition[player.position].push(raw.goals);
  }

  // Compute mean and stddev per position for anomaly z-scores
  const posStats: Record<string, { mean: number; std: number }> = {};
  for (const [pos, values] of Object.entries(rawByPosition)) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    posStats[pos] = { mean, std: Math.sqrt(variance) };
  }

  // Find anomalies — players significantly above or below positional mean
  const anomalies: AnomalyFlag[] = [];
  const anomalyCount = rng.nextInt(2, 4);
  const candidatesForAnomaly = rng.shuffle(leaguePlayers);

  for (const player of candidatesForAnomaly) {
    if (anomalies.length >= anomalyCount) break;

    const stats = posStats[player.position];
    if (!stats || stats.std === 0) continue;

    const rawGoals = rawGoalsByPlayer[player.id] ?? 0;
    const zScore = (rawGoals - stats.mean) / stats.std;
    const absZ = Math.abs(zScore);

    // Apply noise to z-score based on skill (lower skill may miss subtle anomalies)
    const perceivedZ = applyNoise(rng, absZ, noiseFactorFromSkill(skill));

    if (perceivedZ >= anomalyThreshold) {
      const direction: "positive" | "negative" = zScore > 0 ? "positive" : "negative";
      anomalies.push({
        id: `anomaly_${player.id}_${season}_${week}`,
        playerId: player.id,
        stat: "goals",
        direction,
        severity: Math.round(perceivedZ * 10) / 10,
        description:
          direction === "positive"
            ? `${player.firstName} ${player.lastName} is outperforming positional peers by ${perceivedZ.toFixed(1)} standard deviations in goal output.`
            : `${player.firstName} ${player.lastName} is significantly underperforming positional peers (${perceivedZ.toFixed(1)} std below average).`,
        investigated: false,
        week,
        season,
      });
    }
  }

  // Top performers — composite score: goals + assists + defensive contribution
  const scored = leaguePlayers.map((p) => {
    const raw = deriveRawPer90(p);
    const composite =
      raw.goals * 3 +
      raw.assists * 2 +
      raw.tacklesWon * 0.5 +
      raw.interceptions * 0.5 +
      raw.passCompletion * 2;
    return { id: p.id, composite };
  });
  scored.sort((a, b) => b.composite - a.composite);

  const topCount = rng.nextInt(3, 5);
  const topPerformers = scored.slice(0, topCount).map((s) => s.id);

  // Generate human-readable highlights
  const highlights: string[] = [
    `${league.name} stats briefing for week ${week}: ${leaguePlayers.length} players analysed.`,
  ];

  if (topPerformers.length > 0) {
    const topPlayer = allPlayers[topPerformers[0]];
    if (topPlayer) {
      highlights.push(
        `Top performer: ${topPlayer.firstName} ${topPlayer.lastName} leads the composite per-90 ranking.`,
      );
    }
  }

  if (anomalies.length > 0) {
    highlights.push(
      `${anomalies.length} statistical anomal${anomalies.length === 1 ? "y" : "ies"} flagged for investigation.`,
    );
  }

  const risingPlayers = leaguePlayers.filter((p) => p.form >= 2);
  if (risingPlayers.length > 0) {
    const sample = rng.pick(risingPlayers);
    highlights.push(
      `${sample.firstName} ${sample.lastName} is in exceptional form — metrics trending sharply upward.`,
    );
  }

  return { highlights, anomalies, topPerformers };
}
