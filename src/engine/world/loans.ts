/**
 * Player Loan System — lifecycle engine for loan deals across the game world.
 *
 * Handles AI-driven loan creation, performance tracking, returns, recalls,
 * and outcome evaluation. All functions are pure — no side effects, no I/O.
 *
 * Loan flow:
 *   1. During transfer windows, AI matches loan-out candidates to loan-in clubs.
 *   2. Weekly performance updates track appearances, development, satisfaction.
 *   3. At expiry, players return and the loan outcome is evaluated.
 *   4. Parent clubs may recall players mid-loan under certain conditions.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Player,
  Club,
  LoanDeal,
  LoanPerformanceRecord,
  LoanOutcome,
  LoanRecommendation,
  InboxMessage,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import { getWorldConditionModifiers } from "@/engine/world/worldConditions";
import {
  addGameWeeksWithSeasonLength,
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum loan duration in weeks (roughly half a season). */
const MIN_LOAN_DURATION = 4;
/** Maximum loan duration in weeks (full season). */
const MAX_LOAN_DURATION = 40;
/** Base probability per eligible player per week of being loaned out. */
const AI_LOAN_PROBABILITY = 0.035;
/** Maximum reputation gap (parent - loan club) for a loan to make sense. */
const MAX_REP_GAP = 40;
/** Minimum reputation gap — loans go downhill. */
const MIN_REP_GAP = 5;

// =============================================================================
// ID GENERATION
// =============================================================================

function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// ELIGIBILITY HELPERS
// =============================================================================

/**
 * Check if a player is eligible to be loaned out.
 * - Age < 26 (loan deals rare for older players)
 * - Not already on loan
 * - Not a key player (CA not in top 5 at club)
 * - Contract > 1 season remaining
 */
export function isLoanEligible(
  player: Player,
  club: Club,
  allPlayers: Record<string, Player>,
  currentSeason: number,
): boolean {
  if (player.age < 16 || player.age >= 26) return false;
  if (player.onLoan) return false;
  if ((player.contractClubId ?? player.clubId) !== club.id) return false;
  if (player.contractExpiry <= currentSeason + 1) return false;

  // Check if player is a key player (top 5 CA at the club)
  const squadCAs = club.playerIds
    .map((id) => allPlayers[id]?.currentAbility ?? 0)
    .sort((a, b) => b - a);
  const top5Threshold = squadCAs[4] ?? 0;
  if (player.currentAbility >= top5Threshold && squadCAs.length >= 5) return false;

  return true;
}

/**
 * Find a suitable loan destination for a player.
 * Prefers clubs 1-3 tiers below in reputation that need the player's position.
 */
export function findLoanDestination(
  player: Player,
  parentClub: Club,
  clubs: Record<string, Club>,
  allPlayers: Record<string, Player>,
  rng: RNG,
  leagues?: GameState["leagues"],
): Club | null {
  const candidates: Array<{ item: Club; weight: number }> = [];
  const parentCountry = normalizeCountryKey(leagues?.[parentClub.leagueId]?.country);

  for (const club of Object.values(clubs)) {
    if (club.id === parentClub.id) continue;
    const repGap = parentClub.reputation - club.reputation;
    if (repGap < MIN_REP_GAP || repGap > MAX_REP_GAP) continue;

    // Check budget — club must be able to afford at least 30% wage contribution
    if (club.budget < player.wage * 0.3 * 20) continue; // ~20 weeks of partial wages

    const destinationCountry = normalizeCountryKey(leagues?.[club.leagueId]?.country);
    const isForeign = !!parentCountry && !!destinationCountry && parentCountry !== destinationCountry;
    const transferFlow = parentCountry && destinationCountry
      ? getTransferFlowProbability(parentCountry, destinationCountry)
      : 0.5;
    // Under-18 cross-border loans and unsupported international routes are not
    // credible development moves in this early-access world model.
    if (isForeign && (player.age < 18 || transferFlow < 0.05)) continue;

    // Prefer clubs that need the player's position
    const squadAtPosition = club.playerIds
      .map((id) => allPlayers[id])
      .filter((p): p is Player => !!p && p.position === player.position);

    // Fewer than 2 players in that position = strong need
    if (squadAtPosition.length < 3) {
      const geographyWeight = isForeign ? 0.5 + transferFlow * 2 : 4;
      const needWeight = squadAtPosition.length === 0 ? 2 : squadAtPosition.length === 1 ? 1.5 : 1;
      candidates.push({ item: club, weight: geographyWeight * needWeight });
    }
  }

  if (candidates.length === 0) return null;
  return rng.pickWeighted(candidates);
}

