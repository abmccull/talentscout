import type { MatchPhaseType } from "@/engine/core/types";
import type {
  PlayerMoment,
  SessionPhase,
  SessionPlayer,
} from "@/engine/observation/types";
import {
  POSITION_DEFAULTS,
  getPlayerPositionInPhase,
} from "@/components/game/match/matchPositions";

export interface ObservationPitchMarker {
  playerId: string;
  name: string;
  position: string;
  normalizedPosition: keyof typeof POSITION_DEFAULTS;
  /** Horizontal pitch coordinate expressed as a percentage. */
  x: number;
  /** Vertical pitch coordinate expressed as a percentage. */
  y: number;
  momentCount: number;
  hasMoment: boolean;
  isStandout: boolean;
  isFocused: boolean;
}

const MOMENT_PHASE_TYPES: Record<PlayerMoment["momentType"], MatchPhaseType> = {
  technicalAction: "possession",
  physicalTest: "transition",
  mentalResponse: "pressingSequence",
  tacticalDecision: "buildUp",
  characterReveal: "setpiece",
};

const PHASE_TIE_BREAK: MatchPhaseType[] = [
  "possession",
  "transition",
  "pressingSequence",
  "buildUp",
  "setpiece",
  "counterAttack",
];

export function normalizeObservationPosition(
  rawPosition: string,
): keyof typeof POSITION_DEFAULTS {
  const position = rawPosition.trim().toUpperCase().replace(/[\s_-]+/g, "");

  if (position in POSITION_DEFAULTS) {
    return position as keyof typeof POSITION_DEFAULTS;
  }
  if (position.includes("GOAL") || position === "KEEPER") return "GK";
  if (position.includes("LEFTBACK") || position === "FULLBACKL") return "LB";
  if (position.includes("RIGHTBACK") || position === "FULLBACKR") return "RB";
  if (position.includes("WINGBACK") && position.startsWith("L")) return "LB";
  if (position.includes("WINGBACK") && position.startsWith("R")) return "RB";
  if (position.includes("DEF") || position.includes("CENTREBACK")) return "CB";
  if (position.includes("ATTACKINGMID") || position.includes("PLAYMAKER")) return "CAM";
  if (position.includes("DEFENSIVEMID") || position.includes("HOLDING")) return "CDM";
  if (position.includes("LEFTWING") || position === "WINGERL") return "LW";
  if (position.includes("RIGHTWING") || position === "WINGERR") return "RW";
  if (position.includes("WING")) return "LW";
  if (position.includes("MID")) return "CM";
  if (
    position.includes("FORWARD")
    || position.includes("STRIKER")
    || position.includes("ATTACKER")
  ) {
    return "ST";
  }

  return "CM";
}

/**
 * Maps the strongest evidence context in an observation phase onto the same
 * spatial vocabulary used by the match pitch. This is presentation-only: it
 * never changes the phase or its simulation result.
 */
export function inferObservationPhaseType(
  phase: Pick<SessionPhase, "moments">,
): MatchPhaseType {
  if (phase.moments.length === 0) return "possession";

  const counts = new Map<MatchPhaseType, number>();
  for (const moment of phase.moments) {
    const phaseType = MOMENT_PHASE_TYPES[moment.momentType];
    counts.set(phaseType, (counts.get(phaseType) ?? 0) + 1);
  }

  return PHASE_TIE_BREAK.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Builds stable marker positions from the real session-player positions. The
 * small collision offsets make multiple prospects in the same role selectable
 * without implying extra match simulation state.
 */
export function buildObservationPitchMarkers(
  players: SessionPlayer[],
  phase: Pick<SessionPhase, "moments">,
): ObservationPitchMarker[] {
  const phaseType = inferObservationPhaseType(phase);
  const momentsByPlayer = new Map<string, PlayerMoment[]>();
  for (const moment of phase.moments) {
    const existing = momentsByPlayer.get(moment.playerId) ?? [];
    existing.push(moment);
    momentsByPlayer.set(moment.playerId, existing);
  }

  const roleCounts = new Map<string, number>();

  return players.map((player) => {
    const normalizedPosition = normalizeObservationPosition(player.position);
    const roleIndex = roleCounts.get(normalizedPosition) ?? 0;
    roleCounts.set(normalizedPosition, roleIndex + 1);
    const moments = momentsByPlayer.get(player.playerId) ?? [];
    const base = POSITION_DEFAULTS[normalizedPosition];
    const positioned = getPlayerPositionInPhase(
      base,
      phaseType,
      moments.length > 0,
      player.isFocused,
    );

    // PitchCanvas uses a portrait coordinate system. Rotate it to a landscape
    // scouting board, then fan out duplicate roles around their truthful base.
    const collisionDirection = roleIndex % 2 === 0 ? 1 : -1;
    const collisionBand = Math.ceil(roleIndex / 2);
    const xOffset = collisionBand * 3 * collisionDirection;
    const yOffset = roleIndex === 0 ? 0 : collisionBand * 7 * collisionDirection;

    return {
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      normalizedPosition,
      x: clamp(positioned.y + xOffset, 7, 93),
      y: clamp(positioned.x + yOffset, 9, 91),
      momentCount: moments.length,
      hasMoment: moments.length > 0,
      isStandout: moments.some((moment) => moment.isStandout),
      isFocused: player.isFocused,
    };
  });
}
