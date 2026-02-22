/**
 * Consulting system — tier 4+ independent scouts offer consulting services
 * to clubs for one-off advisory fees.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  ConsultingContract,
  ConsultingType,
  Scout,
  Club,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface ConsultingConfig {
  feeRange: [number, number];
  durationWeeks: number;
}

const CONSULTING_CONFIGS: Record<ConsultingType, ConsultingConfig> = {
  transferAdvisory: { feeRange: [5000, 25000], durationWeeks: 4 },
  youthAudit: { feeRange: [3000, 10000], durationWeeks: 6 },
  dataPackage: { feeRange: [2000, 8000], durationWeeks: 3 },
  talentWorkshop: { feeRange: [4000, 15000], durationWeeks: 2 },
};

// ---------------------------------------------------------------------------
// Offer generation
// ---------------------------------------------------------------------------

/**
 * Generate consulting offers for independent tier 4+ scouts.
 * 0-2 per season.
 */
export function generateConsultingOffers(
  rng: RNG,
  scout: Scout,
  finances: FinancialRecord,
  clubs: Record<string, Club>,
  week: number,
  season: number,
): ConsultingContract[] {
  if (scout.careerPath !== "independent") return [];
  if ((scout.independentTier ?? 1) < 4) return [];

  // Low probability per week — targets ~2 per season
  if (!rng.chance(0.05)) return [];

  const clubList = Object.values(clubs);
  if (clubList.length === 0) return [];

  const club = rng.pick(clubList);
  const types: ConsultingType[] = ["transferAdvisory", "youthAudit", "dataPackage", "talentWorkshop"];
  const type = rng.pick(types);

  const config = CONSULTING_CONFIGS[type];
  const repMult = 0.5 + (scout.reputation / 100) * 0.5;
  const fee = Math.round(rng.nextInt(config.feeRange[0], config.feeRange[1]) * repMult);

  const contract: ConsultingContract = {
    id: `consult_${club.id}_${week}_${season}`,
    clubId: club.id,
    type,
    fee,
    deadline: week + config.durationWeeks,
    deadlineSeason: season,
    status: "active",
  };

  return [contract];
}

// ---------------------------------------------------------------------------
// Contract management
// ---------------------------------------------------------------------------

/**
 * Accept a consulting contract.
 */
export function acceptConsulting(
  finances: FinancialRecord,
  contract: ConsultingContract,
): FinancialRecord {
  return {
    ...finances,
    consultingContracts: [...finances.consultingContracts, contract],
  };
}

/**
 * Process consulting deadlines. Mark expired contracts as failed.
 */
export function processConsultingDeadline(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  const updated = finances.consultingContracts.map((c) => {
    if (c.status !== "active") return c;
    if (c.deadlineSeason === season && week >= c.deadline) {
      return { ...c, status: "failed" as const };
    }
    return c;
  });

  return { ...finances, consultingContracts: updated };
}

/**
 * Complete a consulting contract and receive payment.
 */
export function completeConsulting(
  finances: FinancialRecord,
  contractId: string,
  week: number,
  season: number,
): FinancialRecord {
  const contract = finances.consultingContracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "active") return finances;

  return {
    ...finances,
    balance: finances.balance + contract.fee,
    consultingRevenue: finances.consultingRevenue + contract.fee,
    consultingContracts: finances.consultingContracts.map((c) =>
      c.id === contractId ? { ...c, status: "completed" as const } : c,
    ),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: contract.fee,
        description: `Consulting fee received (${contract.type})`,
      },
    ],
  };
}
