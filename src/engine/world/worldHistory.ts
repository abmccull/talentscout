/**
 * Compact, authoritative multi-season world history.
 *
 * The archive is deliberately derived only from persisted simulation facts:
 * played fixtures, explicit player participation, the movement ledger, and
 * promotion/relegation events which were actually resolved. It never fills
 * gaps with estimates. The rolling season cap keeps long careers save-safe.
 */

import type {
  Club,
  Fixture,
  League,
  ManagerProfile,
  Player,
  PlayerMatchRating,
  PlayerMovementEvent,
  ScoutingPhilosophy,
  StandingEntry,
  TacticalStyle,
} from "@/engine/core/types";
import { buildStandingsByLeague } from "@/engine/core/standings";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import type { RelegationResult } from "@/engine/world/relegation";
import {
  isMaterialHistoricalMovement,
  selectWorldHistoryPlayers,
} from "@/engine/world/saveRetention";
import type {
  PlayerCareerStatus,
  PlayerMovementArchiveSummary,
  PlayerSeasonHistory,
  PlayerSeasonPerformance,
} from "@/engine/world/worldHistoryTypes";
import {
  sortPlayerMovementArchiveSummaries,
  summarizePlayerMovement,
} from "@/engine/world/worldHistoryTypes";
import {
  deriveClubRecruitmentDoctrine,
  type ClubRecruitmentDoctrine,
} from "@/engine/world/recruitmentIdentity";
export type {
  PlayerCareerStatus,
  PlayerMovementArchiveSummary,
  PlayerSeasonHistory,
  PlayerSeasonPerformance,
} from "@/engine/world/worldHistoryTypes";

export const WORLD_HISTORY_VERSION = 1 as const;
export const WORLD_HISTORY_MAX_SEASONS = 30;

export type ClubLeagueMovement = "promoted" | "relegated" | "stayed";

export interface ClubSeasonStanding {
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
}

export interface ManagerSeasonIdentity {
  managerId: string;
  managerName: string;
  scoutingPreference: ManagerProfile["preference"];
  reportInfluence: number;
  preferredFormation: string;
}

export interface ClubSeasonHistory {
  clubId: string;
  leagueId: string;
  /** Present only when this league produced supported played results. */
  standing?: ClubSeasonStanding;
  /** Present only when the authoritative movement resolver ran this season. */
  leagueMovement?: ClubLeagueMovement;
  nextLeagueId?: string;
  reputation: number;
  budget: number;
  scoutingPhilosophy: ScoutingPhilosophy;
  /** Player-safe doctrine snapshot explains why this season's club acted differently. */
  recruitmentDoctrine?: Pick<
    ClubRecruitmentDoctrine,
    | "version"
    | "archetype"
    | "preferredSeniorAgeRange"
    | "evidencePreference"
    | "riskTolerance"
    | "geographicReach"
    | "adaptationTolerance"
    | "pathwayPatience"
    | "tacticalRoleRigidity"
    | "sellingPressure"
    | "managerInfluence"
    | "directorInfluence"
    | "seasonalObjective"
  >;
  tacticalStyle?: TacticalStyle;
  manager?: ManagerSeasonIdentity;
}

export interface LeagueSeasonHistory {
  leagueId: string;
  country: string;
  tier: number;
  clubCount: number;
  playedFixtures: number;
}

export interface WorldSeasonHistory {
  season: number;
  /** Deterministic simulation clock, not wall-clock time. */
  recordedAfterTotalWeeks: number;
  leagues: LeagueSeasonHistory[];
  clubs: ClubSeasonHistory[];
  players: PlayerSeasonHistory[];
  /**
   * Compact projection of every material player movement resolved this season.
   *
   * This is deliberately independent of the bounded public `players` rows, so
   * archive compaction can safely release raw ledger entries even for players
   * that were not selected into a season comparison row.
   *
   * Optional for legacy saves; migration fills it from the raw ledger when
   * that source is still available.
   */
  playerMovementSummaries?: PlayerMovementArchiveSummary[];
}

export interface WorldHistoryState {
  version: typeof WORLD_HISTORY_VERSION;
  /** Highest completed season ever accepted, including trimmed seasons. */
  latestRecordedSeason: number;
  seasons: WorldSeasonHistory[];
}

