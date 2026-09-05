import { describe, expect, it } from "vitest";
import { bundledPortraitCatalog } from "@/engine/players/portraits/bundledCatalog";
import { revealPortraits, resolvePortrait } from "@/engine/players/portraits/allocation";
import { createVisualIdentity } from "@/engine/players/portraits/identity";

describe("art review preserves a seen face while retiring new allocations", () => {
  const person = { id: "seen-prospect", age: 18, visualIdentity: createVisualIdentity("seen-prospect") };
  const world = { players: { [person.id]: person } };
  const held = bundledPortraitCatalog.get("larch")!;

  it("cannot give a newly encountered player a held photographic identity", () => {
    expect(held.allocationAllowed).toBe(false);
    const heldOnly = new Map([[held.lineageId, held]]);
    const state = revealPortraits(world, [person.id], { week: 1, season: 1 }, "selected", heldOnly);
    expect(state.playerPortraits.reservations[person.visualIdentity.identityId].binding).toBeUndefined();
    expect(state.playerPortraits.faceOwners).toEqual({});
  });

  it("keeps an already photographed person recognizable after a catalog review", () => {
    const originalCatalog = new Map([[held.lineageId, { ...held, allocationAllowed: true }]]);
    const seen = revealPortraits(world, [person.id], { week: 1, season: 1 }, "selected", originalCatalog);
    const binding = structuredClone(seen.playerPortraits.reservations[person.visualIdentity.identityId].binding);
    const revisited = revealPortraits(seen, [person.id], { week: 2, season: 1 }, "observed", bundledPortraitCatalog);
    expect(revisited.playerPortraits.reservations[person.visualIdentity.identityId].binding).toEqual(binding);
    expect(resolvePortrait(person.visualIdentity, person.age, revisited.playerPortraits, bundledPortraitCatalog).status).toBe("available");
  });
});
