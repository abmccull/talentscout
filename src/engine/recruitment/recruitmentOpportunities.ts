import type {
  ClubDecision,
  FinancialRecord,
  Fixture,
  PlayerMovementEvent,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import {
  addGameWeeks,
  gameWeeksBetween,
  isGameDateAtOrAfter,
} from "@/engine/core/gameDate";

export const DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS = 16;

export type RecruitmentOpportunityOutcome =
  | "delivered"
  | "followUpRequested"
  | "trial"
  | "accepted"
  | "rejected"
  | "expired"
  | "signed";

export type RecruitmentOpportunityExclusivity =
  | "exclusive"
  | "nonExclusive"
  | "direct";

/**
 * Player-safe projection of one persisted recommendation reaching a club.
 *
 * Report deliveries remain the write authority. This projection joins that
 * immutable delivery to its exact report revision, buyer, brief, deadline,
 * decision, and real movement outcome without creating a second save path.
 */
export interface RecruitmentOpportunity {
  id: string;
  caseId: string;
  deliveryId: string;
  reportId: string;
  reportRevision: number;
  playerId: string;
  scoutId: string;
  briefId?: string;
  listingId?: string;
  bidId?: string;
  /** Club that received the recommendation and could act on it. */
  targetClubId: string;
  /** Present only when the recommendation was purchased through the market. */
  buyerClubId?: string;
  /** Actual destination, present only after a matching player movement. */
  destinationClubId?: string;
  exclusivity: RecruitmentOpportunityExclusivity;
  deliveredWeek: number;
  deliveredSeason: number;
  deadlineWeek?: number;
  deadlineSeason?: number;
  outcome: RecruitmentOpportunityOutcome;
  outcomeWeek?: number;
  outcomeSeason?: number;
  decisionId?: string;
  transferMovementId?: string;
}

export interface RecruitmentOpportunityState {
  currentWeek: number;
  currentSeason: number;
  fixtures?: Record<string, Fixture>;
  reports: Record<string, ScoutReport>;
  scoutingCases?: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions?: Record<string, ClubDecision>;
  playerMovementHistory?: PlayerMovementEvent[];
  finances?: Pick<FinancialRecord, "reportListings">;
}

export interface RecruitmentTransfer {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
  week: number;
  season: number;
}

const SIGNING_MOVEMENT_TYPES = new Set<PlayerMovementEvent["type"]>([
  "permanentTransfer",
  "youthSigning",
  "freeAgentSigning",
  "loanBuyOption",
]);

function compareDates(
  left: { week: number; season: number },
  right: { week: number; season: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function listingForDelivery(
  delivery: ReportDelivery,
  listings: readonly ReportListing[],
): ReportListing | undefined {
  if (!delivery.listingId) return undefined;
  return listings.find((listing) => listing.id === delivery.listingId);
}

function matchingMovement(
  delivery: ReportDelivery,
  report: ScoutReport,
  fixtures: Record<string, Fixture>,
  movements: readonly PlayerMovementEvent[],
): PlayerMovementEvent | undefined {
  return movements
    .filter((movement) =>
      SIGNING_MOVEMENT_TYPES.has(movement.type)
      && movement.playerId === report.playerId
      && movement.toClubId === delivery.clubId
      && isGameDateAtOrAfter(
        { week: movement.week, season: movement.season },
        { week: delivery.deliveredWeek, season: delivery.deliveredSeason },
      )
      && (
        report.decisionDeadlineWeek !== undefined
        && report.decisionDeadlineSeason !== undefined
          ? isGameDateAtOrAfter(
              {
                week: report.decisionDeadlineWeek,
                season: report.decisionDeadlineSeason,
              },
              { week: movement.week, season: movement.season },
            )
          : gameWeeksBetween(
              fixtures,
              { week: delivery.deliveredWeek, season: delivery.deliveredSeason },
              { week: movement.week, season: movement.season },
            ) <= DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS
      ),
    )
    .sort((left, right) =>
      compareDates(left, right) || left.id.localeCompare(right.id)
    )[0];
}

function decisionForDelivery(
  delivery: ReportDelivery,
  decisions: Record<string, ClubDecision>,
): ClubDecision | undefined {
  if (delivery.decisionId && decisions[delivery.decisionId]) {
    return decisions[delivery.decisionId];
  }
  return Object.values(decisions).find(
    (decision) => decision.deliveryId === delivery.id,
  );
}

function hasPassedDeadline(
  report: ScoutReport,
  delivery: ReportDelivery,
  current: { week: number; season: number },
  fixtures: Record<string, Fixture>,
): boolean {
  if (
    report.decisionDeadlineWeek === undefined
    || report.decisionDeadlineSeason === undefined
  ) {
    return gameWeeksBetween(
      fixtures,
      { week: delivery.deliveredWeek, season: delivery.deliveredSeason },
      current,
    ) > DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS;
  }
  const deadline = {
    week: report.decisionDeadlineWeek,
    season: report.decisionDeadlineSeason,
  };
  return isGameDateAtOrAfter(current, deadline) && compareDates(current, deadline) > 0;
}

function deriveOutcome(input: {
  report: ScoutReport;
  delivery: ReportDelivery;
  decision?: ClubDecision;
  movement?: PlayerMovementEvent;
  current: { week: number; season: number };
  fixtures: Record<string, Fixture>;
}): Pick<
  RecruitmentOpportunity,
  "outcome" | "outcomeWeek" | "outcomeSeason" | "decisionId" | "transferMovementId" | "destinationClubId"
> {
  if (input.movement?.toClubId) {
    return {
      outcome: "signed",
      outcomeWeek: input.movement.week,
      outcomeSeason: input.movement.season,
      transferMovementId: input.movement.id,
      destinationClubId: input.movement.toClubId,
      ...(input.decision ? { decisionId: input.decision.id } : {}),
    };
  }
  if (input.decision?.outcome === "rejected") {
    return {
      outcome: "rejected",
      outcomeWeek: input.decision.decidedWeek,
      outcomeSeason: input.decision.decidedSeason,
      decisionId: input.decision.id,
    };
  }
  if (hasPassedDeadline(input.report, input.delivery, input.current, input.fixtures)) {
    const defaultExpiry = addGameWeeks(
      input.fixtures,
      {
        week: input.delivery.deliveredWeek,
        season: input.delivery.deliveredSeason,
      },
      DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS,
    );
    return {
      outcome: "expired",
      outcomeWeek: input.report.decisionDeadlineWeek ?? defaultExpiry.week,
      outcomeSeason: input.report.decisionDeadlineSeason ?? defaultExpiry.season,
    };
  }
  if (input.decision) {
    return {
      outcome: input.decision.outcome,
      outcomeWeek: input.decision.decidedWeek,
      outcomeSeason: input.decision.decidedSeason,
      decisionId: input.decision.id,
    };
  }
  return { outcome: "delivered" };
}

/** Derive every complete opportunity from canonical persisted records. */
export function deriveRecruitmentOpportunities(
  state: RecruitmentOpportunityState,
): RecruitmentOpportunity[] {
  const listings = state.finances?.reportListings ?? [];
  const decisions = state.clubDecisions ?? {};
  const movements = state.playerMovementHistory ?? [];
  const fixtures = state.fixtures ?? {};
  const opportunities: RecruitmentOpportunity[] = [];

  for (const delivery of Object.values(state.reportDeliveries)) {
    if (!delivery.reportId) continue;
    const report = state.reports[delivery.reportId];
    if (!report || report.playerId.length === 0 || delivery.clubId.length === 0) continue;

    const listing = listingForDelivery(delivery, listings);
    const decision = decisionForDelivery(delivery, decisions);
    const movement = matchingMovement(delivery, report, fixtures, movements);
    const outcome = deriveOutcome({
      report,
      delivery,
      decision,
      movement,
      current: { week: state.currentWeek, season: state.currentSeason },
      fixtures,
    });
    const defaultDeadline = addGameWeeks(
      fixtures,
      { week: delivery.deliveredWeek, season: delivery.deliveredSeason },
      DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS,
    );
    const scoutingCase = state.scoutingCases?.[delivery.caseId];
    const isMarketplace = delivery.channel === "marketplaceSale";

    opportunities.push({
      id: `recruitment-opportunity:${delivery.id}`,
      caseId: delivery.caseId,
      deliveryId: delivery.id,
      reportId: report.id,
      reportRevision: report.revision ?? 1,
      playerId: report.playerId,
      scoutId: report.scoutId,
      briefId: report.briefId ?? scoutingCase?.briefId,
      listingId: delivery.listingId,
      bidId: delivery.bidId,
      targetClubId: delivery.clubId,
      buyerClubId: isMarketplace ? delivery.clubId : undefined,
      exclusivity: isMarketplace
        ? listing?.isExclusive ? "exclusive" : "nonExclusive"
        : "direct",
      deliveredWeek: delivery.deliveredWeek,
      deliveredSeason: delivery.deliveredSeason,
      deadlineWeek: report.decisionDeadlineWeek ?? defaultDeadline.week,
      deadlineSeason: report.decisionDeadlineSeason ?? defaultDeadline.season,
      ...outcome,
    });
  }

  return opportunities.sort((left, right) =>
    compareDates(
      { week: right.deliveredWeek, season: right.deliveredSeason },
      { week: left.deliveredWeek, season: left.deliveredSeason },
    )
    || right.reportRevision - left.reportRevision
    || left.id.localeCompare(right.id)
  );
}

/**
 * Return the exact delivered recommendation resolved by this transfer.
 * A report about the player, or a sale to another club, is not causal credit.
 */
export function findCausalRecruitmentOpportunity(
  state: RecruitmentOpportunityState,
  transfer: RecruitmentTransfer,
  scoutId: string,
): RecruitmentOpportunity | undefined {
  return deriveRecruitmentOpportunities(state).find((opportunity) =>
    opportunity.scoutId === scoutId
    && opportunity.playerId === transfer.playerId
    && opportunity.targetClubId === transfer.toClubId
    && opportunity.destinationClubId === transfer.toClubId
    && opportunity.outcome === "signed"
    && opportunity.outcomeWeek === transfer.week
    && opportunity.outcomeSeason === transfer.season
  );
}

/** Stable audit key shared by causal rewards and their ledger entries. */
export function getRecruitmentOpportunityTransferReference(
  opportunity: RecruitmentOpportunity,
  transfer: RecruitmentTransfer,
): string {
  return [
    opportunity.id,
    "transfer",
    transfer.playerId,
    transfer.fromClubId,
    transfer.toClubId,
    `s${transfer.season}w${transfer.week}`,
  ].join(":");
}
