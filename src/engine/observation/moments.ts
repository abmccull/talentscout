/**
 * Moment Generation & Flagging
 *
 * Generates player moments during observation phases. Each moment reveals
 * hints about player attributes, with focused players showing detailed
 * descriptions and unfocused players showing vague descriptions.
 *
 * Moment types map to attribute domains:
 * - technicalAction → technical attributes
 * - physicalTest → physical attributes
 * - mentalResponse → mental attributes
 * - tacticalDecision → tactical attributes
 * - characterReveal → hidden/personality attributes
 */

import type { RNG } from "@/engine/rng";
import type { Player, PlayerAttribute } from "@/engine/core/types";
import type {
  ObservationOpponentContext,
  PlayerMoment,
  SessionPlayer,
  VenueAtmosphere,
} from "./types";
import type { ObservationSituationSnapshot } from "./situations";
import { FOOTBALL_ACTIONS, type FootballAction } from "./footballActions";

// =============================================================================
// TYPES
// =============================================================================

type MomentType = PlayerMoment["momentType"];

type MomentTypeWeights = Record<MomentType, number>;

const POSITION_MOMENT_MULTIPLIERS: Record<string, Partial<MomentTypeWeights>> = {
  GK: { technicalAction: 0.9, physicalTest: 0.75, mentalResponse: 1.25, tacticalDecision: 1.35 },
  CB: { technicalAction: 0.85, physicalTest: 1.15, mentalResponse: 1.1, tacticalDecision: 1.35 },
  LB: { technicalAction: 1.05, physicalTest: 1.25, tacticalDecision: 1.2 },
  RB: { technicalAction: 1.05, physicalTest: 1.25, tacticalDecision: 1.2 },
  CDM: { mentalResponse: 1.15, tacticalDecision: 1.4 },
  CM: { technicalAction: 1.15, mentalResponse: 1.05, tacticalDecision: 1.3 },
  CAM: { technicalAction: 1.3, tacticalDecision: 1.2 },
  LW: { technicalAction: 1.3, physicalTest: 1.2, tacticalDecision: 1.05 },
  RW: { technicalAction: 1.3, physicalTest: 1.2, tacticalDecision: 1.05 },
  ST: { technicalAction: 1.25, physicalTest: 1.1, mentalResponse: 1.1, tacticalDecision: 1.15 },
};

const FRAME_MOMENT_MULTIPLIERS: Record<
  ObservationSituationSnapshot["tacticalFrame"],
  Partial<MomentTypeWeights>
> = {
  unstructured: { technicalAction: 1.3, physicalTest: 1.2, tacticalDecision: 0.72 },
  direct: { physicalTest: 1.3, mentalResponse: 1.15, tacticalDecision: 1.05 },
  transitionHeavy: { physicalTest: 1.25, mentalResponse: 1.1, tacticalDecision: 1.25 },
  possession: { technicalAction: 1.2, tacticalDecision: 1.3, physicalTest: 0.85 },
  pressing: { technicalAction: 1.08, mentalResponse: 1.2, tacticalDecision: 1.3 },
  structured: { mentalResponse: 1.05, tacticalDecision: 1.3 },
};

// =============================================================================
// MOMENT TYPE WEIGHTS BY VENUE
// =============================================================================

/**
 * Weighted distribution of moment types per venue.
 * Weights are relative — they need not sum to 100 but all must be positive.
 *
 * schoolMatch:         Structured environment → more technique and tactics.
 * streetFootball:      Chaotic, athletic → raw technical and physical.
 * grassrootsTournament: Balanced across all types.
 * academyTrialDay:     Controlled drills → tactics and mental responses.
 * youthFestival:       International pressure → character and mental signals.
 * attendMatch/reserveMatch/trialMatch: Tactical bias with balanced spread.
 * trainingVisit:       Drill-based → technical and tactical observation.
 * Default:             Equal weights across all types.
 */
export const MOMENT_TYPE_WEIGHTS: Record<string, MomentTypeWeights> = {
  schoolMatch: {
    technicalAction:  30,
    physicalTest:     15,
    mentalResponse:   15,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  streetFootball: {
    technicalAction:  35,
    physicalTest:     30,
    mentalResponse:   15,
    tacticalDecision: 10,
    characterReveal:  10,
  },
  grassrootsTournament: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 20,
    characterReveal:  20,
  },
  academyTrialDay: {
    technicalAction:  20,
    physicalTest:     15,
    mentalResponse:   25,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  youthFestival: {
    technicalAction:  15,
    physicalTest:     15,
    mentalResponse:   30,
    tacticalDecision: 15,
    characterReveal:  25,
  },
  attendMatch: {
    technicalAction:  20,
    physicalTest:     15,
    mentalResponse:   20,
    tacticalDecision: 35,
    characterReveal:  10,
  },
  reserveMatch: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  trialMatch: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 25,
    characterReveal:  15,
  },
  trainingVisit: {
    technicalAction:  35,
    physicalTest:     15,
    mentalResponse:   15,
    tacticalDecision: 30,
    characterReveal:   5,
  },
  scoutingMission: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 25,
    characterReveal:  15,
  },
  // Default fallback (equal weights)
  _default: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 20,
    characterReveal:  20,
  },
};

