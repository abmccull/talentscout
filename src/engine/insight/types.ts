/**
 * Insight Points System Types
 *
 * Type definitions for the Insight Points system — a cross-specialization
 * resource earned through scouting activities that unlocks "eureka moment"
 * actions for dramatically enhanced outcomes.
 *
 * Design:
 *  - Insight Points (IP) accumulate passively from quality scouting work.
 *  - Spending IP triggers high-value one-shot actions with a cooldown gate.
 *  - Each action belongs to a specialization (or is universal) and is only
 *    available during specific observation modes.
 *  - A fatigue mechanic can cause actions to fizzle: IP is spent but the
 *    effect is weaker or absent.
 */

import type { Specialization } from "@/engine/core/types";
import type { ObservationMode } from "@/engine/observation/types";

// =============================================================================
// ACTION IDENTIFIERS
// =============================================================================

/**
 * All valid Insight Action IDs, grouped by specialization.
 *
 * Universal actions are available regardless of the scout's active
 * specialization. Specialization-locked actions require the scout to have
 * that specialization active during the session.
 */
export type InsightActionId =
  // Universal
  | "clarityOfVision"
  | "hiddenNature"
  | "theVerdict"
  | "secondLook"
  // Youth
  | "diamondInTheRough"
  | "generationalWhisper"
  // First-Team
  | "perfectFit"
  | "pressureTest"
  // Regional
  | "networkPulse"
  | "territoryMastery"
  // Data
  | "algorithmicEpiphany"
  | "marketBlindSpot";

// =============================================================================
// STATE
// =============================================================================

/**
 * The scout's full Insight Points state, stored on GameState.
 *
 * `capacity` is computed from the scout's intuition stat:
 *   INSIGHT_CAPACITY_BASE + (intuition × INSIGHT_CAPACITY_PER_INTUITION)
 *
 * `cooldownWeeksRemaining` counts down each week tick. When it reaches 0 the
 * scout may use another insight action.
 */
export interface InsightState {
  /** Current IP balance. Never exceeds `capacity`. */
  points: number;
  /** Maximum IP that can be stored. Derived from intuition stat. */
  capacity: number;
  /** Weeks until the scout may use another insight action (0 = ready). */
  cooldownWeeksRemaining: number;
  /** Total number of insight actions used across all time. */
  lifetimeUsed: number;
  /** Total IP earned across all time (before spending). */
  lifetimeEarned: number;
  /** Game week of the last insight action use (0 = never used). */
  lastUsedWeek: number;
  /** Chronological log of every insight action the scout has used. */
  history: InsightUseRecord[];
}

// =============================================================================
// ACTION DEFINITIONS
// =============================================================================

/**
 * Static definition of a single insight action.
 *
 * Action definitions are immutable at runtime — they live in INSIGHT_ACTIONS
 * and are looked up by `id`. Never persist action definitions in saved state;
 * only persist `InsightUseRecord` references by `actionId`.
 */
export interface InsightAction {
  /** Canonical identifier used for lookup and serialization. */
  id: InsightActionId;
  /** Human-readable display name. */
  name: string;
  /** Flavour description shown in the UI before the player commits IP. */
  description: string;
  /** IP cost deducted on use (regardless of fizzle). */
  cost: number;
  /** Weeks before the insight system allows another action after this one. */
  cooldown: number;
  /** Which specialization unlocks this action, or 'universal'. */
  specialization: Specialization | "universal";
  /** Observation modes during which this action can be triggered. */
  availableDuring: ObservationMode[];
  /** One-line warning shown alongside the action to communicate downside risk. */
  riskDescription: string;
}

// =============================================================================
// RECORDS & RESULTS
// =============================================================================

/**
 * Serializable record of a single past insight action use.
 * Stored in `InsightState.history`.
 */
export interface InsightUseRecord {
  actionId: InsightActionId;
  /** Game week during which the action was used. */
  week: number;
  /** Season number during which the action was used. */
  season: number;
  /** ID of the primary player the action was applied to, if applicable. */
  targetPlayerId?: string;
  /** Qualitative outcome bucket for analytics and post-session review. */
  outcome: "valuable" | "moderate" | "wasted";
  /** Short narrative string describing what happened (shown in session recap). */
  narrative: string;
}

/**
 * The full result produced by applying an insight action during a session.
 *
 * `success: false` indicates a fizzle: IP was spent, fatigue was incurred,
 * but the dramatic effect did not trigger. A fizzle still sets the cooldown.
 *
 * Optional fields are populated only by the actions that produce them:
 *
 * | Field                | Action(s)                          |
 * |----------------------|------------------------------------|
 * | observations         | clarityOfVision, diamondInTheRough |
 * | revealedAttributes   | hiddenNature                       |
 * | discoveredPlayerId   | diamondInTheRough                  |
 * | reportQualityBonus   | theVerdict                         |
 * | systemFitData        | perfectFit                         |
 * | contactIntel         | networkPulse                       |
 * | confidenceBonus      | territoryMastery                   |
 * | queryAccuracyBonus   | algorithmicEpiphany                |
 * | undervaluedPlayers   | marketBlindSpot                    |
 */
