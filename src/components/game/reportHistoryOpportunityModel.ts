import type {
  ClubDecision,
  Fixture,
  PlayerMovementEvent,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
  TransferRecord,
} from "@/engine/core/types";
import {
  deriveRecruitmentOpportunities,
  type RecruitmentOpportunity,
} from "@/engine/recruitment";

export type OpportunityHistoryStatus =
  | "open"
  | "expired"
  | "rejected"
  | "decisionAccepted"
  | "causalSigning"
  | "predictiveOnlyMovement";

export interface ReportOpportunityHistoryItem {
  id: string;
  reportId: string;
  reportRevision: number;
  targetClubName: string;
  buyerClubName?: string;
  channelLabel: string;
  exclusivityLabel: string;
  deliveredLabel: string;
  deadlineLabel?: string;
  status: OpportunityHistoryStatus;
  statusLabel: string;
  statusDetail: string;
  reportOutcomeLabel: string;
  isSelectedRevision: boolean;
  transferDetail?: string;
}

export interface ReportOpportunityHistorySummary {
  items: ReportOpportunityHistoryItem[];
  liveCount: number;
  convertedCount: number;
  missedCount: number;
}

interface OpportunityHistoryState {
  currentWeek: number;
  currentSeason: number;
  fixtures?: Record<string, Fixture>;
  reports: Record<string, ScoutReport>;
  scoutingCases?: Record<string, ScoutingCase>;
  reportDeliveries: Record<string, ReportDelivery>;
  clubDecisions?: Record<string, ClubDecision>;
  playerMovementHistory?: PlayerMovementEvent[];
  finances?: {
    reportListings?: ReportListing[];
  };
  transferRecords?: TransferRecord[];
  clubs: Record<string, { name: string }>;
}

function formatGameDate(season: number, week: number): string {
  return `S${season} W${week}`;
}

