/**
 * Rival Scout system — NPC competitors who independently scout players.
 *
 * Rival scouts are autonomous opponent agents that:
 *  - Track players on behalf of their employer clubs
 *  - Discover new targets each week
 *  - Can "poach" discoveries the player has already reported on
 *  - Grow in reputation over time, increasing their threat level
 *  - (F8) Actively scout targets with progress tracking, attend matches,
 *    submit reports, and compete for signings
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
  RivalActivity,
  GameState,
  Scout,
  Specialization,
  Player,
  Club,
  Contact,
  InboxMessage,
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

/** Enhanced result from processRivalScoutWeek (F8). */
export interface RivalScoutWeekResult {
  updatedRivals: Record<string, RivalScout>;
  /** Poach warnings (same as RivalWeekResult). */
  poachWarnings: { rivalId: string; playerId: string }[];
  /** New discoveries (same as RivalWeekResult). */
  discoveries: { rivalId: string; playerId: string }[];
  /** New rival activities generated this week. */
  newActivities: RivalActivity[];
  /** Inbox messages about rival activity. */
  newMessages: InboxMessage[];
  /** Player IDs that rivals have completed scouting and signed (lost opportunities). */
  lostPlayerIds: string[];
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

/** Scouting observations required to complete a report (min/max). */
const SCOUTING_PROGRESS_MIN = 2;
const SCOUTING_PROGRESS_MAX = 4;

/** Progress needed to complete scouting on a target (observations required). */
const SCOUTING_COMPLETION_THRESHOLD = 5;

/** Probability that a completed rival report results in a signing (player lost). */
const SIGNING_CHANCE = 0.25;

/** Maximum rival activities to keep in history. */
const MAX_ACTIVITY_HISTORY = 50;

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
  "Marco", "Luca", "Diego", "Jo\u00e3o", "Alejandro", "Rafa\u00ebl", "Tom\u00e1\u0161",
  "Sven", "Patrick", "Henrik", "Mihail", "Andrei", "Kwame", "Ibrahima",
  "Carlos", "Takashi", "Yusuf", "Ander", "Florian", "Matteo", "Emeka",
  "Stefan", "Viktor", "Ezra", "R\u00faben", "Lars", "Tariq", "Noel", "Bj\u00f6rn",
  "James", "Michael", "David", "Robert", "William", "Thomas", "Daniel",
] as const;

const LAST_NAMES = [
  "Santos", "M\u00fcller", "Garc\u00eda", "Nov\u00e1k", "Andersen", "Okonkwo", "Ramos",
  "Eriksen", "Petrov", "L\u00f3pez", "Kone", "Bauer", "Tanaka", "\u00d6zt\u00fcrk",
  "Fern\u00e1ndez", "Johansson", "Diallo", "Krej\u010d\u00ed", "Reyes", "Svensson",
  "Adeyemi", "Hoffmann", "Nascimento", "Lindstr\u00f6m", "Mbeki", "Watanabe",
  "Costa", "Kristiansen", "Yilmaz", "Papadopoulos", "Fletcher", "Morrison",
  "Hughes", "Wallace", "Reid", "Shaw", "Walsh", "Burton",
] as const;

// =============================================================================
// 1. Generate Rival Scouts
// =============================================================================

/**
 * Generate 3-5 NPC rival scouts at game start.
 *
 * Each rival is assigned to a club the player is NOT currently employed by.
 * If the player has no current club (freelance), all clubs are eligible.
 * Each rival receives 2-4 initial targets drawn from high-CA players whose
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

    // Derive aggressiveness and budgetTier from personality and club
    const aggressiveness = deriveAggressiveness(rng, personality);
    const budgetTier = deriveBudgetTier(club, state);

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
      scoutingProgress: {},
      aggressiveness,
      budgetTier,
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
// 2. Process Rival Week (legacy — kept for backward compatibility)
// =============================================================================

/**
 * Simulate one week of activity across all rival scouts.
 *
 * For each rival:
 *  - 20% chance to discover a new player (appended to targetPlayerIds, max 8).
 *  - 10% chance to generate a poach warning for a player the scout has already
 *    reported on, IF that player overlaps with the rival's targets.
 *  - Gain 0-2 reputation points (clamped to 100).
 *
 * The poach chance is applied independently per rival. When triggered, the
 * rival is checked against the scout's reported player IDs. A warning is only
 * generated if the rival actually has a shared player in scope --- otherwise the
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
// 2b. Process Rival Scout Week — Enhanced F8 version
// =============================================================================

/**
 * Enhanced weekly rival AI that includes scouting progress, report submission,
 * match attendance, contact intelligence, and player loss mechanics.
 *
 * This replaces processRivalWeek as the primary weekly tick for rivals when
 * F8 is active.
 *
 * @param rng   Seeded RNG for this tick.
 * @param state Current game state.
 * @returns     Complete weekly result with updated rivals, activities, messages.
 */
