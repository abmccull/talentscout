import type {
  ClubDecision,
  ClubDecisionOutcome,
  GameState,
  MarketplaceBid,
  PlacementReport,
  ProfessionalCaseContext,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import {
  addGameWeeksWithSeasonLength,
  isGameDateAtOrAfter,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function laterDate(
  left: { week: number; season: number },
  right: { week: number; season: number },
): { week: number; season: number } {
  if (right.season > left.season) return right;
  if (right.season === left.season && right.week > left.week) return right;
  return left;
}

export function nextGameWeek(
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): { week: number; season: number } {
  return addGameWeeksWithSeasonLength({ week, season }, 1, seasonLength);
}

export function isGameDateDue(
  currentWeek: number,
  currentSeason: number,
  dueWeek: number,
  dueSeason: number,
): boolean {
  return isGameDateAtOrAfter(
    { week: currentWeek, season: currentSeason },
    { week: dueWeek, season: dueSeason },
  );
}

export function getScoutingCaseId(scoutId: string, playerId: string, briefId?: string): string {
  return briefId
    ? `case_${scoutId}_${playerId}_${briefId}`
    : `case_${scoutId}_${playerId}`;
}

function normalizeCase(record: ScoutingCase): ScoutingCase {
  return {
    ...record,
    status: record.status ?? "open",
    reportIds: record.reportIds ?? [],
    listingIds: record.listingIds ?? [],
    deliveryIds: record.deliveryIds ?? [],
    decisionIds: record.decisionIds ?? [],
    placementReportIds: record.placementReportIds ?? [],
    hypothesisIds: record.hypothesisIds ?? [],
    reviewIds: record.reviewIds ?? [],
    professionalContext: record.professionalContext
      ? {
          ...record.professionalContext,
          stakeholderRefs: record.professionalContext.stakeholderRefs ?? [],
          judgmentDecisionIds: record.professionalContext.judgmentDecisionIds ?? [],
        }
      : undefined,
  };
}

function createCase(
  id: string,
  scoutId: string,
  playerId: string,
  week: number,
  season: number,
  legacyUnlinked = false,
): ScoutingCase {
  return {
    id,
    scoutId,
    playerId,
    openedWeek: week,
    openedSeason: season,
    lastUpdatedWeek: week,
    lastUpdatedSeason: season,
    status: "open",
    reportIds: [],
    listingIds: [],
    deliveryIds: [],
    decisionIds: [],
    placementReportIds: [],
    hypothesisIds: [],
    reviewIds: [],
    ...(legacyUnlinked ? { legacyUnlinked: true } : {}),
  };
}

export interface OpenProfessionalScoutingCaseInput {
  scoutingCases: Record<string, ScoutingCase>;
  scoutId: string;
  playerId: string;
  week: number;
  season: number;
  context: ProfessionalCaseContext;
  briefId?: string;
}

/**
 * Open or enrich a case before a report exists. This lets discovery dilemmas,
 * evidence plans and stakeholder choices become part of the same causal case
 * that later owns the report, delivery and outcome.
 */
export function openProfessionalScoutingCase(
  input: OpenProfessionalScoutingCaseInput,
): { scoutingCases: Record<string, ScoutingCase>; scoutingCase: ScoutingCase } {
  const id = getScoutingCaseId(input.scoutId, input.playerId, input.briefId);
  const base = normalizeCase(
    input.scoutingCases[id]
      ?? createCase(id, input.scoutId, input.playerId, input.week, input.season),
  );
  const touched = laterDate(
    { week: base.lastUpdatedWeek, season: base.lastUpdatedSeason },
    { week: input.week, season: input.season },
  );
  const priorContext = base.professionalContext;
  const scoutingCase: ScoutingCase = {
    ...base,
    briefId: input.briefId ?? base.briefId,
    professionalContext: {
      ...input.context,
      stakeholderRefs: [
        ...new Set([
          ...(priorContext?.stakeholderRefs ?? []),
          ...input.context.stakeholderRefs,
        ]),
      ],
      judgmentDecisionIds: [
        ...new Set([
          ...(priorContext?.judgmentDecisionIds ?? []),
          ...input.context.judgmentDecisionIds,
        ]),
      ],
    },
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...input.scoutingCases, [id]: scoutingCase },
    scoutingCase,
  };
}

/** Link an authored report to the stable scout/player case, idempotently. */
export function ensureScoutingCaseForReport(
  scoutingCases: Record<string, ScoutingCase>,
  report: ScoutReport,
): {
  scoutingCases: Record<string, ScoutingCase>;
  scoutingCase: ScoutingCase;
  report: ScoutReport;
} {
  const id = report.caseId ?? getScoutingCaseId(report.scoutId, report.playerId, report.briefId);
  const base = normalizeCase(
    scoutingCases[id]
      ?? createCase(id, report.scoutId, report.playerId, report.submittedWeek, report.submittedSeason),
  );
  const touched = laterDate(
    { week: base.lastUpdatedWeek, season: base.lastUpdatedSeason },
    { week: report.submittedWeek, season: report.submittedSeason },
  );
  const reportHypothesisIds = Object.values(report.categoryVerdicts ?? {})
    .flatMap((verdict) => verdict?.hypothesisIds ?? []);
  const scoutingCase: ScoutingCase = {
    ...base,
    legacyUnlinked: false,
    status: base.status === "placed" ? "placed" : "reported",
    briefId: report.briefId ?? base.briefId,
    activeReportId: report.id,
    hypothesisIds: [...new Set([...(base.hypothesisIds ?? []), ...reportHypothesisIds])],
    reportIds: appendUnique(base.reportIds, report.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...scoutingCases, [id]: scoutingCase },
    scoutingCase,
    report: report.caseId === id ? report : { ...report, caseId: id },
  };
}

export function attachListingToCase(
  scoutingCases: Record<string, ScoutingCase>,
  caseId: string,
  listingId: string,
  week: number,
  season: number,
): Record<string, ScoutingCase> {
  const existing = scoutingCases[caseId];
  if (!existing) return scoutingCases;
  const touched = laterDate(
    { week: existing.lastUpdatedWeek, season: existing.lastUpdatedSeason },
    { week, season },
  );
  return {
    ...scoutingCases,
    [caseId]: {
      ...normalizeCase(existing),
      listingIds: appendUnique(existing.listingIds ?? [], listingId),
      lastUpdatedWeek: touched.week,
      lastUpdatedSeason: touched.season,
    },
  };
}

interface MarketplaceDeliveryInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  listing: ReportListing;
  bid: MarketplaceBid;
  week: number;
  season: number;
}

