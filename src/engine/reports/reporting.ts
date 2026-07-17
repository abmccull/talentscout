/**
 * Report system — generates, evaluates, and finalises scouting reports.
 *
 * Pipeline:
 *   observations → generateReportContent() → scout edits draft
 *   → finalizeReport() → ScoutReport persisted
 *   → trackPostTransfer() called after transfer + seasons pass
 *
 * All functions are pure (no side effects, no mutation of inputs).
 */

import type {
  Player,
  Scout,
  ScoutReport,
  Observation,
  AttributeAssessment,
  PlayerAttribute,
  AttributeDomain,
  ConvictionLevel,
  Position,
} from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS as ATTR_DOMAINS } from "@/engine/core/types";
import { starsToAbility } from "@/engine/scout/starRating";
import { calculateMarketValue } from "@/engine/players/generation";
import { resolveScoutPerkModifiers } from "@/engine/specializations/perks";

// ---------------------------------------------------------------------------
// Report draft type
// ---------------------------------------------------------------------------

export interface ReportDraft {
  attributeAssessments: AttributeAssessment[];
  suggestedStrengths: string[];
  suggestedWeaknesses: string[];
  /** Structured, evidence-linked alternatives for an editable report. */
  suggestedStrengthClaims: ReportClaimSuggestion[];
  suggestedWeaknessClaims: ReportClaimSuggestion[];
  comparisonSuggestions: string[];
  estimatedValue: number;
  estimatedValueRange?: [number, number];
  perceivedCAStars?: number;
  perceivedPARange?: [number, number];
  /** System fit score for first-team scouts (0-100). */
  systemFitScore?: number;
  /** Statistical highlights for data scouts. */
  statisticalHighlights?: string[];
}

// ---------------------------------------------------------------------------
// Quality preview types
// ---------------------------------------------------------------------------

export interface QualityBreakdown {
  observationDepth: number;   // 0-25
  confidenceLevel: number;    // 0-20
  convictionFit: number;      // 0-15
  detail: number;             // 0-20
  scoutSkill: number;         // 0-20
}

export interface QualityPreviewResult {
  score: number;              // 0-100
  breakdown: QualityBreakdown;
  hints: string[];
}

// ---------------------------------------------------------------------------
// Position average attribute baselines
// ---------------------------------------------------------------------------

/**
 * Average attribute values for a competent professional at each position.
 * Used to identify genuine strengths/weaknesses relative to positional norms.
 * Scale: 1–20.
 *
 * Only includes the PlayerAttribute union members present in the canonical
 * types.ts: firstTouch | passing | dribbling | crossing | shooting | heading
 *         | pace | strength | stamina | agility
 *         | composure | positioning | workRate | decisionMaking | leadership
 *         | offTheBall | pressing | defensiveAwareness
 */
const POSITION_AVERAGES: Record<Position, Partial<Record<PlayerAttribute, number>>> = {
  GK: {
    composure: 12, positioning: 13, decisionMaking: 12, leadership: 11,
    anticipation: 13, passing: 11, firstTouch: 10, vision: 10,
    strength: 11, pace: 7, balance: 10, jumping: 11, teamwork: 10,
  },
  CB: {
    heading: 13, strength: 12, positioning: 13, decisionMaking: 12,
    composure: 11, leadership: 11, passing: 10, defensiveAwareness: 14, pressing: 10,
    tackling: 13, jumping: 12, marking: 13, anticipation: 12, teamwork: 12,
  },
  LB: {
    crossing: 12, pace: 13, stamina: 13, agility: 12, workRate: 12,
    defensiveAwareness: 12, pressing: 11,
    tackling: 11, balance: 11, marking: 11, teamwork: 12, anticipation: 10,
  },
  RB: {
    crossing: 12, pace: 13, stamina: 13, agility: 12, workRate: 12,
    defensiveAwareness: 12, pressing: 11,
    tackling: 11, balance: 11, marking: 11, teamwork: 12, anticipation: 10,
  },
  CDM: {
    strength: 12, passing: 12, decisionMaking: 12, stamina: 13,
    workRate: 13, defensiveAwareness: 13, pressing: 13,
    tackling: 13, marking: 12, anticipation: 12, teamwork: 13, vision: 11,
  },
  CM: {
    passing: 13, decisionMaking: 12, stamina: 13, firstTouch: 12,
    workRate: 12, offTheBall: 11, pressing: 11,
    vision: 12, teamwork: 12, anticipation: 11, balance: 11,
  },
  CAM: {
    passing: 13, firstTouch: 13, dribbling: 12, decisionMaking: 12,
    composure: 12, offTheBall: 13, shooting: 11,
    vision: 14, finishing: 11, balance: 11, anticipation: 11,
  },
  LW: {
    dribbling: 13, crossing: 13, pace: 14, agility: 13, firstTouch: 12,
    shooting: 11, offTheBall: 12,
    finishing: 12, balance: 12,
  },
  RW: {
    dribbling: 13, crossing: 13, pace: 14, agility: 13, firstTouch: 12,
    shooting: 11, offTheBall: 12,
    finishing: 12, balance: 12,
  },
  ST: {
    shooting: 14, composure: 13, positioning: 13, heading: 12,
    firstTouch: 12, strength: 12, pace: 12, decisionMaking: 12, offTheBall: 13,
    finishing: 14, jumping: 11, balance: 11, anticipation: 12,
  },
};

// ---------------------------------------------------------------------------
// Age-scaled baselines for youth evaluation
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier (0.0–1.0) representing what fraction of adult baselines
 * a player of this age should be measured against.
 * Based on typical CA ranges by age from youth generation.
 */
function getAgeBaselineScale(age: number): number {
  if (age >= 21) return 1.0;
  const scaleByAge: Record<number, number> = {
    14: 0.45, 15: 0.52, 16: 0.60, 17: 0.68, 18: 0.76, 19: 0.84, 20: 0.92,
  };
  return scaleByAge[age] ?? (age < 14 ? 0.42 : 1.0);
}

export interface ReportClaimSuggestion {
  descriptor: string;
  attributes: PlayerAttribute[];
  estimatedValue: number;
  confidence: number;
}

