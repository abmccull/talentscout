/**
 * Report Marketplace — independent scouts list reports for sale. AI clubs
 * place bids over a 1-2 week window, and the scout decides which to accept.
 *
 * All functions are pure: (state, rng) => newState.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  ReportListing,
  ScoutReport,
  Scout,
  Club,
  ClientRelationship,
  ConvictionLevel,
  MarketTemperature,
  MarketplaceBid,
  InboxMessage,
  Player,
  Position,
} from "../core/types";
import {
  ensureClientRelationship,
  recordClientDelivery,
} from "./clientRelationships";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base price ranges by conviction level */
const BASE_PRICES: Record<ConvictionLevel, [number, number]> = {
  note: [100, 200],
  recommend: [400, 800],
  strongRecommend: [1200, 2000],
  tablePound: [3000, 5000],
};

/** Maximum weeks a listing stays active before expiring */
const MAX_LISTING_AGE_WEEKS = 8;

/** Base probability per club per listing of generating a bid */
const BASE_BID_PROBABILITY = 0.20;

/** Priority multipliers for bid amounts */
const PRIORITY_MULTIPLIERS: Record<string, number> = {
  critical: 1.3,
  high: 1.15,
  medium: 1.0,
  low: 0.85,
};

/** Positions that are "adjacent" for need matching */
const ADJACENT_POSITIONS: Record<Position, Position[]> = {
  GK: [],
  CB: ["CDM"],
  LB: ["CB", "LW"],
  RB: ["CB", "RW"],
  CDM: ["CB", "CM"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "ST", "LW", "RW"],
  LW: ["LB", "CAM"],
  RW: ["RB", "CAM"],
  ST: ["CAM"],
};

// ---------------------------------------------------------------------------
// Accuracy helper
// ---------------------------------------------------------------------------

/**
 * Compute a scout's accuracy score from their recent prediction history.
 * Same formula as performancePulse.ts: 100 - |predictedCA - actualCA| * 2,
 * averaged over the last 20 entries. Returns 50 (neutral) when no data.
 */
