/**
 * Player generation — produces realistic players for the game world.
 * All randomness flows through the provided RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  Player,
  Position,
  Foot,
  DevelopmentProfile,
  WonderkidTier,
  PlayerAttribute,
} from "@/engine/core/types";
import { ALL_ATTRIBUTES, ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import { generatePersonalityTraits } from "./personality";
import type { ClubData, LeagueData, NamePool, NationalityWeight } from "@/data/types";
import type { CountryData } from "@/data/types";
// England data is imported only to supply backward-compatible defaults.
import {
  ENGLISH_FIRST_NAMES,
  ENGLISH_LAST_NAMES,
  FOREIGN_FIRST_NAMES,
  FOREIGN_LAST_NAMES,
  NATIONALITIES_BY_LEAGUE_TIER,
} from "@/data/england";

// ---------------------------------------------------------------------------
// Public config interface
// ---------------------------------------------------------------------------

export interface PlayerGenConfig {
  position: Position;
  ageRange: [number, number];
  abilityRange: [number, number];
  nationality: string;
  clubId: string;
  currentSeason?: number;
  clubReputation?: number;
  /**
   * Pre-computed first name. When provided, generatePlayer skips its own
   * name-generation step and uses this value directly.
   */
  firstName?: string;
  /**
   * Pre-computed last name. When provided, generatePlayer skips its own
   * name-generation step and uses this value directly.
   */
  lastName?: string;
}

const START_SEASON = 1;

// ---------------------------------------------------------------------------
// Backward-compatible default name pools (English system)
// ---------------------------------------------------------------------------

const DEFAULT_NATIVE_NATIONALITY = "English";

const DEFAULT_NATIVE_POOL: NamePool = {
  firstNames: ENGLISH_FIRST_NAMES,
  lastNames: ENGLISH_LAST_NAMES,
};

const DEFAULT_FOREIGN_POOLS: Record<string, NamePool> = Object.fromEntries(
  Object.entries(FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
    nat,
    { firstNames: firsts, lastNames: FOREIGN_LAST_NAMES[nat] ?? [] },
  ]),
);

// ---------------------------------------------------------------------------
// Position-based attribute weight multipliers
// ---------------------------------------------------------------------------

type AttrWeights = Partial<Record<PlayerAttribute, number>>;

const POSITION_WEIGHTS: Record<Position, AttrWeights> = {
  GK: {
    composure: 1.4, positioning: 1.5, leadership: 1.1,
    shooting: 0.2, dribbling: 0.2, crossing: 0.2, heading: 0.4,
    pace: 0.5, agility: 0.8, strength: 0.7,
    defensiveAwareness: 0.5, pressing: 0.3, offTheBall: 0.3,
  },
  CB: {
    defensiveAwareness: 1.7, heading: 1.6, strength: 1.5,
    positioning: 1.5, composure: 1.2, leadership: 1.3, passing: 1.1,
    pace: 0.9, shooting: 0.4, dribbling: 0.6, crossing: 0.5,
  },
  LB: {
    crossing: 1.5, pace: 1.5, stamina: 1.3, agility: 1.2,
    defensiveAwareness: 1.3, pressing: 1.2, dribbling: 1.1, workRate: 1.2,
    shooting: 0.5, heading: 0.8, strength: 0.9,
  },
  RB: {
    crossing: 1.5, pace: 1.5, stamina: 1.3, agility: 1.2,
    defensiveAwareness: 1.3, pressing: 1.2, dribbling: 1.1, workRate: 1.2,
    shooting: 0.5, heading: 0.8, strength: 0.9,
  },
  CDM: {
    defensiveAwareness: 1.6, pressing: 1.5, workRate: 1.4,
    stamina: 1.3, strength: 1.3, positioning: 1.3, passing: 1.2,
    decisionMaking: 1.2, shooting: 0.6, dribbling: 0.8,
  },
  CM: {
    passing: 1.4, decisionMaking: 1.3, stamina: 1.3,
    workRate: 1.3, firstTouch: 1.2, composure: 1.1,
    offTheBall: 1.1, pressing: 1.1,
  },
  CAM: {
    passing: 1.4, firstTouch: 1.4, dribbling: 1.4,
    decisionMaking: 1.3, composure: 1.3, shooting: 1.2, offTheBall: 1.3,
    defensiveAwareness: 0.5, heading: 0.7, strength: 0.8,
  },
  LW: {
    pace: 1.6, dribbling: 1.6, agility: 1.4,
    crossing: 1.3, firstTouch: 1.3, shooting: 1.2, offTheBall: 1.2,
    defensiveAwareness: 0.5, strength: 0.7, heading: 0.6,
  },
  RW: {
    pace: 1.6, dribbling: 1.6, agility: 1.4,
    crossing: 1.3, firstTouch: 1.3, shooting: 1.2, offTheBall: 1.2,
    defensiveAwareness: 0.5, strength: 0.7, heading: 0.6,
  },
  ST: {
    shooting: 1.8, composure: 1.5, positioning: 1.5,
    heading: 1.4, strength: 1.3, firstTouch: 1.2, decisionMaking: 1.2,
    offTheBall: 1.4, pace: 1.1,
    defensiveAwareness: 0.3, pressing: 0.6,
  },
};