/**
 * Scales position averages down by the age factor so youth players are
 * evaluated against age-appropriate baselines instead of adult norms.
 * At age 21+, returns POSITION_AVERAGES unchanged.
 */
function getAgeAdjustedAverages(
  position: Position,
  age: number,
): Partial<Record<PlayerAttribute, number>> {
  const baselines = POSITION_AVERAGES[position] ?? {};
  if (age >= 21) return baselines;

  const scale = getAgeBaselineScale(age);
  const adjusted: Partial<Record<PlayerAttribute, number>> = {};
  for (const [attr, avg] of Object.entries(baselines)) {
    adjusted[attr as PlayerAttribute] = Math.max(1, Math.round(avg * scale));
  }
  return adjusted;
}

// ---------------------------------------------------------------------------
// Strength/weakness descriptor templates
// ---------------------------------------------------------------------------

export const STRENGTH_DESCRIPTORS: Partial<Record<PlayerAttribute, string>> = {
  shooting:           "Clinical in front of goal — rarely squanders clear opportunities",
  dribbling:          "Exceptional ball-carrier who can take on defenders in tight areas",
  crossing:           "Delivers dangerous, well-weighted crosses from wide positions",
  heading:            "Dominant in the air — attacks the ball with conviction and wins his fair share",
  passing:            "Precise in tight spaces — keeps the ball moving with calm efficiency",
  firstTouch:         "Excellent first touch allows him to control difficult passes instantly",
  pace:               "Devastating pace that stretches defences and creates transition danger",
  strength:           "Physically imposing — holds off challenges and protects the ball effectively",
  stamina:            "Tireless engine — maintains a high intensity for the full ninety minutes",
  agility:            "Nimble and quick to change direction; difficult to pin down",
  composure:          "Ice-cool composure — performs as well under pressure as in training",
  positioning:        "Excellent positional intelligence — always in the right place at the right time",
  decisionMaking:     "Makes sound, composed decisions under pressure — rarely chooses the wrong option",
  workRate:           "Relentless work-rate; presses and tracks back without being asked",
  leadership:         "Natural leader who organises and motivates the players around him",
  offTheBall:         "Superb movement off the ball — constantly finds pockets of space",
  pressing:           "Excellent presser — wins the ball high and forces errors from opponents",
  defensiveAwareness: "Reads the game exceptionally well — anticipates danger before it develops",
  tackling:           "Times his challenges perfectly — wins the ball cleanly and starts attacks from deep",
  finishing:          "Deadly inside the box — converts chances with composure and precision",
  jumping:            "Outstanding in the air — great leap gives him a real advantage in aerial duels",
  balance:            "Impossible to knock off the ball — stays on his feet through the most robust challenges",
  anticipation:       "Reads the game a move ahead — intercepts and positions himself before danger materialises",
  vision:             "Sees passes others simply cannot — picks out runners with perfectly weighted delivery",
  marking:            "Disciplined marker — sticks to his man and denies opponents space to operate",
  teamwork:           "Model team player — follows instructions, maintains shape, and supports teammates",
};

export const WEAKNESS_DESCRIPTORS: Partial<Record<PlayerAttribute, string>> = {
  shooting:           "Wasteful in front of goal — misses opportunities a player of his level should convert",
  dribbling:          "Struggles to beat a man in tight areas; loses the ball under pressure too often",
  crossing:           "Delivery from wide positions is inconsistent; rarely finds the target man",
  heading:            "Uncomfortable in aerial duels — tends to avoid contests in the air",
  passing:            "Inaccurate passing under pressure — gives the ball away at key moments",
  firstTouch:         "Heavy first touch creates unnecessary pressure and slows the team down",
  pace:               "Lacks the pace to recover when beaten — a concern against quick opponents",
  strength:           "Physically weak — muscled off the ball too easily by stronger opponents",
  stamina:            "Fades significantly as matches progress — less effective in the final stages",
  agility:            "Stiff lateral movement; struggles to change direction quickly",
  composure:          "Liable to make mistakes under pressure — composure deserts him at key moments",
  positioning:        "Habitually out of position — leaves gaps that opponents are quick to exploit",
  decisionMaking:     "Prone to poor decisions under pressure — regularly chooses the wrong option",
  workRate:           "Questionable work-rate — inconsistent effort without the ball",
  leadership:         "No leadership qualities evident — fades into the background in difficult moments",
  offTheBall:         "Poor movement off the ball — predictable and easy to track for defenders",
  pressing:           "Passive without the ball — gives opponents too much time and space",
  defensiveAwareness: "Poor positional awareness defensively — often caught out by simple runs in behind",
  tackling:           "Mistimes challenges regularly — goes to ground too easily and concedes fouls",
  finishing:          "Wasteful inside the box — spurns gilt-edged chances with alarming regularity",
  jumping:            "Poor aerial presence — fails to compete effectively in aerial duels",
  balance:            "Easily dispossessed — goes down too readily under physical challenges",
  anticipation:       "Reactive rather than proactive — slow to read the play and often arrives late",
  vision:             "Limited range of passing — fails to spot runners and opts for the safe option",
  marking:            "Loses his man too easily — allows opponents to drift into dangerous positions unchecked",
  teamwork:           "Individualistic — doesn't follow tactical instructions or support teammates consistently",
};

interface ClaimCandidate extends ReportClaimSuggestion {
  severity: number;
}

interface AttributeClassification {
  isStrength: boolean;
  isWeakness: boolean;
  severity: number;
}

interface MarketValueEstimate {
  estimatedValue: number;
  estimatedValueRange: [number, number];
}

// ---------------------------------------------------------------------------
// Comparison templates
// ---------------------------------------------------------------------------

