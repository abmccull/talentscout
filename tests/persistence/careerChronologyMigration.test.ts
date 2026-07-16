import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { migrateSaveRecord, migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

describe("career chronology save migration", () => {
  it("backfills retained tenure without inventing exact tier dates", () => {
    const legacyRecord = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;
    const legacyState = structuredClone(migrateSaveRecord(legacyRecord).state);
    Reflect.deleteProperty(legacyState, "careerChronology");
    legacyState.currentSeason = 13;
    legacyState.scout.careerTier = 4;
    legacyState.legacyScore.totalSeasons = 12;
    legacyState.legacyScore.careerHighTier = 5;

    const migrated = migrateSaveState(legacyState);
    const reloaded = migrateSaveState(migrated);

    expect(migrated.careerChronology).toEqual({
      version: 1,
      startedSeason: 1,
      lastAgedSeason: 13,
      completedSeasons: 12,
      peakTier: 5,
      tierReachedAt: {},
      inferredFromLegacy: true,
    });
    expect(reloaded).toEqual(migrated);
  });
});
