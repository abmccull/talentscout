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
} from "../core/types";
import type {
  RecruitmentOpportunity,
  RecruitmentOpportunityState,
  RecruitmentTransfer,
} from "../recruitment";
import { findCausalRecruitmentOpportunity } from "../recruitment";
import { applyFirstPlacementBonus } from "./expenses";

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

/**
 * Outcome fees must remain meaningful without turning one elite transfer into
 * an agency-economy skip. These are consultancy success-fee ceilings, not
 * football-agent percentages of the entire transfer consideration.
 */
const PLACEMENT_FEE_CAP_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1_500,
  2: 3_000,
  3: 7_500,
  4: 15_000,
  5: 25_000,
};

/** Flat youth placement fee range by club reputation tier */

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
  const effectiveTier = Math.max(
    1,
    Math.min(5, scout.independentTier ?? scout.careerTier),
  ) as 1 | 2 | 3 | 4 | 5;
  return Math.min(
    PLACEMENT_FEE_CAP_BY_TIER[effectiveTier],
    Math.round(Math.max(100, fee)),
  );
}

/**
 * Calculate placement fee for youth player placements.
 * Flat fee based on club reputation, not transfer fee.
 */
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
  transfers: Array<{
    playerId: string;
    fee: number;
    fromClubId?: string;
    toClubId?: string;
  }>,
  week: number,
  season: number,
): FinancialRecord {
  let updated = finances;

  for (const transfer of transfers) {
    // Find placement records with sell-on clauses for this player
    const matchingRecords = updated.placementFeeRecords.filter(
      (r) =>
        r.playerId === transfer.playerId
        && r.hasSellOnClause
        && r.sellOnPercentage > 0
        // A newly registered clause cannot pay against the same move that
        // created it. Later sell-ons originate from the placed club.
        && (transfer.fromClubId === undefined || r.clubId === transfer.fromClubId)
        && (transfer.toClubId === undefined || r.clubId !== transfer.toClubId),
    );

    for (const record of matchingRecords) {
      const referenceId = [
        "sell-on",
        record.id,
        transfer.playerId,
        transfer.fromClubId ?? "unknown-source",
        transfer.toClubId ?? "unknown-destination",
        `s${season}w${week}`,
      ].join(":");
      if (updated.transactions.some((transaction) => transaction.referenceId === referenceId)) {
        continue;
      }
      const uncappedSellOnPayment = Math.round(transfer.fee * record.sellOnPercentage);
      // Residual clauses reward long-term judgment but cannot dwarf the
      // success fee that created the relationship. This keeps alumni payoffs
      // exciting while preserving the agency's multi-client progression.
      const sellOnPayment = Math.min(
        uncappedSellOnPayment,
        Math.max(1_000, record.earnedFee * 2),
      );
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
            referenceId,
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
 * Resolve the exact delivered report that qualifies for a destination-matched
 * placement reward. Predicting that a player would move is tracked elsewhere
 * and is not enough to earn contractual credit.
 */
export function checkPlacementFeeEligibility(
  state: RecruitmentOpportunityState,
  transfer: RecruitmentTransfer,
  scoutId: string,
): { report: ScoutReport; opportunity: RecruitmentOpportunity } | undefined {
  const opportunity = findCausalRecruitmentOpportunity(state, transfer, scoutId);
  if (!opportunity) return undefined;
  const report = state.reports[opportunity.reportId];
  return report ? { report, opportunity } : undefined;
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
  referenceId?: string,
): FinancialRecord {
  const effectiveReferenceId = referenceId
    ?? `placement:${playerId}:${clubId}:s${season}w${week}`;
  if (finances.transactions.some((transaction) =>
    transaction.referenceId === effectiveReferenceId
  )) {
    return finances;
  }
  const record: PlacementFeeRecord = {
    id: `pf_${effectiveReferenceId}`,
    playerId,
    clubId,
    transferFee,
    earnedFee: fee,
    hasSellOnClause: sellOnPercentage > 0,
    sellOnPercentage,
    week,
    season,
  };

  const paid: FinancialRecord = {
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
        referenceId: effectiveReferenceId,
        category: "placement",
        counterpartyId: clubId,
      },
    ],
  };
  return applyFirstPlacementBonus(paid, fee, week, season);
}
