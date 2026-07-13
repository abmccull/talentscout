import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CURRENT_PLAYER_EXPERIENCE_VERSION,
  PLAYER_EXPERIENCE_STORAGE_KEY,
  MAX_RECENT_VETERAN_PROLOGUE_TEMPLATES,
  mergePersistedPlayerExperience,
  mergePlayerExperience,
  migratePlayerExperience,
  readPlayerExperience,
  recordVeteranPrologueTemplate,
  subscribePlayerExperience,
  updatePlayerExperience,
} from "@/lib/playerExperience";
import {
  createSaveEnvelope,
  extractSavePlayerExperience,
  migrateSaveEnvelope,
} from "@/lib/saveEnvelope";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("player experience persistence", () => {
  it("migrates the released tutorial-store shape", () => {
    expect(migratePlayerExperience({
      guidedSessionCompleted: true,
      dismissed: false,
    })).toEqual({
      version: CURRENT_PLAYER_EXPERIENCE_VERSION,
      tutorial: { completed: true, dismissed: false },
      recentVeteranPrologueTemplateIds: [],
      updatedAt: 0,
    });
  });

  it("merges completion and dismissal monotonically and deterministically", () => {
    const completed = {
      version: 1,
      tutorial: { completed: true, dismissed: false },
      updatedAt: 100,
    };
    const dismissed = {
      version: 1,
      tutorial: { completed: false, dismissed: true },
      updatedAt: 200,
    };

    const merged = mergePlayerExperience(completed, dismissed);
    expect(merged).toEqual({
      version: 2,
      tutorial: { completed: true, dismissed: true },
      recentVeteranPrologueTemplateIds: [],
      updatedAt: 200,
    });
    expect(mergePlayerExperience(dismissed, completed)).toEqual(merged);
    expect(mergePlayerExperience(merged, merged)).toEqual(merged);
  });

  it("keeps the offline cache and live subscribers in sync with loaded saves", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });

    const received: boolean[] = [];
    const unsubscribe = subscribePlayerExperience((record) => {
      received.push(record.tutorial.completed);
    });

    updatePlayerExperience({ tutorialDismissed: true, updatedAt: 10 });
    mergePersistedPlayerExperience({
      version: 1,
      tutorial: { completed: true, dismissed: false },
      updatedAt: 20,
    });
    unsubscribe();

    expect(readPlayerExperience()).toMatchObject({
      tutorial: { completed: true, dismissed: true },
      updatedAt: 20,
    });
    expect(received).toEqual([false, true]);
    expect(storage.getItem(PLAYER_EXPERIENCE_STORAGE_KEY)).not.toBeNull();
  });

  it("round-trips experience in current save envelopes", () => {
    const experience = {
      version: 2,
      tutorial: { completed: true, dismissed: false },
      recentVeteranPrologueTemplateIds: ["school-tip", "academy-release"],
      updatedAt: 123,
    };
    const envelope = createSaveEnvelope({ currentSeason: 1 }, 456, experience);

    expect(extractSavePlayerExperience(envelope)).toEqual(experience);
    expect(migrateSaveEnvelope(envelope)).toEqual(envelope);
  });

  it("adds a safe default while migrating schema-three saves", () => {
    const migrated = migrateSaveEnvelope({
      schemaVersion: 3,
      rulesVersion: "youth-ea.3",
      buildVersion: "1.0.0",
      savedAt: 123,
      state: { currentSeason: 1 },
    });

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.playerExperience).toEqual({
      version: 2,
      tutorial: { completed: false, dismissed: false },
      recentVeteranPrologueTemplateIds: [],
      updatedAt: 0,
    });
  });

  it("upgrades experience v1 inside an already-current save envelope", () => {
    const migrated = migrateSaveEnvelope({
      schemaVersion: 4,
      rulesVersion: "youth-ea.3",
      buildVersion: "1.0.0",
      savedAt: 123,
      playerExperience: {
        version: 1,
        tutorial: { completed: true, dismissed: false },
        updatedAt: 100,
      },
      state: { currentSeason: 1 },
    });

    expect(migrated.playerExperience).toEqual({
      version: 2,
      tutorial: { completed: true, dismissed: false },
      recentVeteranPrologueTemplateIds: [],
      updatedAt: 100,
    });
  });

  it("migrates, de-duplicates, and bounds legacy recent-template history", () => {
    const migrated = migratePlayerExperience({
      version: 1,
      guidedSessionCompleted: true,
      recentVeteranPrologueTemplateIds: [
        "school-tip",
        "academy-release",
        "school-tip",
        "data-anomaly",
        "agent-claim",
      ],
    });

    expect(migrated.version).toBe(2);
    expect(migrated.tutorial.completed).toBe(true);
    expect(migrated.recentVeteranPrologueTemplateIds).toEqual([
      "school-tip",
      "data-anomaly",
      "agent-claim",
    ]);
    expect(migrated.recentVeteranPrologueTemplateIds).toHaveLength(
      MAX_RECENT_VETERAN_PROLOGUE_TEMPLATES,
    );
  });

  it("merges older and newer histories while preserving tutorial truth", () => {
    const local = {
      version: 2,
      tutorial: { completed: true, dismissed: false },
      recentVeteranPrologueTemplateIds: ["school-tip", "academy-release"],
      updatedAt: 100,
    };
    const cloud = {
      version: 2,
      tutorial: { completed: false, dismissed: true },
      recentVeteranPrologueTemplateIds: ["academy-release", "data-anomaly"],
      updatedAt: 200,
    };

    const merged = mergePlayerExperience(local, cloud);
    expect(merged.tutorial).toEqual({ completed: true, dismissed: true });
    expect(merged.recentVeteranPrologueTemplateIds).toEqual([
      "school-tip",
      "academy-release",
      "data-anomaly",
    ]);
    expect(mergePlayerExperience(cloud, local)).toEqual(merged);
  });

  it("records only the three newest unique veteran templates", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(40)
      .mockReturnValueOnce(50);

    recordVeteranPrologueTemplate("school-tip");
    recordVeteranPrologueTemplate("academy-release");
    recordVeteranPrologueTemplate("data-anomaly");
    recordVeteranPrologueTemplate("school-tip");
    const finalRecord = recordVeteranPrologueTemplate("agent-claim");

    expect(finalRecord.recentVeteranPrologueTemplateIds).toEqual([
      "data-anomaly",
      "school-tip",
      "agent-claim",
    ]);
  });
});