// =============================================================================
// MOMENT DESCRIPTION TEMPLATES
// =============================================================================

// =============================================================================
// VAGUE DESCRIPTIONS
// =============================================================================

/**
 * Short, non-specific descriptions shown when the scout has not allocated
 * a focus token to the player involved. Peripheral vision only.
 */
export const VAGUE_DESCRIPTIONS: Record<MomentType, string[]> = {
  technicalAction: ["There was an action on the ball, but the execution was difficult to judge."],
  physicalTest: ["There was a physical contest, but the movement was difficult to judge."],
  mentalResponse: ["There was a decision to make, but the player's response was difficult to judge."],
  tacticalDecision: ["There was movement away from the ball, but the positioning was difficult to judge."],
  characterReveal: ["There was a reaction to the previous passage, but the response was difficult to judge."],
};

/** Every hint must belong to an authored action in this domain. */
export function getMomentAttributeHints(momentType: MomentType): PlayerAttribute[] {
  return [...new Set(FOOTBALL_ACTIONS.filter((action) => action.momentType === momentType)
    .flatMap((action) => action.attributes))];
}

// =============================================================================
// TEMPLATE HELPERS
// =============================================================================

/**
 * Replaces the {playerName} placeholder in a description template.
 */
export function formatMomentDescription(
  template: string,
  playerName: string,
): string {
  return template.replace(/\{playerName\}/g, playerName);
}

// =============================================================================
// MOMENT TYPE SELECTION
// =============================================================================

/**
 * Selects a moment type using weighted random selection for the given venue.
 * Falls back to the "_default" equal-weight distribution for unknown venues.
 */
export function selectMomentType(
  rng: RNG,
  venueType: string,
  player?: SessionPlayer,
  situation?: ObservationSituationSnapshot,
  opponent?: ObservationOpponentContext,
): MomentType {
  const baseWeights = MOMENT_TYPE_WEIGHTS[venueType] ?? MOMENT_TYPE_WEIGHTS["_default"];
  const positionWeights = player ? POSITION_MOMENT_MULTIPLIERS[player.position] ?? {} : {};
  const frameWeights = situation ? FRAME_MOMENT_MULTIPLIERS[situation.tacticalFrame] : {};
  const highStakes = situation?.stakes === "selection"
    || situation?.stakes === "knockout"
    || situation?.stakes === "careerDefining";

  const items = (
    Object.entries(baseWeights) as [MomentType, number][]
  ).map(([momentType, weight]) => {
    let multiplier = (positionWeights[momentType] ?? 1) * (frameWeights[momentType] ?? 1);
    if (highStakes && (momentType === "mentalResponse" || momentType === "characterReveal")) {
      multiplier *= 1.22;
    }
    if (opponent?.relativeStrength === "stronger" && (momentType === "mentalResponse" || momentType === "tacticalDecision")) {
      multiplier *= 1.18;
    }
    if (player?.naturalRole === "ballPlayingDefender" && momentType === "technicalAction") multiplier *= 1.25;
    if (player?.naturalRole === "pressingForward" && (momentType === "physicalTest" || momentType === "mentalResponse")) multiplier *= 1.2;
    if (player?.naturalRole === "sweeper" && momentType === "tacticalDecision") multiplier *= 1.2;
    if (player?.naturalRole === "targetMan" && momentType === "physicalTest") multiplier *= 1.25;
    return { item: momentType, weight: Math.max(0.1, weight * multiplier) };
  });

  return rng.pickWeighted(items);
}

