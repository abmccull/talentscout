/**
 * World initialization — ties static data, player generation, and fixture scheduling.
 *
 * Multi-country support: pass a `countries` array (e.g. ["england", "spain"]) to
 * populate leagues, clubs, players, fixtures, and territories from multiple nations.
 * Defaults to ["england"] for full backward compatibility.
 */

import type { RNG } from "@/engine/rng";
import type { League, Club, Player, Fixture, Territory } from "@/engine/core/types";
import { loadCountries } from "@/data/index";
import type { ClubData, LeagueData, CountryData } from "@/data/types";
import { generateSquad } from "@/engine/players/generation";
import { generateSeasonFixtures } from "@/engine/world/fixtures";

export interface WorldState {
  leagues: Record<string, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Record<string, Fixture>;
  territories: Record<string, Territory>;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function buildLeague(data: LeagueData, countryName: string, clubIds: string[]): League {
  return {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    country: countryName,
    tier: data.tier,
    clubIds,
    season: 1,
  };
}

function buildClub(data: ClubData, leagueId: string, playerIds: string[]): Club {
  return {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    leagueId,
    reputation: data.reputation,
    scoutingPhilosophy: data.scoutingPhilosophy,
    youthAcademyRating: data.youthAcademyRating,
    budget: data.budget,
    managerId: `mgr_${data.id}`,
    playerIds,
  };
}

/**
 * Build a Territory for a country, aggregating all league IDs that belong to it.
 */
function buildTerritory(countryData: CountryData, leagueIds: string[]): Territory {
  return {
    id: `territory_${countryData.key}`,
    name: countryData.name,
    country: countryData.name,
    leagueIds,
    maxScouts: 3,
    assignedScoutIds: [],
  };
}

// ---------------------------------------------------------------------------
// Per-country world builder
// ---------------------------------------------------------------------------

function buildCountryWorld(
  rng: RNG,
  countryData: CountryData,
  leagues: Record<string, League>,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
): string[] {
  // Returns the list of league IDs built for this country (used for territory creation).
  const countryLeagueIds: string[] = [];

  const tierKeys = Object.keys(countryData.nationalitiesByTier).map(Number);
  const maxTier = tierKeys.length > 0 ? Math.max(...tierKeys) : 4;

  for (const leagueData of countryData.leagues) {
    const clubIds: string[] = [];

    const nationalityWeights =
      countryData.nationalitiesByTier[leagueData.tier] ??
      countryData.nationalitiesByTier[maxTier];

    for (const clubData of leagueData.clubs) {
      const squad = generateSquad(
        rng,
        clubData,
        leagueData.tier,
        nationalityWeights,
        countryData.name,
        countryData.nativeNamePool,
        countryData.foreignNamePools,
      );
      const playerIds: string[] = [];

      for (const player of squad) {
        players[player.id] = player;
        playerIds.push(player.id);
      }

      const club = buildClub(clubData, leagueData.id, playerIds);
      clubs[club.id] = club;
      clubIds.push(club.id);
    }

    const league = buildLeague(leagueData, countryData.name, clubIds);
    leagues[league.id] = league;
    countryLeagueIds.push(league.id);
  }

  return countryLeagueIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the game world from one or more countries.
 *
 * @param rng       - Seeded RNG instance (mutated in place).
 * @param countries - Country keys to load, e.g. ["england", "spain"].
 *                    Defaults to ["england"] for backward compatibility.
 * @returns         - Fully-populated WorldState ready to merge into GameState.
 */
export async function initializeWorld(
  rng: RNG,
  countries: string[] = ["england"],
): Promise<WorldState> {
  const leagues: Record<string, League> = {};
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const fixtures: Record<string, Fixture> = {};
  const territories: Record<string, Territory> = {};

  // Load all country data in parallel, then process sequentially so that the
  // RNG advances in a deterministic order regardless of I/O timing.
  const countryDataList = await loadCountries(countries);

  for (const countryData of countryDataList) {
    const countryLeagueIds = buildCountryWorld(rng, countryData, leagues, clubs, players);
    territories[`territory_${countryData.key}`] = buildTerritory(countryData, countryLeagueIds);
  }

  // Generate fixtures for every league across all countries.
  for (const league of Object.values(leagues)) {
    const seasonFixtures = generateSeasonFixtures(rng, league, 1);
    for (const fixture of seasonFixtures) {
      fixtures[fixture.id] = fixture;
    }
  }

  return { leagues, clubs, players, fixtures, territories };
}
