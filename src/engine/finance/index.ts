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

export { migrateFinancialRecord } from "./saveMigration";

// Economics Revamp modules
export { LIFESTYLE_TIERS, getDefaultLifestyle, changeLifestyle, getLifestyleReputationPenalty, getLifestyleNetworkingBonus } from "./lifestyle";
export { calculatePerformanceBonusAmount, calculateSigningBonus, calculateDiscoveryBonus, calculateDepartmentBonusPool, calculateGoldenParachute } from "./clubBonuses";
export { calculateReportPrice, listReport, withdrawListing, expireOldListings, processMarketplaceSales } from "./reportMarketplace";
export { calculatePlacementFee, calculateYouthPlacementFee, calculateSellOnPercentage, processSellOnClauses, checkPlacementFeeEligibility, triggerPlacementFee } from "./placementFees";
export { generateRetainerOffers, acceptRetainer, cancelRetainer, processRetainerDeliveries, recordRetainerDelivery } from "./retainers";
export { OFFICE_TIERS, upgradeOffice, hireEmployee, fireEmployee, processEmployeeWeek, calculateAgencyOverhead } from "./agency";
export { getLoanEligibility, takeLoan, processLoanPayment, repayLoanEarly } from "./loans";
export { generateConsultingOffers, acceptConsulting, processConsultingDeadline, completeConsulting } from "./consulting";
export { calculateProfitAndLoss, forecastCashFlow, calculateRevenueBreakdown, calculateNetWorth } from "./dashboard";
