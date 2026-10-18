// All remote calls use an in-memory query mock.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";

const remote = vi.hoisted(() => {
  const rows = new Map<number, Record<string, unknown>>();
  const state = { userId: "user-1", readError: null as string | null };
  const getUser = vi.fn(async () => ({ data: { user: { id: state.userId } }, error: null }));
  const upsert = vi.fn(async (payload: Record<string, unknown>) => {
    rows.set(Number(payload.slot), structuredClone(payload));
    return { data: null, error: null };
  });
  const from = vi.fn((_table: string) => {
    const filters = new Map<string, unknown>();
    const result = () => ({
      data: [...rows.values()].filter(row => [...filters].every(([key, value]) => row[key] === value)),
      error: state.readError ? { message: state.readError } : null,
    });
    const query = {
      select: (_columns: string) => query,
      eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      order: (_key: string, _options?: unknown) => query,
      maybeSingle: async () => {
        const response = result();
        return { data: response.error ? null : response.data[0] ?? null, error: response.error };
      },
      then: (
        fulfilled: (value: ReturnType<typeof result>) => unknown,
        rejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(fulfilled, rejected),
      upsert,
    };
    return query;
  });
  return { rows, state, getUser, upsert, from };
});

// The wrapper admits optional cloud providers through the configuration module.
// Keep this suite on its mocked configured-cloud path; the network SDK below
// remains replaced by the in-memory query mock.
vi.mock("@/lib/supabaseConfiguration", () => ({ SUPABASE_CONFIGURED: true }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: remote.getUser }, from: remote.from },
}));
vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => ({ isAvailable: () => false }),
  isSteamRuntimeConfigured: () => false,
}));
vi.mock("@/lib/deferredErrorReporting", () => ({ captureException: vi.fn() }));

import { deleteSave, migrateSaveState, saveGameWithResult } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, createSaveEnvelope } from "@/lib/saveEnvelope";
import { createSaveProvider } from "@/lib/saveProvider";
import { SupabaseCloudSaveProvider } from "@/lib/supabaseCloudSave";

const goldenV0Path = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));
function stateAt(week: number): GameState {
  const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as { state: Record<string, unknown> };
  return migrateSaveState({ ...legacy.state, currentWeek: week });
}
function futureRemote(): string {
  const state = stateAt(30);
  const savedAt = Date.now() + 60_000;
  remote.rows.set(1, {
    user_id: "user-1", slot: 1, name: "Newer device",
    scout_name: `${state.scout.firstName} ${state.scout.lastName}`,
    season: state.currentSeason, week: state.currentWeek,
    specialization: state.scout.primarySpecialization, reputation: state.scout.reputation,
    saved_at: savedAt,
    state: { ...createSaveEnvelope(state, savedAt), schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1,
      futureOnly: { preciseValue: 7.123456789012345, earnedHistory: ["keep this original"] } },
  });
  return JSON.stringify(remote.rows.get(1));
}

