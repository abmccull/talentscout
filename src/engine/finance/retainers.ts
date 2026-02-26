/**
 * Retainer contracts — clubs offer independent scouts retainer contracts
 * for steady income in exchange for regular report delivery.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  RetainerContract,
  Scout,
  Club,
  IndependentTier,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface RetainerTierConfig {
  name: string;
  monthlyFeeRange: [number, number];
  requiredReports: number;
}

const RETAINER_TIERS: Record<1 | 2 | 3 | 4 | 5, RetainerTierConfig> = {
  1: { name: "Basic", monthlyFeeRange: [500, 1000], requiredReports: 2 },
  2: { name: "Standard", monthlyFeeRange: [1500, 3000], requiredReports: 3 },
  3: { name: "Premium", monthlyFeeRange: [4000, 8000], requiredReports: 5 },
  4: { name: "Elite", monthlyFeeRange: [10000, 20000], requiredReports: 7 },
  5: { name: "Platinum", monthlyFeeRange: [25000, 50000], requiredReports: 10 },
};

/** Maximum retainer contracts by independent tier */
const MAX_RETAINERS_BY_TIER: Record<IndependentTier, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 6,
  5: 99, // unlimited
};

// ---------------------------------------------------------------------------
// Offer generation
// ---------------------------------------------------------------------------

/**
 * Generate retainer contract offers for independent scouts.
 * 0-3 offers based on reputation and tier.
 */
export function generateRetainerOffers(
  rng: RNG,
  scout: Scout,
  finances: FinancialRecord,
  clubs: Record<string, Club>,
): RetainerContract[] {
  if (scout.careerPath !== "independent") return [];

  const indTier = scout.independentTier ?? 1;
  const maxRetainers = MAX_RETAINERS_BY_TIER[indTier];
  const currentActive = finances.retainerContracts.filter((r) => r.status === "active").length;
  if (currentActive >= maxRetainers) return [];

  // Offer count scales with reputation
  const maxOffers = Math.min(3, Math.floor(scout.reputation / 25));
  if (maxOffers <= 0) return [];

  const offerCount = rng.nextInt(1, maxOffers);
  const clubList = Object.values(clubs);
  if (clubList.length === 0) return [];

  const offers: RetainerContract[] = [];
  const shuffledClubs = rng.shuffle(clubList).slice(0, offerCount);

  for (const club of shuffledClubs) {
    // Retainer tier based on club reputation
    const retainerTier = club.reputation >= 75 ? 4
      : club.reputation >= 50 ? 3
      : club.reputation >= 25 ? 2
      : 1;

    // Only offer retainer tiers the scout can handle
    const tier = Math.min(retainerTier, indTier) as 1 | 2 | 3 | 4 | 5;
    const config = RETAINER_TIERS[tier];

    const monthlyFee = rng.nextInt(config.monthlyFeeRange[0], config.monthlyFeeRange[1]);

    offers.push({
      id: `retainer_${club.id}_${Date.now()}`,
      clubId: club.id,
      tier,
      monthlyFee,
      requiredReportsPerMonth: config.requiredReports,
      reportsDeliveredThisMonth: 0,
      status: "active",
    });
  }

  return offers;
}

// ---------------------------------------------------------------------------
// Contract management
// ---------------------------------------------------------------------------

/**
 * Accept a retainer contract. Returns null if at max capacity.
 */
export function acceptRetainer(
  finances: FinancialRecord,
  contract: RetainerContract,
  scout: Scout,
): FinancialRecord | null {
  const indTier = scout.independentTier ?? 1;
  const max = MAX_RETAINERS_BY_TIER[indTier];
  const current = finances.retainerContracts.filter((r) => r.status === "active").length;

  if (current >= max) return null;

  return {
    ...finances,
    retainerContracts: [...finances.retainerContracts, contract],
  };
}

/**
 * Cancel a retainer contract.
 */
