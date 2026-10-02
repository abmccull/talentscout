import { expandPlayerMovementHistory, expandPlayerMovementSummaries } from "@/engine/world/movementRowsArchive";
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
import { deriveSeasonReviewMetrics } from "../career/seasonReviewContext";
import { annualizeWeeklyAmount } from "./annualization";
import { collectCanonicalAppearances, summarizeCanonicalAppearances } from "../match/canonicalPerformance";
import { expandSeasonRating } from "../players/seasonRatingArchive";
import { expandPlayerMovementSummary, type PlayerMovementArchiveSummary } from "../world/worldHistoryTypes";
import { selectLatestReportsByCaseOpenedInRange } from "../reports/reportAccountability";

// =============================================================================
// CONSTANTS
// =============================================================================

const YOUTH_MAX_AGE = 21;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get all reports submitted in the given season.
 */
function getSeasonReports(state: GameState, season: number): ScoutReport[] {
  return selectLatestReportsByCaseOpenedInRange(
    Object.values(state.reports).filter((report) => report.scoutId === state.scout.id),
    { submittedSeason: season, submittedWeek: Number.MIN_SAFE_INTEGER },
    { submittedSeason: season, submittedWeek: Number.MAX_SAFE_INTEGER },
  );
}

/**
 * Get unique countries scouted this season from actual season activity.
 */
