import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import { ENGLAND_DATA } from "@/data/england";
import { getCountryData, getCountryDataSync } from "@/data";
import { deleteSave, migrateSaveRecord, migrateSaveState } from "@/lib/db";
import { importGameData, resetModData } from "@/lib/modLoader";
import { createSaveEnvelope } from "@/lib/saveEnvelope";
import { ElectronSteamInterface } from "@/lib/steam/electronSteamInterface";

const steamState = vi.hoisted(() => ({
  available: false,
  runtimeConfigured: true,
  failWrites: false,
  blobs: new Map<number, string>(),
  readyGate: null as Promise<void> | null,
  writeGate: null as Promise<void> | null,
  onReadyComplete: null as (() => void) | null,
}));

const steamMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => steamState.available),
  waitUntilReady: vi.fn(async () => {
    if (steamState.readyGate) {
      await steamState.readyGate;
    }
    steamState.onReadyComplete?.();
  }),
  setCloudSave: vi.fn(async (slot: number, data: string) => {
    if (steamState.writeGate) {
      await steamState.writeGate;
    }
    if (steamState.failWrites) throw new Error("steam offline");
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
  isSteamRuntimeConfigured: () => steamState.runtimeConfigured,
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function asSteamBlob(slot: number, state: GameState, savedAt: number): string {
  return JSON.stringify(
    migrateSaveRecord({
      ...createSaveEnvelope(state, savedAt),
      slot,
      name: `Cloud Week ${state.currentWeek}`,
      season: state.currentSeason,
      week: state.currentWeek,
      scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
      specialization: state.scout.primarySpecialization,
      reputation: state.scout.reputation,
    }),
  );
}

describe.sequential("audit P0 persistence & mod regressions", () => {
  beforeEach(async () => {
    await Dexie.delete("TalentScoutDB");
    steamState.available = false;
    steamState.runtimeConfigured = true;
    steamState.failWrites = false;
    steamState.blobs.clear();
    steamState.readyGate = null;
    steamState.writeGate = null;
    steamState.onReadyComplete = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    Reflect.deleteProperty(globalThis, "window");
    await resetModData();
    await Promise.all([0, 1, 2].map((slot) => deleteSave(slot)));
  });

  it("awaits async Electron Steam availability before reporting ready", async () => {
    const availability = deferred<boolean>();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          steam: {
            isAvailable: () => availability.promise,
            unlockAchievement: async () => undefined,
            setCloudSave: async () => undefined,
            getCloudSave: async () => null,
            deleteCloudSave: async () => undefined,
            getPlayerName: async () => "Deck Scout",
            setRichPresence: async () => undefined,
            resetAllAchievements: async () => undefined,
          },
        },
      },
    });

    const steam = new ElectronSteamInterface();
    expect(steam.isAvailable()).toBe(false);

    let readySettled = false;
    const readyPromise = steam.waitUntilReady().then(() => {
      readySettled = true;
    });

    await Promise.resolve();
    expect(readySettled).toBe(false);

    availability.resolve(true);
    await readyPromise;

    expect(readySettled).toBe(true);
    expect(steam.isAvailable()).toBe(true);
  });

  it("discovers and loads Steam Cloud saves on cold boot after waitUntilReady resolves", async () => {
    const gate = deferred<void>();
    const cloudState = stateAt(7);
    steamState.blobs.set(1, asSteamBlob(1, cloudState, 1_700_000_000_000));
    steamState.available = false;
    steamState.readyGate = gate.promise;
    steamState.onReadyComplete = () => {
      steamState.available = true;
    };

    const provider = createSaveProvider({ includeSteam: true });
    const listPromise = provider.listSaves();
    const loadPromise = provider.load("slot_1");

    gate.resolve();

    const entries = await listPromise;
    const loaded = await loadPromise;

    expect(steamMock.waitUntilReady).toHaveBeenCalled();
    expect(entries.some((entry) => entry.source === "steam" && entry.slot === 1)).toBe(true);
    expect(loaded?.source).toBe("steam");
    expect(loaded?.state.currentWeek).toBe(7);
  });

  it("awaits active Steam Cloud uploads on quit-save when online, and stays non-throwing when offline", async () => {
    steamState.available = true;
    const writeGate = deferred<void>();
    steamState.writeGate = writeGate.promise;

    const provider = createSaveProvider({ includeSteam: true });
    let finished = false;
    const quitSavePromise = provider
      .saveState("autosave", stateAt(4), "Autosave", { awaitCloudBestEffort: true })
      .then((res) => {
        finished = true;
        return res;
      });

    await vi.waitFor(() => expect(steamMock.setCloudSave).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);

    writeGate.resolve();
    await quitSavePromise;

    expect(finished).toBe(true);
    expect(steamState.blobs.has(0)).toBe(true);

    // Offline / failure path: best-effort quit-save must NOT throw, and must keep queue task
    steamState.writeGate = null;
    steamState.failWrites = true;
    await expect(
      provider.saveState("autosave", stateAt(5), "Autosave", { awaitCloudBestEffort: true }),
    ).resolves.toMatchObject({ wrote: true });

    const syncStatus = await provider.getSyncStatus();
    expect(syncStatus.pendingCount).toBeGreaterThanOrEqual(1);
    expect(syncStatus.failedCount).toBeGreaterThanOrEqual(1);
  });

  it("synchronizes countryRegistry on mod import and reverts immediately on resetModData", async () => {
    const moddedEngland = {
      ...ENGLAND_DATA,
      name: "Modded Albion",
    };
    const modFile = {
      size: JSON.stringify({ england: moddedEngland }).length,
      text: async () => JSON.stringify({ england: moddedEngland }),
    } as unknown as File;

    const importResult = await importGameData(modFile);
    expect(importResult.errors).toEqual([]);
    expect(importResult.imported).toEqual(["england"]);
    expect(getCountryDataSync("england")?.name).toBe("Modded Albion");
    expect((await getCountryData("england")).name).toBe("Modded Albion");

    await resetModData();
    expect(getCountryDataSync("england")?.name).toBe(ENGLAND_DATA.name);
    expect((await getCountryData("england")).name).toBe(ENGLAND_DATA.name);
  });
});
