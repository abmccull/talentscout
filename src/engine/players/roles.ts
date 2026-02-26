/**
 * Player role system — defines tactical roles, suitability calculations,
 * and role assignment for players.
 *
 * Each position has 2-4 compatible roles. A player's suitability for a role
 * is computed from weighted attribute averages plus trait bonuses.
 */

import type {
  Player,
  PlayerAttribute,
  PlayerRole,
  PlayerTrait,
  Position,
  RoleDuty,
} from "@/engine/core/types";

// =============================================================================
// ROLE DEFINITION
// =============================================================================

export interface RoleDefinition {
  role: PlayerRole;
  positions: Position[];
  keyAttributes: Array<{ attr: PlayerAttribute; weight: number }>;
  secondaryAttributes: Array<{ attr: PlayerAttribute; weight: number }>;
  preferredTraits: PlayerTrait[];
  conflictingTraits: PlayerTrait[];
  availableDuties: RoleDuty[];
}

// =============================================================================
// ROLE DEFINITIONS (25 roles)
// =============================================================================

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  // --- GK ---
  {
    role: "shotStopper",
    positions: ["GK"],
    keyAttributes: [
      { attr: "positioning", weight: 1.5 },
      { attr: "composure", weight: 1.4 },
      { attr: "agility", weight: 1.3 },
      { attr: "strength", weight: 1.2 },
      { attr: "anticipation", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "leadership", weight: 1.1 },
      { attr: "decisionMaking", weight: 1.0 },
    ],
    preferredTraits: [],
    conflictingTraits: [],
    availableDuties: ["defend"],
  },
  {
    role: "sweeper",
    positions: ["GK"],
    keyAttributes: [
      { attr: "pace", weight: 1.4 },
      { attr: "passing", weight: 1.4 },
      { attr: "anticipation", weight: 1.3 },
      { attr: "composure", weight: 1.3 },
      { attr: "firstTouch", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "positioning", weight: 1.1 },
      { attr: "decisionMaking", weight: 1.1 },
      { attr: "vision", weight: 1.0 },
    ],
    preferredTraits: ["playsShortPasses"],
    conflictingTraits: [],
    availableDuties: ["defend", "support"],
  },

  // --- CB ---
  {
    role: "ballPlayingDefender",
    positions: ["CB"],
    keyAttributes: [
      { attr: "passing", weight: 1.4 },
      { attr: "composure", weight: 1.4 },
      { attr: "defensiveAwareness", weight: 1.3 },
      { attr: "tackling", weight: 1.2 },
      { attr: "vision", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "firstTouch", weight: 1.1 },
      { attr: "anticipation", weight: 1.0 },
      { attr: "strength", weight: 1.0 },
    ],
    preferredTraits: ["playsShortPasses", "dictatesTempo"],
    conflictingTraits: ["divesStraightIn"],
    availableDuties: ["defend", "support"],
  },
  {
    role: "noNonsenseCB",
    positions: ["CB"],
    keyAttributes: [
      { attr: "tackling", weight: 1.5 },
      { attr: "heading", weight: 1.4 },
      { attr: "strength", weight: 1.4 },
      { attr: "marking", weight: 1.3 },
      { attr: "jumping", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "anticipation", weight: 1.1 },
      { attr: "positioning", weight: 1.1 },
      { attr: "teamwork", weight: 1.0 },
    ],
    preferredTraits: ["marksPlayerTightly", "staysBack"],
    conflictingTraits: ["triesTricks", "runsWithBall"],
    availableDuties: ["defend"],
  },
  {
    role: "libero",
    positions: ["CB"],
    keyAttributes: [
      { attr: "passing", weight: 1.5 },
      { attr: "dribbling", weight: 1.3 },
      { attr: "composure", weight: 1.3 },
      { attr: "vision", weight: 1.3 },
      { attr: "anticipation", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "tackling", weight: 1.1 },
      { attr: "decisionMaking", weight: 1.1 },
      { attr: "pace", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "dictatesTempo"],
    conflictingTraits: ["staysBack"],
    availableDuties: ["support", "attack"],
  },

  // --- LB/RB ---
  {
    role: "fullBack",
    positions: ["LB", "RB"],
    keyAttributes: [
      { attr: "tackling", weight: 1.4 },
      { attr: "stamina", weight: 1.3 },
      { attr: "marking", weight: 1.3 },
      { attr: "pace", weight: 1.2 },
      { attr: "teamwork", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "crossing", weight: 1.1 },
      { attr: "positioning", weight: 1.0 },
      { attr: "anticipation", weight: 1.0 },
    ],
    preferredTraits: ["staysBack", "marksPlayerTightly"],
    conflictingTraits: ["driftsWide", "arrivesLateInBox"],
    availableDuties: ["defend", "support"],
  },
  {
    role: "wingBack",
    positions: ["LB", "RB"],
    keyAttributes: [
      { attr: "crossing", weight: 1.5 },
      { attr: "pace", weight: 1.4 },
      { attr: "stamina", weight: 1.4 },
      { attr: "dribbling", weight: 1.2 },
      { attr: "workRate", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "agility", weight: 1.1 },
      { attr: "teamwork", weight: 1.0 },
      { attr: "tackling", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "driftsWide"],
    conflictingTraits: ["staysBack"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "invertedFullBack",
    positions: ["LB", "RB"],
    keyAttributes: [
      { attr: "passing", weight: 1.4 },
      { attr: "composure", weight: 1.3 },
      { attr: "vision", weight: 1.3 },
      { attr: "firstTouch", weight: 1.2 },
      { attr: "teamwork", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "tackling", weight: 1.1 },
      { attr: "anticipation", weight: 1.0 },
      { attr: "decisionMaking", weight: 1.0 },
    ],
    preferredTraits: ["playsShortPasses", "dictatesTempo"],
    conflictingTraits: ["driftsWide", "runsWithBall"],
    availableDuties: ["defend", "support"],
  },

  // --- CDM ---
  {
    role: "anchorMan",
    positions: ["CDM"],
    keyAttributes: [
      { attr: "tackling", weight: 1.5 },
      { attr: "marking", weight: 1.4 },
      { attr: "positioning", weight: 1.4 },
      { attr: "strength", weight: 1.3 },
      { attr: "teamwork", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "anticipation", weight: 1.1 },
      { attr: "composure", weight: 1.0 },
      { attr: "heading", weight: 1.0 },
    ],
    preferredTraits: ["staysBack", "marksPlayerTightly"],
    conflictingTraits: ["arrivesLateInBox", "shootsFromDistance"],
    availableDuties: ["defend"],
  },
  {
    role: "halfBack",
    positions: ["CDM"],
    keyAttributes: [
      { attr: "positioning", weight: 1.4 },
      { attr: "anticipation", weight: 1.4 },
      { attr: "tackling", weight: 1.3 },
      { attr: "teamwork", weight: 1.3 },
      { attr: "marking", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "passing", weight: 1.1 },
      { attr: "composure", weight: 1.0 },
      { attr: "decisionMaking", weight: 1.0 },
    ],
    preferredTraits: ["dropsDeep", "staysBack"],
    conflictingTraits: ["arrivesLateInBox"],
    availableDuties: ["defend"],
  },
  {
    role: "deepLyingPlaymaker",
    positions: ["CDM", "CM"],
    keyAttributes: [
      { attr: "passing", weight: 1.5 },
      { attr: "vision", weight: 1.5 },
      { attr: "composure", weight: 1.3 },
      { attr: "firstTouch", weight: 1.2 },
      { attr: "positioning", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "decisionMaking", weight: 1.1 },
      { attr: "teamwork", weight: 1.1 },
      { attr: "anticipation", weight: 1.0 },
    ],
    preferredTraits: ["dictatesTempo", "playsShortPasses", "triesKillerBalls"],
    conflictingTraits: ["shootsFromDistance", "divesStraightIn"],
    availableDuties: ["defend", "support"],
  },

  // --- CM ---
  {
    role: "boxToBox",
    positions: ["CM"],
    keyAttributes: [
      { attr: "stamina", weight: 1.5 },
      { attr: "workRate", weight: 1.4 },
      { attr: "tackling", weight: 1.3 },
      { attr: "passing", weight: 1.2 },
      { attr: "shooting", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "teamwork", weight: 1.1 },
      { attr: "strength", weight: 1.0 },
      { attr: "anticipation", weight: 1.0 },
    ],
    preferredTraits: ["arrivesLateInBox", "runsWithBall"],
    conflictingTraits: ["staysBack", "dropsDeep"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "mezzala",
    positions: ["CM"],
    keyAttributes: [
      { attr: "dribbling", weight: 1.4 },
      { attr: "passing", weight: 1.3 },
      { attr: "pace", weight: 1.3 },
      { attr: "agility", weight: 1.2 },
      { attr: "shooting", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "balance", weight: 1.1 },
      { attr: "vision", weight: 1.1 },
      { attr: "composure", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "movesIntoChannels"],
    conflictingTraits: ["staysBack"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "advancedPlaymaker",
    positions: ["CM", "CAM"],
    keyAttributes: [
      { attr: "passing", weight: 1.5 },
      { attr: "vision", weight: 1.5 },
      { attr: "firstTouch", weight: 1.3 },
      { attr: "composure", weight: 1.3 },
      { attr: "decisionMaking", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "dribbling", weight: 1.1 },
      { attr: "balance", weight: 1.0 },
      { attr: "anticipation", weight: 1.0 },
    ],
    preferredTraits: ["triesKillerBalls", "dictatesTempo", "playsShortPasses"],
    conflictingTraits: ["shootsFromDistance"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "carrilero",
    positions: ["CM"],
    keyAttributes: [
      { attr: "stamina", weight: 1.4 },
      { attr: "teamwork", weight: 1.4 },
      { attr: "workRate", weight: 1.3 },
      { attr: "positioning", weight: 1.3 },
      { attr: "tackling", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "passing", weight: 1.1 },
      { attr: "anticipation", weight: 1.1 },
      { attr: "marking", weight: 1.0 },
    ],
    preferredTraits: ["staysBack", "playsShortPasses"],
    conflictingTraits: ["arrivesLateInBox", "shootsFromDistance"],
    availableDuties: ["support"],
  },

  // --- CAM ---
  {
    role: "enganche",
    positions: ["CAM"],
    keyAttributes: [
      { attr: "vision", weight: 1.5 },
      { attr: "passing", weight: 1.5 },
      { attr: "firstTouch", weight: 1.4 },
      { attr: "composure", weight: 1.3 },
      { attr: "dribbling", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "balance", weight: 1.1 },
      { attr: "decisionMaking", weight: 1.0 },
    ],
    preferredTraits: ["dictatesTempo", "triesKillerBalls"],
    conflictingTraits: ["staysBack", "divesStraightIn"],
    availableDuties: ["support"],
  },
  {
    role: "shadowStriker",
    positions: ["CAM"],
    keyAttributes: [
      { attr: "offTheBall", weight: 1.5 },
      { attr: "finishing", weight: 1.4 },
      { attr: "anticipation", weight: 1.3 },
      { attr: "composure", weight: 1.3 },
      { attr: "pace", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "dribbling", weight: 1.1 },
      { attr: "decisionMaking", weight: 1.0 },
    ],
    preferredTraits: ["movesIntoChannels", "arrivesLateInBox"],
    conflictingTraits: ["staysBack", "dropsDeep"],
    availableDuties: ["attack"],
  },
  {
    role: "trequartista",
    positions: ["CAM"],
    keyAttributes: [
      { attr: "dribbling", weight: 1.5 },
      { attr: "firstTouch", weight: 1.4 },
      { attr: "vision", weight: 1.4 },
      { attr: "composure", weight: 1.3 },
      { attr: "balance", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "passing", weight: 1.1 },
      { attr: "shooting", weight: 1.1 },
      { attr: "agility", weight: 1.0 },
    ],
    preferredTraits: ["triesTricks", "triesKillerBalls", "driftsWide"],
    conflictingTraits: ["staysBack", "marksPlayerTightly"],
    availableDuties: ["support", "attack"],
  },

  // --- LW/RW ---
  {
    role: "winger",
    positions: ["LW", "RW"],
    keyAttributes: [
      { attr: "pace", weight: 1.5 },
      { attr: "crossing", weight: 1.5 },
      { attr: "dribbling", weight: 1.4 },
      { attr: "agility", weight: 1.2 },
      { attr: "stamina", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "firstTouch", weight: 1.1 },
      { attr: "balance", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "driftsWide"],
    conflictingTraits: ["cutsInside", "staysBack"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "invertedWinger",
    positions: ["LW", "RW"],
    keyAttributes: [
      { attr: "dribbling", weight: 1.5 },
      { attr: "shooting", weight: 1.4 },
      { attr: "agility", weight: 1.3 },
      { attr: "pace", weight: 1.3 },
      { attr: "finishing", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "balance", weight: 1.1 },
      { attr: "composure", weight: 1.0 },
    ],
    preferredTraits: ["cutsInside", "shootsFromDistance"],
    conflictingTraits: ["staysBack"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "insideForward",
    positions: ["LW", "RW"],
    keyAttributes: [
      { attr: "finishing", weight: 1.5 },
      { attr: "pace", weight: 1.4 },
      { attr: "offTheBall", weight: 1.3 },
      { attr: "dribbling", weight: 1.3 },
      { attr: "composure", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "anticipation", weight: 1.1 },
      { attr: "firstTouch", weight: 1.0 },
    ],
    preferredTraits: ["cutsInside", "movesIntoChannels"],
    conflictingTraits: ["staysBack", "driftsWide"],
    availableDuties: ["support", "attack"],
  },

  // --- ST ---
  {
    role: "poacher",
    positions: ["ST"],
    keyAttributes: [
      { attr: "finishing", weight: 1.5 },
      { attr: "offTheBall", weight: 1.5 },
      { attr: "composure", weight: 1.3 },
      { attr: "anticipation", weight: 1.3 },
      { attr: "pace", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "firstTouch", weight: 1.1 },
      { attr: "heading", weight: 1.0 },
    ],
    preferredTraits: ["placesShots", "movesIntoChannels"],
    conflictingTraits: ["dropsDeep", "staysBack"],
    availableDuties: ["attack"],
  },
  {
    role: "targetMan",
    positions: ["ST"],
    keyAttributes: [
      { attr: "heading", weight: 1.5 },
      { attr: "jumping", weight: 1.4 },
      { attr: "strength", weight: 1.4 },
      { attr: "firstTouch", weight: 1.2 },
      { attr: "balance", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "finishing", weight: 1.1 },
      { attr: "composure", weight: 1.0 },
      { attr: "teamwork", weight: 1.0 },
    ],
    preferredTraits: ["holdsUpBall", "bringsOthersIntoPlay", "playsWithBackToGoal"],
    conflictingTraits: ["triesTricks"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "advancedForward",
    positions: ["ST"],
    keyAttributes: [
      { attr: "finishing", weight: 1.4 },
      { attr: "dribbling", weight: 1.3 },
      { attr: "firstTouch", weight: 1.3 },
      { attr: "pace", weight: 1.3 },
      { attr: "composure", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "offTheBall", weight: 1.1 },
      { attr: "strength", weight: 1.0 },
      { attr: "balance", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "movesIntoChannels"],
    conflictingTraits: ["staysBack", "dropsDeep"],
    availableDuties: ["support", "attack"],
  },
  {
    role: "pressingForward",
    positions: ["ST"],
    keyAttributes: [
      { attr: "workRate", weight: 1.5 },
      { attr: "pressing", weight: 1.4 },
      { attr: "stamina", weight: 1.3 },
      { attr: "pace", weight: 1.3 },
      { attr: "teamwork", weight: 1.2 },
    ],
    secondaryAttributes: [
      { attr: "finishing", weight: 1.1 },
      { attr: "anticipation", weight: 1.1 },
      { attr: "strength", weight: 1.0 },
    ],
    preferredTraits: ["runsWithBall", "divesStraightIn"],
    conflictingTraits: ["dropsDeep", "staysBack"],
    availableDuties: ["support", "attack"],
  },
];

// =============================================================================
// SUITABILITY CALCULATION
// =============================================================================

/**
 * Calculate how suitable a player is for a specific role.
 *
 * Formula:
 *   score = weightedAvg(keyAttrs) * 0.65 + weightedAvg(secondaryAttrs) * 0.35
 *   roleSuitability = (score / 20) * 100
 *     + (5 per matching preferred trait) + (-5 per matching conflicting trait)
 *     + dutyShift (±3)
 */
export function calculateRoleSuitability(
  player: Player,
  role: PlayerRole,
  duty?: RoleDuty,
): number {
  const def = ROLE_DEFINITIONS.find((d) => d.role === role);
  if (!def) return 0;

  // Weighted average of key attributes
  const keySum = def.keyAttributes.reduce(
    (acc, { attr, weight }) => acc + (player.attributes[attr] ?? 10) * weight,
    0,
  );
  const keyWeightSum = def.keyAttributes.reduce((acc, { weight }) => acc + weight, 0);
  const keyAvg = keyWeightSum > 0 ? keySum / keyWeightSum : 10;

  // Weighted average of secondary attributes
  const secSum = def.secondaryAttributes.reduce(
    (acc, { attr, weight }) => acc + (player.attributes[attr] ?? 10) * weight,
    0,
  );
  const secWeightSum = def.secondaryAttributes.reduce((acc, { weight }) => acc + weight, 0);
  const secAvg = secWeightSum > 0 ? secSum / secWeightSum : 10;

  const score = keyAvg * 0.65 + secAvg * 0.35;
  let suitability = (score / 20) * 100;

  // Trait bonuses/penalties
  const playerTraits = player.playerTraits ?? [];
  for (const trait of playerTraits) {
    if (def.preferredTraits.includes(trait)) suitability += 5;
    if (def.conflictingTraits.includes(trait)) suitability -= 5;
  }

  // Duty shift
  if (duty) {
    if (duty === "attack") suitability += 3;
    else if (duty === "defend") suitability -= 3;
  }

  return Math.round(Math.max(0, Math.min(100, suitability)));
}

/**
 * Get the best role for a player at a specific position.
 * If no position is specified, uses the player's primary position.
 */
export function getBestRole(
  player: Player,
  position?: Position,
): { role: PlayerRole; suitability: number } {
  const pos = position ?? player.position;
  const compatibleRoles = ROLE_DEFINITIONS.filter((d) => d.positions.includes(pos));

  let best: { role: PlayerRole; suitability: number } = {
    role: compatibleRoles[0]?.role ?? "boxToBox",
    suitability: 0,
  };

  for (const def of compatibleRoles) {
    const suit = calculateRoleSuitability(player, def.role);
    if (suit > best.suitability) {
      best = { role: def.role, suitability: suit };
    }
  }

  return best;
}

/**
 * Get all compatible roles for a player at their position,
 * sorted by suitability (highest first).
 */
export function getCompatibleRoles(
  player: Player,
  position?: Position,
): Array<{ role: PlayerRole; suitability: number }> {
  const pos = position ?? player.position;
  const compatibleRoles = ROLE_DEFINITIONS.filter((d) => d.positions.includes(pos));

  return compatibleRoles
    .map((def) => ({
      role: def.role,
      suitability: calculateRoleSuitability(player, def.role),
    }))
    .sort((a, b) => b.suitability - a.suitability);
}

/**
 * Get a role definition by role name.
 */
export function getRoleDefinition(role: PlayerRole): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((d) => d.role === role);
}