export interface InsightActionResult {
  actionId: InsightActionId;
  /** Whether the action produced its full intended effect. */
  success: boolean;
  /** Narrative description of the outcome, shown in the session log. */
  narrative: string;

  // --- clarityOfVision / diamondInTheRough ---
  /** Perfect attribute reads that bypass perception noise. */
  observations?: Array<{
    playerId: string;
    attribute: string;
    trueValue: number;
  }>;

  // --- hiddenNature ---
  /** True values of hidden attributes (injuryProneness, consistency, etc.). */
  revealedAttributes?: Array<{
    playerId: string;
    attribute: string;
    value: number;
  }>;

  // --- diamondInTheRough ---
  /** ID of the highest-PA undiscovered prospect found at the venue. */
  discoveredPlayerId?: string;

  // --- theVerdict ---
  /** Flat bonus applied to report quality score (e.g. +30). */
  reportQualityBonus?: number;

  // --- perfectFit ---
  /** Positional and role grades for how the player fits the club's system. */
  systemFitData?: Record<string, number>;

  // --- networkPulse ---
  /** Intel strings shared by contacts, bypassing relationship gates. */
  contactIntel?: Array<{
    contactId: string;
    intel: string;
  }>;

  // --- territoryMastery ---
  /** Percentage boost permanently added to confidence in the current sub-region. */
  confidenceBonus?: number;

  // --- algorithmicEpiphany ---
  /** Accuracy multiplier applied to the statistical query for this cycle. */
  queryAccuracyBonus?: number;

  // --- marketBlindSpot ---
  /** Player IDs identified as undervalued in the queried league/position. */
  undervaluedPlayers?: string[];
}

// =============================================================================
// ACCUMULATION
// =============================================================================

/**
 * Breakdown of how a single batch of IP was earned.
 * Used for session summaries and debugging; not stored long-term.
 *
 * Formula:
 *   totalEarned = floor(baseAmount × qualityMultiplier + specializationBonus + intuitionBonus)
 *   clamped so that points never exceed InsightState.capacity.
 */
export interface InsightAccumulationSource {
  /** Activity that generated the IP. */
  source:
    | "observation"
    | "report"
    | "hypothesisConfirmed"
    | "hypothesisDebunked"
    | "assignment";
  /** Flat IP before any multipliers. */
  baseAmount: number;
  /** Multiplier based on the quality of the activity (see INSIGHT_QUALITY_MULTIPLIERS). */
  qualityMultiplier: number;
  /** Flat bonus from the scout's active specialization matching the activity. */
  specializationBonus: number;
  /** Flat bonus derived from the scout's intuition stat. */
  intuitionBonus: number;
  /** Final IP added to the scout's balance. */
  totalEarned: number;
}

// =============================================================================
// ACTION CATALOGUE
// =============================================================================

/**
 * The complete catalogue of all 12 insight actions.
 *
 * This array is the single source of truth for action definitions. Engine
 * functions look up actions by `id`; nothing else stores action metadata.
 */
