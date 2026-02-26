/**
 * Report comparison engine — compares 2-3 scouting reports side-by-side.
 *
 * All functions are pure (no side effects, no mutation of inputs).
 * No React or runtime framework imports.
 */

import type {
  ScoutReport,
  AttributeAssessment,
  AttributeComparisonEntry,
  ReportComparison,
  ReportComparisonMetrics,
  PlayerAttribute,
  AttributeDomain,
  Position,
  TacticalStyle,
  ConvictionLevel,
} from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Position-weight maps for position fit calculation
// ---------------------------------------------------------------------------

const POSITION_KEY_ATTRIBUTES: Record<Position, PlayerAttribute[]> = {
  GK: ["composure", "positioning", "decisionMaking", "leadership", "anticipation"],
  CB: ["heading", "strength", "positioning", "defensiveAwareness", "tackling", "marking", "jumping"],
  LB: ["crossing", "pace", "stamina", "defensiveAwareness", "pressing", "tackling", "teamwork"],
  RB: ["crossing", "pace", "stamina", "defensiveAwareness", "pressing", "tackling", "teamwork"],
  CDM: ["strength", "passing", "stamina", "defensiveAwareness", "pressing", "tackling", "marking", "teamwork"],
  CM: ["passing", "stamina", "firstTouch", "workRate", "offTheBall", "pressing", "vision", "teamwork"],
  CAM: ["passing", "firstTouch", "dribbling", "composure", "offTheBall", "shooting", "vision"],
  LW: ["dribbling", "crossing", "pace", "agility", "shooting", "offTheBall", "finishing"],
  RW: ["dribbling", "crossing", "pace", "agility", "shooting", "offTheBall", "finishing"],
  ST: ["shooting", "composure", "heading", "firstTouch", "strength", "offTheBall", "finishing", "positioning"],
};

/**
 * Tactical style attribute weights: which attributes matter more for each
 * tactical identity. Used in position fit calculation.
 */
const STYLE_BONUSES: Record<string, PlayerAttribute[]> = {
  possessionBased: ["passing", "firstTouch", "composure", "vision", "teamwork"],
  highPress: ["pressing", "stamina", "workRate", "pace", "anticipation"],
  counterAttacking: ["pace", "offTheBall", "finishing", "dribbling", "anticipation"],
  directPlay: ["strength", "heading", "pace", "crossing", "shooting"],
  wingPlay: ["crossing", "dribbling", "pace", "agility", "offTheBall"],
  balanced: ["decisionMaking", "composure", "teamwork", "workRate"],
};

// ---------------------------------------------------------------------------
// Core comparison
// ---------------------------------------------------------------------------

/**
 * Compare 2-3 scouting reports side-by-side.
 * Returns a complete comparison data structure for rendering.
 */
export function compareReports(reports: ScoutReport[]): ReportComparison {
  if (reports.length < 2) {
    return {
      reportIds: reports.map((r) => r.id),
      playerIds: reports.map((r) => r.playerId),
      attributes: [],
      metrics: reports.map((r) => buildMetrics(r)),
      summaryText: "Select at least two reports to compare.",
    };
  }

  // Collect all unique attributes across all reports
  const attributeSet = new Set<PlayerAttribute>();
  for (const report of reports) {
    for (const a of report.attributeAssessments) {
      attributeSet.add(a.attribute);
    }
  }

  // Build per-attribute comparison rows
  const attributes: AttributeComparisonEntry[] = [];
  for (const attr of attributeSet) {
    const values: number[] = [];
    const ranges: Array<[number, number]> = [];

    for (const report of reports) {
      const assessment = report.attributeAssessments.find(
        (a) => a.attribute === attr,
      );
      values.push(assessment ? assessment.estimatedValue : 0);
      ranges.push(assessment ? assessment.confidenceRange : [0, 0]);
    }

    const best = Math.max(...values);
    const bestIndex = values.indexOf(best);
    const domain: AttributeDomain = ATTRIBUTE_DOMAINS[attr];

    attributes.push({ attribute: attr, domain, values, ranges, best, bestIndex });
  }

  // Sort by domain then attribute name for consistent display
  const domainOrder: AttributeDomain[] = ["technical", "physical", "mental", "tactical", "hidden"];
  attributes.sort((a, b) => {
    const di = domainOrder.indexOf(a.domain) - domainOrder.indexOf(b.domain);
    if (di !== 0) return di;
    return a.attribute.localeCompare(b.attribute);
  });

  const metrics = reports.map((r) => buildMetrics(r));
  const summaryText = generateComparisonSummary(reports, attributes, metrics);

  return {
    reportIds: reports.map((r) => r.id),
    playerIds: reports.map((r) => r.playerId),
    attributes,
    metrics,
    summaryText,
  };
}

// ---------------------------------------------------------------------------
// Value score
// ---------------------------------------------------------------------------

/**
 * Calculate a value-for-money score (0-100) comparing the scouted quality
 * of a player against what a club would pay.
 *
 * - Higher perceived quality + lower fee = higher score.
 * - Returns null if transferFee is 0 or negative.
 */
