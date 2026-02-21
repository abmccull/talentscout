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