/** Record an intel sale. This function has no player/world input and cannot move a player. */
export function recordMarketplaceDelivery(input: MarketplaceDeliveryInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  delivery: ReportDelivery;
} {
  const linked = ensureScoutingCaseForReport(input.scoutingCases, input.report);
  const deliveryId = `delivery_marketplace_${input.listing.id}_${input.bid.id}`;
  const existing = input.reportDeliveries[deliveryId];
  const delivery: ReportDelivery = existing ?? {
    id: deliveryId,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    clubId: input.bid.clubId,
    channel: "marketplaceSale",
    status: "delivered",
    deliveredWeek: input.week,
    deliveredSeason: input.season,
    listingId: input.listing.id,
    bidId: input.bid.id,
    price: input.bid.amount,
  };
  const currentCase = linked.scoutingCases[linked.scoutingCase.id];
  const touched = laterDate(
    { week: currentCase.lastUpdatedWeek, season: currentCase.lastUpdatedSeason },
    { week: input.week, season: input.season },
  );
  const updatedCase: ScoutingCase = {
    ...currentCase,
    status: currentCase.status === "placed" ? "placed" : "delivered",
    listingIds: appendUnique(currentCase.listingIds, input.listing.id),
    deliveryIds: appendUnique(currentCase.deliveryIds, delivery.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...linked.scoutingCases, [updatedCase.id]: updatedCase },
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: delivery },
    report: linked.report,
    delivery,
  };
}

interface DirectPlacementDeliveryInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  placementReport: PlacementReport;
  seasonLength?: number;
}

export function recordDirectPlacementDelivery(input: DirectPlacementDeliveryInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  report: ScoutReport;
  placementReport: PlacementReport;
  delivery: ReportDelivery;
} {
  const linked = ensureScoutingCaseForReport(input.scoutingCases, input.report);
  const deliveryId = input.placementReport.deliveryId
    ?? `delivery_placement_${input.placementReport.id}`;
  const due = input.placementReport.responseDueWeek && input.placementReport.responseDueSeason
    ? {
        week: input.placementReport.responseDueWeek,
        season: input.placementReport.responseDueSeason,
      }
    : nextGameWeek(
        input.placementReport.week,
        input.placementReport.season,
        input.seasonLength,
      );
  const placementReport: PlacementReport = {
    ...input.placementReport,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    deliveryId,
    responseDueWeek: due.week,
    responseDueSeason: due.season,
  };
  const delivery: ReportDelivery = input.reportDeliveries[deliveryId] ?? {
    id: deliveryId,
    caseId: linked.scoutingCase.id,
    reportId: linked.report.id,
    clubId: placementReport.targetClubId,
    channel: "directPlacement",
    status: "awaitingDecision",
    deliveredWeek: placementReport.week,
    deliveredSeason: placementReport.season,
    placementReportId: placementReport.id,
  };
  const currentCase = linked.scoutingCases[linked.scoutingCase.id];
  const touched = laterDate(
    { week: currentCase.lastUpdatedWeek, season: currentCase.lastUpdatedSeason },
    { week: placementReport.week, season: placementReport.season },
  );
  const updatedCase: ScoutingCase = {
    ...currentCase,
    status: currentCase.status === "placed" ? "placed" : "delivered",
    placementReportIds: appendUnique(currentCase.placementReportIds, placementReport.id),
    deliveryIds: appendUnique(currentCase.deliveryIds, delivery.id),
    lastUpdatedWeek: touched.week,
    lastUpdatedSeason: touched.season,
  };
  return {
    scoutingCases: { ...linked.scoutingCases, [updatedCase.id]: updatedCase },
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: delivery },
    report: linked.report,
    placementReport,
    delivery,
  };
}

