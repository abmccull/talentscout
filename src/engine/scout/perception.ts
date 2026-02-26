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
import { generateAbilityReading } from "@/engine/scout/starRating";
import { checkPersonalityReveal } from "@/engine/players/personalityReveal";
import { progressivePersonalityReveal } from "@/engine/players/personalityEffects";

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
  buildUp: ["passing", "firstTouch", "dribbling", "composure", "positioning", "decisionMaking", "vision", "teamwork", "balance"],
  transition: ["pace", "stamina", "agility", "decisionMaking", "passing", "offTheBall", "anticipation", "balance"],
  setpiece: ["heading", "strength", "crossing", "composure", "positioning", "defensiveAwareness", "jumping", "marking"],
  pressingSequence: ["stamina", "workRate", "pressing", "defensiveAwareness", "agility", "decisionMaking", "tackling", "anticipation", "teamwork"],
  counterAttack: ["pace", "agility", "dribbling", "shooting", "composure", "offTheBall", "finishing", "anticipation"],
  possession: ["passing", "firstTouch", "positioning", "decisionMaking", "offTheBall", "composure", "vision", "teamwork"],
};

/** Noise multiplier per observation context. Lower = more accurate. */
const CONTEXT_NOISE: Record<ObservationContext, number> = {
  liveMatch: 1.0,
  videoAnalysis: 1.5,
  trainingGround: 0.7,
  youthTournament: 1.1,
  academyVisit: 0.8,
  schoolMatch: 1.2,
  grassrootsTournament: 1.3,
  streetFootball: 1.4,
  academyTrialDay: 0.9,
  youthFestival: 1.2,
  followUpSession: 0.85,
  parentCoachMeeting: 2.0,
  // First-team exclusive
  reserveMatch: 0.9,         // controlled environment, good accuracy
  oppositionAnalysis: 1.1,   // studying from distance, slightly noisy
  agentShowcase: 1.2,        // players performing under agent pressure
  trialMatch: 0.75,          // best first-team context — close controlled observation
  // Data-exclusive
  databaseQuery: 1.8,        // pure stats, no live observation
  statsBriefing: 1.6,        // summary data, limited direct reads
  deepVideoAnalysis: 1.1,    // enhanced video with statistical overlay
};

/** Bonus visibility: attributes only detectable by skilled scouts. */
const BONUS_VISIBILITY: { attribute: PlayerAttribute; skill: ScoutSkill; minLevel: number }[] = [
  { attribute: "firstTouch", skill: "technicalEye", minLevel: 12 },
  { attribute: "offTheBall", skill: "tacticalUnderstanding", minLevel: 10 },
  { attribute: "composure", skill: "psychologicalRead", minLevel: 11 },
  { attribute: "leadership", skill: "psychologicalRead", minLevel: 13 },
  { attribute: "pressing", skill: "tacticalUnderstanding", minLevel: 11 },
  { attribute: "decisionMaking", skill: "psychologicalRead", minLevel: 10 },
  // New attributes — require decent scout skill to spot
  { attribute: "vision", skill: "tacticalUnderstanding", minLevel: 12 },
  { attribute: "anticipation", skill: "psychologicalRead", minLevel: 11 },
  { attribute: "marking", skill: "tacticalUnderstanding", minLevel: 10 },
  { attribute: "teamwork", skill: "tacticalUnderstanding", minLevel: 9 },
  { attribute: "finishing", skill: "technicalEye", minLevel: 10 },
  { attribute: "tackling", skill: "technicalEye", minLevel: 9 },
  { attribute: "jumping", skill: "physicalAssessment", minLevel: 8 },
  { attribute: "balance", skill: "physicalAssessment", minLevel: 10 },
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
  /** Scout fatigue (0–100). Values above 50 widen the error range. */
  scoutFatigue = 0,
  /** Breakthrough bonus from diverse contexts / focused lenses. Applied on top of the plateau. */
  breakthroughBonus = 0,
): { perceivedValue: number; confidence: number } {
  const skill = Math.max(1, Math.min(20, scoutSkill));
  const obsCount = Math.max(1, observationCount);

  // Base stddev: skill 5 → 5.0, skill 15 → 1.7, skill 20 → 0.4
  const baseStddev = Math.max(0.4, (20 - skill) / 3);
  const observationReduction = Math.sqrt(obsCount);
  const diversityFactor = 1 - Math.min(0.3, contextDiversity * 0.3);
  const methodMultiplier = CONTEXT_NOISE[context];

  // Fatigue widens error: above 50 fatigue adds up to 100% extra stddev
  const fatigueError = Math.max(0, (scoutFatigue - 50) / 100);

  const stddev = (baseStddev / observationReduction) * diversityFactor * methodMultiplier * (1 + fatigueError);

  // Form shifts perception
  const formBias = playerForm * 1.5;
  const rawPerceived = rng.gaussian(trueValue + formBias, stddev);
  const perceivedValue = Math.min(20, Math.max(1, Math.round(rawPerceived)));

  // ── Confidence 0–1 (with revelation plateau at 0.65) ──────────────
  //
  // The base confidence uses a logarithmic curve that plateaus at 0.65:
  //   baseConfidence = min(0.65, 0.30 + 0.15 * ln(obsCount + 1))
  //
  // Skill still matters: it scales the observation-based component.
  // A skill-20 scout reaches the plateau faster than a skill-5 scout.
  //
  // To break through the 0.65 plateau, scouts need diverse observation
  // contexts and/or focused lens usage (applied via breakthroughBonus).

  const skillFactor = 0.5 + (skill / 20) * 0.5; // 0.5 at skill 1, 1.0 at skill 20
  const logComponent = 0.15 * Math.log(obsCount + 1);
  const baseConfidence = Math.min(0.65, 0.30 + logComponent * skillFactor);

  // Context bonus (small, within the plateau)
  const contextBonus =
    context === "trainingGround" ? 0.02 : context === "videoAnalysis" ? -0.02 : 0;

  // Breakthrough bonus pushes beyond the 0.65 plateau
  const rawConfidence = baseConfidence + contextBonus + breakthroughBonus;

  const confidence = Math.min(1, Math.max(0, rawConfidence));

  return { perceivedValue, confidence };
}

