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
  canAfford,
  purchaseEquipmentUpgrade,
  getEquipmentObservationBonus,
  isBroke,
  takeBusinessLoan,
  repayLoan,
  applyFirstReportBonus,
  applyFirstPlacementBonus,
  processStarterStipend,
} from "./expenses";

export {
  getActiveEquipmentBonuses,
  getEquipmentMonthlyTotal,
  purchaseEquipmentItem,
  sellEquipmentItem,
  equipItem,
  migrateEquipmentLevel,
  createDefaultInventory,
} from "./equipmentBonuses";

export type { EquipmentPassiveBonus } from "./equipmentBonuses";

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

export { migrateFinancialRecord, migrateEmployeeSkillsInRecord, migrateReportListingBids } from "./saveMigration";
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

// Economics Revamp modules
export { LIFESTYLE_TIERS, getDefaultLifestyle, changeLifestyle, getLifestyleReputationPenalty, getLifestyleNetworkingBonus } from "./lifestyle";
export { calculatePerformanceBonusAmount, calculateSigningBonus, calculateDiscoveryBonus, calculateDepartmentBonusPool, calculateGoldenParachute } from "./clubBonuses";
export { calculateReportPrice, listReport, withdrawListing, expireOldListings, processMarketplaceBids, acceptBid, declineBid } from "./reportMarketplace";
export { calculatePlacementFee, calculateYouthPlacementFee, calculateSellOnPercentage, processSellOnClauses, checkPlacementFeeEligibility, triggerPlacementFee } from "./placementFees";
export { generateRetainerOffers, acceptRetainer, cancelRetainer, processRetainerDeliveries, recordRetainerDelivery, processRetainerRenewals } from "./retainers";
export { OFFICE_TIERS, SALARY_BY_ROLE, upgradeOffice, hireEmployee, fireEmployee, processEmployeeWeek, calculateAgencyOverhead } from "./agency";
export type { EmployeeWorkResult } from "./employeeWork";
export { getEmployeeEfficiency, processEmployeeWork } from "./employeeWork";
export { updateClientSatisfaction, processClientRelationshipWeek, pitchToClub, negotiateRetainerTerms, ensureClientRelationship, recordClientDelivery } from "./clientRelationships";
export { checkEmployeeEvents, resolveEmployeeEvent, expireEmployeeEvents } from "./employeeEvents";
export { openSatelliteOffice, closeSatelliteOffice, assignEmployeeToSatellite, unassignEmployeeFromSatellite, processSatelliteOfficeCosts } from "./internationalExpansion";
export { processAnnualAwards } from "./awards";
export { getLoanEligibility, takeLoan, processLoanPayment, repayLoanEarly } from "./loans";
export { generateConsultingOffers, acceptConsulting, processConsultingDeadline, completeConsulting } from "./consulting";
export { calculateProfitAndLoss, forecastCashFlow, calculateRevenueBreakdown, calculateNetWorth } from "./dashboard";

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
