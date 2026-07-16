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
  Player,
  Position,
  ScoutReport,
} from "../core/types";
import { processRetainerFailure } from "./clientRelationships";
import { canAcceptRetainerWork, getAgencyCapacity } from "./agencyCapacity";
import {
  addGameWeeksWithSeasonLength,
  gameWeeksBetweenWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";

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
  week = 1,
  season = 1,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
  players: Record<string, Player> = {},
): RetainerContract[] {
  if (scout.careerPath !== "independent") return [];

  const indTier = scout.independentTier ?? 1;
  const maxRetainers = MAX_RETAINERS_BY_TIER[indTier];
  const currentActive = finances.retainerContracts.filter((r) => r.status !== "cancelled").length;
  if (currentActive >= maxRetainers) return [];

  // Offer count scales with reputation
  const maxOffers = Math.min(3, Math.floor(scout.reputation / 25));
  if (maxOffers <= 0) return [];

  const offerCount = rng.nextInt(1, maxOffers);
  const unavailableClubIds = new Set([
    ...finances.retainerContracts
      .filter((contract) => contract.status !== "cancelled")
      .map((contract) => contract.clubId),
    ...(finances.pendingRetainerOffers ?? []).map((contract) => contract.clubId),
    ...(finances.blacklistedClubs ?? []),
  ]);
  const clubList = Object.values(clubs).filter((club) => !unavailableClubIds.has(club.id));
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
    const offerExpiry = addGameWeeksWithSeasonLength(
      { week, season },
      3,
      seasonLength,
    );
    const roster = club.playerIds.map((playerId) => players[playerId]).filter(Boolean);
    const positions: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
    const positionCounts = positions.map((position) => ({
      position,
      count: roster.filter((player) => player.position === position).length,
    }));
    const targetPosition = positionCounts.sort((left, right) =>
      left.count - right.count || left.position.localeCompare(right.position)
    )[0]?.position ?? rng.pick(positions);
    const focus = club.scoutingPhilosophy === "academyFirst"
      ? "academy" as const
      : club.scoutingPhilosophy === "globalRecruiter"
        ? "data" as const
        : "firstTeam" as const;
    const ageRange: [number, number] = focus === "academy" ? [15, 20] : [18, 27];

    offers.push({
      id: `retainer_${club.id}_${rng.nextInt(100000, 999999)}`,
      clubId: club.id,
      tier,
      monthlyFee,
      requiredReportsPerMonth: config.requiredReports,
      reportsDeliveredThisMonth: 0,
      status: "active",
      brief: {
        focus,
        targetPositions: [targetPosition],
        ageRange,
        minimumReportQuality: 48 + tier * 6,
        description: `${club.name} needs ${targetPosition} intelligence for its ${focus === "academy" ? "academy pathway" : focus === "data" ? "global recruitment model" : "first-team planning"}.`,
      },
      offeredWeek: week,
      offeredSeason: season,
      offerExpiresWeek: offerExpiry.week,
      offerExpiresSeason: offerExpiry.season,
      termMonths: 3,
      deliveredReportIds: [],
      averageDeliveredQuality: 0,
      consecutivePeriodsMet: 0,
      consecutivePeriodsMissed: 0,
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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord | null {
  const indTier = scout.independentTier ?? 1;
  const max = MAX_RETAINERS_BY_TIER[indTier];
  const current = finances.retainerContracts.filter((r) => r.status !== "cancelled").length;

  if (current >= max || !canAcceptRetainerWork(finances, scout, contract)) return null;

  if (
    finances.retainerContracts.some((candidate) =>
      candidate.clubId === contract.clubId && candidate.status !== "cancelled"
    )
    || (finances.blacklistedClubs ?? []).includes(contract.clubId)
  ) return null;

  const startWeek = contract.startWeek ?? contract.offeredWeek;
  const startSeason = contract.startSeason ?? contract.offeredSeason;
  const termMonths = contract.termMonths ?? 3;
  const nextSettlement = startWeek !== undefined && startSeason !== undefined
    ? addGameWeeksWithSeasonLength(
        { week: startWeek, season: startSeason },
        4,
        seasonLength,
      )
    : undefined;
  const termEnds = startWeek !== undefined && startSeason !== undefined
    ? addGameWeeksWithSeasonLength(
        { week: startWeek, season: startSeason },
        termMonths * 4,
        seasonLength,
      )
    : undefined;

  return {
    ...finances,
    retainerContracts: [
      ...finances.retainerContracts,
      {
        ...contract,
        startWeek,
        startSeason,
        termMonths,
        nextSettlementWeek: contract.nextSettlementWeek ?? nextSettlement?.week,
        nextSettlementSeason: contract.nextSettlementSeason ?? nextSettlement?.season,
        termEndsWeek: contract.termEndsWeek ?? termEnds?.week,
        termEndsSeason: contract.termEndsSeason ?? termEnds?.season,
        deliveredReportIds: contract.deliveredReportIds ?? [],
      },
    ],
  };
}

/** Remove stale pending offers before new business is generated. */
export function expireRetainerOffers(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  return {
    ...finances,
    pendingRetainerOffers: (finances.pendingRetainerOffers ?? []).filter((offer) =>
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
// Monthly period closing
// ---------------------------------------------------------------------------

export type RetainerCloseOutcome = "paid" | "missed" | "terminated";

export interface RetainerCloseEvent {
  contractId: string;
  clubId: string;
  outcome: RetainerCloseOutcome;
  amount: number;
  title: string;
  body: string;
  referenceId: string;
}

export interface RetainerPeriodCloseResult {
  finances: FinancialRecord;
  events: RetainerCloseEvent[];
  reputationPenalty: number;
}

/** Stable ledger key that makes a contract settlement idempotent for one close week. */
export function getRetainerCloseReferenceId(
  contractId: string,
  week: number,
  season: number,
): string {
  return `retainer-close:${contractId}:s${season}w${week}`;
}

/**
 * Close every active retainer exactly once at the end of a four-week period.
 * Payment, quota reset, failure consequences, suspension, and the audit entry
 * are one transaction authority. Replaying the same week is a no-op per
 * contract because every outcome records the same stable referenceId.
 */
export function closeRetainerPeriod(
  finances: FinancialRecord,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): RetainerPeriodCloseResult {
  if (week <= 0) {
    return { finances, events: [], reputationPenalty: 0 };
  }

  let updated = finances;
  const events: RetainerCloseEvent[] = [];
  let reputationPenalty = 0;
  const contractsAtClose = finances.retainerContracts.filter(
    (contract) => contract.status === "active" || contract.status === "suspended",
  );

  for (const contract of contractsAtClose) {
    const hasContractSettlementDate = Number.isInteger(contract.nextSettlementWeek)
      && Number.isInteger(contract.nextSettlementSeason);
    const settlementDue = hasContractSettlementDate
      ? isGameDateAtOrAfter(
          { week, season },
          {
            week: contract.nextSettlementWeek!,
            season: contract.nextSettlementSeason!,
          },
        )
      : week % 4 === 0;
    if (!settlementDue) continue;

    const referenceId = getRetainerCloseReferenceId(contract.id, week, season);
    if (updated.transactions.some((transaction) => transaction.referenceId === referenceId)) {
      continue;
    }

    const currentContract = updated.retainerContracts.find(
      (candidate) => candidate.id === contract.id,
    );
    if (
      !currentContract
      || (currentContract.status !== "active" && currentContract.status !== "suspended")
    ) continue;

    const nextSettlement = addGameWeeksWithSeasonLength(
      { week, season },
      4,
      seasonLength,
    );

    if (currentContract.reportsDeliveredThisMonth >= currentContract.requiredReportsPerMonth) {
      updated = {
        ...updated,
        balance: updated.balance + currentContract.monthlyFee,
        retainerRevenue: updated.retainerRevenue + currentContract.monthlyFee,
        retainerContracts: updated.retainerContracts.map((candidate) =>
          candidate.id === currentContract.id
            ? {
                ...candidate,
                status: "active" as const,
                reportsDeliveredThisMonth: 0,
                consecutivePeriodsMet: (candidate.consecutivePeriodsMet ?? 0) + 1,
                consecutivePeriodsMissed: 0,
                nextSettlementWeek: nextSettlement.week,
                nextSettlementSeason: nextSettlement.season,
              }
            : candidate,
        ),
        clientRelationships: updated.clientRelationships.map((relationship) =>
          relationship.clubId === currentContract.clubId
            ? {
                ...relationship,
                totalRevenue: relationship.totalRevenue + currentContract.monthlyFee,
                satisfaction: Math.min(100, relationship.satisfaction + 4),
                status: "active" as const,
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
            amount: currentContract.monthlyFee,
            description: "Retainer payment received",
            referenceId,
            category: "clientRevenue",
            counterpartyId: currentContract.clubId,
          },
        ],
      };
      events.push({
        contractId: currentContract.id,
        clubId: currentContract.clubId,
        outcome: "paid",
        amount: currentContract.monthlyFee,
        title: "Retainer Delivered",
        body: `Monthly report quota met. Retainer payment of £${currentContract.monthlyFee.toLocaleString()} received.`,
        referenceId,
      });
    } else {
      const failure = processRetainerFailure(
        updated,
        currentContract.clubId,
        week,
        season,
      );
      updated = failure.finances;
      const contractSurvived = updated.retainerContracts.some(
        (candidate) => candidate.id === currentContract.id,
      );
      const outcome: RetainerCloseOutcome = contractSurvived ? "missed" : "terminated";

      updated = {
        ...updated,
        retainerContracts: updated.retainerContracts.map((candidate) =>
          candidate.id === currentContract.id
            ? {
                ...candidate,
                status: "suspended" as const,
                reportsDeliveredThisMonth: 0,
                consecutivePeriodsMet: 0,
                consecutivePeriodsMissed: (candidate.consecutivePeriodsMissed ?? 0) + 1,
                nextSettlementWeek: nextSettlement.week,
                nextSettlementSeason: nextSettlement.season,
              }
            : candidate,
        ),
        transactions: [
          ...updated.transactions,
          {
            week,
            season,
            amount: 0,
            description: outcome === "terminated"
              ? "Retainer terminated after missed quota"
              : "Retainer suspended after missed quota",
            referenceId,
            category: "clientRevenue",
            counterpartyId: currentContract.clubId,
          },
        ],
      };

      if (outcome === "terminated") reputationPenalty += 5;
      const message = failure.messages[0] ?? {
        title: outcome === "terminated" ? "Contract Terminated" : "Missed Deliverable",
        body: outcome === "terminated"
          ? "Your retainer contract was terminated after a missed monthly quota."
          : "You missed the monthly report quota and the retainer has been suspended.",
      };
      events.push({
        contractId: currentContract.id,
        clubId: currentContract.clubId,
        outcome,
        amount: 0,
        title: message.title,
        body: failure.messages.length > 1
          ? failure.messages.map((item) => item.body).join(" ")
          : message.body,
        referenceId,
      });
    }
  }

  return { finances: updated, events, reputationPenalty };
}

/**
 * Record a report delivery against a retainer contract.
 * Call this when a report is submitted that matches a retainer club.
 */
export function recordRetainerDelivery(
  finances: FinancialRecord,
  clubId: string,
  report?: Pick<ScoutReport, "id" | "qualityScore">,
  player?: Pick<Player, "position" | "age">,
): FinancialRecord {
  const updatedContracts = finances.retainerContracts.map((c) => {
    if (c.clubId === clubId && (c.status === "active" || c.status === "suspended")) {
      if (report && (c.deliveredReportIds ?? []).includes(report.id)) return c;
      if (
        c.brief
        && report
        && player
        && (
          report.qualityScore < c.brief.minimumReportQuality
          || !c.brief.targetPositions.includes(player.position)
          || player.age < c.brief.ageRange[0]
          || player.age > c.brief.ageRange[1]
        )
      ) return c;
      const deliveredBefore = c.reportsDeliveredThisMonth;
      const deliveredAfter = deliveredBefore + 1;
      const averageDeliveredQuality = report
        ? Math.round(
          (((c.averageDeliveredQuality ?? 0) * deliveredBefore) + report.qualityScore)
          / deliveredAfter,
        )
        : c.averageDeliveredQuality;
      return {
        ...c,
        reportsDeliveredThisMonth: deliveredAfter,
        deliveredReportIds: report
          ? [...(c.deliveredReportIds ?? []), report.id]
          : c.deliveredReportIds,
        averageDeliveredQuality,
      };
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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
  scout?: Scout,
): FinancialRecord {
  const updatedContracts: RetainerContract[] = [];

  for (const contract of finances.retainerContracts) {
    if (contract.status !== "active") {
      updatedContracts.push(contract);
      continue;
    }

    const termWeeks = Math.max(4, (contract.termMonths ?? 3) * 4);
    const hasTermEnd = Number.isInteger(contract.termEndsWeek)
      && Number.isInteger(contract.termEndsSeason);
    const hasStart = Number.isInteger(contract.startWeek)
      && Number.isInteger(contract.startSeason);
    const age = hasStart
      ? gameWeeksBetweenWithSeasonLength(
          { week: contract.startWeek!, season: contract.startSeason! },
          { week, season },
          seasonLength,
        )
      : 0;
    const renewalDue = hasTermEnd
      ? isGameDateAtOrAfter(
          { week, season },
          { week: contract.termEndsWeek!, season: contract.termEndsSeason! },
        )
      : hasStart
        ? age > 0 && age % termWeeks === 0
        : week % termWeeks === 0;
    if (!renewalDue) {
      updatedContracts.push(contract);
      continue;
    }

    const nextTermEnd = addGameWeeksWithSeasonLength(
      { week, season },
      termWeeks,
      seasonLength,
    );
    const renewedTerm = {
      termEndsWeek: nextTermEnd.week,
      termEndsSeason: nextTermEnd.season,
    };

    const relationship = finances.clientRelationships.find((cr) => cr.clubId === contract.clubId);
    const satisfaction = relationship?.satisfaction ?? 50;

    if (satisfaction >= 70) {
      // Auto-renew; 20% chance of tier upgrade
      const proposedTier = Math.min(5, contract.tier + 1) as 1 | 2 | 3 | 4 | 5;
      const proposedConfig = RETAINER_TIERS[proposedTier];
      const expansionWork = Math.max(
        0,
        proposedConfig.requiredReports - contract.requiredReportsPerMonth,
      );
      const canExpand = !scout
        || getAgencyCapacity(finances, scout).availableReportCapacity >= expansionWork;
      if (rng.chance(0.2) && contract.tier < 5 && canExpand) {
        const newTier = (contract.tier + 1) as 1 | 2 | 3 | 4 | 5;
        const config = proposedConfig;
        const newFee = rng.nextInt(config.monthlyFeeRange[0], config.monthlyFeeRange[1]);
        updatedContracts.push({
          ...contract,
          tier: newTier,
          monthlyFee: newFee,
          requiredReportsPerMonth: config.requiredReports,
          ...renewedTerm,
        });
      } else {
        updatedContracts.push({ ...contract, ...renewedTerm });
      }
    } else if (satisfaction >= 40) {
      // Auto-renew at same tier
      updatedContracts.push({ ...contract, ...renewedTerm });
    } else {
      // Not renewed — cancel the contract
      updatedContracts.push({ ...contract, status: "cancelled" });
    }
  }

  return { ...finances, retainerContracts: updatedContracts };
}
