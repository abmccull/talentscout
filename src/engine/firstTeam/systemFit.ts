/**
 * Tactical system fit analysis for first-team scouts.
 *
 * Calculates how well a player fits a club's tactical system across three
 * dimensions: positional fit, style fit, and age fit.  The composite score
 * helps managers and scouts decide whether to pursue a transfer.
 *
 * Design notes:
 *  - Pure function: no side effects, no mutation of inputs.
 *  - No randomness — system fit is deterministic given the same inputs.
 *  - The formation parser handles standard football notations (e.g. "4-3-3").
 */

import type {
  Club,
  ManagerProfile,
  Player,
  PlayerAttribute,
  Position,
  ScoutingPhilosophy,
  SystemFitResult,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Positional fit scores for different match qualities. */
const POSITION_FIT_SCORES = {
  /** Player's primary position exactly matches a formation slot. */
  PRIMARY: 100,
  /** Player's secondary positions include the formation slot. */
  SECONDARY: 70,
  /** Player is in an adjacent/overlapping position. */
  ADJACENT: 40,
  /** No meaningful positional relationship. */
  NONE: 10,
} as const;

/**
 * Which positions are typically deployed in each formation slot.
 * Key = number of players in a line; value = positions that fill those slots.
 */
const DEFENDER_POSITIONS: readonly Position[] = ["GK", "CB", "LB", "RB"];
const MIDFIELDER_POSITIONS: readonly Position[] = ["CDM", "CM", "CAM"];
const FORWARD_POSITIONS: readonly Position[] = ["LW", "RW", "ST"];

/**
 * Positions that are adjacent to each other — used when there is no primary
 * or secondary match but the player could adapt.
 */
const ADJACENT_POSITIONS: Record<Position, readonly Position[]> = {
  GK: [],
  CB: ["CDM", "LB", "RB"],
  LB: ["CB", "LW", "CDM"],
  RB: ["CB", "RW", "CDM"],
  CDM: ["CB", "CM"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "ST", "LW", "RW"],
  LW: ["LB", "CAM", "ST"],
  RW: ["RB", "CAM", "ST"],
  ST: ["CAM", "LW", "RW"],
} as const;

/**
 * Attributes valued by each scouting philosophy when assessing style fit.
 * Scores are derived from the average of these attributes (1–20 scale),
 * then scaled to 0–100.
 */
const PHILOSOPHY_KEY_ATTRIBUTES: Record<ScoutingPhilosophy, readonly PlayerAttribute[]> = {
  winNow: [
    "consistency",
    "bigGameTemperament",
    "composure",
    "shooting",
    "heading",
  ],
  academyFirst: [
    "composure",
    "workRate",
    "professionalism",
    "firstTouch",
    "passing",
  ],
  marketSmart: [
    "workRate",
    "stamina",
    "pressing",
    "offTheBall",
    "defensiveAwareness",
  ],
  globalRecruiter: [
    "adaptability" as PlayerAttribute, // handled with fallback below
    "passing",
    "stamina",
    "firstTouch",
    "decisionMaking",
  ],
} as const;

/**
 * Preferred age ranges per philosophy (same as directives, kept co-located
 * for cohesion and to avoid cross-module coupling).
 * [minAge, maxAge]
 */
const PHILOSOPHY_AGE_RANGES: Record<ScoutingPhilosophy, [number, number]> = {
  winNow: [24, 31],
  academyFirst: [17, 23],
  marketSmart: [21, 27],
  globalRecruiter: [19, 29],
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/** Bound a value within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parse a formation string (e.g. "4-3-3", "4-4-2", "3-5-2") into its
 * constituent line counts.  Returns null if the string cannot be parsed.
 */
function parseFormation(
  formation: string,
): { defenders: number; midfielders: number; forwards: number } | null {
  const parts = formation.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  const [defenders, midfielders, forwards] = parts;
  return { defenders, midfielders, forwards };
}

/**
 * Determine which positions are required by a parsed formation.
 * Heuristic rules:
 *  - GK is always required (1 slot).
 *  - Defenders ≥ 4 → LB and RB present; ≥ 5 → additional CB(s).
 *  - Midfielders ≥ 3 → CM and CDM; ≥ 4 → CAM included.
 *  - Forwards ≥ 3 → LW and RW present; < 3 → wide positions absent.
 */
function formationPositions(
  defenders: number,
  midfielders: number,
  forwards: number,
): Set<Position> {
  const required = new Set<Position>(["GK", "CB"]);

  if (defenders >= 4) {
    required.add("LB");
    required.add("RB");
  }

  if (midfielders >= 2) {
    required.add("CM");
  }
  if (midfielders >= 3) {
    required.add("CDM");
  }
  if (midfielders >= 4) {
    required.add("CAM");
  }

  if (forwards >= 1) {
    required.add("ST");
  }
  if (forwards >= 3) {
    required.add("LW");
    required.add("RW");
  }

  return required;
}

/**
 * Score positional fit on a 0–100 scale.
 *
 * Algorithm:
 *  1. Parse the manager's preferredFormation.
 *  2. Derive the set of positions the formation uses.
 *  3. Check player's primary position, then secondary positions, then
 *     adjacency mapping.
 *  4. Return the best matching score found.
 */
function scorePositionFit(player: Player, manager: ManagerProfile): number {
  const parsed = parseFormation(manager.preferredFormation);
  if (!parsed) {
    // Formation unparseable — treat as neutral
    return 50;
  }

  const { defenders, midfielders, forwards } = parsed;
  const requiredPositions = formationPositions(defenders, midfielders, forwards);

  // Primary position check
  if (requiredPositions.has(player.position)) {
    return POSITION_FIT_SCORES.PRIMARY;
  }

  // Secondary position check
  for (const secondary of player.secondaryPositions) {
    if (requiredPositions.has(secondary)) {
      return POSITION_FIT_SCORES.SECONDARY;
    }
  }

  // Adjacency check — player can adapt from an adjacent role
  const adjacentToPlayer = ADJACENT_POSITIONS[player.position];
  for (const adj of adjacentToPlayer) {
    if (requiredPositions.has(adj)) {
      return POSITION_FIT_SCORES.ADJACENT;
    }
  }

  return POSITION_FIT_SCORES.NONE;
}

/**
 * Score style fit on a 0–100 scale.
 *
 * For each philosophy, a curated set of attributes is averaged on the 1–20
 * scale and normalised to 0–100.  Higher is better.
 *
 * Special case — "globalRecruiter":
 *   Uses a proxy for adaptability: average of passing + stamina + firstTouch +
 *   decisionMaking (the "adaptability" attribute does not exist on the Player
 *   type, so it is replaced here by workRate as a stand-in).
 *
 * For "marketSmart" the additional PA-to-CA efficiency bonus is applied:
 *   if PA > CA * 1.2 (significant headroom), +10 pts.
 */
function scoreStyleFit(player: Player, club: Club): number {
  const philosophy = club.scoutingPhilosophy;

  // Resolve attribute list — replace "adaptability" with "workRate" for
  // globalRecruiter since the game has no adaptability attribute.
  const attrList: PlayerAttribute[] =
    PHILOSOPHY_KEY_ATTRIBUTES[philosophy].map((attr) =>
      attr === ("adaptability" as PlayerAttribute) ? "workRate" : attr,
    );

  const sum = attrList.reduce(
    (acc, attr) => acc + (player.attributes[attr] ?? 10),
    0,
  );
  const avgAttr = sum / attrList.length; // 1–20 scale

  // Convert 1–20 → 0–100
  let score = ((avgAttr - 1) / 19) * 100;

  // Philosophy-specific bonuses
  if (philosophy === "marketSmart") {
    const paHeadroom = player.potentialAbility - player.currentAbility;
    if (paHeadroom > player.currentAbility * 0.2) {
      score += 10; // PA significantly above CA — "undervalued" player
    }
  }

  if (philosophy === "winNow") {
    // Bonus for high consistency — wins-now clubs hate unreliable players
    const consistencyValue = player.attributes.consistency;
    if (consistencyValue >= 15) {
      score += 5;
    } else if (consistencyValue <= 8) {
      score -= 5;
    }
  }

  return clamp(score, 0, 100);
}

/**
 * Score age fit on a 0–100 scale.
 *
 * The player receives full marks within the preferred age window.
 * Beyond the window, marks fall by 5 per year to a minimum of 0.
 */
function scoreAgeFit(player: Player, club: Club): number {
  const [minAge, maxAge] = PHILOSOPHY_AGE_RANGES[club.scoutingPhilosophy];

  if (player.age >= minAge && player.age <= maxAge) {
    return 100;
  }

  const yearsOutside =
    player.age < minAge ? minAge - player.age : player.age - maxAge;

  return clamp(100 - yearsOutside * 5, 0, 100);
}

/**
 * Generate a list of human-readable strength descriptors based on fit scores.
 */
function buildFitStrengths(
  player: Player,
  positionFit: number,
  styleFit: number,
  ageFit: number,
  club: Club,
  manager: ManagerProfile,
): string[] {
  const strengths: string[] = [];

  if (positionFit >= POSITION_FIT_SCORES.PRIMARY) {
    strengths.push(
      `Natural ${player.position} — ideal fit for a ${manager.preferredFormation} system.`,
    );
  } else if (positionFit >= POSITION_FIT_SCORES.SECONDARY) {
    strengths.push(
      `Versatile: covers ${player.position} and can adapt to formation requirements.`,
    );
  }

  if (styleFit >= 75) {
    strengths.push(
      `Attributes align strongly with the club's ${club.scoutingPhilosophy} philosophy.`,
    );
  } else if (styleFit >= 55) {
    strengths.push(`Good attribute match for the club's preferred playing style.`);
  }

  if (ageFit >= 90) {
    strengths.push(`Age ${player.age} is squarely in the club's preferred development window.`);
  } else if (ageFit >= 70) {
    strengths.push(`Age ${player.age} is acceptable — fits within scouting parameters.`);
  }

  // High-value hidden attributes
  if (player.attributes.professionalism >= 16) {
    strengths.push("High professionalism — reliable training ground influence.");
  }
  if (player.attributes.bigGameTemperament >= 15) {
    strengths.push("Strong big-game temperament — performs when it matters most.");
  }

  return strengths;
}

/**
 * Generate a list of human-readable weakness descriptors based on fit scores.
 */
function buildFitWeaknesses(
  player: Player,
  positionFit: number,
  styleFit: number,
  ageFit: number,
  club: Club,
): string[] {
  const weaknesses: string[] = [];

  if (positionFit <= POSITION_FIT_SCORES.NONE) {
    weaknesses.push(
      `Position (${player.position}) does not fit the club's formation system.`,
    );
  } else if (positionFit <= POSITION_FIT_SCORES.ADJACENT) {
    weaknesses.push(
      `Player would need to adapt — not a natural fit for the required position.`,
    );
  }

  if (styleFit < 40) {
    weaknesses.push(
      `Attribute profile is a poor match for the club's ${club.scoutingPhilosophy} playing style.`,
    );
  } else if (styleFit < 55) {
    weaknesses.push("Some attribute gaps relative to the club's preferred style.");
  }

  if (ageFit < 50) {
    weaknesses.push(
      `Age ${player.age} falls well outside the preferred range — developmental or value concerns.`,
    );
  } else if (ageFit < 70) {
    weaknesses.push(`Age ${player.age} is on the edge of the preferred window.`);
  }

  // High injury proneness is always a red flag
  if (player.attributes.injuryProneness >= 15) {
    weaknesses.push("Injury history concerns — high injury proneness rating.");
  }

  // Low consistency for win-now clubs
  if (club.scoutingPhilosophy === "winNow" && player.attributes.consistency <= 8) {
    weaknesses.push("Inconsistent performer — a risk for a club chasing immediate results.");
  }

  return weaknesses;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Calculate the tactical system fit for a player at a given club.
 *
 * Scoring breakdown:
 *  - positionFit (0–100): Does the player's position fit the manager's formation?
 *  - styleFit    (0–100): Do the player's attributes align with the club's scouting philosophy?
 *  - ageFit      (0–100): Is the player's age within the club's preferred window?
 *  - overallFit  (0–100): Weighted composite — positionFit × 0.40 + styleFit × 0.35 + ageFit × 0.25
 *
 * @param player      - The player to evaluate.
 * @param club        - The club to evaluate the player against.
 * @param manager     - The club manager's profile (provides preferredFormation and preference).
 * @param allPlayers  - All players in the world (used for squad context; currently reserved).
 */
export function calculateSystemFit(
  player: Player,
  club: Club,
  manager: ManagerProfile,
  _allPlayers: Record<string, Player>,
): SystemFitResult {
  const positionFit = Math.round(scorePositionFit(player, manager));
  const styleFit = Math.round(scoreStyleFit(player, club));
  const ageFit = Math.round(scoreAgeFit(player, club));

  const overallFit = Math.round(
    positionFit * 0.4 + styleFit * 0.35 + ageFit * 0.25,
  );

  const fitStrengths = buildFitStrengths(
    player, positionFit, styleFit, ageFit, club, manager,
  );
  const fitWeaknesses = buildFitWeaknesses(
    player, positionFit, styleFit, ageFit, club,
  );

  return {
    playerId: player.id,
    clubId: club.id,
    overallFit: clamp(overallFit, 0, 100),
    positionFit: clamp(positionFit, 0, 100),
    styleFit: clamp(styleFit, 0, 100),
    ageFit: clamp(ageFit, 0, 100),
    fitStrengths,
    fitWeaknesses,
  };
}

// =============================================================================
// RE-EXPORTS FOR TESTING
// =============================================================================

// Exported for use in unit tests — not part of the primary engine API surface.
export { parseFormation, formationPositions, ADJACENT_POSITIONS };