/**
 * Calculate loan terms between two clubs for a given player.
 */
export function calculateLoanTerms(
  player: Player,
  parentClub: Club,
  loanClub: Club,
  currentWeek: number,
  currentSeason: number,
  rng: RNG,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): Omit<LoanDeal, "id" | "status" | "scoutId" | "performanceRecord"> {
  const maximumDuration = Math.max(MAX_LOAN_DURATION, seasonLength);
  // Duration: 4 weeks through the active full-season range.
  const durationOptions = [
    { item: rng.nextInt(MIN_LOAN_DURATION, 15), weight: 30 },  // short loan
    { item: rng.nextInt(16, 25), weight: 40 },                  // half-season
    { item: rng.nextInt(26, maximumDuration), weight: 30 },     // full season
  ];
  const duration = rng.pickWeighted(durationOptions);

  // Calculate end week/season
  const endDate = addGameWeeksWithSeasonLength(
    { week: currentWeek, season: currentSeason },
    duration,
    seasonLength,
  );

  // Loan fee: 5-15% of player's weekly wage × duration
  const feePercent = rng.nextFloat(0.05, 0.15);
  const loanFee = Math.round(player.wage * duration * feePercent);

  // Wage contribution: 30-70% (higher for lower-tier loan clubs)
  const repRatio = loanClub.reputation / parentClub.reputation;
  const baseContribution = 30 + Math.round(repRatio * 40);
  const wageContribution = Math.min(70, Math.max(30, baseContribution + rng.nextInt(-5, 5)));

  // Buy option: 20% chance, set at 1.2× market value
  const hasBuyOption = rng.chance(0.2);
  const buyOptionFee = hasBuyOption
    ? Math.round(player.marketValue * rng.nextFloat(1.1, 1.3))
    : undefined;

  // Recall clause: 40% chance for youth players (age < 21)
  const recallClause = player.age < 21 ? rng.chance(0.4) : rng.chance(0.15);

  return {
    playerId: player.id,
    parentClubId: parentClub.id,
    loanClubId: loanClub.id,
    startWeek: currentWeek,
    startSeason: currentSeason,
    endWeek: endDate.week,
    endSeason: endDate.season,
    loanFee,
    wageContribution,
    buyOptionFee,
    recallClause,
  };
}

// =============================================================================
// LOAN OUTCOME EVALUATION
// =============================================================================

/**
 * Evaluate the outcome of a completed loan deal based on performance.
 */
export function evaluateLoanOutcome(
  deal: LoanDeal,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): LoanOutcome {
  const perf = deal.performanceRecord;
  if (!perf) return "neutral";

  // Calculate possible appearances (rough: 1 per week of loan)
  const durationWeeks = gameWeeksBetweenWithSeasonLength(
    { week: deal.startWeek, season: deal.startSeason },
    { week: deal.endWeek, season: deal.endSeason },
    seasonLength,
  );
  const possibleAppearances = Math.max(1, Math.floor(durationWeeks * 0.7)); // ~70% weeks have fixtures

  const appearanceRate = perf.appearances / possibleAppearances;

  // Buy option exercised: buyOptionFee exists AND loanClubSatisfaction > 75
  if (deal.buyOptionFee && perf.loanClubSatisfaction > 75) {
    return "buy-option-exercised";
  }

  // Successful: appearances > 60% AND development > 0
  if (appearanceRate > 0.6 && perf.developmentDelta > 0) {
    return "successful";
  }

  // Unsuccessful: appearances < 30% OR development declined significantly
  if (appearanceRate < 0.3 || perf.developmentDelta < -2) {
    return "unsuccessful";
  }

  return "neutral";
}

// =============================================================================
// WEEKLY PROCESSING FUNCTIONS
// =============================================================================

/**
 * Process loans expiring this week — return players to parent clubs.
 */
