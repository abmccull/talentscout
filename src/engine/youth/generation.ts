/**
 * Youth generation engine — produces unsigned youth players, academy intakes,
 * and processes player aging / retirement.
 *
 * Design notes:
 *  - All functions are pure: state in → state out, no side effects.
 *  - All randomness flows through the provided RNG instance.
 *  - No React / Next.js imports. Engine module only.
 */

import type { RNG } from "@/engine/rng";
import type { Player, Club, Position, UnsignedYouth, SubRegion } from "@/engine/core/types";
import { ALL_POSITIONS } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import type { CountryData } from "@/data/types";

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/** Country-specific attribute bias applied after base generation. */
interface CountryBias {
  /** Attributes that receive a positive bonus (clamp to 1–20). */
  bonusAttributes: Readonly<Partial<Record<string, number>>>;
  /** Position distribution weights, keyed by Position. */
  positionWeights: Readonly<Record<Position, number>>;
}

// =============================================================================
// COUNTRY BIASES
// =============================================================================

/**
 * Per-country flavour: relative position demand and attribute bonuses.
 * Bonuses are applied post-generation to nudge youth toward regional style.
 * All numeric values represent raw +/- adjustments on the 1–20 attribute scale.
 */
const COUNTRY_BIASES: Record<string, CountryBias> = {
  // Core countries
  Brazil: {
    bonusAttributes: { dribbling: 2, firstTouch: 2 },
    positionWeights: {
      GK: 6, CB: 8, LB: 8, RB: 8, CDM: 9, CM: 12,
      CAM: 13, LW: 12, RW: 12, ST: 12,
    },
  },
  England: {
    bonusAttributes: { pace: 2, strength: 2 },
    positionWeights: {
      GK: 8, CB: 12, LB: 9, RB: 9, CDM: 11, CM: 11,
      CAM: 9, LW: 10, RW: 10, ST: 11,
    },
  },
  Spain: {
    bonusAttributes: { passing: 2, positioning: 2 },
    positionWeights: {
      GK: 7, CB: 10, LB: 9, RB: 9, CDM: 10, CM: 14,
      CAM: 12, LW: 10, RW: 10, ST: 9,
    },
  },
  Germany: {
    bonusAttributes: { workRate: 2, composure: 2 },
    positionWeights: {
      GK: 8, CB: 12, LB: 9, RB: 9, CDM: 12, CM: 11,
      CAM: 9, LW: 9, RW: 9, ST: 12,
    },
  },
  Argentina: {
    bonusAttributes: { dribbling: 2, composure: 2 },
    positionWeights: {
      GK: 7, CB: 9, LB: 8, RB: 8, CDM: 10, CM: 12,
      CAM: 13, LW: 11, RW: 11, ST: 11,
    },
  },
  France: {
    bonusAttributes: { pace: 2, strength: 1, agility: 1 },
    positionWeights: {
      GK: 7, CB: 11, LB: 10, RB: 10, CDM: 11, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 10,
    },
  },
  // North America
  USA: {
    bonusAttributes: { pace: 1, strength: 2 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 11, RW: 11, ST: 10,
    },
  },
  Mexico: {
    bonusAttributes: { dribbling: 2, firstTouch: 1 },
    positionWeights: {
      GK: 7, CB: 9, LB: 9, RB: 9, CDM: 10, CM: 12,
      CAM: 12, LW: 11, RW: 11, ST: 10,
    },
  },
  Canada: {
    bonusAttributes: { pace: 1, strength: 2 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 11, RW: 11, ST: 10,
    },
  },
  // West Africa — physical powerhouses
  Nigeria: {
    bonusAttributes: { pace: 2, strength: 2 },
    positionWeights: {
      GK: 7, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 11, RW: 11, ST: 11,
    },
  },
  Ghana: {
    bonusAttributes: { dribbling: 2, pace: 1 },
    positionWeights: {
      GK: 7, CB: 10, LB: 9, RB: 9, CDM: 10, CM: 12,
      CAM: 11, LW: 11, RW: 11, ST: 10,
    },
  },
  "Ivory Coast": {
    bonusAttributes: { pace: 2, strength: 2 },
    positionWeights: {
      GK: 7, CB: 11, LB: 9, RB: 9, CDM: 11, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 12,
    },
  },
  Cameroon: {
    bonusAttributes: { pace: 2, strength: 2 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 11, CM: 11,
      CAM: 9, LW: 10, RW: 10, ST: 12,
    },
  },
  Senegal: {
    bonusAttributes: { pace: 2, composure: 1 },
    positionWeights: {
      GK: 7, CB: 11, LB: 10, RB: 10, CDM: 11, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 10,
    },
  },
  // North/Southern Africa
  Egypt: {
    bonusAttributes: { passing: 2, composure: 1 },
    positionWeights: {
      GK: 8, CB: 10, LB: 9, RB: 9, CDM: 10, CM: 13,
      CAM: 12, LW: 10, RW: 10, ST: 9,
    },
  },
  "South Africa": {
    bonusAttributes: { pace: 2, strength: 1 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 11, RW: 11, ST: 10,
    },
  },
  // East Asia
  Japan: {
    bonusAttributes: { passing: 2, workRate: 1 },
    positionWeights: {
      GK: 7, CB: 10, LB: 10, RB: 10, CDM: 10, CM: 13,
      CAM: 12, LW: 10, RW: 10, ST: 8,
    },
  },
  "South Korea": {
    bonusAttributes: { stamina: 2, workRate: 1 },
    positionWeights: {
      GK: 8, CB: 11, LB: 10, RB: 10, CDM: 11, CM: 12,
      CAM: 10, LW: 9, RW: 9, ST: 10,
    },
  },
  China: {
    bonusAttributes: { strength: 2 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 12,
    },
  },
  // Middle East
  "Saudi Arabia": {
    bonusAttributes: { strength: 2 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 12,
    },
  },
  // Oceania
  Australia: {
    bonusAttributes: { pace: 1, strength: 1, stamina: 1 },
    positionWeights: {
      GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 11, RW: 11, ST: 10,
    },
  },
  "New Zealand": {
    bonusAttributes: { strength: 1, stamina: 1 },
    positionWeights: {
      GK: 8, CB: 12, LB: 9, RB: 9, CDM: 10, CM: 11,
      CAM: 10, LW: 10, RW: 10, ST: 11,
    },
  },
};

