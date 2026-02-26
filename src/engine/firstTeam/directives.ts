/**
 * Manager directive system — generates and evaluates first-team transfer target profiles.
 *
 * The directive pipeline works in two stages:
 *  1. `generateDirectives` analyses the squad, identifies positional gaps, and
 *     produces a ranked list of transfer briefs the manager wants the scout to
 *     fill.
 *  2. `evaluateReportAgainstDirectives` scores a submitted scout report against
 *     the active directives and returns the best-matching one (if any).
 *
 * Design notes:
 *  - Pure functions: no side effects, no mutation of inputs.
 *  - All randomness flows through the RNG instance.
 *  - CA star scale: 0.5–5.0 (matches AbilityReading / perceivedCAStars).
 */

import type { RNG } from "@/engine/rng";
import type {
  Club,
  ManagerProfile,
  ManagerDirective,
  Player,
  Position,
  PlayerAttribute,
  PlayerRole,
  ScoutReport,
  ScoutingPhilosophy,
  BoardProfile,
} from "@/engine/core/types";
import { adjustDirectiveDifficulty } from "./boardAI";
import { calculateRoleSuitability, getBestRole, getCompatibleRoles } from "@/engine/players/roles";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Weights used when computing a position's average CA across the squad. */
const PRIORITY_THRESHOLDS = {
  /** CA gap above this → critical priority. */
  CRITICAL: 30,
  /** CA gap above this → high priority. */
  HIGH: 20,
  /** CA gap above this → medium priority. */
  MEDIUM: 10,
} as const;

/**
 * Budget share per priority tier.
 * Allocations sum to 1.0 when all four tiers are represented.
 * When fewer tiers exist the caller receives the raw fractional allocation,
 * which is multiplied by club.budget to yield the monetary ceiling.
 */
const BUDGET_SHARES: Record<ManagerDirective["priority"], number> = {
  critical: 0.40,
  high: 0.30,
  medium: 0.20,
  low: 0.10,
} as const;

/**
 * Position-appropriate key attributes.
 * These represent what scouts and managers typically value in each role.
 */
const POSITION_KEY_ATTRIBUTES: Record<Position, PlayerAttribute[]> = {
  GK: ["positioning", "composure", "decisionMaking", "leadership", "anticipation"],
  CB: ["tackling", "heading", "strength", "marking", "anticipation", "jumping"],
  LB: ["pace", "crossing", "stamina", "tackling", "teamwork", "marking"],
  RB: ["pace", "crossing", "stamina", "tackling", "teamwork", "marking"],
  CDM: ["tackling", "marking", "passing", "anticipation", "teamwork", "vision"],
  CM: ["passing", "stamina", "vision", "teamwork", "workRate", "anticipation"],
  CAM: ["vision", "dribbling", "finishing", "offTheBall", "firstTouch", "composure"],
  LW: ["pace", "dribbling", "crossing", "agility", "finishing", "balance"],
  RW: ["pace", "dribbling", "crossing", "agility", "finishing", "balance"],
  ST: ["finishing", "heading", "pace", "composure", "offTheBall", "jumping"],
} as const;

/**
 * Preferred age ranges by club philosophy.
 * Each tuple is [minAge, maxAge].
 */
const PHILOSOPHY_AGE_RANGES: Record<ScoutingPhilosophy, [number, number]> = {
  winNow: [24, 31],
  academyFirst: [17, 23],
  marketSmart: [21, 27],
  globalRecruiter: [19, 29],
} as const;

/**
 * Minimum CA star requirements indexed by club reputation band.
 * Reputation 1–100; higher-rep clubs demand more established players.
 */
function minCAStarsForReputation(reputation: number): number {
  if (reputation >= 80) return 3.5;
  if (reputation >= 60) return 3.0;
  if (reputation >= 40) return 2.5;
  if (reputation >= 20) return 2.0;
  return 1.5;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Bound a number within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a raw currentAbility value (1–200) to the 0.5–5.0 star scale.
 * The scale is linear: 200 CA = 5.0 stars, 0 CA = 0 stars (clamped to 0.5).
 */
function caToStars(ca: number): number {
  const raw = (ca / 200) * 5.0;
  // Round to nearest 0.5, clamp to [0.5, 5.0]
  return clamp(Math.round(raw * 2) / 2, 0.5, 5.0);
}

/**
 * Collect all players currently registered at a club.
 */
function clubPlayers(players: Record<string, Player>, clubId: string): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId);
}

/**
 * Compute the average currentAbility for a given position in the squad.
 * Returns 0 if no player fills the position.
 */
