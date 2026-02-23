/**
 * Match Positions
 *
 * Formation position data and phase-aware player drift calculations
 * for the PitchCanvas top-down view.
 *
 * Coordinate system:
 *   x: 0–100 (percentage of pitch width, 0=left touchline, 100=right)
 *   y: 0–100 (percentage of pitch height, 0=home goal line, 100=away goal line)
 */

export interface FormationPosition {
  x: number;
  y: number;
}

export type Formation = Record<string, FormationPosition>;

// ---------------------------------------------------------------------------
// Formation data
// ---------------------------------------------------------------------------

export const FORMATIONS: Record<string, Formation> = {
  "4-4-2": {
    GK:  { x: 50, y: 5 },
    LB:  { x: 15, y: 25 }, CB1: { x: 38, y: 22 }, CB2: { x: 62, y: 22 }, RB: { x: 85, y: 25 },
    LM:  { x: 15, y: 50 }, CM1: { x: 38, y: 48 }, CM2: { x: 62, y: 48 }, RM: { x: 85, y: 50 },
    ST1: { x: 38, y: 75 }, ST2: { x: 62, y: 75 },
  },
  "4-3-3": {
    GK:  { x: 50, y: 5 },
    LB:  { x: 15, y: 25 }, CB1: { x: 38, y: 22 }, CB2: { x: 62, y: 22 }, RB: { x: 85, y: 25 },
    CM1: { x: 30, y: 45 }, CDM: { x: 50, y: 40 }, CM2: { x: 70, y: 45 },
    LW:  { x: 20, y: 72 }, ST:  { x: 50, y: 78 }, RW: { x: 80, y: 72 },
  },
  "3-5-2": {
    GK:  { x: 50, y: 5 },
    CB1: { x: 30, y: 22 }, CB2: { x: 50, y: 20 }, CB3: { x: 70, y: 22 },
    LWB: { x: 10, y: 45 }, CM1: { x: 35, y: 45 }, CDM: { x: 50, y: 38 }, CM2: { x: 65, y: 45 }, RWB: { x: 90, y: 45 },
    ST1: { x: 40, y: 75 }, ST2: { x: 60, y: 75 },
  },
};

// ---------------------------------------------------------------------------
// Default single-position mapping — used when formation is unknown
// ---------------------------------------------------------------------------

/**
 * Maps a player position code to a sensible default pitch location.
 * Used when we do not know the full team formation.
 */
export const POSITION_DEFAULTS: Record<string, FormationPosition> = {
  GK:  { x: 50, y: 5  },
  CB:  { x: 50, y: 20 },
  LB:  { x: 15, y: 25 },
  RB:  { x: 85, y: 25 },
  CDM: { x: 50, y: 38 },
  CM:  { x: 50, y: 48 },
  CAM: { x: 50, y: 60 },
  LW:  { x: 20, y: 72 },
  RW:  { x: 80, y: 72 },
  ST:  { x: 50, y: 78 },
};

// ---------------------------------------------------------------------------
// Phase zone mapping — where the ball spends most time during a phase type
// ---------------------------------------------------------------------------

/**
 * Returns the approximate zone (as a pitch percentage point) that the action
 * gravitates toward during the given phase type.
 */
export function getPhaseZone(phaseType: string): FormationPosition {
  switch (phaseType) {
    case "buildUp":          return { x: 50, y: 35 };
    case "counterAttack":    return { x: 50, y: 75 };
    case "setpiece":         return { x: 50, y: 80 };
    case "pressingSequence": return { x: 50, y: 60 };
    case "possession":       return { x: 50, y: 50 };
    case "transition":       return { x: 50, y: 55 };
    default:                 return { x: 50, y: 50 };
  }
}

// ---------------------------------------------------------------------------
// Position calculation with phase drift
// ---------------------------------------------------------------------------

/**
 * Blends a player's base formation position toward the active phase zone.
 *
 * @param basePosition    - The player's default formation position (0–100 coords)
 * @param phaseType       - Current phase type string
 * @param isInvolved      - Whether this player is listed in involvedPlayerIds
 * @param isFocused       - Whether this player is the scout's focus target
 * @returns               - Final {x, y} position for rendering on canvas
 */
export function getPlayerPositionInPhase(
  basePosition: FormationPosition,
  phaseType: string,
  isInvolved: boolean,
  isFocused: boolean,
): FormationPosition {
  if (!isInvolved) {
    // Non-involved players stay at their formation position
    return basePosition;
  }

  const zone = getPhaseZone(phaseType);

  // Focused player drifts more toward the action zone
  const driftFactor = isFocused ? 0.35 : 0.20;

  return {
    x: basePosition.x + (zone.x - basePosition.x) * driftFactor,
    y: basePosition.y + (zone.y - basePosition.y) * driftFactor,
  };
}

/**
 * Resolves a player's pitch position given their position code.
 * Looks up POSITION_DEFAULTS as a fallback formation layout.
 */
export function resolvePlayerPosition(
  positionCode: string,
  formation: Formation | null,
  slotKey: string | null,
): FormationPosition {
  // Try explicit slot in the provided formation first
  if (formation && slotKey && slotKey in formation) {
    return formation[slotKey];
  }
  // Fall back to default position for the position code
  if (positionCode in POSITION_DEFAULTS) {
    return POSITION_DEFAULTS[positionCode];
  }
  // Last resort: centre of pitch
  return { x: 50, y: 50 };
}
