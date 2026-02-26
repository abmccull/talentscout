/**
 * Analysis Mode
 *
 * Generates data-driven content for analytical scouting activities.
 * Scouts interact with statistics, video clips, and databases to
 * identify patterns, cross-reference data, and calibrate their models.
 */

import type { RNG } from "@/engine/rng";
import type { PlayerAttribute } from "@/engine/core/types";
import type {
  ObservationSession,
  SessionPhase,
  DataPoint,
  SessionPlayer,
} from "@/engine/observation/types";

// =============================================================================
// DATA POINT TEMPLATES
// =============================================================================

/**
 * Template for a single data point: a label, a value generator, a category,
 * and the player attributes this data point provides indirect evidence about.
 */
interface DataPointTemplate {
  label: string;
  /** Generates a realistic numeric or string value. */
  generateValue: (rng: RNG) => number | string;
  category: DataPoint["category"];
  relatedAttributes?: PlayerAttribute[];
}

/**
 * Per-activity-type template banks, grouped by phase role.
 *
 * Keys are activity type strings matching the ACTIVITY_MODE_MAP entries.
 * Each bank provides enough templates to generate varied data across all phases.
 * Templates are sampled without replacement per phase where possible.
 */
export const DATA_POINT_TEMPLATES: Record<string, DataPointTemplate[]> = {
  // ---------------------------------------------------------------------------
  // databaseQuery
  // ---------------------------------------------------------------------------
  databaseQuery: [
    // Filter / query design phase
    {
      label: "Search filters applied",
      generateValue: (rng) => rng.nextInt(3, 9),
      category: "statistical",
    },
    {
      label: "Age range",
      generateValue: (rng) => `${rng.nextInt(15, 19)}–${rng.nextInt(20, 24)}`,
      category: "statistical",
    },
    {
      label: "League tier filter",
      generateValue: (rng) => rng.pick(["1st", "2nd", "3rd", "4th", "5th"]),
      category: "statistical",
    },
    {
      label: "Position group",
      generateValue: (rng) =>
        rng.pick(["Attackers", "Midfielders", "Defenders", "Goalkeepers"]),
      category: "statistical",
    },
    {
      label: "Minimum minutes played",
      generateValue: (rng) => rng.nextInt(500, 1800),
      category: "statistical",
    },
    // Results phases
    {
      label: "Players returned",
      generateValue: (rng) => rng.nextInt(18, 94),
      category: "statistical",
    },
    {
      label: "Goals per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.1, 0.9).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["finishing", "shooting"],
    },
    {
      label: "Assists per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.05, 0.55).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["passing", "vision"],
    },
    {
      label: "Key passes per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.3, 2.8).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["passing", "vision"],
    },
    {
      label: "Progressive passes per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(1.0, 9.5).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["passing", "offTheBall"],
    },
    {
      label: "Successful dribbles per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.2, 4.2).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["dribbling", "agility"],
    },
    {
      label: "Aerial duels won %",
      generateValue: (rng) => `${rng.nextInt(30, 72)}%`,
      category: "statistical",
      relatedAttributes: ["heading", "jumping", "strength"],
    },
    {
      label: "Tackles per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.5, 5.5).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["tackling", "defensiveAwareness"],
    },
    {
      label: "Interceptions per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.2, 3.8).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["anticipation", "defensiveAwareness"],
    },
    {
      label: "xG per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.05, 0.65).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["finishing", "positioning"],
    },
    {
      label: "xG outperformance",
      generateValue: (rng) =>
        `${rng.chance(0.5) ? "+" : ""}${parseFloat(rng.nextFloat(-0.15, 0.35).toFixed(2))}`,
      category: "anomaly",
      relatedAttributes: ["finishing", "composure"],
    },
    {
      label: "Pass completion %",
      generateValue: (rng) => `${rng.nextInt(62, 93)}%`,
      category: "statistical",
      relatedAttributes: ["passing", "firstTouch"],
    },
    // Deep probe phases
    {
      label: "Sprint distance per 90 (km)",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.8, 3.2).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["pace", "stamina"],
    },
    {
      label: "High-intensity runs per 90",
      generateValue: (rng) => rng.nextInt(8, 42),
      category: "statistical",
      relatedAttributes: ["stamina", "workRate"],
    },
    {
      label: "Pressing intensity (PPDA)",
      generateValue: (rng) => parseFloat(rng.nextFloat(4.0, 18.0).toFixed(1)),
      category: "statistical",
      relatedAttributes: ["pressing", "workRate"],
    },
    {
      label: "Big chances created per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.0, 0.9).toFixed(2)),
      category: "comparison",
      relatedAttributes: ["vision", "passing"],
    },
    {
      label: "Career league level trajectory",
      generateValue: (rng) =>
        rng.pick(["Rising", "Stable", "Declining", "Erratic"]),
      category: "trend",
      relatedAttributes: ["consistency", "professionalism"],
    },
    {
      label: "Minutes per league tier change",
      generateValue: (rng) => rng.nextInt(800, 5000),
      category: "trend",
      relatedAttributes: ["consistency"],
    },
  ],

  // ---------------------------------------------------------------------------
  // watchVideo
  // ---------------------------------------------------------------------------
  watchVideo: [
    // Clip-level observations
    {
      label: "Clip duration (min)",
      generateValue: (rng) => rng.nextInt(2, 12),
      category: "statistical",
    },
    {
      label: "Touches in clip",
      generateValue: (rng) => rng.nextInt(4, 38),
      category: "statistical",
    },
    {
      label: "Goals per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.1, 0.85).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["finishing", "shooting"],
    },
    {
      label: "xG vs actual goals",
      generateValue: (rng) =>
        `${parseFloat(rng.nextFloat(0.1, 0.7).toFixed(2))} xG / ${rng.nextInt(0, 1)} G`,
      category: "comparison",
      relatedAttributes: ["finishing", "composure"],
    },
    {
      label: "Pass accuracy in final third",
      generateValue: (rng) => `${rng.nextInt(55, 88)}%`,
      category: "statistical",
      relatedAttributes: ["passing", "decisionMaking"],
    },
    {
      label: "Carries into penalty area per 90",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.2, 3.5).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["dribbling", "offTheBall"],
    },
    {
      label: "Progressive carry distance per 90 (m)",
      generateValue: (rng) => rng.nextInt(80, 420),
      category: "statistical",
      relatedAttributes: ["dribbling", "pace"],
    },
    // Pass map / movement data
    {
      label: "Pass map — left side %",
      generateValue: (rng) => `${rng.nextInt(20, 55)}%`,
      category: "statistical",
      relatedAttributes: ["passing"],
    },
    {
      label: "Pass map — central %",
      generateValue: (rng) => `${rng.nextInt(20, 50)}%`,
      category: "statistical",
      relatedAttributes: ["passing", "vision"],
    },
    {
      label: "Pass map — right side %",
      generateValue: (rng) => `${rng.nextInt(15, 50)}%`,
      category: "statistical",
      relatedAttributes: ["passing"],
    },
    {
      label: "Average position (x)",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.25, 0.85).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["positioning", "offTheBall"],
    },
    {
      label: "Average position (y)",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.1, 0.9).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["positioning"],
    },
    {
      label: "Positional variance (cluster score)",
      generateValue: (rng) => parseFloat(rng.nextFloat(0.12, 0.85).toFixed(2)),
      category: "comparison",
      relatedAttributes: ["offTheBall", "vision"],
    },
    // Highlighted anomalies
    {
      label: "Anomaly: unusually wide press trigger zone",
      generateValue: (_rng) => "flagged",
      category: "anomaly",
      relatedAttributes: ["pressing", "workRate"],
    },
    {
      label: "Anomaly: late arrival in penalty area",
      generateValue: (_rng) => "flagged",
      category: "anomaly",
      relatedAttributes: ["offTheBall", "anticipation"],
    },
    {
      label: "Anomaly: consistent body-shape tells before dribble",
      generateValue: (_rng) => "flagged",
      category: "anomaly",
      relatedAttributes: ["dribbling"],
    },
    {
      label: "Shots on target %",
      generateValue: (rng) => `${rng.nextInt(28, 75)}%`,
      category: "statistical",
      relatedAttributes: ["shooting", "finishing"],
    },
    {
      label: "Sprints away from ball per 90",
      generateValue: (rng) => rng.nextInt(6, 28),
      category: "comparison",
      relatedAttributes: ["offTheBall", "workRate", "pace"],
    },
    {
      label: "Duels won %",
      generateValue: (rng) => `${rng.nextInt(38, 68)}%`,
      category: "statistical",
      relatedAttributes: ["strength", "balance", "tackling"],
    },
    {
      label: "Heat map peak zone",
      generateValue: (rng) =>
        rng.pick([
          "Left channel",
          "Right channel",
          "Central midfield",
          "Attacking half-space",
          "Defensive third",
          "Penalty area",
        ]),
      category: "comparison",
      relatedAttributes: ["positioning", "offTheBall"],
    },
  ],

  // ---------------------------------------------------------------------------
  // deepVideoAnalysis
  // ---------------------------------------------------------------------------
  deepVideoAnalysis: [
    // Frame-level technical data
    {
      label: "Body orientation on reception (avg degrees off-centre)",
      generateValue: (rng) => rng.nextInt(5, 55),
      category: "statistical",
      relatedAttributes: ["firstTouch", "positioning"],
    },
    {
      label: "First touch direction consistency %",
      generateValue: (rng) => `${rng.nextInt(55, 92)}%`,
      category: "comparison",
      relatedAttributes: ["firstTouch", "decisionMaking"],
    },
    {
      label: "Frames to release after receiving",
      generateValue: (rng) => rng.nextInt(2, 18),
      category: "statistical",
      relatedAttributes: ["firstTouch", "decisionMaking"],
    },
    {
      label: "Head scans per possession sequence",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.5, 4.5).toFixed(1)),
      category: "comparison",
      relatedAttributes: ["anticipation", "vision", "decisionMaking"],
    },
    {
      label: "Shoulder check rate before receiving",
      generateValue: (rng) => `${rng.nextInt(22, 88)}%`,
      category: "comparison",
      relatedAttributes: ["anticipation", "vision"],
    },
    // xG and overlays
    {
      label: "xG per shot (this player)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.04, 0.32).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["finishing", "positioning"],
    },
    {
      label: "xG per shot (league average at position)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.06, 0.18).toFixed(2)),
      category: "comparison",
      relatedAttributes: ["finishing"],
    },
    {
      label: "Shot placement — corners hit %",
      generateValue: (rng) => `${rng.nextInt(30, 68)}%`,
      category: "statistical",
      relatedAttributes: ["shooting", "finishing"],
    },
    {
      label: "Goals per 90 vs league average",
      generateValue: (rng) => {
        const player = parseFloat(rng.nextFloat(0.1, 0.9).toFixed(2));
        const avg = parseFloat(rng.nextFloat(0.1, 0.5).toFixed(2));
        return `${player} vs ${avg} avg`;
      },
      category: "comparison",
      relatedAttributes: ["finishing", "composure"],
    },
    // Progressive metrics
    {
      label: "Progressive passes per 90 vs positional average",
      generateValue: (rng) => {
        const player = parseFloat(rng.nextFloat(2.0, 10.0).toFixed(1));
        const avg = parseFloat(rng.nextFloat(2.0, 7.0).toFixed(1));
        return `${player} vs ${avg} avg`;
      },
      category: "comparison",
      relatedAttributes: ["passing", "vision"],
    },
    {
      label: "Pressures per 90",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(5.0, 28.0).toFixed(1)),
      category: "statistical",
      relatedAttributes: ["pressing", "workRate"],
    },
    {
      label: "Pressure success rate",
      generateValue: (rng) => `${rng.nextInt(18, 52)}%`,
      category: "statistical",
      relatedAttributes: ["pressing", "anticipation"],
    },
    // Heat map and movement
    {
      label: "Heat map entropy score (movement variety)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.3, 0.95).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["offTheBall", "teamwork"],
    },
    {
      label: "Distance covered per 90 (km)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(8.5, 13.2).toFixed(1)),
      category: "statistical",
      relatedAttributes: ["stamina", "workRate"],
    },
    {
      label: "High-speed running distance per 90 (m)",
      generateValue: (rng) => rng.nextInt(400, 1800),
      category: "statistical",
      relatedAttributes: ["pace", "stamina"],
    },
    // Anomaly flags
    {
      label: "Anomaly: off-ball movement disrupts defensive shape",
      generateValue: (_rng) => "confirmed",
      category: "anomaly",
      relatedAttributes: ["offTheBall", "vision"],
    },
    {
      label: "Anomaly: recurrent blind-side positioning in set pieces",
      generateValue: (_rng) => "confirmed",
      category: "anomaly",
      relatedAttributes: ["anticipation", "positioning"],
    },
    {
      label: "Anomaly: reaction time to second ball consistently elite",
      generateValue: (_rng) => "confirmed",
      category: "anomaly",
      relatedAttributes: ["anticipation", "workRate"],
    },
    // League vs player comparison overlays
    {
      label: "Defensive actions per 90 vs league p25",
      generateValue: (rng) => {
        const player = parseFloat(rng.nextFloat(1.0, 8.0).toFixed(1));
        const p25 = parseFloat(rng.nextFloat(1.0, 4.0).toFixed(1));
        return `${player} vs ${p25} p25`;
      },
      category: "comparison",
      relatedAttributes: ["tackling", "defensiveAwareness"],
    },
    {
      label: "Ball retention under pressure %",
      generateValue: (rng) => `${rng.nextInt(52, 84)}%`,
      category: "comparison",
      relatedAttributes: ["composure", "balance", "strength"],
    },
    {
      label: "Chance-creation rate per touch in final third",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.04, 0.22).toFixed(3)),
      category: "statistical",
      relatedAttributes: ["vision", "passing", "dribbling"],
    },
  ],

  // ---------------------------------------------------------------------------
  // algorithmCalibration
  // ---------------------------------------------------------------------------
  algorithmCalibration: [
    // Past prediction review
    {
      label: "Model accuracy — last 20 predictions",
      generateValue: (rng) => `${rng.nextInt(52, 84)}%`,
      category: "statistical",
    },
    {
      label: "False positives (over-rated players)",
      generateValue: (rng) => rng.nextInt(1, 6),
      category: "statistical",
    },
    {
      label: "False negatives (missed players)",
      generateValue: (rng) => rng.nextInt(0, 5),
      category: "statistical",
    },
    {
      label: "Prediction confidence interval (±)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.05, 0.22).toFixed(2)),
      category: "statistical",
    },
    {
      label: "Attribute most over-predicted",
      generateValue: (rng) =>
        rng.pick([
          "pace",
          "finishing",
          "composure",
          "passing",
          "vision",
          "workRate",
        ]),
      category: "anomaly",
    },
    // Parameter adjustment
    {
      label: "Age-weight decay multiplier",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.85, 1.15).toFixed(3)),
      category: "comparison",
    },
    {
      label: "League difficulty coefficient",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.70, 1.30).toFixed(2)),
      category: "comparison",
    },
    {
      label: "Physical attribute weighting",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.15, 0.45).toFixed(2)),
      category: "comparison",
    },
    {
      label: "Mental attribute weighting",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.15, 0.45).toFixed(2)),
      category: "comparison",
    },
    {
      label: "Recency bias window (weeks)",
      generateValue: (rng) => rng.nextInt(4, 24),
      category: "comparison",
    },
    // Test results
    {
      label: "Revised accuracy estimate",
      generateValue: (rng) => `${rng.nextInt(60, 89)}%`,
      category: "trend",
    },
    {
      label: "Backtest sample size",
      generateValue: (rng) => rng.nextInt(40, 220),
      category: "trend",
    },
    {
      label: "Improvement over previous model",
      generateValue: (rng) => `+${rng.nextInt(1, 12)}%`,
      category: "trend",
    },
    {
      label: "Anomaly: model under-values defensive midfielders",
      generateValue: (_rng) => "detected",
      category: "anomaly",
    },
  ],

  // ---------------------------------------------------------------------------
  // marketInefficiency
  // ---------------------------------------------------------------------------
  marketInefficiency: [
    // Cross-league value comparison
    {
      label: "Players identified in value bracket",
      generateValue: (rng) => rng.nextInt(8, 45),
      category: "statistical",
    },
    {
      label: "Average market value (€M)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.3, 8.5).toFixed(1)),
      category: "statistical",
    },
    {
      label: "Expected value at target tier (€M)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(1.5, 18.0).toFixed(1)),
      category: "comparison",
    },
    {
      label: "Arbitrage margin (€M)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.2, 9.5).toFixed(1)),
      category: "anomaly",
      relatedAttributes: ["consistency", "professionalism"],
    },
    {
      label: "League origin",
      generateValue: (rng) =>
        rng.pick([
          "Danish Superliga",
          "Austrian Bundesliga",
          "Eredivisie",
          "Belgian Pro League",
          "Scottish Premiership",
          "Swiss Super League",
          "Portuguese Segunda Liga",
          "Romanian Liga I",
        ]),
      category: "statistical",
    },
    // Undervalued player signals
    {
      label: "Goals per 90 (vs wage bracket peers)",
      generateValue: (rng) =>
        `${parseFloat(rng.nextFloat(0.25, 0.85).toFixed(2))} vs ${parseFloat(rng.nextFloat(0.05, 0.35).toFixed(2))} avg`,
      category: "comparison",
      relatedAttributes: ["finishing", "shooting"],
    },
    {
      label: "Contract years remaining",
      generateValue: (rng) => rng.nextInt(0, 3),
      category: "statistical",
      relatedAttributes: ["professionalism"],
    },
    {
      label: "Agent release clause present",
      generateValue: (rng) => rng.pick(["Yes", "No", "Unknown"]),
      category: "statistical",
    },
    {
      label: "Wage vs league median ratio",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.4, 1.8).toFixed(2)),
      category: "comparison",
    },
    {
      label: "Comparable transfer (league-adjusted)",
      generateValue: (rng) =>
        `${parseFloat(rng.nextFloat(0.5, 12.0).toFixed(1))}M`,
      category: "trend",
    },
    // Arbitrage data
    {
      label: "Market efficiency rating for league",
      generateValue: (rng) => `${rng.nextInt(35, 78)}%`,
      category: "trend",
    },
    {
      label: "Cross-club interest signals",
      generateValue: (rng) => rng.nextInt(0, 5),
      category: "trend",
    },
    {
      label: "Anomaly: value significantly below OPTA percentile rank",
      generateValue: (_rng) => "flagged",
      category: "anomaly",
      relatedAttributes: ["consistency"],
    },
    {
      label: "Anomaly: underexposed market — few scouts attended",
      generateValue: (_rng) => "confirmed",
      category: "anomaly",
    },
    {
      label: "Performance-to-transfer-fee correlation",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.3, 0.92).toFixed(2)),
      category: "trend",
    },
    {
      label: "Similar player fee at top-tier club (€M)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(5.0, 40.0).toFixed(1)),
      category: "comparison",
    },
  ],

  // ---------------------------------------------------------------------------
  // oppositionAnalysis
  // ---------------------------------------------------------------------------
  oppositionAnalysis: [
    // Tactical patterns
    {
      label: "Defensive formation",
      generateValue: (rng) =>
        rng.pick(["4-4-2", "4-3-3", "5-3-2", "4-5-1", "3-4-3", "4-2-3-1"]),
      category: "statistical",
      relatedAttributes: ["defensiveAwareness", "marking"],
    },
    {
      label: "Defensive line height (average m from goal)",
      generateValue: (rng) => rng.nextInt(28, 52),
      category: "statistical",
      relatedAttributes: ["defensiveAwareness", "positioning"],
    },
    {
      label: "High press trigger threshold (own half %)",
      generateValue: (rng) => `${rng.nextInt(30, 75)}%`,
      category: "statistical",
      relatedAttributes: ["pressing"],
    },
    {
      label: "Compactness width (avg m)",
      generateValue: (rng) => rng.nextInt(22, 48),
      category: "statistical",
      relatedAttributes: ["teamwork", "marking"],
    },
    {
      label: "Counter-press intensity (PPDA)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(4.5, 16.0).toFixed(1)),
      category: "comparison",
      relatedAttributes: ["pressing", "workRate"],
    },
    // Formation heat maps
    {
      label: "Heat map peak: left back zone",
      generateValue: (rng) => `${rng.nextInt(12, 45)}%`,
      category: "comparison",
      relatedAttributes: ["defensiveAwareness"],
    },
    {
      label: "Heat map peak: right back zone",
      generateValue: (rng) => `${rng.nextInt(12, 45)}%`,
      category: "comparison",
      relatedAttributes: ["defensiveAwareness"],
    },
    {
      label: "Heat map: central overload tendency",
      generateValue: (rng) => rng.pick(["High", "Medium", "Low"]),
      category: "comparison",
      relatedAttributes: ["teamwork", "offTheBall"],
    },
    {
      label: "Wide area exploitation rate",
      generateValue: (rng) => `${rng.nextInt(18, 58)}%`,
      category: "statistical",
      relatedAttributes: ["crossing", "offTheBall"],
    },
    // Set piece statistics
    {
      label: "Set piece goals per game",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.0, 0.8).toFixed(2)),
      category: "statistical",
      relatedAttributes: ["heading", "jumping"],
    },
    {
      label: "Corners conceded per game",
      generateValue: (rng) => parseFloat(rng.nextFloat(2.0, 8.5).toFixed(1)),
      category: "statistical",
      relatedAttributes: ["marking", "defensiveAwareness"],
    },
    {
      label: "Direct free kick shots per game",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.0, 1.5).toFixed(1)),
      category: "statistical",
      relatedAttributes: ["shooting"],
    },
    {
      label: "Set piece vulnerability rating",
      generateValue: (rng) => rng.pick(["High", "Medium", "Low"]),
      category: "anomaly",
      relatedAttributes: ["marking", "jumping"],
    },
    {
      label: "Anomaly: recurrent gap left channel vs high press",
      generateValue: (_rng) => "confirmed",
      category: "anomaly",
      relatedAttributes: ["pressing", "defensiveAwareness"],
    },
    {
      label: "Anomaly: fullback pushes on goalkeeping distribution",
      generateValue: (_rng) => "flagged",
      category: "anomaly",
      relatedAttributes: ["offTheBall"],
    },
    {
      label: "Average goals from set pieces (last 10 games)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.0, 1.8).toFixed(2)),
      category: "trend",
      relatedAttributes: ["heading", "anticipation"],
    },
    {
      label: "Tactical switch frequency (formations per game)",
      generateValue: (rng) =>
        parseFloat(rng.nextFloat(0.0, 2.0).toFixed(1)),
      category: "trend",
      relatedAttributes: ["teamwork", "decisionMaking"],
    },
  ],
};

