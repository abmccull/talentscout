import { describe, expect, it } from "vitest";
import type { EquipmentItemId, FinancialRecord, NewGameConfig } from "@/engine/core/types";
import { getEquipmentLiquidationQuote, sellEquipmentForCash } from "@/engine/finance/distress";
import { DEFAULT_LOADOUT, DEFAULT_OWNED_ITEMS, getEquipmentItem } from "@/engine/finance/equipmentCatalog";
import { initializeFinances } from "@/engine/finance/expenses";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";

function createFinances(ownedItems: EquipmentItemId[] = []): FinancialRecord {
  const config: NewGameConfig = {
    scoutFirstName: "Inventory", scoutLastName: "Scout", scoutAge: 30,
    specialization: "youth", difficulty: "normal", worldSeed: "inventory-liquidation",
    startingCountry: "england", selectedCountries: ["england"],
    skillAllocations: {
      technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
      tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1,
    },
  };
  const finances = initializeFinances(createScout(config, new RNG("inventory-scout")), "independent", "normal");
  return {
    ...finances,
    equipment: { ownedItems: [...DEFAULT_OWNED_ITEMS, ...ownedItems], loadout: { ...DEFAULT_LOADOUT } },
  };
}

describe("emergency equipment liquidation", () => {
  it("quotes all owned upgrades including unequipped items and pays that exact quote", () => {
    const finances = createFinances(["notebook_t2", "notebook_t3", "video_t2"]);
    const before = structuredClone(finances);
    const quote = getEquipmentLiquidationQuote(finances, 5, 1);
    expect(quote.itemIds).toEqual(["notebook_t2", "notebook_t3", "video_t2"]);
    expect(quote.portfolioValue).toBe(1700);
    expect(quote.cashReceived).toBe(680);
    const sold = sellEquipmentForCash(finances, 1_000_000, 5, 1);
    expect(sold.balance - finances.balance).toBe(quote.cashReceived);
    expect(sold.transactions.at(-1)).toMatchObject({ amount: 680, category: "asset", referenceId: quote.referenceId });
    expect(sold.equipment).toEqual({ ownedItems: DEFAULT_OWNED_ITEMS, loadout: DEFAULT_LOADOUT });
    expect(finances).toEqual(before);
  });

  it("counts each owned item once and ignores unknown inventory IDs", () => {
    const finances = createFinances(["notebook_t2", "notebook_t2", "unknown-item" as EquipmentItemId]);
    const quote = getEquipmentLiquidationQuote(finances, 5, 1);
    expect(quote.itemIds).toEqual(["notebook_t2"]);
    expect(quote.cashReceived).toBe(120);
  });

  it("does not convert a stale legacy level or an unowned loadout into cash", () => {
    const finances = createFinances();
    finances.equipmentLevel = 5;
    finances.equipment!.loadout.notebook = "notebook_t4";
    expect(getEquipmentLiquidationQuote(finances, 5, 1).cashReceived).toBe(0);
    expect(sellEquipmentForCash(finances, 50_000, 5, 1)).toBe(finances);
    const missingInventory = { ...finances, equipment: undefined };
    expect(sellEquipmentForCash(missingInventory, 50_000, 5, 1)).toBe(missingInventory);
  });

  it("does not duplicate a payout even if new equipment is acquired during the same week", () => {
    const sold = sellEquipmentForCash(createFinances(["notebook_t2"]), 0, 5, 1);
    const repurchased = { ...sold, equipment: { ...sold.equipment!, ownedItems: [...sold.equipment!.ownedItems, "video_t2" as const] } };
    expect(getEquipmentLiquidationQuote(repurchased, 5, 1).cashReceived).toBe(0);
    expect(sellEquipmentForCash(repurchased, 500_000, 5, 1)).toBe(repurchased);
    expect(getEquipmentLiquidationQuote(repurchased, 6, 1).cashReceived).toBe(80);
  });

  it("recomputes from current assets instead of trusting a stale screen quote", () => {
    const finances = createFinances(["notebook_t2"]);
    const oldQuote = getEquipmentLiquidationQuote(finances, 5, 1);
    const current = { ...finances, equipment: { ...finances.equipment!, ownedItems: [...finances.equipment!.ownedItems, "video_t2" as const] } };
    const sold = sellEquipmentForCash(current, oldQuote.portfolioValue, 5, 1);
    expect(sold.balance - current.balance).toBe(200);
  });

  it("uses the same rounding rule for the displayed quote and the ledger", () => {
    const item = getEquipmentItem("notebook_t2")!;
    const originalCost = item.purchaseCost;
    try {
      item.purchaseCost = 302;
      const finances = createFinances([item.id]);
      const quote = getEquipmentLiquidationQuote(finances, 5, 1);
      expect(quote.cashReceived).toBe(121);
      expect(sellEquipmentForCash(finances, 302, 5, 1).balance - finances.balance).toBe(121);
    } finally {
      item.purchaseCost = originalCost;
    }
  });
});