function getRoleAttributePriorities(player: SessionPlayer): Set<PlayerAttribute> {
  const byPosition: Record<string, readonly PlayerAttribute[]> = {
    GK: ["composure", "positioning", "anticipation", "passing", "decisionMaking", "agility"],
    CB: ["positioning", "defensiveAwareness", "marking", "heading", "strength", "anticipation"],
    LB: ["pace", "stamina", "crossing", "positioning", "offTheBall", "tackling"],
    RB: ["pace", "stamina", "crossing", "positioning", "offTheBall", "tackling"],
    CDM: ["positioning", "decisionMaking", "anticipation", "passing", "defensiveAwareness", "teamwork"],
    CM: ["passing", "firstTouch", "decisionMaking", "vision", "teamwork", "stamina"],
    CAM: ["firstTouch", "passing", "dribbling", "vision", "offTheBall", "decisionMaking"],
    LW: ["dribbling", "pace", "crossing", "offTheBall", "agility", "decisionMaking"],
    RW: ["dribbling", "pace", "crossing", "offTheBall", "agility", "decisionMaking"],
    ST: ["finishing", "offTheBall", "composure", "heading", "strength", "anticipation"],
  };
  const priorities = new Set<PlayerAttribute>(byPosition[player.position] ?? []);
  const roleAdditions: Partial<Record<NonNullable<SessionPlayer["naturalRole"]>, readonly PlayerAttribute[]>> = {
    ballPlayingDefender: ["passing", "firstTouch", "vision", "composure"],
    sweeper: ["anticipation", "decisionMaking", "positioning", "pace"],
    wingBack: ["stamina", "pace", "crossing", "offTheBall"],
    invertedFullBack: ["passing", "vision", "decisionMaking", "positioning"],
    deepLyingPlaymaker: ["passing", "vision", "decisionMaking", "composure"],
    boxToBox: ["stamina", "workRate", "teamwork", "offTheBall"],
    advancedPlaymaker: ["firstTouch", "passing", "vision", "decisionMaking"],
    shadowStriker: ["offTheBall", "finishing", "anticipation", "composure"],
    winger: ["crossing", "pace", "dribbling", "offTheBall"],
    insideForward: ["finishing", "dribbling", "offTheBall", "composure"],
    targetMan: ["heading", "strength", "teamwork", "composure"],
    pressingForward: ["pressing", "workRate", "stamina", "teamwork"],
    poacher: ["finishing", "offTheBall", "anticipation", "composure"],
  };
  for (const attribute of player.naturalRole ? roleAdditions[player.naturalRole] ?? [] : []) {
    priorities.add(attribute);
  }
  return priorities;
}

// =============================================================================
// CORE GENERATOR
// =============================================================================

/**
 * Generates all player moments for a single observation phase.
 *
 * Selection rules:
 *   - 3–6 moments per phase.
 *   - Focused players: 50% chance of appearing in each moment slot.
 *   - Unfocused players: 20% chance.
 *   - If no players are selected by chance for a slot, the generator picks
 *     any player at random to guarantee the phase always has content.
 *   - Moment quality is biased by the player's relevant attribute pool
 *     (simulated here via a gaussian draw — the actual attribute values are
 *     not exposed to the scout, this is just internal quality generation).
 *   - pressureContext: intrinsic to pressured actions, otherwise 20% base chance, scaled by phase progression and
 *     atmosphere.crowdIntensity.
 *   - isStandout: true when quality >= 8.
 */