export function processRivalScoutWeek(
  rng: RNG,
  state: GameState,
): RivalScoutWeekResult {
  const updatedRivals: Record<string, RivalScout> = {};
  const poachWarnings: { rivalId: string; playerId: string }[] = [];
  const discoveries: { rivalId: string; playerId: string }[] = [];
  const newActivities: RivalActivity[] = [];
  const newMessages: InboxMessage[] = [];
  const lostPlayerIds: string[] = [];

  // Build the set of player IDs the scout has reported on (for poach logic)
  const reportedPlayerIds = new Set<string>(
    Object.values(state.reports).map((r) => r.playerId),
  );

  // Get this week's fixtures for match attendance logic
  // Note: Fixture type has no season field — fixtures are regenerated each
  // season, so filtering by week alone is sufficient.
  const weekFixtures = Object.values(state.fixtures).filter(
    (f) => f.week === state.currentWeek,
  );

  for (const rival of Object.values(state.rivalScouts)) {
    let updatedRival: RivalScout = {
      ...rival,
      // Ensure new F8 fields exist (migration safety)
      scoutingProgress: rival.scoutingProgress ?? {},
      aggressiveness: rival.aggressiveness ?? deriveAggressiveness(rng, rival.personality),
      budgetTier: rival.budgetTier ?? "medium",
    };

    // --- 1. Target selection based on personality ---
    if (!updatedRival.currentTarget || !state.players[updatedRival.currentTarget]) {
      const newTarget = selectTargetByPersonality(rng, updatedRival, state);
      if (newTarget) {
        updatedRival = { ...updatedRival, currentTarget: newTarget };
        // Set report deadline: 2-4 weeks from now based on aggressiveness
        const deadlineWeeks = Math.round(
          SCOUTING_PROGRESS_MIN + (1 - updatedRival.aggressiveness) *
            (SCOUTING_PROGRESS_MAX - SCOUTING_PROGRESS_MIN),
        );
        updatedRival = {
          ...updatedRival,
          reportDeadline: state.currentWeek + deadlineWeeks,
        };
        newActivities.push({
          rivalId: rival.id,
          type: "targetAcquired",
          playerId: newTarget,
          week: state.currentWeek,
          season: state.currentSeason,
        });
      }
    }

    // --- 2. Attend matches where current target plays ---
    if (updatedRival.currentTarget) {
      const targetPlayer = state.players[updatedRival.currentTarget];
      if (targetPlayer) {
        const targetFixture = weekFixtures.find(
          (f) =>
            f.homeClubId === targetPlayer.clubId ||
            f.awayClubId === targetPlayer.clubId,
        );
        if (targetFixture) {
          updatedRival = {
            ...updatedRival,
            lastSeenAtFixture: targetFixture.id,
          };
          newActivities.push({
            rivalId: rival.id,
            type: "spotted",
            playerId: updatedRival.currentTarget,
            fixtureId: targetFixture.id,
            week: state.currentWeek,
            season: state.currentSeason,
          });

          // --- 3. Build scouting progress ---
          const targetId = updatedRival.currentTarget;
          const currentProgress =
            targetId ? (updatedRival.scoutingProgress[targetId] ?? 0) : 0;
          // Progress increment: quality affects observation quality (1-2 per visit)
          const progressIncrement = updatedRival.quality >= 4 ? 2 : 1;
          const newProgress = Math.min(
            currentProgress + progressIncrement,
            SCOUTING_COMPLETION_THRESHOLD,
          );
          updatedRival = {
            ...updatedRival,
            scoutingProgress: {
              ...updatedRival.scoutingProgress,
              ...(targetId ? { [targetId]: newProgress } : {}),
            },
          };
        }
      }
    }

    // --- 4. Check for report submission (deadline reached or progress complete) ---
    if (updatedRival.currentTarget) {
      const progress =
        updatedRival.scoutingProgress[updatedRival.currentTarget] ?? 0;
      const deadlineReached =
        updatedRival.reportDeadline !== undefined &&
        state.currentWeek >= updatedRival.reportDeadline;
      const progressComplete = progress >= SCOUTING_COMPLETION_THRESHOLD;

      if (deadlineReached || progressComplete) {
        // Rival submits report
        newActivities.push({
          rivalId: rival.id,
          type: "reportSubmitted",
          playerId: updatedRival.currentTarget,
          week: state.currentWeek,
          season: state.currentSeason,
        });

        const targetPlayer = state.players[updatedRival.currentTarget];
        const playerName = targetPlayer
          ? `${targetPlayer.firstName} ${targetPlayer.lastName}`
          : "a player";

        newMessages.push({
          id: `rival-report-${rival.id}-${updatedRival.currentTarget}-w${state.currentWeek}`,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: "Rival Report Submitted",
          body: `${rival.name} has submitted a scouting report on ${playerName} to ${getClubName(rival.clubId, state)}. They may move to sign the player.`,
          read: false,
          actionRequired: false,
          relatedId: updatedRival.currentTarget,
          relatedEntityType: "player",
        });

        // --- 5. Chance the rival's club signs the player (player lost) ---
        const signingChance = computeSigningChance(updatedRival, progress);
        if (rng.chance(signingChance)) {
          lostPlayerIds.push(updatedRival.currentTarget);
          newActivities.push({
            rivalId: rival.id,
            type: "playerSigned",
            playerId: updatedRival.currentTarget,
            week: state.currentWeek,
            season: state.currentSeason,
          });

          newMessages.push({
            id: `rival-signed-${rival.id}-${updatedRival.currentTarget}-w${state.currentWeek}`,
            week: state.currentWeek,
            season: state.currentSeason,
            type: "event",
            title: "Player Signed by Rival",
            body: `${getClubName(rival.clubId, state)} has signed ${playerName} following ${rival.name}'s recommendation. This opportunity is no longer available.`,
            read: false,
            actionRequired: false,
            relatedId: updatedRival.currentTarget,
            relatedEntityType: "player",
          });

          // Remove the signed player from target list
          updatedRival = {
            ...updatedRival,
            targetPlayerIds: updatedRival.targetPlayerIds.filter(
              (id) => id !== updatedRival.currentTarget,
            ),
          };
        }

        // Clear current target and deadline after report submission
        updatedRival = {
          ...updatedRival,
          currentTarget: undefined,
          reportDeadline: undefined,
        };
      }
    }

    // --- 6. Discovery (same as legacy) ---
    if (rng.chance(DISCOVERY_CHANCE)) {
      const newTarget = discoverNewTarget(rng, updatedRival, state);
      if (newTarget !== null) {
        const alreadyTracking = updatedRival.targetPlayerIds.includes(newTarget);
        if (
          !alreadyTracking &&
          updatedRival.targetPlayerIds.length < MAX_TARGET_PLAYERS
        ) {
          updatedRival = {
            ...updatedRival,
            targetPlayerIds: [...updatedRival.targetPlayerIds, newTarget],
          };
          discoveries.push({ rivalId: rival.id, playerId: newTarget });
        }
      }
    }

    // --- 7. Update competing players (shared targets) ---
    const competingForPlayers = updatedRival.targetPlayerIds.filter((pid) =>
      reportedPlayerIds.has(pid),
    );
    updatedRival = { ...updatedRival, competingForPlayers };

    // --- 8. Poach check ---
    if (rng.chance(POACH_CHANCE)) {
      if (competingForPlayers.length > 0) {
        const targetId = rng.pick(competingForPlayers);
        poachWarnings.push({ rivalId: rival.id, playerId: targetId });
      }
    }

    // --- 9. Reputation gain ---
    const repGain = rng.nextInt(REP_GAIN_MIN, REP_GAIN_MAX);
    updatedRival = {
      ...updatedRival,
      reputation: clamp(updatedRival.reputation + repGain, 0, 100),
    };

    updatedRivals[rival.id] = updatedRival;
  }

  return {
    updatedRivals,
    poachWarnings,
    discoveries,
    newActivities,
    newMessages,
    lostPlayerIds,
  };
}

