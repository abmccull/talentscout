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
 *  - Rivals act on public signals and their own fallible evidence, never raw CA/PA.
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
  PlayerMovementEvent,
} from "@/engine/core/types";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import {
  addGameWeeks,
  getSeasonLength,
  isGameDateAtOrAfter,
  normalizeGameWeek,
} from "@/engine/core/gameDate";
import {
  getDifficultyChallengeProfile,
  getDifficultyModifiers,
} from "@/engine/core/difficulty";
import {
  resolvePlayerMovements,
  type LifecycleWorldState,
} from "@/engine/world/playerLifecycle";
import {
  getRivalPlayerEvidence,
  getRivalShortlistCapacity,
  isRivalTargetEligible,
  observePlayerForRival,
  scoreRivalTargetCandidate,
} from "./rivalEvidence";

// =============================================================================
// PUBLIC RESULT TYPES
// =============================================================================

/**
 * Result of resolving a poach counter-bid.
 */
export interface PoachBidResult {
  /** Whether a valid, affordable bid was actually submitted. */
  attempted: boolean;
  /** Whether the counter-bid succeeded. */
  success: boolean;
  /** Cost of the counter-bid (150% of market value). */
  cost: number;
  /** Reputation change for the scout. */
  reputationChange: number;
  /** Updated rival with adjusted rivalry stats. */
  updatedRival: RivalScout;
  /** Honest explanation when no bid or player movement could be completed. */
  rejectionReason?: string;
  /** Authoritative lifecycle state after a successful move. */
  lifecycle: LifecycleWorldState;
  /** Movement written by the lifecycle resolver on success. */
  movement?: PlayerMovementEvent;
}

export interface RivalSimulationModifiers {
  discoveryChanceMultiplier?: number;
  poachChanceMultiplier?: number;
  signingChanceMultiplier?: number;
  /**
   * Optional contextual pressure supplied by the world simulation. This keeps
   * regional conditions attached to the rival or player they actually affect
   * instead of flattening every market into one global multiplier.
   */
  contextualPressureMultiplier?: (
    rival: RivalScout,
    playerId?: string,
  ) => number;
}

function modifiedChance(base: number, multiplier = 1): number {
  return Math.min(0.95, Math.max(0, base * multiplier));
}

function contextualPressure(
  modifiers: RivalSimulationModifiers,
  rival: RivalScout,
  playerId?: string,
): number {
  const value = modifiers.contextualPressureMultiplier?.(rival, playerId) ?? 1;
  return Number.isFinite(value) ? Math.min(1.5, Math.max(0.7, value)) : 1;
}

function setReportDeadline(
  rival: RivalScout,
  deadline: { season: number; week: number },
): RivalScout {
  return {
    ...rival,
    reportDeadline: deadline.week,
    reportDeadlineSeason: deadline.season,
  } as RivalScout;
}

function clearReportDeadline(rival: RivalScout): RivalScout {
  return {
    ...rival,
    reportDeadline: undefined,
    reportDeadlineSeason: undefined,
  } as RivalScout;
}

/** Migrate legacy overflow weeks (for example week 40) onto the canonical rival fields. */
function normalizeReportDeadline(rival: RivalScout, state: GameState): RivalScout {
  if (rival.reportDeadline === undefined) return rival;
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const rawWeek = Math.max(1, Math.floor(rival.reportDeadline));
  const normalizedWeek = normalizeGameWeek(rawWeek, seasonLength);
  if (rival.reportDeadlineSeason !== undefined && rawWeek === normalizedWeek) {
    return rival;
  }

  const overflowSeasons = Math.floor((rawWeek - 1) / seasonLength);
  const looksNewlyAssignedThisSeason = overflowSeasons > 0
    && rawWeek > state.currentWeek
    && rawWeek - state.currentWeek <= SCOUTING_PROGRESS_MAX;
  const inferredSeason = rival.reportDeadlineSeason !== undefined
    ? rival.reportDeadlineSeason + overflowSeasons
    : overflowSeasons === 0
      ? state.currentSeason
      : state.currentSeason + (
          looksNewlyAssignedThisSeason
            ? overflowSeasons
            : Math.max(0, overflowSeasons - 1)
        );
  return setReportDeadline(rival, {
    season: inferredSeason,
    week: normalizedWeek,
  });
}

