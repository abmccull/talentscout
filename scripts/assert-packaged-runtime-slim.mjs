import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import {
  defaultPackagedAppDirectory,
  resourceDirectoryCandidates,
  uniqueTopLevelPackages,
} from "./packaged-runtime-boundary.mjs";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");

function parseArgs(argv) {
  const options = {
    appDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--app-dir") {
      options.appDir = argv[index + 1] ?? options.appDir;
      index += 1;
    }
  }

  return options;
}

function sumFiles(targetPath) {
  if (!existsSync(targetPath)) return 0;
  const stats = statSync(targetPath);
  if (stats.isFile()) return stats.size;
  let total = 0;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    total += sumFiles(path.join(targetPath, entry.name));
  }
  return total;
}

function uniqueUnpackedPackages(targetPath) {
  if (!existsSync(targetPath)) return [];
  return readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      if (!entry.name.startsWith("@")) return [entry.name];
      const scopedPath = path.join(targetPath, entry.name);
      return readdirSync(scopedPath, { withFileTypes: true })
        .filter((child) => child.isDirectory())
        .map((child) => `${entry.name}/${child.name}`);
    })
    .sort();
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2));
  process.exit(1);
}

const { appDir } = parseArgs(process.argv.slice(2));
let resolvedAppDir = path.resolve(
  appDir ?? defaultPackagedAppDirectory(process.platform),
);
if (!appDir && process.platform === "darwin") {
  const appBundle = readdirSync(resolvedAppDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
    .flatMap((entry) => {
      const output = path.join(resolvedAppDir, entry.name);
      return readdirSync(output, { withFileTypes: true })
        .filter((child) => child.isDirectory() && child.name.endsWith(".app"))
        .map((child) => path.join(output, child.name));
    })[0];
  if (!appBundle) fail("packaged macOS .app bundle is missing", { dist: resolvedAppDir });
  resolvedAppDir = appBundle;
}
const resourcesDirectory = resourceDirectoryCandidates(resolvedAppDir)
  .find((candidate) => existsSync(path.join(candidate, "app.asar")));
if (!resourcesDirectory) {
  fail("packaged app.asar is missing", {
    appDir: resolvedAppDir,
    candidates: resourceDirectoryCandidates(resolvedAppDir),
  });
}
const appAsarPath = path.join(resourcesDirectory, "app.asar");
const unpackedNodeModulesPath = path.join(
  resourcesDirectory,
  "app.asar.unpacked",
  "node_modules",
);

const asarEntries = listPackage(appAsarPath);
const packagedNodeModules = uniqueTopLevelPackages(asarEntries);
const unpackedNodeModules = uniqueUnpackedPackages(unpackedNodeModulesPath);
const allowedPackages = ["steamworks.js"];

if (JSON.stringify(packagedNodeModules) !== JSON.stringify(allowedPackages)) {
  fail("app.asar contains unexpected packaged node_modules", {
    packagedNodeModules,
    allowedPackages,
  });
}

if (JSON.stringify(unpackedNodeModules) !== JSON.stringify(allowedPackages)) {
  fail("app.asar.unpacked contains unexpected node_modules", {
    unpackedNodeModules,
    allowedPackages,
  });
}

const appAsarBytes = statSync(appAsarPath).size;
const unpackedBytes = sumFiles(path.join(resourcesDirectory, "app.asar.unpacked"));

console.log(
  JSON.stringify(
    {
      ok: true,
      appDir: resolvedAppDir,
      appAsarBytes,
      unpackedBytes,
      packagedNodeModules,
      unpackedNodeModules,
    },
    null,
    2,
  ),
);
