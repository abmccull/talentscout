/**
 * New Game+ / Legacy Mode engine (F19).
 *
 * Pure functions — no React imports, no side effects.
 *
 * This module:
 *  - Generates a LegacyProfile from a completed career's GameState
 *  - Defines and evaluates legacy perks
 *  - Applies selected perks to a new game configuration
 *  - Determines scenario unlocks based on cumulative career history
 */

import type {
  GameState,
  LegacyProfile,
  CompletedCareer,
  LegacyPerk,
  NewGameConfig,
  Specialization,
} from "../core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of perks a player can activate in a single New Game+ run. */
export const MAX_ACTIVE_PERKS = 3;

/** localStorage key for the cross-career legacy profile. */
export const LEGACY_PROFILE_STORAGE_KEY = "talentscout_legacy_profile";

// =============================================================================
// PERK DEFINITIONS
// =============================================================================

/**
 * All available legacy perks. Each perk has an `unlockedBy` string that
 * is checked against completed career milestones or achievement IDs.
 *
 * Unlock conditions:
 *  - "career_completed"         — any career completion
 *  - "tier_3_reached"           — reached tier 3+ in any career
 *  - "tier_4_reached"           — reached tier 4+ in any career
 *  - "tier_5_reached"           — reached tier 5
 *  - "10_discoveries"           — cumulative 10+ discoveries
 *  - "25_discoveries"           — cumulative 25+ discoveries
 *  - "3_countries_scouted"      — scouted 3+ countries in a career
 *  - "legacy_score_100"         — achieved legacy score 100+ in a career
 *  - "2_careers_completed"      — completed 2+ careers
 *  - "hit_rate_50"              — achieved 50%+ hit rate in a career
 */
export const LEGACY_PERK_DEFINITIONS: Readonly<LegacyPerk[]> = [
  {
    id: "starting_network",
    name: "Starting Network",
    description: "Begin with 2 extra contacts from your prior career's knowledge. Your network opens doors faster.",
    type: "startingContact",
    value: 2,
    unlockedBy: "career_completed",
  },
  {
    id: "reputation_head_start",
    name: "Reputation Head Start",
    description: "Your name precedes you. Start with +10 reputation from your prior career's track record.",
    type: "reputationBoost",
    value: 10,
    unlockedBy: "tier_3_reached",
  },
  {
    id: "regional_memory",
    name: "Regional Memory",
    description: "Retain 25% of regional knowledge from previous careers. You remember the lay of the land.",
    type: "knowledgeRetain",
    value: 25,
    unlockedBy: "3_countries_scouted",
  },
  {
    id: "financial_cushion",
    name: "Financial Cushion",
    description: "Start with 20% more funds. Smart career management pays dividends in your next life.",
    type: "budgetBonus",
    value: 20,
    unlockedBy: "tier_4_reached",
  },
  {
    id: "veteran_instinct",
    name: "Veteran Instinct",
    description: "Your eye for talent is sharper. Start with +2 to Player Judgment skill.",
    type: "skillBonus",
    value: 2,
    unlockedBy: "25_discoveries",
  },
  {
    id: "iron_constitution",
    name: "Iron Constitution",
    description: "Years of travel have toughened you. Start with 15 less fatigue and recover faster.",
    type: "fatigueReduction",
    value: 15,
    unlockedBy: "2_careers_completed",
  },
  {
    id: "elite_network",
    name: "Elite Network",
    description: "Begin with 4 extra contacts. Your legendary reputation attracts top-tier connections.",
    type: "startingContact",
    value: 4,
    unlockedBy: "tier_5_reached",
  },
  {
    id: "talent_magnet",
    name: "Talent Magnet",
    description: "Your reputation for accurate scouting precedes you. Start with +20 reputation.",
    type: "reputationBoost",
    value: 20,
    unlockedBy: "legacy_score_100",
  },
  {
    id: "sharp_eye",
    name: "Sharp Eye",
    description: "Your potential assessment is second to none. Start with +2 to Potential Assessment skill.",
    type: "skillBonus",
    value: 2,
    unlockedBy: "hit_rate_50",
  },
  {
    id: "deep_knowledge",
    name: "Deep Knowledge",
    description: "Retain 50% of regional knowledge. Your maps are etched in memory.",
    type: "knowledgeRetain",
    value: 50,
    unlockedBy: "legacy_score_100",
  },
] as const;