function isReportDeadlineReached(rival: RivalScout, state: GameState): boolean {
  if (rival.reportDeadline === undefined) return false;
  return isGameDateAtOrAfter(
    { season: state.currentSeason, week: state.currentWeek },
    {
      season: rival.reportDeadlineSeason ?? state.currentSeason,
      week: rival.reportDeadline,
    },
  );
}

export interface RivalSigningResult {
  success: boolean;
  cost: number;
  lifecycle: LifecycleWorldState;
  movement?: PlayerMovementEvent;
  rejectionReason?: string;
}

export interface PoachBidEligibility {
  eligible: boolean;
  cost: number;
  reason?: string;
}

/** Enhanced result from processRivalScoutWeek (F8). */
export interface RivalScoutWeekResult {
  updatedRivals: Record<string, RivalScout>;
  /** Players the player-scout has reported on that a rival has also targeted. */
  poachWarnings: { rivalId: string; playerId: string }[];
  /** New player targets discovered this week. */
  discoveries: { rivalId: string; playerId: string }[];
  /** New rival activities generated this week. */
  newActivities: RivalActivity[];
  /** Inbox messages about rival activity. */
  newMessages: InboxMessage[];
  /** Player IDs that rivals have completed scouting and signed (lost opportunities). */
  lostPlayerIds: string[];
  /** Rival signings of players the scout has previously reported on (poach events). */
  poachSignings: { rivalId: string; playerId: string }[];
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

/** Weekly probability a rival discovers a new player. */
const DISCOVERY_CHANCE = 0.2;

/** Weekly probability a rival poaches a player the scout has reported on. */
const POACH_CHANCE = 0.1;

/** Reputation gain range per week (0–2). */
const REP_GAIN_MIN = 0;
const REP_GAIN_MAX = 2;

/**
 * Weekly probability a rival "signs" a shared-target player (completing a poach).
 * Only fires on players the scout has previously reported on.
 */
const POACH_SIGNING_CHANCE = 0.08;

/**
 * Added to the discovery chance when both scout and rival target the same player.
 * Represents the rival's increased urgency on contested targets.
 */
const SHARED_TARGET_URGENCY_BOOST = 0.1;

/** Counter-bid costs 150% of market value. */
const COUNTER_BID_COST_MULTIPLIER = 1.5;

/** Base success rate for a counter-bid. */
const COUNTER_BID_BASE_SUCCESS = 0.4;

/** Nemesis threshold — losses before the "nemesis" event triggers. */
const NEMESIS_THRESHOLD = 3;

/** Scouting observations required to complete a report (min/max). */
const SCOUTING_PROGRESS_MIN = 2;
const SCOUTING_PROGRESS_MAX = 4;

/** Progress needed to complete scouting on a target (observations required). */
const SCOUTING_COMPLETION_THRESHOLD = 5;

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
  const rivalIntelligence = getDifficultyModifiers(state.difficulty).rivalIntelligence;
  const decisionSharpness = getDifficultyChallengeProfile(
    state.difficulty,
  ).rivalDecisionSharpness;

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

