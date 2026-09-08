import { describe, expect, it, vi } from "vitest";
import type { PlayerPortraitState } from "@/engine/players/portraits/types";
import { validatePortraitState } from "@/engine/players/portraits/state";

// Exercise the pure history selector without mounting a store or portrait image.
vi.mock("@/stores/gameStore", () => ({ useGameStore: vi.fn() }));
vi.mock("@/components/game/PlayerAvatar", () => ({ PlayerAvatar: () => null }));
import { buildPlayerAgeTimeline } from "@/components/game/PlayerAgeTimeline";

describe("retained photographic age history", () => {
  it("uses a newer age-31 portrait record after a player with an older age-27 snapshot is pruned", () => {
    const model = buildPlayerAgeTimeline({
      currentDate: { season: 12, week: 7 }, currentAge: undefined, retired: true,
      hasPortraitBinding: true, firstPortrait: { season: 8, week: 3, age: 31 },
      snapshots: [{ season: 4, age: 27 }],
    });
    expect(model?.frames.map((frame) => frame.age)).toEqual([27, 31]);
    expect(model?.frames.at(-1)).toMatchObject({
      age: 31, label: "Last recorded", date: { season: 8, week: 3 },
    });
    expect(model?.firstPortrait?.age).toBe(31);
    expect(model?.discovery).toBeUndefined();
  });

  it("does not invent extra years after the retired player's last recorded age", () => {
    const model = buildPlayerAgeTimeline({
      currentDate: { season: 40, week: 1 }, currentAge: 35, retired: true,
      hasPortraitBinding: true, firstPortrait: { season: 8, week: 3, age: 31 },
      snapshots: [{ season: 12, age: 35 }, { season: 45, age: 45 }],
    });
    expect(model?.frames.at(-1)).toMatchObject({ age: 35, label: "Last recorded", date: { season: 12 } });
    expect(model?.frames.some((frame) => frame.age > 35)).toBe(false);
  });
});

describe("portrait ledger import validation", () => {
  it.each([
    ["root", []],
    ["reservations", { version: 1, reservations: [], faceOwners: {} }],
    ["face ownership", { version: 1, reservations: {}, faceOwners: [] }],
    ["reservation entry", { version: 1, reservations: { "person:v1:a": [] }, faceOwners: {} }],
    ["non-record container", { version: 1, reservations: new Date(0), faceOwners: {} }],
  ])("rejects a malformed %s instead of losing identity keys during JSON serialization", (_label, raw) => {
    expect(() => validatePortraitState(raw as unknown as PlayerPortraitState)).toThrow();
  });

  it("rejects a non-string face owner without silently releasing the reserved face", () => {
    const raw = { version: 1, reservations: {}, faceOwners: { ["a".repeat(64)]: {} } };
    expect(() => validatePortraitState(raw as unknown as PlayerPortraitState)).toThrow("Invalid face ownership tombstone");
  });

  it("accepts JSON-compatible empty records and returns a detached ledger", () => {
    const raw: PlayerPortraitState = { version: 1, reservations: {}, faceOwners: {} };
    const validated = validatePortraitState(raw);
    expect(validated).toEqual(raw);
    expect(validated).not.toBe(raw);
    expect(validated.reservations).not.toBe(raw.reservations);
    expect(validated.faceOwners).not.toBe(raw.faceOwners);
  });
});


describe("the named person survives football-record pruning", () => {
  it("retains the name and original face through a serialized save with no remaining Player", async () => {
    const { revealPortraits } = await import("@/engine/players/portraits/allocation");
    const { bundledPortraitCatalog } = await import("@/engine/players/portraits/bundledCatalog");
    const { resolvePlayerDisplayName } = await import("@/lib/playerResolution");
    const source = { players: { ari: { id: "ari", age: 15, firstName: "Ari", lastName: "Reed" } }, unsignedYouth: {} };
    const seen = revealPortraits(source, ["ari"], { season: 1, week: 2 }, "observed", bundledPortraitCatalog);
    const binding = structuredClone(seen.playerPortraits.reservations["person:v1:ari"].binding);
    const pruned = JSON.parse(JSON.stringify({ ...seen, players: {}, retiredPlayers: {} }));
    pruned.playerPortraits = validatePortraitState(pruned.playerPortraits);
    expect(resolvePlayerDisplayName(pruned, "ari")).toBe("Ari Reed");
    expect(pruned.playerPortraits.reservations["person:v1:ari"].binding).toEqual(binding);
    expect(Object.values(pruned.playerPortraits.faceOwners)).toEqual(["person:v1:ari"]);
    pruned.playerPortraits.reservations["person:v1:ari"].displayName = { firstName: "Replacement" };
    expect(() => validatePortraitState(pruned.playerPortraits)).toThrow("Invalid portrait display name");
  });
});