export function processLoanReturns(
  state: GameState,
  week: number,
  season: number,
  rng: RNG,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): { deals: LoanDeal[]; messages: InboxMessage[] } {
  const activeLoans = state.activeLoans ?? [];
  const returning: LoanDeal[] = [];
  const messages: InboxMessage[] = [];

  for (const deal of activeLoans) {
    if (deal.status !== "active") continue;
    if (deal.endWeek === week && deal.endSeason === season) {
      const player = state.players[deal.playerId];
      const parentClub = state.clubs[deal.parentClubId];
      const loanClub = state.clubs[deal.loanClubId];
      let outcome = evaluateLoanOutcome(deal, seasonLength);
      if (
        outcome === "buy-option-exercised" &&
        (!deal.buyOptionFee || (loanClub?.budget ?? 0) < deal.buyOptionFee)
      ) {
        outcome = evaluateLoanOutcome({ ...deal, buyOptionFee: undefined }, seasonLength);
      }
      const completed: LoanDeal = { ...deal, status: "completed", outcome };
      returning.push(completed);

      const playerName = player
        ? `${player.firstName} ${player.lastName}`
        : "Unknown Player";

      if (outcome === "buy-option-exercised") {
        messages.push({
          id: generateId("msg", rng),
          week,
          season,
          type: "transferUpdate",
          title: `Loan Buy Option Exercised: ${playerName}`,
          body: `${loanClub?.shortName ?? deal.loanClubId} has exercised the buy option for ${playerName}, making the move permanent for £${((deal.buyOptionFee ?? 0) / 1000).toFixed(0)}K.`,
          read: false,
          actionRequired: false,
          relatedId: deal.playerId,
          relatedEntityType: "player",
        });
      } else {
        const outcomeText =
          outcome === "successful" ? "a successful loan spell"
          : outcome === "unsuccessful" ? "an unsuccessful loan spell"
          : "an uneventful loan spell";
        messages.push({
          id: generateId("msg", rng),
          week,
          season,
          type: "transferUpdate",
          title: `Loan Return: ${playerName}`,
          body: `${playerName} has returned to ${parentClub?.shortName ?? deal.parentClubId} after ${outcomeText} at ${loanClub?.shortName ?? deal.loanClubId}.${deal.performanceRecord ? ` ${deal.performanceRecord.appearances} appearances, ${deal.performanceRecord.goals} goals.` : ""}`,
          read: false,
          actionRequired: false,
          relatedId: deal.playerId,
          relatedEntityType: "player",
        });
      }
    }
  }

  return { deals: returning, messages };
}

/**
 * Generate AI loan deals during transfer windows.
 */
