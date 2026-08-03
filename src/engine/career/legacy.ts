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
  CompletedCareerLegacyEvidence,
  LegacyEntitlementMigrationEvidence,
  LegacyPerk,
  NewGameConfig,
  Specialization,
} from "../core/types";
import { stableFingerprint } from "../run/runManifest";
import { SCENARIOS } from "../scenarios";
import { selectLatestReportsByCase } from "../reports/reportAccountability";
import {
  deriveCareerSignature,
  sanitizeCareerFinalChapter,
  sanitizeCareerSignature,
} from "./legacySignature";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of perks a player can activate in a single New Game+ run. */
export const MAX_ACTIVE_PERKS = 3;

/** localStorage key for the cross-career legacy profile. */
export const LEGACY_PROFILE_STORAGE_KEY = "talentscout_legacy_profile";
/** Durable save marker for a player-chosen career ending. */
export const VOLUNTARY_RETIREMENT_MARKER = "career_retired_voluntarily";
const COMPLETED_CAREER_LEGACY_EVIDENCE_VERSION = 1 as const;
const LEGACY_ENTITLEMENT_SCHEMA_VERSION = 1 as const;
const LEGACY_ENTITLEMENT_MIGRATION_VERSION = 1 as const;
const MAX_ARCHIVED_SCOUTED_COUNTRIES = 64;

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

const LEGACY_PERK_DEFINITION_BY_ID = new Map(
  LEGACY_PERK_DEFINITIONS.map((perk) => [perk.id, perk] as const),
);

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

const LAUNCHABLE_ADVANCED_SCENARIO_IDS = new Set(
  SCENARIOS
    .filter((scenario) => scenario.category === "advanced")
    .map((scenario) => scenario.id),
);

/**
 * Older scenario saves used calendar years for `currentSeason`.
 * Normalize both formats to a Season 1-based ordinal for display and legacy rollups.
 */
const LEGACY_CALENDAR_YEAR_ONE = 2024;

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Convert the stored season marker into a 1-based season count.
 * Keeps older year-based saves compatible without treating 2024 as season zero.
 */
export function getCareerSeasonOrdinal(currentSeason: number): number {
  const normalizedSeason = Number.isFinite(currentSeason)
    ? Math.trunc(currentSeason)
    : 1;

  if (normalizedSeason >= LEGACY_CALENDAR_YEAR_ONE) {
    return Math.max(1, normalizedSeason - LEGACY_CALENDAR_YEAR_ONE + 1);
  }

  return Math.max(1, normalizedSeason);
}

/**
 * Conservative terminal-state check for legacy completion.
 * Today the only durable end-of-career marker in GameState is completing
 * the retirement scenario.
 */
export function hasRepresentedCareerCompletionState(state: GameState): boolean {
  const completionMarkers = state.completedScenarioIds ?? [];
  return (
    completionMarkers.includes("the_last_season") ||
    completionMarkers.includes(VOLUNTARY_RETIREMENT_MARKER)
  );
}

/**
 * Voluntary retirement becomes available after at least one completed season.
 * This prevents zero-week New Game+ farming while giving every clean career a
 * legal, non-scenario route to a durable ending.
 */
export function canVoluntarilyRetire(state: GameState): boolean {
  if (hasRepresentedCareerCompletionState(state)) return false;
  return (
    state.legacyScore.totalSeasons >= 1 ||
    getCareerSeasonOrdinal(state.currentSeason) >= 2
  );
}

/** Mark a career complete without mutating the input or inventing a scenario. */
export function markCareerVoluntarilyRetired(
  state: GameState,
): GameState | null {
  if (!canVoluntarilyRetire(state)) return null;
  return {
    ...state,
    completedScenarioIds: [
      ...(state.completedScenarioIds ?? []),
      VOLUNTARY_RETIREMENT_MARKER,
    ],
  };
}

