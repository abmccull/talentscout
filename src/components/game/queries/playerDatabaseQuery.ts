import type {
  Club,
  League,
  Observation,
  Player,
  Position,
  ScoutReport,
  Specialization,
} from "@/engine/core/types";
import {
  getPerceivedAbility,
  type PerceivedAbility,
} from "@/engine/scout/perceivedAbility";

export type PlayerDatabaseSortKey =
  | "name"
  | "age"
  | "position"
  | "nationality"
  | "club"
  | "league"
  | "value"
  | "ca"
  | "observations"
  | "reports"
  | "lastSeen";

export type PlayerDatabaseSortDir = "asc" | "desc";

export interface PlayerRow {
  player: Player;
  clubId: string;
  clubName: string;
  leagueName: string;
  observationCount: number;
  reportCount: number;
  lastSeenWeek: number | null;
  perceived: PerceivedAbility | null;
}

export interface PlayerDatabaseIndexes {
  scoutedPlayerIds: Set<string>;
  observationCountByPlayer: Map<string, number>;
  reportCountByPlayer: Map<string, number>;
  lastSeenWeekByPlayer: Map<string, number>;
  observationsByPlayer: Map<string, Observation[]>;
}

export interface PlayerDatabaseFilters {
  search: string;
  positionFilter: Position | "";
  minAge?: number;
  maxAge?: number;
  nationalityFilter: string;
  leagueFilter: string;
  minValue?: number;
  maxValue?: number;
  watchlistOnly: boolean;
  watchlist: ReadonlySet<string>;
}

export function buildPlayerDatabaseIndexes(
  observationsById: Record<string, Observation> | undefined,
  reportsById: Record<string, ScoutReport> | undefined,
): PlayerDatabaseIndexes {
  const scoutedPlayerIds = new Set<string>();
  const observationCountByPlayer = new Map<string, number>();
  const reportCountByPlayer = new Map<string, number>();
  const lastSeenWeekByPlayer = new Map<string, number>();
  const observationsByPlayer = new Map<string, Observation[]>();

  for (const observation of Object.values(observationsById ?? {})) {
    scoutedPlayerIds.add(observation.playerId);
    observationCountByPlayer.set(
      observation.playerId,
      (observationCountByPlayer.get(observation.playerId) ?? 0) + 1,
    );

    const previousLastSeen = lastSeenWeekByPlayer.get(observation.playerId);
    if (previousLastSeen == null || observation.week > previousLastSeen) {
      lastSeenWeekByPlayer.set(observation.playerId, observation.week);
    }

    const existing = observationsByPlayer.get(observation.playerId);
    if (existing) {
      existing.push(observation);
    } else {
      observationsByPlayer.set(observation.playerId, [observation]);
    }
  }

  for (const report of Object.values(reportsById ?? {})) {
    reportCountByPlayer.set(
      report.playerId,
      (reportCountByPlayer.get(report.playerId) ?? 0) + 1,
    );
  }

  return {
    scoutedPlayerIds,
    observationCountByPlayer,
    reportCountByPlayer,
    lastSeenWeekByPlayer,
    observationsByPlayer,
  };
}

export function filterPlayersForSpecialization(
  players: Player[],
  specialization: Specialization | undefined,
  scoutedOnly: boolean,
): Player[] {
  if (scoutedOnly || specialization !== "youth") {
    return players;
  }

  return players.filter((player) => player.age <= 21);
}

export function buildPlayerDatabaseRows(
  players: Player[],
  clubsById: Record<string, Club> | undefined,
  leaguesById: Record<string, League> | undefined,
  indexes: PlayerDatabaseIndexes,
): PlayerRow[] {
  return players.map((player) => {
    const club = clubsById?.[player.clubId];
    const league = club ? leaguesById?.[club.leagueId] : undefined;
    const playerObservations = indexes.observationsByPlayer.get(player.id) ?? [];

    return {
      player,
      clubId: club?.id ?? "",
      clubName: club?.shortName ?? "?",
      leagueName: league?.shortName ?? "?",
      observationCount: indexes.observationCountByPlayer.get(player.id) ?? 0,
      reportCount: indexes.reportCountByPlayer.get(player.id) ?? 0,
      lastSeenWeek: indexes.lastSeenWeekByPlayer.get(player.id) ?? null,
      perceived: getPerceivedAbility(playerObservations, player.id),
    };
  });
}

export function filterAndSortPlayerRows(
  rows: PlayerRow[],
  filters: PlayerDatabaseFilters,
  sortKey: PlayerDatabaseSortKey,
  sortDir: PlayerDatabaseSortDir,
): PlayerRow[] {
  const searchQuery = filters.search.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    if (filters.watchlistOnly && !filters.watchlist.has(row.player.id)) {
      return false;
    }

    if (searchQuery) {
      const searchableName =
        `${row.player.firstName} ${row.player.lastName}`.toLowerCase();
      if (
        !searchableName.includes(searchQuery)
        && !row.clubName.toLowerCase().includes(searchQuery)
        && !row.leagueName.toLowerCase().includes(searchQuery)
      ) {
        return false;
      }
    }

    if (filters.positionFilter && row.player.position !== filters.positionFilter) {
      return false;
    }

    if (filters.minAge != null && row.player.age < filters.minAge) {
      return false;
    }

    if (filters.maxAge != null && row.player.age > filters.maxAge) {
      return false;
    }

    if (
      filters.nationalityFilter
      && row.player.nationality !== filters.nationalityFilter
    ) {
      return false;
    }

    if (filters.leagueFilter && row.leagueName !== filters.leagueFilter) {
      return false;
    }

    if (filters.minValue != null && row.player.marketValue < filters.minValue) {
      return false;
    }

    if (filters.maxValue != null && row.player.marketValue > filters.maxValue) {
      return false;
    }

    return true;
  });

  return [...filtered].sort((left, right) => {
    let comparison = 0;

    switch (sortKey) {
      case "name":
        comparison = `${left.player.lastName}${left.player.firstName}`.localeCompare(
          `${right.player.lastName}${right.player.firstName}`,
        );
        break;
      case "age":
        comparison = left.player.age - right.player.age;
        break;
      case "position":
        comparison = left.player.position.localeCompare(right.player.position);
        break;
      case "nationality":
        comparison = left.player.nationality.localeCompare(right.player.nationality);
        break;
      case "club":
        comparison = left.clubName.localeCompare(right.clubName);
        break;
      case "league":
        comparison = left.leagueName.localeCompare(right.leagueName);
        break;
      case "value":
        comparison = left.player.marketValue - right.player.marketValue;
        break;
      case "ca":
        comparison =
          averagePerceivedAbility(left.perceived) - averagePerceivedAbility(right.perceived);
        break;
      case "observations":
        comparison = left.observationCount - right.observationCount;
        break;
      case "reports":
        comparison = left.reportCount - right.reportCount;
        break;
      case "lastSeen":
        comparison = (left.lastSeenWeek ?? -1) - (right.lastSeenWeek ?? -1);
        break;
    }

    return sortDir === "asc" ? comparison : -comparison;
  });
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (normalizedPage - 1) * pageSize;

  return {
    items: rows.slice(startIndex, startIndex + pageSize),
    page: normalizedPage,
    totalPages,
  };
}

function averagePerceivedAbility(perceived: PerceivedAbility | null): number {
  if (!perceived) {
    return 0;
  }

  return (perceived.caLow + perceived.caHigh) / 2;
}
