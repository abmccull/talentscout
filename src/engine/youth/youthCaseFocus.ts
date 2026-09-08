import type { GameState, InboxMessage } from "@/engine/core/types";

/** Player ids that belong to the scout's working cases. */
export function collectYouthCasePlayerIds(
  state: Pick<
    GameState,
    | "scout"
    | "openingCase"
    | "unsignedYouth"
    | "observations"
    | "reports"
    | "placementReports"
    | "alumniRecords"
    | "discoveryRecords"
  >,
): Set<string> {
  const ids = new Set<string>();
  if (state.openingCase?.playerId) ids.add(state.openingCase.playerId);

  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (youth.discoveredBy.includes(state.scout.id)) {
      ids.add(youth.player.id);
      ids.add(youth.id);
    }
  }
  for (const observation of Object.values(state.observations ?? {})) {
    if (observation.scoutId === state.scout.id) ids.add(observation.playerId);
  }
  for (const report of Object.values(state.reports ?? {})) {
    if (report.scoutId === state.scout.id) ids.add(report.playerId);
  }
  for (const placement of Object.values(state.placementReports ?? {})) {
    if (placement.scoutId === state.scout.id) {
      const youth = state.unsignedYouth[placement.unsignedYouthId];
      if (youth) ids.add(youth.player.id);
    }
  }
  for (const record of state.alumniRecords ?? []) {
    ids.add(record.playerId);
  }
  for (const discovery of state.discoveryRecords ?? []) {
    ids.add(discovery.playerId);
  }
  return ids;
}

const CAREER_LOOP_INBOX_PREFIXES = [
  "review-s",
  "development-pressure-review",
  "perf-bonus-s",
  "employment-ended",
  "promotion-blocked",
  "contract-ended",
  "career-era-",
];

export function shouldShowYouthInboxMessage(
  state: Parameters<typeof collectYouthCasePlayerIds>[0] & Pick<GameState, "inbox">,
  message: InboxMessage,
  caseIds = collectYouthCasePlayerIds(state),
): boolean {
  if (message.actionRequired) return true;
  if (message.id.startsWith("opening-choice:") || message.id.startsWith("opening-")) return true;
  if (CAREER_LOOP_INBOX_PREFIXES.some((prefix) => message.id.startsWith(prefix))) return true;
  if (message.relatedId && caseIds.has(message.relatedId)) return true;
  // Only ambient news/gossip is case-filtered. Resolved assignments, financial
  // outcomes, course events and warnings still explain changes to the career
  // after actionRequired has been cleared by the inbox action resolver.
  return message.type !== "news" && message.type !== "gossip";
}

export function collectYouthCaseWatchTargetIds(
  state: Parameters<typeof collectYouthCasePlayerIds>[0],
): Set<string> {
  const ids = collectYouthCasePlayerIds(state);
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (ids.has(youth.player.id)) ids.add(youth.id);
  }
  return ids;
}

export function findYouthCaseWatchDay(
  activities: Array<{ type?: string; targetId?: string } | null | undefined>,
  caseTargetIds?: Iterable<string> | string,
): number {
  const ids = new Set(
    typeof caseTargetIds === "string"
      ? caseTargetIds
        ? [caseTargetIds]
        : []
      : [...(caseTargetIds ?? [])],
  );
  if (ids.size === 0) return 0;
  const watchTypes = new Set(["followUpSession", "schoolMatch", "parentCoachMeeting"]);
  for (let day = 0; day < activities.length; day += 1) {
    const activity = activities[day];
    if (activity?.targetId && ids.has(activity.targetId) && watchTypes.has(activity.type ?? "")) {
      return day;
    }
  }
  return 0;
}
