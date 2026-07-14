/**
 * Public API surface for the world subsystem.
 */

export { generateSeasonFixtures } from './fixtures';
export { initializeWorld } from './init';
export type { WorldState } from './init';

export {
  getScoutHomeCountry,
  getTravelCost,
  getTravelSlots,
  getTravelDuration,
  bookTravel,
  isScoutAbroad,
  getAccessibleFixtures,
  getForeignScoutingPenalty,
  updateCountryReputation,
} from './travel';

export {
  getTransferFlowProbability,
} from './transfers';

export {
  getLifecycleWorld,
  withLifecycleWorld,
  resolvePlayerMovements,
} from './playerLifecycle';

export {
  deriveRegionRecruitmentIdentity,
  deriveClubRecruitmentIdentity,
  deriveBriefRecruitmentIdentity,
  evaluateRecruitmentIdentityFit,
} from './recruitmentIdentity';
export type {
  RecruitmentFocus,
  RegionRecruitmentArchetype,
  ClubRecruitmentArchetype,
  RegionRecruitmentIdentity,
  ClubRecruitmentIdentity,
  RecruitmentIdentityFit,
} from './recruitmentIdentity';
export type {
  LifecycleWorldState,
  LifecycleResolution,
  PlayerMovementIntent,
  RejectedPlayerMovement,
} from './playerLifecycle';

export {
  initializeCountryReputations,
  getRegionalExpertiseModifier,
  getRegionalPerkBonus,
  getCountryExpertiseLevel,
  calculateRegionalAccuracyBonus,
} from './regions';

export {
  getWorldCountryAvailability,
  getTravelEligibleCountryKeys,
  getCountryAvailability,
  isTravelEligibleCountry,
  getInternationalAssignmentTypesForCountry,
  isInternationalAssignmentEligibleCountry,
} from './countryAvailability';
export type {
  WorldCountryContentTier,
  WorldCountryAvailability,
  WorldCountryAvailabilitySource,
} from './countryAvailability';

export {
  deriveRegionalPresence,
  deriveRegionalPresenceIndex,
  getPlayerScoutingCountry,
  getRegionalTravelQuote,
  applyRegionalPresenceToObservation,
} from './regionalPresence';
export type {
  RegionalAccessTier,
  RegionalPresenceEffects,
  RegionalPresenceSnapshot,
  RegionalPresenceSource,
  RegionalTravelQuote,
  RegionalObservationContext,
} from './regionalPresence';

export {
  HIDDEN_LEAGUE_DEFINITIONS,
  getHiddenLeaguesForCountry,
  discoverHiddenLeague,
  getAllDiscoveredHiddenLeagues,
  getUndiscoveredHiddenLeagues,
} from './hiddenLeagues';

export {
  generateInternationalAssignment,
  getAvailableAssignments,
  processInternationalWeek,
  getAssignmentExpiryThreshold,
} from './international';

export type {
  InternationalWeekResult,
} from './international';
export type { InternationalAssignment } from '@/engine/core/types';

export {
  WORLD_CONDITION_DECK,
  WORLD_CONDITION_HISTORY_LIMIT,
  createWorldConditionState,
  migrateWorldConditionState,
  generateWorldConditionSeason,
  advanceWorldConditionSeason,
  getWorldConditionModifiers,
  getWorldConditionDefinition,
  getActiveWorldConditionNames,
  getWorldConditionContentDefinitionIds,
  formatWorldConditionCountry,
  buildWorldConditionSeasonMessage,
  applyWorldConditionSeasonStart,
} from './worldConditions';
export type {
  WorldConditionScope,
  WorldConditionModifiers,
  WorldConditionDefinition,
  WorldConditionInstance,
  WorldConditionSeasonRecord,
  WorldConditionState,
} from './worldConditions';

export {
  processRelegationPromotion,
  applyRelegationResult,
  getStandingsPriceModifier,
  classifyStandingZone,
} from './relegation';
export type { RelegationEvent, RelegationResult, StandingZone } from './relegation';

export {
  processLoanReturns,
  processAILoanDeals,
  processLoanPerformance,
  processLoanRecalls,
  evaluateLoanOutcome,
  isLoanEligible,
  findLoanDestination,
  calculateLoanTerms,
} from './loans';
