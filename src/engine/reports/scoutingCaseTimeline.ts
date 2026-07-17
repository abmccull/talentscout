import type {
  AlumniCareerUpdateType,
  GameState,
  PlayerMovementEvent,
  ScoutingCaseStatus,
} from "@/engine/core/types";
import {
  buildRecommendationReviewTimelineDescription,
  buildRecommendationReviewTimelineDetails,
} from "@/engine/reports/recommendationReviewDisplay";

export type ScoutingCaseTimelineEntryKind =
  | "discovery"
  | "reflection"
  | "judgment"
  | "report"
  | "delivery"
  | "decision"
  | "alumni"
  | "movement"
  | "review"
  | "milestone";

export interface ScoutingCaseTimelineEntry {
  id: string;
  kind: ScoutingCaseTimelineEntryKind;
  week: number;
  season: number;
  title: string;
  description: string;
  details?: string[];
  reportId?: string;
  clubId?: string;
  reviewId?: string;
  alumniRecordId?: string;
  movementId?: string;
  reflectionId?: string;
  decisionId?: string;
}

export interface ScoutingCaseTimeline {
  caseId: string;
  playerId: string;
  status: ScoutingCaseStatus;
  openedWeek: number;
  openedSeason: number;
  entries: ScoutingCaseTimelineEntry[];
}

const ENTRY_ORDER: Record<ScoutingCaseTimelineEntryKind, number> = {
  discovery: 0,
  reflection: 1,
  judgment: 2,
  report: 3,
  delivery: 4,
  decision: 5,
  alumni: 6,
  movement: 7,
  review: 8,
  milestone: 9,
};

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function clubName(state: GameState, clubId: string | undefined): string {
  if (!clubId) return "an unknown club";
  return state.clubs[clubId]?.name ?? "an unknown club";
}

function reportConviction(value: string): string {
  return value === "tablePound" ? "Table Pound" : humanize(value);
}

function movementTitle(movement: PlayerMovementEvent): string {
  const titles: Record<PlayerMovementEvent["type"], string> = {
    youthSigning: "Joined an academy",
    permanentTransfer: "Completed a permanent transfer",
    loanStart: "Moved on loan",
    loanReturn: "Returned from loan",
    loanRecall: "Recalled from loan",
    loanBuyOption: "Loan became permanent",
    release: "Released by club",
    freeAgentSigning: "Signed as a free agent",
    contractRenewal: "Renewed contract",
    retirement: "Retired from football",
    footballExit: "Left professional football",
  };
  return titles[movement.type];
}

function movementDescription(state: GameState, movement: PlayerMovementEvent): string {
  const from = movement.fromClubId ? clubName(state, movement.fromClubId) : undefined;
  const to = movement.toClubId ? clubName(state, movement.toClubId) : undefined;
  const fee = movement.fee && movement.fee > 0
    ? ` for £${movement.fee.toLocaleString("en-GB")}`
    : "";

  if (from && to) return `${from} to ${to}${fee}.`;
  if (to) return `Joined ${to}${fee}.`;
  if (from) return `Departed ${from}.`;
  return "The player's recorded career status changed.";
}

function alumniUpdateTitle(type: AlumniCareerUpdateType): string {
  const titles: Record<AlumniCareerUpdateType, string> = {
    debut: "Made a first-team debut",
    firstGoal: "Scored a first senior goal",
    teamOfWeek: "Earned Team of the Week recognition",
    loanMove: "Moved on loan",
    transfer: "Changed clubs",
    released: "Was released",
    internationalCall: "Received an international call-up",
    injury: "Suffered an injury setback",
    captaincy: "Was named captain",
  };
  return titles[type];
}

function isOnOrAfter(
  season: number,
  week: number,
  openedSeason: number,
  openedWeek: number,
): boolean {
  return season > openedSeason || (season === openedSeason && week >= openedWeek);
}

/**
 * Project the complete, player-visible history of one scouting case.
 *
 * This function deliberately returns only persisted information already shown
 * elsewhere in the product. It never reads player ability, potential, hidden
 * attributes, validation snapshots, or random rolls.
 */