function areCompletedCareersEquivalent(
  left: CompletedCareer,
  right: CompletedCareer,
): boolean {
  if (
    left.scoutName !== right.scoutName ||
    left.finalTier !== right.finalTier ||
    left.seasonsPlayed !== right.seasonsPlayed ||
    left.totalDiscoveries !== right.totalDiscoveries ||
    left.specialization !== right.specialization ||
    left.legacyScoreTotal !== right.legacyScoreTotal ||
    Math.abs(left.hitRate - right.hitRate) > 1e-9
  ) {
    return false;
  }

  if (
    left.signature
    && right.signature
    && left.signature.id !== right.signature.id
  ) {
    return false;
  }
  if (
    left.finalChapter
    && right.finalChapter
    && left.finalChapter.summary !== right.finalChapter.summary
  ) {
    return false;
  }

  const leftScenarios = [...left.completedScenarios].sort();
  const rightScenarios = [...right.completedScenarios].sort();

  return (
    leftScenarios.length === rightScenarios.length &&
    leftScenarios.every((scenarioId, index) => scenarioId === rightScenarios[index])
  );
}

/**
 * Generate a CompletedCareer record from a finished career's GameState.
 * Pure function — does not persist anything.
 */
export function generateCompletedCareer(state: GameState): CompletedCareer {
  const { scout, legacyScore, discoveryRecords } = state;
  const { signature, finalChapter } = deriveCareerSignature(state);

  const totalReports =
    selectLatestReportsByCase(Object.values(state.reports)).length +
    Object.values(state.placementReports).length;

  const hitRate =
    totalReports > 0
      ? scout.successfulFinds / totalReports
      : 0;

  const seasonsPlayed =
    legacyScore.totalSeasons > 0
      ? legacyScore.totalSeasons
      : getCareerSeasonOrdinal(state.currentSeason);

  const completedScenarios = [...(state.completedScenarioIds ?? [])];
  const scoutedCountryIds = Object.entries(state.scout.countryReputations ?? {})
    .filter(([, reputation]) => reputation.reportsSubmitted > 0)
    .map(([countryId, reputation]) => reputation.country || countryId)
    .filter((countryId, index, all) => countryId.length > 0 && all.indexOf(countryId) === index)
    .sort()
    .slice(0, MAX_ARCHIVED_SCOUTED_COUNTRIES);

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
    legacyEvidence: {
      version: COMPLETED_CAREER_LEGACY_EVIDENCE_VERSION,
      scoutedCountryIds,
    },
    signature,
    finalChapter,
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
  const latestCompletedCareer = existingProfile?.completedCareers[0];

  if (
    latestCompletedCareer &&
    areCompletedCareersEquivalent(completedCareer, latestCompletedCareer)
  ) {
    const verifiedLatestSignature = sanitizeCareerSignature(latestCompletedCareer.signature);
    const sanitizedLatestFinalChapter = sanitizeCareerFinalChapter(latestCompletedCareer.finalChapter);
    const sanitizedLatestLegacyEvidence = sanitizeCompletedCareerLegacyEvidence(
      latestCompletedCareer.legacyEvidence,
    );
    if (
      !verifiedLatestSignature
      || !sanitizedLatestFinalChapter
      || !sanitizedLatestLegacyEvidence
    ) {
      return {
        ...existingProfile,
        entitlementSchemaVersion: LEGACY_ENTITLEMENT_SCHEMA_VERSION,
        completedCareers: [
          {
            ...latestCompletedCareer,
            signature: verifiedLatestSignature ?? completedCareer.signature,
            finalChapter: sanitizedLatestFinalChapter ?? completedCareer.finalChapter,
            legacyEvidence: sanitizedLatestLegacyEvidence ?? completedCareer.legacyEvidence,
          },
          ...existingProfile.completedCareers.slice(1),
        ],
      };
    }
    return {
      ...existingProfile,
      entitlementSchemaVersion: LEGACY_ENTITLEMENT_SCHEMA_VERSION,
    };
  }

  const base: LegacyProfile = existingProfile
    ? { ...existingProfile }
    : {
        id: `legacy-${Date.now()}`,
        entitlementSchemaVersion: LEGACY_ENTITLEMENT_SCHEMA_VERSION,
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
  });

  // Determine newly unlocked scenarios
  const updatedProfile: LegacyProfile = {
    ...base,
    entitlementSchemaVersion: LEGACY_ENTITLEMENT_SCHEMA_VERSION,
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
): LegacyPerk[] {
  const unlocked: LegacyPerk[] = [];

  for (const perk of LEGACY_PERK_DEFINITIONS) {
    if (isPerkConditionMet(perk.unlockedBy, profile)) {
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
    case "3_countries_scouted":
      return profile.completedCareers.some((career) =>
        (career.legacyEvidence?.scoutedCountryIds.length ?? 0) >= 3
        // Profiles predating legacyEvidence can still prove this milestone
        // through the historical scenario that originally granted it.
        || career.completedScenarios.includes("international_assignment")
      ) || profile.entitlementMigrationEvidence?.grandfatheredPerkIds
        .includes("regional_memory") === true;
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
  // Stored IDs are display/cache data only. Re-earn every scenario from the
  // completed-career aggregates so adding an ID to localStorage grants nothing.
  const unlocked = new Set<string>();

  for (const entry of SCENARIO_UNLOCK_CONDITIONS) {
    if (!LAUNCHABLE_ADVANCED_SCENARIO_IDS.has(entry.scenarioId)) continue;
    if (entry.condition(profile)) {
      unlocked.add(entry.scenarioId);
    }
  }

  return SCENARIOS
    .filter(
      (scenario) =>
        scenario.category === "advanced" && unlocked.has(scenario.id),
    )
    .map((scenario) => scenario.id);
}

/**
 * Get the human-readable unlock conditions for scenarios.
 * Used by the UI to show what's needed to unlock each scenario.
 */
export function getScenarioUnlockDescriptions(): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const entry of SCENARIO_UNLOCK_CONDITIONS) {
    if (!LAUNCHABLE_ADVANCED_SCENARIO_IDS.has(entry.scenarioId)) continue;
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
  // localStorage is never an entitlement or mechanical authority. Re-earn
  // unlocks from sanitized career evidence, then resolve every selected ID
  // through immutable definitions so stored fields cannot grant/amplify effects.
  const unlockedPerkIds = new Set<string>();
  const storedPerks = sanitizeLegacyProfile(profile)?.legacyPerks;
  if (Array.isArray(storedPerks)) {
    for (const storedPerk of storedPerks) {
      if (
        storedPerk
        && typeof storedPerk === "object"
        && typeof storedPerk.id === "string"
        && LEGACY_PERK_DEFINITION_BY_ID.has(storedPerk.id)
      ) {
        unlockedPerkIds.add(storedPerk.id);
      }
    }
  }

  const activePerks: LegacyPerk[] = [];
  const seenSelectedIds = new Set<string>();
  if (Array.isArray(selectedPerkIds)) {
    for (const selectedPerkId of selectedPerkIds) {
      if (
        typeof selectedPerkId !== "string"
        || seenSelectedIds.has(selectedPerkId)
        || !unlockedPerkIds.has(selectedPerkId)
      ) {
        continue;
      }
      const definition = LEGACY_PERK_DEFINITION_BY_ID.get(selectedPerkId);
      if (!definition) continue;
      seenSelectedIds.add(selectedPerkId);
      activePerks.push({ ...definition });
      if (activePerks.length >= MAX_ACTIVE_PERKS) break;
    }
  }

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

  return {
    // Skill perks are applied to the generated scout by startNewGamePlus.
    // Keeping the player's eight creation points unchanged avoids both
    // double-applying the perk and invalidating the creation-point contract.
    config: {
      ...config,
      legacyUnlockIds: [
        ...(config.legacyUnlockIds ?? []),
        ...activePerks.map((perk) => `legacy-perk:${perk.id}`),
      ].filter((id, index, all) => all.indexOf(id) === index),
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

const MAX_LEGACY_PROFILE_STORAGE_CHARS = 1_000_000;
const MAX_COMPLETED_CAREERS = 128;
const MAX_COMPLETED_SCENARIOS_PER_CAREER = 128;
const MAX_PROFILE_SCENARIO_UNLOCKS = 64;
const MAX_PROFILE_PERK_ENTITLEMENTS = LEGACY_PERK_DEFINITIONS.length * 2;
const MAX_PROFILE_ID_LENGTH = 160;
const MAX_SCOUT_NAME_LENGTH = 120;
const MAX_SCENARIO_ID_LENGTH = 96;
const SPECIALIZATIONS = new Set<Specialization>([
  "youth",
  "firstTeam",
  "regional",
  "data",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeText(
  value: unknown,
  maxLength: number,
  identifierOnly = false,
): string | undefined {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || value.trim().length === 0
    || /[\u0000-\u001f\u007f]/.test(value)
    || (identifierOnly && !/^[A-Za-z0-9_.:-]+$/.test(value))
  ) {
    return undefined;
  }
  return value;
}

function sanitizeNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
    || (integer && !Number.isInteger(value))
  ) {
    return undefined;
  }
  return value;
}

function sanitizeIdentifierArray(
  value: unknown,
  maxItems: number,
  allow?: ReadonlySet<string>,
): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const sanitized: string[] = [];
  for (const candidate of value) {
    const identifier = sanitizeText(candidate, MAX_SCENARIO_ID_LENGTH, true);
    if (!identifier) return undefined;
    if (allow && !allow.has(identifier)) continue;
    if (!sanitized.includes(identifier)) sanitized.push(identifier);
  }
  return sanitized;
}

function sanitizeCompletedCareerLegacyEvidence(
  value: unknown,
): CompletedCareerLegacyEvidence | undefined {
  if (
    !isRecord(value)
    || value.version !== COMPLETED_CAREER_LEGACY_EVIDENCE_VERSION
    || !Array.isArray(value.scoutedCountryIds)
    || value.scoutedCountryIds.length > MAX_ARCHIVED_SCOUTED_COUNTRIES
  ) {
    return undefined;
  }
  const scoutedCountryIds: string[] = [];
  for (const candidate of value.scoutedCountryIds) {
    const countryId = sanitizeText(candidate, MAX_SCENARIO_ID_LENGTH, true);
    if (!countryId || scoutedCountryIds.includes(countryId)) return undefined;
    scoutedCountryIds.push(countryId);
  }
  return {
    version: COMPLETED_CAREER_LEGACY_EVIDENCE_VERSION,
    scoutedCountryIds,
  };
}

function sanitizeCompletedCareer(value: unknown): CompletedCareer | undefined {
  if (!isRecord(value)) return undefined;
  const scoutName = sanitizeText(value.scoutName, MAX_SCOUT_NAME_LENGTH);
  const finalTier = sanitizeNumber(value.finalTier, 1, 5, true);
  const seasonsPlayed = sanitizeNumber(value.seasonsPlayed, 1, 10_000, true);
  const totalDiscoveries = sanitizeNumber(value.totalDiscoveries, 0, 10_000_000, true);
  const hitRate = sanitizeNumber(value.hitRate, 0, 1);
  const specialization = value.specialization;
  const completedScenarios = sanitizeIdentifierArray(
    value.completedScenarios,
    MAX_COMPLETED_SCENARIOS_PER_CAREER,
  );
  const legacyScoreTotal = sanitizeNumber(value.legacyScoreTotal, -1_000_000_000, 1_000_000_000);
  const completedAt = sanitizeNumber(value.completedAt, 0, Number.MAX_SAFE_INTEGER, true);
  if (
    !scoutName
    || finalTier === undefined
    || seasonsPlayed === undefined
    || totalDiscoveries === undefined
    || hitRate === undefined
    || typeof specialization !== "string"
    || !SPECIALIZATIONS.has(specialization as Specialization)
    || !completedScenarios
    || legacyScoreTotal === undefined
    || completedAt === undefined
  ) {
    return undefined;
  }

  const signature = value.signature === undefined
    ? undefined
    : sanitizeCareerSignature(value.signature);
  const finalChapter = value.finalChapter === undefined
    ? undefined
    : sanitizeCareerFinalChapter(value.finalChapter);
  const legacyEvidence = value.legacyEvidence === undefined
    ? undefined
    : sanitizeCompletedCareerLegacyEvidence(value.legacyEvidence);
  return {
    scoutName,
    finalTier,
    seasonsPlayed,
    totalDiscoveries,
    hitRate,
    specialization: specialization as Specialization,
    completedScenarios,
    legacyScoreTotal,
    ...(legacyEvidence ? { legacyEvidence } : {}),
    ...(signature ? { signature } : {}),
    ...(finalChapter ? { finalChapter } : {}),
    completedAt,
  };
}

function regionalMemoryDefinition(): LegacyPerk {
  const definition = LEGACY_PERK_DEFINITION_BY_ID.get("regional_memory");
  if (!definition) {
    throw new Error("Regional Memory legacy definition is missing");
  }
  return definition;
}

function isExactCanonicalStoredPerk(value: unknown, definition: LegacyPerk): boolean {
  if (!isRecord(value)) return false;
  const expectedKeys = ["description", "id", "name", "type", "unlockedBy", "value"];
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && value.id === definition.id
    && value.name === definition.name
    && value.description === definition.description
    && value.type === definition.type
    && value.value === definition.value
    && value.unlockedBy === definition.unlockedBy;
}

function entitlementMigrationCareerProjection(career: CompletedCareer): object {
  // These are exactly the fields retained by the pre-evidence career archive.
  // Later signature/final-chapter enrichment must not invalidate the migration.
  return {
    scoutName: career.scoutName,
    finalTier: career.finalTier,
    seasonsPlayed: career.seasonsPlayed,
    totalDiscoveries: career.totalDiscoveries,
    hitRate: career.hitRate,
    specialization: career.specialization,
    completedScenarios: career.completedScenarios,
    legacyScoreTotal: career.legacyScoreTotal,
    completedAt: career.completedAt,
  };
}

function entitlementMigrationFingerprint(
  profileId: string,
  completedCareers: readonly CompletedCareer[],
  migratedCareerCount: number,
): string {
  return stableFingerprint({
    migration: "pre-evidence-regional-memory-v1",
    profileId,
    careers: completedCareers
      .slice(-migratedCareerCount)
      .map(entitlementMigrationCareerProjection),
  });
}

function createLegacyRegionalMemoryMigrationEvidence(
  rawProfile: Record<string, unknown>,
  profileId: string,
  completedCareers: readonly CompletedCareer[],
): LegacyEntitlementMigrationEvidence | undefined {
  if (
    rawProfile.entitlementSchemaVersion !== undefined
    || rawProfile.entitlementMigrationEvidence !== undefined
    || completedCareers.length === 0
    || completedCareers.some((career) => career.legacyEvidence !== undefined)
    || !Array.isArray(rawProfile.legacyPerks)
    || !rawProfile.legacyPerks.some((perk) =>
      isExactCanonicalStoredPerk(perk, regionalMemoryDefinition()))
  ) {
    return undefined;
  }
  const migratedCareerCount = completedCareers.length;
  return {
    version: LEGACY_ENTITLEMENT_MIGRATION_VERSION,
    grandfatheredPerkIds: ["regional_memory"],
    migratedCareerCount,
    careerFingerprint: entitlementMigrationFingerprint(
      profileId,
      completedCareers,
      migratedCareerCount,
    ),
  };
}

function sanitizeLegacyEntitlementMigrationEvidence(
  value: unknown,
  profileId: string,
  completedCareers: readonly CompletedCareer[],
): LegacyEntitlementMigrationEvidence | undefined {
  if (
    !isRecord(value)
    || value.version !== LEGACY_ENTITLEMENT_MIGRATION_VERSION
    || !Array.isArray(value.grandfatheredPerkIds)
    || value.grandfatheredPerkIds.length !== 1
    || value.grandfatheredPerkIds[0] !== "regional_memory"
    || typeof value.migratedCareerCount !== "number"
    || !Number.isInteger(value.migratedCareerCount)
    || value.migratedCareerCount < 1
    || value.migratedCareerCount > completedCareers.length
    || typeof value.careerFingerprint !== "string"
    || !/^[a-f0-9]{16}$/.test(value.careerFingerprint)
    || value.careerFingerprint !== entitlementMigrationFingerprint(
      profileId,
      completedCareers,
      value.migratedCareerCount,
    )
  ) {
    return undefined;
  }
  return {
    version: LEGACY_ENTITLEMENT_MIGRATION_VERSION,
    grandfatheredPerkIds: ["regional_memory"],
    migratedCareerCount: value.migratedCareerCount,
    careerFingerprint: value.careerFingerprint,
  };
}

function sanitizeLegacyProfile(
  value: unknown,
  options: { allowPreEvidenceRegionalMemoryMigration?: boolean } = {},
): LegacyProfile | undefined {
  if (!isRecord(value)) return undefined;
  const id = sanitizeText(value.id, MAX_PROFILE_ID_LENGTH, true);
  if (
    !id
    || (value.entitlementSchemaVersion !== undefined
      && value.entitlementSchemaVersion !== LEGACY_ENTITLEMENT_SCHEMA_VERSION)
    || !Array.isArray(value.completedCareers)
    || value.completedCareers.length > MAX_COMPLETED_CAREERS
    || !Array.isArray(value.unlockedScenarios)
    || value.unlockedScenarios.length > MAX_PROFILE_SCENARIO_UNLOCKS
    || !Array.isArray(value.legacyPerks)
    || value.legacyPerks.length > MAX_PROFILE_PERK_ENTITLEMENTS
  ) {
    return undefined;
  }

  const completedCareers = value.completedCareers
    .map(sanitizeCompletedCareer)
    .filter((career): career is CompletedCareer => career !== undefined);
  const storedEntitlementMigrationEvidence = value.entitlementSchemaVersion
    === LEGACY_ENTITLEMENT_SCHEMA_VERSION
    ? sanitizeLegacyEntitlementMigrationEvidence(
        value.entitlementMigrationEvidence,
        id,
        completedCareers,
      )
    : undefined;
  const entitlementMigrationEvidence = storedEntitlementMigrationEvidence
    ?? (options.allowPreEvidenceRegionalMemoryMigration
    ? createLegacyRegionalMemoryMigrationEvidence(value, id, completedCareers)
    : undefined);
  const unlockedScenarios = sanitizeIdentifierArray(
    value.unlockedScenarios,
    MAX_PROFILE_SCENARIO_UNLOCKS,
    LAUNCHABLE_ADVANCED_SCENARIO_IDS,
  );
  if (!unlockedScenarios) return undefined;

  const totalDiscoveries = completedCareers.reduce(
    (sum, career) => sum + career.totalDiscoveries,
    0,
  );
  const totalSeasonsPlayed = completedCareers.reduce(
    (sum, career) => sum + career.seasonsPlayed,
    0,
  );
  const sanitized: LegacyProfile = {
    id,
    entitlementSchemaVersion: LEGACY_ENTITLEMENT_SCHEMA_VERSION,
    ...(entitlementMigrationEvidence ? { entitlementMigrationEvidence } : {}),
    completedCareers,
    unlockedScenarios,
    legacyPerks: [],
    totalDiscoveries,
    totalSeasonsPlayed,
    bestHitRate: Math.max(0, ...completedCareers.map((career) => career.hitRate)),
    bestLegacyScore: Math.max(0, ...completedCareers.map((career) => career.legacyScoreTotal)),
    highestTierReached: Math.max(0, ...completedCareers.map((career) => career.finalTier)),
  };
  // Neither stored perk objects nor stored scenario IDs are authorities. Both
  // are reconstructed from the sanitized completed-career record.
  sanitized.legacyPerks = evaluateUnlockedPerks(sanitized);
  sanitized.unlockedScenarios = checkScenarioUnlocks(sanitized);
  return sanitized;
}

/**
 * Read the legacy profile from localStorage.
 * Returns undefined if no profile exists or parsing fails.
 */
export function readLegacyProfile(): LegacyProfile | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);
    if (!raw || raw.length > MAX_LEGACY_PROFILE_STORAGE_CHARS) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeLegacyProfile(parsed, {
      allowPreEvidenceRegionalMemoryMigration: true,
    });
    if (
      sanitized
      && isRecord(parsed)
      && parsed.entitlementSchemaVersion === undefined
    ) {
      // Persist the bounded compatibility proof once so every later mechanical
      // read uses the evidence-backed schema rather than re-trusting old data.
      try {
        window.localStorage.setItem(
          LEGACY_PROFILE_STORAGE_KEY,
          JSON.stringify(sanitized),
        );
      } catch {
        // The in-memory sanitized profile remains safe if storage is unavailable.
      }
    }
    return sanitized;
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
    const sanitized = sanitizeLegacyProfile(profile);
    if (!sanitized) return;
    window.localStorage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(sanitized));
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

  const unlockedIds = new Set(
    (sanitizeLegacyProfile(profile)?.legacyPerks ?? []).map((perk) => perk.id),
  );

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
  return (sanitizeLegacyProfile(profile)?.completedCareers.length ?? 0) > 0;
}
