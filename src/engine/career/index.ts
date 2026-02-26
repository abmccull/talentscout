export {
  calculatePerformanceReview,
  generateJobOffers,
  acceptJobOffer,
  updateReputation,
} from './progression';

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
  generateTerritories,
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
  chooseCareerPath,
  getIndependentTierRequirements,
  checkIndependentTierAdvancement,
  advanceIndependentTier,
} from './pathChoice';

export {
  processWeeklyCourseProgress,
} from './courses';

export {
  generateLegacyProfile,
  generateCompletedCareer,
  applyLegacyPerks,
  checkScenarioUnlocks,
  getScenarioUnlockDescriptions,
  getAvailablePerks,
  getUsedSpecializations,
  hasCompletedCareer,
  readLegacyProfile,
  writeLegacyProfile,
  MAX_ACTIVE_PERKS,
  LEGACY_PROFILE_STORAGE_KEY,
  LEGACY_PERK_DEFINITIONS,
} from './legacy';

export type { LegacyPerkApplicationResult } from './legacy';
