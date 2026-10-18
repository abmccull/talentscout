#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadPortraitSources } = require("./portrait-source-loader.cjs");

const repo = path.resolve(__dirname, "..");
const write = process.argv.length === 3 && process.argv[2] === "--write";
if (!write && !(process.argv.length === 3 && process.argv[2] === "--check")) {
  throw new Error("Use --check to validate the built-in runtime index, or --write after publishing an offline pack.");
}
const dataDirectory = path.join(repo, "src/data/portraits");
const runtimePath = path.join(repo, "src/data/portraits/documentary-runtime.json");
const { validatePortraitPack, createPortraitCatalog } = loadPortraitSources(repo);
const sources = JSON.parse(fs.readFileSync(path.join(dataDirectory, "bundled-packs.json"), "utf8"));
const packs = sources.map((source) => {
  if (!/^[a-z][a-z0-9-]+\.json$/.test(source.file) || !Number.isInteger(source.allocationPriority)) throw new Error("Invalid bundled pack source");
  return validatePortraitPack(JSON.parse(fs.readFileSync(path.join(dataDirectory, source.file), "utf8").replace(/^\uFEFF/, "")));
});
createPortraitCatalog(packs); // Reject duplicate lineage IDs or canonical faces across packs.
// Preserve every identity field and checkpoint, omitting only delivery digests.
// Canonical face hashes still own saved reservations and may never be omitted.
const entries = packs.flatMap((pack, index) => pack.lineages.map(({ assets, ...lineage }) => ({
  ...lineage, packId: pack.packId, allocationPriority: sources[index].allocationPriority,
  assets: assets.map(({ sha256, ...image }) => image),
})));
if (write) fs.writeFileSync(runtimePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
const current = JSON.parse(fs.readFileSync(runtimePath, "utf8").replace(/^\uFEFF/, ""));
if (JSON.stringify(current) !== JSON.stringify(entries)) {
  throw new Error("Portrait runtime index differs from the validated full pack. Run node scripts/prepare-portrait-runtime.cjs --write and review the generated change.");
}
console.info(`PORTRAIT_RUNTIME_INDEX_PASS people=${entries.length} ages=${entries.reduce((count, entry) => count + entry.assets.length, 0)}`);
