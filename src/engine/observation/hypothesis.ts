/**
 * Hypothesis System
 *
 * Hypotheses are investigative questions about players that scouts form
 * during observation. They start as open questions ("Is this player's
 * passing really as good as it looks?") and accumulate evidence over
 * multiple sessions until confirmed or debunked.
 *
 * The system tracks scout intuition accuracy over time, creating a
 * meta-game of self-awareness about one's own scouting biases.
 */

import type { RNG } from "@/engine/rng/index";
import type {
  Hypothesis,
  HypothesisEvidence,
  HypothesisState,
  PlayerMoment,
} from "@/engine/observation/types";
import type { AttributeDomain } from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Probability of a hypothesis triggering in a given session (30%). */
const HYPOTHESIS_TRIGGER_CHANCE = 0.3;

/** Minimum moments for the same player required to trigger a hypothesis. */
const MIN_MOMENTS_FOR_HYPOTHESIS = 2;

/** Quality threshold above which a moment counts as high quality. */
const HIGH_QUALITY_THRESHOLD = 7;

/** Quality threshold below which a moment counts as low quality. */
const LOW_QUALITY_THRESHOLD = 5;

/** Quality threshold above which evidence is considered 'strong'. */
const STRONG_EVIDENCE_THRESHOLD = 8;

/** Quality range lower bound for 'moderate' evidence. */
const MODERATE_EVIDENCE_MIN = 5;

/** Evidence weight for strong evidence pieces. */
const STRONG_WEIGHT = 2;

/** Evidence weight for moderate evidence pieces. */
const MODERATE_WEIGHT = 1;

/** Evidence weight for weak evidence pieces. */
const WEAK_WEIGHT = 0.5;

/** Insight bonus for a confirmed hypothesis. */
const CONFIRMED_IP_BONUS = 5;

/** Insight bonus for a debunked hypothesis (learning from mistakes). */
const DEBUNKED_IP_BONUS = 2;

// =============================================================================
// HYPOTHESIS TEMPLATES
// =============================================================================

/**
 * Template entries per moment type and quality band.
 * "high" = quality >= HIGH_QUALITY_THRESHOLD
 * "low"  = quality < LOW_QUALITY_THRESHOLD
 * "mixed" = everything in between
 *
 * {playerName} is substituted at generation time.
 */
export type QualityBand = "high" | "mixed" | "low";

export interface HypothesisTemplateEntry {
  text: string;
  band: QualityBand;
  domain: AttributeDomain;
}

export const HYPOTHESIS_TEMPLATES: Record<
  PlayerMoment["momentType"],
  HypothesisTemplateEntry[]
