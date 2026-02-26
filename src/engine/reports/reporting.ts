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

// ---------------------------------------------------------------------------
// Report draft type
// ---------------------------------------------------------------------------

export interface ReportDraft {
  attributeAssessments: AttributeAssessment[];
  suggestedStrengths: string[];
  suggestedWeaknesses: string[];
  comparisonSuggestions: string[];
  estimatedValue: number;
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
    strength: 10, pace: 8, anticipation: 13, balance: 10, jumping: 9,
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
      comparisonSuggestions: [],
      estimatedValue: 0,
    };
  }

  const attributeAssessments = mergeReadingsIntoAssessments(observations);

  const positionAverages = POSITION_AVERAGES[player.position] ?? {};
  const suggestedStrengths = identifyStrengths(attributeAssessments, positionAverages);
  const suggestedWeaknesses = identifyWeaknesses(attributeAssessments, positionAverages);

  const comparisonSuggestions = buildComparisonSuggestions(
    attributeAssessments,
    player.age,
  );

  const estimatedValue = estimateMarketValue(attributeAssessments, player, scout);

  // Aggregate ability readings from the 3 most recent observations
  const recentWithAbility = observations
    .filter((o) => o.abilityReading)
    .slice(-3);

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
    perceivedPARange = [
      Math.round(avgPALow * 2) / 2,
      Math.min(5.0, Math.round(avgPAHigh * 2) / 2),
    ];
  }

  return {
    attributeAssessments,
    suggestedStrengths,
    suggestedWeaknesses,
    comparisonSuggestions,
    estimatedValue,
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
export function calculateReportQuality(
  report: ScoutReport,
  player: Player,
  /** Additive bonus from equipment (0–1 scale, e.g. 0.05 = +5%). */
  reportQualityBonus?: number,
): number {
  if (report.attributeAssessments.length === 0) return 0;

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
  const accuracyScore = Math.max(0, 100 - averageError * 14);

  // Coverage: % of position-relevant attributes assessed
  const relevantAttributes = getRelevantAttributes(player.position);
  const assessedRelevant = report.attributeAssessments.filter((a) =>
    relevantAttributes.includes(a.attribute),
  ).length;
  const coverageScore =
    (assessedRelevant / Math.max(1, relevantAttributes.length)) * 100;

  // Conviction appropriateness — use star-based CA when available
  const perceivedCa = report.perceivedCAStars != null
    ? starsToAbility(report.perceivedCAStars)
    : estimatePerceivedCA(report.attributeAssessments);
  const convictionScore = scoreConvictionAppropriateness(
    perceivedCa,
    player.currentAbility,
    report.conviction,
  );

  // Range tightness (when ranges are correct, tight is better)
  const tightnessScore = scoreRangeTightness(report.attributeAssessments, trueAttrs);

  const baseQuality =
    accuracyScore  * 0.45 +
    coverageScore  * 0.25 +
    convictionScore * 0.20 +
    tightnessScore * 0.10;

  // Personality depth bonus: +5 quality points per revealed trait included in
  // the report (the report was written while knowing these traits, so it
  // demonstrates deeper insight beyond raw attribute numbers).
  const personalityBonus = (player.personalityRevealed?.length ?? 0) * 5;

  // Apply equipment report quality bonus (additive, capped at 100)
  const quality = baseQuality + personalityBonus + (reportQualityBonus ?? 0) * 100;

  return Math.round(Math.max(0, Math.min(100, quality)));
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
  scoutSkills: Record<string, number>;
  assessedAttributeCount?: number;
  position?: Position;
  perceivedCA?: number;
}): QualityPreviewResult {
  const {
    observationCount,
    avgConfidence,
    convictionLevel,
    strengthCount,
    weaknessCount,
    scoutSkills,
    assessedAttributeCount = 0,
    position,
    perceivedCA,
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
    const expectedConviction = getExpectedConviction(perceivedCA);
    const levels: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];
    const diff = Math.abs(levels.indexOf(convictionLevel) - levels.indexOf(expectedConviction));
    convictionFit = Math.round(Math.max(3, 15 - diff * 4));
  }

  // --- Detail (strengths/weaknesses): 0-20 ---
  const strengthScore = Math.min(1, strengthCount / 3);
  const weaknessScore = Math.min(1, weaknessCount / 2);
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
    if (strengthCount < 3 || weaknessCount < 2) {
      hints.push("Include at least 3 strengths and 2 weaknesses");
    }
    if (avgConfidence < 0.5) {
      hints.push("Observe more matches to increase attribute confidence");
    }
    if (perceivedCA !== undefined) {
      const expectedConviction = getExpectedConviction(perceivedCA);
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

    // qualityScore starts at 0; updated by the engine once true values are
    // compared. This is intentional — the scout does not know their own quality.
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
    const current = trueAttrs[assessment.attribute];
    const error = Math.abs(assessment.estimatedValue - current);
    totalError += error;
    count++;
  }

  const avgError = count > 0 ? totalError / count : 10;

  // Confidence in the retrospective score grows with settled data
  const maturityFactor = Math.min(1, seasonsSinceSigning / 3);
  const accuracy = Math.max(0, 100 - avgError * 12) * maturityFactor;

  return Math.round(accuracy);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mergeReadingsIntoAssessments(
  observations: Observation[],
): AttributeAssessment[] {
  // Collect all readings per attribute across all observations
  const readingMap = new Map<
    PlayerAttribute,
    { values: number[]; confidences: number[]; ranges: Array<[number, number]> }
  >();

  for (const obs of observations) {
    for (const reading of obs.attributeReadings) {
      const existing = readingMap.get(reading.attribute);
      const confidence = reading.confidence;

      if (existing) {
        existing.values.push(reading.perceivedValue);
        existing.confidences.push(confidence);
        // Approximate a range from perceivedValue using observation count
        const half = estimateRangeHalf(reading.perceivedValue, reading.observationCount);
        existing.ranges.push([reading.perceivedValue - half, reading.perceivedValue + half]);
      } else {
        const half = estimateRangeHalf(reading.perceivedValue, reading.observationCount);
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

function identifyStrengths(
  assessments: AttributeAssessment[],
  positionAverages: Partial<Record<PlayerAttribute, number>>,
): string[] {
  const strengths: string[] = [];
  for (const assessment of assessments) {
    const avg = positionAverages[assessment.attribute] ?? 10;
    if (assessment.estimatedValue >= avg + 3) {
      const descriptor = STRENGTH_DESCRIPTORS[assessment.attribute];
      if (descriptor) strengths.push(descriptor);
    }
  }
  return strengths;
}

function identifyWeaknesses(
  assessments: AttributeAssessment[],
  positionAverages: Partial<Record<PlayerAttribute, number>>,
): string[] {
  const weaknesses: string[] = [];
  for (const assessment of assessments) {
    const avg = positionAverages[assessment.attribute] ?? 10;
    if (assessment.estimatedValue <= avg - 3) {
      const descriptor = WEAKNESS_DESCRIPTORS[assessment.attribute];
      if (descriptor) weaknesses.push(descriptor);
    }
  }
  return weaknesses;
}

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
): number {
  if (assessments.length === 0) return 0;

  const perceivedCa = estimatePerceivedCA(assessments);
  // Exponential value curve: CA 100 ≈ £2M, CA 150 ≈ £20M, CA 180 ≈ £70M
  const rawValue = Math.pow(perceivedCa / 100, 3.5) * 2_000_000;

  // Age discount: players over 28 are worth less on the market
  const ageFactor =
    player.age <= 28
      ? 1
      : Math.max(0.3, 1 - (player.age - 28) * 0.08);

  // Data literacy improves valuation precision (not the median, but reduces error)
  const dataLiteracyFactor = 0.9 + (scout.skills.dataLiteracy / 20) * 0.2;

  const estimate = rawValue * ageFactor * dataLiteracyFactor;

  return Math.round(estimate / 50_000) * 50_000;
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
): number {
  const expected = getExpectedConviction(trueCa);
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
    GK: ["positioning", "composure", "decisionMaking", "leadership"],
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
