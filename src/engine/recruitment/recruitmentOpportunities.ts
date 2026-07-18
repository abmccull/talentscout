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
  addGameWeeksWithCalendar,
  createGameCalendarIndex,
  gameWeeksBetweenWithCalendar,
  isGameDateAtOrAfter,
  type GameCalendarIndex,
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

interface RecruitmentProjectionIndex {
  calendar: GameCalendarIndex;
  listingsById: Map<string, ReportListing>;
  decisionsByDeliveryId: Map<string, ClubDecision>;
  movementsByPlayerAndDestination: Map<string, PlayerMovementEvent[]>;
}

function compareDates(
  left: { week: number; season: number },
  right: { week: number; season: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function listingForDelivery(
  delivery: ReportDelivery,
  index: RecruitmentProjectionIndex,
): ReportListing | undefined {
  if (!delivery.listingId) return undefined;
  return index.listingsById.get(delivery.listingId);
}

function movementIndexKey(playerId: string, destinationClubId: string): string {
  return `${playerId}|${destinationClubId}`;
}

function buildRecruitmentProjectionIndex(
  fixtures: Record<string, Fixture>,
  listings: readonly ReportListing[],
  decisions: Record<string, ClubDecision>,
  movements: readonly PlayerMovementEvent[],
): RecruitmentProjectionIndex {
  const listingsById = new Map<string, ReportListing>();
  for (const listing of listings) {
    if (!listingsById.has(listing.id)) listingsById.set(listing.id, listing);
  }

  const decisionsByDeliveryId = new Map<string, ClubDecision>();
  for (const decision of Object.values(decisions)) {
    if (decision.deliveryId && !decisionsByDeliveryId.has(decision.deliveryId)) {
      decisionsByDeliveryId.set(decision.deliveryId, decision);
    }
  }

  const movementsByPlayerAndDestination = new Map<string, PlayerMovementEvent[]>();
  for (const movement of movements) {
    if (!SIGNING_MOVEMENT_TYPES.has(movement.type) || !movement.toClubId) continue;
    const key = movementIndexKey(movement.playerId, movement.toClubId);
    const matching = movementsByPlayerAndDestination.get(key) ?? [];
    matching.push(movement);
    movementsByPlayerAndDestination.set(key, matching);
  }
  for (const matching of movementsByPlayerAndDestination.values()) {
    matching.sort((left, right) =>
      compareDates(left, right) || left.id.localeCompare(right.id)
    );
  }

  return {
    calendar: createGameCalendarIndex(fixtures),
    listingsById,
    decisionsByDeliveryId,
    movementsByPlayerAndDestination,
  };
}

function matchingMovement(
  delivery: ReportDelivery,
  report: ScoutReport,
  index: RecruitmentProjectionIndex,
): PlayerMovementEvent | undefined {
  const candidates = index.movementsByPlayerAndDestination.get(
    movementIndexKey(report.playerId, delivery.clubId),
  ) ?? [];
  for (const movement of candidates) {
    if (
      isGameDateAtOrAfter(
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
          : gameWeeksBetweenWithCalendar(
              index.calendar,
              { week: delivery.deliveredWeek, season: delivery.deliveredSeason },
              { week: movement.week, season: movement.season },
            ) <= DEFAULT_RECRUITMENT_OPPORTUNITY_WEEKS
      )
    ) {
      return movement;
    }
  }
  return undefined;
}

function decisionForDelivery(
  delivery: ReportDelivery,
  decisions: Record<string, ClubDecision>,
  index: RecruitmentProjectionIndex,
): ClubDecision | undefined {
  if (delivery.decisionId && decisions[delivery.decisionId]) {
    return decisions[delivery.decisionId];
  }
  return index.decisionsByDeliveryId.get(delivery.id);
}

function hasPassedDeadline(
  report: ScoutReport,
  delivery: ReportDelivery,
  current: { week: number; season: number },
  calendar: GameCalendarIndex,
): boolean {
  if (
    report.decisionDeadlineWeek === undefined
    || report.decisionDeadlineSeason === undefined
  ) {
    return gameWeeksBetweenWithCalendar(
      calendar,
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
  calendar: GameCalendarIndex;
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
  if (hasPassedDeadline(input.report, input.delivery, input.current, input.calendar)) {
    const defaultExpiry = addGameWeeksWithCalendar(
      input.calendar,
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
  const index = buildRecruitmentProjectionIndex(
    fixtures,
    listings,
    decisions,
    movements,
  );
  const opportunities: RecruitmentOpportunity[] = [];

  for (const delivery of Object.values(state.reportDeliveries)) {
    if (!delivery.reportId) continue;
    const report = state.reports[delivery.reportId];
    if (!report || report.playerId.length === 0 || delivery.clubId.length === 0) continue;

    const listing = listingForDelivery(delivery, index);
    const decision = decisionForDelivery(delivery, decisions, index);
    const movement = matchingMovement(delivery, report, index);
    const outcome = deriveOutcome({
      report,
      delivery,
      decision,
      movement,
      current: { week: state.currentWeek, season: state.currentSeason },
      calendar: index.calendar,
    });
    const defaultDeadline = addGameWeeksWithCalendar(
      index.calendar,
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
  return findCausalRecruitmentOpportunityIn(
    deriveRecruitmentOpportunities(state),
    transfer,
    scoutId,
  );
}

/** Reuse one canonical opportunity projection across a weekly transfer batch. */
export function findCausalRecruitmentOpportunityIn(
  opportunities: readonly RecruitmentOpportunity[],
  transfer: RecruitmentTransfer,
  scoutId: string,
): RecruitmentOpportunity | undefined {
  return opportunities.find((opportunity) =>
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