// ---------------------------------------------------------------------------
// Scouting Revelation Plateau — Breakthrough Bonus Calculation
// ---------------------------------------------------------------------------

/**
 * Compute the breakthrough bonus that allows a scout to push past the 65%
 * confidence plateau for a specific player.
 *
 * Breakthroughs are earned by:
 *  1. Observing the player in 3+ different contexts (match, training, video, etc.)
 *     -> +0.10 at 3 unique contexts, +0.05 more at 4+
 *  2. Using a focused lens on this player in 2+ separate observations
 *     -> +0.08
 *
 * Returns { bonus, isBreakthrough } where isBreakthrough is true if this
 * observation would push the player past the plateau for the first time.
 */
export function computeScoutingBreakthroughBonus(
  existingObservations: Observation[],
  playerId: string,
  currentContext: ObservationContext,
  currentFocusLens?: string,
): { bonus: number; isBreakthrough: boolean; previousMaxConfidence: number } {
  const playerObs = existingObservations.filter((o) => o.playerId === playerId);

  // ── Context diversity ──────────────────────────────────────────────
  // Count unique context types across all existing observations + the current one
  const contextSet = new Set<ObservationContext>(playerObs.map((o) => o.context));
  contextSet.add(currentContext);
  const uniqueContexts = contextSet.size;

  let bonus = 0;
  if (uniqueContexts >= 3) {
    bonus += 0.10; // Breaks through 65% to 75%
  }
  if (uniqueContexts >= 4) {
    bonus += 0.05; // Up to 80%
  }

  // ── Focused lens breakthrough ──────────────────────────────────────
  // Count how many existing observations used a focused (non-general) lens
  let focusedLensCount = playerObs.filter((o) => o.focusLens != null).length;
  if (currentFocusLens && currentFocusLens !== "general") {
    focusedLensCount += 1;
  }
  if (focusedLensCount >= 2) {
    bonus += 0.08; // Focused observation breaks plateau further
  }

  // ── Determine if this is a breakthrough moment ─────────────────────
  // Check the previous max confidence across all readings for this player
  let previousMaxConfidence = 0;
  for (const obs of playerObs) {
    for (const reading of obs.attributeReadings) {
      if (reading.confidence > previousMaxConfidence) {
        previousMaxConfidence = reading.confidence;
      }
    }
  }

  // A breakthrough occurs when:
  // 1. The player's previous max confidence was below the plateau (0.65)
  // 2. The bonus would push them past it
  const isBreakthrough = previousMaxConfidence < 0.65 && bonus > 0;

  return { bonus, isBreakthrough, previousMaxConfidence };
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
  const finalWidth = Math.max(2, rawWidth * confidenceNarrow);

  const half = finalWidth / 2;
  const low = Math.max(1, Math.round(perceivedValue - half));
  const high = Math.min(20, Math.round(perceivedValue + half));

  if (high <= low) return [low, Math.min(20, low + 1)];
  return [low, high];
}

