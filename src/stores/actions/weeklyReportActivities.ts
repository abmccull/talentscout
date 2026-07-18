import type { GameState, InboxMessage, ReportWorkItem } from "@/engine/core/types";
import {
  getFreshReportObservationIds,
  getLatestReportInScope,
} from "@/engine/reports/reportAccountability";

export interface WeeklyReportActivitiesInput {
  state: GameState;
  playerIds: readonly string[];
  qualityModifier: number;
  equipmentQualityBonus: number;
}

/**
 * Turn scheduled desk time into prepared, evidence-linked work.
 *
 * A calendar entry cannot choose a conviction or file a report on the
 * player's behalf. The prepared item is consumed only when the player opens
 * the report writer, makes a structured judgment, and submits it.
 */
export function processWeeklyReportActivities(
  input: WeeklyReportActivitiesInput,
): GameState {
  if (input.playerIds.length === 0) return input.state;

  const reportWorkItems = { ...(input.state.reportWorkItems ?? {}) };
  const messages: InboxMessage[] = [];

  for (const playerId of new Set(input.playerIds)) {
    const player = input.state.players[playerId];
    if (!player) continue;

    const observations = Object.values(input.state.observations).filter(
      (observation) =>
        observation.playerId === playerId
        && observation.scoutId === input.state.scout.id,
    );
    if (observations.length === 0) {
      messages.push({
        id: `report-noobs-${playerId}-s${input.state.currentSeason}w${input.state.currentWeek}`,
        week: input.state.currentWeek,
        season: input.state.currentSeason,
        type: "feedback",
        title: `No evidence to review: ${player.firstName} ${player.lastName}`,
        body: `You set aside desk time for ${player.firstName} ${player.lastName}, but you have not observed them yet. Watch a match, visit training, or review valid footage before preparing a professional judgment.`,
        read: false,
        actionRequired: false,
        relatedId: playerId,
        relatedEntityType: "player",
      });
      continue;
    }

    const previousReport = getLatestReportInScope(
      Object.values(input.state.reports),
      input.state.scout.id,
      playerId,
    );
    const freshObservationIds = getFreshReportObservationIds(observations, previousReport);
    if (freshObservationIds.length === 0) {
      messages.push({
        id: `report-no-new-evidence-${playerId}-s${input.state.currentSeason}w${input.state.currentWeek}`,
        week: input.state.currentWeek,
        season: input.state.currentSeason,
        type: "feedback",
        title: `Gather another look: ${player.firstName} ${player.lastName}`,
        body: `Your filed judgment already includes every available observation on ${player.firstName} ${player.lastName}. A meaningful revision needs fresh evidence from another match, training visit, or review context.`,
        read: false,
        actionRequired: false,
        relatedId: playerId,
        relatedEntityType: "player",
      });
      continue;
    }

    const id = `report-work:${input.state.scout.id}:${playerId}`;
    const existing = reportWorkItems[id];
    const workItem: ReportWorkItem = {
      id,
      playerId,
      scoutId: input.state.scout.id,
      createdWeek: input.state.currentWeek,
      createdSeason: input.state.currentSeason,
      status: "ready",
      sourceActivity: "writeReport",
      preparationQualityPoints: Math.max(
        existing?.preparationQualityPoints ?? 0,
        Math.max(0, Math.min(8, Math.round(input.qualityModifier))),
      ),
      preparationQualityBonus: Math.max(
        existing?.preparationQualityBonus ?? 0,
        Math.max(0, Math.min(0.2, input.equipmentQualityBonus)),
      ),
      freshObservationIds,
    };
    reportWorkItems[id] = workItem;

    messages.push({
      id: `report-work-ready-${playerId}-s${input.state.currentSeason}w${input.state.currentWeek}`,
      week: input.state.currentWeek,
      season: input.state.currentSeason,
      type: "feedback",
      title: `Your notes are ready: ${player.firstName} ${player.lastName}`,
      body: `You organized ${freshObservationIds.length} fresh observation${freshObservationIds.length === 1 ? "" : "s"}. Open the player and make the judgment yourself; no recommendation has been filed yet.`,
      read: false,
      actionRequired: true,
      relatedId: playerId,
      relatedEntityType: "player",
    });
  }

  return {
    ...input.state,
    reportWorkItems,
    inbox: [
      ...input.state.inbox,
      ...messages.filter((message) =>
        !input.state.inbox.some((existing) => existing.id === message.id),
      ),
    ],
  };
}