const COMPARISON_TEMPLATES: Record<string, string[]> = {
  technical: [
    "Stylistically reminiscent of a classic number ten — refined technique and creative vision",
    "Brings to mind a continental playmaker: everything done with purpose and craft",
  ],
  physical: [
    "An athlete first and foremost — the kind of physique that immediately catches the eye",
    "Physically comparable to the modern pressing forward mould: pace, power, and relentless running",
  ],
  balanced: [
    "Well-rounded profile — no glaring weakness; the kind of player that fits any system",
    "Completes rather than headlines — but managers who appreciate the full picture will value him highly",
  ],
  youth: [
    "Raw, but the underlying tools are there. Reminiscent of players who took a couple of seasons to develop before becoming excellent",
    "Needs time and the right environment, but the ceiling is genuinely intriguing",
  ],
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Synthesise raw observations into a draft report for the scout to review
 * and edit before finalising.
 */
export function generateReportContent(
  player: Player,
  observations: Observation[],
  scout: Scout,
): ReportDraft {
  if (observations.length === 0) {
    return {
      attributeAssessments: [],
      suggestedStrengths: [],
      suggestedWeaknesses: [],
      suggestedStrengthClaims: [],
      suggestedWeaknessClaims: [],
      comparisonSuggestions: [],
      estimatedValue: 0,
    };
  }

  const allAssessments = mergeReadingsIntoAssessments(observations);

  // Filter to position-relevant attributes only (GK shouldn't show finishing, etc.)
  const positionAverages = getAgeAdjustedAverages(player.position, player.age);
  const attributeAssessments = allAssessments.filter(
    (a) => positionAverages[a.attribute] !== undefined,
  );

  // Aggregate ability readings from the 3 most recent observations
  const recentWithAbility = observations
    .filter((o) => o.abilityReading)
    .slice(-3);
  const perkModifiers = resolveScoutPerkModifiers(scout);
  const canShowYouthProjection =
    scout.primarySpecialization !== "youth"
    || player.age > 20
    || perkModifiers.canSeeYouthProjection;

  let perceivedCAStars: number | undefined;
  let perceivedPARange: [number, number] | undefined;

  if (recentWithAbility.length > 0) {
    const avgCA =
      recentWithAbility.reduce((s, o) => s + o.abilityReading!.perceivedCA, 0) /
      recentWithAbility.length;
    perceivedCAStars = Math.round(avgCA * 2) / 2;

    const avgPALow =
      recentWithAbility.reduce((s, o) => s + o.abilityReading!.perceivedPALow, 0) /
      recentWithAbility.length;
    const avgPAHigh =
      recentWithAbility.reduce((s, o) => s + o.abilityReading!.perceivedPAHigh, 0) /
      recentWithAbility.length;
    if (canShowYouthProjection) {
      perceivedPARange = [
        Math.round(avgPALow * 2) / 2,
        Math.min(5.0, Math.round(avgPAHigh * 2) / 2),
      ];
    }
  }

  const suggestedStrengthClaims = identifyStrengthClaims(player, attributeAssessments, positionAverages);
  const suggestedWeaknessClaims = identifyWeaknessClaims(player, attributeAssessments, positionAverages);
  const suggestedStrengths = suggestedStrengthClaims.map((claim) => claim.descriptor);
  const suggestedWeaknesses = suggestedWeaknessClaims.map((claim) => claim.descriptor);

  const comparisonSuggestions = buildComparisonSuggestions(
    attributeAssessments,
    player.age,
  );

  const { estimatedValue, estimatedValueRange } = estimateMarketValue(
    attributeAssessments,
    player,
    scout,
    perceivedCAStars,
    perceivedPARange,
  );

  return {
    attributeAssessments,
    suggestedStrengths,
    suggestedWeaknesses,
    suggestedStrengthClaims,
    suggestedWeaknessClaims,
    comparisonSuggestions,
    estimatedValue,
    estimatedValueRange,
    perceivedCAStars,
    perceivedPARange,
  };
}

/**
 * Score a finalised report against the player's true values.
 * Returns 0–100.
 *
 * Note: `player` here has the true attribute values (internal, not shown to
 * the scout during gameplay). This function is only called post-hoc by the
 * game engine for quality calculation.
 */
/** Detailed quality breakdown returned by calculateReportQualityDetailed(). */
export interface ReportQualityDetailed {
  score: number;
  breakdown: {
    accuracy: number;
    coverage: number;
    conviction: number;
    tightness: number;
    personalityBonus: number;
    equipmentBonus: number;
  };
}

/**
 * Score a finalised report against the player's true values, returning both
 * the overall score (0–100) and a per-component breakdown.
 */
export function calculateReportQualityDetailed(
  report: ScoutReport,
  player: Player,
  /** Additive bonus from equipment (0–1 scale, e.g. 0.05 = +5%). */
  reportQualityBonus?: number,
): ReportQualityDetailed {
  if (report.attributeAssessments.length === 0) {
    return { score: 0, breakdown: { accuracy: 0, coverage: 0, conviction: 0, tightness: 0, personalityBonus: 0, equipmentBonus: 0 } };
  }

  const trueAttrs = player.attributes;
  let totalError = 0;
  let count = 0;

  for (const assessment of report.attributeAssessments) {
    const trueValue = trueAttrs[assessment.attribute];
    const error = Math.abs(assessment.estimatedValue - trueValue);
    totalError += error;
    count++;
  }

  const averageError = count > 0 ? totalError / count : 10;

  // Accuracy score: error 0 → 100, error 5 → 30, error 10+ → 0
  const accuracyRaw = Math.max(0, 100 - averageError * 14);

  // Coverage: % of position-relevant attributes assessed
  const relevantAttributes = getRelevantAttributes(player.position);
  const assessedRelevant = report.attributeAssessments.filter((a) =>
    relevantAttributes.includes(a.attribute),
  ).length;
  const coverageRaw =
    (assessedRelevant / Math.max(1, relevantAttributes.length)) * 100;

  // Conviction appropriateness — use star-based CA when available
  const perceivedCa = report.perceivedCAStars != null
    ? starsToAbility(report.perceivedCAStars)
    : estimatePerceivedCA(report.attributeAssessments);
  const perceivedPa = report.perceivedPARange != null
    ? starsToAbility((report.perceivedPARange[0] + report.perceivedPARange[1]) / 2)
    : undefined;
  const convictionRaw = scoreConvictionAppropriateness(
    perceivedCa,
    player.currentAbility,
    report.conviction,
    player.age,
    perceivedPa,
  );

  // Range tightness (when ranges are correct, tight is better)
  const tightnessRaw = scoreRangeTightness(report.attributeAssessments, trueAttrs);

  // Weighted components (these are the actual points contributed to the score)
  const accuracy = accuracyRaw * 0.45;
  const coverage = coverageRaw * 0.25;
  const conviction = convictionRaw * 0.20;
  const tightness = tightnessRaw * 0.10;

  const baseQuality = accuracy + coverage + conviction + tightness;

  // Personality depth bonus: +5 quality points per revealed trait
  const personalityBonus = (player.personalityRevealed?.length ?? 0) * 5;

  // Equipment report quality bonus (additive, capped at 100)
  const equipmentBonus = (reportQualityBonus ?? 0) * 100;

  const quality = Math.round(Math.max(0, Math.min(100, baseQuality + personalityBonus + equipmentBonus)));

  return {
    score: quality,
    breakdown: {
      accuracy: Math.round(accuracy * 10) / 10,
      coverage: Math.round(coverage * 10) / 10,
      conviction: Math.round(conviction * 10) / 10,
      tightness: Math.round(tightness * 10) / 10,
      personalityBonus,
      equipmentBonus: Math.round(equipmentBonus * 10) / 10,
    },
  };
}

/**
 * Score a finalised report against the player's true values.
 * Returns 0–100. Delegates to calculateReportQualityDetailed for backward compat.
 */
export function calculateReportQuality(
  report: ScoutReport,
  player: Player,
  /** Additive bonus from equipment (0–1 scale, e.g. 0.05 = +5%). */
  reportQualityBonus?: number,
): number {
  return calculateReportQualityDetailed(report, player, reportQualityBonus).score;
}

/**
 * Estimate report quality from the scout's perspective BEFORE submission.
 *
 * Unlike `calculateReportQuality` (which requires true player attributes),
 * this function works entirely from information available to the scout during
 * the report-writing process. The estimate is intentionally approximate --
 * the real score also factors in accuracy against hidden true values.
 *
 * Breakdown (sums to 100 max):
 *   Observation depth:       0-25   (how many observations and attribute coverage)
 *   Confidence level:        0-20   (average confidence across readings)
 *   Conviction appropriateness: 0-15 (conviction vs. perceived CA alignment)
 *   Detail (strengths/weaknesses): 0-20 (how many editorial details provided)
 *   Scout skill:             0-20   (average of scout's five core skills)
 */
export function estimateReportQuality(params: {
  observationCount: number;
  avgConfidence: number;
  convictionLevel: ConvictionLevel;
  strengthCount: number;
  weaknessCount: number;
  availableStrengthCount?: number;
  availableWeaknessCount?: number;
  scoutSkills: Record<string, number>;
  assessedAttributeCount?: number;
  position?: Position;
  perceivedCA?: number;
  age?: number;
  perceivedPA?: number;
}): QualityPreviewResult {
  const {
    observationCount,
    avgConfidence,
    convictionLevel,
    strengthCount,
    weaknessCount,
    availableStrengthCount,
    availableWeaknessCount,
    scoutSkills,
    assessedAttributeCount = 0,
    position,
    perceivedCA,
    age,
    perceivedPA,
  } = params;

  // --- Observation depth: 0-25 ---
  const obsFactor = Math.min(1, observationCount / 5);
  const coverageFactor = position
    ? Math.min(1, assessedAttributeCount / Math.max(1, getRelevantAttributes(position).length))
    : Math.min(1, assessedAttributeCount / 8);
  const observationDepth = Math.round((obsFactor * 0.5 + coverageFactor * 0.5) * 25);

  // --- Confidence level: 0-20 ---
  const confidenceLevel = Math.round(avgConfidence * 20);

  // --- Conviction appropriateness: 0-15 ---
  let convictionFit = 10;
  if (perceivedCA !== undefined) {
    const expectedConviction = age !== undefined
      ? getExpectedConvictionForAge(perceivedCA, age, perceivedPA)
      : getExpectedConviction(perceivedCA);
    const levels: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];
    const diff = Math.abs(levels.indexOf(convictionLevel) - levels.indexOf(expectedConviction));
    convictionFit = Math.round(Math.max(3, 15 - diff * 4));
  }

  // --- Detail (strengths/weaknesses): 0-20 ---
  const strengthTarget = Math.min(3, availableStrengthCount ?? 3);
  const weaknessTarget = Math.min(2, availableWeaknessCount ?? 2);
  const strengthScore = strengthTarget === 0 ? 1 : Math.min(1, strengthCount / strengthTarget);
  const weaknessScore = weaknessTarget === 0 ? 1 : Math.min(1, weaknessCount / weaknessTarget);
  const detail = Math.round((strengthScore * 0.5 + weaknessScore * 0.5) * 20);

  // --- Scout skill: 0-20 ---
  const skillValues = Object.values(scoutSkills);
  const avgSkill = skillValues.length > 0
    ? skillValues.reduce((s, v) => s + v, 0) / skillValues.length
    : 10;
  const scoutSkill = Math.round((avgSkill / 20) * 20);

  const breakdown: QualityBreakdown = {
    observationDepth,
    confidenceLevel,
    convictionFit,
    detail,
    scoutSkill,
  };

  const score = Math.max(0, Math.min(100,
    observationDepth + confidenceLevel + convictionFit + detail + scoutSkill,
  ));

  // --- Generate hints ---
  const hints: string[] = [];
  if (score < 70) {
    if (observationCount < 3) {
      hints.push("Add more observations to improve depth score");
    }
    const needsStrengths = strengthCount < strengthTarget;
    const needsWeaknesses = weaknessCount < weaknessTarget;
    if (needsStrengths && needsWeaknesses) {
      hints.push("Add the available evidence-backed strengths and concerns");
    } else if (needsStrengths) {
      hints.push("Add more evidence-backed strengths");
    } else if (needsWeaknesses) {
      hints.push("Add more evidence-backed concerns");
    }
    if (avgConfidence < 0.5) {
      hints.push("Observe more matches to increase attribute confidence");
    }
    if (perceivedCA !== undefined) {
      const expectedConviction = age !== undefined
        ? getExpectedConvictionForAge(perceivedCA, age, perceivedPA)
        : getExpectedConviction(perceivedCA);
      const levels: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];
      const diff = Math.abs(levels.indexOf(convictionLevel) - levels.indexOf(expectedConviction));
      if (diff >= 2) {
        hints.push("Higher conviction with sufficient evidence improves score");
      }
    }
    if (assessedAttributeCount < 6) {
      hints.push("Assess more attributes for better positional coverage");
    }
  }

  return { score, breakdown, hints };
}

