/**
 * Season Awards — pure functions for generating end-of-season awards data.
 *
 * No side effects, no I/O. Takes GameState in, returns SeasonAwardsData out.
 * Evaluates the scout's season performance and generates both scout awards
 * and league-level awards from world state.
 */

import type {
  GameState,
  SeasonAward,
  LeagueAward,
  SeasonAwardsData,
  SeasonStats,
  Player,
  ScoutReport,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum PA to classify as a wonderkid discovery (matches discoveryTracking). */
const WONDERKID_PA_THRESHOLD = 150;

/** Max age for wonderkid classification. */
const WONDERKID_MAX_AGE = 21;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get all reports submitted in the given season.
 */
function getSeasonReports(state: GameState, season: number): ScoutReport[] {
  return Object.values(state.reports).filter(
    (r) => r.submittedSeason === season,
  );
}

/**
 * Get unique countries scouted this season (from observations).
 */
function getCountriesScouted(state: GameState, season: number): Set<string> {
  const countries = new Set<string>();
  const seasonObs = Object.values(state.observations).filter(
    (o) => o.season === season,
  );
  for (const obs of seasonObs) {
    const player = state.players[obs.playerId];
    if (player) {
      // Use the player's club's league's country
      const club = state.clubs[player.clubId];
      if (club) {
        const league = state.leagues[club.leagueId];
        if (league) {
          countries.add(league.country);
        }
      }
    }
  }
  return countries;
}

/**
 * Compute season statistics from game state.
 */
function computeSeasonStats(
  state: GameState,
  season: number,
): SeasonStats {
  const seasonReports = getSeasonReports(state, season);

  const reportsSubmitted = seasonReports.length;
  const avgReportQuality =
    reportsSubmitted > 0
      ? Math.round(
          seasonReports.reduce((sum, r) => sum + r.qualityScore, 0) /
            reportsSubmitted,
        )
      : 0;

  // Matches attended: count activities of type "attendMatch" from schedule history
  // Since we don't store full schedule history, approximate from observations
  const seasonObservations = Object.values(state.observations).filter(
    (o) => o.season === season,
  );
  const matchesAttended = new Set(
    seasonObservations
      .filter((o) => o.context === "liveMatch" && o.matchId)
      .map((o) => o.matchId),
  ).size;

  // Discoveries this season
  const seasonDiscoveries = state.discoveryRecords.filter(
    (d) => d.discoveredSeason === season,
  );
  const playersDiscovered = seasonDiscoveries.length;
  const wonderkidsDiscovered = seasonDiscoveries.filter(
    (d) => d.wasWonderkid,
  ).length;

  // Transfer recommendations
  const recommendedReports = seasonReports.filter(
    (r) =>
      r.conviction === "recommend" ||
      r.conviction === "strongRecommend" ||
      r.conviction === "tablePound",
  );
  const transferRecommendations = recommendedReports.length;
  const recommendationsAccepted = recommendedReports.filter(
    (r) => r.clubResponse === "shortlisted" || r.clubResponse === "signed",
  ).length;
  const recommendationsSigned = recommendedReports.filter(
    (r) => r.clubResponse === "signed",
  ).length;

  // Hit rate: % of recommendations that were at least shortlisted
  const hitRate =
    transferRecommendations > 0
      ? Math.round(
          (recommendationsAccepted / transferRecommendations) * 100,
        )
      : 0;

  // Reputation change — use performance reviews if available
  const currentReview = state.performanceReviews.find(
    (r) => r.season === season,
  );
  const reputationEnd = Math.round(state.scout.reputation);
  const reputationChange = currentReview?.reputationChange ?? 0;
  const reputationStart = reputationEnd - reputationChange;

  // Financial data
  const finances = state.finances;
  const income = finances
    ? finances.transactions
        .filter((t) => t.season === season && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0)
    : state.scout.salary * 38; // approximate weekly salary * 38 weeks
  const expenses = finances
    ? finances.transactions
        .filter((t) => t.season === season && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    : 0;
  const profitLoss = income - expenses;

  const countriesScouted = getCountriesScouted(state, season).size;

  // Average fatigue — use current fatigue as approximation
  const avgFatigue = state.scout.fatigue;

  return {
    reportsSubmitted,
    avgReportQuality,
    matchesAttended,
    playersDiscovered,
    wonderkidsDiscovered,
    transferRecommendations,
    recommendationsAccepted,
    recommendationsSigned,
    hitRate,
    reputationStart,
    reputationEnd,
    reputationChange,
    income,
    expenses,
    profitLoss,
    countriesScouted,
    avgFatigue,
  };
}

// =============================================================================
// SCOUT AWARDS GENERATION
// =============================================================================

function generateScoutAwards(
  state: GameState,
  season: number,
  stats: SeasonStats,
): SeasonAward[] {
  const awards: SeasonAward[] = [];

  // "Golden Eye" — discovered 3+ wonderkids (PA >= threshold)
  const seasonDiscoveries = state.discoveryRecords.filter(
    (d) => d.discoveredSeason === season,
  );
  const wonderkidFinds = seasonDiscoveries.filter((d) => d.wasWonderkid);
  if (wonderkidFinds.length >= 3) {
    awards.push({
      id: "golden-eye",
      name: "Golden Eye",
      description: "Discovered 3 or more wonderkids in a single season",
      criteria: `Found ${wonderkidFinds.length} wonderkids this season`,
      tier: "gold",
    });
  }

  // "Mr. Reliable" — 80%+ report accuracy (avg quality score >= 70)
  if (stats.reportsSubmitted >= 3 && stats.avgReportQuality >= 70) {
    awards.push({
      id: "mr-reliable",
      name: "Mr. Reliable",
      description: "Maintained an average report quality of 70 or above",
      criteria: `Average report quality: ${stats.avgReportQuality}`,
      tier: "gold",
    });
  }

  // "Globe Trotter" — scouted in 3+ countries
  if (stats.countriesScouted >= 3) {
    awards.push({
      id: "globe-trotter",
      name: "Globe Trotter",
      description: "Scouted players across 3 or more countries",
      criteria: `Scouted in ${stats.countriesScouted} countries`,
      tier: "silver",
    });
  }

  // "Rising Star" — reputation increased by 10+ this season
  if (stats.reputationChange >= 10) {
    awards.push({
      id: "rising-star",
      name: "Rising Star",
      description: "Reputation grew by 10 or more points this season",
      criteria: `Reputation rose by ${stats.reputationChange} (${stats.reputationStart} to ${stats.reputationEnd})`,
      tier: "gold",
    });
  }

  // "Moneyball Master" — recommended 2+ players signed for below market value
  const seasonReports = getSeasonReports(state, season);
  const belowMarketSigns = seasonReports.filter((r) => {
    if (r.clubResponse !== "signed") return false;
    const player = state.players[r.playerId];
    if (!player) return false;
    return r.estimatedValue < player.marketValue;
  });
  if (belowMarketSigns.length >= 2) {
    awards.push({
      id: "moneyball-master",
      name: "Moneyball Master",
      description:
        "Recommended 2 or more players who were signed below market value",
      criteria: `${belowMarketSigns.length} players signed below market value`,
      tier: "silver",
    });
  }

  // "Youth Whisperer" — placed 3+ youth players (U21 discoveries that got signed)
  const youthPlacements = seasonReports.filter((r) => {
    if (r.clubResponse !== "signed") return false;
    const player = state.players[r.playerId];
    if (!player) return false;
    return player.age <= WONDERKID_MAX_AGE;
  });
  if (youthPlacements.length >= 3) {
    awards.push({
      id: "youth-whisperer",
      name: "Youth Whisperer",
      description: "Placed 3 or more youth players at clubs this season",
      criteria: `${youthPlacements.length} youth players placed`,
      tier: "silver",
    });
  }

  // "Iron Scout" — completed season with <20% average fatigue
  if (stats.avgFatigue < 20) {
    awards.push({
      id: "iron-scout",
      name: "Iron Scout",
      description:
        "Maintained peak fitness throughout the season with low fatigue",
      criteria: `Average fatigue: ${Math.round(stats.avgFatigue)}%`,
      tier: "bronze",
    });
  }

  // "The Professor" — wrote 15+ reports this season
  if (stats.reportsSubmitted >= 15) {
    awards.push({
      id: "the-professor",
      name: "The Professor",
      description: "Submitted 15 or more scouting reports in a single season",
      criteria: `${stats.reportsSubmitted} reports submitted`,
      tier: "bronze",
    });
  }

  return awards;
}

// =============================================================================
// LEAGUE AWARDS GENERATION
// =============================================================================

function generateLeagueAwards(
  state: GameState,
  season: number,
): LeagueAward[] {
  const awards: LeagueAward[] = [];
  const allPlayers = Object.values(state.players);

  // "Golden Boot" — highest goals scored (simulated from fixtures)
  // Pick a random high-CA striker from the world as the top scorer
  const strikers = allPlayers
    .filter((p) => p.position === "ST" && !p.injured)
    .sort((a, b) => {
      // Higher CA + higher shooting + form = more goals
      const aScore =
        a.currentAbility + a.attributes.shooting * 5 + a.form * 10;
      const bScore =
        b.currentAbility + b.attributes.shooting * 5 + b.form * 10;
      return bScore - aScore;
    });
  if (strikers.length > 0) {
    const topScorer = strikers[0];
    // Estimate goals based on ability (crude but deterministic)
    const estimatedGoals = Math.round(
      10 + (topScorer.attributes.shooting / 20) * 20 + topScorer.form * 2,
    );
    awards.push({
      id: "golden-boot",
      name: "Golden Boot",
      description: `Top scorer of the season with ${estimatedGoals} goals`,
      relatedPlayerId: topScorer.id,
      stat: `${topScorer.firstName} ${topScorer.lastName} — ${estimatedGoals} goals`,
    });
  }

  // "Best Young Player" — highest-rated U21 player
  const youngPlayers = allPlayers
    .filter((p) => p.age <= WONDERKID_MAX_AGE)
    .sort((a, b) => b.currentAbility - a.currentAbility);
  if (youngPlayers.length > 0) {
    const bestYoung = youngPlayers[0];
    awards.push({
      id: "best-young-player",
      name: "Best Young Player",
      description: "Highest-rated player aged 21 or under",
      relatedPlayerId: bestYoung.id,
      stat: `${bestYoung.firstName} ${bestYoung.lastName} (${bestYoung.age}) — CA ${bestYoung.currentAbility}`,
    });
  }

  // "Biggest Transfer" — largest transfer fee from fixture/transfer data
  // Look at the game loop transfers via inbox or clubs' budget changes
  // Use a heuristic: find the highest market value player who changed clubs
  const seasonFixtures = Object.values(state.fixtures).filter(
    (f) => f.played,
  );
  void seasonFixtures; // used for context

  // Find players whose club changed (rough heuristic for transfers)
  const highValuePlayers = allPlayers
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 1);
  if (highValuePlayers.length > 0) {
    const bigTransfer = highValuePlayers[0];
    const club = state.clubs[bigTransfer.clubId];
    const formattedFee =
      bigTransfer.marketValue >= 1_000_000
        ? `${(bigTransfer.marketValue / 1_000_000).toFixed(1)}M`
        : `${(bigTransfer.marketValue / 1_000).toFixed(0)}K`;
    awards.push({
      id: "biggest-transfer",
      name: "Biggest Transfer",
      description: `Most valuable player in the league`,
      relatedPlayerId: bigTransfer.id,
      stat: `${bigTransfer.firstName} ${bigTransfer.lastName} — ${club?.name ?? "Unknown"} (${formattedFee})`,
    });
  }

  // "Breakthrough Discovery" — your best discovery this season (highest PA)
  const seasonDiscoveries = state.discoveryRecords
    .filter((d) => d.discoveredSeason === season)
    .map((d) => ({
      record: d,
      player: state.players[d.playerId],
    }))
    .filter(
      (d): d is { record: typeof d.record; player: Player } =>
        d.player !== undefined,
    )
    .sort((a, b) => b.player.potentialAbility - a.player.potentialAbility);

  if (seasonDiscoveries.length > 0) {
    const best = seasonDiscoveries[0];
    const paStars = Math.min(5, Math.round(best.player.potentialAbility / 40));
    awards.push({
      id: "breakthrough-discovery",
      name: "Breakthrough Discovery",
      description: "Your highest-potential discovery this season",
      relatedPlayerId: best.player.id,
      stat: `${best.player.firstName} ${best.player.lastName} — ${paStars} star potential`,
    });
  }

  return awards;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate the complete season awards data from the current game state.
 *
 * Pure function: no side effects, no mutations.
 *
 * @param state  The game state at end of season (before advancing to new season).
 * @param season The season number that just completed.
 * @returns      SeasonAwardsData containing scout awards, league awards, and stats.
 */
export function generateSeasonAwardsData(
  state: GameState,
  season: number,
): SeasonAwardsData {
  const stats = computeSeasonStats(state, season);
  const scoutAwards = generateScoutAwards(state, season, stats);
  const leagueAwards = generateLeagueAwards(state, season);

  // Determine club name
  const clubId = state.scout.currentClubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  const clubName = club?.name ?? "Freelance";

  return {
    season,
    clubName,
    scoutAwards,
    leagueAwards,
    stats,
  };
}