export function processAILoanDeals(
  state: GameState,
  week: number,
  season: number,
  rng: RNG,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): {
  deals: LoanDeal[];
  messages: InboxMessage[];
  updatedRecommendations: LoanRecommendation[];
  reputationDelta: number;
  xpAward: number;
} {
  const deals: LoanDeal[] = [];
  const messages: InboxMessage[] = [];
  const reservedPlayerIds = new Set<string>();
  let reputationDelta = 0;
  let xpAward = 0;

  const updatedRecommendations = (state.loanRecommendations ?? []).map((recommendation) => {
    if ((recommendation.status ?? "pending") !== "pending") return recommendation;

    const player = state.players[recommendation.playerId];
    const ownerClubId = player
      ? (player.contractClubId ?? player.loanParentClubId ?? player.clubId)
      : "";
    const parentClub = state.clubs[ownerClubId];
    const targetClub = state.clubs[recommendation.targetClubId];
    const rejectRecommendation = (reason: string): LoanRecommendation => {
      const playerName = player ? `${player.firstName} ${player.lastName}` : "The player";
      messages.push({
        id: generateId("msg_loanrec_reject", rng),
        week,
        season,
        type: "clubResponse",
        title: `Loan Recommendation Declined: ${playerName}`,
        body: `${targetClub?.name ?? "The target club"} declined the proposed loan. ${reason}`,
        read: false,
        actionRequired: false,
        relatedId: recommendation.playerId,
        relatedEntityType: "player",
      });
      return {
        ...recommendation,
        status: "rejected",
        responseWeek: week,
        responseSeason: season,
        responseReason: reason,
      };
    };

    if (!player || !parentClub || !targetClub) {
      return rejectRecommendation("The player or one of the clubs is no longer available.");
    }
    if (state.scout.currentClubId !== parentClub.id) {
      return rejectRecommendation("Your current club does not own the player's contract.");
    }
    if (
      reservedPlayerIds.has(player.id) ||
      !isLoanEligible(player, parentClub, state.players, season) ||
      targetClub.id === parentClub.id
    ) {
      return rejectRecommendation("The player is not currently eligible for this loan.");
    }

    const targetPositionCount = targetClub.playerIds.reduce((count, playerId) => (
      state.players[playerId]?.position === player.position ? count + 1 : count
    ), 0);
    const reputationGap = parentClub.reputation - targetClub.reputation;
    if (reputationGap < -10 || reputationGap > 45) {
      return rejectRecommendation("The sporting level is not a credible development match.");
    }
    const parentCountry = normalizeCountryKey(state.leagues?.[parentClub.leagueId]?.country);
    const targetCountry = normalizeCountryKey(state.leagues?.[targetClub.leagueId]?.country);
    const isForeignLoan =
      !!parentCountry && !!targetCountry && parentCountry !== targetCountry;
    const routeProbability = parentCountry && targetCountry
      ? getTransferFlowProbability(parentCountry, targetCountry)
      : 0.5;
    if (isForeignLoan && (player.age < 18 || routeProbability < 0.05)) {
      return rejectRecommendation(
        player.age < 18
          ? "Cross-border loans are not available for under-18 players."
          : "The proposed countries do not have a credible loan pathway.",
      );
    }

    let acceptanceChance = 0.3 + state.scout.reputation / 250;
    if (targetPositionCount === 0) acceptanceChance += 0.2;
    else if (targetPositionCount === 1) acceptanceChance += 0.12;
    else if (targetPositionCount >= 3) acceptanceChance -= 0.15;
    if (recommendation.rationale === "playing-time" && targetPositionCount <= 1) {
      acceptanceChance += 0.08;
    }
    if (recommendation.rationale === "development" && targetClub.youthAcademyRating >= 12) {
      acceptanceChance += 0.08;
    }
    acceptanceChance += isForeignLoan ? (routeProbability - 0.5) * 0.2 : 0.08;
    const seasonalRecruitmentAdjustment = getWorldConditionModifiers(
      state,
      targetCountry,
    ).recruitmentScoreAdjustment;
    acceptanceChance += seasonalRecruitmentAdjustment / 100;
    acceptanceChance = Math.max(0.1, Math.min(0.9, acceptanceChance));
    if (!rng.chance(acceptanceChance)) {
      return rejectRecommendation("The club could not guarantee a suitable role or financial package.");
    }

    const duration = Math.max(
      MIN_LOAN_DURATION,
      Math.min(
        Math.max(MAX_LOAN_DURATION, seasonLength),
        Math.round(recommendation.suggestedDuration),
      ),
    );
    const endDate = addGameWeeksWithSeasonLength(
      { week, season },
      duration,
      seasonLength,
    );
    const wageContribution = Math.max(
      0,
      Math.min(100, Math.round(recommendation.suggestedWageContribution)),
    );
    const loanFee = Math.max(
      0,
      Math.round(player.wage * duration * rng.nextFloat(0.05, 0.12)),
    );
    const wageCommitment = Math.round(player.wage * duration * wageContribution / 100);
    if (targetClub.budget < loanFee + wageCommitment) {
      return rejectRecommendation("The club cannot fund the fee and agreed wage contribution.");
    }

    const deal: LoanDeal = {
      id: generateId("loan", rng),
      playerId: player.id,
      parentClubId: parentClub.id,
      loanClubId: targetClub.id,
      startWeek: week,
      startSeason: season,
      endWeek: endDate.week,
      endSeason: endDate.season,
      loanFee,
      wageContribution,
      buyOptionFee: rng.chance(0.15)
        ? Math.round(player.marketValue * rng.nextFloat(1.1, 1.3))
        : undefined,
      recallClause: player.age < 21 ? rng.chance(0.65) : rng.chance(0.25),
      agreedPlayingTime:
        targetPositionCount === 0 ? "key" : targetPositionCount === 1 ? "regular" : "rotation",
      startCurrentAbility: player.currentAbility,
      scoutId: recommendation.scoutId,
      status: "active",
      performanceRecord: {
        appearances: 0,
        goals: 0,
        assists: 0,
        avgRating: 6,
        developmentDelta: 0,
        parentClubSatisfaction: 50,
        loanClubSatisfaction: 50,
      },
    };
    deals.push(deal);
    reservedPlayerIds.add(player.id);
    reputationDelta += 3;
    xpAward += 15;
    messages.push({
      id: generateId("msg_loanrec_accept", rng),
      week,
      season,
      type: "clubResponse",
      title: `Loan Recommendation Accepted: ${player.firstName} ${player.lastName}`,
      body: `${targetClub.name} accepted your recommendation. ${player.firstName} will join for ${duration} weeks as a ${deal.agreedPlayingTime} player, with ${wageContribution}% of wages covered. (+3 reputation, +15 scouting XP)`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
      relatedEntityType: "player",
    });
    return {
      ...recommendation,
      status: "accepted" as const,
      loanDealId: deal.id,
      responseWeek: week,
      responseSeason: season,
      responseReason: "Target club accepted the proposed development plan.",
    };
  });

  const scoutedPlayerIds = new Set(
    Object.values(state.reports).map((report) => report.playerId),
  );
  for (const player of Object.values(state.players)) {
    if (reservedPlayerIds.has(player.id)) continue;
    const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    const club = state.clubs[ownerClubId];
    if (!club || !isLoanEligible(player, club, state.players, season)) continue;
    if (!rng.chance(AI_LOAN_PROBABILITY)) continue;
    if ((club.loanedOutPlayerIds ?? []).includes(player.id)) continue;

    const destination = findLoanDestination(
      player,
      club,
      state.clubs,
      state.players,
      rng,
      state.leagues,
    );
    if (!destination) continue;
    const terms = calculateLoanTerms(
      player,
      club,
      destination,
      week,
      season,
      rng,
      seasonLength,
    );
    const durationWeeks = Math.max(
      1,
      gameWeeksBetweenWithSeasonLength(
        { week: terms.startWeek, season: terms.startSeason },
        { week: terms.endWeek, season: terms.endSeason },
        seasonLength,
      ),
    );
    const totalCommitment = terms.loanFee + Math.round(
      player.wage * durationWeeks * terms.wageContribution / 100,
    );
    if (destination.budget < totalCommitment) continue;
    const deal: LoanDeal = {
      id: generateId("loan", rng),
      ...terms,
      agreedPlayingTime: "rotation",
      startCurrentAbility: player.currentAbility,
      status: "active",
      performanceRecord: {
        appearances: 0,
        goals: 0,
        assists: 0,
        avgRating: 6,
        developmentDelta: 0,
        parentClubSatisfaction: 50,
        loanClubSatisfaction: 50,
      },
    };
    deals.push(deal);
    reservedPlayerIds.add(player.id);

    if (scoutedPlayerIds.has(player.id)) {
      const playerName = `${player.firstName} ${player.lastName}`;
      messages.push({
        id: generateId("msg", rng),
        week,
        season,
        type: "transferUpdate",
        title: `Loan Move: ${playerName}`,
        body: `${playerName} has joined ${destination.shortName} on loan from ${club.shortName} until week ${terms.endWeek} of season ${terms.endSeason}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player",
      });
    }
  }

  return { deals, messages, updatedRecommendations, reputationDelta, xpAward };
}

/**
 * Update performance records for all active loans.
 */
export function processLoanPerformance(
  state: GameState,
  week: number,
  season: number,
  rng: RNG,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): LoanDeal[] {
  const activeLoans = state.activeLoans ?? [];
  const updatedLoans: LoanDeal[] = [];
  // Fixture availability is shared by every active loan. Index it once rather
  // than scanning the complete world schedule separately for every deal.
  const clubsWithFixture = new Set<string>();
  for (const fixture of Object.values(state.fixtures)) {
    if (!isFixtureInSeason(fixture, season) || fixture.week !== week) continue;
    clubsWithFixture.add(fixture.homeClubId);
    clubsWithFixture.add(fixture.awayClubId);
  }

  for (const deal of activeLoans) {
    if (deal.status !== "active") {
      updatedLoans.push(deal);
      continue;
    }

    const player = state.players[deal.playerId];
    if (!player) {
      updatedLoans.push(deal);
      continue;
    }

    const perf = deal.performanceRecord ?? {
      appearances: 0,
      goals: 0,
      assists: 0,
      avgRating: 6.0,
      developmentDelta: 0,
      parentClubSatisfaction: 50,
      loanClubSatisfaction: 50,
    };

    // Check if loan club has a fixture this week
    const loanClub = state.clubs[deal.loanClubId];
    const hasFixture = loanClub ? clubsWithFixture.has(loanClub.id) : false;

    const playingTimeChance = {
      key: 0.92,
      regular: 0.78,
      rotation: 0.55,
      prospect: 0.35,
    }[deal.agreedPlayingTime ?? "rotation"];
    const appeared = hasFixture && !player.injured && rng.chance(playingTimeChance);

    const newAppearances = perf.appearances + (appeared ? 1 : 0);
    const newGoals = perf.goals + (appeared && rng.chance(0.08) ? 1 : 0);
    const newAssists = perf.assists + (appeared && rng.chance(0.06) ? 1 : 0);

    // Running average rating
    let newAvgRating: number;
    if (appeared) {
      const matchRating = 5.5 + rng.nextFloat(0, 2.5) + player.form * 0.3;
      const clampedRating = Math.max(4.0, Math.min(9.5, matchRating));
      const totalRatingPoints = perf.avgRating * perf.appearances + clampedRating;
      newAvgRating = newAppearances > 0 ? totalRatingPoints / newAppearances : 6.0;
    } else {
      newAvgRating = perf.avgRating;
    }

    // Development is produced by the central player-development engine. Loans
    // measure that real change instead of inventing a second CA progression.
    const startCurrentAbility = deal.startCurrentAbility
      ?? (player.currentAbility - perf.developmentDelta);
    const newDevDelta = player.currentAbility - startCurrentAbility;

    // Satisfaction calculations
    const elapsedWeeks = Math.max(
      1,
      gameWeeksBetweenWithSeasonLength(
        { week: deal.startWeek, season: deal.startSeason },
        { week, season },
        seasonLength,
      ) + 1,
    );
    const appearanceRate = newAppearances / elapsedWeeks;
    const parentSatisfaction = Math.min(100, Math.max(0,
      50 + (appearanceRate > 0.5 ? 20 : -10) + newDevDelta * 5,
    ));
    const loanSatisfaction = Math.min(100, Math.max(0,
      50 + (newAvgRating > 6.5 ? 15 : -10) + (appeared ? 5 : -3),
    ));

    updatedLoans.push({
      ...deal,
      startCurrentAbility,
      performanceRecord: {
        appearances: newAppearances,
        goals: newGoals,
        assists: newAssists,
        avgRating: Math.round(newAvgRating * 10) / 10,
        developmentDelta: newDevDelta,
        parentClubSatisfaction: Math.round(parentSatisfaction),
        loanClubSatisfaction: Math.round(loanSatisfaction),
      },
    });
  }

  return updatedLoans;
}

/**
 * Process loan recalls — parent clubs may recall players mid-loan.
 */
export function processLoanRecalls(
  state: GameState,
  week: number,
  season: number,
  rng: RNG,
): { deals: LoanDeal[]; messages: InboxMessage[] } {
  const activeLoans = state.activeLoans ?? [];
  const recalled: LoanDeal[] = [];
  const messages: InboxMessage[] = [];

  for (const deal of activeLoans) {
    if (deal.status !== "active") continue;
    if (!deal.recallClause) continue;

    const parentClub = state.clubs[deal.parentClubId];
    if (!parentClub) continue;

    // Check for injury crisis at parent club: 3+ injured in same position
    const player = state.players[deal.playerId];
    if (!player) continue;

    const samePositionPlayers = parentClub.playerIds
      .map((id) => state.players[id])
      .filter((p): p is Player => !!p && p.position === player.position);
    const injuredInPosition = samePositionPlayers.filter((p) => p.injured).length;

    let recallChance = 0;
    let reason = "";

    if (injuredInPosition >= 3) {
      recallChance = 0.6;
      reason = "injury crisis";
    } else if (
      deal.performanceRecord &&
      deal.performanceRecord.avgRating > 7.5 &&
      deal.performanceRecord.developmentDelta > 3
    ) {
      recallChance = 0.25;
      reason = "exceptional performance";
    }

    if (recallChance > 0 && rng.chance(recallChance)) {
      recalled.push({ ...deal, status: "recalled" });

      const playerName = `${player.firstName} ${player.lastName}`;
      const loanClub = state.clubs[deal.loanClubId];
      messages.push({
        id: generateId("msg", rng),
        week,
        season,
        type: "transferUpdate",
        title: `Loan Recall: ${playerName}`,
        body: `${parentClub.shortName} has recalled ${playerName} from ${loanClub?.shortName ?? deal.loanClubId} due to ${reason}.`,
        read: false,
        actionRequired: false,
        relatedId: deal.playerId,
        relatedEntityType: "player",
      });
    }
  }

  return { deals: recalled, messages };
}
