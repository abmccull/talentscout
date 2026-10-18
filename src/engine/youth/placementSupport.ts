import type { GameDate, GameState, InboxMessage, Observation, PlacementSupportCondition } from "../core/types";
import { addGameWeeksWithSeasonLength, createGameCalendarIndex, gameWeeksBetweenWithCalendar } from "../core/gameDate";

export interface PlacementSupportCommitment {
  condition: Exclude<PlacementSupportCondition, "none">;
  playerId: string;
  acceptedAt: GameDate;
  /** Same-week evidence already present at acceptance cannot discharge the new promise. */
  preAcceptanceObservationIds?: string[];
  dueAt: GameDate;
  status: "open" | "fulfilled" | "missed";
  evidenceId?: string;
  resolvedAt?: GameDate;
  reminderSent?: boolean;
}

export const PLACEMENT_SUPPORT_LABELS: Record<Exclude<PlacementSupportCondition, "none">, string> = {
  educationPlan: "education check-in",
  playingPathway: "playing-pathway review",
  familySupport: "family and settlement check-in",
};

function matchesSupportContext(condition: PlacementSupportCondition, observation: Observation): boolean {
  return condition === "playingPathway"
    ? observation.context === "followUpSession"
    : condition !== "none" && observation.context === "parentCoachMeeting";
}

/** A relevant, evidenced safeguard helps; unsupported demands make the proposal less credible. */
export function scorePlacementSupport(
  condition: PlacementSupportCondition,
  observations: readonly Observation[],
  relevantRisk: number,
): number {
  if (condition === "none") return 0;
  if (!observations.some(observation => matchesSupportContext(condition, observation))) return -2;
  return relevantRisk >= 35 ? 3 : 0;
}

/** Only the new accepted-placement path calls this, so old saves acquire no retrospective debt. */
export function createPlacementSupportCommitment(
  condition: PlacementSupportCondition,
  playerId: string,
  acceptedAt: GameDate,
  seasonLength: number,
  existingObservations?: readonly Observation[],
): PlacementSupportCommitment | undefined {
  if (condition === "none") return undefined;
  return {
    condition, playerId, acceptedAt,
    ...(existingObservations === undefined ? {} : {
      preAcceptanceObservationIds: [...new Set(existingObservations.filter(observation =>
        observation.playerId === playerId
        && observation.season === acceptedAt.season && observation.week === acceptedAt.week
        && matchesSupportContext(condition, observation),
      ).map(observation => observation.id))],
    }),
    dueAt: addGameWeeksWithSeasonLength(acceptedAt, 6, seasonLength),
    status: "open",
  };
}

export function describePlacementSupport(commitment: PlacementSupportCommitment): string {
  const action = commitment.condition === "playingPathway" ? "Follow-up Session" : "Parent/Coach Meeting";
  return `Your ${PLACEMENT_SUPPORT_LABELS[commitment.condition]} commitment: complete a ${action} for this player after placement, by the end of season ${commitment.dueAt.season}, week ${commitment.dueAt.week}. This uses a planner slot and the activity's normal fatigue. An executed review earns +1 reputation and +3 relationship with club contacts; missing it costs 2 reputation and 8 relationship. A review checks the support plan; it does not guarantee education, settlement, or playing minutes.`;
}