export interface ReportCraftQualityDetailed {
  score: number;
  breakdown: QualityBreakdown & {
    equipmentBonus: number;
    analystReviewBonus: number;
  };
  hints: string[];
}

/**
 * Score what the scout can control at submission time. This deliberately uses
 * observations, public player context, and editorial choices only; true
 * attributes and true CA/PA are reserved for delayed validation.
 */
export function calculateReportCraftQualityDetailed(
  report: ScoutReport,
  observations: Observation[],
  scout: Scout,
  playerContext: Pick<Player, "age" | "position">,
  reportQualityBonus = 0,
  analystReviewBonus = 0,
): ReportCraftQualityDetailed {
  const readings = observations.flatMap((observation) => observation.attributeReadings);
  const avgConfidence = readings.length > 0
    ? readings.reduce((sum, reading) => sum + reading.confidence, 0) / readings.length
    : 0;
  const perceivedCA = report.perceivedCAStars !== undefined
    ? starsToAbility(report.perceivedCAStars)
    : estimatePerceivedCA(report.attributeAssessments);
  const perceivedPA = report.perceivedPARange
    ? starsToAbility((report.perceivedPARange[0] + report.perceivedPARange[1]) / 2)
    : undefined;
  const preview = estimateReportQuality({
    observationCount: observations.length,
    avgConfidence,
    convictionLevel: report.conviction,
    strengthCount: report.strengths.length,
    weaknessCount: report.weaknesses.length,
    scoutSkills: scout.skills,
    assessedAttributeCount: report.attributeAssessments.length,
    position: playerContext.position,
    perceivedCA,
    age: playerContext.age,
    perceivedPA,
  });
  const equipmentBonus = Math.max(0, reportQualityBonus) * 100;
  const boundedAnalystReviewBonus = Math.max(0, Math.min(6, analystReviewBonus));

  return {
    score: Math.round(Math.max(
      0,
      Math.min(100, preview.score + equipmentBonus + boundedAnalystReviewBonus),
    )),
    breakdown: {
      ...preview.breakdown,
      equipmentBonus: Math.round(equipmentBonus * 10) / 10,
      analystReviewBonus: Math.round(boundedAnalystReviewBonus * 10) / 10,
    },
    hints: preview.hints,
  };
}