// =============================================================================
// 3. Threat Level
// =============================================================================

/**
 * Compare a rival's quality and reputation against the player scout's.
 *
 * Threat matrix:
 *
 * | Score delta (rival - scout)      | Threat  |
 * |----------------------------------|---------|
 * | > +10                            | high    |
 * | +10 to -10                       | medium  |
 * | < -10                            | low     |
 *
 * The combined score gives equal weight to quality (scaled to 0-100) and
 * raw reputation (0-100), so a weaker but highly reputable rival can still
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
  // Normalise quality (1-5) to a 0-100 scale matching reputation.
  const rivalScore  = (rival.quality - 1) * 25 + rival.reputation;   // 0-200
  const scoutQuality = deriveScoutQuality(scout);
  const scoutScore   = scoutQuality * 25 + scout.reputation;          // 0-200

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
// 5. Check Rival Presence (F8)
// =============================================================================

/**
 * Returns rival scouts who are attending the same fixture as the player.
 *
 * A rival is considered "present" at a fixture if their lastSeenAtFixture
 * matches the given fixtureId (set during processRivalScoutWeek when the
 * rival's current target plays in that fixture).
 *
 * @param state     Current game state.
 * @param fixtureId The fixture to check for rival presence.
 * @returns         Array of rival scouts present at the fixture.
 */