/** Minimal authoritative snapshot needed to write a season record. */
export interface WorldHistorySnapshot {
  /** Optional on legacy/test snapshots; full GameState callers always provide it. */
  seed?: string;
  totalWeeksPlayed: number;
  leagues: Record<string, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Record<string, Fixture>;
  managerProfiles: Record<string, ManagerProfile>;
  matchRatings: Record<string, Record<string, PlayerMatchRating>>;
  retiredPlayerIds: string[];
  retiredPlayers: Record<string, Player>;
  playerMovementHistory: PlayerMovementEvent[];
  /** Player IDs whose scout-authored causal history must never be sampled out. */
  historicallyRelevantPlayerIds?: Iterable<string>;
}

export function createEmptyWorldHistory(): WorldHistoryState {
  return {
    version: WORLD_HISTORY_VERSION,
    latestRecordedSeason: 0,
    seasons: [],
  };
}

function sortStandings(entries: StandingEntry[]): StandingEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.clubId.localeCompare(b.clubId),
  );
}

function collectPlayerRatings(
  snapshot: WorldHistorySnapshot,
  completedSeason: number,
): Map<string, PlayerMatchRating[]> {
  const ratings = new Map<string, PlayerMatchRating[]>();

  for (const fixtureId of Object.keys(snapshot.matchRatings).sort()) {
    const fixture = snapshot.fixtures[fixtureId];
    if (
      !fixture ||
      !fixture.played ||
      !isFixtureInSeason(fixture, completedSeason)
    ) {
      continue;
    }

    for (const [playerId, rating] of Object.entries(
      snapshot.matchRatings[fixtureId] ?? {},
    ).sort(([a], [b]) => a.localeCompare(b))) {
      // Participation is explicit by contract. A rating without either fact is
      // not enough evidence to invent an appearance.
      if (rating.started !== true && !(rating.minutesPlayed && rating.minutesPlayed > 0)) {
        continue;
      }
      const playerRatings = ratings.get(playerId) ?? [];
      playerRatings.push(rating);
      ratings.set(playerId, playerRatings);
    }
  }

  return ratings;
}

function summarizePerformance(
  ratings: PlayerMatchRating[] | undefined,
): PlayerSeasonPerformance | undefined {
  if (!ratings || ratings.length === 0) return undefined;

  let starts = 0;
  let minutesPlayed = 0;
  let appearancesWithoutMinutes = 0;
  let ratingTotal = 0;
  let goals = 0;
  let assists = 0;
  let cleanSheets = 0;

  for (const rating of ratings) {
    if (rating.started === true) starts += 1;
    if (typeof rating.minutesPlayed === "number") {
      minutesPlayed += rating.minutesPlayed;
    } else {
      appearancesWithoutMinutes += 1;
    }
    ratingTotal += rating.rating;
    goals += rating.stats.goals ?? 0;
    assists += rating.stats.assists ?? 0;
    if (rating.stats.cleanSheet === true) cleanSheets += 1;
  }

  return {
    appearances: ratings.length,
    starts,
    ...(appearancesWithoutMinutes === 0 ? { minutesPlayed } : {}),
    appearancesWithoutMinutes,
    averageRating: Math.round((ratingTotal / ratings.length) * 10) / 10,
    goals,
    assists,
    cleanSheets,
  };
}

function resolveCareerStatus(
  player: Player,
  retiredPlayerIds: Set<string>,
  movements: PlayerMovementEvent[],
): PlayerCareerStatus {
  if (movements.some((movement) => movement.type === "footballExit")) {
    return "exitedFootball";
  }
  if (
    retiredPlayerIds.has(player.id) ||
    movements.some((movement) => movement.type === "retirement")
  ) {
    return "retired";
  }
  if (player.onLoan === true && player.loanParentClubId) return "onLoan";
  if (player.contractClubId || player.clubId) return "contracted";
  return "freeAgent";
}

