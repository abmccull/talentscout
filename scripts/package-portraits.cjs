#!/usr/bin/env node
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { loadPortraitSources, parseFlags } = require("./portrait-source-loader.cjs");

const INSET = 2;
const ENCODER = { quality: 86, effort: 6, smartSubsample: false, alphaQuality: 100 };
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function optionalFile(filename) {
  try { return await fs.readFile(filename); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

async function assertExistingBytes(filename, bytes, root) {
  let actual;
  try { actual = await fs.realpath(filename); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (!inside(root, actual)) throw new Error("Published portrait symlink escapes its pack directory");
  const current = await fs.readFile(actual);
  if (!current.equals(bytes)) throw new Error("Refusing to replace published bytes: " + filename);
  return true;
}

async function ensureContainedParent(root, filename) {
  let ancestor = path.dirname(filename);
  while (true) {
    try {
      const actual = await fs.realpath(ancestor);
      if (actual !== root && !inside(root, actual)) throw new Error("Portrait output directory escapes its pack root");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error("Cannot resolve portrait output ancestor");
      ancestor = parent;
    }
  }
  await fs.mkdir(path.dirname(filename), { recursive: true });
  if (!inside(root, await fs.realpath(path.dirname(filename)))) throw new Error("Portrait output parent escapes its pack root");
}

function boundaries(values, count, extent, label) {
  if (!Array.isArray(values) || values.length !== count + 1 || values[0] !== 0 || values.at(-1) !== extent
    || values.some((value, index) => !Number.isInteger(value) || (index > 0 && value - values[index - 1] <= INSET * 2))) {
    throw new Error("Invalid exact source pixel boundaries: " + label);
  }
}

async function prepareAtlas(atlas, manifestDirectory, packId, api) {
  if (!["accepted-candidate", "approved"].includes(atlas.qa?.status)) throw new Error("Atlas has not passed editorial review: " + atlas.id);
  const source = await fs.readFile(path.resolve(manifestDirectory, atlas.path));
  const sourceSha256 = digest(source);
  if (sourceSha256 !== String(atlas.sha256).toLowerCase()) throw new Error("Source atlas hash mismatch: " + atlas.id);
  const metadata = await api.sharp(source, { limitInputPixels: 100_000_000 }).metadata();
  if (metadata.width !== atlas.width || metadata.height !== atlas.height) throw new Error("Source atlas dimensions changed: " + atlas.id);
  boundaries(atlas.columnBoundariesPx, api.AGE_CHECKPOINTS.length, metadata.width, atlas.id + " columns");
  boundaries(atlas.rowBoundariesPx, 4, metadata.height, atlas.id + " rows");
  if (!Array.isArray(atlas.lineages) || atlas.lineages.length !== 4) throw new Error("Expected four reviewed source lineages: " + atlas.id);
  const rows = new Set();
  const prepared = [];
  for (const lineage of [...atlas.lineages].sort((a, b) => a.row - b.row)) {
    if (!ID.test(lineage.id) || !Number.isInteger(lineage.row) || lineage.row < 0 || lineage.row > 3 || rows.has(lineage.row)) throw new Error("Invalid or duplicate source lineage row");
    if (!api.isVisualDNA(lineage.reviewedAnchors)) throw new Error("Reviewed structured anchors are missing or invalid: " + lineage.id);
    rows.add(lineage.row);
    const assets = [];
    const files = [];
    const tileEvidence = [];
    let canonical;
    for (const [column, age] of api.AGE_CHECKPOINTS.entries()) {
      const rectangle = {
        left: atlas.columnBoundariesPx[column] + INSET,
        top: atlas.rowBoundariesPx[lineage.row] + INSET,
        width: atlas.columnBoundariesPx[column + 1] - atlas.columnBoundariesPx[column] - INSET * 2,
        height: atlas.rowBoundariesPx[lineage.row + 1] - atlas.rowBoundariesPx[lineage.row] - INSET * 2,
      };
      const tile = api.sharp(source).extract(rectangle);
      const webp = await tile.clone().webp(ENCODER).toBuffer();
      const decoded = await api.sharp(webp).metadata();
      if (decoded.format !== "webp" || decoded.width !== rectangle.width || decoded.height !== rectangle.height) throw new Error("Encoder changed physical pixel dimensions: " + lineage.id);
      const asset = { age, path: "/images/portraits/" + packId + "/" + lineage.id + "/age-" + age + ".webp", sha256: digest(webp), width: decoded.width, height: decoded.height };
      assets.push(asset);
      files.push({ relativePath: "public" + asset.path, bytes: webp });
      tileEvidence.push({ age, rectangle, outputBytes: webp.length, outputSha256: asset.sha256, width: asset.width, height: asset.height });
      if (age === 22) {
        const png = await tile.clone().png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
        canonical = { bytes: png, sha256: digest(png) };
        files.push({ relativePath: "sources/" + lineage.id + "/age-22.png", bytes: png });
      }
    }
    if (!canonical) throw new Error("Missing canonical reference");
    const entry = { lineageId: lineage.id, revision: 1, canonicalFaceSha256: canonical.sha256, anchors: structuredClone(lineage.reviewedAnchors), provenance: "authored-catalog", assets };
    const evidence = {
      lineageId: lineage.id, atlasId: atlas.id, atlasSha256: sourceSha256,
      sourceDimensions: { width: metadata.width, height: metadata.height }, row: lineage.row, seamInsetPixels: INSET,
      canonicalReference: { age: 22, path: "sources/" + lineage.id + "/age-22.png", encoding: "lossless-png", sha256: canonical.sha256, bytes: canonical.bytes.length },
      encoder: { format: "webp", ...ENCODER }, tiles: tileEvidence,
    };
    files.push({ relativePath: "sources/" + lineage.id + "/source.json", bytes: json(evidence) });
    prepared.push({ entry, files });
  }
  return prepared;
}

async function safeOutputRoot(output) {
  if (output === path.parse(output).root) throw new Error("Output must be a dedicated pack directory, not a filesystem root");
  await fs.mkdir(output, { recursive: true });
  return fs.realpath(output);
}

async function stageFile(stage, relativePath, bytes) {
  const filename = path.resolve(stage, relativePath);
  if (!inside(stage, filename)) throw new Error("Staged portrait path escapes its pack directory");
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, bytes, { flag: "wx" });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), ["--repo", "--manifest", "--output", "--through-atlas", "--pack-id"]);
  if (!flags["--manifest"] || !flags["--output"] || !flags["--through-atlas"]) throw new Error("Usage: node scripts/package-portraits.cjs --manifest <json> --output <pack-directory> --through-atlas <number> [--pack-id documentary-v1] [--repo <repository>]");
  const api = loadPortraitSources(path.resolve(flags["--repo"] || process.cwd()));
  const manifestPath = path.resolve(flags["--manifest"]);
  const requestedOutput = path.resolve(flags["--output"]);
  const through = Number(flags["--through-atlas"]);
  const packId = flags["--pack-id"] || "documentary-v1";
  if (!Number.isInteger(through) || through < 1 || through > 512 || !ID.test(packId)) throw new Error("Invalid bounded atlas target or pack ID");
  const manifestBytes = await fs.readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (!sameJSON(manifest.ages, api.AGE_CHECKPOINTS)) throw new Error("Source age checkpoints do not match the game contract");
  if (!Array.isArray(manifest.atlases)) throw new Error("Missing source atlases");
  const atlases = manifest.atlases.filter((atlas) => Number(atlas.id.match(/^atlas-(\d+)$/)?.[1]) <= through).sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (atlases.length !== through || atlases.some((atlas, index) => atlas.id !== "atlas-" + String(index + 1).padStart(2, "0"))) throw new Error("Requested atlas sequence is incomplete");

  // Finish source validation and encoding before creating the output directory.
  const prepared = [];
  for (const atlas of atlases) prepared.push(...await prepareAtlas(atlas, path.dirname(manifestPath), packId, api));
  const duplicateIds = new Set();
  for (const { entry } of prepared) {
    if (duplicateIds.has(entry.lineageId)) throw new Error("Duplicate source lineage ID: " + entry.lineageId);
    duplicateIds.add(entry.lineageId);
  }
  const output = await safeOutputRoot(requestedOutput);
  const lockPath = path.join(output, ".portrait-pack.lock");
  const lock = await fs.open(lockPath, "wx").catch((error) => { throw new Error(error.code === "EEXIST" ? "Another packaging process owns this output; no files were published" : error.message); });
  let stage;
  try {
    await lock.writeFile(json({ pid: process.pid, startedAt: new Date().toISOString() }));
    const packPath = path.join(output, "portrait-pack.json");
    const originalPackBytes = await optionalFile(packPath);
    const originalPack = originalPackBytes ? api.validatePortraitPack(JSON.parse(originalPackBytes)) : undefined;
    if (originalPack && originalPack.packId !== packId) throw new Error("Output already contains a different pack ID");
    if (originalPack) {
      await api.verifyPortraitPackFiles(originalPack, path.join(output, "public"));
      await api.verifyPortraitSourceReferences(originalPack, path.join(output, "sources"));
    }
    const lineages = new Map(originalPack?.lineages.map((entry) => [entry.lineageId, entry]) || []);
    const fileMap = new Map();
    for (const { entry, files } of prepared) {
      const existing = lineages.get(entry.lineageId);
      if (existing && !sameJSON(existing, entry)) throw new Error("Published lineage metadata cannot be replaced: " + entry.lineageId);
      lineages.set(entry.lineageId, entry);
      for (const file of files) {
        const destination = path.resolve(output, file.relativePath);
        if (!inside(output, destination)) throw new Error("Portrait output path escapes its declared directory");
        await assertExistingBytes(destination, file.bytes, output);
        fileMap.set(file.relativePath, file.bytes);
      }
    }
    // An incremental subset also keeps every previously published lineage.
    for (const entry of lineages.values()) {
      const paths = [...entry.assets.map((asset) => "public" + asset.path), "sources/" + entry.lineageId + "/age-22.png", "sources/" + entry.lineageId + "/source.json"];
      for (const relativePath of paths) if (!fileMap.has(relativePath)) fileMap.set(relativePath, await fs.readFile(path.resolve(output, relativePath)));
    }
    const pack = api.validatePortraitPack({ schemaVersion: 1, packId, artDirectionVersion: "documentary-v1", reviewed: true, lineages: [...lineages.values()].sort((a, b) => a.lineageId.localeCompare(b.lineageId, "en")) });
    stage = path.join(output, ".portrait-stage-" + randomUUID());
    if (!inside(output, stage)) throw new Error("Invalid staging path");
    await fs.mkdir(stage);
    for (const [relativePath, bytes] of fileMap) await stageFile(stage, relativePath, bytes);
    await stageFile(stage, "portrait-pack.json", json(pack));
    const staged = await api.verifyPortraitPackFiles(pack, path.join(stage, "public"));
    await api.verifyPortraitSourceReferences(pack, path.join(stage, "sources"));
    const currentPackBytes = await optionalFile(packPath);
    if (digest(currentPackBytes || Buffer.alloc(0)) !== digest(originalPackBytes || Buffer.alloc(0))) throw new Error("Published pack changed during validation; aborting publication");

    // All bytes have passed full staged validation. Hard-link publication is
    // atomic per file and never overwrites an existing destination. The pack
    // index is replaced only after every referenced file is available.
    for (const [relativePath, bytes] of fileMap) {
      const destination = path.resolve(output, relativePath);
      await ensureContainedParent(output, destination);
      if (await assertExistingBytes(destination, bytes, output)) continue;
      try { await fs.link(path.resolve(stage, relativePath), destination); }
      catch (error) {
        if (error.code !== "EEXIST") throw new Error("Atomic portrait publication failed; output filesystem must support hard links: " + error.message);
        await assertExistingBytes(destination, bytes, output);
      }
    }
    await fs.rename(path.join(stage, "portrait-pack.json"), packPath);
    const verified = await api.verifyPortraitPackFiles(pack, path.join(output, "public"));
    const canonicalReferences = await api.verifyPortraitSourceReferences(pack, path.join(output, "sources"));
    const report = { status: "verified", packSha256: digest(json(pack)), manifestSha256: digest(manifestBytes), throughAtlas: through, ...verified, canonicalReferences, stagedBytes: staged.bytes, encoder: { format: "webp", ...ENCODER }, versions: { node: process.versions.node, sharp: api.sharp.versions.sharp, vips: api.sharp.versions.vips, webp: api.sharp.versions.webp } };
    await stageFile(stage, "file-verification.json", json(report));
    await fs.rename(path.join(stage, "file-verification.json"), path.join(output, "file-verification.json"));
    console.log(JSON.stringify({ status: report.status, output, packId, lineages: verified.people, images: verified.images, bytes: verified.bytes, canonicalReferences, packSha256: report.packSha256 }, null, 2));
  } finally {
    try {
      if (stage) {
        const resolvedStage = await fs.realpath(stage).catch((error) => { if (error.code === "ENOENT") return undefined; throw error; });
        if (resolvedStage) {
          if (!inside(output, resolvedStage) || !path.basename(resolvedStage).startsWith(".portrait-stage-")) throw new Error("Refusing cleanup outside the validated staging directory");
          await fs.rm(resolvedStage, { recursive: true, force: true });
        }
      }
    } finally {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