export const INSIGHT_ACTIONS: InsightAction[] = [
  // ---------------------------------------------------------------------------
  // UNIVERSAL
  // ---------------------------------------------------------------------------
  {
    id: "clarityOfVision",
    name: "Clarity of Vision",
    description:
      "Perfect attribute reads for a focused player, bypassing perception noise entirely.",
    cost: 25,
    cooldown: 2,
    specialization: "universal",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Player might be mediocre — perfect reads on a journeyman waste IP.",
  },
  {
    id: "hiddenNature",
    name: "Hidden Nature",
    description:
      "Reveals true values for hidden attributes: injuryProneness, consistency, bigGameTemperament, and professionalism.",
    cost: 25,
    cooldown: 2,
    specialization: "universal",
    availableDuring: [
      "fullObservation",
      "investigation",
      "analysis",
      "quickInteraction",
    ],
    riskDescription:
      "Hidden traits might confirm what you already suspected — no new info.",
  },
  {
    id: "theVerdict",
    name: "The Verdict",
    description:
      "Produces a masterwork report (+30 quality) with narrative excellence.",
    cost: 20,
    cooldown: 2,
    specialization: "universal",
    availableDuring: ["fullObservation", "analysis"],
    riskDescription:
      "Report quality is great but the player might not warrant it.",
  },
  {
    id: "secondLook",
    name: "Second Look",
    description:
      "Retroactively observe an unfocused player from the session with full detail.",
    cost: 20,
    cooldown: 2,
    specialization: "universal",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Player might have had a quiet session — nothing to see.",
  },

  // ---------------------------------------------------------------------------
  // YOUTH
  // ---------------------------------------------------------------------------
  {
    id: "diamondInTheRough",
    name: "Diamond in the Rough",
    description:
      "Scans all players at the venue and identifies the highest-PA undiscovered prospect.",
    cost: 30,
    cooldown: 2,
    specialization: "youth",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Best available might still be a quality professional, not a wonderkid.",
  },
  {
    id: "generationalWhisper",
    name: "Generational Whisper",
    description:
      "Enhanced gut feeling with wonderkid-tier specificity and reliability 0.9+.",
    cost: 25,
    cooldown: 2,
    specialization: "youth",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Triggers on the highest-potential player present, but might fire on one you have already scouted.",
  },

  // ---------------------------------------------------------------------------
  // FIRST-TEAM
  // ---------------------------------------------------------------------------
  {
    id: "perfectFit",
    name: "Perfect Fit",
    description:
      "System fit analysis against club tactical requirements with specific positional grades.",
    cost: 25,
    cooldown: 2,
    specialization: "firstTeam",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Player fits the system but might have hidden character issues.",
  },
  {
    id: "pressureTest",
    name: "Pressure Test",
    description:
      "Mentally simulate a high-pressure scenario to reveal the player's true big-game temperament value.",
    cost: 25,
    cooldown: 2,
    specialization: "firstTeam",
    availableDuring: ["fullObservation"],
    riskDescription:
      "Player might already be known to handle pressure — redundant.",
  },

  // ---------------------------------------------------------------------------
  // REGIONAL
  // ---------------------------------------------------------------------------
  {
    id: "networkPulse",
    name: "Network Pulse",
    description:
      "All contacts in the region share intel simultaneously, bypassing relationship gates.",
    cost: 25,
    cooldown: 2,
    specialization: "regional",
    availableDuring: ["investigation"],
    riskDescription:
      "Intel quality depends on contact quality — a weak network yields weak intel.",
  },
  {
    id: "territoryMastery",
    name: "Territory Mastery",
    description:
      "Grants a permanent +10% confidence boost in the current sub-region.",
    cost: 30,
    cooldown: 2,
    specialization: "regional",
    availableDuring: ["quickInteraction"],
    riskDescription:
      "Sub-region might not have much talent — permanent but potentially low-value.",
  },

  // ---------------------------------------------------------------------------
  // DATA
  // ---------------------------------------------------------------------------
  {
    id: "algorithmicEpiphany",
    name: "Algorithmic Epiphany",
    description:
      "Statistical model runs at perfect accuracy for one query cycle.",
    cost: 25,
    cooldown: 2,
    specialization: "data",
    availableDuring: ["analysis"],
    riskDescription:
      "A perfect query on a thin dataset still returns limited results.",
  },
  {
    id: "marketBlindSpot",
    name: "Market Blind Spot",
    description:
      "Reveals undervalued players in a league and position combination.",
    cost: 30,
    cooldown: 2,
    specialization: "data",
    availableDuring: ["analysis"],
    riskDescription:
      "Undervalued relative to the market, not necessarily good enough for your club.",
  },
];

// =============================================================================
// ACCUMULATION CONSTANTS
// =============================================================================

/**
 * Base IP awarded per accumulation source before quality multipliers.
 * These values intentionally keep IP scarce; they are not tunable per session.
 */
export const INSIGHT_BASE_AMOUNTS: Record<
  InsightAccumulationSource["source"],
  number
> = {
  observation: 2,
  report: 3,
  hypothesisConfirmed: 5,
  hypothesisDebunked: 2,
  assignment: 3,
};

/**
 * Quality tier multipliers applied to base IP earned.
 *
 * A "poor" quality activity earns zero IP — low-effort scouting does not
 * contribute to insight accumulation. "Exceptional" work doubles the base.
 */
export const INSIGHT_QUALITY_MULTIPLIERS: Record<string, number> = {
  poor: 0,
  average: 0.8,
  good: 1.0,
  excellent: 1.4,
  exceptional: 2.0,
};

// =============================================================================
// SYSTEM CONSTANTS
// =============================================================================

/** Base IP capacity before intuition bonuses. */
export const INSIGHT_CAPACITY_BASE = 40;

/** Additional capacity granted per point of the scout's intuition stat. */
export const INSIGHT_CAPACITY_PER_INTUITION = 2;

/** Default cooldown (weeks) applied after any insight action use. */
export const INSIGHT_DEFAULT_COOLDOWN = 2;

/**
 * Fatigue points subtracted from the scout's fatigue when an insight action
 * is used, regardless of success or fizzle.
 */
export const INSIGHT_FATIGUE_COST = 8;

/**
 * Scout fatigue level at or above which a fizzle check is performed.
 * Below this threshold, insight actions always succeed.
 */
export const INSIGHT_FIZZLE_FATIGUE_THRESHOLD = 70;

/**
 * Probability (0–1) that a scout above the fatigue threshold experiences a
 * fizzle when using an insight action.
 */
export const INSIGHT_FIZZLE_CHANCE = 0.2;
