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
