"use client";

import type {
  GameState,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
  TransferRecord,
} from "@/engine/core/types";
import { resolvePlayerEntity } from "@/lib/playerResolution";

export type ReportWorkspaceAction =
  | { kind: "openReport"; label: string; reportId: string }
  | { kind: "openPlayer"; label: string; playerId: string }
  | { kind: "listReport"; label: string; reportId: string }
  | { kind: "openCareer"; label: string }
  | { kind: "openStaffQueue"; label: string };

export interface ReportWorkspaceLaneItem {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  meta: string;
  tone: "emerald" | "amber" | "sky";
  action?: ReportWorkspaceAction;
}

export interface ReportWorkspaceLane {
  id: "actionRequired" | "awaitingResponse" | "livingConsequences";
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  items: ReportWorkspaceLaneItem[];
}

export interface FeaturedReportArtifact {
  reportId: string;
  playerId: string;
  playerName: string;
  artifactLabel: string;
  summary: string;
  audience: string;
  need: string;
  risk: string;
  confidence: string;
  followUp: string;
  targetClub: string;
  conviction: string;
  recommendedAction: string;
  evidenceCount: number;
  unknownCount: number;
  qualityScore: number;
  primaryAction: ReportWorkspaceAction;
}

export interface ReportWorkspaceViewModel {
  featuredArtifact: FeaturedReportArtifact | null;
  lanes: ReportWorkspaceLane[];
  comparisonSummary: string;
  comparisonCtaLabel: string;
  comparisonReady: boolean;
  archiveSummary: string;
}

interface BuildReportWorkspaceViewModelInput {
  gameState: GameState;
  reports: ScoutReport[];
  casesNeedingDelivery: ScoutingCase[];
  awaitingDecisionDeliveries: ReportDelivery[];
  placedCases: ScoutingCase[];
  listingByReportId: Record<string, ReportListing>;
  comparisonReportIds: string[];
  pendingListingReportId: string | null;
  staffWorkQueueCount: number;
  journalEntryCount: number;
  activeListingsCount: number;
  pendingBidsCount: number;
}

function formatLabel(value: string | undefined): string {
  if (!value) return "Not specified";
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatGameDate(season: number | undefined, week: number | undefined): string {
  if (season == null || week == null) return "No deadline recorded";
  return `S${season} W${week}`;
}

function countEvidence(report: ScoutReport): number {
  const ids = new Set<string>();
  for (const id of report.evidenceAssessment?.evidenceIds ?? []) {
    if (id.trim().length > 0) ids.add(id.trim());
  }
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    for (const id of verdict?.evidenceIds ?? []) {
      if (id.trim().length > 0) ids.add(id.trim());
    }
  }
  for (const risk of report.riskAssessments ?? []) {
    for (const id of risk.evidenceIds ?? []) {
      if (id.trim().length > 0) ids.add(id.trim());
    }
  }
  if (ids.size > 0) return ids.size;
  return report.attributeAssessments.length;
}

function countUnknowns(report: ScoutReport): number {
  const unknowns = new Set<string>();
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    const statement = verdict?.acknowledgedUncertainty?.trim();
    if (statement) unknowns.add(statement.toLowerCase());
  }
  if (unknowns.size > 0) return unknowns.size;
  return (report.riskAssessments ?? []).filter((risk) => risk.status !== "observed").length;
}

function primaryRiskLabel(report: ScoutReport): string {
  const observedRisk = report.riskAssessments?.find((risk) => risk.status === "observed");
  if (observedRisk) return observedRisk.label;
  return report.riskAssessments?.[0]?.label ?? report.riskFactors?.[0] ?? "No primary risk recorded";
}

function confidenceSummary(report: ScoutReport): string {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const verdict of Object.values(report.categoryVerdicts ?? {})) {
    if (!verdict?.confidence) continue;
    counts[verdict.confidence]++;
  }
  const total = counts.high + counts.medium + counts.low;
  if (total === 0) {
    if (report.evidenceAssessment?.confidence) {
      return formatLabel(report.evidenceAssessment.confidence);
    }
    return report.attributeAssessments.length > 0 ? "Legacy estimate grid" : "Confidence not structured";
  }
  const parts = [
    counts.high > 0 ? `${counts.high} high` : null,
    counts.medium > 0 ? `${counts.medium} medium` : null,
    counts.low > 0 ? `${counts.low} low` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" / ");
}

