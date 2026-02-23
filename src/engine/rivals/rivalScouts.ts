/**
 * Rival Scout system — NPC competitors who independently scout players.
 *
 * Rival scouts are autonomous opponent agents that:
 *  - Track players on behalf of their employer clubs
 *  - Discover new targets each week
 *  - Can "poach" discoveries the player has already reported on
 *  - Grow in reputation over time, increasing their threat level
 *
 * Design principles:
 *  - All functions are pure: accept state + RNG in, return new data out.
 *  - No mutation of input objects.
 *  - Rivals are assigned only to clubs the player is NOT employed by.
 *  - High-CA players are preferentially targeted (represents realistic scouting).
 */

import type { RNG } from "@/engine/rng";
import type {
  RivalScout,
  RivalPersonality,
  GameState,
  Scout,
  Specialization,
  Player,
  Club,
} from "@/engine/core/types";

// =============================================================================
// PUBLIC RESULT TYPES
// =============================================================================

export interface RivalWeekResult {
  updatedRivals: Record<string, RivalScout>;
  /** Players the player-scout has reported on that a rival has now also targeted. */
  poachWarnings: { rivalId: string; playerId: string }[];
  /** New player targets a rival discovered this week. */
  discoveries: { rivalId: string; playerId: string }[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Number of rival scouts generated at game start. */
const RIVAL_COUNT_MIN = 3;
const RIVAL_COUNT_MAX = 5;

/** Quality range (1–5). Weighted toward 2–4, extremes rare. */
const QUALITY_WEIGHTS: ReadonlyArray<{ item: number; weight: number }> = [
  { item: 2, weight: 20 },
  { item: 3, weight: 40 },
  { item: 4, weight: 30 },
  { item: 5, weight: 10 },
];

/** Starting reputation range (0–100). */
const REPUTATION_MIN = 30;
const REPUTATION_MAX = 60;

/** Number of initial target players per rival. */
const INITIAL_TARGETS_MIN = 2;
const INITIAL_TARGETS_MAX = 4;

/** Maximum concurrent target players a rival tracks. */
const MAX_TARGET_PLAYERS = 8;

/** Weekly probability a rival discovers a new player. */
const DISCOVERY_CHANCE = 0.2;

/** Weekly probability a rival poaches a player the scout has reported on. */
const POACH_CHANCE = 0.1;

/** Reputation gain range per week (0–2). */
const REP_GAIN_MIN = 0;
const REP_GAIN_MAX = 2;

/**
 * CA threshold for "high CA" targets.
 * Rivals preferentially target players above this threshold.
 */
const HIGH_CA_THRESHOLD = 100;

const ALL_SPECIALIZATIONS: readonly Specialization[] = [
  "youth",
  "firstTeam",
  "regional",
  "data",
] as const;

const ALL_PERSONALITIES: readonly RivalPersonality[] = [
  "aggressive",
  "methodical",
  "connected",
  "lucky",
] as const;

/**
 * First-name pool. Broadly international — rivals come from every footballing
 * culture, so the pool mirrors the NPC scout first-name roster.
 */
const FIRST_NAMES = [
  "Marco", "Luca", "Diego", "João", "Alejandro", "Rafaël", "Tomáš",
  "Sven", "Patrick", "Henrik", "Mihail", "Andrei", "Kwame", "Ibrahima",
  "Carlos", "Takashi", "Yusuf", "Ander", "Florian", "Matteo", "Emeka",
  "Stefan", "Viktor", "Ezra", "Rúben", "Lars", "Tariq", "Noel", "Björn",
  "James", "Michael", "David", "Robert", "William", "Thomas", "Daniel",
] as const;

const LAST_NAMES = [
  "Santos", "Müller", "García", "Novák", "Andersen", "Okonkwo", "Ramos",
  "Eriksen", "Petrov", "López", "Kone", "Bauer", "Tanaka", "Öztürk",
  "Fernández", "Johansson", "Diallo", "Krejčí", "Reyes", "Svensson",
  "Adeyemi", "Hoffmann", "Nascimento", "Lindström", "Mbeki", "Watanabe",
  "Costa", "Kristiansen", "Yilmaz", "Papadopoulos", "Fletcher", "Morrison",
  "Hughes", "Wallace", "Reid", "Shaw", "Walsh", "Burton",
] as const;

// =============================================================================
// 1. Generate Rival Scouts
// =============================================================================

/**
 * Generate 3–5 NPC rival scouts at game start.
 *
 * Each rival is assigned to a club the player is NOT currently employed by.
 * If the player has no current club (freelance), all clubs are eligible.
 * Each rival receives 2–4 initial targets drawn from high-CA players whose
 * club's league overlaps the rival's employer club.
 *
 * @param rng   Seeded RNG for deterministic generation.
 * @param state Current game state (used for clubs, players, scout).
 * @returns     New rivals keyed by rival ID.
 */
export function generateRivalScouts(
  rng: RNG,
  state: GameState,
): Record<string, RivalScout> {
  const count = rng.nextInt(RIVAL_COUNT_MIN, RIVAL_COUNT_MAX);
  const playerClubId = state.scout.currentClubId;

  // Build pool of clubs the player is NOT at
  const eligibleClubs: Club[] = Object.values(state.clubs).filter(
    (club) => club.id !== playerClubId,
  );

  if (eligibleClubs.length === 0) {
    // Degenerate: only one club in the world — generate rivals with no club
    // assignment. This should not occur in normal gameplay.
    return {};
  }

  const rivals: Record<string, RivalScout> = {};
  const rivalIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const idSuffix = rng.nextInt(100_000, 999_999).toString(16);
    const id = `rival_${idSuffix}`;

    const firstName  = rng.pick(FIRST_NAMES);
    const lastName   = rng.pick(LAST_NAMES);
    const quality    = rng.pickWeighted(QUALITY_WEIGHTS);
    const spec       = rng.pick(ALL_SPECIALIZATIONS);
    const club       = rng.pick(eligibleClubs);
    const reputation = rng.nextInt(REPUTATION_MIN, REPUTATION_MAX);
    const personality = rng.pick(ALL_PERSONALITIES);

    const initialTargets = pickInitialTargets(rng, club, state);

    rivals[id] = {
      id,
      name: `${firstName} ${lastName}`,
      quality,
      specialization: spec,
      clubId: club.id,
      targetPlayerIds: initialTargets,
      reputation,
      personality,
      isNemesis: false,
      competingForPlayers: [],
    };
    rivalIds.push(id);
  }

  // Mark the highest-quality (or highest-rep on tie) rival as the nemesis
  if (rivalIds.length > 0) {
    let nemesisId = rivalIds[0]!;
    for (const id of rivalIds) {
      const r = rivals[id]!;
      const n = rivals[nemesisId]!;
      if (
        r.quality > n.quality ||
        (r.quality === n.quality && r.reputation > n.reputation)
      ) {
        nemesisId = id;
      }
    }
    rivals[nemesisId] = { ...rivals[nemesisId]!, isNemesis: true };
  }

  return rivals;
}

// =============================================================================
// 2. Process Rival Week
// =============================================================================

/**
 * Simulate one week of activity across all rival scouts.
 *
 * For each rival:
 *  - 20% chance to discover a new player (appended to targetPlayerIds, max 8).
 *  - 10% chance to generate a poach warning for a player the scout has already
 *    reported on, IF that player overlaps with the rival's targets.
 *  - Gain 0–2 reputation points (clamped to 100).
 *
 * The poach chance is applied independently per rival. When triggered, the
 * rival is checked against the scout's reported player IDs. A warning is only
 * generated if the rival actually has a shared player in scope — otherwise the
 * dice roll is wasted. This keeps poach warnings meaningful.
 *
 * @param rng    Seeded RNG for this tick.
 * @param rivals Current rivals map.
 * @param state  Current game state.
 * @returns      Updated rivals, new poach warnings, and new discoveries.
 */
export function processRivalWeek(
  rng: RNG,
  rivals: Record<string, RivalScout>,
  state: GameState,
): RivalWeekResult {
  const updatedRivals: Record<string, RivalScout> = {};
  const poachWarnings: { rivalId: string; playerId: string }[] = [];
  const discoveries: { rivalId: string; playerId: string }[] = [];

  // Build the set of player IDs the scout has reported on (for poach logic)
  const reportedPlayerIds = new Set<string>(
    Object.values(state.reports).map((r) => r.playerId),
  );

  for (const rival of Object.values(rivals)) {
    let updatedRival = rival;

    // --- Discovery ---
    if (rng.chance(DISCOVERY_CHANCE)) {
      const newTarget = discoverNewTarget(rng, rival, state);
      if (newTarget !== null) {
        const alreadyTracking = rival.targetPlayerIds.includes(newTarget);
        if (
          !alreadyTracking &&
          rival.targetPlayerIds.length < MAX_TARGET_PLAYERS
        ) {
          updatedRival = {
            ...updatedRival,
            targetPlayerIds: [...updatedRival.targetPlayerIds, newTarget],
          };
          discoveries.push({ rivalId: rival.id, playerId: newTarget });
        }
      }
    }

    // --- Update competing players (shared targets) ---
    const competingForPlayers = updatedRival.targetPlayerIds.filter((pid) =>
      reportedPlayerIds.has(pid),
    );
    updatedRival = { ...updatedRival, competingForPlayers };

    // --- Poach check ---
    if (rng.chance(POACH_CHANCE)) {
      if (competingForPlayers.length > 0) {
        const targetId = rng.pick(competingForPlayers);
        poachWarnings.push({ rivalId: rival.id, playerId: targetId });
      }
    }

    // --- Reputation gain ---
    const repGain = rng.nextInt(REP_GAIN_MIN, REP_GAIN_MAX);
    updatedRival = {
      ...updatedRival,
      reputation: clamp(updatedRival.reputation + repGain, 0, 100),
    };

    updatedRivals[rival.id] = updatedRival;
  }

  return { updatedRivals, poachWarnings, discoveries };
}

// =============================================================================
// 3. Threat Level
// =============================================================================

/**
 * Compare a rival's quality and reputation against the player scout's.
 *
 * Threat matrix:
 *
 * | Score delta (rival − scout)      | Threat  |
 * |----------------------------------|---------|
 * | > +10                            | high    |
 * | +10 to −10                       | medium  |
 * | < −10                            | low     |
 *
 * The combined score gives equal weight to quality (scaled to 0–100) and
 * raw reputation (0–100), so a weaker but highly reputable rival can still
 * pose a medium threat.
 *
 * @param rival  The rival scout to evaluate.
 * @param scout  The player-controlled scout.
 * @returns      "low" | "medium" | "high"
 */
export function getRivalThreatLevel(
  rival: RivalScout,
  scout: Scout,
): "low" | "medium" | "high" {
  // Normalise quality (1–5) to a 0–100 scale matching reputation.
  const rivalScore  = (rival.quality - 1) * 25 + rival.reputation;   // 0–200
  const scoutQuality = deriveScoutQuality(scout);
  const scoutScore   = scoutQuality * 25 + scout.reputation;          // 0–200

  const delta = rivalScore - scoutScore;

  if (delta > 10)  return "high";
  if (delta < -10) return "low";
  return "medium";
}

// =============================================================================
// 4. Shared Targets
// =============================================================================

/**
 * Return player IDs that both a rival and the player scout have in scope.
 *
 * A player is considered "in scope" for the scout if they appear in any
 * observation OR any submitted report. For the rival, their targetPlayerIds
 * list is the source of truth.
 *
 * @param rival  The rival scout to compare against.
 * @param state  Current game state (contains scout's observations and reports).
 * @returns      Array of shared player IDs (may be empty).
 */
export function getSharedTargets(
  rival: RivalScout,
  state: GameState,
): string[] {
  // Build the set of players the scout has interacted with
  const scoutPlayerIds = new Set<string>();

  for (const obs of Object.values(state.observations)) {
    scoutPlayerIds.add(obs.playerId);
  }
  for (const report of Object.values(state.reports)) {
    scoutPlayerIds.add(report.playerId);
  }

  return rival.targetPlayerIds.filter((pid) => scoutPlayerIds.has(pid));
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derive an approximate quality tier (1–5 scale) for the player scout.
 *
 * Uses the average of the scout's skills on the 1–20 scale, mapped to 1–5.
 * This lets getRivalThreatLevel compare apples to apples.
 */
function deriveScoutQuality(scout: Scout): number {
  const skills = Object.values(scout.skills) as number[];
  if (skills.length === 0) return 1;
  const avg = skills.reduce((sum, v) => sum + v, 0) / skills.length;
  // avg is on 1–20; map linearly to 1–5
  return clamp(Math.round(1 + ((avg - 1) / 19) * 4), 1, 5);
}

/**
 * Pick initial target players for a newly created rival.
 *
 * Strategy:
 *  1. Gather all players in the same league as the rival's club.
 *  2. Sort by currentAbility descending so high-CA players are preferred.
 *  3. Shuffle the top half of that sorted list and pick 2–4 from it.
 *     If fewer candidates exist than needed, take as many as available.
 *
 * Falls back to any players in the world if the league lookup yields nothing.
 */
function pickInitialTargets(
  rng: RNG,
  club: Club,
  state: GameState,
): string[] {
  const count = rng.nextInt(INITIAL_TARGETS_MIN, INITIAL_TARGETS_MAX);

  // Resolve the rival club's leagueId
  const rivalLeagueId = club.leagueId;

  // Collect players in that league (any club)
  let candidates: Player[];

  if (rivalLeagueId) {
    const league = state.leagues[rivalLeagueId];
    if (league) {
      const leagueClubIds = new Set(league.clubIds);
      candidates = Object.values(state.players).filter(
        (p) => leagueClubIds.has(p.clubId),
      );
    } else {
      candidates = Object.values(state.players);
    }
  } else {
    candidates = Object.values(state.players);
  }

  if (candidates.length === 0) return [];

  // Sort by CA descending, then take the top half as the "scoutable" pool
  const sorted = [...candidates].sort(
    (a, b) => b.currentAbility - a.currentAbility,
  );
  const topHalfCount = Math.max(count, Math.ceil(sorted.length / 2));
  const topPool = sorted.slice(0, topHalfCount).filter(
    (p) => p.currentAbility >= HIGH_CA_THRESHOLD,
  );

  // Fall back to the full sorted list if the high-CA pool is too small
  const pool = topPool.length >= count ? topPool : sorted;

  const shuffled = rng.shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((p) => p.id);
}

/**
 * Pick one new player target for a rival to "discover".
 *
 * Prefers players NOT already in the rival's target list.
 * Biases toward high-CA players in the rival's club's league.
 * Returns null if no new candidates are available.
 */
function discoverNewTarget(
  rng: RNG,
  rival: RivalScout,
  state: GameState,
): string | null {
  const existingSet = new Set(rival.targetPlayerIds);

  // Resolve league
  const club = state.clubs[rival.clubId];
  const leagueId = club?.leagueId;
  const league = leagueId ? state.leagues[leagueId] : undefined;

  let candidates: Player[];
  if (league) {
    const clubIds = new Set(league.clubIds);
    candidates = Object.values(state.players).filter(
      (p) => clubIds.has(p.clubId) && !existingSet.has(p.id),
    );
  } else {
    candidates = Object.values(state.players).filter(
      (p) => !existingSet.has(p.id),
    );
  }

  if (candidates.length === 0) return null;

  // Weighted pick: high-CA players are 3× more likely to be discovered
  const weighted = candidates.map((p) => ({
    item: p.id,
    weight: p.currentAbility >= HIGH_CA_THRESHOLD ? 3 : 1,
  }));

  return rng.pickWeighted(weighted);
}
