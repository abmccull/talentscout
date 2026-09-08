import { describe, expect, it } from "vitest";
import fullPack from "@/data/portraits/documentary-v1.json";
import { createPortraitCatalog } from "@/engine/players/portraits/catalog";
import { bundledPortraitCatalog } from "@/engine/players/portraits/bundledCatalog";
import { revealPortraits, resolvePortrait } from "@/engine/players/portraits/allocation";
import { AGE_CHECKPOINTS } from "@/engine/players/portraits/types";

describe("portrait runtime index integrity", () => {
  const fullCatalog = createPortraitCatalog([fullPack]);

  it("retains every identity and image field except offline delivery digests", () => {
    expect(bundledPortraitCatalog.size).toBe(fullCatalog.size);
    for (const [id, source] of fullCatalog) {
      const runtime = bundledPortraitCatalog.get(id)!;
      const { allocationAllowed, ...actual } = runtime;
      expect(actual).toEqual({
        ...source,
        assets: source.assets.map((asset) => {
          const { sha256: _digest, ...image } = asset as typeof asset & { sha256: string };
          return image;
        }),
      });
      expect(runtime.canonicalFaceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(runtime.assets.every((image) => !("sha256" in image))).toBe(true);
      expect(allocationAllowed === false || allocationAllowed === undefined).toBe(true);
    }
  });

  it("preserves the full pack's saved bindings and all eight age resolutions", () => {
    const reviewedFullCatalog = new Map([...fullCatalog].map(([id, entry]) => [id, {
      ...entry, allocationAllowed: bundledPortraitCatalog.get(id)?.allocationAllowed,
    }]));
    const world = { players: {
      a: { id: "a", age: 15 }, b: { id: "b", age: 27 }, c: { id: "c", age: 35 },
    } };
    const date = { season: 1, week: 1 };
    const expected = revealPortraits(world, ["a", "b", "c"], date, "observed", reviewedFullCatalog);
    const actual = revealPortraits(world, ["a", "b", "c"], date, "observed", bundledPortraitCatalog);
    expect(actual.playerPortraits).toEqual(expected.playerPortraits);
    for (const reservation of Object.values(actual.playerPortraits.reservations)) {
      for (const age of AGE_CHECKPOINTS) {
        const full = resolvePortrait(reservation.identity, age, expected.playerPortraits, reviewedFullCatalog);
        const runtime = resolvePortrait(reservation.identity, age, actual.playerPortraits, bundledPortraitCatalog);
        expect(full.status).toBe("available");
        if (full.status !== "available") throw new Error("Expected a complete production lineage");
        expect(runtime).toEqual({ ...full, asset: {
          age: full.asset.age, path: full.asset.path, width: full.asset.width, height: full.asset.height,
        } });
      }
    }
  });
});