export function checkRivalPresence(
  state: GameState,
  fixtureId: string,
): RivalScout[] {
  return Object.values(state.rivalScouts).filter(
    (rival) => rival.lastSeenAtFixture === fixtureId,
  );
}

// =============================================================================
// 6. Generate Rival Intelligence (F8)
// =============================================================================

/**
 * Contact intelligence about rival movements.
 *
 * High-relationship contacts may share tips about what rivals are doing.
 * This generates inbox messages when contacts have intel about rival targets
 * that overlap with the player's interests.
 *
 * @param rng      Seeded RNG.
 * @param state    Current game state.
 * @param contacts The player's contacts.
 * @returns        Inbox messages about rival movements.
 */
export function generateRivalIntelligence(
  rng: RNG,
  state: GameState,
  contacts: Record<string, Contact>,
): InboxMessage[] {
  const messages: InboxMessage[] = [];

  // Only contacts with relationship >= 50 share rival intel
  const helpfulContacts = Object.values(contacts).filter(
    (c) => c.relationship >= 50,
  );

  if (helpfulContacts.length === 0) return messages;

  // 15% chance per helpful contact to share intel each week
  for (const contact of helpfulContacts) {
    if (!rng.chance(0.15)) continue;

    // Find a rival who is actively scouting a player the scout cares about
    const activeRivals = Object.values(state.rivalScouts).filter(
      (r) => r.currentTarget !== undefined,
    );

    if (activeRivals.length === 0) continue;

    const rival = rng.pick(activeRivals);
    if (!rival.currentTarget) continue;

    const targetPlayer = state.players[rival.currentTarget];
    if (!targetPlayer) continue;

    const playerName = `${targetPlayer.firstName} ${targetPlayer.lastName}`;

    messages.push({
      id: `contact-intel-${contact.id}-${rival.id}-w${state.currentWeek}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: "Contact Intelligence",
      body: `${contact.name} tells you that ${rival.name} (${getClubName(rival.clubId, state)}) has been scouting ${playerName}. They seem ${rival.aggressiveness > 0.6 ? "very keen" : "interested"}.`,
      read: false,
      actionRequired: false,
      relatedId: rival.currentTarget,
      relatedEntityType: "player",
    });

    // Only one intel message per week to avoid spam
    break;
  }

  return messages;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derive an approximate quality tier (1-5 scale) for the player scout.
 *
 * Uses the average of the scout's skills on the 1-20 scale, mapped to 1-5.
 * This lets getRivalThreatLevel compare apples to apples.
 */
function deriveScoutQuality(scout: Scout): number {
  const skills = Object.values(scout.skills) as number[];
  if (skills.length === 0) return 1;
  const avg = skills.reduce((sum, v) => sum + v, 0) / skills.length;
  // avg is on 1-20; map linearly to 1-5
  return clamp(Math.round(1 + ((avg - 1) / 19) * 4), 1, 5);
}

/**
 * Derive aggressiveness (0-1) from personality and a bit of random variance.
 */
function deriveAggressiveness(rng: RNG, personality: RivalPersonality): number {
  const base: Record<RivalPersonality, number> = {
    aggressive: 0.8,
    methodical: 0.3,
    connected: 0.5,
    lucky: 0.6,
  };
  // Add +-0.1 random variance
  const variance = (rng.nextInt(0, 20) - 10) / 100;
  return clamp(base[personality] + variance, 0, 1);
}

/**
 * Derive budget tier from the club's budget relative to other clubs.
 */
function deriveBudgetTier(
  club: Club,
  state: GameState,
): "low" | "medium" | "high" {
  const allBudgets = Object.values(state.clubs).map((c) => c.budget);
  if (allBudgets.length === 0) return "medium";

  const sorted = [...allBudgets].sort((a, b) => a - b);
  const idx = sorted.indexOf(club.budget);
  const percentile = idx / Math.max(1, sorted.length - 1);

  if (percentile >= 0.66) return "high";
  if (percentile >= 0.33) return "medium";
  return "low";
}

/**
 * Select a target player based on the rival's personality archetype.
 *
 * - aggressive: targets highest currentAbility players
 * - methodical: targets best value (high PA relative to CA, balanced profile)
 * - connected: targets high-CA players (similar to aggressive but with diversity)
 * - lucky: targets low CA / high PA players (hidden gems)
 */
function selectTargetByPersonality(
  rng: RNG,
  rival: RivalScout,
  state: GameState,
): string | undefined {
  const targets = rival.targetPlayerIds;
  if (targets.length === 0) return undefined;

  // Filter to players that exist and haven't been fully scouted yet
  const available = targets.filter((pid) => {
    const player = state.players[pid];
    if (!player) return false;
    const progress = rival.scoutingProgress[pid] ?? 0;
    return progress < SCOUTING_COMPLETION_THRESHOLD;
  });

  if (available.length === 0) return undefined;

  switch (rival.personality) {
    case "aggressive": {
      // Target highest CA player
      const sorted = available
        .map((pid) => ({ pid, ca: state.players[pid]?.currentAbility ?? 0 }))
        .sort((a, b) => b.ca - a.ca);
      return sorted[0]?.pid;
    }
    case "methodical": {
      // Target best value: highest PA-CA delta
      const sorted = available
        .map((pid) => {
          const p = state.players[pid];
          return {
            pid,
            value: p ? p.potentialAbility - p.currentAbility : 0,
          };
        })
        .sort((a, b) => b.value - a.value);
      return sorted[0]?.pid;
    }
    case "lucky": {
      // Target hidden gems: low CA but high PA
      const sorted = available
        .map((pid) => {
          const p = state.players[pid];
          if (!p) return { pid, score: 0 };
          // Favor low CA + high PA
          const score = p.potentialAbility - p.currentAbility * 1.5;
          return { pid, score };
        })
        .sort((a, b) => b.score - a.score);
      return sorted[0]?.pid;
    }
    case "connected":
    default: {
      // Random pick weighted by CA
      const weighted = available.map((pid) => ({
        item: pid,
        weight: Math.max(1, state.players[pid]?.currentAbility ?? 50),
      }));
      return rng.pickWeighted(weighted);
    }
  }
}

/**
 * Compute the probability that a rival's completed report leads to a signing.
 * Higher progress and higher-quality rivals sign more often.
 */
function computeSigningChance(rival: RivalScout, progress: number): number {
  const qualityBonus = (rival.quality - 1) * 0.05; // 0 to 0.2
  const progressBonus =
    (progress / SCOUTING_COMPLETION_THRESHOLD) * 0.1; // 0 to 0.1
  return clamp(SIGNING_CHANCE + qualityBonus + progressBonus, 0, 0.6);
}

/** Helper to get a club name from state. */
function getClubName(clubId: string, state: GameState): string {
  return state.clubs[clubId]?.name ?? "Unknown Club";
}

/**
 * Pick initial target players for a newly created rival.
 *
 * Strategy:
 *  1. Gather all players in the same league as the rival's club.
 *  2. Sort by currentAbility descending so high-CA players are preferred.
 *  3. Shuffle the top half of that sorted list and pick 2-4 from it.
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

  // Weighted pick: high-CA players are 3x more likely to be discovered
  const weighted = candidates.map((p) => ({
    item: p.id,
    weight: p.currentAbility >= HIGH_CA_THRESHOLD ? 3 : 1,
  }));

  return rng.pickWeighted(weighted);
}
