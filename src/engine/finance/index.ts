/**
 * Finance module — barrel export.
 *
 * Usage:
 *   import { initializeFinances, processWeeklyFinances, canAfford } from "@/engine/finance";
 */

export {
  initializeFinances,
  calculateMonthlyExpenses,
  processWeeklyFinances,
  sumOperatingExpenses,
  canAfford,
  purchaseEquipmentUpgrade,
  getEquipmentObservationBonus,
  isBroke,
  applyFirstReportBonus,
  applyFirstPlacementBonus,
  processStarterStipend,
  applyBalanceTransaction,
  applyDifficultyFinancialAdjustments,
} from "./expenses";

export {
  getActiveEquipmentBonuses,
  getContextualEquipmentBonuses,
  getEquipmentMonthlyTotal,
  purchaseEquipmentItem,
  sellEquipmentItem,
  equipItem,
  migrateEquipmentLevel,
  createDefaultInventory,
} from "./equipmentBonuses";

export type {
  EquipmentPassiveBonus,
  EquipmentBonusContext,
} from "./equipmentBonuses";

export {
  EQUIPMENT_CATALOG,
  ALL_EQUIPMENT_SLOTS,
  DEFAULT_LOADOUT,
  DEFAULT_OWNED_ITEMS,
  getEquipmentItem,
  getItemsForSlot,
} from "./equipmentCatalog";

export type {
  EquipmentSlot,
  EquipmentItemId,
  EquipmentEffectType,
  EquipmentEffect,
  EquipmentItemDefinition,
  EquipmentLoadout,
  EquipmentInventory,
} from "./equipmentCatalog";

export {
  migrateFinancialRecord,
  migrateEmployeeSkillsInRecord,
  migrateReportListingBids,
  reconcileFinancialLedger,
} from "./saveMigration";
export {
  assessClubAffordability,
  assessClubAffordabilityFromContext,
  buildClubAffordabilityContext,
  buildLoanWageContributionObligation,
  buildTransferAddOnObligations,
  deriveClubScoutingBudget,
  deriveClubWeeklyWageBudget,
  getClubWeeklyCommitmentTotal,
  getClubWeeklyObligationCommitment,
  getClubWeeklyWageCommitment,
  getTransferContingentReserve,
  normalizeClubEconomics,
  normalizeClubEconomicsMap,
  reapproveAnnualClubEconomics,
  settleRelegationClubObligations,
  settleTriggeredClubObligations,
  settleWeeklyClubObligations,
} from "./clubEconomics";
export {
  ROLE_SKILL_NAMES,
  ROLE_SKILL_DESCRIPTIONS,
  generateEmployeeSkills,
  deriveQuality,
  computeSalaryFromSkills,
  migrateEmployeeSkills,
  ensureEmployeeSkills,
  processSkillXp,
  getTrainingOptions,
  enrollInTraining,
  processTrainingWeek,
  getSkillSummary,
} from "./employeeSkills";
export type { TrainingOption } from "./employeeSkills";
export {
  getEmployeeSalaryBand,
  getEmployeePayPosition,
  getEmployeePayEffects,
  processEmployeePaySatisfaction,
  normalizeEmployeeContract,
  normalizeEmployeeContractsInRecord,
  renegotiateEmployeeSalary,
} from "./employeeEconomics";
export type {
  EmployeePayPosition,
  EmployeeSalaryBand,
  EmployeePayEffects,
  NormalizedEmployeeContract,
} from "./employeeEconomics";

