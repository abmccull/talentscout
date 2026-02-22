/**
 * Equipment bonus system — aggregation, purchase, sell, equip, and migration.
 *
 * All functions are pure: no mutation, no side effects.
 */

import type { FinancialRecord, ActivityType } from "@/engine/core/types";
import {
  type EquipmentItemId,
  type EquipmentSlot,
  type EquipmentLoadout,
  type EquipmentInventory,
  type EquipmentItemDefinition,
  getEquipmentItem,
  EQUIPMENT_CATALOG,
  DEFAULT_LOADOUT,
  DEFAULT_OWNED_ITEMS,
} from "./equipmentCatalog";

// =============================================================================
// AGGREGATED BONUS TYPE
// =============================================================================

export interface EquipmentPassiveBonus {
  observationConfidence: number;
  videoConfidence: number;
  dataAccuracy: number;
  reportQuality: number;
  fatigueReduction: Partial<Record<ActivityType, number>>;
  travelCostReduction: number;
  travelSlotReduction: number;
  relationshipGainBonus: number;
  intelReliabilityBonus: number;
  youthDiscoveryBonus: number;
  gutFeelingBonus: number;
  attributesPerSession: number;
  familiarityGainBonus: number;
  paEstimateAccuracy: number;
  systemFitAccuracy: number;
  anomalyDetectionRate: number;
  predictionAccuracy: number;
  valuationAccuracy: number;
}

function emptyBonus(): EquipmentPassiveBonus {
  return {
    observationConfidence: 0,
    videoConfidence: 0,
    dataAccuracy: 0,
    reportQuality: 0,
    fatigueReduction: {},
    travelCostReduction: 0,
    travelSlotReduction: 0,
    relationshipGainBonus: 0,
    intelReliabilityBonus: 0,
    youthDiscoveryBonus: 0,
    gutFeelingBonus: 0,
    attributesPerSession: 0,
    familiarityGainBonus: 0,
    paEstimateAccuracy: 0,
    systemFitAccuracy: 0,
    anomalyDetectionRate: 0,
    predictionAccuracy: 0,
    valuationAccuracy: 0,
  };
}

// =============================================================================
// BONUS AGGREGATION
// =============================================================================

/**
 * Aggregate all effects from the currently equipped items into a single bonus struct.
 */
export function getActiveEquipmentBonuses(loadout: EquipmentLoadout): EquipmentPassiveBonus {
  const bonus = emptyBonus();

  const slotKeys: EquipmentSlot[] = ["notebook", "video", "travel", "network", "analysis"];

  for (const slot of slotKeys) {
    const itemId = loadout[slot];
    const item = getEquipmentItem(itemId);
    if (!item) continue;

    for (const effect of item.effects) {
      // Skip homeRegionOnly effects in aggregation — they're applied contextually by callers
      if (effect.homeRegionOnly) continue;

      switch (effect.type) {
        case "observationConfidence":
          bonus.observationConfidence += effect.value;
          break;
        case "videoConfidence":
          bonus.videoConfidence += effect.value;
          break;
        case "dataAccuracy":
          bonus.dataAccuracy += effect.value;
          break;
        case "reportQuality":
          bonus.reportQuality += effect.value;
          break;
        case "fatigueReduction":
          if (effect.activityTypes) {
            for (const at of effect.activityTypes) {
              bonus.fatigueReduction[at] = (bonus.fatigueReduction[at] ?? 0) + effect.value;
            }
          }
          break;
        case "travelCostReduction":
          bonus.travelCostReduction += effect.value;
          break;
        case "travelSlotReduction":
          bonus.travelSlotReduction += effect.value;
          break;
        case "relationshipGainBonus":
          bonus.relationshipGainBonus += effect.value;
          break;
        case "intelReliabilityBonus":
          bonus.intelReliabilityBonus += effect.value;
          break;
        case "youthDiscoveryBonus":
          bonus.youthDiscoveryBonus += effect.value;
          break;
        case "gutFeelingBonus":
          bonus.gutFeelingBonus += effect.value;
          break;
        case "attributesPerSession":
          bonus.attributesPerSession += effect.value;
          break;
        case "familiarityGainBonus":
          bonus.familiarityGainBonus += effect.value;
          break;
        case "paEstimateAccuracy":
          bonus.paEstimateAccuracy += effect.value;
          break;
        case "systemFitAccuracy":
          bonus.systemFitAccuracy += effect.value;
          break;
        case "anomalyDetectionRate":
          bonus.anomalyDetectionRate += effect.value;
          break;
        case "predictionAccuracy":
          bonus.predictionAccuracy += effect.value;
          break;
        case "valuationAccuracy":
          bonus.valuationAccuracy += effect.value;
          break;
      }
    }
  }

  return bonus;
}

// =============================================================================
// MONTHLY COST
// =============================================================================

