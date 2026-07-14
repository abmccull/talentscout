import type {
  ClubLeagueMovement,
  PlayerCareerStatus,
  PlayerSeasonPerformance,
  WorldHistoryState,
} from "@/engine/world/worldHistory";

/**
 * Player-facing archive projections.
 *
 * These types intentionally omit current/potential ability, club budgets,
 * internal reputation, report influence, and manager scouting preferences.
 * Comparison UI must be built from observable history rather than simulation
 * truth that the scout has not earned.
 */

export interface PlayerArchiveSeason {
  season: number;
  age: number;
  position: string;
  status: PlayerCareerStatus;
  registeredClubId?: string;
  contractClubId?: string;
  loanParentClubId?: string;
  marketValue: number;
  movementCount: number;
  performance?: PlayerSeasonPerformance;
}

export interface PlayerArchiveTimeline {
  kind: "player";
  id: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  position: string;
  seasons: PlayerArchiveSeason[];
  summary: {
    seasonsRecorded: number;
    firstSeason: number;
    lastSeason: number;
    totalAppearances: number;
    totalGoals: number;
    totalAssists: number;
    weightedAverageRating?: number;
    movementCount: number;
    latestStatus: PlayerCareerStatus;
  };
}

export interface ClubArchiveSeason {
  season: number;
  leagueId: string;
  standing?: {
    position: number;
    tableSize: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  };
  leagueMovement?: ClubLeagueMovement;
  nextLeagueId?: string;
  scoutingPhilosophy: string;
  tacticalIdentity?: string;
  manager?: {
    id: string;
    name: string;
    preferredFormation: string;
  };
}

export interface ClubArchiveTimeline {
  kind: "club";
  id: string;
  seasons: ClubArchiveSeason[];
  summary: {
    seasonsRecorded: number;
    seasonsWithResults: number;
    titles: number;
    bestFinish?: number;
    averageFinish?: number;
    totalPoints: number;
    totalGoalDifference: number;
    promotions: number;
    relegations: number;
    managerCount: number;
  };
}

export interface ManagerArchiveSeason {
  season: number;
  clubId: string;
  leagueId: string;
  preferredFormation: string;
  standing?: {
    position: number;
    tableSize: number;
    played: number;
    points: number;
    goalDifference: number;
  };
  leagueMovement?: ClubLeagueMovement;
}

export interface ManagerArchiveTimeline {
  kind: "manager";
  id: string;
  name: string;
  seasons: ManagerArchiveSeason[];
  summary: {
    seasonsRecorded: number;
    clubsManaged: number;
    titles: number;
    bestFinish?: number;
    totalPoints: number;
    promotions: number;
    relegations: number;
    formations: string[];
  };
}

export interface WorldArchiveComparisonCatalog {
  players: PlayerArchiveTimeline[];
  clubs: ClubArchiveTimeline[];
  managers: ManagerArchiveTimeline[];
}

function roundedTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildPlayerArchiveTimelines(
  history: WorldHistoryState | undefined,
): PlayerArchiveTimeline[] {
  const rows = new Map<string, PlayerArchiveSeason[]>();
  const identities = new Map<string, {
    firstName?: string;
    lastName?: string;
    nationality?: string;
    position: string;
  }>();

  for (const season of [...(history?.seasons ?? [])].sort((a, b) => a.season - b.season)) {
    for (const player of season.players) {
      const playerRows = rows.get(player.playerId) ?? [];
      playerRows.push({
        season: season.season,
        age: player.age,
        position: player.position,
        status: player.status,
        ...(player.registeredClubId ? { registeredClubId: player.registeredClubId } : {}),
        ...(player.contractClubId ? { contractClubId: player.contractClubId } : {}),
        ...(player.loanParentClubId ? { loanParentClubId: player.loanParentClubId } : {}),
        marketValue: player.marketValue,
        movementCount: player.movementEventIds.length,
        ...(player.performance
          ? {
              performance: {
                appearances: player.performance.appearances,
                starts: player.performance.starts,
                ...(player.performance.minutesPlayed !== undefined
                  ? { minutesPlayed: player.performance.minutesPlayed }
                  : {}),
                appearancesWithoutMinutes: player.performance.appearancesWithoutMinutes,
                averageRating: player.performance.averageRating,
                goals: player.performance.goals,
                assists: player.performance.assists,
                cleanSheets: player.performance.cleanSheets,
              },
            }
          : {}),
      });
      rows.set(player.playerId, playerRows);
      identities.set(player.playerId, {
        ...(player.firstName ? { firstName: player.firstName } : {}),
        ...(player.lastName ? { lastName: player.lastName } : {}),
        ...(player.nationality ? { nationality: player.nationality } : {}),
        position: player.position,
      });
    }
  }

  return [...rows.entries()].map(([id, seasons]) => {
    const identity = identities.get(id)!;
    const latest = seasons[seasons.length - 1];
    const performanceRows = seasons.filter((row) => row.performance);
    const totalAppearances = performanceRows.reduce(
      (total, row) => total + (row.performance?.appearances ?? 0),
      0,
    );
    const weightedRating = totalAppearances > 0
      ? performanceRows.reduce(
          (total, row) => total
            + (row.performance?.averageRating ?? 0) * (row.performance?.appearances ?? 0),
          0,
        ) / totalAppearances
      : undefined;
    return {
      kind: "player" as const,
      id,
      ...identity,
      seasons,
      summary: {
        seasonsRecorded: seasons.length,
        firstSeason: seasons[0].season,
        lastSeason: latest.season,
        totalAppearances,
        totalGoals: performanceRows.reduce(
          (total, row) => total + (row.performance?.goals ?? 0),
          0,
        ),
        totalAssists: performanceRows.reduce(
          (total, row) => total + (row.performance?.assists ?? 0),
          0,
        ),
        ...(weightedRating !== undefined
          ? { weightedAverageRating: roundedTenth(weightedRating) }
          : {}),
        movementCount: seasons.reduce((total, row) => total + row.movementCount, 0),
        latestStatus: latest.status,
      },
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildClubArchiveTimelines(
  history: WorldHistoryState | undefined,
): ClubArchiveTimeline[] {
  const rows = new Map<string, ClubArchiveSeason[]>();

  for (const season of [...(history?.seasons ?? [])].sort((a, b) => a.season - b.season)) {
    for (const club of season.clubs) {
      const clubRows = rows.get(club.clubId) ?? [];
      clubRows.push({
        season: season.season,
        leagueId: club.leagueId,
        ...(club.standing ? { standing: { ...club.standing } } : {}),
        ...(club.leagueMovement ? { leagueMovement: club.leagueMovement } : {}),
        ...(club.nextLeagueId ? { nextLeagueId: club.nextLeagueId } : {}),
        scoutingPhilosophy: club.scoutingPhilosophy,
        ...(club.tacticalStyle?.tacticalIdentity
          ? { tacticalIdentity: club.tacticalStyle.tacticalIdentity }
          : {}),
        ...(club.manager
          ? {
              manager: {
                id: club.manager.managerId,
                name: club.manager.managerName,
                preferredFormation: club.manager.preferredFormation,
              },
            }
          : {}),
      });
      rows.set(club.clubId, clubRows);
    }
  }

  return [...rows.entries()].map(([id, seasons]) => {
    const standings = seasons.flatMap((row) => row.standing ? [row.standing] : []);
    const positions = standings.map((standing) => standing.position);
    return {
      kind: "club" as const,
      id,
      seasons,
      summary: {
        seasonsRecorded: seasons.length,
        seasonsWithResults: standings.length,
        titles: standings.filter((standing) => standing.position === 1).length,
        ...(positions.length > 0 ? { bestFinish: Math.min(...positions) } : {}),
        ...(positions.length > 0
          ? { averageFinish: roundedTenth(positions.reduce((a, b) => a + b, 0) / positions.length) }
          : {}),
        totalPoints: standings.reduce((total, standing) => total + standing.points, 0),
        totalGoalDifference: standings.reduce(
          (total, standing) => total + standing.goalDifference,
          0,
        ),
        promotions: seasons.filter((row) => row.leagueMovement === "promoted").length,
        relegations: seasons.filter((row) => row.leagueMovement === "relegated").length,
        managerCount: new Set(
          seasons.flatMap((row) => row.manager ? [row.manager.id] : []),
        ).size,
      },
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildManagerArchiveTimelines(
  history: WorldHistoryState | undefined,
): ManagerArchiveTimeline[] {
  const rows = new Map<string, ManagerArchiveSeason[]>();
  const names = new Map<string, string>();

  for (const season of [...(history?.seasons ?? [])].sort((a, b) => a.season - b.season)) {
    for (const club of season.clubs) {
      if (!club.manager) continue;
      const managerRows = rows.get(club.manager.managerId) ?? [];
      managerRows.push({
        season: season.season,
        clubId: club.clubId,
        leagueId: club.leagueId,
        preferredFormation: club.manager.preferredFormation,
        ...(club.standing
          ? {
              standing: {
                position: club.standing.position,
                tableSize: club.standing.tableSize,
                played: club.standing.played,
                points: club.standing.points,
                goalDifference: club.standing.goalDifference,
              },
            }
          : {}),
        ...(club.leagueMovement ? { leagueMovement: club.leagueMovement } : {}),
      });
      rows.set(club.manager.managerId, managerRows);
      names.set(club.manager.managerId, club.manager.managerName);
    }
  }

  return [...rows.entries()].map(([id, seasons]) => {
    const standings = seasons.flatMap((row) => row.standing ? [row.standing] : []);
    const positions = standings.map((standing) => standing.position);
    return {
      kind: "manager" as const,
      id,
      name: names.get(id) ?? "Historic manager",
      seasons,
      summary: {
        seasonsRecorded: new Set(seasons.map((row) => row.season)).size,
        clubsManaged: new Set(seasons.map((row) => row.clubId)).size,
        titles: standings.filter((standing) => standing.position === 1).length,
        ...(positions.length > 0 ? { bestFinish: Math.min(...positions) } : {}),
        totalPoints: standings.reduce((total, standing) => total + standing.points, 0),
        promotions: seasons.filter((row) => row.leagueMovement === "promoted").length,
        relegations: seasons.filter((row) => row.leagueMovement === "relegated").length,
        formations: [...new Set(seasons.map((row) => row.preferredFormation))],
      },
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function buildWorldArchiveComparisonCatalog(
  history: WorldHistoryState | undefined,
): WorldArchiveComparisonCatalog {
  return {
    players: buildPlayerArchiveTimelines(history),
    clubs: buildClubArchiveTimelines(history),
    managers: buildManagerArchiveTimelines(history),
  };
}