function formatOutcomeLabel(opportunity: RecruitmentOpportunity): string {
  return opportunity.outcome.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatChannelLabel(opportunity: RecruitmentOpportunity): string {
  return opportunity.exclusivity === "direct" ? "Direct recommendation" : "Marketplace delivery";
}

function formatExclusivityLabel(opportunity: RecruitmentOpportunity): string {
  if (opportunity.exclusivity === "exclusive") return "Exclusive";
  if (opportunity.exclusivity === "nonExclusive") return "Shared market";
  return "Direct";
}

function formatTransferDetail(
  record: TransferRecord,
  clubs: OpportunityHistoryState["clubs"],
): string {
  const destination = clubs[record.toClubId]?.name ?? "another club";
  return `Moved to ${destination} on ${formatGameDate(record.transferSeason, record.transferWeek)} without matching the delivered destination.`;
}

function findSelectedCaseId(
  report: ScoutReport,
  scoutingCases: Record<string, ScoutingCase> | undefined,
): string | undefined {
  if (report.caseId) return report.caseId;
  return Object.values(scoutingCases ?? {}).find((entry) => entry.reportIds.includes(report.id))?.id;
}

function findPredictiveOnlyRecord(
  reportId: string,
  records: readonly TransferRecord[],
  opportunity: RecruitmentOpportunity,
): TransferRecord | undefined {
  return records
    .filter((record) =>
      record.reportId === reportId
      && (
        record.toClubId !== opportunity.targetClubId
        || opportunity.outcome !== "signed"
      ),
    )
    .sort((left, right) =>
      right.transferSeason - left.transferSeason
      || right.transferWeek - left.transferWeek
      || left.id.localeCompare(right.id),
    )[0];
}

function classifyOpportunity(input: {
  opportunity: RecruitmentOpportunity;
  clubs: OpportunityHistoryState["clubs"];
  predictiveRecord?: TransferRecord;
}): Pick<
  ReportOpportunityHistoryItem,
  "status" | "statusLabel" | "statusDetail" | "transferDetail"
> {
  const { opportunity, clubs, predictiveRecord } = input;
  const targetClubName = clubs[opportunity.targetClubId]?.name ?? "the delivered club";

  if (opportunity.outcome === "signed") {
    return {
      status: "causalSigning",
      statusLabel: "Causal signing",
      statusDetail: `Credit earned. ${targetClubName} received this revision and signed the player before the window closed.`,
    };
  }

  if (predictiveRecord) {
    return {
      status: "predictiveOnlyMovement",
      statusLabel: "Predictive only",
      statusDetail: `No contractual credit. The player moved, but not through ${targetClubName}'s delivered opportunity.`,
      transferDetail: formatTransferDetail(predictiveRecord, clubs),
    };
  }

  if (opportunity.outcome === "accepted") {
    return {
      status: "decisionAccepted",
      statusLabel: "Accepted",
      statusDetail: `${targetClubName} accepted the recommendation, but the signing has not completed yet.`,
    };
  }

  if (opportunity.outcome === "rejected") {
    return {
      status: "rejected",
      statusLabel: "Rejected",
      statusDetail: `No credit. ${targetClubName} explicitly declined this recommendation.`,
    };
  }

  if (opportunity.outcome === "expired") {
    return {
      status: "expired",
      statusLabel: "Expired",
      statusDetail: `No credit. The deadline passed before ${targetClubName} acted.`,
    };
  }

  if (opportunity.outcome === "trial") {
    return {
      status: "open",
      statusLabel: "Trial requested",
      statusDetail: `${targetClubName} wants a trial stage before making a final call.`,
    };
  }

  if (opportunity.outcome === "followUpRequested") {
    return {
      status: "open",
      statusLabel: "Follow-up requested",
      statusDetail: `${targetClubName} requested more evidence. The opportunity is still live.`,
    };
  }

  return {
    status: "open",
    statusLabel: "Open",
    statusDetail: `The report is with ${targetClubName} and still waiting for a decision.`,
  };
}

export function buildReportOpportunityHistory(
  state: OpportunityHistoryState,
  report: ScoutReport,
): ReportOpportunityHistorySummary {
  const selectedCaseId = findSelectedCaseId(report, state.scoutingCases);
  const opportunities = deriveRecruitmentOpportunities({
    currentWeek: state.currentWeek,
    currentSeason: state.currentSeason,
    fixtures: state.fixtures,
    reports: state.reports,
    scoutingCases: state.scoutingCases,
    reportDeliveries: state.reportDeliveries,
    clubDecisions: state.clubDecisions,
    playerMovementHistory: state.playerMovementHistory,
    finances: {
      reportListings: state.finances?.reportListings ?? [],
    },
  }).filter((opportunity) =>
    selectedCaseId
      ? opportunity.caseId === selectedCaseId
      : opportunity.reportId === report.id,
  );

  const transferRecords = state.transferRecords ?? [];
  const items = opportunities.map((opportunity) => {
    const predictiveRecord = opportunity.outcome === "signed"
      ? undefined
      : findPredictiveOnlyRecord(opportunity.reportId, transferRecords, opportunity);
    const classification = classifyOpportunity({
      opportunity,
      clubs: state.clubs,
      predictiveRecord,
    });

    return {
      id: opportunity.id,
      reportId: opportunity.reportId,
      reportRevision: opportunity.reportRevision,
      targetClubName: state.clubs[opportunity.targetClubId]?.name ?? "Unknown club",
      buyerClubName: opportunity.buyerClubId
        ? state.clubs[opportunity.buyerClubId]?.name ?? "Unknown buyer"
        : undefined,
      channelLabel: formatChannelLabel(opportunity),
      exclusivityLabel: formatExclusivityLabel(opportunity),
      deliveredLabel: formatGameDate(opportunity.deliveredSeason, opportunity.deliveredWeek),
      deadlineLabel: opportunity.deadlineSeason !== undefined && opportunity.deadlineWeek !== undefined
        ? formatGameDate(opportunity.deadlineSeason, opportunity.deadlineWeek)
        : undefined,
      reportOutcomeLabel: formatOutcomeLabel(opportunity),
      isSelectedRevision: opportunity.reportId === report.id,
      ...classification,
    };
  });

  return {
    items,
    liveCount: items.filter((item) => item.status === "open" || item.status === "decisionAccepted").length,
    convertedCount: items.filter((item) => item.status === "causalSigning").length,
    missedCount: items.filter((item) =>
      item.status === "expired"
      || item.status === "rejected"
      || item.status === "predictiveOnlyMovement"
    ).length,
  };
}
