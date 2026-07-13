export {
  calculatePerformanceReview,
  generateJobOffers,
  generateJobOffersForTier,
  acceptJobOffer,
  canAcceptJobOffer,
  expireJobOffersAtWeekEnd,
  endClubEmployment,
  updateReputation,
} from './progression';

export {
  applyCareerPathTransition,
  applyClubEmploymentTransition,
  closeIndependentOperations,
  transitionToBankruptcyRecovery,
  transitionToClubCareer,
  transitionToClubEmployment,
  transitionToIndependentCareer,
} from './transitions';

export type { ReputationEvent, TierReviewContext } from './progression';

export {
  canUnlockSecondarySpec,
  unlockSecondarySpecialization,
  calculateManagerSatisfaction,
  processManagerMeeting,
  evaluateBoardDirectives,
  generateBoardDirectives,
} from './management';

export {
  generateNPCScoutRoster,
  assignTerritory,
  processNPCScoutingWeek,
  evaluateNPCReport,
  calculateNPCReportQuality,
  restNPCScout,
} from './npcScouts';

export {
  createPerformanceSnapshot,
  processMonthlySnapshot,
  getAccuracyTrend,
  getSkillProgressionTrend,
  getOverallPerformanceRating,
  comparePerformancePeriods,
} from './performanceAnalytics';

export {
  recordDiscovery,
  addSeasonSnapshot,
  calculatePredictionAccuracy,
  processSeasonDiscoveries,
  getWonderkidDiscoveries,
  getDiscoveryStats,
} from './discoveryTracking';

export {
  canChooseIndependentPath,
  canChooseCareerPath,
  chooseCareerPath,
  getIndependentTierRequirements,
  checkIndependentTierAdvancement,
  advanceIndependentTier,
} from './pathChoice';
export {
  ensureLeadershipDelegationTeam,
  type LeadershipBootstrapResult,
} from './leadership';

export {
  processWeeklyCourseProgress,
} from './courses';

export {
  BOARD_MEETING_APPROACHES,
  BOARD_MEETING_FATIGUE_COST,
  MANAGER_MEETING_APPROACHES,
  MANAGER_MEETING_FATIGUE_COST,
  conductBoardMeeting,
  conductManagerMeeting,
  getBoardMeetingCooldownWeeks,
  getBoardMeetingEligibility,
  getManagerMeetingEligibility,
  migratePoliticalMeetingState,
} from './politicalMeetings';

export {
  generateLegacyProfile,
  getCareerSeasonOrdinal,
  generateCompletedCareer,
  applyLegacyPerks,
  checkScenarioUnlocks,
  getScenarioUnlockDescriptions,
  getAvailablePerks,
  getUsedSpecializations,
  hasCompletedCareer,
  hasRepresentedCareerCompletionState,
  canVoluntarilyRetire,
  markCareerVoluntarilyRetired,
  readLegacyProfile,
  writeLegacyProfile,
  MAX_ACTIVE_PERKS,
  LEGACY_PROFILE_STORAGE_KEY,
  VOLUNTARY_RETIREMENT_MARKER,
  LEGACY_PERK_DEFINITIONS,
} from './legacy';

export type { LegacyPerkApplicationResult } from './legacy';