function getCountriesScouted(state: GameState, season: number): Set<string> {
  return new Set(
    deriveSeasonReviewMetrics(state, season).countriesScoutedThisSeason,
  );
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
  const highUpsideCalls = seasonReports.filter(
    (report) =>
      report.qualityScore >= 65 &&
      report.perceivedPARange !== undefined &&
      report.perceivedPARange[1] >= 4,
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
        .filter((t) => t.kind !== "openingBalance" && t.season === season && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0)
    : annualizeWeeklyAmount(state.scout.salary);
  const expenses = finances
    ? finances.transactions
        .filter((t) => t.kind !== "openingBalance" && t.season === season && t.amount < 0)
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
    highUpsideCalls,
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

  // "Golden Eye" rewards well-supported high-upside calls without revealing
  // whether the engine considers those players true wonderkids.
  const highUpsideCalls = stats.highUpsideCalls ?? 0;
  if (highUpsideCalls >= 3) {
    awards.push({
      id: "golden-eye",
      name: "Golden Eye",
      description: "Filed 3 or more evidence-rich, high-upside reports in one season",
      criteria: `${highUpsideCalls} high-upside calls this season`,
      tier: "gold",
    });
  }

  // "Mr. Reliable" — 80%+ report accuracy (avg quality score >= 70)
  if (stats.reportsSubmitted >= 3 && stats.avgReportQuality >= 70) {
    awards.push({
      id: "mr-reliable",
      name: "Mr. Reliable",
      description: "Maintained an average report craft score of 70 or above",
      criteria: `Average report craft: ${stats.avgReportQuality}`,
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
    return player.age <= YOUTH_MAX_AGE;
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

type RecordedAwardPerformance = {
  appearances: number;
  averageRating: number;
  goals: number;
};
const MIN_RECORDED_AWARD_APPEARANCES = 6;

function isRecordedPerformance(value: RecordedAwardPerformance | undefined): value is RecordedAwardPerformance {
  return value !== undefined && Number.isInteger(value.appearances) && value.appearances > 0
    && Number.isFinite(value.averageRating) && value.averageRating >= 0 && value.averageRating <= 10
    && Number.isInteger(value.goals) && value.goals >= 0;
}

/** Complete current totals are archived before raw fixture retention/retirement. */
function recordedSeasonPerformances(state: GameState, season: number): Map<string, RecordedAwardPerformance> {
  const result = new Map<string, RecordedAwardPerformance>();
  for (const player of Object.values({ ...state.retiredPlayers, ...state.players })) {
    const row = (player.seasonRatings ?? []).map(expandSeasonRating).find(record => record.season === season);
    const performance = row && { appearances: row.appearances, averageRating: row.avgRating, goals: row.goals };
    if (isRecordedPerformance(performance)) result.set(player.id, performance);
  }
  const archived = state.worldHistory?.seasons.find(record => record.season === season);
  for (const row of archived?.players ?? []) {
    if (!result.has(row.playerId) && isRecordedPerformance(row.performance)) result.set(row.playerId, row.performance);
  }
  // A completed past season's surviving observed fixtures are only a subset.
  // The shared collector is a fallback for a still-live, unpruned season.
  if (state.currentSeason === season) {
    for (const [playerId, appearances] of collectCanonicalAppearances(state.fixtures ?? {}, state.matchRatings ?? {}, season)) {
      const performance = summarizeCanonicalAppearances(appearances);
      if (!result.has(playerId) && isRecordedPerformance(performance)) result.set(playerId, performance);
    }
  }
  return result;
}

function generateLeagueAwards(state: GameState, season: number): LeagueAward[] {
  const awards: LeagueAward[] = [];
  const players: Record<string, Player> = { ...state.retiredPlayers, ...state.players };
  const archivedSeason = state.worldHistory?.seasons.find(record => record.season === season);
  const identities = new Map((archivedSeason?.players ?? []).map(row => [row.playerId, row]));
  const name = (id: string): string | undefined => {
    const identity = players[id] ?? identities.get(id);
    return identity?.firstName && identity.lastName ? `${identity.firstName} ${identity.lastName}` : undefined;
  };
  const seasonAge = (id: string): number | undefined => {
    const archivedAge = identities.get(id)?.age;
    if (archivedAge !== undefined) return archivedAge;
    const player = players[id];
    if (!player) return undefined;
    // Active players age after the completed-season snapshot; same-tick
    // retired players retain their completed-season age.
    return player.age - (state.players[id] ? Math.max(0, state.currentSeason - season) : 0);
  };
  const performance = recordedSeasonPerformances(state, season);
  const candidates = [...performance].filter(([id]) => name(id) !== undefined);
  const byPerformance = (left: typeof candidates[number], right: typeof candidates[number]) =>
    right[1].averageRating - left[1].averageRating || right[1].appearances - left[1].appearances
    || left[0].localeCompare(right[0]);

  const topScorer = candidates.filter(([, row]) => row.goals > 0)
    .sort((left, right) => right[1].goals - left[1].goals || byPerformance(left, right))[0];
  if (topScorer) awards.push({
    id: "golden-boot", name: "Golden Boot", relatedPlayerId: topScorer[0],
    description: `Top recorded scorer of the season with ${topScorer[1].goals} goals`,
    stat: `${name(topScorer[0])} — ${topScorer[1].goals} goals`,
  });

  const bestYoung = candidates.filter(([id, row]) => {
    const age = seasonAge(id);
    return age !== undefined && age <= YOUTH_MAX_AGE && age >= 0
      && row.appearances >= MIN_RECORDED_AWARD_APPEARANCES;
  }).sort(byPerformance)[0];
  if (bestYoung) awards.push({
    id: "best-young-player", name: "Best Young Player", relatedPlayerId: bestYoung[0],
    description: "Highest recorded average rating aged 21 or under, with at least 6 appearances",
    stat: `${name(bestYoung[0])} (${seasonAge(bestYoung[0])}) — ${bestYoung[1].averageRating.toFixed(1)} average rating, ${bestYoung[1].appearances} appearances`,
  });

  const movements = new Map<string, PlayerMovementArchiveSummary>();
  for (const stored of expandPlayerMovementSummaries(archivedSeason?.playerMovementSummaries ?? [])) {
    const movement = expandPlayerMovementSummary(stored);
    movements.set(movement.id, movement);
  }
  for (const movement of expandPlayerMovementHistory(state.playerMovementHistory ?? [])) {
    if (movement.season === season) movements.set(movement.id, movement);
  }
  const biggest = [...movements.values()].filter(movement =>
    (movement.type === "permanentTransfer" || movement.type === "loanBuyOption")
    && typeof movement.fee === "number" && Number.isFinite(movement.fee) && movement.fee > 0
    && Boolean(movement.toClubId) && movement.fromClubId !== movement.toClubId && name(movement.playerId) !== undefined,
  ).sort((left, right) => (right.fee ?? 0) - (left.fee ?? 0) || left.id.localeCompare(right.id))[0];
  if (biggest) {
    const fee = biggest.fee!;
    const formattedFee = fee >= 1_000_000 ? `£${(fee / 1_000_000).toFixed(1)}M` : `£${(fee / 1_000).toFixed(0)}K`;
    awards.push({ id: "biggest-transfer", name: "Biggest Transfer", relatedPlayerId: biggest.playerId,
      description: "Largest recorded permanent transfer fee this season",
      stat: `${name(biggest.playerId)} — ${state.clubs[biggest.toClubId!]?.name ?? "their new club"} (${formattedFee})` });
  }

  // Older rating aggregates can be partial. The prior immutable WorldHistory
  // performance owns comparison; an absent prior record is unknown, not zero.
  const prior = new Map((state.worldHistory?.seasons.find(record => record.season === season - 1)?.players ?? [])
    .map(row => [row.playerId, row.performance]));
  const discoveries = state.discoveryRecords.filter(record => record.discoveredSeason === season)
    .map(record => {
      const current = performance.get(record.playerId);
      const previous = prior.get(record.playerId);
      if (!isRecordedPerformance(current) || !isRecordedPerformance(previous) || name(record.playerId) === undefined
        || current.appearances < MIN_RECORDED_AWARD_APPEARANCES || previous.appearances < MIN_RECORDED_AWARD_APPEARANCES) return undefined;
      const improvement = Math.round((current.averageRating - previous.averageRating) * 10) / 10;
      return improvement > 0 ? { playerId: record.playerId, current, previous, improvement } : undefined;
    }).filter((row): row is NonNullable<typeof row> => row !== undefined)
    .sort((left, right) => right.improvement - left.improvement
      || right.current.averageRating - left.current.averageRating || left.playerId.localeCompare(right.playerId));
  const breakthrough = discoveries[0];
  if (breakthrough) awards.push({
    id: "breakthrough-discovery", name: "Breakthrough Discovery", relatedPlayerId: breakthrough.playerId,
    description: "Largest recorded season-to-season rating improvement among your discoveries this season",
    stat: `${name(breakthrough.playerId)} — ${breakthrough.previous.averageRating.toFixed(1)} to ${breakthrough.current.averageRating.toFixed(1)} average rating (+${breakthrough.improvement.toFixed(1)})`,
  });
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