/** Fallback bias for countries not listed above. */
const DEFAULT_BIAS: CountryBias = {
  bonusAttributes: {},
  positionWeights: {
    GK: 8, CB: 11, LB: 9, RB: 9, CDM: 10, CM: 12,
    CAM: 10, LW: 10, RW: 10, ST: 11,
  },
};

// =============================================================================
// WEEKLY BATCH PARAMETERS PER COUNTRY
// =============================================================================

/** When rng.chance(0.3) fires, how many youth to generate in one batch. */
const BATCH_SIZE_RANGE: [number, number] = [10, 25];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert a display name to a slug-safe identifier component.
 * E.g. "North West" → "north_west", "São Paulo" → "sao_paulo"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    // strip combining diacritical marks
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Apply attribute bonuses from a CountryBias to an already-generated player.
 * Returns a new player object — does not mutate the original.
 */
function applyCountryBias(player: Player, bias: CountryBias): Player {
  const newAttrs = { ...player.attributes };
  for (const [attr, delta] of Object.entries(bias.bonusAttributes)) {
    if (delta === undefined) continue;
    const key = attr as keyof typeof newAttrs;
    if (key in newAttrs) {
      newAttrs[key] = Math.min(20, Math.max(1, newAttrs[key] + delta));
    }
  }
  return { ...player, attributes: newAttrs };
}

/**
 * Pick a position using country-weighted distribution.
 */
function pickPosition(rng: RNG, bias: CountryBias): Position {
  const items = ALL_POSITIONS.map((pos) => ({
    item: pos,
    weight: bias.positionWeights[pos] ?? 10,
  }));
  return rng.pickWeighted(items);
}

/**
 * Sample a potential ability using the heavy-tail distribution specified
 * in the design:
 *   60% journeyman   → PA  40–99
 *   25% qualityPro   → PA 100–149
 *   12% worldClass   → PA 150–179
 *    3% generational → PA 180–200
 */
function sampleYouthPA(rng: RNG): number {
  const roll = rng.next();
  if (roll < 0.60) {
    return rng.nextInt(40, 99);
  } else if (roll < 0.85) {
    return rng.nextInt(100, 149);
  } else if (roll < 0.97) {
    return rng.nextInt(150, 179);
  } else {
    return rng.nextInt(180, 200);
  }
}

