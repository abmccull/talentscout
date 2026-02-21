/**
 * Unlockable tools system for the TalentScout game engine.
 *
 * Tools are persistent upgrades the scout acquires as their career progresses.
 * Unlike specialization perks (which reward depth in one domain), tools reward
 * overall career milestones — tier promotions, reputation thresholds, skill
 * investments, and sustained report output.
 *
 * All unlock checks are deterministic: no RNG is involved.
 * All functions are pure: they take values in, return values out, never mutate.
 */

import type { Scout, ScoutSkill, ScoutAttribute, ToolId } from "@/engine/core/types";

// =============================================================================
// TYPES
// =============================================================================

export interface ToolRequirement {
  /** Minimum career tier the scout must have reached. */
  minTier?: number;
  /** Minimum global reputation (0–100). */
  minReputation?: number;
  /**
   * Minimum level in a specific scout skill or personal attribute.
   * `ScoutSkill` covers the five scouting skills; `ScoutAttribute` covers the
   * six personal attributes (e.g. networking, endurance).
   */
  minSkillLevel?: { skill: ScoutSkill | ScoutAttribute; level: number };
  /** Minimum lifetime reports submitted. */
  minReportsSubmitted?: number;
  /** Minimum seasons played (derived from seasonsPlayed on Scout). */
  minSeasonsPlayed?: number;
}

export interface UnlockableTool {
  id: ToolId;
  name: string;
  description: string;
  /** Human-readable summary of what the scout gains from this tool. */
  bonus: string;
  /** Declarative unlock conditions — all conditions must be satisfied. */
  requirements: ToolRequirement;
}

/**
 * Passive numerical bonuses conferred by a single tool.
 * Values are additive across multiple unlocked tools.
 * All fields are optional — undefined means "no effect in this category".
 */
