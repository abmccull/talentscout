import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import type { CloudSaveSlot } from "@/lib/cloudSave";
import { deleteSave, migrateSaveRecord, migrateSaveState } from "@/lib/db";

const steamState = vi.hoisted(() => ({
  blobs: new Map<number, string>(),
}));

const supabaseState = vi.hoisted(() => ({
  failDeletes: false,
  records: new Map<number, {
    state: GameState;
    meta: CloudSaveSlot;
  }>(),
}));

const steamMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  setCloudSave: vi.fn(async (slot: number, data: string) => {
    steamState.blobs.set(slot, data);
  }),
  getCloudSave: vi.fn(async (slot: number) => steamState.blobs.get(slot) ?? null),
  deleteCloudSave: vi.fn(async (slot: number) => {
    steamState.blobs.delete(slot);
  }),
  unlockAchievement: vi.fn(),
  getPlayerName: vi.fn(() => null),
  setRichPresence: vi.fn(),
  resetAllAchievements: vi.fn(),
}));

vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => steamMock,
  isSteamRuntimeConfigured: () => true,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/lib/supabaseCloudSave", () => ({
  SupabaseCloudSaveProvider: class {
    async uploadSave(
      slot: number,
      state: GameState,
      name = `Save ${slot}`,
      savedAt = Date.now(),
    ): Promise<void> {
      supabaseState.records.set(slot, {
        state,
        meta: {
          slot,
          name,
          scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
          season: state.currentSeason,
          week: state.currentWeek,
          specialization: state.scout.primarySpecialization,
          reputation: state.scout.reputation,
          savedAt,
        },
      });
    }

    async downloadSave(slot: number): Promise<GameState | null> {
      return supabaseState.records.get(slot)?.state ?? null;
    }

    async listCloudSaves(): Promise<CloudSaveSlot[]> {
      return [...supabaseState.records.values()].map((entry) => entry.meta);
    }

    async deleteCloudSave(slot: number): Promise<void> {
      if (supabaseState.failDeletes) throw new Error("supabase delete offline");
      supabaseState.records.delete(slot);
    }
  },
}));

import { createSaveProvider } from "@/lib/saveProvider";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function stateAt(week: number): GameState {
  const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState({ ...legacy.state, currentWeek: week });
}

describe.sequential("multi-backend delete integrity", () => {
  beforeAll(async () => {
    await Dexie.delete("TalentScoutDB");
    steamState.blobs.clear();
    supabaseState.records.clear();
    supabaseState.failDeletes = false;
  });

  afterAll(async () => {
    supabaseState.failDeletes = false;
    await deleteSave(4);
  });

  it("keeps only the failed backend tombstone after a partial remote delete", async () => {
    const provider = createSaveProvider({ userId: "user-1", includeSteam: true });
    await provider.save(
      "slot_4",
      JSON.stringify(stateAt(19)),
      "Two clouds",
      { waitForCloud: true },
    );
    expect(steamState.blobs.has(4)).toBe(true);
    expect(supabaseState.records.has(4)).toBe(true);

    supabaseState.failDeletes = true;
    await expect(provider.delete("slot_4")).resolves.toBeUndefined();

    expect(steamState.blobs.has(4)).toBe(false);
    expect(supabaseState.records.has(4)).toBe(true);
    const restartedProvider = createSaveProvider({
      userId: "user-1",
      includeSteam: true,
    });
    await expect(restartedProvider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
      lastError: "supabase delete offline",
    });
    expect((await restartedProvider.listSaves()).some((save) => save.slot === 4))
      .toBe(false);

    supabaseState.failDeletes = false;
    await expect(restartedProvider.retryPendingSync()).resolves.toMatchObject({
      pendingCount: 0,
      failedCount: 0,
    });
    expect(supabaseState.records.has(4)).toBe(false);
    expect(steamState.blobs.has(4)).toBe(false);
    expect(
      steamState.blobs.get(4)
        ? migrateSaveRecord(JSON.parse(steamState.blobs.get(4)!) as unknown)
        : null,
    ).toBeNull();
  });
});