export function calculateValueScore(
  report: ScoutReport,
  transferFee: number,
): number | null {
  if (transferFee <= 0) return null;
  if (report.attributeAssessments.length === 0) return null;

  const avgAttr = averageEstimatedValue(report.attributeAssessments);
  // Map avg attribute (1-20) to a perceived quality score (0-100)
  const qualityScore = ((avgAttr - 1) / 19) * 100;

  // Map transfer fee to a cost factor. We use a log scale: fees from 100k to 100M.
  // Lower fee = higher value. A 1M fee for a 15-avg player is better than 50M.
  const logFee = Math.log10(Math.max(100_000, transferFee));
  // logFee ranges from 5 (100k) to ~8 (100M). Map to 0-1 cost pressure.
  const costPressure = Math.min(1, (logFee - 5) / 3);

  // Value = quality minus cost pressure, normalized to 0-100
  const raw = qualityScore * (1 - costPressure * 0.6);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ---------------------------------------------------------------------------
// Position fit
// ---------------------------------------------------------------------------

/**
 * Calculate how well a scouted player fits a target position and club style.
 *
 * Returns 0-100 percentage.
 */
export function calculatePositionFit(
  report: ScoutReport,
  targetPosition: Position,
  clubStyle?: TacticalStyle,
): number {
  const keyAttrs = POSITION_KEY_ATTRIBUTES[targetPosition] ?? [];
  if (keyAttrs.length === 0 || report.attributeAssessments.length === 0) return 50;

  // Score from position-relevant attributes
  let positionScore = 0;
  let positionCount = 0;

  for (const attr of keyAttrs) {
    const assessment = report.attributeAssessments.find(
      (a) => a.attribute === attr,
    );
    if (assessment) {
      // 10 is average, so (value - 5) / 15 maps 5-20 to 0-1
      positionScore += Math.max(0, (assessment.estimatedValue - 5) / 15);
      positionCount++;
    }
  }

  const basefit = positionCount > 0
    ? (positionScore / positionCount) * 80
    : 40;

  // Style bonus: if club style emphasises certain attributes, add up to 20 pts
  let styleBonus = 0;
  if (clubStyle) {
    const bonusAttrs = STYLE_BONUSES[clubStyle.tacticalIdentity] ?? STYLE_BONUSES.balanced;
    let bonusScore = 0;
    let bonusCount = 0;

    for (const attr of bonusAttrs) {
      const assessment = report.attributeAssessments.find(
        (a) => a.attribute === attr,
      );
      if (assessment) {
        bonusScore += Math.max(0, (assessment.estimatedValue - 10) / 10);
        bonusCount++;
      }
    }

    styleBonus = bonusCount > 0
      ? (bonusScore / bonusCount) * 20
      : 0;
  }

  return Math.round(Math.max(0, Math.min(100, basefit + styleBonus)));
}

// ---------------------------------------------------------------------------
// Text summary generation
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable comparison summary highlighting key differences.
 */
export function generateComparisonSummary(
  reports: ScoutReport[],
  attributes?: AttributeComparisonEntry[],
  metrics?: ReportComparisonMetrics[],
): string {
  if (reports.length < 2) return "Select at least two reports to compare.";

  const attrs = attributes ?? compareReports(reports).attributes;
  const mets = metrics ?? reports.map((r) => buildMetrics(r));

  const parts: string[] = [];

  // Find who has the highest average attributes
  const bestAvgIdx = mets.reduce((best, m, i) =>
    m.avgAttribute > mets[best].avgAttribute ? i : best, 0,
  );
  parts.push(
    `Player ${bestAvgIdx + 1} has the highest average scouted attributes (${mets[bestAvgIdx].avgAttribute.toFixed(1)}).`,
  );

  // Count attribute wins per report
  const wins = new Array(reports.length).fill(0) as number[];
  for (const attr of attrs) {
    if (attr.best > 0) {
      wins[attr.bestIndex]++;
    }
  }
  const dominantIdx = wins.indexOf(Math.max(...wins));
  parts.push(
    `Player ${dominantIdx + 1} leads in ${wins[dominantIdx]} of ${attrs.length} assessed attributes.`,
  );

  // Value comparison
  const values = mets.map((m) => m.estimatedValue);
  const cheapestIdx = values.indexOf(Math.min(...values.filter((v) => v > 0)));
  if (values[cheapestIdx] > 0) {
    const cheapest = values[cheapestIdx];
    const formatted = cheapest >= 1_000_000
      ? `${(cheapest / 1_000_000).toFixed(1)}M`
      : `${(cheapest / 1_000).toFixed(0)}k`;
    parts.push(
      `Player ${cheapestIdx + 1} is the most affordable option at an estimated value of ${formatted}.`,
    );
  }

  // Conviction comparison
  const convictionOrder: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];
  const convictions = mets.map((m) => convictionOrder.indexOf(m.conviction));
  const highestConvIdx = convictions.indexOf(Math.max(...convictions));
  const CONV_LABELS: Record<ConvictionLevel, string> = {
    note: "a monitoring note",
    recommend: "a recommendation",
    strongRecommend: "a strong recommendation",
    tablePound: "a table-pound conviction",
  };
  parts.push(
    `Player ${highestConvIdx + 1} carries the highest conviction level: ${CONV_LABELS[mets[highestConvIdx].conviction]}.`,
  );

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMetrics(report: ScoutReport): ReportComparisonMetrics {
  return {
    reportId: report.id,
    playerId: report.playerId,
    perceivedCAStars: report.perceivedCAStars ?? null,
    perceivedPARange: report.perceivedPARange ?? null,
    estimatedValue: report.estimatedValue,
    conviction: report.conviction,
    strengthCount: report.strengths.length,
    weaknessCount: report.weaknesses.length,
    avgAttribute: averageEstimatedValue(report.attributeAssessments),
    valueScore: null,
    positionFit: null,
  };
}

function averageEstimatedValue(assessments: AttributeAssessment[]): number {
  if (assessments.length === 0) return 0;
  const sum = assessments.reduce((s, a) => s + a.estimatedValue, 0);
  return sum / assessments.length;
}