const SECONDARY_POSITIONS: Record<Position, readonly Position[]> = {
  GK: [],
  CB: ["CDM", "RB", "LB"],
  LB: ["CB", "LW"],
  RB: ["CB", "RW"],
  CDM: ["CB", "CM"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "ST", "LW", "RW"],
  LW: ["RW", "ST", "CAM"],
  RW: ["LW", "ST", "CAM"],
  ST: ["LW", "RW", "CAM"],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(rng: RNG): string {
  const hex = () => rng.nextInt(0, 15).toString(16);
  const seg = (n: number) => Array.from({ length: n }, hex).join("");
  const y = rng.nextInt(8, 11).toString(16);
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${y}${seg(3)}-${seg(12)}`;
}

function clampAttr(v: number): number {
  return Math.round(Math.max(1, Math.min(20, v)));
}

function generateAttributes(
  rng: RNG,
  position: Position,
  currentAbility: number,
): Record<PlayerAttribute, number> {
  const base = (currentAbility / 200) * 19 + 1;
  const weights = POSITION_WEIGHTS[position];
  const stddev = 2.5 - (currentAbility / 200) * 1.0;

  const attrs = {} as Record<PlayerAttribute, number>;
  for (const attr of ALL_ATTRIBUTES) {
    const domain = ATTRIBUTE_DOMAINS[attr];
    // Hidden attributes: generate around midpoint with high variance.
    if (domain === "hidden") {
      attrs[attr] = clampAttr(rng.gaussian(10, 4));
      continue;
    }
    const weight = weights[attr] ?? 1.0;
    attrs[attr] = clampAttr(rng.gaussian(base * weight, stddev));
  }
  return attrs;
}

function generatePotentialAbility(rng: RNG, ca: number, age: number): number {
  if (age >= 29) return Math.min(200, Math.max(ca, ca + rng.nextInt(-5, 10)));
  if (age >= 24) return Math.min(200, ca + rng.nextInt(0, 20));
  if (age >= 21) return Math.min(200, ca + rng.nextInt(5, 35));
  return Math.min(200, ca + rng.nextInt(15, 60));
}

function classifyWonderkidTier(age: number, pa: number): WonderkidTier {
  if (age >= 21) return "journeyman";
  if (pa >= 180) return "generational";
  if (pa >= 150) return "worldClass";
  if (pa >= 100) return "qualityPro";
  return "journeyman";
}

function calculateMarketValue(ca: number, pa: number, age: number, pos: Position): number {
  const caFactor = Math.pow(ca / 100, 2.5);
  let base = caFactor * 50_000_000;
  const ageFactor =
    age <= 20 ? 1.4
    : age <= 24 ? 1.2
    : age <= 27 ? 1.0
    : age <= 30 ? 0.75
    : age <= 33 ? 0.45
    : 0.2;
  base *= ageFactor;
  base *= 1 + Math.max(0, pa - ca) / 200;
  const posMult: Record<Position, number> = {
    ST: 1.3, CAM: 1.2, LW: 1.15, RW: 1.15, CM: 1.0,
    CDM: 0.95, LB: 0.9, RB: 0.9, CB: 0.85, GK: 0.8,
  };
  base *= posMult[pos];
  return Math.round(base);
}

function calculateWage(ca: number, clubRep: number): number {
  const caFactor = Math.pow(ca / 100, 2.2);
  const weekly = caFactor * 50_000 * (clubRep / 80);
  return Math.round(weekly / 500) * 500;
}

// ---------------------------------------------------------------------------
// Public name-pool utilities
// ---------------------------------------------------------------------------

/**
 * Resolve the correct NamePool for a given player nationality.
 *
 * Resolution order:
 *   1. Exact match on nativeNationality → nativePool.
 *   2. Match in foreignPools → that pool.
 *   3. Fallback → nativePool.
 *
 * This is exported so callers (e.g. world initializers for other countries)
 * can resolve pools independently of generatePlayer.
 */
export function resolveNamePool(
  nationality: string,
  nativeNationality: string,
  nativePool: NamePool,
  foreignPools: Record<string, NamePool>,
): NamePool {
  if (nationality === nativeNationality) {
    return nativePool;
  }
  return foreignPools[nationality] ?? nativePool;
}

/**
 * Generate a first and last name for a player of the given nationality,
 * drawing from the supplied native and foreign name pools.
 *
 * The pool is resolved via resolveNamePool so foreign players receive names
 * appropriate to their own nationality, while unrecognised nationalities
 * fall back to the league's native pool.
 */
function generateName(
  rng: RNG,
  nationality: string,
  nativeNationality: string,
  nativePool: NamePool,
  foreignPools: Record<string, NamePool>,
): { firstName: string; lastName: string } {
  const pool = resolveNamePool(nationality, nativeNationality, nativePool, foreignPools);
  return {
    firstName: rng.pick(pool.firstNames),
    lastName: rng.pick(pool.lastNames),
  };
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Generate a single player from a config.
 *
 * When `config.firstName` and `config.lastName` are pre-computed (e.g. by
 * generateSquad using country-specific pools), they are used directly and no
 * additional RNG draws are made for the name.  When omitted, the function
 * falls back to the English name pools for backward compatibility with direct
 * call sites that do not supply a country context.
 */
export function generatePlayer(rng: RNG, config: PlayerGenConfig): Player {
  const {
    position, ageRange, abilityRange, nationality, clubId,
    currentSeason = START_SEASON, clubReputation = 50,
  } = config;

  const ageMean = (ageRange[0] + ageRange[1]) / 2;
  const rawAge = rng.gaussian(ageMean, (ageRange[1] - ageRange[0]) / 4);
  const age = Math.round(Math.max(ageRange[0], Math.min(ageRange[1], rawAge)));

  const caMean = (abilityRange[0] + abilityRange[1]) / 2;
  const rawCA = rng.gaussian(caMean, (abilityRange[1] - abilityRange[0]) / 4);
  const currentAbility = Math.round(Math.max(abilityRange[0], Math.min(abilityRange[1], rawCA)));

  const potentialAbility = generatePotentialAbility(rng, currentAbility, age);

  // Use pre-computed names if provided; otherwise generate from default pools.
  const { firstName, lastName } =
    config.firstName !== undefined && config.lastName !== undefined
      ? { firstName: config.firstName, lastName: config.lastName }
      : generateName(rng, nationality, DEFAULT_NATIVE_NATIONALITY, DEFAULT_NATIVE_POOL, DEFAULT_FOREIGN_POOLS);

  const preferredFoot = rng.pickWeighted<Foot>([
    { item: "right", weight: 72 }, { item: "left", weight: 20 }, { item: "both", weight: 8 },
  ]);
  const attributes = generateAttributes(rng, position, currentAbility);
  const developmentProfile = rng.pickWeighted<DevelopmentProfile>([
    { item: "steadyGrower", weight: 50 }, { item: "earlyBloomer", weight: 20 },
    { item: "lateBloomer", weight: 20 }, { item: "volatile", weight: 10 },
  ]);
  const wonderkidTier = classifyWonderkidTier(age, potentialAbility);

  const secondaryPositions: Position[] = [];
  const opts = SECONDARY_POSITIONS[position];
  if (opts.length > 0 && rng.chance(0.4)) {
    secondaryPositions.push(rng.pick(opts));
  }

  const birthYear = 2024 - age;
  const month = rng.nextInt(1, 12);
  const maxDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 28;
  const day = rng.nextInt(1, maxDay);

  return {
    id: generateId(rng),
    firstName,
    lastName,
    age,
    dateOfBirth: { day, month, year: birthYear },
    nationality,
    position,
    secondaryPositions,
    preferredFoot,
    clubId,
    contractExpiry: currentSeason + rng.nextInt(1, 5),
    wage: calculateWage(currentAbility, clubReputation),
    marketValue: calculateMarketValue(currentAbility, potentialAbility, age, position),
    attributes,
    currentAbility,
    potentialAbility,
    developmentProfile,
    wonderkidTier,
    form: 0,
    morale: rng.nextInt(5, 8),
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: generatePersonalityTraits(rng, { position, age, developmentProfile }),
    personalityRevealed: [],
  };
}

// ---------------------------------------------------------------------------
// Squad generator
// ---------------------------------------------------------------------------

function buildPositionSlots(rng: RNG, size: number): Position[] {
  const slots: Position[] = [
    "GK", "GK", "GK",
    "CB", "CB", "CB", "CB",
    "LB", "LB", "RB", "RB",
    "CDM", "CDM",
    "CM", "CM", "CM",
    "CAM", "CAM",
    "LW", "LW", "RW", "RW",
    "ST", "ST", "ST",
  ];
  return rng.shuffle(slots).slice(0, size);
}

/**
 * Generate a full squad for a club.
 *
 * Parameters:
 *   rng                 - Shared RNG instance.
 *   club                - Club static data.
 *   leagueTier          - League tier (1 = top flight).
 *   nationalityWeights  - Weighted nationality distribution for this tier.
 *                         Defaults to the England tier table when omitted,
 *                         preserving backward compatibility for existing callers.
 *   nativeNationality   - The dominant nationality of the league country
 *                         (e.g. "English"). Defaults to "English".
 *   nativePool          - Name pool for native players. Defaults to English names.
 *   foreignPools        - Name pools keyed by nationality. Defaults to England's
 *                         foreign pools.
 */
export function generateSquad(
  rng: RNG,
  club: ClubData,
  leagueTier: number,
  nationalityWeights?: NationalityWeight[],
  nativeNationality: string = DEFAULT_NATIVE_NATIONALITY,
  nativePool: NamePool = DEFAULT_NATIVE_POOL,
  foreignPools: Record<string, NamePool> = DEFAULT_FOREIGN_POOLS,
): Player[] {
  const squadSize = rng.nextInt(22, 28);
  const slots = buildPositionSlots(rng, squadSize);
  const repFraction = (club.reputation - 10) / 90;
  const caMin = Math.round(15 + repFraction * 110);
  const caMax = Math.round(40 + repFraction * 160);

  // Prefer the caller-supplied weights; fall back to the England tier table.
  const resolvedWeights: NationalityWeight[] =
    nationalityWeights ??
    (NATIONALITIES_BY_LEAGUE_TIER[leagueTier] ?? NATIONALITIES_BY_LEAGUE_TIER[4]!);

  return slots.map((position) => {
    const nationality = rng.pickWeighted(
      resolvedWeights.map((n) => ({ item: n.nationality, weight: n.weight })),
    );
    // Generate the name once here with the correct country-specific pools and
    // pass it into generatePlayer via the config overrides. This ensures every
    // player gets a name that matches their nationality and the host country's
    // available foreign pools, while generatePlayer remains a pure data builder.
    const { firstName, lastName } = generateName(
      rng,
      nationality,
      nativeNationality,
      nativePool,
      foreignPools,
    );
    return generatePlayer(rng, {
      position,
      ageRange: [17, 38],
      abilityRange: [
        Math.max(1, caMin + rng.nextInt(-10, 5)),
        Math.min(200, caMax + rng.nextInt(-5, 15)),
      ],
      nationality,
      clubId: club.id,
      currentSeason: START_SEASON,
      clubReputation: club.reputation,
      firstName,
      lastName,
    });
  });
}

// ---------------------------------------------------------------------------
// World generator
// ---------------------------------------------------------------------------

/**
 * Generate all players for every club across every league in a CountryData
 * package. The country's name pools and per-tier nationality weights are
 * applied automatically.
 *
 * @param rng     - Shared RNG instance.
 * @param country - Full country data (leagues, pools, nationality weights).
 */
export function generateWorldPlayers(rng: RNG, country: CountryData): Player[];
/**
 * @deprecated Pass a CountryData object instead of a raw LeagueData array.
 * This overload preserves backward compatibility and will be removed in a
 * future release. The raw-array path uses England defaults for name pools.
 */
export function generateWorldPlayers(rng: RNG, leagues: LeagueData[]): Player[];
export function generateWorldPlayers(
  rng: RNG,
  countryOrLeagues: CountryData | LeagueData[],
): Player[] {
  if (Array.isArray(countryOrLeagues)) {
    // Deprecated path: raw LeagueData[]. Fall back to England defaults.
    const players: Player[] = [];
    for (const league of countryOrLeagues) {
      for (const club of league.clubs) {
        players.push(...generateSquad(rng, club, league.tier));
      }
    }
    return players;
  }

  // Preferred path: full CountryData carries everything needed.
  const country = countryOrLeagues;
  const tierKeys = Object.keys(country.nationalitiesByTier).map(Number);
  const maxTier = tierKeys.length > 0 ? Math.max(...tierKeys) : 4;

  const players: Player[] = [];
  for (const league of country.leagues) {
    const weights =
      country.nationalitiesByTier[league.tier] ??
      country.nationalitiesByTier[maxTier];
    for (const club of league.clubs) {
      players.push(
        ...generateSquad(
          rng,
          club,
          league.tier,
          weights,
          country.name,
          country.nativeNamePool,
          country.foreignNamePools,
        ),
      );
    }
  }
  return players;
}
