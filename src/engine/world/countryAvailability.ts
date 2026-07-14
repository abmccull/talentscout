/**
 * Authoritative world-country availability.
 *
 * A country is not travelable merely because it exists in the static data
 * catalogue or an old save's `countries` array. It must have a generated,
 * usable surface in the current world. This is deliberately derived from the
 * persisted simulation records so the map, travel, and assignment systems all
 * agree about which destinations are real in this career.
 *
 * Secondary countries are valid talent pools: they have clubs, players and
 * youth regions but intentionally no fixture schedule. They remain travelable
 * for youth work and scouting missions, while senior-friendly assignments are
 * reserved for countries with a generated fixture surface.
 */

import type {
  GameState,
  InternationalAssignment,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";

export type WorldCountryContentTier =
  | "fullWorld"
  | "talentPool"
  | "unavailable";

export interface WorldCountryAvailability {
  /** Canonical key used by travel, map, and assignment state. */
  countryKey: string;
  /**
   * `fullWorld` has a fixture schedule; `talentPool` has real scouting/youth
   * content without fixtures; `unavailable` is a malformed or empty fragment
   * that must not be offered as a destination.
   */
  contentTier: WorldCountryContentTier;
  /** Whether the player can make a meaningful trip to this country. */
  travelEligible: boolean;
  /** Assignment types supportable by the generated content. */
  assignmentTypes: InternationalAssignment["type"][];
  territoryCount: number;
  leagueCount: number;
  clubCount: number;
  playerCount: number;
  fixtureCount: number;
  subRegionCount: number;
  unsignedYouthCount: number;
  tournamentCount: number;
}

/**
 * The minimal persisted world surface needed to establish destination
 * eligibility. A full GameState satisfies this type; the narrower shape keeps
 * this helper easy to use in migration and invariant tests.
 */
export type WorldCountryAvailabilitySource = Pick<
  GameState,
  | "territories"
  | "leagues"
  | "clubs"
  | "players"
  | "fixtures"
  | "subRegions"
  | "unsignedYouth"
  | "youthTournaments"
> & {
  /** Ordering hint only. It never makes a country eligible on its own. */
  countries?: string[];
};

type AssignmentType = InternationalAssignment["type"];

interface CountryAggregate {
  territoryIds: Set<string>;
  leagueIds: Set<string>;
  clubIds: Set<string>;
  playerIds: Set<string>;
  fixtureIds: Set<string>;
  subRegionIds: Set<string>;
  unsignedYouthIds: Set<string>;
  tournamentIds: Set<string>;
}

function countryIdentity(value?: string): string | undefined {
  const knownKey = normalizeCountryKey(value);
  if (knownKey) return knownKey;

  const compact = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function territoryCountryIdentity(
  territory: WorldCountryAvailabilitySource["territories"][string],
): string | undefined {
  return countryIdentity(territory.countryKey)
    ?? countryIdentity(territory.country)
    ?? countryIdentity(territory.id.replace(/^territory[_-]?/, ""));
}

function aggregateFor(
  aggregates: Map<string, CountryAggregate>,
  countryKey: string,
): CountryAggregate {
  const existing = aggregates.get(countryKey);
  if (existing) return existing;

  const created: CountryAggregate = {
    territoryIds: new Set(),
    leagueIds: new Set(),
    clubIds: new Set(),
    playerIds: new Set(),
    fixtureIds: new Set(),
    subRegionIds: new Set(),
    unsignedYouthIds: new Set(),
    tournamentIds: new Set(),
  };
  aggregates.set(countryKey, created);
  return created;
}

function toAvailability(
  countryKey: string,
  aggregate: CountryAggregate,
): WorldCountryAvailability {
  const territoryCount = aggregate.territoryIds.size;
  const leagueCount = aggregate.leagueIds.size;
  const clubCount = aggregate.clubIds.size;
  const playerCount = aggregate.playerIds.size;
  const fixtureCount = aggregate.fixtureIds.size;
  const subRegionCount = aggregate.subRegionIds.size;
  const unsignedYouthCount = aggregate.unsignedYouthIds.size;
  const tournamentCount = aggregate.tournamentIds.size;

  // A territory/league/sub-region by itself is only a shell. Require a real
  // player, club, or unsigned-youth pool before it becomes a destination.
  const hasWorldAnchor = territoryCount > 0 || leagueCount > 0 || subRegionCount > 0;
  const hasScoutablePool = clubCount > 0 || playerCount > 0 || unsignedYouthCount > 0;
  const travelEligible = hasWorldAnchor && hasScoutablePool;
  const assignmentTypes: AssignmentType[] = [];

  if (travelEligible) {
    // Secondary countries intentionally have no fixtures, but their youth and
    // club pools support both of these assignment types.
    assignmentTypes.push("youthTournament", "scoutingMission");
    // A senior friendly needs a fixture-backed country, not a static country
    // name or a talent pool without a competition schedule.
    if (fixtureCount > 0) assignmentTypes.push("seniorFriendly");
  }

  return {
    countryKey,
    contentTier: !travelEligible
      ? "unavailable"
      : fixtureCount > 0
        ? "fullWorld"
        : "talentPool",
    travelEligible,
    assignmentTypes,
    territoryCount,
    leagueCount,
    clubCount,
    playerCount,
    fixtureCount,
    subRegionCount,
    unsignedYouthCount,
    tournamentCount,
  };
}

/**
 * Derive every country represented by real persisted world content.
 *
 * `state.countries` controls stable presentation order when present, but is
 * never used as an evidence source. That distinction prevents an old static
 * country list from creating a clickable but empty destination.
 */
export function getWorldCountryAvailability(
  state: WorldCountryAvailabilitySource,
): WorldCountryAvailability[] {
  const aggregates = new Map<string, CountryAggregate>();
  const territoryCountryByLeagueId = new Map<string, string>();
  const leagueCountryById = new Map<string, string>();
  const clubCountryById = new Map<string, string>();

  for (const territory of Object.values(state.territories ?? {})) {
    const countryKey = territoryCountryIdentity(territory);
    if (!countryKey) continue;

    aggregateFor(aggregates, countryKey).territoryIds.add(territory.id);
    for (const leagueId of territory.leagueIds ?? []) {
      territoryCountryByLeagueId.set(leagueId, countryKey);
    }
  }

  for (const league of Object.values(state.leagues ?? {})) {
    const countryKey = countryIdentity(league.country)
      ?? territoryCountryByLeagueId.get(league.id);
    if (!countryKey) continue;

    leagueCountryById.set(league.id, countryKey);
    aggregateFor(aggregates, countryKey).leagueIds.add(league.id);
  }

  for (const club of Object.values(state.clubs ?? {})) {
    const countryKey = leagueCountryById.get(club.leagueId)
      ?? territoryCountryByLeagueId.get(club.leagueId);
    if (!countryKey) continue;

    clubCountryById.set(club.id, countryKey);
    aggregateFor(aggregates, countryKey).clubIds.add(club.id);
  }

  for (const player of Object.values(state.players ?? {})) {
    const countryKey = clubCountryById.get(player.clubId);
    if (!countryKey) continue;
    aggregateFor(aggregates, countryKey).playerIds.add(player.id);
  }

  for (const fixture of Object.values(state.fixtures ?? {})) {
    const countryKey = leagueCountryById.get(fixture.leagueId)
      ?? territoryCountryByLeagueId.get(fixture.leagueId);
    if (!countryKey) continue;
    aggregateFor(aggregates, countryKey).fixtureIds.add(fixture.id);
  }

  for (const subRegion of Object.values(state.subRegions ?? {})) {
    const countryKey = countryIdentity(subRegion.countryKey)
      ?? countryIdentity(subRegion.country);
    if (!countryKey) continue;
    aggregateFor(aggregates, countryKey).subRegionIds.add(subRegion.id);
  }

  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    const countryKey = countryIdentity(youth.country);
    if (!countryKey) continue;
    aggregateFor(aggregates, countryKey).unsignedYouthIds.add(youth.id);
  }

  for (const tournament of Object.values(state.youthTournaments ?? {})) {
    const countryKey = countryIdentity(tournament.countryKey)
      ?? countryIdentity(tournament.country);
    if (!countryKey) continue;
    aggregateFor(aggregates, countryKey).tournamentIds.add(tournament.id);
  }

  const listedOrder = new Map<string, number>();
  for (const [index, country] of (state.countries ?? []).entries()) {
    const countryKey = countryIdentity(country);
    if (countryKey && !listedOrder.has(countryKey)) {
      listedOrder.set(countryKey, index);
    }
  }

  return [...aggregates.entries()]
    .map(([countryKey, aggregate]) => toAvailability(countryKey, aggregate))
    .sort((left, right) => {
      const leftIndex = listedOrder.get(left.countryKey) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = listedOrder.get(right.countryKey) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.countryKey.localeCompare(right.countryKey);
    });
}

/** Return map/travel destinations with a generated usable gameplay surface. */
export function getTravelEligibleCountryKeys(
  state: WorldCountryAvailabilitySource,
): string[] {
  return getWorldCountryAvailability(state)
    .filter((availability) => availability.travelEligible)
    .map((availability) => availability.countryKey);
}

/** Find the generated-content record for one country, if the country exists. */
export function getCountryAvailability(
  state: WorldCountryAvailabilitySource,
  country: string,
): WorldCountryAvailability | undefined {
  const countryKey = countryIdentity(country);
  if (!countryKey) return undefined;
  return getWorldCountryAvailability(state).find(
    (availability) => availability.countryKey === countryKey,
  );
}

/** True only when the destination is backed by usable generated content. */
export function isTravelEligibleCountry(
  state: WorldCountryAvailabilitySource,
  country: string,
): boolean {
  return getCountryAvailability(state, country)?.travelEligible === true;
}

/** Assignment types that can be fulfilled in the generated destination. */
export function getInternationalAssignmentTypesForCountry(
  state: WorldCountryAvailabilitySource,
  country: string,
): InternationalAssignment["type"][] {
  return getCountryAvailability(state, country)?.assignmentTypes ?? [];
}

/** True only when at least one assignment type can be fulfilled there. */
export function isInternationalAssignmentEligibleCountry(
  state: WorldCountryAvailabilitySource,
  country: string,
): boolean {
  return getInternationalAssignmentTypesForCountry(state, country).length > 0;
}
