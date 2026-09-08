import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "@/engine/core/types";

vi.mock("@/stores/actions/persistGameplayAutosave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/actions/persistGameplayAutosave")>();
  return {
    ...actual,
    queueGameplayAutosave: vi.fn(),
    resetGameplayAutosaveWatermark: vi.fn(() => false),
  };
});

import { migrateSaveState } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { createVisualIdentity } from "@/engine/players/portraits/identity";

function player(id: string): Player {
  return {
    ...generatePlayer(createRNG(id), {
      position: "CM", ageRange: [17, 17], abilityRange: [45, 45],
      nationality: "England", clubId: "", firstName: "Ari", lastName: id,
    }),
    id,
    visualIdentity: createVisualIdentity(id),
  };
}

function legacyCareer(): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as {
    state: Record<string, unknown>;
  };
  return {
    ...fixture.state,
    seed: "portrait-live-load-boundary",
    players: { known: player("known"), unseen: player("unseen") },
    unsignedYouth: {}, retiredPlayers: {}, watchlist: ["known"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.setState({ gameState: null, activeSession: null, isLoaded: false, currentScreen: "mainMenu" });
});
afterEach(() => {
  useGameStore.setState({ gameState: null, activeSession: null, isLoaded: false, currentScreen: "mainMenu" });
});

describe("portrait allocation at the actual live-load boundary", () => {
  it("persistence normalization does not allocate; live load commits and queues the same known-player binding", () => {
    const raw = legacyCareer();
    const original = structuredClone(raw);
    const normalized = migrateSaveState(raw);
    expect(normalized.playerPortraits?.reservations).toEqual({});
    expect(queueGameplayAutosave).not.toHaveBeenCalled();

    useGameStore.getState().loadGame(normalized);
    const live = useGameStore.getState().gameState!;
    const reservation = live.playerPortraits!.reservations["person:v1:known"]!;
    expect(reservation.binding).toBeDefined();
    expect(reservation.identity).toEqual(createVisualIdentity("known"));
    expect(live.playerPortraits!.reservations["person:v1:unseen"]).toBeUndefined();
    expect(Object.keys(live.playerPortraits!.faceOwners)).toHaveLength(1);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    const queued = vi.mocked(queueGameplayAutosave).mock.calls[0]![0];
    expect(queued.playerPortraits).toBe(live.playerPortraits);
    expect(queued.playerPortraits!.reservations["person:v1:known"]!.binding).toBe(reservation.binding);
    expect(raw).toEqual(original);
    expect(normalized.playerPortraits?.reservations).toEqual({});
  });

  it("reloading the saved binding preserves ownership without queuing another allocation save", () => {
    useGameStore.getState().loadGame(legacyCareer());
    const first = useGameStore.getState().gameState!;
    const saved = JSON.parse(JSON.stringify(first)) as GameState;
    vi.mocked(queueGameplayAutosave).mockClear();

    useGameStore.getState().loadGame(saved);
    const second = useGameStore.getState().gameState!;
    expect(second.playerPortraits).toEqual(first.playerPortraits);
    expect(queueGameplayAutosave).not.toHaveBeenCalled();
  });

  it("normalizing a later save keeps existing ownership and leaves a newly known person unallocated", () => {
    useGameStore.getState().loadGame(legacyCareer());
    const live = useGameStore.getState().gameState!;
    const source = { ...live, watchlist: [...live.watchlist, "unseen"] };
    const normalized = migrateSaveState(source);
    expect(normalized.playerPortraits).toEqual(live.playerPortraits);
    expect(normalized.playerPortraits!.reservations["person:v1:unseen"]).toBeUndefined();
    expect(source.playerPortraits).toBe(live.playerPortraits);
  });

  it("enriches an existing nameless binding once without changing its face", () => {
    useGameStore.getState().loadGame(legacyCareer());
    const legacy = structuredClone(useGameStore.getState().gameState!);
    const binding = structuredClone(legacy.playerPortraits!.reservations["person:v1:known"]!.binding);
    delete legacy.playerPortraits!.reservations["person:v1:known"]!.displayName;
    vi.mocked(queueGameplayAutosave).mockClear();
    useGameStore.getState().loadGame(legacy);
    const enriched = useGameStore.getState().gameState!;
    expect(enriched.playerPortraits!.reservations["person:v1:known"]).toMatchObject({ displayName: "Ari known", binding });
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    vi.mocked(queueGameplayAutosave).mockClear();
    useGameStore.getState().loadGame(structuredClone(enriched));
    expect(queueGameplayAutosave).not.toHaveBeenCalled();
  });
});
