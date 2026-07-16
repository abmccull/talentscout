import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { RegionalKnowledge } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { processRegionalKnowledgeGrowth } from "@/engine/specializations/regionalKnowledge";
import { deriveRegionalPresence } from "@/engine/world/regionalPresence";
import { migrateSaveRecord, migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function legacyKnowledge(): RegionalKnowledge {
  return {
    countryId: "england",
    knowledgeLevel: 42,
    discoveredLeagues: [],
    culturalInsights: [],
    localContacts: [],
    scoutingEfficiency: 0.76,
  };
}

describe("regional depth save migration", () => {
  it("derives current presence dimensions and seeds ledger watermarks without back-paying history", () => {
    const legacyRecord = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;
    const baseline = migrateSaveRecord(legacyRecord).state;
    const legacyState = structuredClone(baseline);
    legacyState.regionalKnowledge = { england: legacyKnowledge() };
    legacyState.scout.countryReputations.england = {
      country: "england",
      familiarity: 42,
      reportsSubmitted: 9,
      successfulFinds: 2,
      contactCount: 3,
    };

    const migrated = migrateSaveState(legacyState);
    const presence = deriveRegionalPresence(migrated, "england");
    const firstTick = processRegionalKnowledgeGrowth(
      migrated,
      createRNG("regional-depth-migration"),
    );
    const secondTick = processRegionalKnowledgeGrowth(
      { ...migrated, regionalKnowledge: firstTick.regionalKnowledge },
      createRNG("regional-depth-migration"),
    );
    const migratedKnowledge = firstTick.regionalKnowledge.england;

    expect(migrated.regionalKnowledge.england.knowledgeLevel).toBe(42);
    expect(Object.keys(presence.dimensions).sort()).toEqual([
      "access",
      "intelligence",
      "logistics",
      "relationships",
    ]);
    expect(Object.values(presence.dimensions).every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 100,
    )).toBe(true);
    expect(migratedKnowledge.processedMetrics).toEqual({
      reportsSubmitted: 9,
      successfulFinds: 2,
      contactCount: 3,
    });
    expect(migratedKnowledge.knowledgeLedger).toEqual([]);
    expect(migratedKnowledge.knowledgeLevel).toBe(42);
    expect(secondTick.regionalKnowledge.england.knowledgeLevel).toBe(42);
    expect(secondTick.regionalKnowledge.england.knowledgeLedger).toEqual([]);
  });
});