// =============================================================================
// SCENARIO UNLOCK DEFINITIONS
// =============================================================================

/**
 * Harder scenario IDs that can be unlocked via legacy profile achievements.
 * Each entry maps a scenario ID to the condition required.
 */
const SCENARIO_UNLOCK_CONDITIONS: ReadonlyArray<{
  scenarioId: string;
  condition: (profile: LegacyProfile) => boolean;
  description: string;
}> = [
  {
    scenarioId: "the_rebuild",
    condition: (p) => p.completedCareers.length >= 1,
    description: "Complete one career",
  },
  {
    scenarioId: "moneyball",
    condition: (p) => p.highestTierReached >= 3,
    description: "Reach tier 3 in any career",
  },
  {
    scenarioId: "wonderkid_hunter",
    condition: (p) => p.totalDiscoveries >= 10,
    description: "Discover 10+ players across careers",
  },
  {
    scenarioId: "the_last_season",
    condition: (p) => p.bestLegacyScore >= 60,
    description: "Achieve legacy score 60+ in a career",
  },
  {
    scenarioId: "rivalry",
    condition: (p) => p.completedCareers.length >= 2,
    description: "Complete two careers",
  },
  {
    scenarioId: "zero_to_hero",
    condition: (p) => p.highestTierReached >= 4,
    description: "Reach tier 4 in any career",
  },
];

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Generate a CompletedCareer record from a finished career's GameState.
 * Pure function — does not persist anything.
 */
export function generateCompletedCareer(state: GameState): CompletedCareer {
  const { scout, legacyScore, discoveryRecords } = state;

  const totalReports =
    Object.values(state.reports).length +
    Object.values(state.placementReports).length;

  const hitRate =
    totalReports > 0
      ? scout.successfulFinds / totalReports
      : 0;

  const seasonsPlayed =
    legacyScore.totalSeasons > 0
      ? legacyScore.totalSeasons
      : Math.max(1, state.currentSeason - 2024);

  // Determine which scenarios were completed in this career
  const completedScenarios: string[] = [];
  if (state.activeScenarioId) {
    // If there's an active scenario and we're in hall-of-fame, it was completed
    completedScenarios.push(state.activeScenarioId);
  }

  return {
    scoutName: `${scout.firstName} ${scout.lastName}`,
    finalTier: Math.max(
      legacyScore.careerHighTier,
      scout.careerTier,
    ),
    seasonsPlayed,
    totalDiscoveries: discoveryRecords.length,
    hitRate: Math.min(1, Math.max(0, hitRate)),
    specialization: scout.primarySpecialization,
    completedScenarios,
    legacyScoreTotal: legacyScore.totalScore,
    completedAt: Date.now(),
  };
}

/**
 * Generate or update a LegacyProfile from a completed career.
 * If an existing profile is provided, the new career is merged in.
 * Returns a new LegacyProfile (immutable — does not mutate input).
 */
export function generateLegacyProfile(
  state: GameState,
  existingProfile?: LegacyProfile,
): LegacyProfile {
  const completedCareer = generateCompletedCareer(state);

  const base: LegacyProfile = existingProfile
    ? { ...existingProfile }
    : {
        id: `legacy-${Date.now()}`,
        completedCareers: [],
        unlockedScenarios: [],
        legacyPerks: [],
        totalDiscoveries: 0,
        totalSeasonsPlayed: 0,
        bestHitRate: 0,
        bestLegacyScore: 0,
        highestTierReached: 0,
      };

  // Add the new career (newest first)
  const updatedCareers = [completedCareer, ...base.completedCareers];

  // Recalculate aggregate stats
  const totalDiscoveries = updatedCareers.reduce(
    (sum, c) => sum + c.totalDiscoveries,
    0,
  );
  const totalSeasonsPlayed = updatedCareers.reduce(
    (sum, c) => sum + c.seasonsPlayed,
    0,
  );
  const bestHitRate = Math.max(
    ...updatedCareers.map((c) => c.hitRate),
    0,
  );
  const bestLegacyScore = Math.max(
    ...updatedCareers.map((c) => c.legacyScoreTotal),
    0,
  );
  const highestTierReached = Math.max(
    ...updatedCareers.map((c) => c.finalTier),
    0,
  );

  // Determine newly earned perks
  const earnedPerks = evaluateUnlockedPerks({
    ...base,
    completedCareers: updatedCareers,
    totalDiscoveries,
    totalSeasonsPlayed,
    bestHitRate,
    bestLegacyScore,
    highestTierReached,
  }, state);

  // Determine newly unlocked scenarios
  const updatedProfile: LegacyProfile = {
    ...base,
    completedCareers: updatedCareers,
    totalDiscoveries,
    totalSeasonsPlayed,
    bestHitRate,
    bestLegacyScore,
    highestTierReached,
    legacyPerks: earnedPerks,
  };

  updatedProfile.unlockedScenarios = checkScenarioUnlocks(updatedProfile);

  return updatedProfile;
}