function getPlayerName(gameState: GameState, playerId: string): string {
  const player = resolvePlayerEntity(gameState, playerId)?.player;
  return player ? `${player.firstName} ${player.lastName}` : "Unknown player";
}

function getCaseReport(gameState: GameState, scoutingCase: ScoutingCase): ScoutReport | null {
  const active = scoutingCase.activeReportId ? gameState.reports[scoutingCase.activeReportId] : null;
  if (active) return active;
  const latestId = scoutingCase.reportIds.at(-1);
  return latestId ? gameState.reports[latestId] ?? null : null;
}

function getDeliveryReport(gameState: GameState, delivery: ReportDelivery): ScoutReport | null {
  return delivery.reportId ? gameState.reports[delivery.reportId] ?? null : null;
}

function getTargetClubName(gameState: GameState, report: ScoutReport): string {
  if (report.intendedClubId && gameState.clubs[report.intendedClubId]?.name) {
    return gameState.clubs[report.intendedClubId].name;
  }
  if (report.briefId) {
    const brief = gameState.youthRecruitmentBriefs[report.briefId];
    if (brief && gameState.clubs[brief.clubId]?.name) {
      return gameState.clubs[brief.clubId].name;
    }
  }
  return "No target club recorded";
}

function getFollowUpLabel(
  input: BuildReportWorkspaceViewModelInput,
  report: ScoutReport,
): string {
  if (input.pendingListingReportId === report.id) {
    return "Set the price and exclusivity before this lead goes cold.";
  }

  const activeCase = Object.values(input.gameState.scoutingCases ?? {}).find((scoutingCase) =>
    scoutingCase.reportIds.includes(report.id),
  );
  if (activeCase?.status === "reported" && activeCase.deliveryIds.length === 0) {
    return input.gameState.scout.careerPath === "independent"
      ? "Choose whether to sell the case or place it directly."
      : "Deliver the case to its decision-maker before new evidence makes it stale.";
  }

  const delivery = Object.values(input.gameState.reportDeliveries ?? {}).find((candidate) =>
    candidate.reportId === report.id && candidate.status === "awaitingDecision",
  );
  if (delivery) {
    const decision = delivery.decisionId
      ? input.gameState.clubDecisions[delivery.decisionId]
      : undefined;
    if (decision?.followUpDueWeek != null && decision.followUpDueSeason != null) {
      return `Response due by ${formatGameDate(decision.followUpDueSeason, decision.followUpDueWeek)}.`;
    }
    return "Wait for the club response, then trace the consequence chain.";
  }

  if (report.clubResponse === "signed" || activeCase?.status === "placed") {
    return "Track how the recommendation changes the player's career and your credibility.";
  }

  return "Open the report, check the evidence trail, and decide the next follow-up.";
}

function buildFeaturedArtifact(
  input: BuildReportWorkspaceViewModelInput,
): FeaturedReportArtifact | null {
  const pendingReport = input.pendingListingReportId
    ? input.gameState.reports[input.pendingListingReportId] ?? null
    : null;
  const priorityReport = pendingReport
    ?? (input.casesNeedingDelivery[0] ? getCaseReport(input.gameState, input.casesNeedingDelivery[0]) : null)
    ?? (input.awaitingDecisionDeliveries[0] ? getDeliveryReport(input.gameState, input.awaitingDecisionDeliveries[0]) : null)
    ?? (input.placedCases[0] ? getCaseReport(input.gameState, input.placedCases[0]) : null)
    ?? input.reports[0]
    ?? null;

  if (!priorityReport) return null;

  const playerName = getPlayerName(input.gameState, priorityReport.playerId);
  const isPendingListing = input.pendingListingReportId === priorityReport.id;
  const action = isPendingListing && input.gameState.scout.careerPath === "independent"
    ? { kind: "listReport", label: "Price the report", reportId: priorityReport.id } as const
    : { kind: "openReport", label: "Open full artifact", reportId: priorityReport.id } as const;

  return {
    reportId: priorityReport.id,
    playerId: priorityReport.playerId,
    playerName,
    artifactLabel: priorityReport.evidenceAssessment ? "Professional report artifact" : "Legacy report artifact",
    summary: priorityReport.summary,
    audience: priorityReport.intendedAudience
      ? formatLabel(priorityReport.intendedAudience)
      : "Decision-maker not specified",
    need: priorityReport.recruitmentNeed ?? "No explicit club need was recorded for this case.",
    risk: primaryRiskLabel(priorityReport),
    confidence: confidenceSummary(priorityReport),
    followUp: getFollowUpLabel(input, priorityReport),
    targetClub: getTargetClubName(input.gameState, priorityReport),
    conviction: formatLabel(priorityReport.conviction),
    recommendedAction: priorityReport.recommendedAction
      ? formatLabel(priorityReport.recommendedAction)
      : "No recommended action recorded",
    evidenceCount: countEvidence(priorityReport),
    unknownCount: countUnknowns(priorityReport),
    qualityScore: priorityReport.qualityScore,
    primaryAction: action,
  };
}