// ---------------------------------------------------------------------------
// Context-specific attribute visibility (for non-match observations)
// ---------------------------------------------------------------------------

/** Attributes naturally observable per non-match context. */
const CONTEXT_VISIBLE_ATTRIBUTES: Record<ObservationContext, PlayerAttribute[]> = {
  trainingGround: ["firstTouch", "passing", "dribbling", "shooting", "pace", "strength", "stamina", "agility", "composure", "workRate", "tackling", "finishing", "balance", "teamwork"],
  videoAnalysis: ["passing", "shooting", "crossing", "positioning", "decisionMaking", "offTheBall", "pressing", "defensiveAwareness", "vision", "marking", "anticipation"],
  youthTournament: ["pace", "dribbling", "shooting", "agility", "composure", "heading", "strength", "balance", "jumping", "finishing"],
  academyVisit: ["firstTouch", "passing", "dribbling", "pace", "agility", "composure", "workRate", "balance", "teamwork"],
  liveMatch: [], // not used by light observation — full pipeline uses PHASE_VISIBLE_ATTRIBUTES
  schoolMatch: ["pace", "dribbling", "agility", "shooting", "composure", "balance", "finishing"],
  grassrootsTournament: ["pace", "dribbling", "shooting", "agility", "strength", "workRate", "tackling", "jumping", "balance"],
  streetFootball: ["dribbling", "firstTouch", "agility", "composure", "decisionMaking", "balance"],
  academyTrialDay: ["firstTouch", "passing", "dribbling", "pace", "agility", "composure", "workRate", "positioning", "tackling", "finishing", "teamwork"],
  youthFestival: ["pace", "dribbling", "shooting", "agility", "composure", "heading", "passing", "jumping", "balance"],
  followUpSession: ["firstTouch", "passing", "composure", "workRate", "agility", "decisionMaking", "vision", "anticipation", "pace", "dribbling", "shooting", "strength", "stamina", "finishing", "heading", "jumping", "balance", "tackling", "pressing", "positioning", "offTheBall", "teamwork", "crossing", "defensiveAwareness"],
  parentCoachMeeting: [],
  // First-team exclusive
  reserveMatch: ["firstTouch", "passing", "shooting", "pace", "strength", "composure", "positioning", "workRate", "offTheBall", "tackling", "finishing", "anticipation", "teamwork", "marking"],
  oppositionAnalysis: ["positioning", "decisionMaking", "pressing", "defensiveAwareness", "offTheBall", "marking", "anticipation", "vision"],
  agentShowcase: ["dribbling", "shooting", "pace", "agility", "composure", "firstTouch", "finishing", "balance"],
  trialMatch: ["firstTouch", "passing", "dribbling", "shooting", "pace", "strength", "stamina", "composure", "positioning", "workRate", "offTheBall", "pressing", "tackling", "finishing", "jumping", "balance", "anticipation", "vision", "marking", "teamwork"],
  // Data-exclusive
  databaseQuery: ["shooting", "passing", "crossing", "finishing"],
  statsBriefing: ["shooting", "passing"],
  deepVideoAnalysis: ["passing", "shooting", "crossing", "positioning", "decisionMaking", "offTheBall", "pressing", "defensiveAwareness", "composure", "vision", "marking", "anticipation", "teamwork"],
};

// ---------------------------------------------------------------------------
// Light Observation Pipeline (non-match contexts)
// ---------------------------------------------------------------------------

/**
 * Generate an observation without match phases.
 * Used by calendar activities: academy visits, youth tournaments,
 * training visits, and video analysis.
 */