// =============================================================================
// PHASE DESCRIPTIONS
// =============================================================================

/**
 * Narrative descriptions for each analysis activity, keyed by phase role index.
 * Phase role 0 is always the opening / setup phase; subsequent indices follow
 * the natural flow of each activity type.
 */
const PHASE_DESCRIPTIONS: Record<string, string[][]> = {
  databaseQuery: [
    // Phase 0 — query design
    [
      "The database interface loads. You configure your search filters — age range, position group, league tier, and minimum minutes threshold.",
      "Structured query entry. You refine the parameters to narrow the candidate pool before the results load.",
      "Setting the search criteria. A focused query now will save review time later.",
    ],
    // Phase 1 — initial results
    [
      "The results return a list of candidates matching your filters. You begin scanning for the standout figures.",
      "First pass through the data. A handful of names immediately draw attention — the numbers tell part of the story.",
      "Initial results loaded. The data confirms some early hypotheses and quietly contradicts a few others.",
    ],
    // Phase 2 — refine and compare
    [
      "You cross-reference the shortlist against league-context multipliers and comparable player values.",
      "Comparative analysis phase. The raw numbers are being adjusted for league difficulty and playing time.",
      "Deep comparison running. Outliers in the data start to look even more interesting on second examination.",
    ],
    // Phase 3 — deep probe
    [
      "Drilling into the top candidates. Per-90 breakdowns and physical load metrics are assembled for individual review.",
      "The granular data layer loads. Sprints, pressing intensity, and aerial statistics add texture to the surface numbers.",
      "Per-player deep probe. The data narrative is becoming clear — not all good numbers reflect the same kind of quality.",
    ],
    // Phase 4 — final shortlist
    [
      "You compile a final shortlist from the session. These are the names worth pursuing with video review.",
      "Last phase of the query session. A handful of candidates have survived every filter and every metric.",
      "Database session complete. The shortlist is set. The data has done its job.",
    ],
  ],

  watchVideo: [
    // Phase 0 — opening clips
    [
      "You load the first video clips. The scout platform queues up the most recent league appearances.",
      "Opening sequence: recent match highlights. You watch with the filter in mind — not the obvious moments but the invisible ones.",
      "First set of clips ready. The statistics are there as an overlay. The eye test begins.",
    ],
    // Phase 1 — technical detail
    [
      "Technical actions under the microscope. First touch, release speed, and weight of pass across multiple clips.",
      "Clip sequence focuses on in-possession moments. You build a picture of the player's touch range and distribution habits.",
      "Technical overview phase. The per-90 numbers anchor what the eye is seeing — some things match, some things surprise.",
    ],
    // Phase 2 — movement and positioning
    [
      "Off-ball movement clips queue up. You track runs, positioning triggers, and how the player moves before the ball arrives.",
      "Movement data overlaid on the footage. Positional variance, heat concentrations, and sprint routes are now visible.",
      "Pass map and movement phase. The picture emerging is of a player who either uses space or avoids it — the data makes it legible.",
    ],
    // Phase 3 — defensive contribution
    [
      "Defensive clips: pressing triggers, recovery runs, and aerial challenges. The defensive profile rounds out the picture.",
      "You review the defensive moments. Some players change completely out of possession — this session reveals who they are without the ball.",
      "Defensive action sequence. Press frequency, tackle timing, and block attempts are assembled and compared.",
    ],
    // Phase 4 — set piece and transition
    [
      "Set pieces and transitions. How the player behaves in the game's least structured moments often says the most.",
      "Transition clips load. The data picks up momentum markers — acceleration speed, reaction frames, and recovery distances.",
      "Transition and set piece phase. The anomalies flagged in the statistical review either get explained here or get stranger.",
    ],
    // Phase 5 — summary and flag
    [
      "Final clip sequence. You flag the most significant moments and annotate the data points that will feed the report.",
      "Session wrap-up. The video has confirmed what the numbers implied — or has complicated the picture further.",
      "Closing video phase. The overall impression solidifies. The data has told a story; you now need to decide whether you believe it.",
    ],
    // Phase 6 — anomaly drill-down (if long session)
    [
      "You return to the anomalies flagged during the statistical overview. The clips add context to the numbers.",
      "Drilling into the outlier data points. Each flagged metric gets a corresponding clip sequence for verification.",
      "Anomaly review clips. Sometimes the flagged number is a data error. Sometimes it is the most important thing in the file.",
    ],
    // Phase 7 — comparison clips
    [
      "Comparable player clips are loaded side by side. The contrast sharpens the relative evaluation.",
      "Peer comparison phase. Similar age, similar position, different league — the visual gap is either confirmed or closed.",
      "Side-by-side comparison. The target player's movements are set against a benchmark. The difference is either clear or not.",
    ],
  ],

  deepVideoAnalysis: [
    // Phase 0 — frame-level setup
    [
      "Frame-by-frame analysis begins. The platform loads high-resolution clips with positional data overlaid on every frame.",
      "Deep video session opens. The data density is higher than standard video review — every touch annotated, every movement tracked.",
      "Frame analysis mode. The granularity here is where patterns emerge that a single match watch never reveals.",
    ],
    // Phase 1 — body mechanics
    [
      "Body orientation and receive mechanics are the focus. The frame data reveals how the player sets themselves before the ball arrives.",
      "Pre-receive position analysis. Head scan frequency, shoulder set, and first-touch direction are all visible in the frame data.",
      "Body mechanics phase. The way a player orientates before receiving defines the options available in the next action.",
    ],
    // Phase 2 — decision speed
    [
      "Decision timing clips. Frame count from receive to release is calculated across the full sample — the number tells a story.",
      "Release speed analysis. You count the frames. Some players see the pass before the ball arrives. Some never quite do.",
      "Cognitive speed assessment via frame data. The fastest decision-makers rarely look rushed. The data confirms the intuition.",
    ],
    // Phase 3 — xG and shot quality
    [
      "Expected goals layer applied. Every shot in the sample is mapped against xG models — the comparison reveals finishing skill independent of volume.",
      "Shot quality analysis. The xG overlay on each attempt clarifies whether the player is creating high-value chances or just taking shots.",
      "xG deep dive. The difference between this player's expected and actual goals is a number that often reframes the whole evaluation.",
    ],
    // Phase 4 — pressing mechanics
    [
      "Pressing sequence analysis. Frame data tracks the trigger, the approach angle, and the body shape of each press attempt.",
      "Off-ball pressing clips with intensity metrics overlaid. Some players press with intent; others simply cover distance.",
      "Pressing frame analysis. The efficiency calculation — pressure successes divided by total attempts — lands as a sharp data point.",
    ],
    // Phase 5 — heat map and movement
    [
      "Heat map data loads over the full sample. The density picture is precise — every touch, every sprint, every defensive action mapped.",
      "Movement variety analysis. High entropy scores indicate an unpredictable player who populates the pitch widely. Low scores reveal a creature of habit.",
      "Heat map deep analysis. The spatial density tells you where the player lives on the pitch. The frame data tells you why.",
    ],
    // Phase 6 — comparison against league average
    [
      "League average overlays applied across the full statistical range. The player's profile versus positional benchmarks is now visible.",
      "Peer comparison with league percentile bands. You identify which attributes sit in the elite tier and which are merely adequate.",
      "League context phase. A 0.4 xG per 90 means nothing without knowing the positional average. The overlay provides that context.",
    ],
    // Phase 7 — anomaly investigation
    [
      "Flagged anomalies are investigated frame by frame. The patterns that looked like noise in the initial pass are now either confirmed or dismissed.",
      "Anomaly clip sequences. Each flagged data point has a corresponding video frame — the truth is usually visible if you look at the right frame.",
      "Drilling into the anomalies. Some are artefacts of sample size. Some are the most important finding of the entire analysis.",
    ],
    // Phase 8 — synthesis
    [
      "Final synthesis phase. The frame data, the statistical overlays, and the visual impression are assembled into a coherent picture.",
      "Closing phase of deep video analysis. The conclusion either confirms the recommendation or introduces a new complication.",
      "Deep analysis complete. The comprehensive data profile is ready. The scout's job now is to decide what the numbers actually mean.",
    ],
    // Phase 9 — report prep (if maximum length)
    [
      "Report preparation phase. Key data points, anomaly flags, and visual evidence are compiled into a structured assessment.",
      "Final review before report compilation. The deep analysis has produced a clear evidence set — the writing now begins.",
      "Session closes. The data picture is as complete as it can be from video alone. The next step requires live observation to confirm.",
    ],
  ],

  algorithmCalibration: [
    // Phase 0 — review past predictions
    [
      "You open the prediction log. The last 20 player assessments are loaded with their predicted ratings and eventual outcomes.",
      "Accuracy review phase. The model's recent performance is laid out — the hits, the misses, and the patterns in the errors.",
      "Past prediction audit. You scan the accuracy metrics and pause on the false positives — over-rated players are the most costly errors.",
    ],
    // Phase 1 — parameter adjustment
    [
      "Parameter calibration interface. The age-weight decay, league difficulty coefficients, and attribute group weightings are all exposed.",
      "Tuning the model. You adjust the sliders and watch the accuracy projection update in real time.",
      "Calibration phase. The numbers shift with each parameter change. The goal is a tighter confidence interval without sacrificing accuracy.",
    ],
    // Phase 2 — test against backtest
    [
      "The revised model is run against the backtest sample. The improvement over the previous iteration is calculated.",
      "Backtest results arrive. The new parameters perform better on out-of-sample data — or they do not, and the calibration resumes.",
      "Test run complete. The revised model's performance is assessed against the benchmark. The result either validates the changes or sends you back to the drawing board.",
    ],
    // Phase 3 — anomaly investigation (if 4-phase)
    [
      "Anomaly investigation. The model's systematic errors are examined in detail — which attribute groups are consistently mispredicted.",
      "Systematic bias analysis. The model has a blind spot. Identifying it precisely is the most valuable outcome of the calibration session.",
      "Final calibration phase. The known anomalies are addressed with targeted adjustments. The model is as accurate as the current data allows.",
    ],
  ],

  marketInefficiency: [
    // Phase 0 — initial scan
    [
      "The market inefficiency scan loads. You define the value bracket and the target league tier for comparison.",
      "Cross-league scan begins. The platform queries player values against performance percentiles across multiple leagues.",
      "Opening phase: market landscape. The data identifies leagues where performance-to-value correlations are weakest.",
    ],
    // Phase 1 — candidate identification
    [
      "A list of undervalued candidates is returned. Players whose performance metrics outpace their market valuation.",
      "Candidate shortlist generated. The arbitrage margin column is immediately the most interesting number on the screen.",
      "Undervalued player identification. The platform has flagged profiles where wages and transfer fees sit below expected levels.",
    ],
    // Phase 2 — contract and value deep dive
    [
      "Contract status and release clause data loads. The commercial picture is sometimes more important than the statistical one.",
      "Deep dive into the top candidates. Wage ratios, contract length, and agent information are assembled alongside the performance data.",
      "Commercial analysis phase. The best-value player in the dataset is only truly good value if the deal is actually achievable.",
    ],
    // Phase 3 — peer comparison
    [
      "Comparable player transfer fees are pulled from the database. The valuation gap becomes a concrete number.",
      "Peer comparison phase. Similar profiles from higher leagues are priced — the reference points sharpen the arbitrage calculation.",
      "Cross-market comparison. A player who cost €2M in one league routinely transfers for €12M after a single good season at the next level.",
    ],
    // Phase 4 — trend analysis
    [
      "Performance trend data overlaid on the value profile. Is the player ascending, plateauing, or declining?",
      "Trend analysis phase. The best arbitrage opportunities are players on an upward trajectory before the market has caught up.",
      "Historical trend review. The trajectory matters as much as the current level — you need to price the player in 12 months.",
    ],
    // Phase 5 — final ranking (if long session)
    [
      "The final candidate ranking is assembled. Arbitrage margin, contract status, and trajectory are combined into a single priority score.",
      "Session closes. The market inefficiency analysis has produced a ranked list of acquisition targets ordered by value opportunity.",
      "Final phase complete. The targets have been identified. The question now is whether the club has the appetite to act before the market corrects.",
    ],
  ],

  oppositionAnalysis: [
    // Phase 0 — tactical overview
    [
      "Opposition tactical profile loads. Formation data, pressing triggers, and defensive line height are assembled from the last ten fixtures.",
      "Tactical overview phase. The opposition's structural patterns are laid out — their defensive shape is the starting point.",
      "Formation and shape analysis. The data shows how they set up and how consistently they maintain it across different opponents.",
    ],
    // Phase 1 — pressing and defensive patterns
    [
      "Pressing intensity and defensive compactness data loads. Their PPDA figures tell you whether their press is genuine or performative.",
      "Defensive pattern analysis. The pressing trigger thresholds are mapped — you now know exactly when they push and when they hold.",
      "Pressing data phase. Some teams press hard in the first 60 minutes and collapse. Others sustain it. The data tells you which this is.",
    ],
    // Phase 2 — heat map analysis
    [
      "Formation heat maps load across the full sample. The spatial patterns reveal how they actually occupy the pitch versus how they line up.",
      "Heat map analysis phase. The density data identifies the zones they protect and the channels they leave exposed.",
      "Spatial pattern review. The heat maps are clear. Their left channel is consistently underloaded when they lose possession high.",
    ],
    // Phase 3 — set piece breakdown
    [
      "Set piece data assembled. Corners, free kicks, and long throws — both attacking and defensive — are catalogued.",
      "Set piece analysis phase. The data on their defensive set piece organisation reveals a recurring vulnerability.",
      "Dead ball statistics. Set pieces score more goals at this level than many analysts credit — the vulnerability here is real and exploitable.",
    ],
    // Phase 4 — anomaly and opportunity flags
    [
      "Anomaly flags load. Patterns that appear across more than 60% of recent matches are highlighted as reliable tactical signals.",
      "Opportunity identification phase. The confirmed anomalies are translated into tactical recommendations.",
      "Flagged patterns review. The analysis has produced two reliable weaknesses and one structural tendency that can be targeted consistently.",
    ],
    // Phase 5 — final report preparation (if long session)
    [
      "Final phase: opposition report compilation. The key findings are formatted for the coaching staff briefing.",
      "Session closes. The tactical picture is complete — the data summary is ready to be turned into a match-day briefing document.",
      "Opposition analysis complete. The patterns identified here will inform the tactical preparation for the coming fixture.",
    ],
  ],
};

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Returns phase description text for a given activity type and phase index.
 * Falls back to a generic analysis description when the specific bank is exhausted.
 */