export function buildScoutingCaseTimeline(
  state: GameState,
  caseId: string,
): ScoutingCaseTimeline | null {
  const scoutingCase = state.scoutingCases?.[caseId];
  if (!scoutingCase) return null;

  const entries: ScoutingCaseTimelineEntry[] = [];
  const caseReportIds = new Set(scoutingCase.reportIds ?? []);
  const caseDeliveryIds = new Set(scoutingCase.deliveryIds ?? []);
  const caseDecisionIds = new Set(scoutingCase.decisionIds ?? []);
  const caseReviewIds = new Set(scoutingCase.reviewIds ?? []);

  const discovery = (state.discoveryRecords ?? []).find(
    (record) => record.playerId === scoutingCase.playerId,
  );
  if (discovery) {
    entries.push({
      id: `discovery:${scoutingCase.playerId}:${discovery.discoveredSeason}:${discovery.discoveredWeek}`,
      kind: "discovery",
      week: discovery.discoveredWeek,
      season: discovery.discoveredSeason,
      title: "First entered your notebook",
      description: "You recorded the player as a prospect worth following.",
    });
  }

  for (const reflection of Object.values(state.reflectionJournal ?? {})) {
    if (!reflection.playerIds.includes(scoutingCase.playerId)) continue;
    const summary = reflection.summary?.trim()
      || reflection.notes.find((note) => note.trim().length > 0)?.trim()
      || `${reflection.hypotheses.length} hypothesis${reflection.hypotheses.length === 1 ? "" : "es"} preserved from the session.`;
    entries.push({
      id: `reflection:${reflection.id}`,
      kind: "reflection",
      week: reflection.week,
      season: reflection.season,
      title: `${humanize(reflection.activityType)} reflection`,
      description: summary,
      reflectionId: reflection.id,
    });
  }

  for (const decision of Object.values(state.consequenceState?.decisions ?? {})) {
    if (
      decision.source.kind !== "professionalCase"
      || decision.metadata?.caseId !== caseId
    ) continue;
    const selected = decision.options.find((option) =>
      option.id === decision.selectedOptionId,
    );
    entries.push({
      id: `judgment:${decision.id}`,
      kind: "judgment",
      week: decision.selectedAt?.week ?? decision.offeredAt.week,
      season: decision.selectedAt?.season ?? decision.offeredAt.season,
      title: selected
        ? `Case approach · ${selected.label}`
        : "Professional judgment opened",
      description: selected
        ? selected.knownTradeoffs.join(" ")
        : typeof decision.metadata?.centralQuestion === "string"
          ? decision.metadata.centralQuestion
          : "The case required a deliberate choice between competing professional priorities.",
      decisionId: decision.id,
    });
  }
  for (const history of state.consequenceState?.history ?? []) {
    if (
      history.source.kind !== "professionalCase"
      || history.metadata?.caseId !== caseId
      || entries.some((entry) => entry.id === `judgment:${history.decisionId}`)
    ) continue;
    entries.push({
      id: `judgment:${history.decisionId}`,
      kind: "judgment",
      week: history.terminalAt.week,
      season: history.terminalAt.season,
      title: history.selectedOptionId
        ? `Case approach · ${humanize(history.selectedOptionId)}`
        : "Professional judgment expired",
      description: typeof history.metadata?.centralQuestion === "string"
        ? history.metadata.centralQuestion
        : "The case decision became part of the scout's permanent record.",
      decisionId: history.decisionId,
    });
  }

  for (const fact of Object.values(state.consequenceState?.facts ?? {})) {
    if (
      fact.kind !== "professionalCaseCallback"
      || fact.metadata?.caseId !== caseId
    ) continue;
    entries.push({
      id: `case-callback:${fact.id}`,
      kind: "milestone",
      week: fact.observedAt.week,
      season: fact.observedAt.season,
      title: fact.metadata?.outcome === "setback" || fact.value === "setback"
        ? "The accepted risk came due"
        : "The chosen approach created an opening",
      description: typeof fact.metadata?.detail === "string"
        ? fact.metadata.detail
        : "A delayed consequence from your earlier case judgment entered the career record.",
      decisionId: fact.sourceDecisionId,
    });
  }

  for (const message of state.inbox ?? []) {
    if (!message.id.startsWith(`prospect-follow-up:${caseId}:`)) continue;
    entries.push({
      id: `follow-up:${message.id}`,
      kind: "milestone",
      week: message.week,
      season: message.season,
      title: message.title,
      description: message.body,
    });
  }

  for (const report of Object.values(state.reports ?? {})) {
    if (report.caseId !== caseId && !caseReportIds.has(report.id)) continue;
    entries.push({
      id: `report:${report.id}`,
      kind: "report",
      week: report.submittedWeek,
      season: report.submittedSeason,
      title: `Report filed · ${reportConviction(report.conviction)}`,
      description: report.summary.trim()
        || `Revision ${report.revision ?? 1} was filed with a craft score of ${report.qualityScore}/100.`,
      reportId: report.id,
      clubId: report.intendedClubId,
    });
  }

  for (const delivery of Object.values(state.reportDeliveries ?? {})) {
    if (delivery.caseId !== caseId && !caseDeliveryIds.has(delivery.id)) continue;
    const destination = clubName(state, delivery.clubId);
    const channel = delivery.channel === "marketplaceSale"
      ? "Marketplace intelligence delivered"
      : "Recommendation presented directly";
    entries.push({
      id: `delivery:${delivery.id}`,
      kind: "delivery",
      week: delivery.deliveredWeek,
      season: delivery.deliveredSeason,
      title: channel,
      description: `${destination} received the report${delivery.price ? ` for £${delivery.price.toLocaleString("en-GB")}` : ""}.`,
      reportId: delivery.reportId,
      clubId: delivery.clubId,
    });
  }

  for (const decision of Object.values(state.clubDecisions ?? {})) {
    if (decision.caseId !== caseId && !caseDecisionIds.has(decision.id)) continue;
    const visibleReasons = decision.reasons ?? (decision.reason ? [decision.reason] : []);
    entries.push({
      id: `decision:${decision.id}`,
      kind: "decision",
      week: decision.decidedWeek,
      season: decision.decidedSeason,
      title: `${clubName(state, decision.clubId)} · ${humanize(decision.outcome)}`,
      description: visibleReasons[0]
        ?? "The club recorded its decision on your recommendation.",
      reportId: decision.reportId,
      clubId: decision.clubId,
    });
  }

  const alumni = (state.alumniRecords ?? []).find((record) =>
    record.caseId === caseId
    || record.id === scoutingCase.alumniRecordId
    || (
      record.playerId === scoutingCase.playerId
      && Boolean(record.originatingReportId && caseReportIds.has(record.originatingReportId))
    ),
  );
  if (alumni) {
    entries.push({
      id: `alumni:${alumni.id}:placement`,
      kind: "alumni",
      week: alumni.placedWeek,
      season: alumni.placedSeason,
      title: "Placement became a career",
      description: `${clubName(state, alumni.placedClubId)} added the player to its pathway.`,
      clubId: alumni.placedClubId,
      alumniRecordId: alumni.id,
      reportId: alumni.originatingReportId,
    });
  }

  const movements = (state.playerMovementHistory ?? []).filter((movement) =>
    movement.playerId === scoutingCase.playerId
    && isOnOrAfter(
      movement.season,
      movement.week,
      scoutingCase.openedSeason,
      scoutingCase.openedWeek,
    ),
  );
  const movementDates = new Set(
    movements.map((movement) => `${movement.season}:${movement.week}`),
  );
  for (const movement of movements) {
    entries.push({
      id: `movement:${movement.id}`,
      kind: "movement",
      week: movement.week,
      season: movement.season,
      title: movementTitle(movement),
      description: movementDescription(state, movement),
      clubId: movement.toClubId ?? movement.fromClubId ?? movement.contractClubId,
      movementId: movement.id,
    });
  }

  for (const review of Object.values(state.recommendationReviews ?? {})) {
    if (review.caseId !== caseId && !caseReviewIds.has(review.id)) continue;
    const completed = review.status === "complete";
    entries.push({
      id: `review:${review.id}`,
      kind: "review",
      week: completed ? review.completedWeek ?? review.dueWeek : review.dueWeek,
      season: completed ? review.completedSeason ?? review.dueSeason : review.dueSeason,
      title: `${review.checkpoint === "oneSeason" ? "One-season" : "Two-season"} review ${completed ? "completed" : "scheduled"}`,
      description: completed
        ? buildRecommendationReviewTimelineDescription(review)
        : "Your original judgment remains open until enough career evidence exists.",
      details: completed
        ? buildRecommendationReviewTimelineDetails(review)
        : undefined,
      reportId: review.reportId,
      clubId: review.clubId,
      reviewId: review.id,
    });
  }

  if (alumni) {
    for (const [index, milestone] of (alumni.milestones ?? []).entries()) {
      if (milestone.type === "transfer" && movementDates.has(`${milestone.season}:${milestone.week}`)) {
        continue;
      }
      entries.push({
        id: `milestone:${alumni.id}:${milestone.type}:${milestone.season}:${milestone.week}:${index}`,
        kind: "milestone",
        week: milestone.week,
        season: milestone.season,
        title: humanize(milestone.type),
        description: milestone.description,
        alumniRecordId: alumni.id,
      });
    }

    for (const [index, update] of (alumni.careerUpdates ?? []).entries()) {
      const movementBacked = ["loanMove", "transfer", "released"].includes(update.type)
        && movementDates.has(`${update.season}:${update.week}`);
      if (movementBacked) continue;
      entries.push({
        id: `alumni-update:${alumni.id}:${update.season}:${update.week}:${index}`,
        kind: "alumni",
        week: update.week,
        season: update.season,
        title: alumniUpdateTitle(update.type),
        description: update.description,
        alumniRecordId: alumni.id,
      });
    }
  }

  entries.sort((left, right) =>
    left.season - right.season
    || left.week - right.week
    || ENTRY_ORDER[left.kind] - ENTRY_ORDER[right.kind]
    || left.id.localeCompare(right.id),
  );

  return {
    caseId: scoutingCase.id,
    playerId: scoutingCase.playerId,
    status: scoutingCase.status,
    openedWeek: scoutingCase.openedWeek,
    openedSeason: scoutingCase.openedSeason,
    entries,
  };
}
