/**
 * Data/Analytics Tension — Manager scouting preference system.
 *
 * Models the friction (or alignment) between a scout's approach and the
 * manager's philosophy. A data scout working under a pure eye-test manager
 * will see their reports discounted; the same scout thriving under an
 * analytics-minded manager will have outsized influence.
 *
 * All functions are pure: state in, value out. Randomness via RNG only.
 */

import type { Club, ManagerProfile, Scout, ScoutingPhilosophy, ScoutingPreference } from "../core/types";
import type { RNG } from "../rng/index";

// =============================================================================
// CONSTANTS
// =============================================================================

const MANAGER_NAMES = [
  "Erik Hartmann",
  "Marco Silva",
  "Thomas Brandt",
  "Johan Larsson",
  "Piero Ferrara",
  "Carlos Mendez",
  "Alexei Petrov",
  "Luca Moretti",
  "Sven Johansson",
  "Diego Vargas",
  "Fabio Ricci",
  "Patrick Dumas",
  "Kofi Mensah",
  "Hiroshi Tanaka",
  "Andre Dupont",
  "Stefan Kovacs",
  "Rui Ferreira",
  "Mikael Lindqvist",
  "Abdullah Al-Rashid",
  "Omar Diallo",
] as const;

const COMMON_FORMATIONS = [
  "4-4-2",
  "4-3-3",
  "4-2-3-1",
  "3-5-2",
  "3-4-3",
  "4-5-1",
  "4-1-4-1",
  "5-3-2",
  "4-3-2-1",
  "3-4-2-1",
] as const;

/**
 * Maps each club scouting philosophy to a weighted distribution of manager
 * preferences. Weights do not need to sum to any particular value; they are
 * passed to rng.pickWeighted which normalises internally.
 */
const PHILOSOPHY_PREFERENCE_WEIGHTS: Record<
  ScoutingPhilosophy,
  ReadonlyArray<{ item: ScoutingPreference; weight: number }>
> = {
  // Youth-first clubs trust experienced eyes over stats
  academyFirst: [
    { item: "eyeTest",      weight: 6 },
    { item: "balanced",     weight: 3 },
    { item: "dataFirst",    weight: 1 },
    { item: "resultsBased", weight: 1 },
  ],
  // Short-term focused clubs want results fast — results-based or data
  winNow: [
    { item: "dataFirst",    weight: 5 },
    { item: "resultsBased", weight: 4 },
    { item: "balanced",     weight: 2 },
    { item: "eyeTest",      weight: 1 },
  ],
  // Data-driven value clubs lean heavily analytic
  marketSmart: [
    { item: "dataFirst",    weight: 7 },
    { item: "balanced",     weight: 3 },
    { item: "resultsBased", weight: 2 },
    { item: "eyeTest",      weight: 1 },
  ],
  // Wide-net recruiters need broad read of diverse talent — balanced
  globalRecruiter: [
    { item: "balanced",     weight: 5 },
    { item: "eyeTest",      weight: 3 },
    { item: "dataFirst",    weight: 3 },
    { item: "resultsBased", weight: 2 },
  ],
} as const;

// =============================================================================
// SINGLE-CLUB PROFILE GENERATION
// =============================================================================

/**
 * Generate a ManagerProfile for one club.
 *
 * - Name is drawn uniformly from a pool of 20 names.
 * - Preference is weighted by the club's scouting philosophy.
 * - reportInfluence is a float in [0.3, 0.9].
 * - preferredFormation is drawn uniformly from a pool of 10 formations.
 */
export function generateManagerProfile(rng: RNG, club: Club): ManagerProfile {
  const managerName = rng.pick(MANAGER_NAMES);
  const preference = rng.pickWeighted(PHILOSOPHY_PREFERENCE_WEIGHTS[club.scoutingPhilosophy]);
  const reportInfluence = rng.nextFloat(0.3, 0.9);
  const preferredFormation = rng.pick(COMMON_FORMATIONS);

  return {
    clubId: club.id,
    managerName,
    preference,
    reportInfluence,
    preferredFormation,
  };
}

// =============================================================================
// PREFERENCE ALIGNMENT SCORING
// =============================================================================

/**
 * Score 0–100 representing how well the scout's primary approach fits the
 * manager's preferred style.
 *
 * Alignment table (primary):
 *   data  scout  + dataFirst  manager  → 80–100  (great fit)
 *   youth scout  + eyeTest    manager  → 80–100  (great fit)
 *   any   scout  + balanced   manager  → 50–70   (neutral)
 *   mismatch (data+eyeTest or youth+dataFirst) → 20–40
 *   firstTeam/regional scouts score contextually
 *
 * Secondary specialization can shift the score by up to ±10 if it reinforces
 * or conflicts with the manager preference.
 */
