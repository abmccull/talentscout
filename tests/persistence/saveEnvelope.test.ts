import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveMigrationError,
  createSaveEnvelope,
  extractSaveStatePayload,
  migrateSaveEnvelope,
} from "@/lib/saveEnvelope";
import { migrateSaveRecord, migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

describe("save envelope migrations", () => {
  it("migrates the versionless golden record without changing its payload", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;

    const migrated = migrateSaveEnvelope(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.rulesVersion).toBe("youth-ea.3");
    expect(migrated.buildVersion).toBe("legacy-pre-versioning");
    expect(migrated.savedAt).toBe(1720656000000);
    expect(migrated.state).toMatchObject({
      currentSeason: 2,
      currentWeek: 7,
      youthRecruitmentBriefs: {},
      recommendationReviews: {},
      consequenceState: {
        decisions: {},
        consequences: {},
      },
      runManifest: {
        integrity: "legacy-import",
        creationRulesVersion: "legacy-pre-run-manifest",
      },
    });
    expect(legacy).not.toHaveProperty("schemaVersion");
  });

  it("runs envelope and game-state migrations through the canonical record entrypoint", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;

    const migrated = migrateSaveRecord(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.state.countries).toEqual(["england"]);
    expect(migrated.state.scout.skills.playerJudgment).toBe(5);
    expect(migrated.state.scout.skills.potentialAssessment).toBe(5);
    expect(migrated.state.scout.careerPath).toBe("independent");
    expect(migrated.state.scout.careerPathChosen).toBe(false);
  });

  it("does not reopen the path decision for established legacy careers", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: { scout: Record<string, unknown> };
    };
    legacy.state.scout.careerTier = 3;
    legacy.state.scout.careerPath = "independent";

    const migrated = migrateSaveState(legacy.state);

    expect(migrated.scout.careerPathChosen).toBe(true);
  });

  it("rejects corrupt record metadata before it reaches the game store", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as Record<
      string,
      unknown
    >;
    legacy.reputation = "excellent";

    expect(() => migrateSaveRecord(legacy)).toThrow(
      "Invalid save data: reputation must be finite",
    );
  });

  it("reconciles a legacy financial ledger through the direct state migration", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const state = {
      ...legacy.state,
      players: {},
      finances: {
        balance: 1_500,
        transactions: [
          { week: 4, season: 1, amount: 500, description: "Report sale" },
          { week: 4, season: 1, amount: -250, description: "Travel" },
        ],
      },
    };

    const migrated = migrateSaveState(state);
    const transactionCount = migrated.finances!.transactions.length;

    expect(
      migrated.finances!.transactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
    ).toBe(migrated.finances!.balance);
    expect(migrated.finances!.transactions[0]).toMatchObject({
      amount: 1_250,
      kind: "openingBalance",
    });
    expect(migrateSaveState(migrated).finances!.transactions).toHaveLength(
      transactionCount,
    );
  });

  it("is idempotent for a current envelope", () => {
    const current = createSaveEnvelope(
      { currentSeason: 1, currentWeek: 1, scout: {} },
      1234,
    );

    expect(migrateSaveEnvelope(migrateSaveEnvelope(current))).toEqual(current);
  });

  it("enriches v1 cases and decisions without losing historical records", () => {
    const migrated = migrateSaveEnvelope({
      schemaVersion: 1,
      rulesVersion: "youth-ea.1",
      buildVersion: "1.0.0",
      savedAt: 1234,
      state: {
        scoutingCases: {
          case_1: { reportIds: ["report_1", "report_2"] },
        },
        clubDecisions: {
          decision_1: { reason: "Budget did not fit" },
        },
      },
    });

    expect(migrated).toMatchObject({
      schemaVersion: 4,
      rulesVersion: "youth-ea.3",
      playerExperience: {
        version: 2,
        tutorial: { completed: false, dismissed: false },
        recentVeteranPrologueTemplateIds: [],
      },
      state: {
        scoutingCases: {
          case_1: {
            activeReportId: "report_2",
            hypothesisIds: [],
            reviewIds: [],
          },
        },
        clubDecisions: {
          decision_1: { reasons: ["Budget did not fit"] },
        },
        youthRecruitmentBriefs: {},
        recommendationReviews: {},
        consequenceState: {
          decisions: {},
          consequences: {},
        },
      },
    });
  });

  it("loads both legacy raw cloud state and versioned cloud payloads", () => {
    const state = { currentSeason: 3, currentWeek: 12, scout: {} };

    expect(extractSaveStatePayload(state)).toBe(state);
    expect(extractSaveStatePayload(createSaveEnvelope(state))).toBe(state);
  });

  it("rejects future save versions without modifying the source", () => {
    const future = {
      ...createSaveEnvelope({ currentSeason: 9 }),
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1,
    };
    const snapshot = structuredClone(future);

    expect(() => migrateSaveEnvelope(future)).toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({
        code: "FUTURE_VERSION",
      }),
    );
    expect(future).toEqual(snapshot);
  });

  it.each([
    null,
    {},
    { schemaVersion: "1", savedAt: 1, state: {} },
    {
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      rulesVersion: "youth-ea.1",
      buildVersion: "1.0.0",
      savedAt: -1,
      state: {},
    },
  ])("rejects corrupt envelope %#", (corrupt) => {
    expect(() => migrateSaveEnvelope(corrupt)).toThrow(SaveMigrationError);
  });
});
