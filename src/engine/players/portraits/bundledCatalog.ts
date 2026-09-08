import runtimeEntries from "@/data/portraits/documentary-runtime.json";
import type { CatalogEntry, PortraitCatalog } from "./types";

/** Reviewed offline photographs. Saved bindings never depend on catalog order. */
// The build checks this derived index against the strictly validated full pack.
// File checksums stay in the offline manifest; immutable face hashes stay here.
const entries = runtimeEntries as unknown as CatalogEntry[];
// Preserve photographed development saves; new careers cannot receive a lineage
// rejected or held by the cross-catalog age/likeness review.
const retiredAllocations = new Set(["gorse", "ink", "larch", "copper", "fern", "pebble"]);
export const bundledPortraitCatalog: PortraitCatalog = new Map(
  entries.map((entry) => [
    entry.lineageId, retiredAllocations.has(entry.lineageId) ? { ...entry, allocationAllowed: false } : entry,
  ]),
);