function averageCAForPosition(squad: Player[], position: Position): number {
  const atPosition = squad.filter(
    (p) => p.position === position || p.secondaryPositions.includes(position),
  );
  if (atPosition.length === 0) return 0;
  const total = atPosition.reduce((sum, p) => sum + p.currentAbility, 0);
  return total / atPosition.length;
}

/**
 * Compute the overall squad average currentAbility.
 * Returns 100 as a neutral default for squads with no players.
 */
function squadAverageCA(squad: Player[]): number {
  if (squad.length === 0) return 100;
  const total = squad.reduce((sum, p) => sum + p.currentAbility, 0);
  return total / squad.length;
}

/**
 * Select the 3–4 most contextually important key attributes for a position.
 * Uses deterministic ordering from POSITION_KEY_ATTRIBUTES; a short RNG draw
 * adds one extra attribute from the tail on alternate seasons to keep
 * directives fresh without losing consistency.
 */
function selectKeyAttributes(
  rng: RNG,
  position: Position,
  count: 3 | 4 = 4,
): PlayerAttribute[] {
  const pool = POSITION_KEY_ATTRIBUTES[position];
  const base = pool.slice(0, 3);
  // Pick an extra from the remaining pool
  const extras = pool.slice(3);
  if (count === 4 && extras.length > 0) {
    base.push(rng.pick(extras));
  }
  return base;
}

/**
 * Preferred roles by tactical identity for each position.
 * When a club's identity suggests a specific role type, the directive will
 * request that role; otherwise a random compatible role is picked.
 */
const IDENTITY_ROLE_HINTS: Partial<Record<string, Partial<Record<Position, PlayerRole[]>>>> = {
  possessionBased: {
    CB: ["ballPlayingDefender"], CDM: ["deepLyingPlaymaker"], CM: ["advancedPlaymaker", "mezzala"],
    LB: ["invertedFullBack"], RB: ["invertedFullBack"],
  },
  highPress: {
    ST: ["pressingForward"], CM: ["boxToBox"], LW: ["insideForward"], RW: ["insideForward"],
  },
  counterAttacking: {
    LW: ["winger"], RW: ["winger"], ST: ["poacher"], CM: ["carrilero"],
  },
  directPlay: {
    ST: ["targetMan"], LW: ["winger"], RW: ["winger"], CB: ["noNonsenseCB"],
  },
  wingPlay: {
    LB: ["wingBack"], RB: ["wingBack"], LW: ["winger"], RW: ["winger"],
  },
};

/**
 * Pick a preferred role for a directive based on club tactical identity and position.
 */
function selectPreferredRole(rng: RNG, position: Position, club: Club): PlayerRole | undefined {
  const identity = club.tacticalStyle?.tacticalIdentity;
  if (identity) {
    const hints = IDENTITY_ROLE_HINTS[identity]?.[position];
    if (hints && hints.length > 0) {
      return rng.pick(hints);
    }
  }
  // No strong identity preference — leave undefined (system fit will evaluate generically)
  return undefined;
}

/**
 * Build tactical notes text from the manager's preferred formation and
 * philosophy, tailored to the target position.
 */
function buildTacticalNotes(
  manager: ManagerProfile,
  position: Position,
  priority: ManagerDirective["priority"],
  preferredRole?: PlayerRole,
): string {
  const urgencyText =
    priority === "critical" ? "urgently"
    : priority === "high" ? "soon"
    : "during this window";

  const roleText = preferredRole
    ? ` Ideal profile: ${preferredRole.replace(/([A-Z])/g, " $1").trim()}.`
    : "";

  return (
    `Manager requires a ${position} ${urgencyText}. ` +
    `Formation: ${manager.preferredFormation}. ` +
    `Scout preference: ${manager.preference}.${roleText} ` +
    `The incoming player must fit the club's ${manager.preferredFormation} system ` +
    `and demonstrate the tactical discipline demanded by the coaching staff.`
  );
}

// =============================================================================
// POSITIONAL GAP ANALYSIS
// =============================================================================

interface PositionGap {
  position: Position;
  avgCA: number;
  /** How many standard squad players occupy this slot. */
  playerCount: number;
  /** How far below squad average this position is. */
  caGap: number;
}

/**
 * Identify positional gaps across the squad.
 * A "gap" is any position whose average CA is meaningfully below the squad
 * mean, or which is entirely unstaffed.
 *
 * Only positions listed in a standard formation are evaluated.
 */
