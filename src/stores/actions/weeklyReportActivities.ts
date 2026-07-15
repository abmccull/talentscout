import type { GameState, InboxMessage, ScoutReport } from "@/engine/core/types";
import { recordDiscovery, updateReputation } from "@/engine/career";
import { calculateInfrastructureEffects } from "@/engine/finance";
import {
  calculateReportCraftQualityDetailed,
  finalizeReport,
  generateReportContent,
} from "@/engine/reports/reporting";
import {
  attachReportEvidence,
  getFreshReportObservationIds,
  getLatestReportInScope,
} from "@/engine/reports/reportAccountability";
import { ensureScoutingCaseForReport } from "@/engine/reports/scoutingCases";

export interface WeeklyReportActivitiesInput {
  state: GameState;
  playerIds: readonly string[];
  qualityModifier: number;
  equipmentQualityBonus: number;
}

/** Turn scheduled report work into evidence-linked, revision-safe artifacts. */
export function processWeeklyReportActivities(
  input: WeeklyReportActivitiesInput,
): GameState {
  if (input.playerIds.length === 0) return input.state;
  const reports = { ...input.state.reports };
  let cases = { ...(input.state.scoutingCases ?? {}) };
  let scout = { ...input.state.scout };
  let discoveries = [...(input.state.discoveryRecords ?? [])];
  const messages: InboxMessage[] = [];

  for (const playerId of input.playerIds) {
    const player = input.state.players[playerId];
    if (!player) continue;
    const observations = Object.values(input.state.observations).filter(
      (observation) => observation.playerId === playerId && observation.scoutId === scout.id,
    );
    if (observations.length === 0) {
      messages.push({
        id: `report-noobs-${playerId}-w${input.state.currentWeek}`,
        week: input.state.currentWeek,
        season: input.state.currentSeason,
        type: "feedback",
        title: `Report Failed: ${player.firstName} ${player.lastName}`,
        body: `You attempted to write a report on ${player.firstName} ${player.lastName}, but you have no observations on this player yet. Scout them first through match attendance, training visits, or venue activities before writing a report.`,
        read: false,
        actionRequired: false,
        relatedId: playerId,
        relatedEntityType: "player",
      });
      continue;
    }

    const previousReport = getLatestReportInScope(
      Object.values(reports),
      scout.id,
      playerId,
    );
    if (getFreshReportObservationIds(observations, previousReport).length === 0) {
      messages.push({
        id: `report-no-new-evidence-${playerId}-w${input.state.currentWeek}-s${input.state.currentSeason}`,
        week: input.state.currentWeek,
        season: input.state.currentSeason,
        type: "feedback",
        title: `Report Deferred: ${player.firstName} ${player.lastName}`,
        body: `Your existing case already contains all available observations on ${player.firstName} ${player.lastName}. Gather new evidence before scheduling another revision; repeat paperwork does not create reputation or performance credit.`,
        read: false,
        actionRequired: false,
        relatedId: playerId,
        relatedEntityType: "player",
      });
      continue;
    }

    const draft = generateReportContent(player, observations, scout);
    const finalized = attachReportEvidence(finalizeReport(
      draft,
      "recommend",
      `Scouting report on ${player.firstName} ${player.lastName} based on ${observations.length} observation${observations.length === 1 ? "" : "s"}.`,
      draft.suggestedStrengths ?? [],
      draft.suggestedWeaknesses ?? [],
      scout,
      input.state.currentWeek,
      input.state.currentSeason,
      playerId,
    ), observations, previousReport);
    const infrastructureBonus = calculateInfrastructureEffects(
      input.state.scoutingInfrastructure,
    ).reportQualityBonus;
    const craft = calculateReportCraftQualityDetailed(
      finalized,
      observations,
      scout,
      player,
      infrastructureBonus + input.equipmentQualityBonus,
    );
    const quality = Math.max(0, Math.min(100, craft.score + input.qualityModifier));
    const isNewCase = previousReport === undefined;
    const reputationBefore = scout.reputation;
    if (isNewCase) {
      scout = updateReputation(scout, { type: "reportSubmitted", quality });
      scout = { ...scout, reportsSubmitted: scout.reportsSubmitted + 1 };
    }
    const reputationDelta = +(scout.reputation - reputationBefore).toFixed(1);
    let report: ScoutReport = {
      ...finalized,
      qualityScore: quality,
      reputationDelta,
      craftBreakdown: craft.breakdown,
      validationSnapshot: Object.fromEntries(
        finalized.attributeAssessments.map((assessment) => [
          assessment.attribute,
          player.attributes[assessment.attribute],
        ]),
      ),
    };
    const caseLink = ensureScoutingCaseForReport(cases, report);
    cases = caseLink.scoutingCases;
    report = caseLink.report;
    reports[report.id] = report;

    if (!discoveries.some((discovery) => discovery.playerId === playerId)) {
      discoveries = [
        ...discoveries,
        recordDiscovery(
          player,
          scout,
          input.state.currentWeek,
          input.state.currentSeason,
        ),
      ];
    }
    messages.push({
      id: `auto-report-${playerId}-w${input.state.currentWeek}`,
      week: input.state.currentWeek,
      season: input.state.currentSeason,
      type: "feedback",
      title: `${isNewCase ? "Report Filed" : `Revision ${report.revision ?? 1} Filed`}: ${player.firstName} ${player.lastName}`,
      body: isNewCase
        ? `Your scouting report on ${player.firstName} ${player.lastName} has been filed.\nQuality: ${quality}/100 | Reputation ${reputationDelta >= 0 ? "+" : ""}${reputationDelta}`
        : `New evidence has been preserved as revision ${report.revision ?? 1} of this case.\nQuality: ${quality}/100 | Case revisions improve accountability but do not inflate report volume or submission reputation.`,
      read: false,
      actionRequired: false,
      relatedId: playerId,
      relatedEntityType: "player",
    });
  }

  return {
    ...input.state,
    reports,
    scoutingCases: cases,
    scout,
    discoveryRecords: discoveries,
    inbox: [...input.state.inbox, ...messages],
  };
}
