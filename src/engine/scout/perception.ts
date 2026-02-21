/**
 * Perception Model — three-layer scouting accuracy system.
 *
 * Layer 1 — Visibility:   Which attributes CAN be observed from a given phase/context.
 * Layer 2 — Accuracy:     How close the perceived value is to the true value.
 * Layer 3 — Confidence:   The uncertainty range the scout reports for each attribute.
 */

import { type RNG } from "@/engine/rng";
import {
  type Player,
  type Scout,
  type ScoutSkill,
  type PlayerAttribute,
  type MatchPhase,
  type MatchPhaseType,
  type Observation,
  type ObservationContext,
  type AttributeReading,
  type FlaggedMoment,
  ATTRIBUTE_DOMAINS,
  HIDDEN_ATTRIBUTES,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map each attribute domain to the scout skill that governs its accuracy. */
const DOMAIN_SKILL_MAP: Record<string, ScoutSkill> = {
  technical: "technicalEye",
  physical: "physicalAssessment",
  mental: "psychologicalRead",
  tactical: "tacticalUnderstanding",
  hidden: "psychologicalRead",
};

/** Attributes naturally visible per match phase type. */
const PHASE_VISIBLE_ATTRIBUTES: Record<MatchPhaseType, PlayerAttribute[]> = {
  buildUp: ["passing", "firstTouch", "dribbling", "composure", "positioning", "decisionMaking"],
  transition: ["pace", "stamina", "agility", "decisionMaking", "passing", "offTheBall"],
  setpiece: ["heading", "strength", "crossing", "composure", "positioning", "defensiveAwareness"],
  pressingSequence: ["stamina", "workRate", "pressing", "defensiveAwareness", "agility", "decisionMaking"],
  counterAttack: ["pace", "agility", "dribbling", "shooting", "composure", "offTheBall"],
  possession: ["passing", "firstTouch", "positioning", "decisionMaking", "offTheBall", "composure"],
};

/** Noise multiplier per observation context. Lower = more accurate. */
const CONTEXT_NOISE: Record<ObservationContext, number> = {
  liveMatch: 1.0,
  videoAnalysis: 1.5,
  trainingGround: 0.7,
  youthTournament: 1.1,
  academyVisit: 0.8,
};

/** Bonus visibility: attributes only detectable by skilled scouts. */
const BONUS_VISIBILITY: { attribute: PlayerAttribute; skill: ScoutSkill; minLevel: number }[] = [
  { attribute: "firstTouch", skill: "technicalEye", minLevel: 12 },
  { attribute: "offTheBall", skill: "tacticalUnderstanding", minLevel: 10 },
  { attribute: "composure", skill: "psychologicalRead", minLevel: 11 },
  { attribute: "leadership", skill: "psychologicalRead", minLevel: 13 },
  { attribute: "pressing", skill: "tacticalUnderstanding", minLevel: 11 },
  { attribute: "decisionMaking", skill: "psychologicalRead", minLevel: 10 },
];

const HIDDEN_SET = new Set<string>(HIDDEN_ATTRIBUTES);

// ---------------------------------------------------------------------------
// Layer 1 — Visibility
// ---------------------------------------------------------------------------

export function getVisibleAttributes(
  phase: MatchPhase,
  context: ObservationContext,
  scoutSkills: Record<ScoutSkill, number>,
): PlayerAttribute[] {
  const visible = new Set<PlayerAttribute>(PHASE_VISIBLE_ATTRIBUTES[phase.type]);

  // Add attributes revealed by individual events
  for (const event of phase.events) {
    for (const attr of event.attributesRevealed) {
      visible.add(attr);
    }
  }

  // Scout skill bonus visibility
  for (const { attribute, skill, minLevel } of BONUS_VISIBILITY) {
    if (!visible.has(attribute) && scoutSkills[skill] >= minLevel) {
      visible.add(attribute);
    }
  }

  // Remove hidden attributes — never observable from matches
  for (const attr of HIDDEN_SET) {
    visible.delete(attr as PlayerAttribute);
  }

  return Array.from(visible);
}

// ---------------------------------------------------------------------------
// Layer 2 — Accuracy
// ---------------------------------------------------------------------------

export function perceiveAttribute(
  rng: RNG,
  trueValue: number,
  scoutSkill: number,
  observationCount: number,
  contextDiversity: number,
  playerForm: number,
  context: ObservationContext,
): { perceivedValue: number; confidence: number } {
  const skill = Math.max(1, Math.min(20, scoutSkill));
  const obsCount = Math.max(1, observationCount);

  // Base stddev: skill 5 → 5.0, skill 15 → 1.7, skill 20 → 0.4
  const baseStddev = Math.max(0.4, (20 - skill) / 3);
  const observationReduction = Math.sqrt(obsCount);
  const diversityFactor = 1 - Math.min(0.3, contextDiversity * 0.3);
  const methodMultiplier = CONTEXT_NOISE[context];

  const stddev = (baseStddev / observationReduction) * diversityFactor * methodMultiplier;

  // Form shifts perception
  const formBias = playerForm * 1.5;
  const rawPerceived = rng.gaussian(trueValue + formBias, stddev);
  const perceivedValue = Math.min(20, Math.max(1, Math.round(rawPerceived)));

  // Confidence 0–1
  const rawConfidence =
    (skill / 20) * 0.5 +
    Math.min(0.35, (1 - 1 / Math.sqrt(obsCount)) * 0.35) +
    contextDiversity * 0.1 +
    (context === "trainingGround" ? 0.05 : context === "videoAnalysis" ? -0.05 : 0);

  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return { perceivedValue, confidence };
}

// ---------------------------------------------------------------------------
// Layer 3 — Confidence Range
// ---------------------------------------------------------------------------

export function calculateConfidenceRange(
  perceivedValue: number,
  confidence: number,
  scoutSkill: number,
  observationCount = 1,
): [number, number] {
  const skill = Math.max(1, Math.min(20, scoutSkill));
  const rawWidth = (20 - skill) / (1 + Math.max(1, observationCount) * 0.3);
  const confidenceNarrow = 1 - confidence * 0.4;
  const finalWidth = Math.max(1, rawWidth * confidenceNarrow);

  const half = finalWidth / 2;
  const low = Math.max(1, Math.round(perceivedValue - half));
  const high = Math.min(20, Math.round(perceivedValue + half));

  if (high <= low) return [low, Math.min(20, low + 1)];
  return [low, high];
}

// ---------------------------------------------------------------------------
// Full Observation Pipeline
// ---------------------------------------------------------------------------

export function observePlayer(
  rng: RNG,
  player: Player,
  scout: Scout,
  matchPhases: MatchPhase[],
  focusedPhases: number[],
  context: ObservationContext,
  existingObservations: Observation[],
): Observation {
  // Count prior readings for this player
  const priorCounts = new Map<PlayerAttribute, number>();
  for (const obs of existingObservations) {
    if (obs.playerId === player.id) {
      for (const r of obs.attributeReadings) {
        priorCounts.set(r.attribute, (priorCounts.get(r.attribute) ?? 0) + r.observationCount);
      }
    }
  }

  // Context diversity: how many distinct observations of this player exist
  const contextDiversity = Math.min(1, existingObservations.filter((o) => o.playerId === player.id).length / 10);

  // Accumulate readings
  const sessionReadings = new Map<PlayerAttribute, { values: number[]; confidences: number[] }>();
  const flaggedMoments: FlaggedMoment[] = [];

  for (const phaseIdx of focusedPhases) {
    const phase = matchPhases[phaseIdx];
    if (!phase) continue;

    const playerInvolved = phase.involvedPlayerIds.includes(player.id);

    if (!playerInvolved) {
      // Passive observation: only off-ball attributes
      for (const attr of ["positioning", "workRate", "offTheBall"] as PlayerAttribute[]) {
        if (HIDDEN_SET.has(attr)) continue;
        addReading(rng, sessionReadings, attr, player.attributes[attr], scout, priorCounts.get(attr) ?? 0, contextDiversity, player.form, context, 1.5);
      }
      continue;
    }

    const visibleAttrs = getVisibleAttributes(phase, context, scout.skills);
    for (const attr of visibleAttrs) {
      addReading(rng, sessionReadings, attr, player.attributes[attr], scout, priorCounts.get(attr) ?? 0, contextDiversity, player.form, context, 1.0);
    }

    // Flag notable events
    for (const event of phase.events) {
      if (event.playerId !== player.id) continue;
      if (event.quality >= 8) {
        flaggedMoments.push({ phase: phaseIdx, description: event.description, attribute: event.attributesRevealed[0] ?? "composure", positive: true });
      } else if (event.quality <= 2) {
        flaggedMoments.push({ phase: phaseIdx, description: event.description, attribute: event.attributesRevealed[0] ?? "composure", positive: false });
      }
    }
  }

  // Convert to final AttributeReading[]
  const attributeReadings: AttributeReading[] = [];
  for (const [attr, bucket] of sessionReadings) {
    const avgPerceived = Math.round(bucket.values.reduce((s, v) => s + v, 0) / bucket.values.length);
    const avgConfidence = bucket.confidences.reduce((s, c) => s + c, 0) / bucket.confidences.length;
    const totalCount = (priorCounts.get(attr) ?? 0) + bucket.values.length;

    attributeReadings.push({
      attribute: attr,
      perceivedValue: avgPerceived,
      confidence: avgConfidence,
      observationCount: totalCount,
    });
  }

  const suffix = rng.nextInt(100000, 999999).toString(16);
  const notes = [`Observed ${player.firstName} ${player.lastName} — ${attributeReadings.length} attributes assessed.`];
  if (flaggedMoments.length > 0) {
    const pos = flaggedMoments.filter((m) => m.positive).length;
    const neg = flaggedMoments.filter((m) => !m.positive).length;
    if (pos > 0) notes.push(`${pos} standout moment${pos > 1 ? "s" : ""}.`);
    if (neg > 0) notes.push(`${neg} concern${neg > 1 ? "s" : ""}.`);
  }

  return {
    id: `obs_${player.id.slice(0, 8)}_${suffix}`,
    playerId: player.id,
    scoutId: scout.id,
    matchId: undefined,
    week: 0, // Set by caller
    season: 0, // Set by caller
    context,
    attributeReadings,
    notes,
    flaggedMoments,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addReading(
  rng: RNG,
  readings: Map<PlayerAttribute, { values: number[]; confidences: number[] }>,
  attr: PlayerAttribute,
  trueValue: number,
  scout: Scout,
  priorCount: number,
  contextDiversity: number,
  playerForm: number,
  context: ObservationContext,
  extraNoise: number,
): void {
  const domain = ATTRIBUTE_DOMAINS[attr];
  const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
  const skillLevel = scout.skills[skillKey as ScoutSkill];
  const effectiveSkill = extraNoise > 1 ? Math.max(1, skillLevel - Math.round((extraNoise - 1) * 5)) : skillLevel;

  const { perceivedValue, confidence } = perceiveAttribute(rng, trueValue, effectiveSkill, priorCount + 1, contextDiversity, playerForm, context);

  const bucket = readings.get(attr) ?? { values: [], confidences: [] };
  bucket.values.push(perceivedValue);
  bucket.confidences.push(confidence);
  readings.set(attr, bucket);
}
