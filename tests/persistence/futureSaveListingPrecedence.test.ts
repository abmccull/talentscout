import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveEntry, SaveSource } from "@/lib/saveProvider";

// Exercise the real store's grouping with only its provider boundary mocked.
const provider = vi.hoisted(() => ({
  listSaves: vi.fn<() => Promise<SaveEntry[]>>(async () => []),
  listRecoveryCopies: vi.fn(async () => []),
  getSyncStatus: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, lastError: null, oldestQueuedAt: null })),
}));
vi.mock("@/lib/activeSaveProvider", () => ({ getActiveSaveProvider: async () => provider }));

import { useGameStore } from "@/stores/gameStore";

function entry(source: SaveSource, name: string): SaveEntry {
  return {
    slotName: "autosave", slot: 0, source, name,
    scoutName: "Historical Scout", season: 19, week: 7,
    specialization: "youth", reputation: 71, savedAt: 123_456,
  };
}

beforeEach(() => {
  provider.listSaves.mockReset();
  useGameStore.setState({ saveSlots: [], saveRecoveryCopies: [] });
});
afterEach(() => {
  useGameStore.setState({ saveSlots: [], saveRecoveryCopies: [] });
});

describe("future save listings remain visible over supported fallback copies", () => {
  it.each([
    ["steam", false], ["steam", true], ["local", false], ["local", true],
  ] as const)("preserves the future %s warning regardless of provider list order (%s)", async (futureSource, reversed) => {
    const supportedSource = futureSource === "steam" ? "local" : "steam";
    const supported = entry(supportedSource, "Supported earlier branch");
    const future: SaveEntry = {
      ...entry(futureSource, "Newer-build career"),
      unavailable: { reason: "future-version", message: "This save requires a newer version. Update TalentScout." },
    };
    provider.listSaves.mockResolvedValue(reversed ? [future, supported] : [supported, future]);

    await useGameStore.getState().refreshSaveSlots();

    expect(useGameStore.getState().saveSlots).toHaveLength(1);
    expect(useGameStore.getState().saveSlots[0]).toMatchObject({
      slot: 0, source: futureSource, name: "Newer-build career",
      unavailable: { reason: "future-version", message: expect.stringMatching(/newer|update/i) },
    });
    expect(useGameStore.getState().saveSlots[0]?.recovery).toBeUndefined();
    expect(useGameStore.getState().saveSlots[0]?.localUnavailable).toBeUndefined();
  });

  it("retains supported cloud recovery for genuine local corruption", async () => {
    const damagedLocal = {
      ...entry("local", "Damaged local copy"),
      unavailable: { reason: "unrecoverable-corruption" as const, message: "This save is damaged." },
    };
    provider.listSaves.mockResolvedValue([damagedLocal, entry("steam", "Verified cloud copy")]);

    await useGameStore.getState().refreshSaveSlots();

    expect(useGameStore.getState().saveSlots[0]).toMatchObject({
      source: "steam", name: "Verified cloud copy",
      localUnavailable: { reason: "unrecoverable-corruption", message: "This save is damaged." },
    });
    expect(useGameStore.getState().saveSlots[0]?.unavailable).toBeUndefined();
  });
});