export interface ToolPassiveBonus {
  /** Flat fatigue reduction per report-writing activity (e.g. -1). */
  fatigueReduction?: number;
  /** Fractional accuracy bonus added to data-based readings (e.g. 0.10 = +10 %). */
  accuracyBonus?: number;
  /** Fractional confidence bonus added to video-analysis observations (e.g. 0.05 = +5 %). */
  confidenceBonus?: number;
  /** Fractional bonus applied to relationship gains from network meetings (e.g. 0.05 = +5 %). */
  relationshipGainBonus?: number;
  /** Fractional reduction applied to fatigue gained from travel activities (e.g. 0.20 = -20 %). */
  travelFatigueReduction?: number;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * All nine unlockable tools with their metadata and requirements.
 *
 * Requirements are intentionally declarative so the UI can display locked
 * tools with progress indicators without needing to call unlock functions.
 */
export const TOOL_DEFINITIONS: UnlockableTool[] = [
  // --------------------------------------------------------------------------
  // Tier 2 tools — early career upgrades
  // --------------------------------------------------------------------------
  {
    id: "videoEditor",
    name: "Video Editor Suite",
    description:
      "Professional video editing software that allows frame-by-frame breakdown of match footage, clip tagging, and side-by-side player comparison. Extracts significantly more signal per viewing session than a standard tape review.",
    bonus: "Enhanced video analysis — +5 % confidence on all video observations.",
    requirements: {
      minTier: 2,
      minReputation: 20,
    },
  },
  {
    id: "dataSubscription",
    name: "Statistical Data Subscription",
    description:
      "A premium subscription to a league-wide statistical database, providing per-90 metrics, shot-quality models, and pressing intensity data across all covered competitions. Adds a quantitative layer to every observation.",
    bonus:
      "Access to statistical databases — +10 % accuracy on data-derived attribute readings.",
    requirements: {
      minTier: 2,
      minSkillLevel: { skill: "dataLiteracy", level: 8 },
    },
  },
  {
    id: "contactManager",
    name: "Contact Manager",
    description:
      "A structured CRM tool designed for scouts — log interactions, set follow-up reminders, track information reliability by contact, and surface warm leads automatically. Turns a sprawling network into an organised asset.",
    bonus:
      "Track contacts systematically — +5 % relationship gain from every network meeting.",
    requirements: {
      minTier: 2,
      minSkillLevel: { skill: "networking", level: 8 },
    },
  },
  {
    id: "reportTemplates",
    name: "Report Template Library",
    description:
      "A curated library of pre-built report structures covering every position and context — youth prospect, ready-now signing, loan target, budget option. Dramatically reduces the time and mental energy required to compile a thorough report.",
    bonus:
      "Pre-built templates — reduces fatigue cost of report-writing activities by 1.",
    requirements: {
      minTier: 2,
      minReportsSubmitted: 10,
    },
  },

  // --------------------------------------------------------------------------
  // Tier 3 tools — established professional upgrades
  // --------------------------------------------------------------------------
  {
    id: "scoutingApp",
    name: "Mobile Scouting App",
    description:
      "A purpose-built mobile application for live scouting: real-time note capture, voice-to-text dictation, instant schedule management, and cloud sync across devices. Removes the friction between watching a match and organising the output.",
    bonus:
      "Streamlined mobile workflow — schedule activities faster with reduced overhead.",
    requirements: {
      minTier: 3,
      minReportsSubmitted: 20,
    },
  },
  {
    id: "travelPlanner",
    name: "Intelligent Travel Planner",
    description:
      "An optimised travel coordination tool that clusters fixtures geographically, books efficient routes, and provides pre-trip briefings on local conditions and logistics. Cuts the exhausting overhead of frequent travel.",
    bonus:
      "Optimised routing and logistics — reduces fatigue gained from travel activities by 20 %.",
    requirements: {
      minTier: 3,
      minReputation: 40,
    },
  },
  {
    id: "youthDatabase",
    name: "Youth Player Database",
    description:
      "A comprehensive repository of youth player profiles aggregated from academy registers, youth tournaments, and national team squads across covered countries. Makes systematic wonderkid hunting viable at scale.",
    bonus:
      "Comprehensive youth registry access — find emerging talent faster and earlier.",
    requirements: {
      minTier: 3,
      minReputation: 30,
    },
  },
  {
    id: "performanceTracker",
    name: "Player Performance Tracker",
    description:
      "A longitudinal tracking system that records and visualises a player's attribute evolution across your observation sessions over multiple seasons. Reveals development trends — acceleration, plateau, or decline — that single observations cannot.",
    bonus:
      "Multi-season trend visualisation — identify development trajectories across observations.",
    requirements: {
      minTier: 3,
      minSkillLevel: { skill: "dataLiteracy", level: 10 },
    },
  },

  // --------------------------------------------------------------------------
  // Tier 4 tools — senior professional upgrade
  // --------------------------------------------------------------------------
  {
    id: "networkAnalyzer",
    name: "Network Analyser",
    description:
      "An advanced contact-network visualisation tool that maps second- and third-degree connections, highlights high-value bridge contacts, and surfaces introduction opportunities within your existing network. Transforms a strong network into a structured intelligence asset.",
    bonus:
      "Network graph visualisation — +10 % quality gain from every network meeting.",
    requirements: {
      minTier: 4,
      minSkillLevel: { skill: "networking", level: 12 },
    },
  },
];

// =============================================================================
// UNLOCK CHECKING
// =============================================================================

/**
 * Determine which tools have just become available to the scout.
 *
 * Compares every tool's requirements against the scout's current state and
 * returns only the tool IDs that are NOW satisfied but were NOT already in
 * `currentTools`.  Call this after any state change that could trigger an
 * unlock (tier promotion, skill level-up, reputation increase, new report).
 *
 * Pure function — does not mutate scout or currentTools.
 */
export function checkToolUnlocks(
  scout: Scout,
  currentTools: ToolId[]
): ToolId[] {
  const newlyUnlocked: ToolId[] = [];

  for (const tool of TOOL_DEFINITIONS) {
    // Skip tools the scout already has.
    if (currentTools.includes(tool.id)) {
      continue;
    }

    if (meetsRequirements(scout, tool.requirements)) {
      newlyUnlocked.push(tool.id);
    }
  }

  return newlyUnlocked;
}

/**
 * Check all declarative requirements for a single tool against the scout's
 * current state.  Every specified condition must be satisfied.
 *
 * Pure helper — not exported as part of the public API.
 */
function meetsRequirements(scout: Scout, req: ToolRequirement): boolean {
  if (req.minTier !== undefined && scout.careerTier < req.minTier) {
    return false;
  }

  if (req.minReputation !== undefined && scout.reputation < req.minReputation) {
    return false;
  }

  if (req.minSkillLevel !== undefined) {
    const { skill, level } = req.minSkillLevel;
    // The required stat may be a ScoutSkill (in scout.skills) or a
    // ScoutAttribute (in scout.attributes).  Check both maps; one will return
    // a number and the other undefined.
    const skillValue =
      (scout.skills as Partial<Record<string, number>>)[skill] ??
      (scout.attributes as Partial<Record<string, number>>)[skill];
    if (skillValue === undefined || skillValue < level) {
      return false;
    }
  }

  if (
    req.minReportsSubmitted !== undefined &&
    scout.reportsSubmitted < req.minReportsSubmitted
  ) {
    return false;
  }

  if (req.minSeasonsPlayed !== undefined) {
    // Seasons played is not a direct Scout field; derive it from the scout's
    // attributes if the caller has stored it, otherwise treat as unsatisfied.
    // GameState callers should pass a scout whose seasonsPlayed has been set.
    // For now we check a duck-typed extension field if present.
    const seasonsPlayed = (scout as Scout & { seasonsPlayed?: number })
      .seasonsPlayed;
    if (seasonsPlayed === undefined || seasonsPlayed < req.minSeasonsPlayed) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// PASSIVE BONUS LOOKUP
// =============================================================================

/**
 * Indexed passive bonus values for each tool.
 * Kept as a constant object so `getToolPassiveBonus` is an O(1) lookup.
 */
const TOOL_PASSIVE_BONUSES: Record<ToolId, ToolPassiveBonus> = {
  videoEditor: {
    confidenceBonus: 0.05,
  },
  dataSubscription: {
    accuracyBonus: 0.1,
  },
  scoutingApp: {
    // Scheduling benefit is systemic (faster activity slot allocation).
    // No single numeric bonus — handled by the activity scheduling layer.
  },
  travelPlanner: {
    travelFatigueReduction: 0.2,
  },
  contactManager: {
    relationshipGainBonus: 0.05,
  },
  reportTemplates: {
    fatigueReduction: 1,
  },
  youthDatabase: {
    // Discovery benefit is systemic (youth player visibility).
    // No single numeric bonus — handled by player-discovery logic.
  },
  performanceTracker: {
    // Trend-tracking benefit is systemic (observation history UI).
    // No single numeric bonus — handled by observation aggregation.
  },
  networkAnalyzer: {
    relationshipGainBonus: 0.1,
  },
};

/**
 * Return the passive bonus values for a single tool.
 *
 * Tools that provide only systemic (non-numeric) benefits return an empty
 * object rather than undefined, so callers can always safely destructure.
 *
 * Pure function.
 */
export function getToolPassiveBonus(toolId: ToolId): ToolPassiveBonus {
  return TOOL_PASSIVE_BONUSES[toolId];
}

/**
 * Aggregate all passive bonuses from the scout's unlocked tools into one
 * combined `ToolPassiveBonus` struct.
 *
 * Numeric fields are summed.  Undefined contributions are treated as zero and
 * do not appear in the output if no tool contributes to that category.
 *
 * Pure function — does not mutate its input.
 */
export function getActiveToolBonuses(
  unlockedTools: ToolId[]
): ToolPassiveBonus {
  let fatigueReduction: number | undefined;
  let accuracyBonus: number | undefined;
  let confidenceBonus: number | undefined;
  let relationshipGainBonus: number | undefined;
  let travelFatigueReduction: number | undefined;

  for (const toolId of unlockedTools) {
    const bonus = TOOL_PASSIVE_BONUSES[toolId];

    if (bonus.fatigueReduction !== undefined) {
      fatigueReduction = (fatigueReduction ?? 0) + bonus.fatigueReduction;
    }
    if (bonus.accuracyBonus !== undefined) {
      accuracyBonus = (accuracyBonus ?? 0) + bonus.accuracyBonus;
    }
    if (bonus.confidenceBonus !== undefined) {
      confidenceBonus = (confidenceBonus ?? 0) + bonus.confidenceBonus;
    }
    if (bonus.relationshipGainBonus !== undefined) {
      relationshipGainBonus =
        (relationshipGainBonus ?? 0) + bonus.relationshipGainBonus;
    }
    if (bonus.travelFatigueReduction !== undefined) {
      travelFatigueReduction =
        (travelFatigueReduction ?? 0) + bonus.travelFatigueReduction;
    }
  }

  // Build the result object with only the categories that have contributions.
  const result: ToolPassiveBonus = {};
  if (fatigueReduction !== undefined) result.fatigueReduction = fatigueReduction;
  if (accuracyBonus !== undefined) result.accuracyBonus = accuracyBonus;
  if (confidenceBonus !== undefined) result.confidenceBonus = confidenceBonus;
  if (relationshipGainBonus !== undefined)
    result.relationshipGainBonus = relationshipGainBonus;
  if (travelFatigueReduction !== undefined)
    result.travelFatigueReduction = travelFatigueReduction;

  return result;
}

// =============================================================================
// DEFINITION LOOKUP
// =============================================================================

/**
 * Return the full UnlockableTool definition for a given ID, or undefined if
 * the ID is not in TOOL_DEFINITIONS (should never happen with a valid ToolId).
 *
 * Pure function.
 */
export function getToolDefinition(toolId: ToolId): UnlockableTool | undefined {
  return TOOL_DEFINITIONS.find((t) => t.id === toolId);
}