/** Sum the monthly costs of all equipped items. */
export function getEquipmentMonthlyTotal(loadout: EquipmentLoadout): number {
  let total = 0;
  const slotKeys: EquipmentSlot[] = ["notebook", "video", "travel", "network", "analysis"];
  for (const slot of slotKeys) {
    const item = getEquipmentItem(loadout[slot]);
    if (item) total += item.monthlyCost;
  }
  return total;
}

// =============================================================================
// PURCHASE / SELL / EQUIP
// =============================================================================

/**
 * Purchase an equipment item and equip it immediately.
 * Returns updated FinancialRecord, or null if unaffordable or item not found.
 */
export function purchaseEquipmentItem(
  finances: FinancialRecord,
  itemId: EquipmentItemId,
  week: number,
  season: number,
): FinancialRecord | null {
  const item = getEquipmentItem(itemId);
  if (!item) return null;

  const inventory = finances.equipment ?? createDefaultInventory();

  // Already owned — just equip
  if (inventory.ownedItems.includes(itemId)) {
    return equipItem(finances, itemId);
  }

  if (finances.balance < item.purchaseCost) return null;

  const newLoadout = { ...inventory.loadout, [item.slot]: itemId };
  const newOwned = [...inventory.ownedItems, itemId];

  return {
    ...finances,
    balance: finances.balance - item.purchaseCost,
    equipment: { ownedItems: newOwned, loadout: newLoadout },
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -item.purchaseCost,
        description: `Purchased ${item.name}`,
      },
    ],
  };
}

/**
 * Sell an owned equipment item for 50% of purchase cost.
 * Cannot sell an item that is currently equipped (swap it out first) unless it's T1.
 * Returns updated FinancialRecord, or null if not owned or currently equipped.
 */
export function sellEquipmentItem(
  finances: FinancialRecord,
  itemId: EquipmentItemId,
  week: number,
  season: number,
): FinancialRecord | null {
  const item = getEquipmentItem(itemId);
  if (!item) return null;

  const inventory = finances.equipment ?? createDefaultInventory();

  if (!inventory.ownedItems.includes(itemId)) return null;

  // Cannot sell if currently equipped
  if (inventory.loadout[item.slot] === itemId) return null;

  // Cannot sell T1 items (they're free baseline)
  if (item.tier === 1) return null;

  const sellPrice = item.sellValue ?? Math.floor(item.purchaseCost * 0.5);
  const newOwned = inventory.ownedItems.filter((id: string) => id !== itemId);

  return {
    ...finances,
    balance: finances.balance + sellPrice,
    equipment: { ...inventory, ownedItems: newOwned },
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: sellPrice,
        description: `Sold ${item.name}`,
      },
    ],
  };
}

/**
 * Equip an already-owned item into its slot.
 * Returns updated FinancialRecord, or null if not owned.
 */
export function equipItem(
  finances: FinancialRecord,
  itemId: EquipmentItemId,
): FinancialRecord | null {
  const item = getEquipmentItem(itemId);
  if (!item) return null;

  const inventory = finances.equipment ?? createDefaultInventory();

  if (!inventory.ownedItems.includes(itemId)) return null;

  const newLoadout = { ...inventory.loadout, [item.slot]: itemId };

  return {
    ...finances,
    equipment: { ...inventory, loadout: newLoadout },
  };
}

// =============================================================================
// MIGRATION
// =============================================================================

/**
 * Convert an old-style equipmentLevel (1–5) into the new EquipmentInventory.
 * Maps higher levels to progressively better items across slots.
 */
export function migrateEquipmentLevel(level: number): EquipmentInventory {
  const migrations: Record<number, EquipmentLoadout> = {
    1: { notebook: "notebook_t1", video: "video_t1", travel: "travel_t1", network: "network_t1", analysis: "analysis_t1" },
    2: { notebook: "notebook_t2", video: "video_t1", travel: "travel_t1", network: "network_t1", analysis: "analysis_t1" },
    3: { notebook: "notebook_t3", video: "video_t2", travel: "travel_t1", network: "network_t1", analysis: "analysis_t2" },
    4: { notebook: "notebook_t3", video: "video_t3", travel: "travel_t2", network: "network_t2", analysis: "analysis_t3" },
    5: { notebook: "notebook_t4", video: "video_t4", travel: "travel_t4", network: "network_t4", analysis: "analysis_t4" },
  };

  const loadout = migrations[level] ?? migrations[1];
  const ownedItems = [...new Set([...DEFAULT_OWNED_ITEMS, ...Object.values(loadout)])];

  return { ownedItems, loadout };
}

// =============================================================================
// HELPERS
// =============================================================================

function createDefaultInventory(): EquipmentInventory {
  return {
    ownedItems: [...DEFAULT_OWNED_ITEMS],
    loadout: { ...DEFAULT_LOADOUT },
  };
}

/** Re-export for convenience. */
export { createDefaultInventory };