export function calculatePreferenceAlignment(
  scout: Scout,
  manager: ManagerProfile,
): number {
  const primaryScore = primaryAlignmentScore(scout.primarySpecialization, manager.preference);
  const secondaryBonus = scout.secondarySpecialization !== undefined
    ? secondaryAlignmentBonus(scout.secondarySpecialization, manager.preference)
    : 0;

  // Clamp result to [0, 100]
  return Math.min(100, Math.max(0, primaryScore + secondaryBonus));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Base alignment score from primary specialization alone.
 *
 * Range reference:
 *   High alignment zone: 80–100
 *   Neutral zone:        50–70
 *   Low alignment zone:  20–40
 *
 * Mid-values within each zone are chosen to leave headroom for secondary bonus.
 */
function primaryAlignmentScore(
  spec: Scout["primarySpecialization"],
  preference: ScoutingPreference,
): number {
  if (preference === "balanced") {
    // Balanced managers work reasonably well with everyone
    return 60;
  }

  if (preference === "dataFirst") {
    switch (spec) {
      case "data":       return 90; // direct match
      case "firstTeam":  return 55; // stats-compatible
      case "regional":   return 35; // geography-focus, less analytic
      case "youth":      return 25; // developmental focus clashes
    }
  }

  if (preference === "eyeTest") {
    switch (spec) {
      case "youth":      return 90; // classic talent-spotter fit
      case "firstTeam":  return 65; // match-watchers align reasonably
      case "regional":   return 55; // boots-on-the-ground feel is valued
      case "data":       return 25; // heavy analytics clashes with gut-feel
    }
  }

  if (preference === "resultsBased") {
    switch (spec) {
      case "firstTeam":  return 80; // proven talent, results focus
      case "youth":      return 40; // long-term thinking clashes
      case "data":       return 60; // metrics can support results focus
      case "regional":   return 55; // broad coverage is neutral
    }
  }

  // TypeScript exhaustiveness guard — should never reach here
  return 50;
}

/**
 * Bonus/penalty contribution from secondary specialization, range ±10.
 * A reinforcing secondary spec adds +10; a conflicting one subtracts 10;
 * neutral secondaries contribute nothing.
 */
function secondaryAlignmentBonus(
  secondarySpec: NonNullable<Scout["secondarySpecialization"]>,
  preference: ScoutingPreference,
): number {
  if (preference === "dataFirst" && secondarySpec === "data") return 10;
  if (preference === "eyeTest"   && secondarySpec === "youth") return 10;
  if (preference === "eyeTest"   && secondarySpec === "data")  return -10;
  if (preference === "dataFirst" && secondarySpec === "youth") return -10;
  return 0;
}

// =============================================================================
// REPORT QUALITY MODIFIER
// =============================================================================

/**
 * Multiplier applied to a report's quality score based on how well the scout's
 * approach aligns with the manager's preference.
 *
 * Alignment → Multiplier mapping:
 *   80–100  → 1.15–1.30  (manager actively champions the report)
 *   50–79   → 0.90–1.15  (neutral, slight positive for better alignment)
 *   20–49   → 0.70–0.90  (manager is sceptical, report is discounted)
 *
 * Linear interpolation within each band keeps the function smooth and
 * avoids sharp cliff-edges at boundary values.
 */
export function getReportQualityModifier(
  scout: Scout,
  manager: ManagerProfile,
): number {
  const alignment = calculatePreferenceAlignment(scout, manager);

  if (alignment >= 80) {
    // 80 → 1.15, 100 → 1.30
    const t = (alignment - 80) / 20;          // 0..1 within band
    return 1.15 + t * (1.30 - 1.15);
  }

  if (alignment >= 50) {
    // 50 → 0.90, 79 → 1.15 (treat 80 as upper edge)
    const t = (alignment - 50) / 30;          // 0..1 within band
    return 0.90 + t * (1.15 - 0.90);
  }

  // alignment < 50: 20 → 0.70, 49 → 0.90
  const t = Math.max(0, (alignment - 20) / 29); // clamp for scores below 20
  return 0.70 + t * (0.90 - 0.70);
}

// =============================================================================
// BULK GENERATION
// =============================================================================

/**
 * Generate a ManagerProfile for every club in the game world.
 * Returns a map keyed by club ID.
 */
export function generateManagerProfiles(
  rng: RNG,
  clubs: Record<string, Club>,
): Record<string, ManagerProfile> {
  const profiles: Record<string, ManagerProfile> = {};
  for (const clubId of Object.keys(clubs)) {
    profiles[clubId] = generateManagerProfile(rng, clubs[clubId]);
  }
  return profiles;
}