export interface PrepareReportSubmissionInput {
  draft: ReportDraft;
  conviction: ConvictionLevel;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  scout: Scout;
  week: number;
  season: number;
  playerId: string;
  observations: Observation[];
  playerContext: Pick<Player, "age" | "position">;
  reportQualityBonus?: number;
  /** Additive, player-visible craft points from one eligible analyst artifact. */
  analystReviewBonus?: number;
}

/**
 * Finalize and score a report through one pure path. Both the Report Writer
 * preview and the store submission action call this function so the displayed
 * score, infrastructure/equipment bonus, and persisted craft breakdown cannot
 * diverge.
 */
export function prepareReportSubmission(
  input: PrepareReportSubmissionInput,
): { report: ScoutReport; quality: ReportCraftQualityDetailed } {
  const report = finalizeReport(
    input.draft,
    input.conviction,
    input.summary,
    input.strengths,
    input.weaknesses,
    input.scout,
    input.week,
    input.season,
    input.playerId,
  );

  return {
    report,
    quality: calculateReportCraftQualityDetailed(
      report,
      input.observations,
      input.scout,
      input.playerContext,
      input.reportQualityBonus,
      input.analystReviewBonus,
    ),
  };
}

/**
 * Convert a report draft plus editorial choices into a finalised ScoutReport.
 */
export function finalizeReport(
  draft: ReportDraft,
  conviction: ConvictionLevel,
  summary: string,
  selectedStrengths: string[],
  selectedWeaknesses: string[],
  scout: Scout,
  week: number,
  season: number,
  playerId: string,
): ScoutReport {
  const reportId = `report_${scout.id}_${playerId}_s${season}w${week}`;

  return {
    id: reportId,
    playerId,
    scoutId: scout.id,
    submittedWeek: week,
    submittedSeason: season,

    attributeAssessments: draft.attributeAssessments,
    strengths: selectedStrengths,
    weaknesses: selectedWeaknesses,

    conviction,
    summary,
    estimatedValue: draft.estimatedValue,
    estimatedValueRange: draft.estimatedValueRange,

    // Updated by the caller with an evidence-facing craftsmanship score.
    // Retrospective truth-based accuracy lives in postTransferRating.
    qualityScore: 0,

    perceivedCAStars: draft.perceivedCAStars,
    perceivedPARange: draft.perceivedPARange,
    systemFitScore: draft.systemFitScore,
    statisticalHighlights: draft.statisticalHighlights,
  };
}

/**
 * Calculate a retrospective accuracy rating after a transfer has completed
 * and the player has had time to perform.
 *
 * seasonsSinceSigning 1 = early, still adjusting; 3+ = settled data.
 * Returns 0–100.
 */