function getPhaseDescription(
  activityType: string,
  phaseIndex: number,
  rng: RNG,
): string {
  const bank = PHASE_DESCRIPTIONS[activityType];

  if (!bank) {
    return `Analysis phase ${phaseIndex + 1}. You process the data and scan for meaningful signals.`;
  }

  // Clamp to the last available description bank if phases exceed the bank size.
  const bankIndex = Math.min(phaseIndex, bank.length - 1);
  const variants = bank[bankIndex];

  if (!variants || variants.length === 0) {
    return `Analysis phase ${phaseIndex + 1}. You continue processing the data.`;
  }

  return rng.pick(variants);
}

/**
 * Samples a set of unique template indices from the given bank.
 * Uses Fisher-Yates partial shuffle so we never repeat within a phase.
 * Returns up to `count` templates.
 */
function sampleTemplates(
  bank: DataPointTemplate[],
  count: number,
  rng: RNG,
): DataPointTemplate[] {
  if (bank.length === 0) {
    return [];
  }

  const indices = bank.map((_, i) => i);
  const limit = Math.min(count, bank.length);
  const result: DataPointTemplate[] = [];

  for (let i = 0; i < limit; i++) {
    const j = rng.nextInt(i, indices.length - 1);
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
    result.push(bank[indices[i]]);
  }

  return result;
}

