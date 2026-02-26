/**
 * Tactical system fit analysis for first-team scouts.
 *
 * Calculates how well a player fits a club's tactical system across four
 * dimensions: position fit, role fit, tactical fit, and age fit.
 *
 * New formula (v2):
 *   overallFit = positionFit(25%) + roleFit(30%) + tacticalFit(25%) + ageFit(20%)
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
  PlayerRole,
  PlayerTrait,
  Position,
  ScoutingPhilosophy,
  SystemFitResult,
  TacticalIdentity,
} from "@/engine/core/types";
import { calculateRoleSuitability, getBestRole } from "@/engine/players/roles";

// =============================================================================
// CONSTANTS
// =============================================================================

const POSITION_FIT_SCORES = {
  PRIMARY: 100,
  SECONDARY: 70,
  ADJACENT: 40,
  NONE: 10,
} as const;

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
 * Attributes valued by each tactical identity for tactical fit scoring.
 */
const TACTICAL_FIT_ATTRIBUTES: Record<TacticalIdentity, PlayerAttribute[]> = {
  possessionBased: ["passing", "firstTouch", "vision", "composure", "teamwork", "balance"],
  highPress: ["pressing", "stamina", "workRate", "anticipation", "pace", "teamwork"],
  counterAttacking: ["pace", "dribbling", "finishing", "anticipation", "offTheBall", "composure"],
  directPlay: ["heading", "jumping", "strength", "crossing", "stamina", "workRate"],
  balanced: ["decisionMaking", "teamwork", "stamina", "passing", "composure", "workRate"],
  wingPlay: ["crossing", "pace", "dribbling", "agility", "stamina", "offTheBall"],
};

/**
 * Trait-tactical identity penalties: behavioral traits that conflict with a club's style.
 */
const TRAIT_IDENTITY_PENALTIES: Partial<Record<TacticalIdentity, PlayerTrait[]>> = {
  possessionBased: ["shootsFromDistance", "divesStraightIn"],
  highPress: ["staysBack", "dropsDeep"],
  counterAttacking: ["playsShortPasses", "dictatesTempo"],
  directPlay: ["playsShortPasses", "dictatesTempo", "triesTricks"],
};

const TRAIT_IDENTITY_BONUSES: Partial<Record<TacticalIdentity, PlayerTrait[]>> = {
  possessionBased: ["playsShortPasses", "dictatesTempo", "playsOneTwo"],
  highPress: ["divesStraightIn", "runsWithBall"],
  counterAttacking: ["movesIntoChannels", "runsWithBall", "cutsInside"],
  directPlay: ["holdsUpBall", "playsWithBackToGoal"],
  wingPlay: ["driftsWide", "runsWithBall", "cutsInside"],
};

const PHILOSOPHY_AGE_RANGES: Record<ScoutingPhilosophy, [number, number]> = {
  winNow: [24, 31],
  academyFirst: [17, 23],
  marketSmart: [21, 27],
  globalRecruiter: [19, 29],
} as const;

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseFormation(
  formation: string,
): { defenders: number; midfielders: number; forwards: number } | null {
  const parts = formation.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  const [defenders, midfielders, forwards] = parts;
  return { defenders, midfielders, forwards };
}

