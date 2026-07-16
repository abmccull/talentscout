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
  ScoutReport,
  Player,
} from "../core/types";
import { canAcceptConsultingWork } from "./agencyCapacity";
import {
  addGameWeeksWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";

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

const CONSULTING_DELIVERABLES: Record<ConsultingType, ConsultingContract["deliverables"]> = {
  transferAdvisory: [
    { type: "reports", description: "Two decision-ready target reports", required: 2, delivered: 0 },
    { type: "analysis", description: "Comparative shortlist analysis", required: 1, delivered: 0 },
    { type: "presentation", description: "Final recruitment meeting", required: 1, delivered: 0 },
  ],
  youthAudit: [
    { type: "reports", description: "Three academy pathway reports", required: 3, delivered: 0 },
    { type: "analysis", description: "Academy pipeline audit", required: 1, delivered: 0 },
    { type: "presentation", description: "Academy findings presentation", required: 1, delivered: 0 },
  ],
  dataPackage: [
    { type: "reports", description: "Two evidence-backed player reports", required: 2, delivered: 0 },
    { type: "analysis", description: "Two comparative data notes", required: 2, delivered: 0 },
  ],
  talentWorkshop: [
    { type: "analysis", description: "Workshop case study", required: 1, delivered: 0 },
    { type: "presentation", description: "Deliver the talent workshop", required: 1, delivered: 0 },
  ],
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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): ConsultingContract[] {
  if (scout.careerPath !== "independent") return [];
  if ((scout.independentTier ?? 1) < 4) return [];

  // Low probability per week — targets ~2 per season
  if (!rng.chance(0.05)) return [];

  const clubList = Object.values(clubs);
  if (clubList.length === 0) return [];

  const unavailableClubIds = new Set([
    ...finances.consultingContracts
      .filter((contract) => contract.status === "active")
      .map((contract) => contract.clubId),
    ...(finances.pendingConsultingOffers ?? []).map((contract) => contract.clubId),
    ...(finances.blacklistedClubs ?? []),
  ]);
  const availableClubs = clubList.filter((club) => !unavailableClubIds.has(club.id));
  if (availableClubs.length === 0) return [];
  const club = rng.pick(availableClubs);
  const types: ConsultingType[] = ["transferAdvisory", "youthAudit", "dataPackage", "talentWorkshop"];
  const type = rng.pick(types);

  const config = CONSULTING_CONFIGS[type];
  const repMult = 0.5 + (scout.reputation / 100) * 0.5;
  const fee = Math.round(rng.nextInt(config.feeRange[0], config.feeRange[1]) * repMult);
  const deadline = addGameWeeksWithSeasonLength(
    { season, week },
    config.durationWeeks,
    seasonLength,
  );
  const offerExpiry = addGameWeeksWithSeasonLength(
    { season, week },
    2,
    seasonLength,
  );

  const contract: ConsultingContract = {
    id: `consult_${club.id}_${week}_${season}`,
    clubId: club.id,
    type,
    fee,
    deadline: deadline.week,
    deadlineSeason: deadline.season,
    status: "active",
    deliverables: (CONSULTING_DELIVERABLES[type] ?? []).map((deliverable) => ({
      ...deliverable,
    })),
    offeredWeek: week,
    offeredSeason: season,
    offerExpiresWeek: offerExpiry.week,
    offerExpiresSeason: offerExpiry.season,
    deliveredReportIds: [],
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
  scout?: Scout,
  week?: number,
  season?: number,
): FinancialRecord {
  if (
    finances.consultingContracts.some((candidate) =>
      candidate.clubId === contract.clubId && candidate.status === "active"
    )
    || (finances.blacklistedClubs ?? []).includes(contract.clubId)
    || (scout && !canAcceptConsultingWork(finances, scout, contract))
  ) return finances;
  return {
    ...finances,
    consultingContracts: [
      ...finances.consultingContracts,
      {
        ...contract,
        acceptedWeek: week ?? contract.offeredWeek,
        acceptedSeason: season ?? contract.offeredSeason,
        deliveredReportIds: contract.deliveredReportIds ?? [],
      },
    ],
  };
}

export function expireConsultingOffers(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  return {
    ...finances,
    pendingConsultingOffers: (finances.pendingConsultingOffers ?? []).filter((offer) =>
      offer.offerExpiresWeek === undefined
      || offer.offerExpiresSeason === undefined
      || !isGameDateAtOrAfter(
        { week, season },
        { week: offer.offerExpiresWeek, season: offer.offerExpiresSeason },
      )
    ),
  };
}

/**
 * A submitted client report advances matching consulting work once. Analysis
 * advances alongside a qualifying report so the player makes scouting
 * decisions, not bookkeeping clicks.
 */
export function recordConsultingReportDelivery(
  finances: FinancialRecord,
  clubId: string,
  report: Pick<ScoutReport, "id" | "qualityScore">,
  _player?: Pick<Player, "position" | "age">,
): FinancialRecord {
  return {
    ...finances,
    consultingContracts: finances.consultingContracts.map((contract) => {
      if (
        contract.clubId !== clubId
        || contract.status !== "active"
        || (contract.deliveredReportIds ?? []).includes(report.id)
        || report.qualityScore < 50
      ) return contract;
      return {
        ...contract,
        deliveredReportIds: [...(contract.deliveredReportIds ?? []), report.id],
        deliverables: (contract.deliverables ?? []).map((deliverable) => {
          if (deliverable.type !== "reports" && deliverable.type !== "analysis") {
            return deliverable;
          }
          return {
            ...deliverable,
            delivered: Math.min(deliverable.required, deliverable.delivered + 1),
          };
        }),
      };
    }),
  };
}

export function canCompleteConsulting(
  contract: ConsultingContract,
): boolean {
  return contract.status === "active" && (contract.deliverables ?? []).every((deliverable) =>
    deliverable.type === "presentation" || deliverable.delivered >= deliverable.required
  );
}

/**
 * Process consulting deadlines. Mark expired contracts as failed.
 */
export function processConsultingDeadline(
  finances: FinancialRecord,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  let updated = finances;
  for (const contract of finances.consultingContracts) {
    if (contract.status !== "active") continue;
    const deadline = addGameWeeksWithSeasonLength(
      { season: contract.deadlineSeason, week: 1 },
      Math.max(0, contract.deadline - 1),
      seasonLength,
    );
    if (!isGameDateAtOrAfter({ season, week }, deadline)) continue;
    const referenceId = `consulting:${contract.id}:failed`;
    if (updated.transactions.some((transaction) => transaction.referenceId === referenceId)) {
      continue;
    }
    updated = {
      ...updated,
      failedContractCount: (updated.failedContractCount ?? 0) + 1,
      consultingContracts: updated.consultingContracts.map((candidate) =>
        candidate.id === contract.id
          ? { ...candidate, status: "failed" as const }
          : candidate,
      ),
      clientRelationships: (updated.clientRelationships ?? []).map((relationship) =>
        relationship.clubId === contract.clubId
          ? {
              ...relationship,
              satisfaction: Math.max(0, relationship.satisfaction - 12),
              status: relationship.satisfaction - 12 < 25 ? "cooling" as const : relationship.status,
              lastInteractionWeek: week,
              lastInteractionSeason: season,
            }
          : relationship,
      ),
      transactions: [
        ...updated.transactions,
        {
          week,
          season,
          amount: 0,
          description: `Consulting contract failed (${contract.type})`,
          referenceId,
          category: "clientRevenue",
          counterpartyId: contract.clubId,
        },
      ],
    };
  }

  return updated;
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
  if (!contract || !canCompleteConsulting(contract)) return finances;
  const referenceId = `consulting:${contract.id}:completion`;
  if (finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
    return finances;
  }

  return {
    ...finances,
    balance: finances.balance + contract.fee,
    consultingRevenue: finances.consultingRevenue + contract.fee,
    consultingContracts: finances.consultingContracts.map((c) =>
      c.id === contractId
        ? {
            ...c,
            status: "completed" as const,
            deliverables: (c.deliverables ?? []).map((deliverable) => ({
              ...deliverable,
              delivered: deliverable.required,
            })),
          }
        : c,
    ),
    clientRelationships: (finances.clientRelationships ?? []).map((relationship) =>
      relationship.clubId === contract.clubId
        ? {
            ...relationship,
            totalRevenue: relationship.totalRevenue + contract.fee,
            satisfaction: Math.min(100, relationship.satisfaction + 6),
            status: "active" as const,
            lastInteractionWeek: week,
            lastInteractionSeason: season,
          }
        : relationship,
    ),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: contract.fee,
        description: `Consulting fee received (${contract.type})`,
        referenceId,
        category: "clientRevenue",
        counterpartyId: contract.clubId,
      },
    ],
  };
}