export function observePlayerLight(
  rng: RNG,
  player: Player,
  scout: Scout,
  context: ObservationContext,
  existingObservations: Observation[],
  /** Additional attributes to observe per session (from equipment bonuses). */
  extraAttributes?: number,
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

  // Context diversity: count distinct context types seen for this player
  const contextDiversity = new Set(existingObservations.filter((o) => o.playerId === player.id).map((o) => o.context)).size / 6;

  // Build visible attribute set from context + scout skill bonuses
  const baseVisible = new Set<PlayerAttribute>(CONTEXT_VISIBLE_ATTRIBUTES[context]);

  for (const { attribute, skill, minLevel } of BONUS_VISIBILITY) {
    if (!baseVisible.has(attribute) && scout.skills[skill] >= minLevel) {
      baseVisible.add(attribute);
    }
  }

  // Remove hidden attributes
  for (const attr of HIDDEN_SET) {
    baseVisible.delete(attr as PlayerAttribute);
  }

  const visibleArray = Array.from(baseVisible);

  // Select 4–7 attributes to observe (fewer than a full match), plus equipment bonus
  const baseCount = rng.nextInt(4, 7);
  const attrCount = Math.min(visibleArray.length, baseCount + (extraAttributes ?? 0));
  const selected: PlayerAttribute[] = [];

  // Prioritize unobserved attributes — split pool into unseen and seen
  const unseen = visibleArray.filter((a) => !priorCounts.has(a));
  const seen = visibleArray.filter((a) => priorCounts.has(a));

  // Pick from unseen first (shuffled), then seen (shuffled) to fill remaining slots
  const shuffled = [...unseen];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const shuffledSeen = [...seen];
  for (let i = shuffledSeen.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [shuffledSeen[i], shuffledSeen[j]] = [shuffledSeen[j], shuffledSeen[i]];
  }
  const prioritized = [...shuffled, ...shuffledSeen];
  for (let i = 0; i < attrCount && i < prioritized.length; i++) {
    selected.push(prioritized[i]);
  }

  // Generate readings
  const sessionReadings = new Map<PlayerAttribute, { values: number[]; confidences: number[] }>();
  for (const attr of selected) {
    addReading(rng, sessionReadings, attr, player.attributes[attr], scout, priorCounts.get(attr) ?? 0, contextDiversity, player.form, context, 1.0);
  }

  // Convert to AttributeReading[]
  const attributeReadings: AttributeReading[] = [];
  for (const [attr, bucket] of sessionReadings) {
    const avgPerceived = Math.round(bucket.values.reduce((s, v) => s + v, 0) / bucket.values.length);
    const avgConfidence = bucket.confidences.reduce((s, c) => s + c, 0) / bucket.confidences.length;
    const totalCount = (priorCounts.get(attr) ?? 0) + bucket.values.length;
    const domain = ATTRIBUTE_DOMAINS[attr];
    const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
    const skillLevel = scout.skills[skillKey as ScoutSkill];
    const [rangeLow, rangeHigh] = calculateConfidenceRange(
      avgPerceived, avgConfidence, skillLevel, totalCount,
    );
    attributeReadings.push({
      attribute: attr,
      perceivedValue: avgPerceived,
      confidence: avgConfidence,
      observationCount: totalCount,
      rangeLow,
      rangeHigh,
    });
  }

  const suffix = rng.nextInt(100000, 999999).toString(16);
  const CONTEXT_LABELS: Partial<Record<ObservationContext, string>> = {
    trainingGround: "training",
    videoAnalysis: "video analysis",
    youthTournament: "a youth tournament",
    academyVisit: "an academy visit",
    reserveMatch: "a reserve match",
    oppositionAnalysis: "opposition analysis",
    agentShowcase: "an agent showcase",
    trialMatch: "a trial match",
    databaseQuery: "a database query",
    statsBriefing: "a stats briefing",
    deepVideoAnalysis: "deep video analysis",
  };
  const contextLabel = CONTEXT_LABELS[context] ?? "observation";
  const notes = [`Observed ${player.firstName} ${player.lastName} during ${contextLabel} — ${attributeReadings.length} attributes assessed.`];

  const abilityReading = generateAbilityReading(
    rng,
    player,
    scout,
    existingObservations,
    context,
  );

  // Personality reveal check — uses scout skills as raw numbers (Record<ScoutSkill, number>)
  const revealedPersonalityTrait = checkPersonalityReveal(
    rng,
    {
      skills: scout.skills as unknown as Record<string, number>,
      primarySpecialization: scout.primarySpecialization,
    },
    player,
    { activityType: context },
  ) ?? undefined;

  if (revealedPersonalityTrait !== undefined) {
    notes.push(`Personality insight: "${revealedPersonalityTrait}" — noted in the scout's journal.`);
  }

  // Progressive personality profile reveal
  const playerObsCount = existingObservations.filter((o) => o.playerId === player.id).length + 1;
  const psychoSkill = scout.skills.psychologicalRead;
  let updatedPersonalityProfile: import("@/engine/core/types").PersonalityProfile | undefined;
  if (player.personalityProfile) {
    const updated = progressivePersonalityReveal(rng, player.personalityProfile, playerObsCount, psychoSkill);
    if (updated !== player.personalityProfile) {
      updatedPersonalityProfile = updated;
      if (!updated.hiddenUntilRevealed && player.personalityProfile.hiddenUntilRevealed) {
        notes.push(`Character profile emerging: this player appears to be a "${updated.archetype}" personality type.`);
      }
    }
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
    flaggedMoments: [],
    abilityReading,
    revealedPersonalityTrait,
    updatedPersonalityProfile,
  };
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
  /** The focus lens used for this observation, if any. Pass undefined for general/unfocused. */
  focusLens?: string,
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

  // Context diversity: normalized count of unique context types for this player (0–1)
  const playerObs = existingObservations.filter((o) => o.playerId === player.id);
  const uniqueContextTypes = new Set<ObservationContext>(playerObs.map((o) => o.context));
  uniqueContextTypes.add(context);
  const contextDiversity = Math.min(1, uniqueContextTypes.size / 5); // 5 possible context types

  // Compute breakthrough bonus (breaks the 65% plateau)
  const { bonus: breakthroughBonus } = computeScoutingBreakthroughBonus(
    existingObservations,
    player.id,
    context,
    focusLens,
  );

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
        addReading(rng, sessionReadings, attr, player.attributes[attr], scout, priorCounts.get(attr) ?? 0, contextDiversity, player.form, context, 1.5, breakthroughBonus);
      }
      continue;
    }

    const visibleAttrs = getVisibleAttributes(phase, context, scout.skills);
    for (const attr of visibleAttrs) {
      addReading(rng, sessionReadings, attr, player.attributes[attr], scout, priorCounts.get(attr) ?? 0, contextDiversity, player.form, context, 1.0, breakthroughBonus);
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
    const domain = ATTRIBUTE_DOMAINS[attr];
    const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
    const skillLevel = scout.skills[skillKey as ScoutSkill];
    const [rangeLow, rangeHigh] = calculateConfidenceRange(
      avgPerceived, avgConfidence, skillLevel, totalCount,
    );

    attributeReadings.push({
      attribute: attr,
      perceivedValue: avgPerceived,
      confidence: avgConfidence,
      observationCount: totalCount,
      rangeLow,
      rangeHigh,
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

  const abilityReading = generateAbilityReading(
    rng,
    player,
    scout,
    existingObservations,
    context,
  );

  // Personality reveal check — match contexts expose character under pressure
  const revealedPersonalityTrait = checkPersonalityReveal(
    rng,
    {
      skills: scout.skills as unknown as Record<string, number>,
      primarySpecialization: scout.primarySpecialization,
    },
    player,
    { activityType: context },
  ) ?? undefined;

  if (revealedPersonalityTrait !== undefined) {
    notes.push(`Personality insight: "${revealedPersonalityTrait}" — noted in the scout's journal.`);
  }

  // Progressive personality profile reveal
  const matchObsCount = existingObservations.filter((o) => o.playerId === player.id).length + 1;
  const matchPsychoSkill = scout.skills.psychologicalRead;
  let updatedPersonalityProfile: import("@/engine/core/types").PersonalityProfile | undefined;
  if (player.personalityProfile) {
    const updated = progressivePersonalityReveal(rng, player.personalityProfile, matchObsCount, matchPsychoSkill);
    if (updated !== player.personalityProfile) {
      updatedPersonalityProfile = updated;
      if (!updated.hiddenUntilRevealed && player.personalityProfile.hiddenUntilRevealed) {
        notes.push(`Character profile emerging: this player appears to be a "${updated.archetype}" personality type.`);
      }
    }
  }

  // Determine the stored focus lens (only non-general lenses are stored)
  const storedLens = focusLens && focusLens !== "general"
    ? focusLens as Observation["focusLens"]
    : undefined;

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
    abilityReading,
    revealedPersonalityTrait,
    updatedPersonalityProfile,
    focusLens: storedLens,
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
  breakthroughBonus = 0,
): void {
  const domain = ATTRIBUTE_DOMAINS[attr];
  const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
  const skillLevel = scout.skills[skillKey as ScoutSkill];
  const effectiveSkill = extraNoise > 1 ? Math.max(1, skillLevel - Math.round((extraNoise - 1) * 5)) : skillLevel;

  const { perceivedValue, confidence } = perceiveAttribute(rng, trueValue, effectiveSkill, priorCount + 1, contextDiversity, playerForm, context, scout.fatigue, breakthroughBonus);

  const bucket = readings.get(attr) ?? { values: [], confidences: [] };
  bucket.values.push(perceivedValue);
  bucket.confidences.push(confidence);
  readings.set(attr, bucket);
}
