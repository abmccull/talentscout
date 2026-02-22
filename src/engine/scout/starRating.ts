/**
 * Star rating system — maps internal CA/PA (1–200) to a half-star scale
 * (0.5–5.0) and provides perception functions for scouts to estimate
 * player overall ability and potential.
 *
 * Pure engine module — no React or framework imports.
 */

import type { RNG } from "@/engine/rng";
import type {
  Player,
  Scout,
  Observation,
  ObservationContext,
  AbilityReading,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Star ↔ Ability mapping
// ---------------------------------------------------------------------------

/**
 * Convert a 1–200 ability value to a 0.5–5.0 half-star rating.
 *
 * Linear mapping snapped to nearest 0.5:
 *   CA   1-20  → 0.5★    CA 101-120 → 3.0★
 *   CA  21-40  → 1.0★    CA 121-140 → 3.5★
 *   CA  41-60  → 1.5★    CA 141-160 → 4.0★
 *   CA  61-80  → 2.0★    CA 161-180 → 4.5★
 *   CA  81-100 → 2.5★    CA 181-200 → 5.0★
 */
export function abilityToStars(ability: number): number {
  const clamped = Math.max(1, Math.min(200, ability));
  // Map 1-200 to 0.5-5.0
  const raw = 0.5 + ((clamped - 1) / 199) * 4.5;
  // Snap to nearest 0.5
  return Math.round(raw * 2) / 2;
}

/**
 * Convert a 0.5–5.0 star rating to the midpoint ability value (1–200).
 */
export function starsToAbility(stars: number): number {
  const clamped = Math.max(0.5, Math.min(5.0, stars));
  const raw = ((clamped - 0.5) / 4.5) * 199 + 1;
  return Math.round(raw);
}

// ---------------------------------------------------------------------------
// Noise multipliers per observation context for ability reads
// ---------------------------------------------------------------------------

const CA_CONTEXT_NOISE: Record<ObservationContext, number> = {
  liveMatch: 1.0,
  videoAnalysis: 1.3,
  trainingGround: 0.8,
  youthTournament: 1.1,
  academyVisit: 0.9,
  schoolMatch: 1.2,
  grassrootsTournament: 1.3,
  streetFootball: 1.4,
  academyTrialDay: 0.85,
  youthFestival: 1.1,
  followUpSession: 0.9,
  parentCoachMeeting: 2.0,
  // First-team exclusive — good for reading current ability
  reserveMatch: 0.85,
  oppositionAnalysis: 1.0,
  agentShowcase: 1.1,
  trialMatch: 0.7,        // best first-team context for CA reads
  // Data-exclusive — stats-based CA estimation
  databaseQuery: 1.5,
  statsBriefing: 1.4,
  deepVideoAnalysis: 1.0,
};

const PA_CONTEXT_NOISE: Record<ObservationContext, number> = {
  liveMatch: 1.0,
  videoAnalysis: 1.5,
  trainingGround: 1.0,
  youthTournament: 0.75,
  academyVisit: 0.8,
  schoolMatch: 1.1,
  grassrootsTournament: 1.0,
  streetFootball: 0.9,
  academyTrialDay: 0.8,
  youthFestival: 0.85,
  followUpSession: 0.85,
  parentCoachMeeting: 2.0,
  // First-team exclusive — PA reads less reliable (focus is current readiness)
  reserveMatch: 1.2,
  oppositionAnalysis: 1.4,
  agentShowcase: 1.3,
  trialMatch: 1.1,
  // Data-exclusive — trend data helps with PA estimation
  databaseQuery: 1.3,
  statsBriefing: 1.2,
  deepVideoAnalysis: 1.1,
};

// ---------------------------------------------------------------------------
// CA Perception
// ---------------------------------------------------------------------------

function perceiveCA(
  rng: RNG,
  player: Player,
  scout: Scout,
  obsCount: number,
  contextDiversity: number,
  context: ObservationContext,
): { perceivedCA: number; confidence: number } {
  const skill = Math.max(1, Math.min(20, scout.skills.playerJudgment));
  const count = Math.max(1, obsCount);

  // Base stddev in CA-point space
  const baseStddev = Math.max(5, (20 - skill) * 1.5);
  const observationReduction = Math.sqrt(count);
  const diversityFactor = 1 - Math.min(0.3, contextDiversity * 0.3);
  const methodMultiplier = CA_CONTEXT_NOISE[context];

  const stddev =
    (baseStddev / observationReduction) * diversityFactor * methodMultiplier;

  // Form bias: ±9 CA points at max form (form is -3 to 3)
  const formBias = player.form * 3;
  const rawPerceived = rng.gaussian(player.currentAbility + formBias, stddev);
  const clampedCA = Math.max(1, Math.min(200, Math.round(rawPerceived)));
  const perceivedCA = abilityToStars(clampedCA);

  // Confidence 0–1
  const rawConfidence =
    (skill / 20) * 0.5 +
    Math.min(0.35, (1 - 1 / Math.sqrt(count)) * 0.35) +
    contextDiversity * 0.1 +
    (context === "trainingGround"
      ? 0.05
      : context === "videoAnalysis"
        ? -0.05
        : 0);

  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return { perceivedCA, confidence };
}

// ---------------------------------------------------------------------------
// PA Perception
// ---------------------------------------------------------------------------

function perceivePA(
  rng: RNG,
  player: Player,
  scout: Scout,
  obsCount: number,
  contextDiversity: number,
  context: ObservationContext,
): { low: number; high: number; confidence: number } {
  const skill = Math.max(1, Math.min(20, scout.skills.potentialAssessment));
  const count = Math.max(1, obsCount);

  // Base stddev — PA is harder than CA
  const baseStddev = Math.max(7.5, (20 - skill) * 2.0);

  // Age modifier: youth = harder (but high skill compensates), veterans = easy
  let ageFactor: number;
  if (player.age <= 21) {
    ageFactor = 1.2 - (skill / 20) * 0.3;
  } else if (player.age >= 28) {
    ageFactor = 0.7;
  } else {
    // 22-27: gradual transition
    ageFactor = 1.0 - ((player.age - 22) / 6) * 0.3;
  }

  const observationReduction = Math.sqrt(count);
  const diversityFactor = 1 - Math.min(0.3, contextDiversity * 0.3);
  const methodMultiplier = PA_CONTEXT_NOISE[context];

  const stddev =
    (baseStddev * ageFactor / observationReduction) *
    diversityFactor *
    methodMultiplier;

  const rawPerceived = rng.gaussian(player.potentialAbility, stddev);
  const clampedPA = Math.max(1, Math.min(200, Math.round(rawPerceived)));
  const midpoint = abilityToStars(clampedPA);

  // Range width in stars
  const rangeWidth = Math.max(
    0.5,
    ((20 - skill) / 3) * ageFactor / (1 + count * 0.2),
  );
  const halfRange = Math.round(rangeWidth * 2) / 4; // snap to 0.25 increments
  const rawLow = midpoint - halfRange;
  const rawHigh = midpoint + halfRange;
  const low = Math.max(0.5, Math.round(rawLow * 2) / 2);
  const high = Math.min(5.0, Math.round(rawHigh * 2) / 2);

  // Confidence
  const rawConfidence =
    (skill / 20) * 0.45 +
    Math.min(0.3, (1 - 1 / Math.sqrt(count)) * 0.3) +
    contextDiversity * 0.1 +
    (context === "academyVisit" || context === "youthTournament" ? 0.05 : 0) +
    (player.age >= 28 ? 0.1 : 0);

  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return { low, high, confidence };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Generate a complete ability reading for a player observation.
 * Calls perceiveCA and perceivePA, ensures PA >= CA.
 */
export function generateAbilityReading(
  rng: RNG,
  player: Player,
  scout: Scout,
  existingObservations: Observation[],
  context: ObservationContext,
): AbilityReading {
  const playerObs = existingObservations.filter(
    (o) => o.playerId === player.id,
  );
  const obsCount = playerObs.length + 1; // +1 for current observation
  const contextDiversity = Math.min(1, playerObs.length / 10);

  const ca = perceiveCA(rng, player, scout, obsCount, contextDiversity, context);
  const pa = perceivePA(rng, player, scout, obsCount, contextDiversity, context);

  // Ensure PA range is >= perceived CA
  const paLow = Math.max(pa.low, ca.perceivedCA);
  const paHigh = Math.max(pa.high, paLow);

  return {
    perceivedCA: ca.perceivedCA,
    caConfidence: ca.confidence,
    perceivedPALow: paLow,
    perceivedPAHigh: paHigh,
    paConfidence: pa.confidence,
  };
}