describe.sequential("unsupported newer Supabase saves remain intact", () => {
  beforeAll(async () => { await Dexie.delete("TalentScoutDB"); });
  beforeEach(async () => {
    await deleteSave(1);
    remote.rows.clear(); remote.state.userId = "user-1"; remote.state.readError = null;
    vi.clearAllMocks();
  });
  afterAll(async () => { await deleteSave(1); });

  it("distinguishes an unsupported, otherwise valid remote envelope from an empty slot", async () => {
    const original = futureRemote();
    const provider = new SupabaseCloudSaveProvider("user-1");
    await expect(provider.downloadSave(1)).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
    expect(remote.upsert).not.toHaveBeenCalled();
  });

  it("does not turn a source-specific future-version error into absence", async () => {
    const original = futureRemote();
    const provider = createSaveProvider({ userId: "user-1", includeSteam: false });
    await expect(provider.loadFromSource("slot_1", "supabase")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("does not silently choose the older local branch when the remote head needs a newer client", async () => {
    await saveGameWithResult(1, "Older local", stateAt(7));
    const original = futureRemote();
    const provider = createSaveProvider({ userId: "user-1", includeSteam: false });
    await expect(provider.load("slot_1")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("does not hide an unsupported remote behind no-conflict or a generic local preference", async () => {
    await saveGameWithResult(1, "Older local", stateAt(7));
    const original = futureRemote();
    const provider = createSaveProvider({ userId: "user-1", includeSteam: false });
    await expect(provider.checkConflict("slot_1")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    await expect(provider.resolveConflict("slot_1", "local")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(remote.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("blocks direct uploads over unsupported remote bytes", async () => {
    const original = futureRemote();
    const provider = new SupabaseCloudSaveProvider("user-1");
    await expect(provider.uploadSave(1, stateAt(8), "Current client")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(remote.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("keeps the local commit and failed retry task while preserving the newer remote copy", async () => {
    const original = futureRemote();
    const provider = createSaveProvider({ userId: "user-1", includeSteam: false });
    await expect(provider.saveState("slot_1", stateAt(8), "Safe local", { waitForCloud: true })).rejects.toThrow("safe locally");
    await expect(provider.loadFromSource("slot_1", "local")).resolves.toMatchObject({ state: { currentWeek: 8 } });
    await expect(provider.getSyncStatus()).resolves.toMatchObject({ pendingCount: 1, failedCount: 1,
      lastError: expect.stringContaining("newer") });
    await expect(provider.retryPendingSync()).resolves.toMatchObject({ pendingCount: 1, failedCount: 1 });
    expect(remote.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("does not upload when the remote preservation read fails", async () => {
    const original = futureRemote();
    remote.state.readError = "remote read unavailable";
    const provider = new SupabaseCloudSaveProvider("user-1");
    await expect(provider.uploadSave(1, stateAt(8))).rejects.toThrow("remote read unavailable");
    expect(remote.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(remote.rows.get(1))).toBe(original);
  });

  it("retains the authenticated user/session boundary before cloud reads or writes", async () => {
    futureRemote();
    remote.state.userId = "other-user";
    const provider = new SupabaseCloudSaveProvider("user-1");
    await expect(provider.uploadSave(1, stateAt(8))).rejects.toThrow("session changed");
    await expect(provider.downloadSave(1)).rejects.toThrow("session changed");
    expect(remote.from).not.toHaveBeenCalled();
    expect(remote.upsert).not.toHaveBeenCalled();
  });

  it.each(["empty", "legacy", "supported", "corrupt-supported"] as const)(
    "allows an intentional upload into a %s slot while retaining the caller state",
    async (kind) => {
      if (kind !== "empty") {
        futureRemote();
        const prior = remote.rows.get(1)!;
        const priorState = stateAt(7);
        remote.rows.set(1, {
          ...prior,
          state: kind === "legacy"
            ? priorState
            : { ...createSaveEnvelope(priorState, 1),
                state: kind === "corrupt-supported" ? null : priorState },
        });
      }
      const incoming = stateAt(8);
      const incomingBytes = JSON.stringify(incoming);
      const savedAt = 123_456;
      const provider = new SupabaseCloudSaveProvider("user-1");

      await expect(provider.uploadSave(1, incoming, "Intentional current save", savedAt)).resolves.toBeUndefined();

      expect(remote.upsert).toHaveBeenCalledTimes(1);
      expect(remote.upsert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: "user-1", slot: 1, name: "Intentional current save", saved_at: savedAt,
      }), { onConflict: "user_id,slot" });
      expect(remote.rows.get(1)).toMatchObject({
        user_id: "user-1", slot: 1, name: "Intentional current save",
        season: incoming.currentSeason, week: 8, saved_at: savedAt,
        state: { schemaVersion: CURRENT_SAVE_SCHEMA_VERSION, savedAt, state: incoming },
      });
      expect(JSON.stringify(incoming)).toBe(incomingBytes);
    },
  );
});