export function trackPostTransfer(
  report: ScoutReport,
  player: Player,
  seasonsSinceSigning: number,
): number {
  if (report.attributeAssessments.length === 0) return 0;

  const trueAttrs = player.attributes;
  let totalError = 0;
  let count = 0;

  for (const assessment of report.attributeAssessments) {
    const valueAtSubmission =
      report.validationSnapshot?.[assessment.attribute]
      ?? trueAttrs[assessment.attribute];
    const error = Math.abs(assessment.estimatedValue - valueAtSubmission);
    totalError += error;
    count++;
  }

  const avgError = count > 0 ? totalError / count : 10;

  const rawAccuracy = Math.max(0, 100 - avgError * 12);
  // The normal career validator waits two seasons. Keep direct early calls
  // explicitly provisional, but do not permanently cap a report validated at
  // the intended evidence threshold.
  const evidenceMaturity = Math.min(1, Math.max(0, seasonsSinceSigning) / 2);
  const accuracy = rawAccuracy * evidenceMaturity;

  return Math.round(accuracy);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mergeReadingsIntoAssessments(
  observations: Observation[],
): AttributeAssessment[] {
  // Derive evidence depth from distinct observation records. Legacy saves may
  // contain exponentially inflated AttributeReading.observationCount values;
  // report confidence must not trust that denormalized display field.
  const observationCountByAttribute = new Map<PlayerAttribute, number>();
  const seenObservationIds = new Set<string>();
  for (const observation of observations) {
    if (seenObservationIds.has(observation.id)) continue;
    seenObservationIds.add(observation.id);
    const observedAttributes = new Set(
      observation.attributeReadings.map((reading) => reading.attribute),
    );
    for (const attribute of observedAttributes) {
      observationCountByAttribute.set(
        attribute,
        (observationCountByAttribute.get(attribute) ?? 0) + 1,
      );
    }
  }

  // Collect all readings per attribute across all observations
  const readingMap = new Map<
    PlayerAttribute,
    { values: number[]; confidences: number[]; ranges: Array<[number, number]> }
  >();

  for (const obs of observations) {
    for (const reading of obs.attributeReadings) {
      const existing = readingMap.get(reading.attribute);
      const confidence = reading.confidence;
      const evidenceCount = observationCountByAttribute.get(reading.attribute) ?? 1;

      if (existing) {
        existing.values.push(reading.perceivedValue);
        existing.confidences.push(confidence);
        // Approximate a range using canonical distinct evidence depth.
        const half = estimateRangeHalf(reading.perceivedValue, evidenceCount);
        existing.ranges.push([reading.perceivedValue - half, reading.perceivedValue + half]);
      } else {
        const half = estimateRangeHalf(reading.perceivedValue, evidenceCount);
        readingMap.set(reading.attribute, {
          values: [reading.perceivedValue],
          confidences: [confidence],
          ranges: [[reading.perceivedValue - half, reading.perceivedValue + half]],
        });
      }
    }
  }

  const assessments: AttributeAssessment[] = [];

  for (const [attribute, data] of readingMap) {
    const totalWeight = data.confidences.reduce((s, c) => s + c, 0);
    let estimatedValue: number;
    if (totalWeight === 0) {
      // Use unweighted average when all confidences are zero
      estimatedValue = Math.round(
        data.values.reduce((sum, v) => sum + v, 0) / (data.values.length || 1),
      );
    } else {
      estimatedValue = Math.round(
        data.values.reduce((s, v, i) => s + v * data.confidences[i], 0) /
          totalWeight,
      );
    }

    const lowerBound = Math.round(
      data.ranges.reduce((s, r) => s + r[0], 0) / data.ranges.length,
    );
    const upperBound = Math.round(
      data.ranges.reduce((s, r) => s + r[1], 0) / data.ranges.length,
    );

    const domain: AttributeDomain = ATTR_DOMAINS[attribute];

    assessments.push({
      attribute,
      estimatedValue: clamp(estimatedValue, 1, 20),
      confidenceRange: [clamp(lowerBound, 1, 20), clamp(upperBound, 1, 20)],
      domain,
    });
  }

  return assessments;
}

function estimateRangeHalf(perceivedValue: number, observationCount: number): number {
  // More observations → narrower range. Single obs → ±3, 10 obs → ±1
  const half = Math.max(1, 4 - Math.sqrt(observationCount));
  return Math.round(half);
}

function identifyStrengthClaims(
  player: Player,
  assessments: AttributeAssessment[],
  positionAverages: Partial<Record<PlayerAttribute, number>>,
): ReportClaimSuggestion[] {
  const strengths: ClaimCandidate[] = [];
  for (const assessment of assessments) {
    const adultAverage = POSITION_AVERAGES[player.position]?.[assessment.attribute];
    const ageAverage = positionAverages[assessment.attribute];
    if (adultAverage === undefined || ageAverage === undefined) continue;

    const classification = classifyAttribute(
      assessment.estimatedValue,
      adultAverage,
      ageAverage,
      player.age,
    );
    if (!classification.isStrength) continue;

    strengths.push({
      descriptor: buildAttributeDescriptor(player, assessment.attribute, assessment.estimatedValue, "strength"),
      attributes: [assessment.attribute],
      estimatedValue: assessment.estimatedValue,
      confidence: getAttributeAssessmentConfidence(assessment),
      severity: classification.severity,
    });
  }
  return pickTopClaims(strengths, 4);
}

function identifyWeaknessClaims(
  player: Player,
  assessments: AttributeAssessment[],
  positionAverages: Partial<Record<PlayerAttribute, number>>,
): ReportClaimSuggestion[] {
  const weaknesses: ClaimCandidate[] = [];
  for (const assessment of assessments) {
    const adultAverage = POSITION_AVERAGES[player.position]?.[assessment.attribute];
    const ageAverage = positionAverages[assessment.attribute];
    if (adultAverage === undefined || ageAverage === undefined) continue;

    const classification = classifyAttribute(
      assessment.estimatedValue,
      adultAverage,
      ageAverage,
      player.age,
    );
    if (!classification.isWeakness) continue;

    weaknesses.push({
      descriptor: buildAttributeDescriptor(player, assessment.attribute, assessment.estimatedValue, "weakness"),
      attributes: [assessment.attribute],
      estimatedValue: assessment.estimatedValue,
      confidence: getAttributeAssessmentConfidence(assessment),
      severity: classification.severity,
    });
  }
  return pickTopClaims(weaknesses, 3);
}

/** Player-facing stylistic comparison prompts shown in the report writer. */
function buildComparisonSuggestions(
  assessments: AttributeAssessment[],
  age: number,
): string[] {
  const technicalAttrs: PlayerAttribute[] = ["firstTouch", "dribbling", "passing"];
  const physicalAttrs: PlayerAttribute[]  = ["pace", "strength", "stamina", "agility"];

  const avgTechnical = averageForAttributes(assessments, technicalAttrs);
  const avgPhysical  = averageForAttributes(assessments, physicalAttrs);

  let key: string;
  if (age <= 20) {
    key = "youth";
  } else if (avgTechnical > avgPhysical + 2) {
    key = "technical";
  } else if (avgPhysical > avgTechnical + 2) {
    key = "physical";
  } else {
    key = "balanced";
  }

  return (COMPARISON_TEMPLATES[key] ?? COMPARISON_TEMPLATES.balanced).slice(0, 2);
}

function averageForAttributes(
  assessments: AttributeAssessment[],
  attrs: PlayerAttribute[],
): number {
  const relevant = assessments.filter((a) => attrs.includes(a.attribute));
  if (relevant.length === 0) return 10;
  return relevant.reduce((s, a) => s + a.estimatedValue, 0) / relevant.length;
}

/**
 * Rough market value estimate from perceived attribute quality.
 */
function estimateMarketValue(
  assessments: AttributeAssessment[],
  player: Player,
  scout: Scout,
  perceivedCAStars?: number,
  perceivedPARange?: [number, number],
): MarketValueEstimate {
  if (assessments.length === 0) {
    return { estimatedValue: 0, estimatedValueRange: [0, 0] };
  }

  const perceivedCa = perceivedCAStars != null
    ? starsToAbility(perceivedCAStars)
    : estimatePerceivedCA(assessments);
  const perceivedPa = perceivedPARange != null
    ? starsToAbility((perceivedPARange[0] + perceivedPARange[1]) / 2)
    : perceivedCa;

  const profileValue = calculateMarketValue(
    perceivedCa,
    Math.max(perceivedCa, perceivedPa),
    player.age,
    player.position,
    55,
    player.form,
  );
  const knownValue = Math.max(5_000, player.marketValue);
  const confidence = estimateAssessmentConfidence(assessments);
  const dataLiteracy = clamp((scout.skills.dataLiteracy ?? 10) / 20, 0, 1);
  const usesYouthGoalkeeperProxies = player.position === "GK" && player.age <= 20;

  const knownWeightBase =
    usesYouthGoalkeeperProxies ? 0.90
    : player.age <= 16 ? 0.78
    : player.age <= 18 ? 0.70
    : player.age <= 20 ? 0.62
    : player.age <= 24 ? 0.52
    : 0.45;
  const calculatedKnownWeight = clamp(
    knownWeightBase + (1 - confidence) * 0.15 - dataLiteracy * 0.08,
    0.3,
    usesYouthGoalkeeperProxies ? 0.94 : 0.85,
  );
  const knownWeight = usesYouthGoalkeeperProxies
    ? Math.max(0.85, calculatedKnownWeight)
    : calculatedKnownWeight;

  const potentialGap = Math.max(0, perceivedPa - perceivedCa);
  const speculativePremium =
    usesYouthGoalkeeperProxies
      ? 1 + Math.min(0.15, potentialGap / 500)
      : player.age <= 20
      ? 1 + Math.min(0.45, potentialGap / 220)
      : 1 + Math.min(0.18, potentialGap / 400);

  const blendedMid =
    knownValue * knownWeight +
    profileValue * speculativePremium * (1 - knownWeight);

  const ageVolatility =
    player.age <= 16 ? 0.50
    : player.age <= 18 ? 0.40
    : player.age <= 20 ? 0.30
    : player.age <= 24 ? 0.20
    : 0.12;
  const volatility = clamp(
    ageVolatility + Math.min(0.35, potentialGap / 180) + (1 - confidence) * 0.35,
    0.12,
    0.8,
  );

  const lowerRaw = blendedMid * (1 - volatility * 0.45);
  const upperRaw = blendedMid * (1 + volatility * 0.8);
  const lower = roundMarketValue(
    Math.max(5_000, Math.min(lowerRaw, knownValue * (player.age <= 20 ? 1.1 : 1.25))),
  );
  const proxyUpperCap = usesYouthGoalkeeperProxies
    ? knownValue * (player.age <= 16 ? 4 : 6)
    : Number.POSITIVE_INFINITY;
  const upper = roundMarketValue(Math.max(lower, Math.min(upperRaw, proxyUpperCap)));
  const estimateBias =
    player.age <= 20
      ? 0.38 + confidence * 0.18 + dataLiteracy * 0.08
      : 0.45 + confidence * 0.20 + dataLiteracy * 0.05;
  const estimatedValue = roundMarketValue(
    lower + (upper - lower) * clamp(estimateBias, 0.3, 0.7),
  );

  return {
    estimatedValue: clamp(estimatedValue, lower, upper),
    estimatedValueRange: [lower, upper],
  };
}

function estimatePerceivedCA(assessments: AttributeAssessment[]): number {
  if (assessments.length === 0) return 100;
  const totalWeight = assessments.reduce((s, a) => {
    // Use the range width as a proxy for confidence (narrower = more certain)
    const width = a.confidenceRange[1] - a.confidenceRange[0];
    return s + Math.max(0.1, 1 - width / 20);
  }, 0);
  const weightedAvg = assessments.reduce((s, a) => {
    const width = a.confidenceRange[1] - a.confidenceRange[0];
    const w = Math.max(0.1, 1 - width / 20);
    return s + a.estimatedValue * w;
  }, 0) / totalWeight;
  return Math.round(weightedAvg * 10);
}

function scoreConvictionAppropriateness(
  perceivedCa: number,
  trueCa: number,
  conviction: ConvictionLevel,
  age?: number,
  perceivedPA?: number,
): number {
  const expected = age !== undefined
    ? getExpectedConvictionForAge(perceivedCa, age, perceivedPA)
    : getExpectedConviction(trueCa);
  const levels: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];
  const idxActual   = levels.indexOf(conviction);
  const idxExpected = levels.indexOf(expected);
  const diff = Math.abs(idxActual - idxExpected);
  return Math.max(10, 100 - diff * 30);
}