function buildActionRequiredItems(input: BuildReportWorkspaceViewModelInput): ReportWorkspaceLaneItem[] {
  const items: ReportWorkspaceLaneItem[] = [];

  if (input.pendingListingReportId) {
    const report = input.gameState.reports[input.pendingListingReportId];
    if (report) {
      items.push({
        id: `pending-listing-${report.id}`,
        eyebrow: "Pricing decision",
        title: getPlayerName(input.gameState, report.playerId),
        body: "A newly filed report still needs a price, an exclusivity stance, and a delivery path.",
        meta: `${formatLabel(report.conviction)} call | ${getTargetClubName(input.gameState, report)}`,
        tone: "emerald",
        action: { kind: "listReport", label: "Set price", reportId: report.id },
      });
    }
  }

  for (const scoutingCase of input.casesNeedingDelivery.slice(0, 2)) {
    const report = getCaseReport(input.gameState, scoutingCase);
    if (!report) continue;
    items.push({
      id: `delivery-${scoutingCase.id}`,
      eyebrow: "Action required",
      title: getPlayerName(input.gameState, scoutingCase.playerId),
      body: report.recruitmentNeed
        ? `The case answers "${report.recruitmentNeed}" but still has not reached a club.`
        : "The evidence is filed, but the recommendation still has not reached its audience.",
      meta: `${formatGameDate(report.submittedSeason, report.submittedWeek)} | ${formatLabel(report.conviction)}`,
      tone: input.gameState.scout.careerPath === "independent" ? "emerald" : "amber",
      action: { kind: "openPlayer", label: "Open dossier", playerId: scoutingCase.playerId },
    });
  }

  if (input.staffWorkQueueCount > 0) {
    items.push({
      id: "staff-review-queue",
      eyebrow: "Agency accountability",
      title: `${input.staffWorkQueueCount} staff lead${input.staffWorkQueueCount === 1 ? "" : "s"} waiting`,
      body: "Agency scale now creates sign-off pressure. Waiting degrades quality on client-linked work.",
      meta: "One sign-off slot per week",
      tone: "sky",
      action: { kind: "openStaffQueue", label: "Review queue" },
    });
  }

  return items.slice(0, 3);
}

function buildAwaitingResponseItems(input: BuildReportWorkspaceViewModelInput): ReportWorkspaceLaneItem[] {
  return input.awaitingDecisionDeliveries.slice(0, 3).flatMap((delivery) => {
    const report = getDeliveryReport(input.gameState, delivery);
    if (!report) return [];
    const clubName = input.gameState.clubs[delivery.clubId]?.name ?? getTargetClubName(input.gameState, report);
    const decision = delivery.decisionId ? input.gameState.clubDecisions[delivery.decisionId] : undefined;
    const deadline = decision
      ? formatGameDate(decision.followUpDueSeason, decision.followUpDueWeek)
      : report.decisionDeadlineSeason != null && report.decisionDeadlineWeek != null
        ? formatGameDate(report.decisionDeadlineSeason, report.decisionDeadlineWeek)
        : "Awaiting club timing";
    return [{
      id: `awaiting-${delivery.id}`,
      eyebrow: "Awaiting response",
      title: `${getPlayerName(input.gameState, report.playerId)} -> ${clubName}`,
      body: decision?.outcome === "followUpRequested"
        ? `${clubName} wants more evidence before committing.`
        : `The recommendation is live with ${clubName}; the next meaningful change is the club's answer.`,
      meta: `Delivered ${formatGameDate(delivery.deliveredSeason, delivery.deliveredWeek)} | ${deadline}`,
      tone: "amber",
      action: { kind: "openReport", label: "Review delivery", reportId: report.id },
    }];
  });
}

