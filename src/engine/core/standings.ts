/**
 * League standings computation — extracted as a shared utility to avoid
 * circular dependencies between gameLoop.ts and world/relegation.ts.
 */

import type { Fixture, Club, StandingEntry } from "./types";
import { isFixtureInSeason } from "@/engine/world/fixtures";

export type StandingsByLeague = Record<string, Record<string, StandingEntry>>;

function createStanding(clubId: string): StandingEntry {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function tallyFixture(
  standings: Record<string, StandingEntry>,
  fixture: Fixture,
): void {
  if (fixture.homeGoals === undefined || fixture.awayGoals === undefined) return;

  const home = standings[fixture.homeClubId];
  const away = standings[fixture.awayClubId];
  if (!home || !away) return;

  const hg = fixture.homeGoals;
  const ag = fixture.awayGoals;

  home.played += 1;
  away.played += 1;
  home.goalsFor += hg;
  home.goalsAgainst += ag;
  away.goalsFor += ag;
  away.goalsAgainst += hg;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;

  if (hg > ag) {
    home.won += 1;
    home.points += 3;
    away.lost += 1;
  } else if (hg < ag) {
    away.won += 1;
    away.points += 3;
    home.lost += 1;
  } else {
    home.drawn += 1;
    home.points += 1;
    away.drawn += 1;
    away.points += 1;
  }
}

/**
 * Build every league table in one pass. Multi-league consumers such as the
 * transfer market and season rollover should use this index instead of
 * rescanning the complete club and fixture collections for each league.
 */
export function buildStandingsByLeague(
  fixtures: Record<string, Fixture>,
  clubs: Record<string, Club>,
  season?: number,
): StandingsByLeague {
  const standingsByLeague: StandingsByLeague = {};

  for (const club of Object.values(clubs)) {
    const standings = standingsByLeague[club.leagueId] ??= {};
    standings[club.id] = createStanding(club.id);
  }

  for (const fixture of Object.values(fixtures)) {
    if (!fixture.played) continue;
    if (season !== undefined && !isFixtureInSeason(fixture, season)) continue;
    const standings = standingsByLeague[fixture.leagueId];
    if (!standings) continue;
    tallyFixture(standings, fixture);
  }

  return standingsByLeague;
}

/**
 * Build a standings map from all played fixtures in a league.
 * Returns a record keyed by clubId.
 */
export function buildStandings(
  leagueId: string,
  fixtures: Record<string, Fixture>,
  clubs: Record<string, Club>,
  season?: number,
): Record<string, StandingEntry> {
  const standings: Record<string, StandingEntry> = {};

  // Initialise an entry for every club in the league
  for (const club of Object.values(clubs)) {
    if (club.leagueId === leagueId) {
      standings[club.id] = createStanding(club.id);
    }
  }

  // Tally results from played fixtures in this league
  for (const fixture of Object.values(fixtures)) {
    if (fixture.leagueId !== leagueId || !fixture.played) continue;
    if (season !== undefined && !isFixtureInSeason(fixture, season)) continue;
    tallyFixture(standings, fixture);
  }

  return standings;
}
