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
  Player,
  PitchResult,
  GameDate,
  GameState,
} from "../core/types";
import {
  addGameWeeks,
  gameWeeksBetween,
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";
import { buildYouthRetainerBrief } from "./retainerBriefs";

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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  const updated = finances.clientRelationships.map((cr) => {
    const weeksSinceInteraction = gameWeeksBetweenWithSeasonLength(
      {
        season: cr.lastInteractionSeason,
        week: cr.lastInteractionWeek,
      },
      { season, week },
      seasonLength,
    );

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

export type ClientPitchType = "coldCall" | "referral" | "showcase";
export interface ClientPitchAttempt {
  clubId: string;
  pitchType: ClientPitchType;
  occurredAt: GameDate;
  retryAt: GameDate;
  cost: number;
  success: boolean;
  message: string;
  evidenceLabel?: string;
  /** Stable contact or report reference; the label is a readable presentation only. */
  evidenceId?: string;
}
export const CLIENT_PITCH_COSTS: Record<ClientPitchType, number> = {
  coldCall: 50, referral: 50, showcase: 100,
};
export const CLIENT_PITCH_FATIGUE = 3;
export const CLIENT_PITCH_COOLDOWN_WEEKS = 4;

/** The UI and mutation share the same eligibility policy. Missing old-save history is empty. */
export function getClientPitchEligibility(
  state: GameState,
  clubId: string,
  pitchType: ClientPitchType,
): { eligible: boolean; reason: string; cost: number; evidenceLabel?: string; evidenceId?: string } {
  const cost = CLIENT_PITCH_COSTS[pitchType];
  const blocked = (reason: string) => ({ eligible: false, reason, cost });
  const finances = state.finances;
  const club = state.clubs[clubId];
  if (!finances || !club || !Number.isFinite(cost)) return blocked("Choose an available club and pitch method.");
  if (state.scout.careerPath !== "independent") return blocked("Client outreach is available to independent scouts.");
  if (isClubBlacklisted(finances, clubId)) return blocked("This club has blacklisted your agency.");
  if (finances.retainerContracts.some(contract => contract.clubId === clubId && contract.status === "active")
    || finances.pendingRetainerOffers.some(contract => contract.clubId === clubId)) {
    return blocked("This club already has an active contract or pending offer.");
  }
  const now = { week: state.currentWeek, season: state.currentSeason };
  const attempts = finances.clientPitchHistory ?? [];
  const lastClubAttempt = [...attempts].reverse().find(attempt => attempt.clubId === clubId);
  if (lastClubAttempt && gameWeeksBetween(state.fixtures, now, lastClubAttempt.retryAt) > 0) {
    return blocked(`This club will hear another pitch in season ${lastClubAttempt.retryAt.season}, week ${lastClubAttempt.retryAt.week}.`);
  }
  if (attempts.some(attempt => attempt.occurredAt.season === now.season && attempt.occurredAt.week === now.week)) {
    return blocked("Your outreach slot is used this week. Prepare your next pitch for next week.");
  }
  if (!Number.isFinite(finances.balance) || finances.balance < cost) return blocked(`You need £${cost} available for preparation and outreach.`);
  if (!Number.isFinite(state.scout.fatigue) || state.scout.fatigue > 100 - CLIENT_PITCH_FATIGUE) {
    return blocked("Rest before pitching; outreach adds 3 fatigue.");
  }
  let evidenceLabel: string | undefined;
  let evidenceId: string | undefined;
  if (pitchType === "referral") {
    const contact = Object.values(state.contacts).filter(candidate =>
      [club.id, club.name, club.shortName].filter(Boolean).includes(candidate.organization)
      && !candidate.dormant && candidate.relationship >= 50
      && (!candidate.accessSuspendedUntil || gameWeeksBetween(state.fixtures, now, candidate.accessSuspendedUntil) < 0)
    ).sort((a, b) => b.relationship - a.relationship || a.id.localeCompare(b.id))[0];
    if (!contact) return blocked("Referral needs an active contact at this club with relationship 50+ and no suspended access.");
    evidenceLabel = `Referred by ${contact.name}`;
    evidenceId = contact.id;
  }
  if (pitchType === "showcase") {
    const report = Object.values(state.reports).filter(candidate =>
      candidate.scoutId === state.scout.id && candidate.qualityScore >= 65
      && candidate.submittedWeek >= 1 && candidate.submittedSeason >= 1
      && gameWeeksBetween(state.fixtures, { week: candidate.submittedWeek, season: candidate.submittedSeason }, now) >= 0
    ).sort((a, b) => b.qualityScore - a.qualityScore || a.id.localeCompare(b.id))[0];
    if (!report) return blocked("Showcase needs one of your completed reports with quality 65+.");
    const player = state.players[report.playerId];
    evidenceLabel = `${player ? `Report on ${player.firstName} ${player.lastName}` : "Your completed report"} · quality ${Math.round(report.qualityScore)} · season ${report.submittedSeason}, week ${report.submittedWeek}`;
    evidenceId = report.id;
  }
  return { eligible: true, reason: `£${cost} + 3 fatigue · one pitch this week · this club waits 4 weeks after a decline.`, cost, evidenceLabel, evidenceId };
}

/** Apply one eligible attempt atomically; blocked actions consume neither RNG nor resources. */
export function attemptClientPitch(
  state: GameState,
  clubId: string,
  pitchType: ClientPitchType,
  rng: RNG,
): GameState {
  const eligibility = getClientPitchEligibility(state, clubId, pitchType);
  if (!eligibility.eligible || !state.finances) return state;
  const club = state.clubs[clubId];
  const actionSequence = (state.finances.actionSequence ?? 0) + 1;
  const result = pitchToClub(rng, state.scout, state.finances, club, pitchType, actionSequence, state.players);
  const occurredAt = { week: state.currentWeek, season: state.currentSeason };
  const retryAt = addGameWeeks(state.fixtures, occurredAt, CLIENT_PITCH_COOLDOWN_WEEKS);
  const attempt: ClientPitchAttempt = {
    clubId, pitchType, occurredAt, retryAt, cost: eligibility.cost,
    success: result.success, message: result.success ? result.message
      : `${club.name} declined. You can approach again in season ${retryAt.season}, week ${retryAt.week}.`,
    evidenceLabel: eligibility.evidenceLabel,
    evidenceId: eligibility.evidenceId,
  };
  let finances: FinancialRecord = {
    ...state.finances, actionSequence,
    balance: state.finances.balance - eligibility.cost,
    // One attempt per week keeps this recent audit comfortably beyond every active cooldown.
    clientPitchHistory: [...(state.finances.clientPitchHistory ?? []), attempt].slice(-52),
    transactions: [...state.finances.transactions, {
      week: state.currentWeek, season: state.currentSeason, amount: -eligibility.cost,
      description: `Client pitch preparation: ${club.name} (${pitchType})`,
      category: "operatingCost", referenceId: `client-pitch:${actionSequence}`, counterpartyId: clubId,
    }],
  };
  if (result.success && result.offeredContract) {
    finances = ensureClientRelationship(finances, clubId, state.currentWeek, state.currentSeason);
    finances = { ...finances, pendingRetainerOffers: [...finances.pendingRetainerOffers, result.offeredContract] };
  }
  return { ...state, finances, scout: { ...state.scout, fatigue: state.scout.fatigue + CLIENT_PITCH_FATIGUE } };
}

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
  actionSequence = (finances.actionSequence ?? 0) + 1,
  players: Record<string, Player> = {},
): PitchResult {
  const alreadyRetained = finances.retainerContracts.some(
    (contract) => contract.clubId === club.id && contract.status === "active",
  ) || finances.pendingRetainerOffers.some(
    (contract) => contract.clubId === club.id,
  );
  if (alreadyRetained) {
    return {
      success: false,
      message: `${club.name} already has an active or pending retainer relationship.`,
    };
  }
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
  const monthlyFee = rng.nextInt(minFee, maxFee);

  const contract: RetainerContract = {
    id: `retainer_${club.id}_pitch_a${actionSequence}`,
    clubId: club.id,
    tier: tier as 1 | 2 | 3 | 4 | 5,
    monthlyFee,
    requiredReportsPerMonth: requiredReports,
    reportsDeliveredThisMonth: 0,
    status: "active",
    brief: buildYouthRetainerBrief(club, players, tier),
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
    failedContracts: 0,
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
    const failedContracts = (relationship.failedContracts ?? 0) + 1;
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
        cr.clubId === clubId
          ? { ...cr, status: "lost" as const, failedContracts }
          : cr,
      ),
    };

    messages.push({
      title: "Contract Terminated",
      body: `Your retainer contract has been terminated due to consistently missed deliverables. Reputation penalty applied. (-5 reputation)`,
    });

    const existingBlacklist = updated.blacklistedClubs ?? [];
    const clubFailures = failedContracts;
    if (clubFailures >= 3 && !existingBlacklist.includes(clubId)) {
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
      updated = {
        ...updated,
        blacklistedClubs: existingBlacklist,
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
 * Check if a club has reached permanent blacklist status.
 */
export function isClubBlacklisted(finances: FinancialRecord, clubId: string): boolean {
  const blacklist = finances.blacklistedClubs ?? [];
  return blacklist.includes(clubId);
}