    // Derive aggressiveness and budgetTier from personality and club
    const aggressiveness = deriveAggressiveness(rng, personality);
    const budgetTier = deriveBudgetTier(club, state);
    const baseRival: RivalScout = {
      id,
      name: `${firstName} ${lastName}`,
      quality,
      specialization: spec,
      clubId: club.id,
      targetPlayerIds: [],
      reputation,
      personality,
      isNemesis: false,
      competingForPlayers: [],
      scoutingProgress: {},
      aggressiveness,
      budgetTier,
      winsAgainstPlayer: 0,
      lossesToPlayer: 0,
    };
    rivals[id] = {
      ...baseRival,
      targetPlayerIds: pickInitialTargets(
        rng,
        baseRival,
        club,
        state,
        rivalIntelligence,
        decisionSharpness,
      ),
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

// =============================================================================
// 2b. Process Rival Scout Week — Enhanced F8 version
// =============================================================================

/**
 * Enhanced weekly rival AI that includes scouting progress, report submission,
 * match attendance, contact intelligence, and player loss mechanics.
 *
 * This is the weekly tick authority for rival scouting.
 *
 * @param rng   Seeded RNG for this tick.
 * @param state Current game state.
 * @returns     Complete weekly result with updated rivals, activities, messages.
 */
export function processRivalScoutWeek(
  rng: RNG,
  state: GameState,
  modifiers: RivalSimulationModifiers = {},
): RivalScoutWeekResult {
  const updatedRivals: Record<string, RivalScout> = {};
  const poachWarnings: { rivalId: string; playerId: string }[] = [];
  const discoveries: { rivalId: string; playerId: string }[] = [];
  const poachSignings: { rivalId: string; playerId: string }[] = [];
  const newActivities: RivalActivity[] = [];
  const newMessages: InboxMessage[] = [];
  const lostPlayerIds: string[] = [];
  const queuedPoachPlayerIds = new Set<string>();
  const difficulty = getDifficultyModifiers(state.difficulty);
  const challenge = getDifficultyChallengeProfile(state.difficulty);

  // Build the set of player IDs the scout has reported on (for poach logic)
  const reportedPlayerIds = new Set<string>(
    Object.values(state.reports).map((r) => r.playerId),
  );

  // Build the set of players the scout is actively tracking (for urgency boost)
  const scoutPlayerIds = new Set<string>();
  for (const obs of Object.values(state.observations)) {
    scoutPlayerIds.add(obs.playerId);
  }
  for (const report of Object.values(state.reports)) {
    scoutPlayerIds.add(report.playerId);
  }

  // Historical fixture records remain available for world history, so rival
  // attendance must be scoped to the active competition season.
  const weekFixtures = Object.values(state.fixtures).filter(
    (f) =>
      isFixtureInSeason(f, state.currentSeason) &&
      f.week === state.currentWeek &&
      !f.played,
  );

  for (const rival of Object.values(state.rivalScouts)) {
    let updatedRival = normalizeReportDeadline({
      ...rival,
      // Ensure new F8 fields exist (migration safety)
      scoutingProgress: rival.scoutingProgress ?? {},
      aggressiveness: rival.aggressiveness ?? deriveAggressiveness(rng, rival.personality),
      budgetTier: rival.budgetTier ?? "medium",
    }, state);
    const shortlistCapacity = getRivalShortlistCapacity(
      updatedRival,
      difficulty.rivalIntelligence,
    );
    updatedRival = pruneRivalShortlist(
      updatedRival,
      state,
      shortlistCapacity,
    );

    // --- 1. Target selection based on personality ---
    if (!updatedRival.currentTarget || !state.players[updatedRival.currentTarget]) {
      const newTarget = selectTargetByPersonality(
        rng,
        updatedRival,
        state,
        difficulty.rivalIntelligence,
        challenge.rivalDecisionSharpness,
      );
      if (newTarget) {
        updatedRival = { ...updatedRival, currentTarget: newTarget };
        // Set report deadline: 2-4 weeks from now based on aggressiveness
        const deadlineWeeks = Math.max(
          2,
          Math.round(
            SCOUTING_PROGRESS_MIN + (1 - updatedRival.aggressiveness) *
              (SCOUTING_PROGRESS_MAX - SCOUTING_PROGRESS_MIN),
          ) + challenge.rivalDeadlineOffsetWeeks,
        );
        updatedRival = setReportDeadline(
          updatedRival,
          addGameWeeks(
            state.fixtures,
            { season: state.currentSeason, week: state.currentWeek },
            deadlineWeeks,
          ),
        );
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

          updatedRival = observePlayerForRival(
            rng,
            updatedRival,
            targetPlayer,
            state,
            difficulty.rivalIntelligence,
          );

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
      const deadlineReached = isReportDeadlineReached(updatedRival, state);
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
          id: `rival-report-${rival.id}-${updatedRival.currentTarget}-s${state.currentSeason}w${state.currentWeek}`,
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

        // --- 5. Chance the rival's club makes a signing attempt ---
        // The weekly store resolves the resulting attempt through the
        // authoritative player lifecycle before any message claims a signing.
        const signingChance = computeSigningChance(
          updatedRival,
          updatedRival.currentTarget,
          progress,
          state,
          difficulty.rivalIntelligence,
        );
        if (rng.chance(modifiedChance(
          signingChance,
          (modifiers.signingChanceMultiplier ?? 1)
            * contextualPressure(modifiers, updatedRival, updatedRival.currentTarget),
        ))) {
          if (
            reportedPlayerIds.has(updatedRival.currentTarget) &&
            !queuedPoachPlayerIds.has(updatedRival.currentTarget)
          ) {
            queuedPoachPlayerIds.add(updatedRival.currentTarget);
            poachSignings.push({
              rivalId: rival.id,
              playerId: updatedRival.currentTarget,
            });
          }
        }

        // Clear current target and deadline after report submission
        updatedRival = clearReportDeadline({
          ...updatedRival,
          currentTarget: undefined,
        });
      }
    }

    // --- 6. Discovery (same as legacy) ---
    if (rng.chance(modifiedChance(
      DISCOVERY_CHANCE,
      (modifiers.discoveryChanceMultiplier ?? 1)
        * challenge.rivalDiscoveryPressure
        * contextualPressure(modifiers, updatedRival, updatedRival.currentTarget),
    ))) {
      const newTarget = discoverNewTarget(
        rng,
        updatedRival,
        state,
        difficulty.rivalIntelligence,
        challenge.rivalDecisionSharpness,
      );
      if (newTarget !== null) {
        const alreadyTracking = updatedRival.targetPlayerIds.includes(newTarget);
        if (
          !alreadyTracking &&
          updatedRival.targetPlayerIds.length < shortlistCapacity
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

    // --- 8. Poach warning check ---
    if (rng.chance(modifiedChance(
      POACH_CHANCE,
      (modifiers.poachChanceMultiplier ?? 1)
        * contextualPressure(modifiers, updatedRival, competingForPlayers[0]),
    ))) {
      if (competingForPlayers.length > 0) {
        const targetId = rng.pick(competingForPlayers);
        poachWarnings.push({ rivalId: rival.id, playerId: targetId });
      }
    }

    // --- 8b. Poach signing check (rival completes a signing of a reported player) ---
    const hasSharedTargets = updatedRival.targetPlayerIds.some((pid) =>
      scoutPlayerIds.has(pid),
    );
    const signingChancePoach = hasSharedTargets
      ? POACH_SIGNING_CHANCE + SHARED_TARGET_URGENCY_BOOST
      : POACH_SIGNING_CHANCE;
    const evidenceQualifiedSharedIds = updatedRival.targetPlayerIds.filter((playerId) => {
      const evidence = getRivalPlayerEvidence(updatedRival, playerId);
      return reportedPlayerIds.has(playerId)
        && (evidence?.observations ?? 0) > 0
        && (evidence?.confidence ?? 0) >= 0.2;
    });
    const pressurePlayerId = evidenceQualifiedSharedIds[0];
    if (
      pressurePlayerId
      && rng.chance(modifiedChance(
        signingChancePoach,
        (modifiers.signingChanceMultiplier ?? 1)
          * (0.85 + difficulty.rivalIntelligence * 0.15)
          * contextualPressure(modifiers, updatedRival, pressurePlayerId),
      ))
    ) {
      const signedPlayerId = pickWeightedTarget(
        rng,
        evidenceQualifiedSharedIds,
        updatedRival,
        state,
        difficulty.rivalIntelligence,
        challenge.rivalDecisionSharpness,
      );
      if (signedPlayerId) {
        if (!queuedPoachPlayerIds.has(signedPlayerId)) {
          queuedPoachPlayerIds.add(signedPlayerId);
          poachSignings.push({ rivalId: rival.id, playerId: signedPlayerId });
        }
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
    poachSignings,
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
// 4b. Poach Counter-Bid Resolution
// =============================================================================

function contractOwner(player: Player): string | undefined {
  return (player.contractClubId ?? player.loanParentClubId ?? player.clubId) || undefined;
}

/**
 * Resolve an NPC club's claimed signing through the same lifecycle used by
 * transfers and free agents everywhere else in the simulation.
 */
export function resolveRivalSigningAttempt(
  lifecycle: LifecycleWorldState,
  rival: RivalScout,
  playerId: string,
  week: number,
  season: number,
): RivalSigningResult {
  const player = lifecycle.players[playerId];
  const destination = lifecycle.clubs[rival.clubId];
  if (!player || !destination) {
    return {
      success: false,
      cost: 0,
      lifecycle,
      rejectionReason: "The player or rival club is no longer active.",
    };
  }

  const owner = contractOwner(player);
  if (owner === rival.clubId) {
    return {
      success: false,
      cost: 0,
      lifecycle,
      rejectionReason: "The player is already registered with the rival club.",
    };
  }

  const cost = owner
    ? Math.max(0, Math.round(player.marketValue))
    : Math.max(0, Math.round(player.marketValue * 0.1));
  const resolution = resolvePlayerMovements(
    lifecycle,
    owner
      ? [{
          type: "permanentTransfer" as const,
          playerId,
          fromClubId: owner,
          toClubId: rival.clubId,
          fee: cost,
          wage: Math.max(100, player.wage),
          contractLength: 3,
          reason: `Signed following ${rival.name}'s recommendation`,
        }]
      : [{
          type: "freeAgentSigning" as const,
          playerId,
          toClubId: rival.clubId,
          wage: Math.max(100, player.wage),
          signingBonus: cost,
          contractLength: 3,
          reason: `Signed following ${rival.name}'s recommendation`,
        }],
    week,
    season,
  );
  const movement = resolution.applied[0];
  return movement
    ? { success: true, cost, lifecycle: resolution.state, movement }
    : {
        success: false,
        cost,
        lifecycle,
        rejectionReason:
          resolution.rejected[0]?.reason ?? "The rival club could not complete the signing.",
      };
}

/** Explain whether the player's current employer can make a valid counter-bid. */
export function getPoachCounterBidEligibility(
  lifecycle: LifecycleWorldState,
  rival: RivalScout,
  player: Player,
  scout: Scout,
): PoachBidEligibility {
  const cost = Math.max(
    0,
    Math.round(player.marketValue * COUNTER_BID_COST_MULTIPLIER),
  );
  const scoutClubId = scout.currentClubId;
  if (!scoutClubId) {
    return { eligible: false, cost, reason: "You need a current employer to submit a club bid." };
  }
  const scoutClub = lifecycle.clubs[scoutClubId];
  if (!scoutClub || scoutClubId === rival.clubId) {
    return { eligible: false, cost, reason: "There is no valid destination club for the bid." };
  }
  if (contractOwner(player) !== rival.clubId || player.onLoan) {
    return { eligible: false, cost, reason: "The player's contract state no longer permits this transfer." };
  }
  if (scoutClub.budget < cost) {
    return {
      eligible: false,
      cost,
      reason: `${scoutClub.name} cannot afford the ${cost.toLocaleString()} fee.`,
    };
  }
  return { eligible: true, cost };
}

/**
 * Resolve a counter-bid and, on success, commit the transfer and club budgets
 * through the authoritative player lifecycle. Failed bids do not spend money.
 */
export function resolvePoachCounterBid(
  rng: RNG,
  rival: RivalScout,
  player: Player,
  scout: Scout,
  lifecycle: LifecycleWorldState,
  week: number,
  season: number,
): PoachBidResult {
  const eligibility = getPoachCounterBidEligibility(
    lifecycle,
    rival,
    player,
    scout,
  );
  if (!eligibility.eligible || !scout.currentClubId) {
    return {
      attempted: false,
      success: false,
      cost: eligibility.cost,
      reputationChange: 0,
      updatedRival: rival,
      rejectionReason: eligibility.reason,
      lifecycle,
    };
  }

  const scoutFactor = scout.reputation / 100;
  const rivalFactor = (rival.quality - 1) / 4;
  const adjustedChance = clamp(
    COUNTER_BID_BASE_SUCCESS + (scoutFactor - rivalFactor) * 0.2,
    0.1,
    0.7,
  );

  if (!rng.chance(adjustedChance)) {
    return {
      attempted: true,
      success: false,
      cost: eligibility.cost,
      reputationChange: -2,
      updatedRival: {
        ...rival,
        winsAgainstPlayer: (rival.winsAgainstPlayer ?? 0) + 1,
        lossesToPlayer: rival.lossesToPlayer ?? 0,
      },
      lifecycle,
    };
  }

  const resolution = resolvePlayerMovements(
    lifecycle,
    [{
      type: "permanentTransfer",
      playerId: player.id,
      fromClubId: rival.clubId,
      toClubId: scout.currentClubId,
      fee: eligibility.cost,
      wage: Math.max(100, player.wage),
      contractLength: 3,
      reason: `Counter-bid backed by ${scout.firstName} ${scout.lastName}`,
    }],
    week,
    season,
  );
  const movement = resolution.applied[0];
  if (!movement) {
    return {
      attempted: true,
      success: false,
      cost: eligibility.cost,
      reputationChange: 0,
      updatedRival: rival,
      rejectionReason:
        resolution.rejected[0]?.reason ?? "The transfer could not be completed.",
      lifecycle,
    };
  }

  return {
    attempted: true,
    success: true,
    cost: eligibility.cost,
    reputationChange: 5,
    updatedRival: {
      ...rival,
      winsAgainstPlayer: rival.winsAgainstPlayer ?? 0,
      lossesToPlayer: (rival.lossesToPlayer ?? 0) + 1,
    },
    lifecycle: resolution.state,
    movement,
  };
}

/**
 * Check if a rival has reached "nemesis" status (3+ wins against the player).
 */
export function isNemesis(rival: RivalScout): boolean {
  return (rival.winsAgainstPlayer ?? 0) >= NEMESIS_THRESHOLD;
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

function pruneRivalShortlist(
  rival: RivalScout,
  state: GameState,
  capacity: number,
): RivalScout {
  const orderedIds = rival.currentTarget
    ? [rival.currentTarget, ...rival.targetPlayerIds]
    : rival.targetPlayerIds;
  const seen = new Set<string>();
  const targetPlayerIds = orderedIds.filter((playerId) => {
    if (seen.has(playerId)) return false;
    seen.add(playerId);
    const player = state.players[playerId];
    if (!player || !isRivalTargetEligible(rival, player, state)) return false;
    return playerId === rival.currentTarget
      || (rival.scoutingProgress[playerId] ?? 0) < SCOUTING_COMPLETION_THRESHOLD;
  }).slice(0, capacity);

  if (rival.currentTarget && !targetPlayerIds.includes(rival.currentTarget)) {
    return clearReportDeadline({
      ...rival,
      targetPlayerIds,
      currentTarget: undefined,
    });
  }
  return { ...rival, targetPlayerIds };
}

function pickWeightedTarget(
  rng: RNG,
  playerIds: readonly string[],
  rival: RivalScout,
  state: GameState,
  rivalIntelligence: number,
  decisionSharpness: number,
): string | undefined {
  const weighted = playerIds.flatMap((playerId) => {
    const player = state.players[playerId];
    if (!player || !isRivalTargetEligible(rival, player, state)) return [];
    const score = scoreRivalTargetCandidate(
      rival,
      player,
      state,
      rivalIntelligence,
    );
    return [{
      item: playerId,
      weight: Math.pow(
        Math.max(0.1, score / 20),
        clamp(decisionSharpness, 0.75, 1.5),
      ),
    }];
  });
  return weighted.length > 0 ? rng.pickWeighted(weighted) : undefined;
}

/** Select from a bounded shortlist using personality, specialty and fallible evidence. */
function selectTargetByPersonality(
  rng: RNG,
  rival: RivalScout,
  state: GameState,
  rivalIntelligence: number,
  decisionSharpness: number,
): string | undefined {
  const available = rival.targetPlayerIds.filter((playerId) =>
    (rival.scoutingProgress[playerId] ?? 0) < SCOUTING_COMPLETION_THRESHOLD
  );
  return pickWeightedTarget(
    rng,
    available,
    rival,
    state,
    rivalIntelligence,
    decisionSharpness,
  );
}

/** Signing intent now depends on what the rival actually believes and how sure they are. */
function computeSigningChance(
  rival: RivalScout,
  playerId: string,
  progress: number,
  state: GameState,
  rivalIntelligence: number,
): number {
  const player = state.players[playerId];
  if (!player) return 0;
  const evidence = getRivalPlayerEvidence(rival, playerId);
  const qualityBonus = (clamp(rival.quality, 1, 5) - 1) * 0.03;
  const progressBonus = clamp(progress / SCOUTING_COMPLETION_THRESHOLD, 0, 1) * 0.08;
  const confidenceBonus = (evidence?.confidence ?? 0.05) * 0.16;
  const targetFitBonus = scoreRivalTargetCandidate(
    rival,
    player,
    state,
    rivalIntelligence,
  ) / 100 * 0.12;
  return clamp(
    0.08 + qualityBonus + progressBonus + confidenceBonus + targetFitBonus,
    0.05,
    0.55,
  );
}

/** Helper to get a club name from state. */
function getClubName(clubId: string, state: GameState): string {
  return state.clubs[clubId]?.name ?? "Unknown Club";
}

/**
 * Pick initial target players for a newly created rival.
 *
 * Uses public value, form, performance, contract, squad need and specialty
 * signals. Hidden ability does not participate in initial discovery.
 */
function pickInitialTargets(
  rng: RNG,
  rival: RivalScout,
  club: Club,
  state: GameState,
  rivalIntelligence: number,
  decisionSharpness: number,
): string[] {
  const count = Math.min(
    rng.nextInt(INITIAL_TARGETS_MIN, INITIAL_TARGETS_MAX),
    getRivalShortlistCapacity(rival, rivalIntelligence),
  );

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

  candidates = candidates.filter((player) =>
    isRivalTargetEligible(rival, player, state)
  );
  if (candidates.length === 0) {
    candidates = Object.values(state.players).filter((player) =>
      isRivalTargetEligible(rival, player, state)
    );
  }

  const selected: string[] = [];
  const remaining = candidates.map((player) => player.id);
  while (selected.length < count && remaining.length > 0) {
    const playerId = pickWeightedTarget(
      rng,
      remaining,
      rival,
      state,
      rivalIntelligence,
      decisionSharpness,
    );
    if (!playerId) break;
    selected.push(playerId);
    remaining.splice(remaining.indexOf(playerId), 1);
  }
  return selected;
}

/**
 * Pick one new player target for a rival to "discover".
 *
 * Prefers players not already on the shortlist and weights only public signals
 * plus evidence the rival has legitimately accumulated.
 * Returns null if no new candidates are available.
 */
function discoverNewTarget(
  rng: RNG,
  rival: RivalScout,
  state: GameState,
  rivalIntelligence: number,
  decisionSharpness: number,
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
      (p) => clubIds.has(p.clubId)
        && !existingSet.has(p.id)
        && isRivalTargetEligible(rival, p, state),
    );
  } else {
    candidates = Object.values(state.players).filter(
      (p) => !existingSet.has(p.id) && isRivalTargetEligible(rival, p, state),
    );
  }

  if (candidates.length === 0) return null;

  return pickWeightedTarget(
    rng,
    candidates.map((player) => player.id),
    rival,
    state,
    rivalIntelligence,
    decisionSharpness,
  ) ?? null;
}
