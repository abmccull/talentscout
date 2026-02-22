/**
 * Placement fees & sell-on clauses — scouts earn a percentage of transfer fees
 * when players they recommended are signed, plus residual payments from
 * sell-on clauses on youth placements.
 */

import type {
  FinancialRecord,
  ScoutReport,
  PlacementFeeRecord,
  Scout,
  ConvictionLevel,
  Club,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base fee rate as percentage of transfer fee */
const BASE_FEE_RATE = 0.02; // 2%

/** Conviction level multipliers for placement fee */
const CONVICTION_FEE_MULTIPLIER: Record<ConvictionLevel, number> = {
  note: 0.5,
  recommend: 1.0,
  strongRecommend: 1.5,
  tablePound: 2.0,
};

/** After this many weeks a report is considered stale — half fee */
const STALE_THRESHOLD_WEEKS = 26;

/** Flat youth placement fee range by club reputation tier */
const YOUTH_FEE_BASE = 1000;
const YOUTH_FEE_PER_REP = 90; // £90 per reputation point

// ---------------------------------------------------------------------------
// Placement fee calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the placement fee earned when a transfer completes for a player
 * the scout recommended.
 *
 * Fee = transferFee × BASE_RATE × convictionMult × repMult × exclusivityMult × staleMult
 */
export function calculatePlacementFee(
  transferFee: number,
  report: ScoutReport,
  scout: Scout,
  weeksAgoReported: number,
  isExclusive: boolean,
): number {
  const convictionMult = CONVICTION_FEE_MULTIPLIER[report.conviction];
  const repMult = 0.5 + (scout.reputation / 100) * 0.5; // 0.5x to 1.0x
  const exclusivityMult = isExclusive ? 1.5 : 1.0;
  const staleMult = weeksAgoReported > STALE_THRESHOLD_WEEKS ? 0.5 : 1.0;

  const fee = transferFee * BASE_FEE_RATE * convictionMult * repMult * exclusivityMult * staleMult;
  return Math.round(Math.max(100, fee)); // Minimum £100
}

/**
 * Calculate placement fee for youth player placements.
 * Flat fee based on club reputation, not transfer fee.
 */
export function calculateYouthPlacementFee(
  club: Club,
  _playerAge: number,
  scout: Scout,
): number {
  const base = YOUTH_FEE_BASE + club.reputation * YOUTH_FEE_PER_REP;
  const repMult = 0.5 + (scout.reputation / 100) * 0.5;
  return Math.round(base * repMult);
}

// ---------------------------------------------------------------------------
// Sell-on clauses
// ---------------------------------------------------------------------------

/**
 * Calculate the sell-on percentage for a youth placement.
 * Higher conviction and younger players = higher sell-on %.
 */
export function calculateSellOnPercentage(
  playerAge: number,
  conviction: ConvictionLevel,
): number {
  if (playerAge > 21) return 0;

  const convictionRates: Record<ConvictionLevel, number> = {
    note: 0.001,       // 0.1%
    recommend: 0.002,  // 0.2%
    strongRecommend: 0.003, // 0.3%
    tablePound: 0.005, // 0.5%
  };

  return convictionRates[conviction];
}

/**
 * Process sell-on clause payments from transfers of previously placed players.
 * Called during weekly transfer processing.
 */
export function processSellOnClauses(
  finances: FinancialRecord,
  transfers: Array<{ playerId: string; fee: number }>,
  week: number,
  season: number,
): FinancialRecord {
  let updated = finances;

  for (const transfer of transfers) {
    // Find placement records with sell-on clauses for this player
    const matchingRecords = updated.placementFeeRecords.filter(
      (r) => r.playerId === transfer.playerId && r.hasSellOnClause && r.sellOnPercentage > 0,
    );

    for (const record of matchingRecords) {
      const sellOnPayment = Math.round(transfer.fee * record.sellOnPercentage);
      if (sellOnPayment <= 0) continue;

      updated = {
        ...updated,
        balance: updated.balance + sellOnPayment,
        sellOnRevenue: updated.sellOnRevenue + sellOnPayment,
        transactions: [
          ...updated.transactions,
          {
            week,
            season,
            amount: sellOnPayment,
            description: `Sell-on clause payment (${(record.sellOnPercentage * 100).toFixed(1)}%)`,
          },
        ],
      };
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------

/**
 * Check if a scout has an active report on a transferred player.
 * Returns the matching report or undefined.
 */
export function checkPlacementFeeEligibility(
  transferPlayerId: string,
  reports: Record<string, ScoutReport>,
  scoutId: string,
): ScoutReport | undefined {
  return Object.values(reports).find(
    (r) => r.playerId === transferPlayerId && r.scoutId === scoutId,
  );
}

/**
 * Record a placement fee and create a PlacementFeeRecord.
 */
export function triggerPlacementFee(
  finances: FinancialRecord,
  fee: number,
  playerId: string,
  clubId: string,
  transferFee: number,
  sellOnPercentage: number,
  week: number,
  season: number,
): FinancialRecord {
  const record: PlacementFeeRecord = {
    id: `pf_${playerId}_${week}_${season}`,
    playerId,
    clubId,
    transferFee,
    earnedFee: fee,
    hasSellOnClause: sellOnPercentage > 0,
    sellOnPercentage,
    week,
    season,
  };

  return {
    ...finances,
    balance: finances.balance + fee,
    placementFeeRevenue: finances.placementFeeRevenue + fee,
    placementFeeRecords: [...finances.placementFeeRecords, record],
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: fee,
        description: `Placement fee earned`,
      },
    ],
  };
}
