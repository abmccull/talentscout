#!/usr/bin/env node
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { loadPortraitSources, parseFlags } = require("./portrait-source-loader.cjs");

(async () => {
  const flags = parseFlags(process.argv.slice(2), ["--repo", "--pack", "--public", "--sources"]);
  if (!flags["--pack"] || !flags["--public"]) throw new Error("Usage: node scripts/verify-portrait-pack.cjs --pack <json> --public <public-directory> [--sources <source-directory>] [--repo <repository>]");
  const sources = loadPortraitSources(path.resolve(flags["--repo"] || process.cwd()));
  const rawPack = JSON.parse((await fs.readFile(path.resolve(flags["--pack"]), "utf8")).replace(/^\uFEFF/, ""));
  const result = await sources.verifyPortraitPackFiles(rawPack, path.resolve(flags["--public"]));
  const canonicalReferences = flags["--sources"]
    ? await sources.verifyPortraitSourceReferences(rawPack, path.resolve(flags["--sources"]))
    : undefined;
  const { files: _files, ...summary } = result;
  console.log(JSON.stringify({ status: "verified", ...summary, canonicalReferences }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