function cloneTacticalStyle(style: TacticalStyle): TacticalStyle {
  return {
    ...style,
    ...(style.eventDistribution
      ? { eventDistribution: { ...style.eventDistribution } }
      : {}),
    ...(style.strengthAgainst
      ? { strengthAgainst: [...style.strengthAgainst] }
      : {}),
    ...(style.weakAgainst
      ? { weakAgainst: [...style.weakAgainst] }
      : {}),
  };
}

function buildSeasonRecord(
  snapshot: WorldHistorySnapshot,
  completedSeason: number,
  relegationResult?: RelegationResult,
): WorldSeasonHistory {
  const movementIsAuthoritative = relegationResult?.season === completedSeason;
  const clubMovement = new Map(
    movementIsAuthoritative
      ? relegationResult.events.map((event) => [event.clubId, event] as const)
      : [],
  );
  const playerRatings = collectPlayerRatings(snapshot, completedSeason);
  const retiredPlayerIds = new Set(snapshot.retiredPlayerIds);
  const movementsByPlayer = new Map<string, PlayerMovementEvent[]>();

  const materialMovements = snapshot.playerMovementHistory
    .filter(
      (movement) =>
        movement.season === completedSeason
        && isMaterialHistoricalMovement(movement),
    )
    .sort(
      (left, right) =>
        left.playerId.localeCompare(right.playerId)
        || left.week - right.week
        || left.id.localeCompare(right.id),
    );
  for (const movement of materialMovements) {
    const playerMovements = movementsByPlayer.get(movement.playerId) ?? [];
    playerMovements.push(movement);
    movementsByPlayer.set(movement.playerId, playerMovements);
  }
  for (const movements of movementsByPlayer.values()) {
    movements.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  }

  const standingsByLeague = buildStandingsByLeague(
    snapshot.fixtures,
    snapshot.clubs,
    completedSeason,
  );
  const leagueStandings = new Map<string, StandingEntry[]>();
  for (const league of Object.values(snapshot.leagues).sort((a, b) => a.id.localeCompare(b.id))) {
    const entries = sortStandings(
      Object.values(standingsByLeague[league.id] ?? {}),
    );
    leagueStandings.set(league.id, entries);
  }

  const clubs: ClubSeasonHistory[] = Object.values(snapshot.clubs)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((club) => {
      const standings = leagueStandings.get(club.leagueId) ?? [];
      const index = standings.findIndex((entry) => entry.clubId === club.id);
      const entry = index >= 0 ? standings[index] : undefined;
      const movement = clubMovement.get(club.id);
      const manager = snapshot.managerProfiles[club.id];
      const doctrine = deriveClubRecruitmentDoctrine({
        club,
        seed: snapshot.seed ?? `world-history:${club.id}`,
        season: completedSeason,
        manager,
      });

      return {
        clubId: club.id,
        leagueId: club.leagueId,
        ...(entry && entry.played > 0
          ? {
              standing: {
                position: index + 1,
                tableSize: standings.length,
                played: entry.played,
                won: entry.won,
                drawn: entry.drawn,
                lost: entry.lost,
                goalsFor: entry.goalsFor,
                goalsAgainst: entry.goalsAgainst,
                goalDifference: entry.goalDifference,
                points: entry.points,
              },
            }
          : {}),
        ...(movementIsAuthoritative
          ? {
              leagueMovement: movement?.type ?? "stayed",
              nextLeagueId: movement?.toLeagueId ?? club.leagueId,
            }
          : {}),
        reputation: club.reputation,
        budget: club.budget,
        scoutingPhilosophy: club.scoutingPhilosophy,
        recruitmentDoctrine: {
          version: doctrine.version,
          archetype: doctrine.archetype,
          preferredSeniorAgeRange: [...doctrine.preferredSeniorAgeRange],
          evidencePreference: doctrine.evidencePreference,
          riskTolerance: doctrine.riskTolerance,
          geographicReach: doctrine.geographicReach,
          adaptationTolerance: doctrine.adaptationTolerance,
          pathwayPatience: doctrine.pathwayPatience,
          tacticalRoleRigidity: doctrine.tacticalRoleRigidity,
          sellingPressure: doctrine.sellingPressure,
          managerInfluence: doctrine.managerInfluence,
          directorInfluence: doctrine.directorInfluence,
          seasonalObjective: doctrine.seasonalObjective,
        },
        ...(club.tacticalStyle ? { tacticalStyle: cloneTacticalStyle(club.tacticalStyle) } : {}),
        ...(manager && manager.clubId === club.id
          ? {
              manager: {
                managerId: club.managerId,
                managerName: manager.managerName,
                scoutingPreference: manager.preference,
                reportInfluence: manager.reportInfluence,
                preferredFormation: manager.preferredFormation,
              },
            }
          : {}),
      };
    });

  const newlyRetiredPlayers = Object.values(snapshot.retiredPlayers).filter((player) =>
    (movementsByPlayer.get(player.id) ?? []).some(
      (movement) => movement.type === "retirement" || movement.type === "footballExit",
    ),
  );
  const playersById = new Map<string, Player>([
    ...Object.values(snapshot.players).map((player) => [player.id, player] as const),
    ...newlyRetiredPlayers.map((player) => [player.id, player] as const),
  ]);
  const historicallyRelevantPlayerIds = new Set(
    snapshot.historicallyRelevantPlayerIds ?? [],
  );

  const players: PlayerSeasonHistory[] = [...playersById.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((player) => {
      const movements = movementsByPlayer.get(player.id) ?? [];
      return (
        movements.length > 0
        || playerRatings.has(player.id)
        || retiredPlayerIds.has(player.id)
        || historicallyRelevantPlayerIds.has(player.id)
      );
    })
    .map((player) => {
      const movements = movementsByPlayer.get(player.id) ?? [];
      const performance = summarizePerformance(playerRatings.get(player.id));
      return {
        playerId: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        nationality: player.nationality,
        age: player.age,
        position: player.position,
        currentAbility: player.currentAbility,
        marketValue: player.marketValue,
        ...(player.clubId ? { registeredClubId: player.clubId } : {}),
        ...(player.contractClubId ? { contractClubId: player.contractClubId } : {}),
        ...(player.loanParentClubId ? { loanParentClubId: player.loanParentClubId } : {}),
        status: resolveCareerStatus(player, retiredPlayerIds, movements),
        movementEventIds: movements.map((movement) => movement.id),
        ...(performance ? { performance } : {}),
      };
    });
  const retainedPlayers = selectWorldHistoryPlayers(
    players,
    historicallyRelevantPlayerIds,
  );

  const leagues: LeagueSeasonHistory[] = Object.values(snapshot.leagues)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((league) => ({
      leagueId: league.id,
      country: league.country,
      tier: league.tier,
      clubCount: Object.values(snapshot.clubs).filter(
        (club) => club.leagueId === league.id,
      ).length,
      playedFixtures: Object.values(snapshot.fixtures).filter(
        (fixture) =>
          fixture.leagueId === league.id &&
          fixture.played &&
          isFixtureInSeason(fixture, completedSeason),
      ).length,
    }));

  return {
    season: completedSeason,
    recordedAfterTotalWeeks: snapshot.totalWeeksPlayed + 1,
    leagues,
    clubs,
    players: retainedPlayers,
    ...(materialMovements.length > 0
      ? {
          playerMovementSummaries: sortPlayerMovementArchiveSummaries(
            materialMovements.map(summarizePlayerMovement),
          ),
        }
      : {}),
  };
}

/**
 * Record a completed season exactly once.
 *
 * `latestRecordedSeason` remains monotonic even after old detailed records are
 * trimmed, so a replayed/loaded rollover cannot resurrect an expired season.
 */
export function recordCompletedSeasonWorldHistory(
  current: WorldHistoryState | undefined,
  snapshot: WorldHistorySnapshot,
  completedSeason: number,
  relegationResult?: RelegationResult,
): WorldHistoryState {
  const history = current ?? createEmptyWorldHistory();
  if (!Number.isInteger(completedSeason) || completedSeason <= 0) return history;
  if (completedSeason <= history.latestRecordedSeason) return history;

  const nextSeason = buildSeasonRecord(snapshot, completedSeason, relegationResult);
  return {
    version: WORLD_HISTORY_VERSION,
    latestRecordedSeason: completedSeason,
    seasons: [...history.seasons, nextSeason].slice(-WORLD_HISTORY_MAX_SEASONS),
  };
}
