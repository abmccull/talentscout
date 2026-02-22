/**
 * Report Marketplace — independent scouts list reports for sale, and AI clubs
 * purchase based on price, quality, reputation, and need.
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
  ConvictionLevel,
  MarketTemperature,
} from "../core/types";

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

/** Base probability per club per listing of making a purchase */
const BASE_PURCHASE_PROBABILITY = 0.03;

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
  const exclusivityMult = isExclusive ? 1.5 : 1.0;

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
  };

  return {
    ...finances,
    reportListings: [...finances.reportListings, listing],
  };
}

/**
 * Withdraw an active listing from the marketplace.
 */
export function withdrawListing(
  finances: FinancialRecord,
  listingId: string,
): FinancialRecord {
  return {
    ...finances,
    reportListings: finances.reportListings.map((l) =>
      l.id === listingId && l.status === "active"
        ? { ...l, status: "withdrawn" as const }
        : l,
    ),
  };
}

/**
 * Expire listings older than MAX_LISTING_AGE_WEEKS.
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
      return { ...listing, status: "expired" as const };
    }
    return listing;
  });

  return { ...finances, reportListings: updated };
}

// ---------------------------------------------------------------------------
// AI purchase simulation
// ---------------------------------------------------------------------------

/**
 * Process marketplace sales for one week. AI clubs evaluate active listings
 * and may purchase reports they find useful.
 */
export function processMarketplaceSales(
  rng: RNG,
  finances: FinancialRecord,
  clubs: Record<string, Club>,
  reports: Record<string, ScoutReport>,
  scout: Scout,
  week: number,
  season: number,
): FinancialRecord {
  let updatedFinances = finances;
  const activeListings = updatedFinances.reportListings.filter(
    (l) => l.status === "active",
  );

  if (activeListings.length === 0) return updatedFinances;

  for (const listing of activeListings) {
    const report = reports[listing.reportId];
    if (!report) continue;

    // Determine which clubs might buy
    const potentialBuyers = listing.targetClubId
      ? [clubs[listing.targetClubId]].filter(Boolean) as Club[]
      : Object.values(clubs).filter((c) => c.budget >= listing.price);

    for (const club of potentialBuyers) {
      // Purchase probability based on: quality, price/budget ratio, scout reputation
      const qualityFactor = report.qualityScore / 100;
      const affordabilityFactor = Math.min(1, club.budget / (listing.price * 10));
      const repFactor = scout.reputation / 100;

      const probability = BASE_PURCHASE_PROBABILITY * qualityFactor * affordabilityFactor * repFactor;

      if (rng.chance(probability)) {
        // Sale!
        updatedFinances = completeSale(updatedFinances, listing.id, club.id, week, season);

        // Exclusive listings can only be sold once
        if (listing.isExclusive) break;
      }
    }
  }

  return updatedFinances;
}

function completeSale(
  finances: FinancialRecord,
  listingId: string,
  buyerClubId: string,
  week: number,
  season: number,
): FinancialRecord {
  const listing = finances.reportListings.find((l) => l.id === listingId);
  if (!listing) return finances;

  return {
    ...finances,
    balance: finances.balance + listing.price,
    reportSalesRevenue: finances.reportSalesRevenue + listing.price,
    reportListings: finances.reportListings.map((l) =>
      l.id === listingId
        ? { ...l, status: "sold" as const, buyerClubId }
        : l,
    ),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: listing.price,
        description: `Report sold to club`,
      },
    ],
  };
}
