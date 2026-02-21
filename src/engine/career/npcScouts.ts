/**
 * NPC Scout management — autonomous scouting network mechanics.
 *
 * NPC scouts are hired staff (tier 4+ only) who autonomously observe players
 * in assigned territories and generate simplified reports for the player to
 * review. All functions are pure: they accept state and return new data without
 * mutating their inputs.
 *
 * Key design notes:
 *  - NPCScout.quality is on a 1–5 scale (not 1–20). Higher tier scouts hire
 *    better NPC scouts with higher quality floors.
 *  - Territory.assignedScoutIds is the canonical assignment list. The NPC
 *    scout's territoryId field mirrors the assignment from the other side.
 *  - Report quality is clamped to [1, 100]. Fatigue above 60 degrades quality.
 */

import type { RNG } from "@/engine/rng";
import type {
  NPCScout,
  NPCScoutReport,
  Territory,
  Player,
  Scout,
  Specialization,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * First names pool for generated NPC scouts.
 * Deliberately broad so that world seeds produce varied rosters.
 */
const FIRST_NAMES = [
  "Marco", "Luca", "Diego", "João", "Alejandro", "Rafaël", "Tomáš",
  "Sven", "Patrick", "Henrik", "Mihail", "Andrei", "Kwame", "Ibrahima",
  "Carlos", "Takashi", "Yusuf", "Ander", "Florian", "Matteo", "Emeka",
  "Stefan", "Viktor", "Ezra", "Rúben", "Lars", "Tariq", "Noel", "Björn",
] as const;

const LAST_NAMES = [
  "Santos", "Müller", "García", "Novák", "Andersen", "Okonkwo", "Ramos",
  "Eriksen", "Petrov", "López", "Kone", "Bauer", "Tanaka", "Öztürk",
  "Fernández", "Johansson", "Diallo", "Krejčí", "Reyes", "Svensson",
  "Adeyemi", "Hoffmann", "Nascimento", "Lindström", "Mbeki", "Watanabe",
  "Costa", "Kristiansen", "Yilmaz", "Papadopoulos",
] as const;

/**
 * Quality bands per scout.careerTier when hiring NPC scouts.
 * Maps to NPCScout.quality (1–5 scale).
 * Lower tiers cannot hire high-quality scouts; tier 5 unlocks the full range.
 */
const NPC_QUALITY_BY_TIER: Record<number, { min: number; max: number }> = {
  1: { min: 1, max: 1 },
  2: { min: 1, max: 2 },
  3: { min: 1, max: 3 },
  4: { min: 2, max: 4 },
  5: { min: 3, max: 5 },
};

/**
 * Weekly salary bands (£) for NPC scouts by quality tier.
 */
const NPC_SALARY_BY_QUALITY: Record<number, { min: number; max: number }> = {
  1: { min: 200,  max: 500 },
  2: { min: 500,  max: 1000 },
  3: { min: 1000, max: 2000 },
  4: { min: 2000, max: 4000 },
  5: { min: 4000, max: 8000 },
};

const ALL_SPECIALIZATIONS: readonly Specialization[] = [
  "youth",
  "firstTeam",
  "regional",
  "data",
] as const;

/**
 * Observable (non-hidden) attribute pool for simplified NPC readings.
 * NPC scouts do not penetrate hidden attributes.
 */
const OBSERVABLE_ATTRIBUTES = [
  "firstTouch",
  "passing",
  "dribbling",
  "shooting",
  "heading",
  "pace",
  "strength",
  "stamina",
  "agility",
  "composure",
  "positioning",
  "workRate",
  "decisionMaking",
  "offTheBall",
  "pressing",
  "defensiveAwareness",
] as const;

/** Fatigue threshold above which quality starts to degrade. */
const FATIGUE_QUALITY_THRESHOLD = 60;
/** Fatigue threshold used by calculateNPCReportQuality penalty. */
const FATIGUE_PENALTY_THRESHOLD = 70;
/** Fatigue accrued per scouting week. */
const WEEKLY_FATIGUE_GAIN = 8;
/** Fatigue recovered by a rest action. */
const REST_FATIGUE_RECOVERY = 25;

// ---------------------------------------------------------------------------
// 1. Generate NPC Scout Roster
// ---------------------------------------------------------------------------

/**
 * Generate `count` NPC scouts appropriate for the player's current career tier.
 *
 * Quality scales with scout.careerTier so that higher-tier scouts can recruit
 * more capable staff. Specialization is randomised; salary is drawn from the
 * quality-tier salary band.
 *
 * @param rng   Seeded RNG for deterministic generation.
 * @param scout The player-controlled scout (tier used for quality floor/ceiling).
 * @param count Number of NPC scouts to generate.
 */
export function generateNPCScoutRoster(
  rng: RNG,
  scout: Scout,
  count: number,
): NPCScout[] {
  if (count <= 0) return [];

  const tier = Math.max(1, Math.min(5, scout.careerTier)) as 1 | 2 | 3 | 4 | 5;
  const qualityBand = NPC_QUALITY_BY_TIER[tier] ?? { min: 1, max: 2 };

  const result: NPCScout[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName  = rng.pick(LAST_NAMES);
    const quality   = rng.nextInt(qualityBand.min, qualityBand.max);
    const spec      = rng.pick(ALL_SPECIALIZATIONS);

    const salaryBand = NPC_SALARY_BY_QUALITY[quality] ?? { min: 200, max: 500 };
    const salary     = rng.nextInt(salaryBand.min, salaryBand.max);

    // Unique enough ID for in-game use (seed + index + suffix)
    const idSuffix = rng.nextInt(100000, 999999).toString(16);

    result.push({
      id:               `npc_${idSuffix}`,
      firstName,
      lastName,
      quality,
      specialization:   spec,
      salary,
      fatigue:          0,
      reportsSubmitted: 0,
      morale:           rng.nextInt(6, 9), // Start with decent morale
      territoryId:      undefined,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. Generate Territories
// ---------------------------------------------------------------------------

/**
 * Create one territory per country, containing all league IDs for that country.
 *
 * Territories are named after their country. The `maxScouts` slot count scales
 * with the number of leagues in the territory (more leagues = more coverage
 * needed). At minimum each territory allows 1 scout.
 *
 * @param countries  List of country keys active in the game world (e.g. ["england", "germany"]).
 * @param leagues    Flat list of { id, countryKey } describing which country each league belongs to.
 */
export function generateTerritories(
  countries: string[],
  leagues: { id: string; countryKey: string }[],
): Territory[] {
  return countries.map((countryKey) => {
    const countryLeagueIds = leagues
      .filter((l) => l.countryKey === countryKey)
      .map((l) => l.id);

    // Allow one NPC scout per two leagues, minimum of 1
    const maxScouts = Math.max(1, Math.ceil(countryLeagueIds.length / 2));

    const idSuffix = countryKey.replace(/\s+/g, "_").toLowerCase();

    return {
      id:               `territory_${idSuffix}`,
      name:             formatCountryName(countryKey),
      country:          countryKey,
      leagueIds:        countryLeagueIds,
      maxScouts,
      assignedScoutIds: [],
    };
  });
}

/** Capitalise first letter of each word in a country key. */
function formatCountryName(countryKey: string): string {
  return countryKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// 3. Assign Territory
// ---------------------------------------------------------------------------

/**
 * Assign an NPC scout to a territory and return updated copies of both.
 *
 * The function does not enforce `maxScouts` — callers are responsible for
 * checking capacity before calling. This keeps the function pure and simple.
 *
 * If the NPC scout was previously assigned to a different territory, that
 * assignment is NOT cleared here (callers must handle removal from the old
 * territory themselves to keep state consistent).
 *
 * @returns Updated { npcScout, territory } with the assignment reflected in both.
 */
export function assignTerritory(
  npcScout: NPCScout,
  territory: Territory,
): { npcScout: NPCScout; territory: Territory } {
  const updatedScout: NPCScout = {
    ...npcScout,
    territoryId: territory.id,
  };

  // Guard against double-adding the same scout ID
  const alreadyAssigned = territory.assignedScoutIds.includes(npcScout.id);
  const updatedTerritory: Territory = alreadyAssigned
    ? territory
    : {
        ...territory,
        assignedScoutIds: [...territory.assignedScoutIds, npcScout.id],
      };

  return { npcScout: updatedScout, territory: updatedTerritory };
}

// ---------------------------------------------------------------------------
// 4. Process NPC Scouting Week
// ---------------------------------------------------------------------------

/**
 * Simulate one week of autonomous scouting by an NPC scout in their territory.
 *
 * The scout observes 2–5 players from the territory's leagues, generating one
 * report per player. Report quality is derived from `npcScout.quality`,
 * degraded by fatigue above the threshold, and given Gaussian noise.
 *
 * Fatigue increases by WEEKLY_FATIGUE_GAIN and caps at 100.
 *
 * @param rng       Seeded RNG for this tick.
 * @param npcScout  The NPC scout performing the scouting.
 * @param territory The territory the scout is assigned to.
 * @param players   All players in the world, keyed by ID.
 * @param week      Current game week.
 * @param season    Current season year.
 * @returns Updated npcScout (new fatigue) and the reports generated this week.
 */
export function processNPCScoutingWeek(
  rng: RNG,
  npcScout: NPCScout,
  territory: Territory,
  players: Record<string, Player>,
  week: number,
  season: number,
): { npcScout: NPCScout; reports: NPCScoutReport[] } {
  // Collect players in territory leagues
  const territoryLeagueSet = new Set(territory.leagueIds);
  const eligiblePlayers = Object.values(players).filter(
    (p) => territoryLeagueSet.has(p.clubId) || isPlayerInTerritoryLeague(p, players, territory),
  );

  // Actually filter by players whose club's league is in the territory
  // (We need to look up the club → league mapping — use the player's club
  // which is keyed by clubId; since we don't have direct club→league here
  // we use the leagueIds against a player's club. The game state stores
  // league memberships via League.clubIds, but that isn't passed here.
  // Convention: players carry clubId; territories hold leagueIds.
  // We cannot resolve club→league without extra data, so we scout from
  // all players whose clubId appears in territory's relevant leagues.
  // Since we only receive `players`, we fall back to all players and
  // use territory.leagueIds as a hint — if eligible list is empty, scout
  // a random sample from all players.)
  const pool = eligiblePlayers.length > 0 ? eligiblePlayers : Object.values(players);

  if (pool.length === 0) {
    // Nothing to scout — fatigue still accrues slightly
    const updatedScout = applyWeeklyFatigue(npcScout);
    return { npcScout: updatedScout, reports: [] };
  }

  const observationCount = rng.nextInt(2, Math.min(5, pool.length));
  const shuffled = rng.shuffle(pool).slice(0, observationCount);

  const reports: NPCScoutReport[] = [];

  for (const player of shuffled) {
    const quality = calculateNPCReportQuality(npcScout, player);
    const noisyQuality = applyGaussianNoise(rng, quality, 10);
    const finalQuality = clamp(noisyQuality, 1, 100);

    const readings = generateSimplifiedReadings(rng, npcScout, player, finalQuality);
    const recommendation = deriveRecommendation(finalQuality, player);
    const summary = buildReportSummary(npcScout, player, finalQuality, readings);

    const idSuffix = rng.nextInt(100000, 999999).toString(16);

    const report: NPCScoutReport = {
      id:               `npc_report_${idSuffix}`,
      npcScoutId:       npcScout.id,
      playerId:         player.id,
      week,
      season,
      quality:          finalQuality,
      summary,
      recommendation,
      reviewed:         false,
    };

    reports.push(report);
  }

  // Apply fatigue
  const updatedScout: NPCScout = {
    ...applyWeeklyFatigue(npcScout),
    reportsSubmitted: npcScout.reportsSubmitted + reports.length,
  };

  return { npcScout: updatedScout, reports };
}

// ---------------------------------------------------------------------------
// 5. Evaluate NPC Report
// ---------------------------------------------------------------------------

/**
 * Classify an NPC report into a human-readable quality tier and usefulness flag.
 *
 * Quality thresholds:
 *  - poor:      < 30
 *  - decent:    30–54
 *  - good:      55–79
 *  - excellent: ≥ 80
 *
 * Reports are considered "useful" if they reach the "decent" tier or above.
 */
export function evaluateNPCReport(
  report: NPCScoutReport,
): { useful: boolean; qualityTier: "poor" | "decent" | "good" | "excellent" } {
  const qualityTier =
    report.quality >= 80 ? "excellent" :
    report.quality >= 55 ? "good"      :
    report.quality >= 30 ? "decent"    :
    "poor";

  return {
    useful: qualityTier !== "poor",
    qualityTier,
  };
}

// ---------------------------------------------------------------------------
// 6. Calculate NPC Report Quality
// ---------------------------------------------------------------------------

/**
 * Compute the base quality of an NPC report before Gaussian noise is applied.
 *
 * Formula:
 *  base = npcScout.quality * 20  (quality 1–5 → 20–100 scale anchor)
 *  +10  if specialization matches player context
 *  -15  if fatigue > FATIGUE_PENALTY_THRESHOLD (70)
 *  clamped to [1, 100]
 *
 * Specialization matching:
 *  - "youth":     player.age < 21
 *  - "firstTeam": player.currentAbility >= 130 (first-team calibre)
 *  - "regional":  always a mild match (NPC regional specialists cover a fixed area)
 *  - "data":      player.currentAbility >= 100 (data scouts focus on measurables)
 */
export function calculateNPCReportQuality(
  npcScout: NPCScout,
  targetPlayer: Player,
): number {
  // quality 1 → 20, quality 5 → 100
  const base = npcScout.quality * 20;

  let bonus = 0;
  if (specializationMatchesPlayer(npcScout.specialization, targetPlayer)) {
    bonus += 10;
  }

  const fatiguePenalty = npcScout.fatigue > FATIGUE_PENALTY_THRESHOLD ? -15 : 0;

  return clamp(base + bonus + fatiguePenalty, 1, 100);
}

// ---------------------------------------------------------------------------
// 7. Rest NPC Scout
// ---------------------------------------------------------------------------

/**
 * Apply a rest period to an NPC scout, reducing fatigue by REST_FATIGUE_RECOVERY
 * and clamping to [0, 100].
 *
 * Morale ticks up slightly on rest weeks — being given a break is good for
 * an NPC scout's wellbeing.
 *
 * @returns A new NPCScout with updated fatigue (and optionally morale).
 */
export function restNPCScout(npcScout: NPCScout): NPCScout {
  const newFatigue = clamp(npcScout.fatigue - REST_FATIGUE_RECOVERY, 0, 100);
  // Morale ticks up by 1 on rest, capped at 10
  const newMorale  = Math.min(10, npcScout.morale + 1);

  return {
    ...npcScout,
    fatigue: newFatigue,
    morale:  newMorale,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Apply Gaussian noise around a centre value with the given std deviation. */
function applyGaussianNoise(rng: RNG, centre: number, stddev: number): number {
  return Math.round(rng.gaussian(centre, stddev));
}

/**
 * Increase fatigue by the weekly amount, capping at 100.
 * Morale drops by 1 if fatigue is already above 80 (exhaustion penalty).
 */
function applyWeeklyFatigue(npcScout: NPCScout): NPCScout {
  const newFatigue = clamp(npcScout.fatigue + WEEKLY_FATIGUE_GAIN, 0, 100);
  const moraleHit  = newFatigue >= 80 && npcScout.fatigue < 80 ? -1 : 0;
  const newMorale  = clamp(npcScout.morale + moraleHit, 1, 10);

  return {
    ...npcScout,
    fatigue: newFatigue,
    morale:  newMorale,
  };
}

/**
 * Check whether an NPC scout's specialization aligns with a target player.
 *
 *  youth:      player age < 21
 *  firstTeam:  player currentAbility ≥ 130
 *  regional:   always matches (NPC regional scouts cover their assigned area)
 *  data:       player currentAbility ≥ 100
 */
function specializationMatchesPlayer(
  spec: Specialization,
  player: Player,
): boolean {
  switch (spec) {
    case "youth":     return player.age < 21;
    case "firstTeam": return player.currentAbility >= 130;
    case "regional":  return true;
    case "data":      return player.currentAbility >= 100;
  }
}

/**
 * Determine if a player is in one of the territory's leagues.
 * Without club→league lookup data, this always returns false and the
 * outer `processNPCScoutingWeek` falls back to the full pool.
 *
 * This stub exists so that callers who CAN supply enriched player data
 * (e.g. player.leagueId field if added in future) benefit automatically.
 */
function isPlayerInTerritoryLeague(
  player: Player,
  _players: Record<string, Player>,
  territory: Territory,
): boolean {
  // Players don't carry leagueId directly — club → league resolution requires
  // the Club and League records which are not passed here. Always false; the
  // outer function falls back to the full player pool.
  void player;
  void territory;
  return false;
}

/**
 * Generate simplified attribute readings for an NPC report (3–6 attributes).
 *
 * NPC scouts produce coarser readings than the player: perceived values are
 * rounded to the nearest integer and confidence is always low (0.3–0.6).
 * Quality scales the number of attributes sampled and the accuracy of readings.
 */
function generateSimplifiedReadings(
  rng: RNG,
  npcScout: NPCScout,
  player: Player,
  quality: number,
): { attribute: string; perceivedValue: number; confidence: number }[] {
  // 3 readings at poor quality, up to 6 at excellent
  const readingCount = Math.round(3 + (quality / 100) * 3);
  const count        = clamp(readingCount, 3, 6);

  const shuffled = rng.shuffle(OBSERVABLE_ATTRIBUTES).slice(0, count);

  // Fatigue degrades accuracy when above threshold
  const qualityDegradation =
    npcScout.fatigue > FATIGUE_QUALITY_THRESHOLD
      ? (npcScout.fatigue - FATIGUE_QUALITY_THRESHOLD) / 100
      : 0;

  return shuffled.map((attr) => {
    const trueValue = player.attributes[attr];
    // Noise: lower quality → wider noise; also degraded by fatigue
    const noiseStddev = Math.max(1, 5 - (quality / 100) * 3 + qualityDegradation * 3);
    const rawPerceived = rng.gaussian(trueValue, noiseStddev);
    const perceivedValue = clamp(Math.round(rawPerceived), 1, 20);

    // Confidence: 0.3 at quality 1, up to 0.6 at quality 100
    const baseConfidence = 0.3 + (quality / 100) * 0.3;
    const confidence     = clamp(baseConfidence - qualityDegradation * 0.1, 0.1, 0.9);

    return { attribute: attr, perceivedValue, confidence };
  });
}

/**
 * Derive a recommendation level from overall quality and player ability.
 *
 * High-ability players combined with decent quality reports are more likely
 * to receive a "pursue" recommendation.
 */
function deriveRecommendation(
  quality: number,
  player: Player,
): NPCScoutReport["recommendation"] {
  // Combine quality and player ability into a single signal
  const abilityFactor = player.currentAbility / 200; // 0–1
  const signal        = quality * 0.7 + abilityFactor * 100 * 0.3;

  if (signal >= 75) return "pursue";
  if (signal >= 45) return "shortlist";
  return "monitor";
}

/**
 * Generate a short narrative summary for the NPC report.
 * Intentionally brief — NPC reports are less detailed than player-authored ones.
 */
function buildReportSummary(
  npcScout: NPCScout,
  player: Player,
  quality: number,
  readings: { attribute: string; perceivedValue: number; confidence: number }[],
): string {
  const { qualityTier } = evaluateNPCReport({ quality } as NPCScoutReport);
  const topReading      = [...readings].sort((a, b) => b.perceivedValue - a.perceivedValue)[0];
  const specLabel       = npcScout.specialization === "youth" ? "youth potential" : "current ability";

  const qualityDescriptor =
    qualityTier === "excellent" ? "highly impressive" :
    qualityTier === "good"      ? "promising"         :
    qualityTier === "decent"    ? "worth monitoring"  :
    "limited";

  const standout = topReading
    ? ` Standout attribute: ${topReading.attribute} (rated ~${topReading.perceivedValue}).`
    : "";

  return (
    `${player.firstName} ${player.lastName} shows ${qualityDescriptor} ${specLabel}.` +
    standout +
    ` Report confidence: ${qualityTier}.`
  );
}