function computeAccuracyScore(
  accuracyHistory: { predictedCA: number; actualCA: number }[] | undefined,
): number {
  if (!accuracyHistory || accuracyHistory.length === 0) return 50;
  const recent = accuracyHistory.slice(-20);
  return (
    recent.reduce((sum, a) => {
      const diff = Math.abs(a.predictedCA - a.actualCA);
      return sum + Math.max(0, 100 - diff * 2);
    }, 0) / recent.length
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Calculate the suggested price for a report listing.
 *
 * Formula: BASE × quality × clubTier × exclusivity × urgency × reputation × specMatch
 */
export function calculateReportPrice(
  report: ScoutReport,
  scout: Scout,
  targetClub: Club | undefined,
  isExclusive: boolean,
  marketTemperature: MarketTemperature,
): number {
  const conviction = report.conviction;
  const [low, high] = BASE_PRICES[conviction];
  const base = (low + high) / 2;

  // Quality multiplier (0.5x to 1.5x based on report quality 0-100)
  const qualityMult = 0.5 + (report.qualityScore / 100);

  // Club tier multiplier (if targeted to a specific club)
  const clubTierMult = targetClub ? 0.5 + (targetClub.reputation / 100) : 1.0;

  // Exclusivity premium
  const exclusivityMult = isExclusive ? 2.0 : 1.0;

  // Market temperature urgency
  const urgencyMult: Record<MarketTemperature, number> = {
    cold: 0.7,
    normal: 1.0,
    hot: 1.3,
    deadline: 1.8,
  };
  const marketMult = urgencyMult[marketTemperature];

  // Reputation multiplier (0.8x to 1.4x)
  const repMult = 0.8 + (scout.reputation / 100) * 0.6;

  const price = Math.round(base * qualityMult * clubTierMult * exclusivityMult * marketMult * repMult);
  return Math.max(50, price);
}

/**
 * Estimate a price range for a report before submission.
 * Uses pre-submission data (conviction, quality preview score, scout reputation,
 * market temperature) to give the player pricing guidance while writing.
 */
export function estimateReportPriceRange(
  conviction: ConvictionLevel,
  qualityPreviewScore: number,
  scoutReputation: number,
  marketTemperature: MarketTemperature,
): {
  nonExclusive: number;
  exclusive: number;
  low: number;
  high: number;
  marketTemperature: MarketTemperature;
} {
  const [baseLow, baseHigh] = BASE_PRICES[conviction];
  const base = (baseLow + baseHigh) / 2;

  // Quality multiplier (0.5x to 1.5x based on quality 0-100)
  const qualityMult = 0.5 + (qualityPreviewScore / 100);

  // Market temperature urgency
  const urgencyMult: Record<MarketTemperature, number> = {
    cold: 0.7,
    normal: 1.0,
    hot: 1.3,
    deadline: 1.8,
  };
  const marketMult = urgencyMult[marketTemperature];

  // Reputation multiplier (0.8x to 1.4x)
  const repMult = 0.8 + (scoutReputation / 100) * 0.6;

  const nonExclusive = Math.max(50, Math.round(base * qualityMult * marketMult * repMult));
  const exclusive = Math.max(50, Math.round(nonExclusive * 2.0));

  // Range: ±20% to show variance from actual bids
  const low = Math.max(50, Math.round(nonExclusive * 0.8));
  const high = Math.round(exclusive * 1.2);

  return { nonExclusive, exclusive, low, high, marketTemperature };
}

// ---------------------------------------------------------------------------
// Need matching
// ---------------------------------------------------------------------------

/**
 * Score how well a report matches a club's needs (0-110).
 * Uses roster gaps and report quality as proxy for directive matching.
 */
function calculateNeedMatchScore(
  report: ScoutReport,
  player: Player | undefined,
  club: Club,
  allPlayers: Record<string, Player>,
): number {
  let score = 0;

  // 1. Quality factor (0-30 pts)
  score += Math.round((report.qualityScore / 100) * 30);

  // 2. Conviction factor (0-20 pts)
  const convictionPts: Record<ConvictionLevel, number> = {
    note: 5,
    recommend: 10,
    strongRecommend: 16,
    tablePound: 20,
  };
  score += convictionPts[report.conviction];

  if (!player) return score;

  // 3. Position need (0-35 pts) — fewer players in that position = higher need
  const rosterPlayers = club.playerIds
    .map((id) => allPlayers[id])
    .filter(Boolean);
  const positionCount = rosterPlayers.filter(
    (p) => p.position === player.position,
  ).length;

  if (positionCount <= 1) {
    score += 35; // Critical need
  } else if (positionCount === 2) {
    score += 25;
  } else if (positionCount === 3) {
    score += 15;
  } else {
    // Check adjacent positions
    const adjacent = ADJACENT_POSITIONS[player.position] ?? [];
    const adjacentCount = rosterPlayers.filter((p) =>
      adjacent.includes(p.position),
    ).length;
    score += adjacentCount <= 2 ? 10 : 5;
  }

  // 4. Age fit for club philosophy (0-15 pts)
  if (club.scoutingPhilosophy === "academyFirst" && player.age <= 21) {
    score += 15;
  } else if (club.scoutingPhilosophy === "marketSmart" && player.age <= 25) {
    score += 12;
  } else if (club.scoutingPhilosophy === "globalRecruiter") {
    score += 10;
  } else if (player.age >= 18 && player.age <= 30) {
    score += 8;
  }

  // 5. Budget-appropriate (0-10 pts)
  const repTier = club.reputation > 70 ? "top" : club.reputation > 40 ? "mid" : "low";
  const playerCA = report.perceivedCAStars ?? 0;
  if (
    (repTier === "top" && playerCA >= 3.0) ||
    (repTier === "mid" && playerCA >= 2.0 && playerCA <= 4.0) ||
    (repTier === "low" && playerCA >= 1.0 && playerCA <= 3.0)
  ) {
    score += 10;
  }

  return Math.min(110, score);
}

/**
 * Derive a priority string from need match score.
 */
function derivePriority(needMatchScore: number): string {
  if (needMatchScore >= 85) return "critical";
  if (needMatchScore >= 65) return "high";
  if (needMatchScore >= 45) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Listing management
// ---------------------------------------------------------------------------

/**
 * Create a new report listing on the marketplace.
 */
export function listReport(
  finances: FinancialRecord,
  reportId: string,
  price: number,
  isExclusive: boolean,
  targetClubId: string | undefined,
  week: number,
  season: number,
): FinancialRecord {
  const listing: ReportListing = {
    id: `listing_${reportId}_${week}_${season}`,
    reportId,
    price,
    isExclusive,
    targetClubId,
    status: "active",
    listedWeek: week,
    listedSeason: season,
    bids: [],
    biddingEndsWeek: week + 2,
    biddingEndsSeason: season,
  };

  return {
    ...finances,
    reportListings: [...finances.reportListings, listing],
  };
}

/**
 * Withdraw an active listing from the marketplace.
 * Also withdraws all pending bids.
 */
export function withdrawListing(
  finances: FinancialRecord,
  listingId: string,
): FinancialRecord {
  return {
    ...finances,
    reportListings: finances.reportListings.map((l) =>
      l.id === listingId && l.status === "active"
        ? {
            ...l,
            status: "withdrawn" as const,
            bids: l.bids.map((b) =>
              b.status === "pending" ? { ...b, status: "withdrawn" as const } : b,
            ),
          }
        : l,
    ),
  };
}

/**
 * Expire listings older than MAX_LISTING_AGE_WEEKS.
 * Also expires all pending bids on expired listings.
 */
export function expireOldListings(
  finances: FinancialRecord,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord {
  const updated = finances.reportListings.map((listing) => {
    if (listing.status !== "active") return listing;

    // Calculate age — simplified: same-season only for now
    const age = listing.listedSeason === currentSeason
      ? currentWeek - listing.listedWeek
      : currentWeek + (38 - listing.listedWeek); // Cross-season approximation

    if (age >= MAX_LISTING_AGE_WEEKS) {
      return {
        ...listing,
        status: "expired" as const,
        bids: listing.bids.map((b) =>
          b.status === "pending" ? { ...b, status: "expired" as const } : b,
        ),
      };
    }
    return listing;
  });

  return { ...finances, reportListings: updated };
}

// ---------------------------------------------------------------------------
// Bidding system
// ---------------------------------------------------------------------------

/**
 * Generate bids for a single listing from interested clubs.
 */
function generateBidsForListing(
  rng: RNG,
  listing: ReportListing,
  report: ScoutReport,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  scout: Scout,
  week: number,
  season: number,
  clientRelationships: ClientRelationship[],
): { bids: MarketplaceBid[]; inboxMessages: InboxMessage[] } {
  const newBids: MarketplaceBid[] = [];
  const messages: InboxMessage[] = [];

  const player = players[report.playerId];

  // Accuracy premium — same for all clubs on this listing (0.90x to 1.15x)
  const accuracyScore = computeAccuracyScore(scout.accuracyHistory);
  const accuracyMult = 0.85 + (accuracyScore / 100) * 0.35;

  // Determine candidate clubs
  const candidateClubs = listing.targetClubId
    ? [clubs[listing.targetClubId]].filter(Boolean) as Club[]
    : Object.values(clubs).filter((c) => c.budget >= listing.price * 0.5);

  // Listing age factor: week 1 bids are less likely
  const listingAge = week - listing.listedWeek + (season - listing.listedSeason) * 38;
  const listingAgeFactor = listingAge <= 1 ? 0.7 : 1.0;

  for (const club of candidateClubs) {
    // Skip if club already has a pending bid on this listing
    const hasPending = listing.bids.some(
      (b) => b.clubId === club.id && b.status === "pending",
    );
    if (hasPending) continue;

    const needMatchScore = calculateNeedMatchScore(report, player, club, players);

    // Only bid if score > 40
    if (needMatchScore <= 40) continue;

    // Bid probability
    const affordability = Math.min(1, club.budget / (listing.price * 10));
    const scoutRep = Math.max(0.1, scout.reputation / 100);
    const marketTemp = scout.careerPath === "independent"
      ? ({ hot: 1.3, normal: 1.0, cold: 0.7, deadline: 1.5 } as Record<MarketTemperature, number>)[
          "normal" // Use listing's market temperature if available
        ]
      : 1.0;

    const probability =
      BASE_BID_PROBABILITY *
      (needMatchScore / 110) *
      affordability *
      scoutRep *
      marketTemp *
      listingAgeFactor;

    if (!rng.chance(Math.min(0.6, probability))) continue;

    // Calculate bid amount
    const priority = derivePriority(needMatchScore);
    const priorityMult = PRIORITY_MULTIPLIERS[priority] ?? 1.0;
    const needMult = 0.7 + (needMatchScore / 110) * 0.6; // 0.7-1.3
    const budgetMult = 0.8 + Math.min(0.4, (club.budget / 100000) * 0.4); // 0.8-1.2
    const competitionMult = 1.0 + listing.bids.filter((b) => b.status === "pending").length * 0.1;
    const noise = 1.0 + rng.gaussian(0, 0.08);

    // Repeat buyer premium — clubs with purchase history pay more (1.00x to 1.20x)
    const relationship = clientRelationships.find((cr) => cr.clubId === club.id);
    const reportsDelivered = relationship?.totalReportsDelivered ?? 0;
    const repeatBuyerMult = 1.0 + Math.min(10, reportsDelivered) * 0.03;

    let amount = Math.round(
      listing.price * needMult * budgetMult * priorityMult * competitionMult
      * repeatBuyerMult * accuracyMult * noise,
    );
    amount = Math.max(
      Math.round(listing.price * 0.6),
      Math.min(Math.round(listing.price * 2.5), amount),
    );

    const bidExpiry = week + rng.nextInt(2, 3);

    // Derive human-readable bid reason
    const positionCount = player
      ? Object.values(players).filter(
          (p) => club.playerIds.includes(p.id) && p.position === player.position,
        ).length
      : 3;
    const positionNeed = positionCount <= 1 ? "critical" : positionCount === 2 ? "high" : "moderate";
    const reasons: string[] = [];
    reasons.push(`${positionNeed} need at ${player?.position ?? "?"}`);
    if (repeatBuyerMult > 1.0) reasons.push(`repeat buyer (${reportsDelivered} prior)`);
    if (accuracyMult > 1.05) reasons.push(`accuracy premium`);
    if (competitionMult > 1.0) reasons.push(`${listing.bids.filter((b) => b.status === "pending").length} competing bids`);
    const bidReason = reasons.join(" · ");

    const bid: MarketplaceBid = {
      id: `bid_${listing.id}_${club.id}_${week}`,
      listingId: listing.id,
      clubId: club.id,
      amount,
      placedWeek: week,
      placedSeason: season,
      expiryWeek: bidExpiry,
      expirySeason: season,
      status: "pending",
      needMatchScore,
      bidReason,
    };

    newBids.push(bid);

    // Inbox notification
    const interestLevel = needMatchScore >= 80 ? "very interested" : needMatchScore >= 60 ? "interested" : "cautiously interested";
    messages.push({
      id: `inbox_bid_${bid.id}`,
      week,
      season,
      type: "marketplaceBid",
      title: `Bid from ${club.name}`,
      body: `${club.name} has placed a bid of £${amount.toLocaleString()} on your report.\nThey have a ${positionNeed} need at ${player?.position ?? "this position"} and appear ${interestLevel}.\nThe bid expires in ${bidExpiry - week} week${bidExpiry - week > 1 ? "s" : ""}.`,
      read: false,
      actionRequired: true,
      relatedId: bid.id,
      relatedEntityType: "bid",
    });
  }

  // --- Exclusive upgrade bids ---
  // For non-exclusive listings with visible competition, high-need clubs
  // may offer a premium to convert the listing to exclusive.
  if (!listing.isExclusive) {
    const acceptedBids = listing.bids.filter((b) => b.status === "accepted").length;
    const pendingBids = listing.bids.filter((b) => b.status === "pending").length + newBids.length;
    const hasCompetition = acceptedBids >= 1 || pendingBids >= 2;

    if (hasCompetition) {
      for (const club of candidateClubs) {
        // Skip if club already has a pending bid (including upgrade bids)
        const hasPending = [...listing.bids, ...newBids].some(
          (b) => b.clubId === club.id && b.status === "pending",
        );
        if (hasPending) continue;

        const needMatchScore = calculateNeedMatchScore(report, player, club, players);
        if (needMatchScore < 70) continue;

        // 8% base chance
        if (!rng.chance(0.08)) continue;

        // Upgrade price: 2-3x the listing price
        const upgradeMult = 2.0 + rng.next(); // 2.0 - 3.0
        const upgradeAmount = Math.round(listing.price * upgradeMult);
        const bidExpiry = week + rng.nextInt(2, 3);

        const upgradeBid: MarketplaceBid = {
          id: `bid_upgrade_${listing.id}_${club.id}_${week}`,
          listingId: listing.id,
          clubId: club.id,
          amount: upgradeAmount,
          placedWeek: week,
          placedSeason: season,
          expiryWeek: bidExpiry,
          expirySeason: season,
          status: "pending",
          needMatchScore,
          isExclusiveUpgrade: true,
        };

        newBids.push(upgradeBid);
        messages.push({
          id: `inbox_bid_${upgradeBid.id}`,
          week,
          season,
          type: "marketplaceBid",
          title: `Exclusive Upgrade Offer from ${club.name}`,
          body: `${club.name} is offering £${upgradeAmount.toLocaleString()} to convert your listing to exclusive — they don't want competitors getting the same intel. Accepting will decline all other pending bids.`,
          read: false,
          actionRequired: true,
          relatedId: upgradeBid.id,
          relatedEntityType: "bid",
        });
      }
    }
  }

  return { bids: newBids, inboxMessages: messages };
}

/**
 * Process marketplace bids for one week. Replaces processMarketplaceSales.
 * AI clubs evaluate active listings and place bids. Expired bids are cleaned up.
 */
export function processMarketplaceBids(
  rng: RNG,
  finances: FinancialRecord,
  clubs: Record<string, Club>,
  reports: Record<string, ScoutReport>,
  players: Record<string, Player>,
  scout: Scout,
  week: number,
  season: number,
): { finances: FinancialRecord; inboxMessages: InboxMessage[] } {
  let updatedFinances = finances;
  const allInboxMessages: InboxMessage[] = [];

  const activeListings = updatedFinances.reportListings.filter(
    (l) => l.status === "active",
  );

  if (activeListings.length === 0) return { finances: updatedFinances, inboxMessages: [] };

  for (const listing of activeListings) {
    const report = reports[listing.reportId];
    if (!report) continue;

    // Generate new bids
    const { bids: newBids, inboxMessages } = generateBidsForListing(
      rng, listing, report, clubs, players, scout, week, season,
      updatedFinances.clientRelationships,
    );

    if (newBids.length > 0) {
      updatedFinances = {
        ...updatedFinances,
        reportListings: updatedFinances.reportListings.map((l) =>
          l.id === listing.id
            ? { ...l, bids: [...l.bids, ...newBids] }
            : l,
        ),
      };
      allInboxMessages.push(...inboxMessages);
    }

    // Expire old bids
    updatedFinances = {
      ...updatedFinances,
      reportListings: updatedFinances.reportListings.map((l) => {
        if (l.id !== listing.id) return l;
        let changed = false;
        const updatedBids = l.bids.map((b) => {
          if (b.status === "pending" && b.expiryWeek <= week && b.expirySeason <= season) {
            changed = true;
            allInboxMessages.push({
              id: `inbox_bid_expired_${b.id}`,
              week,
              season,
              type: "marketplaceBid",
              title: `Bid Expired`,
              body: `The bid of £${b.amount.toLocaleString()} from ${clubs[b.clubId]?.name ?? "a club"} has expired.`,
              read: false,
              actionRequired: false,
              relatedId: b.id,
              relatedEntityType: "bid",
            });
            return { ...b, status: "expired" as const };
          }
          return b;
        });
        return changed ? { ...l, bids: updatedBids } : l;
      }),
    };
  }

  return { finances: updatedFinances, inboxMessages: allInboxMessages };
}

// ---------------------------------------------------------------------------
// Bid actions
// ---------------------------------------------------------------------------

/**
 * Accept a bid on a listing.
 */
export function acceptBid(
  finances: FinancialRecord,
  listingId: string,
  bidId: string,
  week: number,
  season: number,
): FinancialRecord {
  const listing = finances.reportListings.find((l) => l.id === listingId);
  if (!listing) return finances;

  const bid = listing.bids.find((b) => b.id === bidId);
  if (!bid || bid.status !== "pending") return finances;

  // Complete the sale with the bid amount
  let updated = completeSale(finances, listingId, bid.clubId, bid.amount, week, season);

  // Wire to client relationship system
  updated = ensureClientRelationship(updated, bid.clubId, week, season);
  updated = recordClientDelivery(updated, bid.clubId, bid.amount, week, season);

  // Update bid statuses
  updated = {
    ...updated,
    reportListings: updated.reportListings.map((l) => {
      if (l.id !== listingId) return l;
      return {
        ...l,
        // If exclusive, mark listing as sold and decline other bids
        status: listing.isExclusive ? ("sold" as const) : l.status,
        bids: l.bids.map((b) => {
          if (b.id === bidId) return { ...b, status: "accepted" as const };
          if (listing.isExclusive && b.status === "pending") {
            return { ...b, status: "declined" as const };
          }
          return b;
        }),
      };
    }),
  };

  return updated;
}

/**
 * Decline a bid on a listing.
 */
export function declineBid(
  finances: FinancialRecord,
  listingId: string,
  bidId: string,
): FinancialRecord {
  return {
    ...finances,
    reportListings: finances.reportListings.map((l) =>
      l.id === listingId
        ? {
            ...l,
            bids: l.bids.map((b) =>
              b.id === bidId && b.status === "pending"
                ? { ...b, status: "declined" as const }
                : b,
            ),
          }
        : l,
    ),
  };
}

/**
 * Accept an exclusive upgrade bid. Records the sale revenue, converts
 * the listing to exclusive, marks it as sold, and declines all other
 * pending bids. Only pending bids are declined — previous non-exclusive
 * sales already happened.
 */
export function acceptExclusiveUpgrade(
  finances: FinancialRecord,
  listingId: string,
  bidId: string,
  week: number,
  season: number,
): FinancialRecord {
  const listing = finances.reportListings.find((l) => l.id === listingId);
  if (!listing) return finances;

  const bid = listing.bids.find((b) => b.id === bidId);
  if (!bid || bid.status !== "pending" || !bid.isExclusiveUpgrade) return finances;

  // Record the sale revenue
  let updated = completeSale(finances, listingId, bid.clubId, bid.amount, week, season);

  // Wire to client relationship system
  updated = ensureClientRelationship(updated, bid.clubId, week, season);
  updated = recordClientDelivery(updated, bid.clubId, bid.amount, week, season);

  // Convert to exclusive, mark sold, accept this bid, decline all other pending bids
  updated = {
    ...updated,
    reportListings: updated.reportListings.map((l) => {
      if (l.id !== listingId) return l;
      return {
        ...l,
        isExclusive: true,
        status: "sold" as const,
        bids: l.bids.map((b) => {
          if (b.id === bidId) return { ...b, status: "accepted" as const };
          if (b.status === "pending") return { ...b, status: "declined" as const };
          return b;
        }),
      };
    }),
  };

  return updated;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function completeSale(
  finances: FinancialRecord,
  listingId: string,
  buyerClubId: string,
  salePrice: number,
  week: number,
  season: number,
): FinancialRecord {
  const listing = finances.reportListings.find((l) => l.id === listingId);
  if (!listing) return finances;

  return {
    ...finances,
    balance: finances.balance + salePrice,
    reportSalesRevenue: finances.reportSalesRevenue + salePrice,
    reportListings: finances.reportListings.map((l) =>
      l.id === listingId
        ? { ...l, buyerClubId }
        : l,
    ),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: salePrice,
        description: `Report sold to club`,
      },
    ],
  };
}
