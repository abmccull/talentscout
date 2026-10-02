import { describe, expect, it } from "vitest";

import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { migratePlayerExperience } from "@/lib/playerExperience";
import {
  CURRENT_BUILD_VERSION,
  CURRENT_RULES_VERSION,
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveMigrationError,
  createSaveEnvelope,
  extractSaveStatePayload,
  migrateSaveEnvelope,
} from "@/lib/saveEnvelope";

const playerId = "newgen-england-s19-672602f1-9306-43c3-b17c-b605362daf01";
const fixtureId = "fixture-england-premier-league-s19-w07-0028";

function profileExperience() {
  return migratePlayerExperience({
    version: 2,
    tutorial: { completed: true, dismissed: false },
    recentVeteranPrologueTemplateIds: ["school-tip", "academy-release"],
    updatedAt: 123_456,
  });
}

function preservedState() {
  return {
    currentSeason: 19,
    currentWeek: 7,
    runManifest: {
      creationRulesVersion: "youth-ea.3",
      contentVersion: "run-content.1",
      worldSeed: "persistent-career-seed-02",
      customExtension: { authoredRule: "keep-original" },
    },
    players: {
      [playerId]: {
        id: playerId,
        age: 18,
        visualIdentity: createVisualIdentity(playerId),
        recentMatchRatings: [[fixtureId, 7, 19, 7.25]],
        seasonHistory: [{ season: 18, appearances: 29, goals: 8 }],
        customExtension: { authoredBiography: "earned career history" },
      },
    },
    retiredPlayers: {
      "retired-england-8b09b34e-070c-49c2-bfef-bf2ee56a2b7d": {
        id: "retired-england-8b09b34e-070c-49c2-bfef-bf2ee56a2b7d",
        retirementSeason: 18,
        careerAppearances: 301,
      },
    },
    unsignedYouth: [{ id: "unsigned-u16-intake-19", observationIds: ["observation-55"] }],
    watchlist: [playerId, "retired-england-8b09b34e-070c-49c2-bfef-bf2ee56a2b7d"],
    finances: {
      transactions: [{ id: "earned-payment-18", amount: 425, season: 18, week: 20 }],
    },
    consequenceState: {
      decisions: { "decision-18": { id: "decision-18", accepted: true } },
      consequences: { "consequence-18": { sourceDecisionId: "decision-18", resolved: false } },
    },
    portraitState: {
      faceOwners: { "face-lineage-29": playerId },
      reservations: { [playerId]: { identity: createVisualIdentity(playerId), lineageId: "face-lineage-29" } },
      tombstones: { "released-face-17": { lastOwnerId: "retired-history-owner" } },
    },
  };
}

function versionFourEnvelope() {
  return {
    schemaVersion: 4,
    rulesVersion: "saved-rules-pinned.3",
    buildVersion: "historical-build-fe60385",
    savedAt: 1_790_813_246_123,
    playerExperience: profileExperience(),
    state: preservedState(),
    slot: 2,
    name: "Season nineteen career",
    season: 19,
    week: 7,
    scoutName: "Historical Scout",
    specialization: "youth",
    reputation: 71,
    storageRevision: 184,
    contentVersion: "saved-content-pinned.1",
    customEnvelopeMetadata: { providerId: "preserved-external-save-id" },
  };
}

describe("portable save envelope schema 5 storage boundary", () => {
  it("writes the current schema for compact stored identities and fixture references without changing simulation versions", () => {
    const state = {
      currentSeason: 19,
      currentWeek: 7,
      players: {
        [playerId]: {
          id: playerId,
          visualIdentity: { version: 1 },
          recentMatchRatings: [[["england-premier-league", 28], 7, 19, 7.25]],
        },
      },
    };
    const sourceBytes = JSON.stringify(state);
    const envelope = createSaveEnvelope(state, 456_789, profileExperience());

    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(7);
    expect(envelope.schemaVersion).toBe(7);
    expect(envelope.rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(envelope.buildVersion).toBe(CURRENT_BUILD_VERSION);
    expect(envelope.savedAt).toBe(456_789);
    expect(envelope.playerExperience).toEqual(profileExperience());
    expect(envelope.state).toBe(state);
    expect(JSON.stringify(state)).toBe(sourceBytes);
  });

  it("upgrades complete v4 JSON by changing only envelope schema, preserving state, metadata, and original bytes", () => {
    const sourceBytes = JSON.stringify(versionFourEnvelope());
    const source = JSON.parse(sourceBytes) as ReturnType<typeof versionFourEnvelope>;
    const migrated = migrateSaveEnvelope(source);

    expect(migrated.schemaVersion).toBe(7);
    expect(migrated).toEqual({ ...source, schemaVersion: 7 });
    expect(migrated.state).toBe(source.state);
    expect(migrated.rulesVersion).toBe("saved-rules-pinned.3");
    expect(JSON.stringify(source)).toBe(sourceBytes);
    expect(JSON.stringify(migrated.state)).toBe(JSON.stringify(source.state));
    expect(extractSaveStatePayload(source)).toBe(source.state);
    expect(JSON.stringify(source)).toBe(sourceBytes);
  });

  it("accepts a v5 JSON payload containing old and new stored forms and remains byte-idempotent", () => {
    const oldEnvelope = versionFourEnvelope();
    const sourceBytes = JSON.stringify({
      ...oldEnvelope,
      schemaVersion: 5,
      state: {
        ...oldEnvelope.state,
        players: {
          ...oldEnvelope.state.players,
          "newgen-england-s19-canonical-second": {
            id: "newgen-england-s19-canonical-second",
            visualIdentity: { version: 1 },
            recentMatchRatings: [[["england-premier-league", 28], 7, 19, 7.25]],
          },
        },
      },
    });
    const source = JSON.parse(sourceBytes);
    const first = migrateSaveEnvelope(source);
    const second = migrateSaveEnvelope(JSON.parse(JSON.stringify(first)));

    const upgradedBytes = JSON.stringify({ ...source, schemaVersion: 7 });
    expect(first.schemaVersion).toBe(7);
    expect(first).toEqual({ ...source, schemaVersion: 7 });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).toBe(upgradedBytes);
    expect(JSON.stringify(second)).toBe(upgradedBytes);
    expect(extractSaveStatePayload(source)).toEqual(source.state);
    expect(JSON.stringify(source)).toBe(sourceBytes);
  });

  it("retains the future-version rejection and leaves unsupported source bytes recoverable", () => {
    const sourceBytes = JSON.stringify({ ...versionFourEnvelope(), schemaVersion: 8 });
    const source = JSON.parse(sourceBytes);

    expect(() => migrateSaveEnvelope(source)).toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(source)).toBe(sourceBytes);
  });
});