/**
 * Determines whether a data point should be highlighted as significant.
 *
 * Anomaly-category points are always highlighted.
 * Other categories are highlighted at a 25% base rate, rising to 40% in
 * later phases (phaseIndex >= 2) to reward sustained engagement.
 */
function shouldHighlight(
  category: DataPoint["category"],
  phaseIndex: number,
  rng: RNG,
): boolean {
  if (category === "anomaly") {
    return true;
  }

  const baseRate = phaseIndex >= 2 ? 0.4 : 0.25;
  return rng.chance(baseRate);
}

/**
 * Builds a unique DataPoint id that is deterministic for a given session
 * phase and index combination.
 */
function makeDataPointId(
  phaseIndex: number,
  pointIndex: number,
  label: string,
): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 16);
  return `dp-p${phaseIndex}-${pointIndex}-${slug}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generates an array of DataPoints for a single analysis session phase.
 *
 * Count ranges from 3 to 8 data points per phase. The count is weighted
 * toward 4–6 to keep phases digestible. Later phases (phaseIndex >= 2)
 * trend toward the higher end to reward engagement.
 *
 * Categories are driven by the template bank for the given activity type.
 * Highlighted points are anomaly items (always) and a random selection of
 * the remaining items at a 25–40% rate.
 *
 * @param rng          - Seeded RNG for deterministic generation.
 * @param activityType - The analysis activity type (e.g. "databaseQuery").
 * @param phaseIndex   - 0-based phase index within the session.
 * @param players      - Players visible in this session (for playerId binding).
 */
export function generateDataPoints(
  rng: RNG,
  activityType: string,
  phaseIndex: number,
  players: SessionPlayer[],
): DataPoint[] {
  const bank = DATA_POINT_TEMPLATES[activityType] ?? DATA_POINT_TEMPLATES["databaseQuery"];

  // Count range: 3–8, weighted toward 4–6 in early phases.
  const minCount = 3;
  const maxCount = phaseIndex >= 2 ? 8 : 6;
  const count = rng.nextInt(minCount, maxCount);

  const templates = sampleTemplates(bank, count, rng);

  return templates.map((template, i) => {
    const category = template.category;
    const isHighlighted = shouldHighlight(category, phaseIndex, rng);

    // Bind to a player when there is at least one in the pool and the template
    // has related attributes (implying it describes an individual rather than
    // a team/league aggregate). Bind to the first player 60% of the time,
    // distribute among others at equal probability.
    let playerId: string | undefined;
    if (
      players.length > 0 &&
      template.relatedAttributes &&
      template.relatedAttributes.length > 0
    ) {
      // 70% chance to bind to a specific player; 30% treat as aggregate.
      if (rng.chance(0.7)) {
        playerId = rng.pick(players).playerId;
      }
    }

    const value = template.generateValue(rng);

    return {
      id: makeDataPointId(phaseIndex, i, template.label),
      playerId,
      label: template.label,
      value,
      category,
      isHighlighted,
      relatedAttributes: template.relatedAttributes,
    };
  });
}

/**
 * Populates all skeleton phases of an Analysis session with data points
 * and narrative descriptions.
 *
 * Input contract:
 *   - session.state must be 'setup'.
 *   - session.mode must be 'analysis'.
 *   - session.phases contains skeleton phases from session.ts (dataPoints: undefined).
 *
 * Returns a new session object in 'setup' state with all phases populated.
 * The caller transitions to 'active' via startSession() from session.ts.
 *
 * Guard behaviour: if the session is not in 'setup' state or the mode is not
 * 'analysis', the session is returned unchanged so callers can call
 * populateAnalysisPhases defensively without checking mode first.
 */
export function populateAnalysisPhases(
  session: ObservationSession,
  rng: RNG,
): ObservationSession {
  if (session.state !== "setup") {
    return session;
  }

  if (session.mode !== "analysis") {
    return session;
  }

  const activityType = session.activityType as string;

  const populatedPhases: SessionPhase[] = session.phases.map((phase) => {
    const dataPoints = generateDataPoints(
      rng,
      activityType,
      phase.index,
      session.players,
    );

    const description = getPhaseDescription(activityType, phase.index, rng);

    // Analysis sessions have a lower atmosphere event probability than live
    // matches — the environment is controlled. No atmosphere events are applied
    // in this module; the fullObservation populator handles that domain.
    return {
      ...phase,
      dataPoints,
      description,
    };
  });

  return {
    ...session,
    phases: populatedPhases,
  };
}
