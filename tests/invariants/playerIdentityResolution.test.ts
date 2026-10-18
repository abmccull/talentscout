import { expect, it } from "vitest";
import type { Player, UnsignedYouth } from "@/engine/core/types";
import { resolvePlayerDisplayName, resolvePlayerEntity } from "@/lib/playerResolution";

it("resolves an unsigned prospect by either record or player identity and survives placement and retirement", () => {
  const player = { id: "person", firstName: "Alex", lastName: "Reed" } as Player;
  const youth = { id: "youth-record", player } as UnsignedYouth;
  const unsigned = { players: {}, unsignedYouth: { [youth.id]: youth } };
  for (const id of [youth.id, player.id]) {
    expect(resolvePlayerDisplayName(unsigned, id)).toBe("Alex Reed");
    expect(resolvePlayerEntity(unsigned, id)?.playerId).toBe(player.id);
  }
  const placed = { players: { [player.id]: player }, unsignedYouth: {} };
  expect(resolvePlayerDisplayName(placed, player.id)).toBe("Alex Reed");
  const retired = { players: {}, unsignedYouth: {}, retiredPlayers: { [player.id]: player } };
  expect(resolvePlayerDisplayName(retired, player.id)).toBe("Alex Reed");
  expect(resolvePlayerEntity(retired, player.id)?.isRetired).toBe(true);
  expect(resolvePlayerEntity(retired, "missing")).toBeNull();
  expect(resolvePlayerDisplayName(retired, "missing")).toBe("Unknown Player");
});
