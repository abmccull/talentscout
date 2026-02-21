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