/** Clamp CA so it never exceeds the sampled PA. */
function sampleYouthCA(rng: RNG, caMin: number, caMax: number, pa: number): number {
  const ca = rng.nextInt(caMin, caMax);
  return Math.min(ca, pa);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate the list of sub-regions for a given country.
 * Each sub-region starts with familiarity = 0.
 *
 * @param country - Country display name as used in CountryData.name (e.g. "England")
 */
export function generateSubRegions(country: string): SubRegion[] {
  const regionNames: Record<string, string[]> = {
    // Core countries
    England: [
      "London", "North West", "North East", "Midlands",
      "South Coast", "Yorkshire", "East Anglia",
    ],
    Brazil: [
      "São Paulo", "Rio de Janeiro", "Minas Gerais",
      "Southern", "Northeast", "North",
    ],
    Argentina: [
      "Buenos Aires", "Rosario", "Córdoba",
      "Mendoza", "La Plata", "Tucumán",
    ],
    Spain: [
      "Catalonia", "Madrid", "Andalusia",
      "Basque Country", "Valencia", "Galicia",
    ],
    Germany: [
      "Bavaria", "North Rhine-Westphalia", "Saxony",
      "Hamburg", "Berlin", "Baden-Württemberg",
    ],
    France: [
      "Île-de-France", "Provence", "Rhône-Alpes",
      "Brittany", "Alsace", "Midi-Pyrénées",
    ],
    // Secondary countries
    USA: ["East Coast", "West Coast", "Midwest", "South", "Pacific NW"],
    Mexico: ["CDMX", "Monterrey", "Guadalajara", "Puebla", "Tijuana"],
    Canada: ["Ontario", "Quebec", "British Columbia", "Prairies"],
    Nigeria: ["Lagos", "Abuja", "South-South", "North"],
    Ghana: ["Greater Accra", "Ashanti", "Northern"],
    "Ivory Coast": ["Abidjan", "Bouaké", "Western"],
    Egypt: ["Cairo", "Alexandria", "Upper Egypt"],
    "South Africa": ["Gauteng", "Western Cape", "KZN", "Eastern Cape"],
    Senegal: ["Dakar", "Thiès", "Saint-Louis"],
    Cameroon: ["Centre", "Littoral", "West"],
    Japan: ["Kanto", "Kansai", "Chubu", "Kyushu", "Hokkaido"],
    "South Korea": ["Seoul", "Gyeonggi", "Gyeongsang", "Jeolla"],
    "Saudi Arabia": ["Riyadh", "Jeddah", "Eastern", "Mecca"],
    China: ["Beijing", "Shanghai", "Guangdong", "Shandong"],
    Australia: ["NSW", "Victoria", "Queensland", "Western Australia"],
    "New Zealand": ["Auckland", "Wellington", "Canterbury"],
  };

  const names = regionNames[country] ?? [];
  return names.map((name) => ({
    id: `subregion_${toSlug(country)}_${toSlug(name)}`,
    name,
    country,
    familiarity: 0,
  }));
}

/**
 * Generate unsigned youth players for a country in a given week.
 *
 * Generation fires stochastically: only ~30% of weeks produce a batch.
 * When it fires, 10–25 youth are created and distributed across sub-regions.
 *
 * @param rng        - Shared RNG instance.
 * @param country    - Country data package.
 * @param season     - Current season year.
 * @param week       - Current week within the season.
 * @param subRegions - Active sub-regions for this country.
 * @returns Array of unsigned youth (may be empty when rng.chance fails).
 */
export function generateRegionalYouth(
  rng: RNG,
  country: CountryData,
  season: number,
  week: number,
  subRegions: SubRegion[],
): UnsignedYouth[] {
  // 30% chance this country produces youth this week
  if (!rng.chance(0.3)) {
    return [];
  }

  const batchCount = rng.nextInt(BATCH_SIZE_RANGE[0], BATCH_SIZE_RANGE[1]);
  const bias = COUNTRY_BIASES[country.name] ?? DEFAULT_BIAS;
  const result: UnsignedYouth[] = [];

  for (let i = 0; i < batchCount; i++) {
    const age = rng.nextInt(14, 17);
    const pa = sampleYouthPA(rng);
    // CA is always in [10, 60] but capped at PA
    const ca = sampleYouthCA(rng, 10, 60, pa);
    const position = pickPosition(rng, bias);

    // Pick nationality from the country's native pool (all youth are domestic)
    const nationality = country.name;

    // Resolve a name from the country's native pool
    const nativePool = country.nativeNamePool;
    const firstName = rng.pick(nativePool.firstNames);
    const lastName = rng.pick(nativePool.lastNames);

    // Generate the base player
    const basePlayer = generatePlayer(rng, {
      position,
      ageRange: [age, age],
      abilityRange: [ca, ca],
      nationality,
      clubId: "",
      currentSeason: season,
      clubReputation: 50,
      firstName,
      lastName,
    });

    // Override PA since generatePlayer re-computes it internally;
    // we want our explicit heavy-tail PA, not the function's PA formula.
    const player: Player = { ...basePlayer, potentialAbility: pa };

    // Apply regional attribute flavour
    const flavouredPlayer = applyCountryBias(player, bias);

    // Assign to a random sub-region (fall back to country name if no sub-regions)
    const regionId =
      subRegions.length > 0
        ? rng.pick(subRegions).id
        : `subregion_${toSlug(country.name)}_default`;

    result.push({
      id: flavouredPlayer.id,
      player: flavouredPlayer,
      visibility: 0,
      buzzLevel: 0,
      discoveredBy: [],
      regionId,
      country: country.name,
      venueAppearances: [],
      generatedSeason: season,
      placed: false,
      retired: false,
    });
  }

  return result;
}

/**
 * Generate the annual academy intake for a club.
 *
 * Count is derived from youthAcademyRating:
 *   floor(rating / 5) + rng.nextInt(0, 1) → 2–5 players
 *
 * Quality ranges scale with academy rating in four bands.
 *
 * @param rng     - Shared RNG instance.
 * @param club    - Club entity (uses youthAcademyRating and id).
 * @param country - Country data for native name pools.
 * @param season  - Current season year.
 * @returns Array of fully-formed Player objects attached to the club.
 */
export function generateAcademyIntake(
  rng: RNG,
  club: Club,
  country: CountryData,
  season: number,
): Player[] {
  const count = Math.floor(club.youthAcademyRating / 5) + rng.nextInt(0, 1);

  // Quality bands by youthAcademyRating
  let caRange: [number, number];
  let paRange: [number, number];

  const rating = club.youthAcademyRating;
  if (rating <= 5) {
    caRange = [15, 35];
    paRange = [40, 100];
  } else if (rating <= 10) {
    caRange = [20, 45];
    paRange = [60, 130];
  } else if (rating <= 15) {
    caRange = [25, 50];
    paRange = [80, 160];
  } else {
    // 16–20
    caRange = [30, 60];
    paRange = [100, 190];
  }

  const nativePool = country.nativeNamePool;
  const nationality = country.name;

  const players: Player[] = [];

  for (let i = 0; i < count; i++) {
    const age = rng.nextInt(14, 16);

    // Sample PA in the band, then ensure CA <= PA
    const pa = rng.nextInt(paRange[0], paRange[1]);
    const caMin = Math.min(caRange[0], pa);
    const caMax = Math.min(caRange[1], pa);
    const ca = rng.nextInt(caMin, caMax);

    const firstName = rng.pick(nativePool.firstNames);
    const lastName = rng.pick(nativePool.lastNames);

    // Position is fully random for academy intakes — no position bias
    const position = rng.pick(ALL_POSITIONS);

    const basePlayer = generatePlayer(rng, {
      position,
      ageRange: [age, age],
      abilityRange: [ca, ca],
      nationality,
      clubId: club.id,
      currentSeason: season,
      clubReputation: club.reputation,
      firstName,
      lastName,
    });

    // Override PA with our explicit band-sampled value
    players.push({ ...basePlayer, potentialAbility: pa });
  }

  return players;
}

// =============================================================================
// YOUTH AGING PROCESS
// =============================================================================

/**
 * Process the annual aging pass for all unsigned youth in the world.
 *
 * Rules (evaluated in priority order):
 *  - Age 19+:  forced retirement (all leave football)
 *  - Age 18+:  50% chance NPC minor club signs them / 50% leave football
 *  - Age 17+ with buzzLevel >= 60: 30% chance NPC club signs (rating >= 10)
 *
 * NPC auto-sign picks a random club whose youthAcademyRating >= 10.
 *
 * @returns
 *   updated      - Full UnsignedYouth map with placed/retired flags applied.
 *   autoSigned   - Pairs of { youthId, clubId } for each NPC signing.
 *   retired      - IDs of youth who left football this cycle.
 */
export function processYouthAging(
  rng: RNG,
  unsignedYouth: Record<string, UnsignedYouth>,
  clubs: Record<string, Club>,
  _currentSeason: number,
): {
  updated: Record<string, UnsignedYouth>;
  autoSigned: Array<{ youthId: string; clubId: string }>;
  retired: string[];
} {
  // Build list of eligible NPC clubs once (rating >= 10)
  const npcEligibleClubs = Object.values(clubs).filter(
    (c) => c.youthAcademyRating >= 10,
  );

  const updated: Record<string, UnsignedYouth> = { ...unsignedYouth };
  const autoSigned: Array<{ youthId: string; clubId: string }> = [];
  const retired: string[] = [];

  for (const youth of Object.values(unsignedYouth)) {
    // Skip already resolved youth
    if (youth.placed || youth.retired) continue;

    const age = youth.player.age;

    // --- Age 19+: forced exit ---
    if (age >= 19) {
      updated[youth.id] = { ...youth, retired: true };
      retired.push(youth.id);
      continue;
    }

    // --- Age 18+: 50/50 ---
    if (age >= 18) {
      if (rng.chance(0.5) && npcEligibleClubs.length > 0) {
        // NPC minor club signs them
        const club = rng.pick(npcEligibleClubs);
        updated[youth.id] = {
          ...youth,
          placed: true,
          placedClubId: club.id,
        };
        autoSigned.push({ youthId: youth.id, clubId: club.id });
      } else {
        // Leave football
        updated[youth.id] = { ...youth, retired: true };
        retired.push(youth.id);
      }
      continue;
    }

    // --- Age 17+ with buzz >= 60: 30% NPC interest ---
    if (age >= 17 && youth.buzzLevel >= 60 && npcEligibleClubs.length > 0) {
      if (rng.chance(0.3)) {
        const club = rng.pick(npcEligibleClubs);
        updated[youth.id] = {
          ...youth,
          placed: true,
          placedClubId: club.id,
        };
        autoSigned.push({ youthId: youth.id, clubId: club.id });
      }
      // If chance fails, youth stays unsigned — no retirement at 17
    }
  }

  return { updated, autoSigned, retired };
}

// =============================================================================
// PLAYER RETIREMENT PROCESS
// =============================================================================

/**
 * Process season-end retirement for all active squad players.
 *
 * Retirement probability by age:
 *  - Age 33–35: (age - 32) * 10% per season  →  10%, 20%, 30%
 *  - Age 36–37: 80% chance
 *  - Age 38+:   automatic retirement
 *
 * Retired players are removed from their club's playerIds array.
 *
 * @returns
 *   retiredPlayerIds - IDs of all players who retired this cycle.
 *   updatedClubs     - Club map with playerIds pruned of retired players.
 */
export function processPlayerRetirement(
  rng: RNG,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  _currentSeason: number,
): {
  retiredPlayerIds: string[];
  updatedClubs: Record<string, Club>;
} {
  const retiredPlayerIds: string[] = [];

  for (const player of Object.values(players)) {
    const age = player.age;

    if (age >= 38) {
      // Automatic retirement
      retiredPlayerIds.push(player.id);
      continue;
    }

    if (age >= 36) {
      // 80% chance
      if (rng.chance(0.8)) {
        retiredPlayerIds.push(player.id);
      }
      continue;
    }

    if (age >= 33) {
      // (age - 32) * 10% — i.e. 10% at 33, 20% at 34, 30% at 35
      const probability = (age - 32) * 0.1;
      if (rng.chance(probability)) {
        retiredPlayerIds.push(player.id);
      }
    }
    // Age < 33: no retirement chance
  }

  if (retiredPlayerIds.length === 0) {
    return { retiredPlayerIds, updatedClubs: clubs };
  }

  // Build a set for O(1) lookup
  const retiredSet = new Set(retiredPlayerIds);

  // Update clubs: remove retired players from playerIds without mutating input
  const updatedClubs: Record<string, Club> = {};
  for (const [clubId, club] of Object.entries(clubs)) {
    const hadRetired = club.playerIds.some((pid) => retiredSet.has(pid));
    if (hadRetired) {
      updatedClubs[clubId] = {
        ...club,
        playerIds: club.playerIds.filter((pid) => !retiredSet.has(pid)),
      };
    } else {
      updatedClubs[clubId] = club;
    }
  }

  return { retiredPlayerIds, updatedClubs };
}
