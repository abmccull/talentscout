import type { GameState } from "@/engine/core/types";
import { resolvePlayerEntity, resolvePlayerDisplayName } from "@/lib/playerResolution";

/** Recorded history only: never infer age, ability, retirement, or later outcomes. */
export function buildPlayerArchive(state: GameState, playerId: string) {
  if (resolvePlayerEntity(state, playerId)) return null;
  const reached = (season: number, week: number) => season < state.currentSeason
    || (season === state.currentSeason && week <= state.currentWeek);
  const reservation = state.playerPortraits?.reservations["person:v1:" + playerId];
  const known = reservation && reached(reservation.firstSeen.season, reservation.firstSeen.week);
  const reports = Object.values(state.reports ?? {}).filter(report =>
    report.playerId === playerId && report.scoutId === state.scout.id
      && reached(report.submittedSeason, report.submittedWeek),
  ).sort((a, b) => b.submittedSeason - a.submittedSeason
    || b.submittedWeek - a.submittedWeek || (b.revision ?? 0) - (a.revision ?? 0)
    || a.id.localeCompare(b.id));
  if (!known && reports.length === 0) return null;
  return {
    playerId,
    name: known ? resolvePlayerDisplayName(state, playerId) : "Unidentified player",
    reports,
    firstSeen: known ? reservation.firstSeen : undefined,
  };
}
