/**
 * Client relationship management — satisfaction tracking, pitching, negotiation.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  ClientRelationship,
  RetainerContract,
  Scout,
  Club,
  PitchResult,
} from "../core/types";

// ---------------------------------------------------------------------------
// Satisfaction helpers
// ---------------------------------------------------------------------------

/**
 * Apply a satisfaction delta to a specific club's relationship record.
 * Clamps result to [0, 100].
 */
export function updateClientSatisfaction(
  finances: FinancialRecord,
  clubId: string,
  delta: number,
): FinancialRecord {
  const updated = finances.clientRelationships.map((cr) =>
    cr.clubId === clubId
      ? { ...cr, satisfaction: Math.max(0, Math.min(100, cr.satisfaction + delta)) }
      : cr,
  );
  return { ...finances, clientRelationships: updated };
}

// ---------------------------------------------------------------------------
// Weekly processing
// ---------------------------------------------------------------------------

/**
 * Process client relationships for one week.
 * - Decays satisfaction for clients with no recent interaction.
 * - Transitions status: active → cooling when satisfaction drops below 30.
 * - Transitions status: cooling → lost when satisfaction drops below 20.
 * - Increments tenure for all relationships.
 */
export function processClientRelationshipWeek(
  rng: RNG,
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  const updated = finances.clientRelationships.map((cr) => {
    // Weeks since last interaction (approximate using season * 52 + week)
    const currentTotalWeek = season * 52 + week;
    const lastTotalWeek = cr.lastInteractionSeason * 52 + cr.lastInteractionWeek;
    const weeksSinceInteraction = currentTotalWeek - lastTotalWeek;

    let sat = cr.satisfaction;
    let status = cr.status;

    // Decay satisfaction if no recent interaction
    if (weeksSinceInteraction > 4 && sat > 50) {
      sat -= 1;
    }

    // Status transitions
    if (status === "active" && sat < 30) {
      status = "cooling";
    }
    if (status === "cooling" && sat < 20) {
      status = "lost";
    }

    return { ...cr, satisfaction: sat, status, tenureWeeks: cr.tenureWeeks + 1 };
  });

  return { ...finances, clientRelationships: updated };
}

// ---------------------------------------------------------------------------
// Pitching
// ---------------------------------------------------------------------------

/**
 * Attempt to pitch services to a club and generate a retainer offer on success.
 *
 * Base success rates:
 *  - coldCall:  12%
 *  - referral:  35%
 *  - showcase:  25%
 *
 * Modifiers: scout reputation, RM employee quality, existing relationship satisfaction.
 */
export function pitchToClub(
  rng: RNG,
  scout: Scout,
  finances: FinancialRecord,
  club: Club,
  pitchType: "coldCall" | "referral" | "showcase",
): PitchResult {
  const baseRates: Record<"coldCall" | "referral" | "showcase", number> = {
    coldCall: 0.12,
    referral: 0.35,
    showcase: 0.25,
  };
  let probability = baseRates[pitchType];

  // Reputation modifier (reputation 0–100 → +0 to +0.25)
  probability += (scout.reputation / 100) * 0.25;

  // RM quality modifier (best RM quality 0–20 → +0 to +0.15)
  const rms = finances.employees.filter((e) => e.role === "relationshipManager");
  if (rms.length > 0) {
    const bestRM = Math.max(...rms.map((r) => r.quality));
    probability += (bestRM / 20) * 0.15;
  }

  // Existing relationship modifier (satisfaction 0–100 → +0 to +0.15)
  const existing = finances.clientRelationships.find((cr) => cr.clubId === club.id);
  if (existing) {
    probability += (existing.satisfaction / 100) * 0.15;
  }

  // Hard cap at 85%
  probability = Math.min(0.85, probability);

  if (!rng.chance(probability)) {
    return {
      success: false,
      message: `${club.name} declined the pitch. Try again when your reputation grows.`,
    };
  }

  // Generate a retainer offer
  const tier: 1 | 2 | 3 = club.reputation >= 75 ? 3 : club.reputation >= 40 ? 2 : 1;
  const feeRanges: Record<1 | 2 | 3, [number, number]> = {
    1: [500, 1000],
    2: [1500, 3000],
    3: [4000, 8000],
  };
  const [minFee, maxFee] = feeRanges[tier];
  const requiredReports = tier + 1;

  const contract: RetainerContract = {
    id: `retainer_${club.id}_pitch_${Date.now()}`,
    clubId: club.id,
    tier: tier as 1 | 2 | 3 | 4 | 5,
    monthlyFee: rng.nextInt(minFee, maxFee),
    requiredReportsPerMonth: requiredReports,
    reportsDeliveredThisMonth: 0,
    status: "active",
  };

  return {
    success: true,
    message: `${club.name} accepted! They're offering a Tier ${tier} retainer.`,
    offeredContract: contract,
  };
}

// ---------------------------------------------------------------------------
// Negotiation
// ---------------------------------------------------------------------------

/**
 * Adjust a retainer contract's monthly fee via negotiation.
 * A higher scout reputation skews the result toward better terms.
 * Returns a new contract with the adjusted fee.
 */
export function negotiateRetainerTerms(
  rng: RNG,
  contract: RetainerContract,
  scout: Scout,
): RetainerContract {
  const repBonus = scout.reputation / 100;
  // Adjustment factor: -20% to +30%, weighted toward positive with higher rep
  const adjustment = 1 + (rng.nextInt(-20, 30) / 100) * (0.5 + repBonus * 0.5);
  return { ...contract, monthlyFee: Math.round(contract.monthlyFee * adjustment) };
}

