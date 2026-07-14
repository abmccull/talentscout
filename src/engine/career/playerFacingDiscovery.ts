import type {
  DiscoveryRecord,
  GameState,
  ScoutReport,
} from "@/engine/core/types";

export interface PlayerFacingDiscoverySummary {
  playerId: string;
  playerName: string;
  nationality: string;
  discoveredWeek: number;
  discoveredSeason: number;
  trackedSeasons: number;
  careerOutcome?: DiscoveryRecord["careerOutcome"];
  projectedCAStars?: number;
  projectedPotentialRange?: [number, number];
  validatedAccuracy?: number;
  reportQuality?: number;
  isHighUpsideProjection: boolean;
}

const OUTCOME_RANK: Record<NonNullable<DiscoveryRecord["careerOutcome"]>, number> = {
  starPlayer: 4,
  squadPlayer: 3,
  retired: 2,
  released: 1,
};

function compareReportDate(left: ScoutReport, right: ScoutReport): number {
  return left.submittedSeason - right.submittedSeason
    || left.submittedWeek - right.submittedWeek
    || (left.revision ?? 0) - (right.revision ?? 0)
    || left.id.localeCompare(right.id);
}

function firstReportsByPlayer(reports: Record<string, ScoutReport>): Map<string, ScoutReport> {
  const result = new Map<string, ScoutReport>();
  for (const report of Object.values(reports)) {
    const existing = result.get(report.playerId);
    if (!existing || compareReportDate(report, existing) < 0) {
      result.set(report.playerId, report);
    }
  }
  return result;
}

/**
 * Converts engine discovery records into a player-safe career view. It never
 * reads initial CA, initial PA, the generated wonderkid flag, or live CA/PA.
 */
export function getPlayerFacingDiscoverySummaries(
  state: Pick<
    GameState,
    "discoveryRecords" | "reports" | "players" | "retiredPlayers" | "unsignedYouth"
  >,
): PlayerFacingDiscoverySummary[] {
  const firstReports = firstReportsByPlayer(state.reports ?? {});
  return (state.discoveryRecords ?? [])
    .map((record) => {
      const youthPlayer = Object.values(state.unsignedYouth ?? {}).find(
        (youth) => youth.id === record.playerId || youth.player.id === record.playerId,
      )?.player;
      const player = state.players[record.playerId]
        ?? state.retiredPlayers?.[record.playerId]
        ?? youthPlayer;
      const report = firstReports.get(record.playerId);
      const projectedPotentialRange = report?.perceivedPARange;
      const projectedMidpoint = projectedPotentialRange
        ? (projectedPotentialRange[0] + projectedPotentialRange[1]) / 2
        : 0;
      return {
        playerId: record.playerId,
        playerName: player
          ? `${player.firstName} ${player.lastName}`
          : "Unknown Player",
        nationality: player?.nationality ?? "Unknown",
        discoveredWeek: record.discoveredWeek,
        discoveredSeason: record.discoveredSeason,
        trackedSeasons: record.careerSnapshots.length,
        careerOutcome: record.careerOutcome,
        projectedCAStars: report?.perceivedCAStars,
        projectedPotentialRange,
        validatedAccuracy: report?.postTransferRating,
        reportQuality: report?.qualityScore,
        isHighUpsideProjection: projectedMidpoint >= 4,
      } satisfies PlayerFacingDiscoverySummary;
    })
    .sort((left, right) => {
      const outcomeDelta = (right.careerOutcome ? OUTCOME_RANK[right.careerOutcome] : 0)
        - (left.careerOutcome ? OUTCOME_RANK[left.careerOutcome] : 0);
      if (outcomeDelta !== 0) return outcomeDelta;
      if (right.trackedSeasons !== left.trackedSeasons) {
        return right.trackedSeasons - left.trackedSeasons;
      }
      const accuracyDelta = (right.validatedAccuracy ?? -1) - (left.validatedAccuracy ?? -1);
      if (accuracyDelta !== 0) return accuracyDelta;
      const rightProjection = right.projectedPotentialRange
        ? (right.projectedPotentialRange[0] + right.projectedPotentialRange[1]) / 2
        : -1;
      const leftProjection = left.projectedPotentialRange
        ? (left.projectedPotentialRange[0] + left.projectedPotentialRange[1]) / 2
        : -1;
      return rightProjection - leftProjection
        || right.discoveredSeason - left.discoveredSeason
        || right.discoveredWeek - left.discoveredWeek;
    });
}

export function discoveryOutcomeLabel(
  outcome: DiscoveryRecord["careerOutcome"],
): string {
  switch (outcome) {
    case "starPlayer": return "Established star";
    case "squadPlayer": return "First-team player";
    case "released": return "Released";
    case "retired": return "Retired";
    default: return "Career still unfolding";
  }
}
