import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const manifestPath = resolve(root, "docs/asset-provenance.json");
const outputPath = resolve(
  root,
  process.env.ASSET_AUDIT_OUTPUT ?? "artifacts/release/asset-provenance-audit.json",
);
const reportOnly = process.argv.includes("--report-only");

function normalizePath(value) {
  return value.split(sep).join("/");
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, "i");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const assetRoots = [resolve(root, "public/images"), resolve(root, "public/audio")];
const assetFiles = [];
for (const assetRoot of assetRoots) {
  try {
    assetFiles.push(...await walk(assetRoot));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const groups = manifest.assetGroups.map((group) => ({
  ...group,
  matchers: group.paths.map(globToRegExp),
}));
const auditedAssets = [];
for (const absolutePath of assetFiles.sort()) {
  const path = normalizePath(relative(root, absolutePath));
  const extension = extname(path).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".svg", ".mp3", ".wav", ".ogg"].includes(extension)) {
    continue;
  }
  const contents = await readFile(absolutePath);
  const metadata = await stat(absolutePath);
  const group = groups.find((candidate) => candidate.matchers.some((matcher) => matcher.test(path)));
  auditedAssets.push({
    path,
    bytes: metadata.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
    groupId: group?.id ?? null,
    rightsStatus: group?.rightsStatus ?? "untracked",
    evidenceCount: group?.evidence?.length ?? 0,
  });
}

const blockingStatuses = new Set(["reviewRequired", "rejected", "untracked"]);
const blockers = auditedAssets.filter((asset) =>
  blockingStatuses.has(asset.rightsStatus)
  || (asset.rightsStatus === "approved" && asset.evidenceCount === 0),
);
const groupSummary = groups.map((group) => ({
  id: group.id,
  rightsStatus: group.rightsStatus,
  evidenceCount: group.evidence?.length ?? 0,
  assetCount: auditedAssets.filter((asset) => asset.groupId === group.id).length,
}));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  manifestPath: normalizePath(relative(root, manifestPath)),
  manifestStatus: manifest.status,
  status: blockers.length === 0 ? "pass" : "blocked",
  summary: {
    assetCount: auditedAssets.length,
    trackedCount: auditedAssets.filter((asset) => asset.groupId).length,
    untrackedCount: auditedAssets.filter((asset) => !asset.groupId).length,
    blockerCount: blockers.length,
    totalBytes: auditedAssets.reduce((sum, asset) => sum + asset.bytes, 0),
  },
  groups: groupSummary,
  blockers,
  assets: auditedAssets,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.info(`ASSET_PROVENANCE_AUDIT ${JSON.stringify(report.summary)}`);
console.info(`Evidence: ${normalizePath(relative(root, outputPath))}`);

if (!reportOnly && blockers.length > 0) {
  console.error("Asset provenance is not release-approved. Review every blocker and attach commercial-rights evidence before changing its manifest status.");
  process.exitCode = 1;
}