function getExpectedConviction(ca: number): ConvictionLevel {
  if (ca >= 165) return "tablePound";
  if (ca >= 140) return "strongRecommend";
  if (ca >= 110) return "recommend";
  return "note";
}

/**
 * PA-aware conviction for youth. Blends current ability with potential using
 * an age-weighted formula so high-potential youth warrant strong conviction
 * without penalising the scout's quality score.
 * For adults (21+) or when PA is unknown, delegates to getExpectedConviction.
 */
function getExpectedConvictionForAge(
  perceivedCA: number,
  age: number,
  perceivedPA?: number,
): ConvictionLevel {
  if (age >= 21 || perceivedPA === undefined) {
    return getExpectedConviction(perceivedCA);
  }

  // PA weight decreases as player approaches maturity
  // age 14 → 0.85 PA weight, age 20 → 0.14 PA weight
  const paWeight = Math.max(0, Math.min(1, (21 - age) / (21 - 14) * 0.85));
  const caWeight = 1 - paWeight;

  const effectiveCA = Math.round(perceivedCA * caWeight + perceivedPA * paWeight);

  return getExpectedConviction(effectiveCA);
}

function scoreRangeTightness(
  assessments: AttributeAssessment[],
  trueAttrs: Record<PlayerAttribute, number>,
): number {
  if (assessments.length === 0) return 50;

  let score = 0;
  let count = 0;

  for (const assessment of assessments) {
    const trueValue = trueAttrs[assessment.attribute];
    const [lo, hi] = assessment.confidenceRange;
    const width = hi - lo;
    const containsTrue = trueValue >= lo && trueValue <= hi;

    if (containsTrue) {
      score += Math.max(40, 100 - width * 10);
    } else {
      score += Math.max(0, 30 - width * 5);
    }
    count++;
  }

  return count > 0 ? Math.round(score / count) : 50;
}