export function cancelRetainer(
  finances: FinancialRecord,
  contractId: string,
): FinancialRecord {
  return {
    ...finances,
    retainerContracts: finances.retainerContracts.map((c) =>
      c.id === contractId ? { ...c, status: "cancelled" as const } : c,
    ),
  };
}

// ---------------------------------------------------------------------------
// Monthly delivery processing
// ---------------------------------------------------------------------------

/**
 * Process retainer deliveries at the end of each month (every 4 weeks).
 * - Met quota: payment received
 * - Missed quota: contract suspended/downgraded
 * - Exceeded quota: potential upgrade opportunity
 */
export function processRetainerDeliveries(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  // Only process monthly
  if (week % 4 !== 0) return finances;

  let updated = finances;
  const updatedContracts: RetainerContract[] = [];

  for (const contract of updated.retainerContracts) {
    if (contract.status !== "active") {
      updatedContracts.push(contract);
      continue;
    }

    if (contract.reportsDeliveredThisMonth >= contract.requiredReportsPerMonth) {
      // Quota met — pay out
      updated = {
        ...updated,
        balance: updated.balance + contract.monthlyFee,
        retainerRevenue: updated.retainerRevenue + contract.monthlyFee,
        transactions: [
          ...updated.transactions,
          {
            week,
            season,
            amount: contract.monthlyFee,
            description: `Retainer payment received`,
          },
        ],
      };

      // Reset delivery counter for next month
      updatedContracts.push({ ...contract, reportsDeliveredThisMonth: 0 });
    } else {
      // Quota missed — suspend contract
      updatedContracts.push({ ...contract, status: "suspended", reportsDeliveredThisMonth: 0 });
    }
  }

  return { ...updated, retainerContracts: updatedContracts };
}

/**
 * Record a report delivery against a retainer contract.
 * Call this when a report is submitted that matches a retainer club.
 */
export function recordRetainerDelivery(
  finances: FinancialRecord,
  clubId: string,
): FinancialRecord {
  const updatedContracts = finances.retainerContracts.map((c) => {
    if (c.clubId === clubId && c.status === "active") {
      return { ...c, reportsDeliveredThisMonth: c.reportsDeliveredThisMonth + 1 };
    }
    return c;
  });

  return { ...finances, retainerContracts: updatedContracts };
}

// ---------------------------------------------------------------------------
// Quarterly renewal processing
// ---------------------------------------------------------------------------

/**
 * Process retainer contract renewals every 12 weeks (quarterly).
 * - Satisfaction >= 70: auto-renew; 20% chance to upgrade tier.
 * - Satisfaction >= 40: auto-renew at same tier.
 * - Satisfaction < 40: contract cancelled.
 */
export function processRetainerRenewals(
  rng: RNG,
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  // Only process quarterly
  if (week % 12 !== 0) return finances;

  const updatedContracts: RetainerContract[] = [];

  for (const contract of finances.retainerContracts) {
    if (contract.status !== "active") {
      updatedContracts.push(contract);
      continue;
    }

    const relationship = finances.clientRelationships.find((cr) => cr.clubId === contract.clubId);
    const satisfaction = relationship?.satisfaction ?? 50;

    if (satisfaction >= 70) {
      // Auto-renew; 20% chance of tier upgrade
      if (rng.chance(0.2) && contract.tier < 5) {
        const newTier = (contract.tier + 1) as 1 | 2 | 3 | 4 | 5;
        const config = RETAINER_TIERS[newTier];
        const newFee = rng.nextInt(config.monthlyFeeRange[0], config.monthlyFeeRange[1]);
        updatedContracts.push({
          ...contract,
          tier: newTier,
          monthlyFee: newFee,
          requiredReportsPerMonth: config.requiredReports,
        });
      } else {
        updatedContracts.push(contract);
      }
    } else if (satisfaction >= 40) {
      // Auto-renew at same tier
      updatedContracts.push(contract);
    } else {
      // Not renewed — cancel the contract
      updatedContracts.push({ ...contract, status: "cancelled" });
    }
  }

  return { ...finances, retainerContracts: updatedContracts };
}