interface ResolveDecisionInput {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions: Record<string, ClubDecision>;
  deliveryId: string;
  outcome: ClubDecisionOutcome;
  week: number;
  season: number;
  reason?: string;
  reasons?: string[];
  scoreBreakdown?: ClubDecision["scoreBreakdown"];
  requestedEvidenceCategory?: ClubDecision["requestedEvidenceCategory"];
  followUpDueWeek?: number;
  followUpDueSeason?: number;
}

export function resolveClubDecision(input: ResolveDecisionInput): {
  scoutingCases: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions: Record<string, ClubDecision>;
  decision?: ClubDecision;
} {
  const delivery = input.reportDeliveries[input.deliveryId];
  if (!delivery) return input;
  const decisionId = delivery.decisionId ?? `decision_${delivery.id}`;
  const existingDecision = input.clubDecisions[decisionId];
  if (existingDecision) {
    return { ...input, decision: existingDecision };
  }
  const decision: ClubDecision = {
    id: decisionId,
    caseId: delivery.caseId,
    deliveryId: delivery.id,
    reportId: delivery.reportId,
    clubId: delivery.clubId,
    outcome: input.outcome,
    decidedWeek: input.week,
    decidedSeason: input.season,
    placementReportId: delivery.placementReportId,
    reason: input.reason,
    reasons: input.reasons ?? (input.reason ? [input.reason] : []),
    scoreBreakdown: input.scoreBreakdown,
    requestedEvidenceCategory: input.requestedEvidenceCategory,
    followUpDueWeek: input.followUpDueWeek,
    followUpDueSeason: input.followUpDueSeason,
  };
  const updatedDelivery: ReportDelivery = {
    ...delivery,
    status: "resolved",
    decisionId,
    resolvedWeek: input.week,
    resolvedSeason: input.season,
  };
  const currentCase = input.scoutingCases[delivery.caseId];
  const updatedCases = currentCase
    ? {
        ...input.scoutingCases,
        [currentCase.id]: {
          ...normalizeCase(currentCase),
          status: input.outcome === "accepted"
            ? "placed" as const
            : input.outcome === "followUpRequested" || input.outcome === "trial"
              ? "reported" as const
              : "closed" as const,
          decisionIds: appendUnique(currentCase.decisionIds ?? [], decisionId),
          lastUpdatedWeek: input.week,
          lastUpdatedSeason: input.season,
        },
      }
    : input.scoutingCases;
  return {
    scoutingCases: updatedCases,
    reportDeliveries: { ...input.reportDeliveries, [delivery.id]: updatedDelivery },
    clubDecisions: { ...input.clubDecisions, [decision.id]: decision },
    decision,
  };
}

function latestReportForPlayer(
  reports: Record<string, ScoutReport>,
  playerId: string,
  scoutId?: string,
): ScoutReport | undefined {
  return Object.values(reports)
    .filter((report) => report.playerId === playerId && (!scoutId || report.scoutId === scoutId))
    .sort((left, right) =>
      right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || right.id.localeCompare(left.id)
    )[0];
}

/**
 * Backfill the causal spine for pre-case saves. Legacy placement records remain
 * explicit when no authored report exists; new placement creation never uses
 * that escape hatch.
 */