/** Executed, attributed evidence settles each promise once; merely scheduling never counts. */
export function applyPlacementSupportCommitments(state: GameState): GameState {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const openPlacements = Object.values(state.placementReports ?? {}).filter(placement =>
    placement.clubResponse === "accepted" && placement.scoutId === state.scout.id
    && placement.supportCommitment?.status === "open",
  );
  if (openPlacements.length === 0) return state;
  const calendar = createGameCalendarIndex(state.fixtures);
  const observationsByPlayer = new Map<string, Observation[]>();
  for (const observation of Object.values(state.observations)) {
    if (observation.scoutId !== state.scout.id || !(observation.activityInstanceId || observation.sourceSessionId)
      || (observation.context !== "parentCoachMeeting" && observation.context !== "followUpSession")) continue;
    const records = observationsByPlayer.get(observation.playerId) ?? [];
    records.push(observation);
    observationsByPlayer.set(observation.playerId, records);
  }
  let next = state;
  for (const placement of openPlacements) {
    const commitment = placement.supportCommitment!;
    const evidence = (observationsByPlayer.get(commitment.playerId) ?? []).find(observation => {
      if (!matchesSupportContext(commitment.condition, observation)) return false;
      const observedAt = { season: observation.season, week: observation.week };
      const weeksAfterAcceptance = gameWeeksBetweenWithCalendar(calendar, commitment.acceptedAt, observedAt);
      // A new same-week ID proves chronology only when acceptance saved the prior set.
      // Older promises without that set retain the conservative later-week rule.
      const happenedAfterAcceptance = weeksAfterAcceptance > 0 || (weeksAfterAcceptance === 0
        && commitment.preAcceptanceObservationIds !== undefined
        && !commitment.preAcceptanceObservationIds.includes(observation.id));
      return happenedAfterAcceptance
        && gameWeeksBetweenWithCalendar(calendar, observedAt, commitment.dueAt) >= 0
        && gameWeeksBetweenWithCalendar(calendar, observedAt, now) >= 0;
    });
    const weeksRemaining = gameWeeksBetweenWithCalendar(calendar, now, commitment.dueAt);
    const status = evidence ? "fulfilled" : weeksRemaining < 0 ? "missed" : "open";
    const remind = status === "open" && weeksRemaining <= 3 && !commitment.reminderSent;
    if (status === "open" && !remind) continue;
    const player = state.players[commitment.playerId];
    const playerName = player ? `${player.firstName} ${player.lastName}` : "Your placed player";
    const club = state.clubs[placement.targetClubId];
    const label = PLACEMENT_SUPPORT_LABELS[commitment.condition];
    const updated: PlacementSupportCommitment = {
      ...commitment, status,
      ...(remind ? { reminderSent: true } : { resolvedAt: now, evidenceId: evidence?.id }),
    };
    const reputationDelta = status === "fulfilled" ? 1 : status === "missed" ? -2 : 0;
    const relationshipDelta = status === "fulfilled" ? 3 : status === "missed" ? -8 : 0;
    const message: InboxMessage = {
      id: `placement-support:${placement.id}:${remind ? "reminder" : status}`,
      week: now.week, season: now.season, type: status === "missed" ? "warning" : "feedback",
      title: `${playerName}: ${label} ${remind ? "due soon" : status === "fulfilled" ? "recorded" : "missed"}`,
      body: remind ? describePlacementSupport(commitment)
        : status === "fulfilled"
          ? `Your ${commitment.condition === "playingPathway" ? "follow-up session" : "parent/coach meeting"} completed in season ${evidence!.season}, week ${evidence!.week} is recorded. You followed through on the promised ${label}. +1 reputation; +3 relationship with contacts at ${club?.name ?? "the academy"}. This records a support review, not a guarantee of the player's future outcomes.`
          : `No completed ${commitment.condition === "playingPathway" ? "follow-up session" : "parent/coach meeting"} for ${playerName} was recorded by season ${commitment.dueAt.season}, week ${commitment.dueAt.week}. The promised ${label} was missed: -2 reputation and -8 relationship with contacts at ${club?.name ?? "the academy"}. You can still follow the player's progress, but a late review does not erase the missed commitment.`,
      read: false, actionRequired: false, relatedId: commitment.playerId, relatedEntityType: "player",
    };
    next = {
      ...next,
      placementReports: { ...next.placementReports, [placement.id]: { ...placement, supportCommitment: updated } },
      scout: { ...next.scout, reputation: Math.max(0, Math.min(100, next.scout.reputation + reputationDelta)) },
      contacts: relationshipDelta === 0 ? next.contacts : Object.fromEntries(Object.entries(next.contacts).map(([id, contact]) =>
        [id, [club?.id, club?.name, club?.shortName].filter(Boolean).includes(contact.organization)
          ? { ...contact, relationship: Math.max(0, Math.min(100, contact.relationship + relationshipDelta)) } : contact]
      )),
      inbox: [...next.inbox, message],
    };
  }
  return next;
}