function formationPositions(
  defenders: number,
  midfielders: number,
  forwards: number,
): Set<Position> {
  const required = new Set<Position>(["GK", "CB"]);
  if (defenders >= 4) { required.add("LB"); required.add("RB"); }
  if (midfielders >= 2) required.add("CM");
  if (midfielders >= 3) required.add("CDM");
  if (midfielders >= 4) required.add("CAM");
  if (forwards >= 1) required.add("ST");
  if (forwards >= 3) { required.add("LW"); required.add("RW"); }
  return required;
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Score positional fit (0-100).
 */
function scorePositionFit(player: Player, manager: ManagerProfile): number {
  const parsed = parseFormation(manager.preferredFormation);
  if (!parsed) return 50;

  const { defenders, midfielders, forwards } = parsed;
  const requiredPositions = formationPositions(defenders, midfielders, forwards);

  if (requiredPositions.has(player.position)) return POSITION_FIT_SCORES.PRIMARY;

  for (const secondary of player.secondaryPositions) {
    if (requiredPositions.has(secondary)) return POSITION_FIT_SCORES.SECONDARY;
  }

  const adjacentToPlayer = ADJACENT_POSITIONS[player.position];
  for (const adj of adjacentToPlayer) {
    if (requiredPositions.has(adj)) return POSITION_FIT_SCORES.ADJACENT;
  }

  return POSITION_FIT_SCORES.NONE;
}

/**
 * Score role fit (0-100).
 * Uses calculateRoleSuitability from roles.ts against the directive's preferred role
 * or the club's best-fit role for the player's position.
 */
function scoreRoleFit(
  player: Player,
  preferredRole?: PlayerRole,
): { score: number; suggestedRole: PlayerRole } {
  const best = getBestRole(player);

  if (preferredRole) {
    const suitability = calculateRoleSuitability(player, preferredRole);
    return { score: suitability, suggestedRole: best.role };
  }

  return { score: best.suitability, suggestedRole: best.role };
}

/**
 * Score tactical fit (0-100).
 * Evaluates player attributes against the club's tactical identity.
 * Also factors in behavioral trait compatibility.
 */
function scoreTacticalFit(player: Player, club: Club): number {
  const style = club.tacticalStyle;
  if (!style) {
    // No tactical style → neutral score based on philosophy
    return 50;
  }

  const identity = style.tacticalIdentity;
  const relevantAttrs = TACTICAL_FIT_ATTRIBUTES[identity];

  // Attribute average (1-20 → 0-100)
  const sum = relevantAttrs.reduce(
    (acc, attr) => acc + (player.attributes[attr] ?? 10),
    0,
  );
  const avgAttr = sum / relevantAttrs.length;
  let score = ((avgAttr - 1) / 19) * 100;

  // Dimensional penalties: high pressing intensity + low pressing/stamina = bad
  if (style.pressingIntensity >= 14) {
    const pressingAvg = ((player.attributes.pressing ?? 10) + (player.attributes.stamina ?? 10)) / 2;
    if (pressingAvg < 10) score -= 8;
  }
  if (style.defensiveLine >= 14) {
    if ((player.attributes.pace ?? 10) < 10) score -= 5; // high line needs pace
  }
  if (style.directness <= 6) {
    // Low directness = short passing style
    if ((player.attributes.passing ?? 10) < 10 || (player.attributes.firstTouch ?? 10) < 10) score -= 5;
  }

  // Behavioral trait bonuses/penalties
  const playerTraits = player.playerTraits ?? [];
  const penalties = TRAIT_IDENTITY_PENALTIES[identity] ?? [];
  const bonuses = TRAIT_IDENTITY_BONUSES[identity] ?? [];

  for (const trait of playerTraits) {
    if (penalties.includes(trait)) score -= 5;
    if (bonuses.includes(trait)) score += 5;
  }

  return clamp(Math.round(score), 0, 100);
}

/**
 * Score age fit (0-100).
 */
function scoreAgeFit(player: Player, club: Club): number {
  const [minAge, maxAge] = PHILOSOPHY_AGE_RANGES[club.scoutingPhilosophy];

  if (player.age >= minAge && player.age <= maxAge) return 100;

  const yearsOutside =
    player.age < minAge ? minAge - player.age : player.age - maxAge;

  return clamp(100 - yearsOutside * 5, 0, 100);
}

// =============================================================================
// DESCRIPTORS
// =============================================================================

function buildFitStrengths(
  player: Player,
  positionFit: number,
  roleFit: number,
  tacticalFit: number,
  ageFit: number,
  club: Club,
  manager: ManagerProfile,
  suggestedRole: PlayerRole,
): string[] {
  const strengths: string[] = [];

  if (positionFit >= POSITION_FIT_SCORES.PRIMARY) {
    strengths.push(`Natural ${player.position} — ideal fit for a ${manager.preferredFormation} system.`);
  } else if (positionFit >= POSITION_FIT_SCORES.SECONDARY) {
    strengths.push(`Versatile: covers ${player.position} and can adapt to formation requirements.`);
  }

  if (roleFit >= 70) {
    const roleLabel = suggestedRole.replace(/([A-Z])/g, " $1").trim();
    strengths.push(`Strong fit as a ${roleLabel} — attributes align well with role demands.`);
  }

  if (tacticalFit >= 75) {
    const identity = club.tacticalStyle?.tacticalIdentity ?? "balanced";
    strengths.push(`Attributes suit the club's ${identity.replace(/([A-Z])/g, " $1").trim()} tactical approach.`);
  } else if (tacticalFit >= 55) {
    strengths.push("Good tactical compatibility with the club's playing style.");
  }

  if (ageFit >= 90) {
    strengths.push(`Age ${player.age} is squarely in the club's preferred window.`);
  }

  if (player.attributes.professionalism >= 16) {
    strengths.push("High professionalism — reliable training ground influence.");
  }

  return strengths;
}

function buildFitWeaknesses(
  player: Player,
  positionFit: number,
  roleFit: number,
  tacticalFit: number,
  ageFit: number,
  club: Club,
): string[] {
  const weaknesses: string[] = [];

  if (positionFit <= POSITION_FIT_SCORES.NONE) {
    weaknesses.push(`Position (${player.position}) does not fit the club's formation system.`);
  } else if (positionFit <= POSITION_FIT_SCORES.ADJACENT) {
    weaknesses.push("Player would need to adapt — not a natural fit for the required position.");
  }

  if (roleFit < 40) {
    weaknesses.push("Attribute profile doesn't match any role the club typically employs.");
  }

  if (tacticalFit < 40) {
    const identity = club.tacticalStyle?.tacticalIdentity ?? "balanced";
    weaknesses.push(`Poor tactical fit for the club's ${identity.replace(/([A-Z])/g, " $1").trim()} system.`);
  } else if (tacticalFit < 55) {
    weaknesses.push("Some tactical gaps relative to the club's preferred style.");
  }

  if (ageFit < 50) {
    weaknesses.push(`Age ${player.age} falls outside the preferred range — value concerns.`);
  } else if (ageFit < 70) {
    weaknesses.push(`Age ${player.age} is on the edge of the preferred window.`);
  }

  if (player.attributes.injuryProneness >= 15) {
    weaknesses.push("Injury history concerns — high injury proneness rating.");
  }

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
 * New formula (v2):
 *   overallFit = positionFit(25%) + roleFit(30%) + tacticalFit(25%) + ageFit(20%)
 */
export function calculateSystemFit(
  player: Player,
  club: Club,
  manager: ManagerProfile,
  _allPlayers: Record<string, Player>,
  preferredRole?: PlayerRole,
): SystemFitResult {
  const positionFit = Math.round(scorePositionFit(player, manager));
  const { score: roleFitScore, suggestedRole } = scoreRoleFit(player, preferredRole);
  const roleFit = Math.round(roleFitScore);
  const tacticalFit = Math.round(scoreTacticalFit(player, club));
  const ageFit = Math.round(scoreAgeFit(player, club));

  // Style fit kept for backward compatibility — uses tactical fit value
  const styleFit = tacticalFit;

  const overallFit = Math.round(
    positionFit * 0.25 + roleFit * 0.30 + tacticalFit * 0.25 + ageFit * 0.20,
  );

  const fitStrengths = buildFitStrengths(
    player, positionFit, roleFit, tacticalFit, ageFit, club, manager, suggestedRole,
  );
  const fitWeaknesses = buildFitWeaknesses(
    player, positionFit, roleFit, tacticalFit, ageFit, club,
  );

  return {
    playerId: player.id,
    clubId: club.id,
    overallFit: clamp(overallFit, 0, 100),
    positionFit: clamp(positionFit, 0, 100),
    styleFit: clamp(styleFit, 0, 100),
    ageFit: clamp(ageFit, 0, 100),
    roleFit: clamp(roleFit, 0, 100),
    tacticalFit: clamp(tacticalFit, 0, 100),
    suggestedRole,
    fitStrengths,
    fitWeaknesses,
  };
}

// =============================================================================
// RE-EXPORTS FOR TESTING
// =============================================================================

export { parseFormation, formationPositions, ADJACENT_POSITIONS };
