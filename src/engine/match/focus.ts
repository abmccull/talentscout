/**
 * Focus System — the scout can focus on up to 3 players per match,
 * choosing a "lens" that biases observation toward specific attribute domains.
 */

import { type RNG } from "@/engine/rng";
import {
  type Player,
  type Scout,
  type ScoutSkill,
  type MatchPhase,
  type Observation,
  type ObservationContext,
  type FocusSelection,
  ATTRIBUTE_DOMAINS,
} from "@/engine/core/types";
import { observePlayer } from "@/engine/scout/perception";

// ---------------------------------------------------------------------------
// Lens configuration
// ---------------------------------------------------------------------------

type FocusLens = FocusSelection["lens"];

/**
 * Each lens boosts a specific scout skill during focused observation.
 * The boost is applied transiently — it does not modify the Scout permanently.
 */
const LENS_SKILL_BOOST: Record<FocusLens, Partial<Record<ScoutSkill, number>>> = {
  technical: { technicalEye: 3 },
  physical: { physicalAssessment: 3 },
  mental: { psychologicalRead: 3 },
  tactical: { tacticalUnderstanding: 3, psychologicalRead: 1 },
  general: {},
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a focused observation for a single player.
 * Applies the lens boost to scout skills, then delegates to observePlayer.
 */
export function processFocusedObservations(
  rng: RNG,
  player: Player,
  scout: Scout,
  matchPhases: MatchPhase[],
  focus: FocusSelection,
  context: ObservationContext,
  existingObservations: Observation[],
): Observation {
  // Build boosted skills
  const boostedSkills = { ...scout.skills };
  const boosts = LENS_SKILL_BOOST[focus.lens];
  for (const [skill, boost] of Object.entries(boosts)) {
    const key = skill as ScoutSkill;
    boostedSkills[key] = Math.min(20, boostedSkills[key] + boost);
  }

  const boostedScout: Scout = { ...scout, skills: boostedSkills };

  const observation = observePlayer(
    rng,
    player,
    boostedScout,
    matchPhases,
    focus.phases,
    context,
    existingObservations,
    focus.lens, // Pass the lens through so breakthrough bonus and focusLens are tracked
  );

  // Apply domain accuracy bonus: tighten confidence for attributes in the lens domain
  const lensDomainMap: Record<FocusLens, string | null> = {
    technical: "technical",
    physical: "physical",
    mental: "mental",
    tactical: "tactical",
    general: null,
  };
  const lensDomain = lensDomainMap[focus.lens];

  if (lensDomain) {
    const boostedReadings = observation.attributeReadings.map((reading) => {
      const attrDomain = ATTRIBUTE_DOMAINS[reading.attribute];
      if (attrDomain !== lensDomain) return reading;
      return {
        ...reading,
        confidence: Math.min(1, reading.confidence + 0.05),
      };
    });
    return { ...observation, attributeReadings: boostedReadings };
  }

  return observation;
}
