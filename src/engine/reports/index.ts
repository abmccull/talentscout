export {
  generateReportContent,
  calculateReportQuality,
  calculateReportQualityDetailed,
  calculateReportCraftQualityDetailed,
  prepareReportSubmission,
  estimateReportQuality,
  finalizeReport,
  trackPostTransfer,
  STRENGTH_DESCRIPTORS,
  WEAKNESS_DESCRIPTORS,
} from "./reporting";

export type {
  ReportDraft,
  ReportClaimSuggestion,
  QualityBreakdown,
  QualityPreviewResult,
  ReportQualityDetailed,
  ReportCraftQualityDetailed,
  PrepareReportSubmissionInput,
} from "./reporting";

export {
  attachReportEvidence,
  getFreshReportObservationIds,
  getLatestReportInScope,
  getReportCaseKey,
  selectLatestReportsByCase,
} from "./reportAccountability";
export {
  deriveProfessionalCaseAccountability,
} from "./caseAccountability";
export type {
  ProfessionalCaseAccountabilityCategory,
  ProfessionalCaseAccountabilityKey,
  ProfessionalCaseAccountabilitySnapshot,
  ProfessionalCaseAccountabilityStatus,
} from "./caseAccountability";

export {
  attachListingToCase,
  ensureScoutingCaseForReport,
  getScoutingCaseId,
  isGameDateDue,
  migrateScoutingCases,
  nextGameWeek,
  recordDirectPlacementDelivery,
  recordMarketplaceDelivery,
  resolveClubDecision,
} from "./scoutingCases";

export {
  applyStructuredReportInput,
  isStructuredYouthReport,
  validateStructuredReportInput,
} from "./structuredYouthReport";
export {
  describePresentationRoom,
  evaluatePresentationStrategy,
  PRESENTATION_APPROACHES,
} from "./presentationStrategy";
export type {
  PresentationApproachDefinition,
  PresentationRoomRead,
  PresentationStrategyImpact,
  PresentationStrategyInput,
} from "./presentationStrategy";

export type { StructuredReportValidation } from "./structuredYouthReport";

export {
  getRemainingTablePounds,
  getSeasonTablePoundAllowance,
} from "./conviction";
export * from "./caseQuestions";
