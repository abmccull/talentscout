/**
 * Mastery observation perks for the TalentScout game engine.
 *
 * A mastery perk is unlocked automatically when a specific scout skill reaches
 * a required level (currently 15 or 18).  Unlike specialization perks — which
 * are gated behind the primary-specialization level — mastery perks reward deep
 * investment in individual skill ratings regardless of specialization choice.
 *
 * All functions are pure: they take values in, return values out, and never
 * mutate their arguments.
 */

import type { Scout, ScoutSkill, PlayerAttribute } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Effect types
// ---------------------------------------------------------------------------

export type MasteryPerkEffect =
  /**
   * Adds a "signatureMove" tag to observations — flags unique, repeatable
   * technical traits that define a player's individual style.
   */
  | { type: "signatureDetection"; enabled: true }
  /**
   * Unlocks direct readings of specific hidden mental attributes by reading
   * body language cues during observations (training ground, live match).
   */
  | { type: "bodyLanguageRead"; attributes: PlayerAttribute[] }
  /**
   * Enables a dedicated professionalism assessment derived from training-ground
   * observations — work ethic, timekeeping, attitude to coaching feedback.
   */
  | { type: "characterAssessment"; enabled: true }
  /**
   * Adds a system-fit score to every report, evaluating how well the player's
   * movement patterns, pressing tendencies, and positioning habits match any
   * given tactical shape — not just the scout's current club.
   */
  | { type: "systemFitAnalysis"; enabled: true }
  /**
   * Flags players whose statistical output deviates significantly from the
   * norm for players of comparable ability — surfacing potential breakout
   * performers and analytically overrated names.
   */
  | { type: "patternBreaking"; enabled: true };

// ---------------------------------------------------------------------------
// MasteryPerk interface
// ---------------------------------------------------------------------------

export interface MasteryPerk {
  id: string;
  name: string;
  description: string;
  /** The scout skill whose level gates this perk. */
  requiredSkill: ScoutSkill;
  /** Minimum value that skill must reach for the perk to unlock. */
  requiredLevel: number;
  effect: MasteryPerkEffect;
}

// ---------------------------------------------------------------------------
// MasteryModifiers — the folded output of all unlocked mastery perks
// ---------------------------------------------------------------------------

export interface MasteryModifiers {
  /**
   * Whether the scout can tag observations with a "signatureMove" marker
   * when a player exhibits a distinctive, repeatable technical trait.
   */
  canDetectSignatureMoves: boolean;
  /**
   * Hidden player attributes that can be read directly via body-language
   * analysis (requires psychologicalRead ≥ 15).
   */
  bodyLanguageAttributes: PlayerAttribute[];
  /**
   * Whether the scout can produce a dedicated character/professionalism
   * assessment from training-ground sessions.
   */
  canAssessCharacter: boolean;
  /**
   * Whether every scout report includes a system-fit score evaluating the
   * player against any tactical shape — not just the scout's own club.
   */
  canAnalyseSystemFit: boolean;
  /**
   * Whether the scout's reports flag statistical anomalies in a player's
   * output relative to their observed ability profile.
   */
  canBreakPatterns: boolean;
}

// ---------------------------------------------------------------------------
// Mastery perk definitions — 5 perks total
// ---------------------------------------------------------------------------

export const MASTERY_PERKS: MasteryPerk[] = [
  // 1 — technicalEye 15
  {
    id: "mastery_signature_move_spotter",
    name: "Signature Move Spotter",
    requiredSkill: "technicalEye",
    requiredLevel: 15,
    description:
      "Your eye now locks onto distinctive technical patterns. Live and video work retain one extra detail and flag the pattern for a follow-up check before it becomes a claim.",
    effect: { type: "signatureDetection", enabled: true },
  },

  // 2 — psychologicalRead 15
  {
    id: "mastery_body_language_reader",
    name: "Body Language Reader",
    requiredSkill: "psychologicalRead",
    requiredLevel: 15,
    description:
      "You read pressure cues more fluently. Live and training observations retain extra mental detail, while reports must still acknowledge the limits of a single cue.",
    effect: {
      type: "bodyLanguageRead",
      attributes: ["bigGameTemperament", "composure"],
    },
  },

  // 3 — psychologicalRead 18
  {
    id: "mastery_character_judge",
    name: "Character Judge",
    requiredSkill: "psychologicalRead",
    requiredLevel: 18,
    description:
      "Training-ground work retains an additional character cue about response to coaching and professional habits. Repeated contexts are still required for a firm judgment.",
    effect: { type: "characterAssessment", enabled: true },
  },

  // 4 — tacticalUnderstanding 15
  {
    id: "mastery_system_architect",
    name: "System Architect",
    requiredSkill: "tacticalUnderstanding",
    requiredLevel: 15,
    description:
      "When a report names a target club and role, your system analysis adds three bounded craft points to the fit judgment.",
    effect: { type: "systemFitAnalysis", enabled: true },
  },

  // 5 — dataLiteracy 15
  {
    id: "mastery_pattern_breaker",
    name: "Pattern Breaker",
    requiredSkill: "dataLiteracy",
    requiredLevel: 15,
    description:
      "Database work surfaces one additional anomaly candidate for investigation. It remains a lead until another source supports it.",
    effect: { type: "patternBreaking", enabled: true },
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Return every mastery perk that the scout has currently unlocked.
 *
 * A perk is unlocked when the scout's skill level for `requiredSkill` is at
 * least `requiredLevel`.  This is evaluated eagerly each call so callers
 * always receive an up-to-date view — no stale cache to manage.
 *
 * Pure function: does not mutate the scout.
 */
export function checkMasteryPerkUnlocks(scout: Scout): MasteryPerk[] {
  return MASTERY_PERKS.filter(
    (perk) => scout.skills[perk.requiredSkill] >= perk.requiredLevel
  );
}

/**
 * Fold a list of unlocked mastery perks into a single `MasteryModifiers`
 * struct that downstream systems can query in O(1) without re-iterating perks.
 *
 * Pure function: does not mutate its argument.
 */
export function getMasteryPerkModifiers(
  unlockedPerks: MasteryPerk[]
): MasteryModifiers {
  let canDetectSignatureMoves = false;
  const bodyLanguageAttributes: PlayerAttribute[] = [];
  let canAssessCharacter = false;
  let canAnalyseSystemFit = false;
  let canBreakPatterns = false;

  for (const perk of unlockedPerks) {
    const effect = perk.effect;
    switch (effect.type) {
      case "signatureDetection":
        canDetectSignatureMoves = true;
        break;

      case "bodyLanguageRead":
        for (const attr of effect.attributes) {
          if (!bodyLanguageAttributes.includes(attr)) {
            bodyLanguageAttributes.push(attr);
          }
        }
        break;

      case "characterAssessment":
        canAssessCharacter = true;
        break;

      case "systemFitAnalysis":
        canAnalyseSystemFit = true;
        break;

      case "patternBreaking":
        canBreakPatterns = true;
        break;
    }
  }

  return {
    canDetectSignatureMoves,
    bodyLanguageAttributes,
    canAssessCharacter,
    canAnalyseSystemFit,
    canBreakPatterns,
  };
}
