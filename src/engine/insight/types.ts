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

import type {
  HiddenIntel,
  InsightPersistedEffects as CoreInsightPersistedEffects,
  InsightState as CoreInsightState,
  InsightUseRecord as CoreInsightUseRecord,
  PendingInsightQueryAccuracyEffect as CorePendingInsightQueryAccuracyEffect,
  PendingInsightReportQualityEffect as CorePendingInsightReportQualityEffect,
  Specialization,
} from "@/engine/core/types";
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
export type PendingInsightReportQualityEffect = CorePendingInsightReportQualityEffect;
export type PendingInsightQueryAccuracyEffect = CorePendingInsightQueryAccuracyEffect;
export type InsightPersistedEffects = CoreInsightPersistedEffects;

/** Canonical alias to the core Insight state contract. */
export type InsightState = CoreInsightState;

export function createEmptyInsightPersistedEffects(): InsightPersistedEffects {
  return {
    pendingReportQuality: [],
    pendingQueryAccuracy: [],
  };
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
export interface InsightUseRecord extends Omit<CoreInsightUseRecord, "actionId"> {
  actionId: InsightActionId;
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
 * | observations         | clarityOfVision, hiddenNature, secondLook, diamondInTheRough, pressureTest |
 * | revealedAttributes   | legacy exact hiddenNature payloads |
 * | discoveredPlayerId   | secondLook, diamondInTheRough      |
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
  /** Authoritative insight readings persisted with confidence and bounded ranges. */
  observations?: Array<{
    playerId: string;
    attribute: string;
    trueValue: number;
    /** Confidence to persist on the authoritative observation record. */
    confidence?: number;
  }>;

  // --- hiddenNature ---
  /** Legacy exact hidden-attribute payloads. Prefer `observations` for new effects. */
  revealedAttributes?: Array<{
    playerId: string;
    attribute: string;
    value: number;
  }>;

  // --- diamondInTheRough ---
  /** ID of the lead surfaced by the action's deterministic evidence ranking. */
  discoveredPlayerId?: string;

  // --- theVerdict ---
  /** Bounded craft bonus applied to the next matching report submission. */
  reportQualityBonus?: number;

  // --- perfectFit ---
  /** Positional and role grades for how the player fits the club's system. */
  systemFitData?: Record<string, number>;

  // --- networkPulse ---
  /** Structured contact evidence shared while bypassing relationship gates. */
  contactIntel?: HiddenIntel[];

  // --- territoryMastery ---
  /** Percentage boost permanently added to confidence in the current sub-region. */
  confidenceBonus?: number;

  // --- algorithmicEpiphany ---
  /** Accuracy multiplier applied to the statistical query for this cycle. */
  queryAccuracyBonus?: number;

  /** League whose data was in scope for this action, when resolvable. */
  leagueId?: string;

  // --- marketBlindSpot ---
  /** Player IDs identified as undervalued in the queried league/position. */
  undervaluedPlayers?: string[];

  // --- generationalWhisper ---
  /** Structured instinct persisted into the scout's gut-feeling journal. */
  wonderkidSignal?: {
    playerId: string;
    perceivedTier: "generational" | "worldClass" | "qualityPro" | "journeyman";
    reliability: number;
  };
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
      "Narrows hidden-trait reads into bounded observations and concrete follow-up guidance.",
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
      "A thin sample can still leave the character picture unresolved.",
  },
  {
    id: "theVerdict",
    name: "The Verdict",
    description:
      "Sharpens the next report with bounded, evidence-dependent craft support.",
    cost: 20,
    cooldown: 2,
    specialization: "universal",
    availableDuring: ["fullObservation", "analysis"],
    riskDescription:
      "Thin evidence still limits how much the write-up can improve.",
  },
  {
    id: "secondLook",
    name: "Second Look",
    description:
      "Recovers an overlooked player as a bounded follow-up lead from visible moments.",
    cost: 20,
    cooldown: 2,
    specialization: "universal",
    availableDuring: ["fullObservation"],
    riskDescription:
      "The peripheral lead might stay ambiguous if the original sample was quiet.",
  },

  // ---------------------------------------------------------------------------
  // YOUTH
  // ---------------------------------------------------------------------------
  {
    id: "diamondInTheRough",
    name: "Diamond in the Rough",
    description:
      "Surfaces an overlooked lead from visible session evidence without guaranteeing best hidden upside.",
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
      "Produces a deterministic upside signal with bounded reliability and no hidden-PA certainty.",
    cost: 25,
    cooldown: 2,
    specialization: "youth",
    availableDuring: ["fullObservation"],
    riskDescription:
      "A strong instinct can still point at a player who needs more proof.",
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
      "Narrows the player's pressure response into bounded reads plus a next-test plan.",
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
