// Unapplied local/mock contracts. Steam and Supabase are fully mocked.
import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSave, enqueueSaveSync, saveGameWithResult } from "@/lib/db";
import { createSaveProvider } from "@/lib/saveProvider";
import {
  NAME, SLOT, SLOT_NAME, assertCanonical, journalSnapshot, malformedRows,
  malformedState, readHead, recordFor, stateWithRows, v41LoanWire,
} from "./terminalOwnedUndefinedFixtures";

const steamState = vi.hoisted(() => ({ blobs: new Map<number, string>() }));
const steamMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  getCloudSave: vi.fn(async (slot: number) => steamState.blobs.get(slot) ?? null),
  setCloudSave: vi.fn(async (slot: number, data: string) => { steamState.blobs.set(slot, data); }),
  deleteCloudSave: vi.fn(async (slot: number) => { steamState.blobs.delete(slot); }),
  unlockAchievement: vi.fn(), getPlayerName: vi.fn(() => null), setRichPresence: vi.fn(),
  resetAllAchievements: vi.fn(),
}));
vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => steamMock, isSteamRuntimeConfigured: () => true,
}));
vi.mock("@/lib/supabase", () => ({ supabase: null }));

beforeEach(async () => { await deleteSave(SLOT); steamState.blobs.clear(); vi.clearAllMocks(); });
afterAll(async () => { await deleteSave(SLOT); steamState.blobs.clear(); });

describe.sequential("owned undefined through the actual local/mock save-provider APIs", () => {
  it("packs ordinary ownership before actual mocked Steam JSON and keeps lazy string loads lossless", async () => {
    const source = stateWithRows("ordinary");
    const before = structuredClone(source);
    const provider = createSaveProvider({ includeSteam: true });
    const commit = await provider.saveState(SLOT_NAME, source, NAME, { waitForCloud: true });
    expect(commit.wrote).toBe(true);
    expect(commit.record.schemaVersion).toBe(9);
    assertCanonical(commit.record.state);
    expect(steamMock.setCloudSave).toHaveBeenCalledTimes(1);
    const mirrored = JSON.parse(steamState.blobs.get(SLOT)!);
    expect(mirrored.schemaVersion).toBe(9);
    assertCanonical(mirrored.state);
    const local = await provider.loadFromSource(SLOT_NAME, "local");
    const remote = await provider.loadFromSource(SLOT_NAME, "steam");
    expect(local?.source).toBe("local");
    expect(remote?.source).toBe("steam");
    assertCanonical(local!.state);
    assertCanonical(remote!.state);
    expect(Object.getOwnPropertyDescriptor(local!, "data")?.get).toBeTypeOf("function");
    assertCanonical(JSON.parse(local!.data));
    assertCanonical(JSON.parse(remote!.data));
    const journal = await journalSnapshot();
    const mirroredBytes = steamState.blobs.get(SLOT);
    await provider.save(SLOT_NAME, local!.data, NAME, { waitForCloud: true });
    expect(await journalSnapshot()).toStrictEqual(journal);
    expect(steamMock.setCloudSave).toHaveBeenCalledTimes(1);
    expect(steamState.blobs.get(SLOT)).toBe(mirroredBytes);
    expect(source).toStrictEqual(before);
  });

  it("imports already packed JSON mixed histories through the string save API and keeps raw head facts canonical", async () => {
    const portable = JSON.stringify(stateWithRows("mixed"));
    const provider = createSaveProvider({ includeSteam: false });
    await provider.save(SLOT_NAME, portable, NAME);
    const head = await readHead();
    expect(head.schemaVersion).toBe(9);
    assertCanonical(head.state);
    const loaded = await provider.load(SLOT_NAME);
    assertCanonical(loaded!.state);
    assertCanonical(JSON.parse(loaded!.data));
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });

  it.each(malformedRows.filter(item => ["loan-mask-overlap", "obligation-undefined-not-present", "obligation-future-version-3"].includes(item.label)))(
    "rejects incoming $label before head/archive/queue/mirror changes", async item => {
      const provider = createSaveProvider({ includeSteam: true });
      await provider.saveState(SLOT_NAME, stateWithRows("v1", 14), "Previous generation", { waitForCloud: true });
      await provider.saveState(SLOT_NAME, stateWithRows("v1", 15), "Current generation", { waitForCloud: true });
      await enqueueSaveSync(await readHead(), "steam");
      const journal = await journalSnapshot();
      expect(journal.saveArchives).toHaveLength(1);
      expect(journal.saveSyncQueue).toHaveLength(1);
      const mirroredBytes = steamState.blobs.get(SLOT);
      steamMock.setCloudSave.mockClear();
      const badBytes = JSON.stringify(malformedState(item));
      await expect(provider.save(SLOT_NAME, badBytes, "Rejected archive", { waitForCloud: true })).rejects.toThrow(/invalid save data/i);
      expect(await journalSnapshot()).toStrictEqual(journal);
      expect(steamState.blobs.get(SLOT)).toBe(mirroredBytes);
      expect(steamMock.setCloudSave).not.toHaveBeenCalled();
    },
  );

  it("refuses a malformed schema-8 remote archive under the existing corrupt-copy policy without rewriting either copy", async () => {
    await saveGameWithResult(SLOT, "Valid local", stateWithRows("v1"));
    await enqueueSaveSync(await readHead(), "steam");
    const journal = await journalSnapshot();
    const bad = malformedState(malformedRows.find(item => item.label === "obligation-undefined-not-present")!);
    const remoteBytes = JSON.stringify(recordFor(bad, 8));
    steamState.blobs.set(SLOT, remoteBytes);
    const provider = createSaveProvider({ includeSteam: true });
    await expect(provider.loadFromSource(SLOT_NAME, "steam")).resolves.toBeNull();
    const local = await provider.loadFromSource(SLOT_NAME, "local");
    expect(local?.state.loanHistory).toStrictEqual([v41LoanWire(), v41LoanWire()]);
    expect(await journalSnapshot()).toStrictEqual(journal);
    expect(steamState.blobs.get(SLOT)).toBe(remoteBytes);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });

  it("refuses portable schema 10 with opaque remote facts before selecting or rewriting a supported local branch", async () => {
    await saveGameWithResult(SLOT, "Valid local", stateWithRows("v1"));
    await enqueueSaveSync(await readHead(), "steam");
    const journal = await journalSnapshot();
    const remoteBytes = JSON.stringify({ ...recordFor(stateWithRows("v1"), 10),
      state: { opaqueFutureFacts: { externalReference: "future-earned-proof", original: [null, "keep"] } } });
    steamState.blobs.set(SLOT, remoteBytes);
    const provider = createSaveProvider({ includeSteam: true });
    await expect(provider.loadFromSource(SLOT_NAME, "steam")).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    await expect(provider.load(SLOT_NAME)).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(await journalSnapshot()).toStrictEqual(journal);
    expect(steamState.blobs.get(SLOT)).toBe(remoteBytes);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });
});