export function migrateScoutingCases(state: GameState): void {
  let scoutingCases = { ...(state.scoutingCases ?? {}) };
  let reportDeliveries = { ...(state.reportDeliveries ?? {}) };
  let clubDecisions = { ...(state.clubDecisions ?? {}) };
  const reports = { ...(state.reports ?? {}) };

  for (const original of Object.values(reports)) {
    const linked = ensureScoutingCaseForReport(scoutingCases, original);
    scoutingCases = linked.scoutingCases;
    reports[original.id] = linked.report;
  }

  if (state.finances) {
    state.finances = {
      ...state.finances,
      reportListings: state.finances.reportListings.map((original) => {
        const report = reports[original.reportId];
        if (!report?.caseId) return original;
        let listing: ReportListing = { ...original, caseId: report.caseId };
        scoutingCases = attachListingToCase(
          scoutingCases,
          report.caseId,
          listing.id,
          listing.listedWeek,
          listing.listedSeason,
        );
        for (const bid of listing.bids.filter((candidate) => candidate.status === "accepted")) {
          const recorded = recordMarketplaceDelivery({
            scoutingCases,
            reportDeliveries,
            report,
            listing,
            bid,
            week: bid.placedWeek,
            season: bid.placedSeason,
          });
          scoutingCases = recorded.scoutingCases;
          reportDeliveries = recorded.reportDeliveries;
          listing = {
            ...listing,
            deliveryIds: appendUnique(listing.deliveryIds ?? [], recorded.delivery.id),
          };
        }
        return listing;
      }),
    };
  }

  const placementReports = { ...(state.placementReports ?? {}) };
  for (const original of Object.values(placementReports)) {
    const youth = state.unsignedYouth?.[original.unsignedYouthId];
    const playerId = youth?.player.id;
    const source = original.reportId
      ? reports[original.reportId]
      : playerId
        ? latestReportForPlayer(reports, playerId, original.scoutId)
        : undefined;

    if (source) {
      const recorded = recordDirectPlacementDelivery({
        scoutingCases,
        reportDeliveries,
        report: source,
        placementReport: original,
      });
      scoutingCases = recorded.scoutingCases;
      reportDeliveries = recorded.reportDeliveries;
      reports[source.id] = recorded.report;
      placementReports[original.id] = recorded.placementReport;
    } else if (playerId) {
      const caseId = original.caseId ?? getScoutingCaseId(original.scoutId, playerId);
      const base = scoutingCases[caseId]
        ?? createCase(caseId, original.scoutId, playerId, original.week, original.season, true);
      const deliveryId = original.deliveryId ?? `delivery_placement_${original.id}`;
      const due = nextGameWeek(original.week, original.season);
      const placement = {
        ...original,
        caseId,
        deliveryId,
        responseDueWeek: original.responseDueWeek ?? due.week,
        responseDueSeason: original.responseDueSeason ?? due.season,
      };
      const delivery: ReportDelivery = reportDeliveries[deliveryId] ?? {
        id: deliveryId,
        caseId,
        clubId: original.targetClubId,
        channel: "directPlacement",
        status: original.clubResponse === "pending" ? "awaitingDecision" : "resolved",
        deliveredWeek: original.week,
        deliveredSeason: original.season,
        placementReportId: original.id,
      };
      scoutingCases[caseId] = {
        ...normalizeCase(base),
        status: original.clubResponse === "accepted" ? "placed" : "delivered",
        placementReportIds: appendUnique(base.placementReportIds ?? [], original.id),
        deliveryIds: appendUnique(base.deliveryIds ?? [], deliveryId),
      };
      reportDeliveries[deliveryId] = delivery;
      placementReports[original.id] = placement;
    }

    const placement = placementReports[original.id];
    if (placement?.deliveryId && placement.clubResponse && placement.clubResponse !== "pending") {
      const outcome: ClubDecisionOutcome = placement.clubResponse === "accepted"
        ? "accepted"
        : placement.clubResponse === "trial"
          ? "trial"
          : "rejected";
      const resolved = resolveClubDecision({
        scoutingCases,
        reportDeliveries,
        clubDecisions,
        deliveryId: placement.deliveryId,
        outcome,
        week: placement.week,
        season: placement.season,
        reason: "Migrated legacy placement outcome",
      });
      scoutingCases = resolved.scoutingCases;
      reportDeliveries = resolved.reportDeliveries;
      clubDecisions = resolved.clubDecisions;
      if (resolved.decision) {
        placementReports[original.id] = { ...placement, decisionId: resolved.decision.id };
      }
    }
  }

  state.alumniRecords = (state.alumniRecords ?? []).map((record) => {
    const placement = Object.values(placementReports).find((candidate) => {
      const youth = state.unsignedYouth?.[candidate.unsignedYouthId];
      return youth?.player.id === record.playerId;
    });
    const caseId = record.caseId ?? placement?.caseId;
    if (!caseId) return record;
    const currentCase = scoutingCases[caseId];
    if (currentCase) {
      scoutingCases[caseId] = {
        ...currentCase,
        status: "placed",
        alumniRecordId: record.id,
      };
    }
    return {
      ...record,
      caseId,
      placementReportId: record.placementReportId ?? placement?.id,
      originatingReportId: record.originatingReportId ?? placement?.reportId,
    };
  });

  state.reports = reports;
  state.placementReports = placementReports;
  state.scoutingCases = scoutingCases;
  state.reportDeliveries = reportDeliveries;
  state.clubDecisions = clubDecisions;
}