function getRelevantAttributes(position: Position): PlayerAttribute[] {
  const base: PlayerAttribute[] = ["decisionMaking", "positioning", "composure", "workRate"];

  const positionSpecific: Record<Position, PlayerAttribute[]> = {
    GK: ["positioning", "composure", "decisionMaking", "leadership", "anticipation", "passing", "vision", "jumping", "strength", "firstTouch"],
    CB: ["heading", "strength", "passing", "defensiveAwareness"],
    LB: ["crossing", "pace", "stamina", "defensiveAwareness", "pressing"],
    RB: ["crossing", "pace", "stamina", "defensiveAwareness", "pressing"],
    CDM: ["strength", "passing", "stamina", "defensiveAwareness", "pressing"],
    CM: ["passing", "stamina", "firstTouch", "offTheBall", "pressing"],
    CAM: ["passing", "firstTouch", "dribbling", "shooting", "offTheBall"],
    LW: ["dribbling", "crossing", "pace", "agility", "shooting", "offTheBall"],
    RW: ["dribbling", "crossing", "pace", "agility", "shooting", "offTheBall"],
    ST: ["shooting", "composure", "heading", "firstTouch", "strength", "offTheBall"],
  };

  return [...new Set([...base, ...(positionSpecific[position] ?? [])])];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classifyAttribute(
  estimatedValue: number,
  adultAverage: number,
  ageAverage: number,
  age: number,
): AttributeClassification {
  const expected = age <= 20 ? ageAverage : adultAverage;
  const divisor = Math.max(1.5, adultAverage * 0.15);
  const normalizedGap = (estimatedValue - expected) / divisor;
  const strengthFloor =
    age <= 16 ? 8
    : age <= 18 ? 9
    : age <= 20 ? 10
    : 12;
  const weaknessCeiling =
    age <= 16 ? 6
    : age <= 18 ? 7
    : age <= 20 ? 8
    : 9;

  return {
    isStrength: normalizedGap >= 1 && estimatedValue >= Math.min(strengthFloor, adultAverage),
    isWeakness: normalizedGap <= -1 && estimatedValue <= Math.max(weaknessCeiling, adultAverage - 1),
    severity: Math.abs(normalizedGap),
  };
}

function buildAttributeDescriptor(
  player: Player,
  attribute: PlayerAttribute,
  value: number,
  kind: "strength" | "weakness",
): string {
  const label = humanizeAttribute(attribute);

  if (kind === "strength") {
    if (player.age >= 21 && value >= 15) {
      return STRENGTH_DESCRIPTORS[attribute] ?? `${label} is a clear asset at senior level.`;
    }
    if (player.age <= 20) {
      if (value >= 14) {
        return `${label} already looks advanced for a ${player.age}-year-old in this role.`;
      }
      if (value >= 11) {
        return `${label} is a clear positive for this age group and worth building around.`;
      }
      return `${label} is encouraging relative to peers, even if it is still developing.`;
    }
    if (value >= 13) {
      return `${label} is a clear strength in the current profile.`;
    }
    return `${label} gives the player a useful edge in the role.`;
  }

  if (player.age >= 21 && value <= 5) {
    return WEAKNESS_DESCRIPTORS[attribute] ?? `${label} is a serious concern at senior level.`;
  }
  if (player.age <= 20) {
    if (value <= 4) {
      return `${label} is well behind the age curve right now and needs patient development.`;
    }
    if (value <= 7) {
      return `${label} still looks underdeveloped for this stage.`;
    }
    return `${label} is a current concern relative to the demands of the role.`;
  }
  if (value <= 7) {
    return `${label} is a clear weakness against senior-level opposition.`;
  }
  return `${label} is the area opponents are most likely to target right now.`;
}

function pickTopClaims(candidates: ClaimCandidate[], maxCount: number): ReportClaimSuggestion[] {
  const seen = new Set<string>();
  return candidates
    .sort((left, right) => right.severity - left.severity)
    .filter((candidate) => {
      if (seen.has(candidate.descriptor)) return false;
      seen.add(candidate.descriptor);
      return true;
    })
    .slice(0, maxCount)
    .map(({ severity: _severity, ...claim }) => claim);
}

function humanizeAttribute(attribute: PlayerAttribute): string {
  return attribute
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .replace("Off The Ball", "Off-the-ball")
    .replace("Decision Making", "Decision-making");
}

function estimateAssessmentConfidence(assessments: AttributeAssessment[]): number {
  if (assessments.length === 0) return 0.2;
  const averageWidth =
    assessments.reduce(
      (sum, assessment) => sum + (assessment.confidenceRange[1] - assessment.confidenceRange[0]),
      0,
    ) / assessments.length;
  return clamp(1 - averageWidth / 10, 0.2, 0.95);
}

function getAttributeAssessmentConfidence(assessment: AttributeAssessment): number {
  const width = assessment.confidenceRange[1] - assessment.confidenceRange[0];
  return clamp(1 - width / 10, 0.2, 0.95);
}

function roundMarketValue(value: number): number {
  if (value <= 0) return 0;
  if (value < 50_000) return Math.round(value / 1_000) * 1_000;
  if (value < 1_000_000) return Math.round(value / 10_000) * 10_000;
  return Math.round(value / 50_000) * 50_000;
}