/**
 * Evaluate which legacy perks should be unlocked based on profile state.
 * Returns the full list of unlocked perks (not just newly unlocked ones).
 */
function evaluateUnlockedPerks(
  profile: LegacyProfile,
  state: GameState,
): LegacyPerk[] {
  const unlocked: LegacyPerk[] = [];

  for (const perk of LEGACY_PERK_DEFINITIONS) {
    if (isPerkConditionMet(perk.unlockedBy, profile, state)) {
      unlocked.push({ ...perk });
    }
  }

  return unlocked;
}

/**
 * Check whether a specific unlock condition is met.
 */
function isPerkConditionMet(
  condition: string,
  profile: LegacyProfile,
  state: GameState,
): boolean {
  switch (condition) {
    case "career_completed":
      return profile.completedCareers.length >= 1;
    case "tier_3_reached":
      return profile.highestTierReached >= 3;
    case "tier_4_reached":
      return profile.highestTierReached >= 4;
    case "tier_5_reached":
      return profile.highestTierReached >= 5;
    case "10_discoveries":
      return profile.totalDiscoveries >= 10;
    case "25_discoveries":
      return profile.totalDiscoveries >= 25;
    case "3_countries_scouted": {
      const countriesScouted = Object.values(state.scout.countryReputations)
        .filter((cr) => cr.reportsSubmitted > 0).length;
      // Check current career + any previous careers that had 3+ countries
      return countriesScouted >= 3 || profile.completedCareers.some(
        (c) => c.completedScenarios.includes("international_assignment"),
      );
    }
    case "legacy_score_100":
      return profile.bestLegacyScore >= 100;
    case "2_careers_completed":
      return profile.completedCareers.length >= 2;
    case "hit_rate_50":
      return profile.bestHitRate >= 0.5;
    default:
      return false;
  }
}

/**
 * Check which scenarios should be unlocked based on the legacy profile.
 * Returns the full list of unlocked scenario IDs.
 */
export function checkScenarioUnlocks(profile: LegacyProfile): string[] {
  const unlocked = new Set(profile.unlockedScenarios);

  for (const entry of SCENARIO_UNLOCK_CONDITIONS) {
    if (entry.condition(profile)) {
      unlocked.add(entry.scenarioId);
    }
  }

  return [...unlocked];
}

/**
 * Get the human-readable unlock conditions for scenarios.
 * Used by the UI to show what's needed to unlock each scenario.
 */
export function getScenarioUnlockDescriptions(): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const entry of SCENARIO_UNLOCK_CONDITIONS) {
    descriptions[entry.scenarioId] = entry.description;
  }
  return descriptions;
}

// =============================================================================
// PERK APPLICATION
// =============================================================================

/**
 * Result of applying legacy perks to a new game configuration.
 * Contains the modified config and any additional state modifications
 * that need to be applied after world generation.
 */
export interface LegacyPerkApplicationResult {
  /** Modified new game config with perk bonuses applied. */
  config: NewGameConfig;
  /** Extra reputation to add to the scout after creation. */
  reputationBonus: number;
  /** Extra contacts to generate (count). */
  extraContacts: number;
  /** Budget bonus as a percentage (0-100). Applied to starting balance. */
  budgetBonusPercent: number;
  /** Regional knowledge retention percentage (0-100). */
  knowledgeRetainPercent: number;
  /** Fatigue reduction (absolute value subtracted from starting fatigue). */
  fatigueReduction: number;
  /** Skill bonuses to apply, keyed by skill name. */
  skillBonuses: Record<string, number>;
}

/**
 * Apply selected legacy perks to a new game configuration.
 *
 * The caller passes the base config and the list of perk IDs the player
 * selected (max MAX_ACTIVE_PERKS). Returns a modified config plus
 * additional bonuses that must be applied post-world-generation.
 *
 * Pure function — does not mutate inputs.
 */