function identifyPositionGaps(squad: Player[], maxGaps: number): PositionGap[] {
  const sqAvg = squadAverageCA(squad);

  const ALL_OUTFIELD_POSITIONS: Position[] = [
    "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
  ];

  const gaps: PositionGap[] = ALL_OUTFIELD_POSITIONS.map((pos) => {
    const atPosition = squad.filter(
      (p) => p.position === pos || p.secondaryPositions.includes(pos),
    );
    const avg = atPosition.length === 0 ? 0 : averageCAForPosition(squad, pos);
    return {
      position: pos,
      avgCA: avg,
      playerCount: atPosition.length,
      caGap: sqAvg - avg,
    };
  });

  // Sort by gap severity descending (most urgent first)
  gaps.sort((a, b) => b.caGap - a.caGap);

  // Return only meaningful gaps (positive gap) capped to maxGaps
  return gaps.filter((g) => g.caGap > 0).slice(0, maxGaps);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a prioritised list of manager transfer directives for the season.
 *
 * Steps:
 *  1. Identify 2–4 weak positions in the current squad by CA gap analysis.
 *  2. Derive priority tier from gap severity relative to PRIORITY_THRESHOLDS.
 *  3. Allocate a slice of club.budget proportional to priority.
 *  4. Set the preferred age range from the club's scouting philosophy.
 *  5. Determine the minimum CA star rating from club reputation.
 *  6. Pick 3–4 position-appropriate key attributes.
 *  7. Build tactical notes from the manager's formation and preference.
 *
 * Returns the list sorted by priority (critical first, low last).
 *
 * @param rng      - Seeded PRNG instance.
 * @param club     - The club issuing the directives.
 * @param manager  - Manager profile for this club.
 * @param players  - All players in the game world.
 * @param season   - Current season year.
 */
export function generateDirectives(
  rng: RNG,
  club: Club,
  manager: ManagerProfile,
  players: Record<string, Player>,
  season: number,
  boardProfile?: BoardProfile,
  state?: { boardProfile?: BoardProfile },
): ManagerDirective[] {
  const squad = clubPlayers(players, club.id);

  // Identify 2–4 gap positions (RNG decides between 2 and 4 for variety)
  const gapCount = rng.nextInt(2, 4);
  const gaps = identifyPositionGaps(squad, gapCount);

  const priorityOrder: ManagerDirective["priority"][] = ["critical", "high", "medium", "low"];
  const baseMinCAStars = minCAStarsForReputation(club.reputation);
  const baseAgeRange = PHILOSOPHY_AGE_RANGES[club.scoutingPhilosophy];

  // F10: Apply board difficulty scaling if board profile is available
  const effectiveBoardProfile = boardProfile ?? state?.boardProfile;
  const difficulty = effectiveBoardProfile
    ? adjustDirectiveDifficulty(
        { boardProfile: effectiveBoardProfile } as import("@/engine/core/types").GameState,
        effectiveBoardProfile,
      )
    : { caStarsMultiplier: 1.0, budgetScale: 1.0, ageFlexibility: 1.0 };

  // Scale CA stars requirement by board difficulty
  const scaledMinCAStars = clamp(
    Math.round(baseMinCAStars * difficulty.caStarsMultiplier * 2) / 2,
    0.5,
    5.0,
  );

  // Scale age range by flexibility
  const ageFlexDelta = Math.round((1 - difficulty.ageFlexibility) * 2);
  const scaledAgeRange: [number, number] = [
    baseAgeRange[0] + ageFlexDelta,
    baseAgeRange[1] - ageFlexDelta,
  ];

  const directives: ManagerDirective[] = gaps.map((gap, index) => {
    // Derive priority from CA gap magnitude
    let priority: ManagerDirective["priority"];
    if (gap.caGap > PRIORITY_THRESHOLDS.CRITICAL) {
      priority = "critical";
    } else if (gap.caGap > PRIORITY_THRESHOLDS.HIGH) {
      priority = "high";
    } else if (gap.caGap > PRIORITY_THRESHOLDS.MEDIUM) {
      priority = "medium";
    } else {
      priority = "low";
    }

    // F10: Scale budget allocation by board budget multiplier
    const budgetAllocation = Math.round(
      club.budget * BUDGET_SHARES[priority] * difficulty.budgetScale,
    );
    const keyAttributes = selectKeyAttributes(rng, gap.position, 4);

    // Derive a preferred role for this position from club tactical identity
    const preferredRole = selectPreferredRole(rng, gap.position, club);

    const tacticalNotes = buildTacticalNotes(manager, gap.position, priority, preferredRole);

    // Stable deterministic ID
    const id = `dir_${club.id.slice(0, 8)}_${gap.position}_s${season}_${index}`;

    return {
      id,
      clubId: club.id,
      managerId: manager.clubId, // ManagerProfile uses clubId as primary key
      position: gap.position,
      priority,
      budgetAllocation,
      ageRange: scaledAgeRange,
      minCAStars: scaledMinCAStars,
      keyAttributes,
      preferredRole,
      submittedReportIds: [],
      fulfilled: false,
      season,
      tacticalNotes,
    };
  });

  // Sort by canonical priority order
  directives.sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority),
  );

  return directives;
}