export function generateMoments(
  rng: RNG,
  players: SessionPlayer[],
  venueType: string,
  phaseIndex: number,
  totalPhases: number,
  atmosphere?: VenueAtmosphere,
  playerProfiles?: Readonly<Record<string, Player>>,
  situation?: ObservationSituationSnapshot,
  opponent?: ObservationOpponentContext,
): PlayerMoment[] {
  const [minMoments, maxMoments] = getMomentCountRange(venueType);
  const momentCount = rng.nextInt(minMoments, maxMoments);
  const moments: PlayerMoment[] = [];

  // Phase progression as a 0–1 scalar (used for pressure scaling).
  const phaseProgress = totalPhases > 1 ? phaseIndex / (totalPhases - 1) : 0;

  // Base pressure probability: 20%, increasing toward the end of the session.
  // Crowd intensity amplifies this further when an atmosphere is provided.
  const crowdBoost = atmosphere ? atmosphere.crowdIntensity * 0.15 : 0;
  const pressureProbability = Math.min(0.2 + phaseProgress * 0.25 + crowdBoost, 0.7);

  for (let i = 0; i < momentCount; i++) {
    // --- Select an involved player ---
    const player = selectMomentPlayer(rng, players, phaseIndex, i, momentCount);

    // --- Select moment type weighted by venue ---
    const momentType = selectMomentType(rng, venueType, player, situation, opponent);

    // --- Generate quality (1–10, gaussian-biased toward 5) ---
    // Quality is resolved after the hinted attributes and pressure context are known.

    // Choose the attempted action before resolving its outcome. Role priorities
    // alter frequency, but cannot attach unrelated evidence to the action.
    const rolePriorities = getRoleAttributePriorities(player);
    const action = rng.pickWeighted(FOOTBALL_ACTIONS
      .filter((candidate) => candidate.momentType === momentType
        && (player.position !== "GK" || !candidate.outfieldOnly))
      .map((candidate) => ({
        item: candidate,
        weight: candidate.attributes.some((attribute) => rolePriorities.has(attribute)) ? 2 : 1,
      })));
    const attributesHinted = [...action.attributes];

    // Consume the same context draw for every action. An explicitly pressured
    // action cannot lose that context because the atmosphere roll was quiet.
    const situationalPressure = rng.chance(pressureProbability);
    const pressureContext = action.requiresPressure || situationalPressure;
    const quality = calculateMomentQuality(
      rng,
      playerProfiles?.[player.playerId],
      attributesHinted,
      pressureContext,
    );

    // --- Generate descriptions ---
    const { description, vagueDescription } = buildDescriptions(
      rng,
      action,
      player.name,
      quality,
    );

    // --- Pressure context ---
    // --- Standout flag ---
    const isStandout = quality >= 8;

    // --- Unique ID for this moment within the session ---
    const id = `moment-p${phaseIndex}-${i}-${player.playerId.slice(0, 8)}`;

    moments.push({
      id,
      playerId: player.playerId,
      momentType,
      actionId: action.id,
      quality,
      attributesHinted,
      description,
      vagueDescription,
      pressureContext,
      isStandout,
    });
  }

  return moments;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Selects a player to feature in a moment slot.
 *
 * Early slots rotate through the full pool; later slots sample uniformly.
 * Scout focus affects perception only, never which football events occur.
 */
function selectMomentPlayer(
  rng: RNG,
  players: SessionPlayer[],
  phaseIndex: number,
  momentIndex: number,
  momentCount: number,
): SessionPlayer {
  if (players.length === 0) {
    throw new RangeError("selectMomentPlayer: players array must not be empty");
  }

  // Rotate early slots through the full pool so every prospect receives a
  // fair chance to produce evidence. Focus changes perception, not events.
  const coverageWindow = Math.max(1, Math.ceil(players.length / momentCount));
  if (phaseIndex < coverageWindow) {
    return players[(phaseIndex * momentCount + momentIndex) % players.length];
  }

  return rng.pick(players);
}

function calculateMomentQuality(
  rng: RNG,
  player: Player | undefined,
  attributesHinted: PlayerAttribute[],
  pressureContext: boolean,
): number {
  if (!player || attributesHinted.length === 0) {
    return Math.round(Math.min(10, Math.max(1, rng.gaussian(5.5, 2))));
  }

  const relevantAverage = attributesHinted.reduce(
    (sum, attribute) => sum + player.attributes[attribute],
    0,
  ) / attributesHinted.length;
  let expectedQuality = 1 + ((relevantAverage - 1) / 19) * 9;

  // Talent establishes the baseline; form and morale only nudge a single
  // performance around it.
  expectedQuality += player.form * 0.3;
  expectedQuality += (player.morale - 5.5) * 0.12;

  if (pressureContext) {
    const pressureAverage = (
      player.attributes.composure + player.attributes.bigGameTemperament
    ) / 2;
    const pressureQuality = 1 + ((pressureAverage - 1) / 19) * 9;
    expectedQuality = expectedQuality * 0.72 + pressureQuality * 0.28;
  }

  return Math.round(
    Math.min(10, Math.max(1, rng.gaussian(expectedQuality, 1.35))),
  );
}

function getMomentCountRange(venueType: string): [number, number] {
  switch (venueType) {
    case "schoolMatch":
    case "academyTrialDay":
    case "academyVisit":
      // Early Access tuning: youth baseline sessions should surface decisions,
      // not long chains of low-value "next" clicks.
      return [2, 4];
    case "grassrootsTournament":
    case "youthFestival":
    case "youthTournament":
      return [2, 4];
    default:
      return [3, 6];
  }
}

/**
 * Builds a detailed description and a vague description for a moment.
 *
 * Quality bands:
 *   high   → 7–10
 *   medium → 4–6
 *   low    → 1–3
 */
function buildDescriptions(
  rng: RNG,
  action: FootballAction,
  playerName: string,
  quality: number,
): { description: string; vagueDescription: string } {
  const band: "high" | "medium" | "low" =
    quality >= 7 ? "high" : quality >= 4 ? "medium" : "low";

  const vagueTemplates = VAGUE_DESCRIPTIONS[action.momentType];

  const detailedTemplate = action.outcomes[band];
  const vagueTemplate = rng.pick(vagueTemplates);

  return {
    description: formatMomentDescription(detailedTemplate, playerName),
    vagueDescription: vagueTemplate,
  };
}
