/**
 * World initialization — ties static data, player generation, and fixture scheduling.
 *
 * Multi-country support: pass a `countries` array (e.g. ["england", "spain"]) to
 * populate leagues, clubs, players, fixtures, and territories from multiple nations.
 * Defaults to ["england"] for full backward compatibility.
 *
 * Secondary countries use canonical abstract competition: players receive
 * fixtures and participation without paying the full match-engine cost.
 */

import type { RNG } from "@/engine/rng";
import type { League, Club, Player, Fixture, Territory, SubRegion } from "@/engine/core/types";
import { loadCountries, getSecondaryCountries } from "@/data/index";
import type { ClubData, LeagueData, CountryData } from "@/data/types";
import { generateSquad } from "@/engine/players/generation";
import { generateSeasonFixtures } from "@/engine/world/fixtures";
import { generateTacticalStyle } from "@/engine/firstTeam/tacticalStyle";
import { generateSubRegions } from "@/engine/youth/generation";

export interface WorldState {
  leagues: Record<string, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Record<string, Fixture>;
  territories: Record<string, Territory>;
  subRegions: Record<string, SubRegion>;
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

function buildClub(rng: RNG, data: ClubData, leagueId: string, playerIds: string[]): Club {
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
    tacticalStyle: generateTacticalStyle(rng, data.scoutingPhilosophy, data.reputation),
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
    countryKey: countryData.key,
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

      const club = buildClub(rng, clubData, leagueData.id, playerIds);
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

  // Combine user-selected core countries with all secondary countries.
  // Use a Set to deduplicate in case a country appears in both lists.
  const secondaryKeys = getSecondaryCountries();
  const allCountryKeys = [...new Set([...countries, ...secondaryKeys])];

  // Load all country data in parallel, then process sequentially so that the
  // RNG advances in a deterministic order regardless of I/O timing.
  const countryDataList = await loadCountries(allCountryKeys);

  // Secondary countries use lightweight canonical competition.
  const secondarySet = new Set(secondaryKeys);

  for (const countryData of countryDataList) {
    const countryLeagueIds = buildCountryWorld(rng, countryData, leagues, clubs, players);
    territories[`territory_${countryData.key}`] = buildTerritory(countryData, countryLeagueIds);
  }

  // Generate detailed fixtures for core leagues. Abstract leagues create
  // their canonical weekly rows through abstractCompetition.ts.
  for (const league of Object.values(leagues)) {
    // Derive the country key from the territory mapping
    const territoryEntry = Object.values(territories).find(
      (t) => t.leagueIds.includes(league.id),
    );
    const countryKey = territoryEntry?.countryKey
      ?? territoryEntry?.id.replace("territory_", "")
      ?? "";

    league.coverageTier = secondarySet.has(countryKey) ? "abstract" : "full";
    if (league.coverageTier === "abstract") continue;

    const seasonFixtures = generateSeasonFixtures(rng, league, 1);
    for (const fixture of seasonFixtures) {
      fixtures[fixture.id] = fixture;
    }
  }

  // Generate sub-regions for youth scouting (all countries including secondary).
  const subRegions: Record<string, SubRegion> = {};
  for (const countryData of countryDataList) {
    for (const subRegion of generateSubRegions(countryData.name)) {
      subRegions[subRegion.id] = subRegion;
    }
  }

  return { leagues, clubs, players, fixtures, territories, subRegions };
}