// =============================================================================
// REPORT MATCHING
// =============================================================================

/**
 * Evaluate a scout report against a list of active directives and return the
 * best match, if any.
 *
 * Scoring breakdown (110 pts total):
 *  - Position match (35 pts): 35 if primary, 24 if secondary, 14 if adjacent, 0 if none.
 *  - Age fit        (15 pts): full 15 if within ageRange, scaled down linearly beyond bounds.
 *  - CA stars       (20 pts): full 20 if perceivedCAStars >= minCAStars, 0 if absent.
 *  - Key attributes (20 pts): 5 pts per matched key attribute (up to 4 attributes).
 *  - Role fit       (20 pts): NEW. If directive has preferredRole, scores role suitability.
 *
 * A report must score > 40 to be considered a match.
 * Returns the best-matching { directiveId, matchScore } or null.
 *
 * @param report     - The submitted scout report.
 * @param directives - Active (unfulfilled) directives to match against.
 * @param player     - The player described in the report.
 * @param club       - The club the directives belong to.
 */
export function evaluateReportAgainstDirectives(
  report: ScoutReport,
  directives: ManagerDirective[],
  player: Player,
  _club: Club,
): { directiveId: string; matchScore: number } | null {
  // Only active (unfulfilled) directives are candidates
  const active = directives.filter((d) => !d.fulfilled);
  if (active.length === 0) return null;

  let bestDirectiveId: string | null = null;
  let bestScore = 0;

  for (const directive of active) {
    let score = 0;

    // ------------------------------------------------------------------
    // 1. Position match (35 pts)
    // ------------------------------------------------------------------
    const ADJACENT_POSITIONS: Record<Position, Position[]> = {
      GK: [],
      CB: ["CDM"],
      LB: ["CB", "LW"],
      RB: ["CB", "RW"],
      CDM: ["CB", "CM"],
      CM: ["CDM", "CAM"],
      CAM: ["CM", "ST", "LW", "RW"],
      LW: ["LB", "CAM"],
      RW: ["RB", "CAM"],
      ST: ["CAM"],
    };

    if (player.position === directive.position) {
      score += 35;
    } else if (player.secondaryPositions.includes(directive.position)) {
      score += 24;
    } else if (ADJACENT_POSITIONS[player.position]?.includes(directive.position)) {
      score += 14;
    }

    // ------------------------------------------------------------------
    // 2. Age fit (15 pts)
    // ------------------------------------------------------------------
    const [minAge, maxAge] = directive.ageRange;
    if (player.age >= minAge && player.age <= maxAge) {
      score += 15;
    } else {
      const overshoot = player.age < minAge ? minAge - player.age : player.age - maxAge;
      score += Math.max(0, 15 - overshoot * 2);
    }

    // ------------------------------------------------------------------
    // 3. CA stars (20 pts)
    // ------------------------------------------------------------------
    const playerCAStars = report.perceivedCAStars ?? caToStars(player.currentAbility);
    if (playerCAStars >= directive.minCAStars) {
      score += 20;
    }

    // ------------------------------------------------------------------
    // 4. Key attributes (20 pts — 5 per attribute, up to 4)
    // ------------------------------------------------------------------
    const assessedAttributes = new Set(
      report.attributeAssessments.map((a) => a.attribute),
    );
    const matchedKeys = directive.keyAttributes.filter((attr) =>
      assessedAttributes.has(attr),
    );
    score += clamp(matchedKeys.length * 5, 0, 20);

    // ------------------------------------------------------------------
    // 5. Role fit (20 pts) — NEW
    // ------------------------------------------------------------------
    if (directive.preferredRole) {
      const suitability = calculateRoleSuitability(player, directive.preferredRole);
      // suitability is 0-100; map to 0-20 pts
      score += Math.round((suitability / 100) * 20);
    } else {
      // No preferred role: award partial credit based on best role suitability
      const best = getBestRole(player, directive.position);
      score += Math.round((best.suitability / 100) * 10); // max 10 pts without directive role
    }

    if (score > bestScore) {
      bestScore = score;
      bestDirectiveId = directive.id;
    }
  }

  if (bestDirectiveId === null || bestScore <= 40) return null;

  return { directiveId: bestDirectiveId, matchScore: bestScore };
}
