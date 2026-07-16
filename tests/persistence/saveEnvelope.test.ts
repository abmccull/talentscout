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
    expect(migrated.state.weeklyStrategy).toEqual({
      intentId: "balancedDesk",
      delegationPolicyId: "adaptiveDesk",
      lastChangedWeek: 7,
      lastChangedSeason: 2,
      history: [],
    });
  });

  it("keeps the canonical game-state migration pure and idempotent", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const original = structuredClone(legacy.state);

    const migrated = migrateSaveState(legacy.state);
    const migratedAgain = migrateSaveState(migrated);

    expect(legacy.state).toEqual(original);
    expect(migrated).not.toBe(legacy.state);
    expect(migrated.scout).not.toBe(legacy.state.scout);
    expect(migratedAgain).toEqual(migrated);
  });

  it("repairs expired youth once while preserving scout-authored history", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const baseline = migrateSaveState(legacy.state);
    const sourcePlayer = Object.values(baseline.players)[0];
    const trackedPlayer = {
      ...sourcePlayer,
      id: "expired-tracked-player",
      firstName: "Tracked",
      lastName: "Prospect",
      clubId: "",
      contractClubId: undefined,
      contractExpiry: 0,
      wage: 0,
    };
    const untrackedPlayer = {
      ...trackedPlayer,
      id: "expired-untracked-player",
      firstName: "Untracked",
    };
    const makeYouth = (id: string, player: typeof trackedPlayer) => ({
      id,
      player,
      visibility: 20,
      buzzLevel: 20,
      discoveredBy: [],
      regionId: "region-legacy-expired",
      country: "england",
      venueAppearances: [],
      generatedSeason: 4,
      placed: false,
      retired: false,
    });
    const reportId = "report-expired-tracked-player";
    const stale = {
      ...baseline,
      currentSeason: 8,
      unsignedYouth: {
        tracked: makeYouth("tracked", trackedPlayer),
        untracked: makeYouth("untracked", untrackedPlayer),
      },
      reports: {
        ...baseline.reports,
        [reportId]: {
          id: reportId,
          playerId: trackedPlayer.id,
          scoutId: baseline.scout.id,
          submittedWeek: 1,
          submittedSeason: 5,
          attributeAssessments: [],
          strengths: ["Worth remembering"],
          weaknesses: ["Pathway closed"],
          conviction: "note" as const,
          summary: "A historical report on an expired opportunity.",
          estimatedValue: 0,
          qualityScore: 25,
        },
      },
    };
    const original = structuredClone(stale);

    const migrated = migrateSaveState(stale);
    const migratedAgain = migrateSaveState(migrated);
    const trackedExits = migrated.playerMovementHistory.filter(
      (movement) => movement.playerId === trackedPlayer.id && movement.type === "footballExit",
    );

    expect(stale).toEqual(original);
    expect(migrated.unsignedYouth.tracked).toBeUndefined();
    expect(migrated.unsignedYouth.untracked).toBeUndefined();
    expect(migrated.retiredPlayers[trackedPlayer.id]).toMatchObject({
      id: trackedPlayer.id,
      firstName: trackedPlayer.firstName,
      lastName: trackedPlayer.lastName,
    });
    expect(migrated.retiredPlayers[untrackedPlayer.id]).toBeUndefined();
    expect(migrated.reports[reportId].playerId).toBe(trackedPlayer.id);
    expect(trackedExits).toHaveLength(1);
    expect(migratedAgain).toEqual(migrated);
  });

  it("normalizes required runtime collections at the canonical boundary", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const fitAssessment = { score: 81, source: "legacy report evidence" };
    const migrated = migrateSaveState({
      ...legacy.state,
      finances: { balance: 400, monthlyIncome: 0, equipmentLevel: 1, transactions: [] },
      systemFitCache: { "prospect:club": fitAssessment },
    });

    expect(migrated).toMatchObject({
      activeStorylines: [],
      eventChains: [],
      gossipItems: [],
      satisfactionHistory: [],
      freeAgentNegotiations: [],
      freeAgentPool: { agents: [], lastRefreshSeason: 2 },
      systemFitCache: { "prospect:club": fitAssessment },
    });
    expect(migrated.finances?.expenses).toMatchObject({
      lifestyle: 0,
      officeCost: 0,
      employeeSalaries: 0,
    });
  });

  it("repairs incomplete legacy attribute sources without introducing NaN ratings", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const migrated = migrateSaveState({
      ...legacy.state,
      players: {
        partial: {
          id: "partial",
          attributes: {
            tackling: Number.NaN,
            defensiveAwareness: Number.NaN,
            strength: 12,
          },
        },
      },
    });

    const attributes = migrated.players.partial.attributes;
    expect(Number.isFinite(attributes.tackling)).toBe(true);
    expect(Number.isFinite(attributes.finishing)).toBe(true);
    expect(Number.isFinite(attributes.teamwork)).toBe(true);
    expect(attributes.tackling).toBeGreaterThanOrEqual(1);
    expect(attributes.tackling).toBeLessThanOrEqual(20);
  });

  it("normalizes intermediate economics saves that already have a career path", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const migrated = migrateSaveState({
      ...legacy.state,
      finances: {
        balance: 250,
        monthlyIncome: 0,
        equipmentLevel: 1,
        expenses: {},
        transactions: [],
        careerPath: "independent",
      },
    });

    expect(migrated.finances).toMatchObject({
      careerPath: "independent",
      employees: [],
      reportListings: [],
      satelliteOffices: [],
      pendingEmployeeEvents: [],
      loans: [],
    });
  });

  it("converges direct-state and provider-record migration paths", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    } & Record<string, unknown>;

    const direct = migrateSaveState(legacy.state);
    const fromProviderRecord = migrateSaveRecord(legacy).state;

    expect(fromProviderRecord).toEqual(direct);
  });

  it("derives save-list metadata from the state it will actually load", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as Record<
      string,
      unknown
    >;
    legacy.season = 99;
    legacy.week = 44;
    legacy.scoutName = "Misleading Remote Name";
    legacy.reputation = 88;

    const migrated = migrateSaveRecord(legacy);

    expect(migrated).toMatchObject({
      season: migrated.state.currentSeason,
      week: migrated.state.currentWeek,
      scoutName: `${migrated.state.scout.firstName} ${migrated.state.scout.lastName}`,
      specialization: migrated.state.scout.primarySpecialization,
      reputation: migrated.state.scout.reputation,
    });
  });

  it("reconciles legacy country lists before generating active world conditions", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    };
    const state = {
      ...legacy.state,
      countries: ["england", "spain"],
      subRegions: {
        london: {
          id: "london",
          name: "London",
          country: "England",
          countryKey: "england",
          familiarity: 0,
        },
      },
      unsignedYouth: {
        prospect: {
          id: "prospect",
          country: "england",
          player: { id: "prospect-player" },
        },
      },
      youthTournaments: {},
    };

    const migrated = migrateSaveState(state);

    expect(migrated.countries).toEqual(["england"]);
    expect(migrated.worldConditionState?.active.every(
      (condition) =>
        condition.scope === "global" || condition.countryId === "england",
    )).toBe(true);
  });

  it("repairs an omitted legacy skills map without mutating the source", () => {
    const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: { scout: Record<string, unknown> };
    };
    delete legacy.state.scout.skills;

    const migrated = migrateSaveState(legacy.state);

    expect(legacy.state.scout).not.toHaveProperty("skills");
    expect(migrated.scout.skills).toMatchObject({
      playerJudgment: 5,
      potentialAssessment: 5,
    });
  });

  it.each([
    {
      state: { currentSeason: 1, currentWeek: 1, scout: null },
      message: "scout must be an object",
    },
    {
      state: { currentSeason: 0, currentWeek: 1, scout: {} },
      message: "currentSeason and currentWeek must be positive integers",
    },
    {
      state: { currentSeason: 1, currentWeek: Number.NaN, scout: {} },
      message: "currentSeason and currentWeek must be positive integers",
    },
  ])("rejects malformed-but-key-present legacy state: $message", ({ state, message }) => {
    expect(() => migrateSaveState(state)).toThrow(message);
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
