export {
  createScout,
  deriveStartingPositionAffinities,
  validateSkillAllocations,
  BASE_SKILLS,
  SKILL_MINIMUMS,
  ALLOCATION_MAX,
  BONUS_POINTS,
} from './creation';

export {
  getVisibleAttributes,
  perceiveAttribute,
  calculateConfidenceRange,
  observePlayer,
  computeScoutingBreakthroughBonus,
} from './perception';

export {
  abilityToStars,
  starsToAbility,
  generateAbilityReading,
} from './starRating';

export {
  getPerceivedAbility,
} from './perceivedAbility';

export type { PerceivedAbility } from './perceivedAbility';

export { applyScoutSkillXp } from './progression';

export {
  MAX_COMPARABLE_EVIDENCE_SOURCES,
  MAX_EVIDENCE_CLAIMS_PER_SOURCE,
  adjustRecommendationForPerspective,
  buildContactEvidenceClaim,
  buildNPCAttributeEvidenceClaims,
  buildNPCRecommendationEvidenceClaim,
  capComparableClaims,
  deriveContactPerspective,
  deriveNPCScoutPerspective,
  formatEvidenceRange,
  getEffectiveClaimConfidence,
  neutralPlayerPerspective,
  perspectiveAdjustment,
} from './sourcePerspectives';

export {
  calibrateEvidenceClaimFromReview,
  calibrateSourceEvidenceFromReview,
} from './sourceCalibration';