function buildLivingConsequenceItems(input: BuildReportWorkspaceViewModelInput): ReportWorkspaceLaneItem[] {
  const items: ReportWorkspaceLaneItem[] = [];
  const usedReportIds = new Set<string>();

  for (const scoutingCase of input.placedCases.slice(0, 2)) {
    const report = getCaseReport(input.gameState, scoutingCase);
    if (!report) continue;
    usedReportIds.add(report.id);
    items.push({
      id: `placed-${scoutingCase.id}`,
      eyebrow: "Living consequence",
      title: getPlayerName(input.gameState, scoutingCase.playerId),
      body: report.clubResponse === "signed"
        ? "A club acted on the recommendation. The long-tail consequence now lives with the player and your reputation."
        : "The case has moved beyond delivery. Track whether the decision becomes a remembered success, warning, or missed call.",
      meta: `${getTargetClubName(input.gameState, report)} | ${formatLabel(report.conviction)}`,
      tone: "sky",
      action: { kind: "openCareer", label: "Open Career" },
    });
  }

  const transferRecords = (input.gameState.transferRecords ?? []).filter((record) => usedReportIds.has(record.reportId) === false);
  for (const record of transferRecords.slice(0, Math.max(0, 3 - items.length))) {
    const report = input.gameState.reports[record.reportId];
    if (!report) continue;
    const playerName = getPlayerName(input.gameState, report.playerId);
    const fromClub = record.fromClubId ? input.gameState.clubs[record.fromClubId]?.shortName ?? "Free agent" : "Free agent";
    const toClub = record.toClubId ? input.gameState.clubs[record.toClubId]?.shortName ?? "Out of football" : "Out of football";
    items.push({
      id: `movement-${record.id}`,
      eyebrow: "Outcome trace",
      title: playerName,
      body: `${fromClub} to ${toClub}${record.fee ? ` for ${record.fee.toLocaleString("en-GB")}` : ""}.`,
      meta: `${formatGameDate(record.transferSeason, record.transferWeek)} | ${record.outcome ?? "movement recorded"}`,
      tone: "emerald",
      action: { kind: "openCareer", label: "Open timeline" },
    });
  }

  return items.slice(0, 3);
}

export function buildReportWorkspaceViewModel(
  input: BuildReportWorkspaceViewModelInput,
): ReportWorkspaceViewModel {
  const featuredArtifact = buildFeaturedArtifact(input);
  const selectedCount = input.comparisonReportIds.length;

  return {
    featuredArtifact,
    comparisonSummary: selectedCount === 0
      ? "Select up to three reports below to compare the case you made, not just the player."
      : selectedCount === 1
        ? "One report is selected. Add one more to compare judgment, audience, and accountability side by side."
        : `${selectedCount} reports are ready for side-by-side comparison.`,
    comparisonCtaLabel: selectedCount < 2 ? `Compare (${selectedCount})` : `Compare (${selectedCount})`,
    comparisonReady: selectedCount >= 2,
    archiveSummary: `${input.reports.length} filed report${input.reports.length === 1 ? "" : "s"} | ${input.journalEntryCount} reflection entr${input.journalEntryCount === 1 ? "y" : "ies"} | ${input.activeListingsCount} active listing${input.activeListingsCount === 1 ? "" : "s"} | ${input.pendingBidsCount} pending bid${input.pendingBidsCount === 1 ? "" : "s"}`,
    lanes: [
      {
        id: "actionRequired",
        title: "Action required",
        description: "Cases that still need your hand on the wheel before they become real leverage.",
        emptyTitle: "No urgent action queue",
        emptyBody: "Every filed report that can move right now already has a next owner or a live response path.",
        items: buildActionRequiredItems(input),
      },
      {
        id: "awaitingResponse",
        title: "Awaiting response",
        description: "Recommendations that have left your desk and are now waiting on a club answer.",
        emptyTitle: "No live club waits",
        emptyBody: "Nothing is currently sitting in a club inbox without a resolved answer.",
        items: buildAwaitingResponseItems(input),
      },
      {
        id: "livingConsequences",
        title: "Living consequences",
        description: "Recommendations that already changed a career path and now belong in your longer record.",
        emptyTitle: "No long-tail consequence chains yet",
        emptyBody: "The first living consequence appears once a club acts and the player's career starts moving around that call.",
        items: buildLivingConsequenceItems(input),
      },
    ],
  };
}
