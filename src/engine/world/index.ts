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
  findCrossCountryTransferDestination,
  processCrossCountryTransfers,
} from './transfers';
export type { TransferResult } from './transfers';

export {
  initializeCountryReputations,
  getRegionalExpertiseModifier,
  getRegionalPerkBonus,
  getCountryExpertiseLevel,
  calculateRegionalAccuracyBonus,
} from './regions';

export {
  HIDDEN_LEAGUE_DEFINITIONS,
  getHiddenLeaguesForCountry,
  discoverHiddenLeague,
  getAllDiscoveredHiddenLeagues,
  getUndiscoveredHiddenLeagues,
} from './hiddenLeagues';

export {
  generateInternationalAssignment,
  generateYouthTournaments,
  scoutAtYouthTournament,
  getAvailableAssignments,
  processInternationalWeek,
  getAssignmentExpiryThreshold,
} from './international';

export type {
  InternationalAssignment,
  YouthTournament,
  YouthTournamentResult,
  InternationalWeekResult,
} from './international';

export {
  processRelegationPromotion,
  applyRelegationResult,
  getStandingsPriceModifier,
  classifyStandingZone,
} from './relegation';
export type { RelegationEvent, RelegationResult, StandingZone } from './relegation';