// Economics Revamp modules
export { LIFESTYLE_TIERS, getDefaultLifestyle, changeLifestyle, getLifestyleReputationPenalty, getLifestyleNetworkingBonus } from "./lifestyle";
export { calculatePerformanceBonusAmount, calculateSigningBonus, calculateDiscoveryBonus, calculateDepartmentBonusPool, calculateGoldenParachute } from "./clubBonuses";
export { calculateReportPrice, estimateReportPriceRange, listReport, withdrawListing, expireOldListings, processMarketplaceBids, acceptBid, declineBid, acceptExclusiveUpgrade } from "./reportMarketplace";
export { calculatePlacementFee, calculateSellOnPercentage, processSellOnClauses, checkPlacementFeeEligibility, triggerPlacementFee } from "./placementFees";
export {
  generateRetainerOffers,
  acceptRetainer,
  cancelRetainer,
  closeRetainerPeriod,
  expireRetainerOffers,
  getRetainerCloseReferenceId,
  recordRetainerDelivery,
  processRetainerRenewals,
} from "./retainers";
export type {
  RetainerCloseEvent,
  RetainerCloseOutcome,
  RetainerPeriodCloseResult,
} from "./retainers";
export { OFFICE_TIERS, SALARY_BY_ROLE, upgradeOffice, hireEmployee, fireEmployee, processEmployeeWeek, calculateAgencyOverhead } from "./agency";
export type { EmployeeWorkResult } from "./employeeWork";
export {
  getEmployeeEfficiency,
  getEmployeeOfficeQualityBonus,
  processEmployeeWork,
} from "./employeeWork";
export { buildAgencyModifierLedger } from "./modifierLedger";
export type {
  AgencyModifierLedgerEntry,
  AgencyModifierLedgerInput,
  ModifierLedgerStatus,
} from "./modifierLedger";
export {
  MAX_ANALYST_CRAFT_BONUS,
  MAX_ANALYST_REVIEW_HISTORY,
  MAX_AVAILABLE_ANALYST_REVIEWS,
  appendAnalystReview,
  consumeAnalystReview,
  createAnalystReviewArtifact,
  formatAnalystEvidenceCategory,
  formatAnalystReviewBias,
  getApplicableAnalystReview,
  normalizeAnalystReviewHistory,
  toAppliedAnalystReview,
} from "./analystReviews";
export { updateClientSatisfaction, processClientRelationshipWeek, pitchToClub, negotiateRetainerTerms, ensureClientRelationship, recordClientDelivery } from "./clientRelationships";
export { checkEmployeeEvents, resolveEmployeeEvent, expireEmployeeEvents } from "./employeeEvents";
export {
  openSatelliteOffice,
  closeSatelliteOffice,
  assignEmployeeToSatellite,
  unassignEmployeeFromSatellite,
  processSatelliteOfficeCosts,
  getHomeBaseRelocationQuote,
  relocateHomeBase,
  SATELLITE_OFFICE_CLOSURE_BASE_COST,
} from "./internationalExpansion";
export type {
  HomeBaseRelocationQuote,
  HomeBaseRelocationResult,
} from "./internationalExpansion";
export { processAnnualAwards } from "./awards";
export { getLoanEligibility, takeLoan, processLoanPayment, repayLoanEarly } from "./loans";
export {
  canCompleteConsulting,
  generateConsultingOffers,
  acceptConsulting,
  expireConsultingOffers,
  recordConsultingReportDelivery,
  processConsultingDeadline,
  completeConsulting,
} from "./consulting";
export { settleYouthAgencyPlacement } from "./youthAgencySettlement";
export {
  calculateMonthlyRunRate,
  calculateProfitAndLoss,
  forecastCashFlow,
  calculateRevenueBreakdown,
  calculateNetWorth,
  calculateAgencyHealth,
} from "./dashboard";
export type { AgencyHealthMetrics } from "./dashboard";
export {
  getAgencyCapacity,
  canAcceptRetainerWork,
  canAcceptConsultingWork,
} from "./agencyCapacity";
export type { AgencyCapacity } from "./agencyCapacity";
export {
  getRecoverySuggestions,
  isBankruptcyRecoveryActive,
  processDistress,
  sellEquipmentForCash,
} from "./distress";

// F14: Financial Strategy Layer
export {
  createDefaultInfrastructure,
  purchaseDataSubscription,
  upgradeTravelBudget,
  upgradeOfficeEquipment,
  calculateInfrastructureEffects,
  processWeeklyInfrastructureCosts,
  getTripQuality,
  TRIP_QUALITY_PRESETS,
  getDataSubscriptionCost,
  getDataSubscriptionWeekly,
  getDataSubscriptionBonus,
  getDataSubscriptionSystems,
  getTravelBudgetCost,
  getTravelBudgetWeekly,
  getTravelBudgetFatigue,
  getOfficeEquipmentCost,
  getOfficeEquipmentWeekly,
  getOfficeEquipmentBonus,
} from "./scoutingInvestment";

export {
  hireAssistantScout,
  fireAssistantScout,
  assignAssistantScout,
  unassignAssistantScout,
  processAssistantScoutWeek,
  MAX_ASSISTANT_SCOUTS,
} from "./assistantScouts";

export {
  getIncomeMultiplier,
  applySpecBonus,
  calculateSpecMonthlyBonus,
  calculateSpecUniqueIncome,
  canAddAcademyPartnership,
  getMaxAcademyPartnerships,
  calculateTransferBonus,
  getSpecIncomeDescription,
  getSpecIncomeLabel,
  getSpecTier3Label,
  TRANSFER_WINDOW_BONUS_RATE,
  PREDICTIVE_REPORT_MULTIPLIER,
} from "./specializationIncome";

export type { IncomeSource } from "./specializationIncome";