> = {
  technicalAction: [
    // High quality
    {
      text: "Could {playerName}'s technical ability be even better than it appears? That first touch was extraordinary.",
      band: "high",
      domain: "technical",
    },
    {
      text: "Is {playerName} genuinely elite technically, or did the conditions just happen to favour them today?",
      band: "high",
      domain: "technical",
    },
    {
      text: "Does {playerName}'s technical quality hold up against stronger opposition, or is this level masking limitations?",
      band: "high",
      domain: "technical",
    },
    {
      text: "Could {playerName}'s ball control be a genuine differentiator at the next level? The evidence is building.",
      band: "high",
      domain: "technical",
    },
    // Mixed quality
    {
      text: "Is {playerName} inconsistent technically, or was that poor touch just an off-moment?",
      band: "mixed",
      domain: "technical",
    },
    {
      text: "Does {playerName}'s technique fluctuate with confidence, or is this an underlying skill gap?",
      band: "mixed",
      domain: "technical",
    },
    {
      text: "Is {playerName}'s technical range genuinely wide, or are they relying on one or two strong actions?",
      band: "mixed",
      domain: "technical",
    },
    // Low quality
    {
      text: "Does {playerName} lack the technical foundation for the next level?",
      band: "low",
      domain: "technical",
    },
    {
      text: "Is {playerName}'s poor technique a habit, or can it be coached out at this age?",
      band: "low",
      domain: "technical",
    },
    {
      text: "Are {playerName}'s technical errors a sign of nerves, or a deeper problem with the fundamentals?",
      band: "low",
      domain: "technical",
    },
  ],

  physicalTest: [
    // High quality
    {
      text: "Is {playerName} genuinely quick, or did the opposition give them too much space?",
      band: "high",
      domain: "physical",
    },
    {
      text: "Does {playerName}'s athleticism translate across different contexts, or is it situational?",
      band: "high",
      domain: "physical",
    },
    {
      text: "Is {playerName}'s physical profile as exceptional as it looks, or is the level of competition skewing the read?",
      band: "high",
      domain: "physical",
    },
    {
      text: "Could {playerName}'s physical attributes become their primary asset at the next level?",
      band: "high",
      domain: "physical",
    },
    // Mixed quality (physicalTest rarely produces purely mixed readings, but include for completeness)
    {
      text: "Is {playerName}'s physicality inconsistent, or were specific match conditions responsible for the variation?",
      band: "mixed",
      domain: "physical",
    },
    {
      text: "Does {playerName} struggle to sustain physical output over a full session, or was this a fatigue situation?",
      band: "mixed",
      domain: "physical",
    },
    {
      text: "Is {playerName}'s physical profile a strength or a liability? The evidence is conflicting.",
      band: "mixed",
      domain: "physical",
    },
    // Low quality
    {
      text: "Is {playerName}'s lack of pace a fundamental limitation, or can it be developed at this age?",
      band: "low",
      domain: "physical",
    },
    {
      text: "Does {playerName}'s physical profile make the next level unrealistic, or is there still growth ahead?",
      band: "low",
      domain: "physical",
    },
    {
      text: "Is {playerName} physically underdeveloped, or was today's performance affected by external factors?",
      band: "low",
      domain: "physical",
    },
  ],

  mentalResponse: [
    // High quality
    {
      text: "Does {playerName} have genuine composure under pressure, or was this situation not truly pressured?",
      band: "high",
      domain: "mental",
    },
    {
      text: "Is {playerName}'s mental strength a consistent trait, or did they just respond well in one isolated moment?",
      band: "high",
      domain: "mental",
    },
    {
      text: "Does {playerName} actively seek pressure situations, or are they simply unaffected when caught in them?",
      band: "high",
      domain: "mental",
    },
    {
      text: "Could {playerName}'s mental resilience be the attribute that elevates them above players with better raw ability?",
      band: "high",
      domain: "mental",
    },
    // Mixed quality
    {
      text: "Is {playerName} mentally inconsistent, or does their composure depend on the stakes involved?",
      band: "mixed",
      domain: "mental",
    },
    {
      text: "Does {playerName}'s mental game fluctuate based on the scoreline, or is something else affecting their focus?",
      band: "mixed",
      domain: "mental",
    },
    {
      text: "Is {playerName}'s concentration patchy by nature, or are they still developing the habit of full focus?",
      band: "mixed",
      domain: "mental",
    },
    // Low quality
    {
      text: "Is {playerName} mentally fragile, or just having an off day?",
      band: "low",
      domain: "mental",
    },
    {
      text: "Does {playerName} fold under pressure, or is there a specific trigger that causes the mental drop-off?",
      band: "low",
      domain: "mental",
    },
    {
      text: "Is {playerName}'s mental response to adversity a ceiling-capper, or something a good environment can address?",
      band: "low",
      domain: "mental",
    },
  ],

  tacticalDecision: [
    // High quality
    {
      text: "Is {playerName}'s positioning instinctive, or coached? The answer matters for long-term ceiling.",
      band: "high",
      domain: "tactical",
    },
    {
      text: "Does {playerName} read the game ahead of the play, or are they reacting well to what is already obvious?",
      band: "high",
      domain: "tactical",
    },
    {
      text: "Is {playerName}'s tactical intelligence developed enough to thrive in a more structured system?",
      band: "high",
      domain: "tactical",
    },
    {
      text: "Could {playerName}'s tactical awareness become a genuine elite attribute with the right coaching environment?",
      band: "high",
      domain: "tactical",
    },
    // Mixed quality
    {
      text: "Is {playerName}'s decision-making inconsistent, or do they struggle in specific game states only?",
      band: "mixed",
      domain: "tactical",
    },
    {
      text: "Does {playerName} understand the system they are playing in, or are they improvising around it?",
      band: "mixed",
      domain: "tactical",
    },
    {
      text: "Is {playerName}'s tactical read improving across the session, or does their focus on decisions fade over time?",
      band: "mixed",
      domain: "tactical",
    },
    // Low quality
    {
      text: "Does {playerName} understand the game, or just follow instructions?",
      band: "low",
      domain: "tactical",
    },
    {
      text: "Is {playerName}'s poor decision-making a coachability issue, or a genuine lack of spatial awareness?",
      band: "low",
      domain: "tactical",
    },
    {
      text: "Does {playerName} struggle to make decisions independently, or are they hampered by the team structure around them?",
      band: "low",
      domain: "tactical",
    },
  ],

  characterReveal: [
    // High quality
    {
      text: "Is {playerName} a leader in the making? That reaction to adversity was remarkable.",
      band: "high",
      domain: "hidden",
    },
    {
      text: "Does {playerName}'s character hold up under real scrutiny, or are they performing for the audience today?",
      band: "high",
      domain: "hidden",
    },
    {
      text: "Is {playerName}'s attitude genuinely exceptional, or is this a particularly motivating environment for them?",
      band: "high",
      domain: "hidden",
    },
    {
      text: "Could {playerName}'s character and drive carry them further than their raw attributes alone would suggest?",
      band: "high",
      domain: "hidden",
    },
    // Mixed quality
    {
      text: "Is {playerName}'s attitude consistent throughout a session, or does their engagement depend on circumstances?",
      band: "mixed",
      domain: "hidden",
    },
    {
      text: "Does {playerName} show real character when things go wrong, or do they need things to go right to perform?",
      band: "mixed",
      domain: "hidden",
    },
    {
      text: "Is {playerName}'s drive genuine, or are they motivated by external validation rather than internal standards?",
      band: "mixed",
      domain: "hidden",
    },
    // Low quality
    {
      text: "Is {playerName}'s attitude a concern, or are they just frustrated by circumstances?",
      band: "low",
      domain: "hidden",
    },
    {
      text: "Does {playerName} give up when the game is not going their way, or is there a deeper character issue here?",
      band: "low",
      domain: "hidden",
    },
    {
      text: "Is {playerName}'s reaction to setbacks a warning sign, or is this a one-off response to unusual pressure?",
      band: "low",
      domain: "hidden",
    },
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Classify a quality value into a QualityBand.
 * quality >= 8 → "high", quality < 5 → "low", otherwise "mixed".
 */
function classifyQuality(quality: number): QualityBand {
  if (quality >= HIGH_QUALITY_THRESHOLD) return "high";
  if (quality < LOW_QUALITY_THRESHOLD) return "low";
  return "mixed";
}

/**
 * Classify a quality value into an evidence strength label.
 * quality >= 8 → "strong", quality 5–7 → "moderate", 1–4 → "weak".
 */
function classifyEvidenceStrength(
  quality: number,
): HypothesisEvidence["strength"] {
  if (quality >= STRONG_EVIDENCE_THRESHOLD) return "strong";
  if (quality >= MODERATE_EVIDENCE_MIN) return "moderate";
  return "weak";
}

/**
 * Compute the numeric weight of a single piece of evidence for resolution.
 */
function evidenceWeight(strength: HypothesisEvidence["strength"]): number {
  switch (strength) {
    case "strong":
      return STRONG_WEIGHT;
    case "moderate":
      return MODERATE_WEIGHT;
    case "weak":
      return WEAK_WEIGHT;
  }
}

/**
 * Build a simple narrative description for an evidence entry based on
 * the moment it was derived from.
 */
function buildEvidenceDescription(
  moment: PlayerMoment,
  direction: "for" | "against",
): string {
  const qualifier = direction === "for" ? "positive" : "negative";
  return `${qualifier} ${moment.momentType} observation (quality ${moment.quality}/10) — ${moment.vagueDescription}`;
}

/**
 * Map a moment type to its AttributeDomain for hypothesis matching.
 * Used when filtering moments that are relevant to an existing hypothesis.
 */
function momentTypeToDomain(
  momentType: PlayerMoment["momentType"],
): AttributeDomain {
  const map: Record<PlayerMoment["momentType"], AttributeDomain> = {
    technicalAction: "technical",
    physicalTest: "physical",
    mentalResponse: "mental",
    tacticalDecision: "tactical",
    characterReveal: "hidden",
  };
  return map[momentType];
}

/**
 * Generate a unique hypothesis ID from the player ID and creation week.
 * Collisions within a single week are avoided by a random suffix from the RNG.
 */
function generateHypothesisId(rng: RNG, playerId: string, week: number): string {
  const suffix = rng.nextInt(1000, 9999);
  return `hyp-${playerId.slice(0, 8)}-w${week}-${suffix}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Performs template substitution for the {playerName} placeholder.
 */
export function formatHypothesisText(
  template: string,
  playerName: string,
): string {
  return template.replace(/\{playerName\}/g, playerName);
}

/**
 * Attempt to generate a new hypothesis from the moments collected in the
 * current observation session.
 *
 * Rules:
 *  - At least MIN_MOMENTS_FOR_HYPOTHESIS moments must exist for the same player.
 *  - A 30% chance gate is applied via the RNG.
 *  - The dominant moment type (most frequent) drives template selection.
 *  - Template quality band is derived from the average quality of moments for
 *    that player in the session.
 *
 * Returns null when no hypothesis triggers.
 */
export function generateHypothesis(
  rng: RNG,
  playerId: string,
  playerName: string,
  moments: PlayerMoment[],
  week: number,
): Hypothesis | null {
  // Filter to moments for this player only.
  const playerMoments = moments.filter((m) => m.playerId === playerId);

  if (playerMoments.length < MIN_MOMENTS_FOR_HYPOTHESIS) {
    return null;
  }

  // 30% chance gate.
  if (!rng.chance(HYPOTHESIS_TRIGGER_CHANCE)) {
    return null;
  }

  // Determine the dominant moment type by frequency count.
  const typeCounts = new Map<PlayerMoment["momentType"], number>();
  for (const m of playerMoments) {
    typeCounts.set(m.momentType, (typeCounts.get(m.momentType) ?? 0) + 1);
  }

  let dominantType: PlayerMoment["momentType"] = "technicalAction";
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  // Determine quality band from average quality of player's moments.
  const avgQuality =
    playerMoments.reduce((sum, m) => sum + m.quality, 0) / playerMoments.length;
  const band = classifyQuality(avgQuality);

  // Select a random template from the matching type + band pool.
  const pool = HYPOTHESIS_TEMPLATES[dominantType].filter(
    (t) => t.band === band,
  );

  // Fall back to any template for this type if band pool is unexpectedly empty.
  const candidates =
    pool.length > 0 ? pool : HYPOTHESIS_TEMPLATES[dominantType];

  const template = rng.pick(candidates);
  const text = formatHypothesisText(template.text, playerName);

  return {
    id: generateHypothesisId(rng, playerId, week),
    playerId,
    text,
    domain: template.domain,
    state: "open",
    createdAtWeek: week,
    evidence: [],
  };
}

/**
 * Incorporate new observations into an existing hypothesis.
 *
 * For each moment of the same player whose domain matches the hypothesis:
 *  - High quality (>= HIGH_QUALITY_THRESHOLD) → evidence 'for'.
 *  - Low quality (< LOW_QUALITY_THRESHOLD) → evidence 'against'.
 *  - Mid-range quality → skipped (inconclusive, does not add noise).
 *
 * The hypothesis state is updated to reflect the current evidence balance:
 *  - More 'for' weighted evidence than 'against' → 'supported'.
 *  - More 'against' → 'contradicted'.
 *  - Equal → state unchanged.
 *
 * Already-resolved hypotheses (confirmed/debunked) are returned unchanged.
 */
export function evaluateHypothesis(
  hypothesis: Hypothesis,
  newMoments: PlayerMoment[],
  week: number,
): Hypothesis {
  if (
    hypothesis.state === "confirmed" ||
    hypothesis.state === "debunked"
  ) {
    return hypothesis;
  }

  // Only moments for this player that match the hypothesis domain.
  const relevantMoments = newMoments.filter(
    (m) =>
      m.playerId === hypothesis.playerId &&
      momentTypeToDomain(m.momentType) === hypothesis.domain,
  );

  if (relevantMoments.length === 0) {
    return hypothesis;
  }

  const newEvidence: HypothesisEvidence[] = [];

  for (const moment of relevantMoments) {
    if (moment.quality >= HIGH_QUALITY_THRESHOLD) {
      newEvidence.push({
        week,
        direction: "for",
        description: buildEvidenceDescription(moment, "for"),
        strength: classifyEvidenceStrength(moment.quality),
      });
    } else if (moment.quality < LOW_QUALITY_THRESHOLD) {
      newEvidence.push({
        week,
        direction: "against",
        description: buildEvidenceDescription(moment, "against"),
        strength: classifyEvidenceStrength(moment.quality),
      });
    }
    // Mid-range quality: inconclusive — deliberately omitted.
  }

  if (newEvidence.length === 0) {
    return hypothesis;
  }

  const updatedEvidence = [...hypothesis.evidence, ...newEvidence];

  // Compute weighted totals from all accumulated evidence.
  let forTotal = 0;
  let againstTotal = 0;
  for (const e of updatedEvidence) {
    const w = evidenceWeight(e.strength);
    if (e.direction === "for") {
      forTotal += w;
    } else {
      againstTotal += w;
    }
  }

  let updatedState: HypothesisState = hypothesis.state;
  if (forTotal > againstTotal) {
    updatedState = "supported";
  } else if (againstTotal > forTotal) {
    updatedState = "contradicted";
  }
  // Exact tie: state unchanged.

  return {
    ...hypothesis,
    evidence: updatedEvidence,
    state: updatedState,
  };
}

/**
 * Force-resolve a hypothesis to a terminal state based on current evidence.
 *
 * Scoring:
 *  - strong → 2 points, moderate → 1 point, weak → 0.5 points.
 *  - forTotal > againstTotal → 'confirmed'.
 *  - againstTotal > forTotal → 'debunked'.
 *  - Exact tie → state unchanged (hypothesis stays at current non-terminal state).
 *
 * Already confirmed/debunked hypotheses are returned unchanged.
 */
export function resolveHypothesis(hypothesis: Hypothesis): Hypothesis {
  if (
    hypothesis.state === "confirmed" ||
    hypothesis.state === "debunked"
  ) {
    return hypothesis;
  }

  let forTotal = 0;
  let againstTotal = 0;

  for (const e of hypothesis.evidence) {
    const w = evidenceWeight(e.strength);
    if (e.direction === "for") {
      forTotal += w;
    } else {
      againstTotal += w;
    }
  }

  if (forTotal > againstTotal) {
    return { ...hypothesis, state: "confirmed" };
  }

  if (againstTotal > forTotal) {
    return { ...hypothesis, state: "debunked" };
  }

  // Equal totals: no resolution — return unchanged.
  return hypothesis;
}

/**
 * Returns the insight point bonus earned when a hypothesis reaches a
 * terminal state.
 *
 *  - confirmed: 5 IP (hypothesis validated — scout's read was correct).
 *  - debunked:  2 IP (learning from a mistaken initial impression).
 *  - Others:    0 IP (not yet resolved).
 */
export function getHypothesisInsightBonus(hypothesis: Hypothesis): number {
  switch (hypothesis.state) {
    case "confirmed":
      return CONFIRMED_IP_BONUS;
    case "debunked":
      return DEBUNKED_IP_BONUS;
    default:
      return 0;
  }
}

/**
 * Returns all hypotheses that are still being investigated.
 * An open hypothesis is in state: 'open', 'supported', or 'contradicted'.
 */
export function getOpenHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  return hypotheses.filter(
    (h) =>
      h.state === "open" ||
      h.state === "supported" ||
      h.state === "contradicted",
  );
}

/**
 * Returns all hypotheses that have reached a terminal resolution state.
 * A resolved hypothesis is in state: 'confirmed' or 'debunked'.
 */
export function getResolvedHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  return hypotheses.filter(
    (h) => h.state === "confirmed" || h.state === "debunked",
  );
}