// ---------------------------------------------------------------------------
// Relationship record management
// ---------------------------------------------------------------------------

/**
 * Ensure a ClientRelationship record exists for a club.
 * If none exists, creates a new prospect record.
 */
export function ensureClientRelationship(
  finances: FinancialRecord,
  clubId: string,
  week: number,
  season: number,
): FinancialRecord {
  const exists = finances.clientRelationships.some((cr) => cr.clubId === clubId);
  if (exists) return finances;

  const newRelationship: ClientRelationship = {
    clubId,
    satisfaction: 50,
    totalReportsDelivered: 0,
    totalRevenue: 0,
    tenureWeeks: 0,
    preferences: [],
    status: "prospect",
    lastInteractionWeek: week,
    lastInteractionSeason: season,
  };

  return {
    ...finances,
    clientRelationships: [...finances.clientRelationships, newRelationship],
  };
}

/**
 * Record a report delivery against a client relationship,
 * updating satisfaction, revenue, and interaction timestamps.
 */
export function recordClientDelivery(
  finances: FinancialRecord,
  clubId: string,
  revenue: number,
  week: number,
  season: number,
): FinancialRecord {
  const updated = finances.clientRelationships.map((cr) => {
    if (cr.clubId !== clubId) return cr;
    return {
      ...cr,
      totalReportsDelivered: cr.totalReportsDelivered + 1,
      totalRevenue: cr.totalRevenue + revenue,
      satisfaction: Math.min(100, cr.satisfaction + 3),
      status: cr.status === "prospect" ? ("active" as const) : cr.status,
      lastInteractionWeek: week,
      lastInteractionSeason: season,
    };
  });
  return { ...finances, clientRelationships: updated };
}

// ---------------------------------------------------------------------------
// Contract Failure Consequences
// ---------------------------------------------------------------------------

/**
 * Process a failed retainer contract deliverable.
 * Drops client satisfaction and may trigger contract termination.
 */
export function processRetainerFailure(
  finances: FinancialRecord,
  clubId: string,
  week: number,
  season: number,
): { finances: FinancialRecord; messages: { title: string; body: string }[] } {
  const messages: { title: string; body: string }[] = [];
  let updated = updateClientSatisfaction(finances, clubId, -10);

  // Check if this triggers termination
  const relationship = updated.clientRelationships.find((cr) => cr.clubId === clubId);
  if (relationship && relationship.satisfaction < 25) {
    // Terminate the contract
    updated = {
      ...updated,
      retainerContracts: updated.retainerContracts.filter((c) => c.clubId !== clubId),
      failedContractCount: (updated.failedContractCount ?? 0) + 1,
    };

    // Update relationship status
    updated = {
      ...updated,
      clientRelationships: updated.clientRelationships.map((cr) =>
        cr.clubId === clubId ? { ...cr, status: "lost" as const } : cr,
      ),
    };

    messages.push({
      title: "Contract Terminated",
      body: `Your retainer contract has been terminated due to consistently missed deliverables. Reputation penalty applied. (-5 reputation)`,
    });

    // Check for blacklist (3 failures with same club)
    const failuresWithClub = (updated.clientRelationships.find((cr) => cr.clubId === clubId)?.totalReportsDelivered ?? 0) === 0
      ? (updated.failedContractCount ?? 0)
      : 0;

    // Simple blacklist check: track in blacklistedClubs
    const existingBlacklist = updated.blacklistedClubs ?? [];
    const clubFailures = existingBlacklist.filter((id) => id === clubId).length;
    if (clubFailures >= 2) {
      // Third failure — permanent blacklist
      updated = {
        ...updated,
        blacklistedClubs: [...existingBlacklist, clubId],
      };
      messages.push({
        title: "Permanently Blacklisted",
        body: "After three failed contracts, this club has permanently blacklisted you. You can no longer do business with them.",
      });
    } else {
      // Track the failure for blacklist counting
      updated = {
        ...updated,
        blacklistedClubs: [...existingBlacklist, clubId],
      };
    }
  } else {
    messages.push({
      title: "Missed Deliverable",
      body: "You failed to deliver the required reports this month. Client satisfaction has dropped. Continued failures may result in contract termination.",
    });
  }

  return { finances: updated, messages };
}

/**
 * Check if a club is blacklisted (3+ entries in blacklistedClubs).
 */
export function isClubBlacklisted(finances: FinancialRecord, clubId: string): boolean {
  const blacklist = finances.blacklistedClubs ?? [];
  return blacklist.filter((id) => id === clubId).length >= 3;
}

/**
 * Check retainer deliverables for all active contracts and process failures.
 * Called monthly (every 4 weeks).
 */
export function checkRetainerDeliverables(
  finances: FinancialRecord,
  week: number,
  season: number,
): { finances: FinancialRecord; messages: { title: string; body: string }[] } {
  if (week % 4 !== 0) return { finances, messages: [] };

  let updated = finances;
  const allMessages: { title: string; body: string }[] = [];

  for (const contract of updated.retainerContracts) {
    if (contract.reportsDeliveredThisMonth < contract.requiredReportsPerMonth) {
      const result = processRetainerFailure(updated, contract.clubId, week, season);
      updated = result.finances;
      allMessages.push(...result.messages);
    }
  }

  // Reset monthly report counts for surviving contracts
  updated = {
    ...updated,
    retainerContracts: updated.retainerContracts.map((c) => ({
      ...c,
      reportsDeliveredThisMonth: 0,
    })),
  };

  return { finances: updated, messages: allMessages };
}