export function applyLegacyPerks(
  config: NewGameConfig,
  profile: LegacyProfile,
  selectedPerkIds: string[],
): LegacyPerkApplicationResult {
  // Clamp to max perks
  const activePerkIds = selectedPerkIds.slice(0, MAX_ACTIVE_PERKS);

  // Resolve perk objects from the profile
  const activePerks = profile.legacyPerks.filter((p) =>
    activePerkIds.includes(p.id),
  );

  // Accumulate bonuses
  let reputationBonus = 0;
  let extraContacts = 0;
  let budgetBonusPercent = 0;
  let knowledgeRetainPercent = 0;
  let fatigueReduction = 0;
  const skillBonuses: Record<string, number> = {};

  for (const perk of activePerks) {
    switch (perk.type) {
      case "startingContact":
        extraContacts += perk.value;
        break;
      case "reputationBoost":
        reputationBonus += perk.value;
        break;
      case "skillBonus":
        // Map perk IDs to specific skills
        if (perk.id === "veteran_instinct") {
          skillBonuses["playerJudgment"] =
            (skillBonuses["playerJudgment"] ?? 0) + perk.value;
        } else if (perk.id === "sharp_eye") {
          skillBonuses["potentialAssessment"] =
            (skillBonuses["potentialAssessment"] ?? 0) + perk.value;
        }
        break;
      case "budgetBonus":
        budgetBonusPercent += perk.value;
        break;
      case "knowledgeRetain":
        knowledgeRetainPercent = Math.max(knowledgeRetainPercent, perk.value);
        break;
      case "fatigueReduction":
        fatigueReduction += perk.value;
        break;
    }
  }

  // Build skill allocations with bonuses
  const newSkillAllocations = { ...config.skillAllocations };
  for (const [skill, bonus] of Object.entries(skillBonuses)) {
    const current = newSkillAllocations[skill as keyof typeof newSkillAllocations] ?? 0;
    newSkillAllocations[skill as keyof typeof newSkillAllocations] = current + bonus;
  }

  return {
    config: {
      ...config,
      skillAllocations:
        Object.keys(newSkillAllocations).length > 0
          ? newSkillAllocations
          : config.skillAllocations,
    },
    reputationBonus,
    extraContacts,
    budgetBonusPercent,
    knowledgeRetainPercent,
    fatigueReduction,
    skillBonuses,
  };
}

// =============================================================================
// PERSISTENCE HELPERS
// =============================================================================

/**
 * Read the legacy profile from localStorage.
 * Returns undefined if no profile exists or parsing fails.
 */
export function readLegacyProfile(): LegacyProfile | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    // Basic shape validation
    const profile = parsed as LegacyProfile;
    if (!profile.id || !Array.isArray(profile.completedCareers)) return undefined;
    return profile;
  } catch {
    return undefined;
  }
}

/**
 * Write the legacy profile to localStorage.
 * Silently fails if localStorage is unavailable.
 */
export function writeLegacyProfile(profile: LegacyProfile): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get a summary of available perks for display in the New Game+ UI.
 * Returns perks with their locked/unlocked status.
 */
export function getAvailablePerks(
  profile: LegacyProfile | undefined,
): Array<LegacyPerk & { isUnlocked: boolean }> {
  if (!profile) {
    return LEGACY_PERK_DEFINITIONS.map((p) => ({
      ...p,
      isUnlocked: false,
    }));
  }

  const unlockedIds = new Set(profile.legacyPerks.map((p) => p.id));

  return LEGACY_PERK_DEFINITIONS.map((p) => ({
    ...p,
    isUnlocked: unlockedIds.has(p.id),
  }));
}

/**
 * Get a list of all specializations used across completed careers.
 * Useful for UI display in career history.
 */
export function getUsedSpecializations(
  profile: LegacyProfile,
): Specialization[] {
  const specs = new Set<Specialization>();
  for (const career of profile.completedCareers) {
    specs.add(career.specialization);
  }
  return [...specs];
}

/**
 * Check if a legacy profile has any completed careers (i.e., New Game+ is available).
 */
export function hasCompletedCareer(profile: LegacyProfile | undefined): boolean {
  return profile !== undefined && profile.completedCareers.length > 0;
}
