/**
 * Youth engine barrel export.
 *
 * Re-exports all public functions from youth sub-modules.
 * Additional youth modules (scouting, placement, etc.) should be added here
 * as they are created.
 */

export {
  generateSubRegions,
  generateRegionalYouth,
  generateAcademyIntake,
  processYouthAging,
  reconcileYouthSigningPlacements,
  processPlayerRetirement,
} from "./generation";

// Placement pipeline — placing unsigned youth at clubs
export {
  generatePlacementReport,
  processPlacementOutcome,
  getEligibleClubsForPlacement,
} from "./placement";

// Alumni tracking — long-term payoff loop for placed youth
export {
  createAlumniRecord,
  processAlumniWeek,
  calculateLegacyScore,
  calculateAlumniReputationBonus,
} from "./alumni";

// Tournament system — named, scheduled, discoverable youth events
export {
  generateSeasonTournaments,
  discoverTournamentsPassive,
  generateGrassrootsTournament,
  processContactTournamentTip,
  getActiveTournaments,
  getTournamentActivities,
  createAgencyShowcase,
  estimateTournamentCost,
} from "./tournaments";

// Gut feeling mechanic — narrative flash moments during youth scouting
export { rollGutFeeling, formatGutFeelingWithPA } from "./gutFeeling";
export type { GutFeelingPerkModifiers } from "./gutFeeling";

export {
  advanceYouthRecruitmentBriefs,
  fulfillYouthRecruitmentBrief,
  generateYouthRecruitmentBriefs,
  scoreAcademyClubDecision,
} from "./academyPlacementCase";
export type { AcademyDecisionScore } from "./academyPlacementCase";

// Player-facing cross-border registration, adaptation, and pathway context.
export {
  YOUTH_MOBILITY_MODEL_NOTICE,
  assessYouthMobility,
} from "./youthMobility";
export type {
  YouthMobilityAssessment,
  YouthMobilityAssessmentInput,
  YouthMobilityStatus,
} from "./youthMobility";

// Evergreen professional cases — recurring judgment after the opening hook
export {
  YOUTH_CASE_COOLDOWN_WEEKS,
  YOUTH_CASE_TRIGGER_CHANCE,
  YOUTH_EVERGREEN_CASE_DEFINITIONS,
  directWeeklyYouthProfessionalCase,
  getProfessionalCaseApproach,
  validateYouthEvergreenCaseDefinitions,
} from "./evergreenCases";
export type {
  YouthCaseBlockedReason,
  YouthCaseDirectionResult,
  YouthEvergreenCaseDefinition,
  YouthEvergreenCaseFamilyId,
} from "./evergreenCases";
