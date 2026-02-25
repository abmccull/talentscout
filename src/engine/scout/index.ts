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
