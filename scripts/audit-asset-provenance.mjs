import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const requiredAssetRoots = ["public", "build"];
const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif", ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".ico", ".icns", ".woff", ".woff2", ".ttf", ".otf"]);
const fontExtensions = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const rightsStatuses = new Set(["approved", "projectSource", "reviewRequired", "rejected", "untracked"]);
const evidenceKinds = new Set(["rightsReview", "projectSource", "projectOutputInventory", "generationRecord", "supportingRecord"]);
const hashPattern = /^[a-f0-9]{64}$/i;
const hash = (contents) => createHash("sha256").update(contents).digest("hex");
const normalized = (path) => path.replaceAll("\\", "/");

export function safeRelativePath(path, allowGlob = false) {
  return typeof path === "string" && path.length > 0 && path === path.trim()
    && !path.includes("\\") && !path.includes(":") && !path.startsWith("/")
    && path.split("/").every((part) => part && part !== "." && part !== ".."
      && !/[. ]$/.test(part) && !/[<>"|]/.test(part)
      && (allowGlob || !/[*?]/.test(part))
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part));
}

async function ordinaryPath(root, path, directory = false) {
  if (!safeRelativePath(path)) throw new Error(`Unsafe relative path: ${String(path)}`);
  let current = root;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error(`Nonordinary path: ${path}`);
    const expectDirectory = index < parts.length - 1 || directory;
    if (expectDirectory ? !metadata.isDirectory() : !metadata.isFile()) {
      throw new Error(`Nonordinary path: ${path}`);
    }
  }
  return current;
}

export async function readOrdinaryFile(root, path) {
  return readFile(await ordinaryPath(root, path));
}

async function inventory(root, directory, extensions) {
  const results = [];
  async function walk(path) {
    const absolute = await ordinaryPath(root, path, true);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
        throw new Error(`Nonordinary path: ${child}`);
      }
      if (entry.isDirectory()) await walk(child);
      else if (extensions.has(extname(child).toLowerCase())) {
        const contents = await readOrdinaryFile(root, child);
        results.push({ path: child, bytes: contents.length, sha256: hash(contents) });
      }
    }
  }
  await walk(directory);
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

export async function listShippingFontFiles(root) {
  return inventory(root, "out/_next", fontExtensions);
}

function globToRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") { source += "(?:.*/)?"; index += 2; }
      else { source += ".*"; index += 1; }
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`, "i");
}

export async function writeOwnedReport(root, outputPath, report, { allowCanonicalRelease = false, inputPaths = [] } = {}) {
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("Report root is nonordinary");
  const path = normalized(relative(root, outputPath));
  const generated = path.startsWith("artifacts/release/generated/");
  const canonicalRelease = allowCanonicalRelease && path === "artifacts/release/release-evidence-check.json";
  if (!safeRelativePath(path) || (!generated && !canonicalRelease)) {
    throw new Error("Report output must be a new owned ignored release-report path");
  }
  const outputKey = resolve(outputPath).toLowerCase();
  if (inputPaths.filter((input) => typeof input === "string").some((input) => resolve(root, input).toLowerCase() === outputKey)) {
    throw new Error("Report output aliases a declared immutable input");
  }
  // Inspect only existing ancestors before Git, which rejects a path beyond a
  // symbolic link before it can reach the intended nonordinary-parent guard.
  // Missing ancestors stay absent until ownership/ignored/tracked checks pass.
  let existingParent = root;
  for (const part of path.split("/").slice(0, -1)) {
    existingParent = resolve(existingParent, part);
    let metadata;
    try { metadata = await lstat(existingParent); }
    catch (error) { if (error?.code === "ENOENT") break; throw error; }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Report output parent is nonordinary");
  }
  // An ignored scope is required, while even a tracked file under that scope is protected.
  await execFileAsync("git", ["check-ignore", "--quiet", "--", path], { cwd: root });
  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: root });
    throw new Error("Report output aliases a tracked source or historical file");
  } catch (error) {
    if (error?.code !== 1) throw error;
  }
  let current = root;
  for (const part of path.split("/").slice(0, -1)) {
    current = resolve(current, part);
    try { await mkdir(current); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Report output parent is nonordinary");
  }
  // Exclusive creation rejects existing files, hardlinks and symlink leaves.
  // No existing report is inspected as an excuse to replace or truncate it.
  const contents = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  const handle = await open(outputPath, "wx");
  try { await handle.writeFile(contents); await handle.sync(); }
  finally { await handle.close(); }
  if (hash(await readOrdinaryFile(root, path)) !== hash(contents)) throw new Error("New report raw readback failed");
}

function scopeMap(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Evidence owns no exact output scope");
  const result = new Map();
  for (const row of rows) {
    if (!safeRelativePath(row?.path) || !hashPattern.test(String(row?.sha256 ?? ""))
      || result.has(row.path.toLowerCase())) throw new Error("Evidence-owned output scope is invalid or duplicated");
    result.set(row.path.toLowerCase(), { path: row.path, sha256: row.sha256.toLowerCase() });
  }
  return result;
}

function evidenceOwnedScope(evidence, groupId, contents) {
  if (evidence.kind === "rightsReview" && evidence.path === "docs/release/steam-store-art-provenance.md") {
    // The unchanged genuine record already owns eight explicit final-output hashes.
    // Read only that table, rather than accepting source-master or arbitrary prose hashes.
    const text = contents.toString("utf8").replaceAll("\r\n", "\n");
    const section = text.split("## Final output hashes\n")[1]?.split("## Review record\n")[0];
    if (!section) throw new Error("Steam rights review lacks its final-output table");
    const rows = [...section.matchAll(/^\|\s*`([^`]+)`\s*\|[^|]+\|\s*`([a-f0-9]{64})`\s*\|\s*$/gim)]
      .map((match) => ({ path: `public/images/steam/${match[1]}`, sha256: match[2] }));
    const expected = ["steam-header-capsule.png", "steam-library-capsule-v2.png", "steam-library-hero.png", "steam-logo-transparent.png", "steam-main-capsule.png", "steam-page-background.png", "steam-small-capsule.png", "steam-store-hero-v2.png"];
    if (rows.length !== expected.length || expected.some((name) => !rows.some((row) => row.path === `public/images/steam/${name}`))) {
      throw new Error("Steam rights review final-output scope is unsupported");
    }
    return scopeMap(rows);
  }
  const record = JSON.parse(contents.toString("utf8"));
  if (evidence.kind === "rightsReview") {
    if (record.schemaVersion !== 1 || record.evidenceKind !== "asset-rights-review" || record.decision !== "approved"
      || typeof record.reviewer !== "string" || !record.reviewer.trim()
      || typeof record.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(record.reviewedAt)
      || !Number.isFinite(Date.parse(record.reviewedAt)) || Date.parse(record.reviewedAt) > Date.now()) {
      throw new Error("Rights evidence does not own an explicit approved output scope");
    }
    return scopeMap(record.reviewedOutputs);
  }
  if (evidence.kind === "projectOutputInventory") {
    // Existing immutable source-audit rows already mark screenshot outputs as
    // projectSource. They preserve that historical scope without a vendor record.
    if (record.schemaVersion !== 1 || record.status !== "pass" || !Array.isArray(record.assets)) {
      throw new Error("Project output inventory schema is unsupported");
    }
    return scopeMap(record.assets.filter((row) => row.groupId === groupId && row.rightsStatus === "projectSource"));
  }
  return null;
}

export async function auditAssetProvenance(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const blockers = [];
  const block = (code, message, details = {}) => blockers.push({ code, message, ...details });
  const manifestPath = "docs/asset-provenance.json";
  let manifest = null;
  let manifestSha256 = null;
  try {
    const contents = await readOrdinaryFile(root, manifestPath);
    manifestSha256 = hash(contents);
    manifest = JSON.parse(contents.toString("utf8"));
  } catch (error) { block("manifest-unreadable", String(error)); }
  if (manifest?.schemaVersion !== 2) block("manifest-schema", "Asset manifest requires schemaVersion 2");
  if (!["release-approved", "review-required"].includes(manifest?.status)) {
    block("manifest-status", "Asset manifest status is unknown");
  } else if (manifest.status !== "release-approved") {
    block("manifest-unresolved", "Current asset manifest remains review-required");
  }
  const roots = manifest?.assetRoots;
  if (!Array.isArray(roots) || roots.length !== requiredAssetRoots.length
    || new Set(roots).size !== roots.length || requiredAssetRoots.some((path) => !roots.includes(path))) {
    block("asset-roots", "Required assetRoots are exactly public and build; reducing scope is not approval");
  }
  let candidateCommitSha = null;
  let candidateTreeSha = null;
  async function identity() {
    const commit = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    const tree = await execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root });
    return [commit.stdout.trim().toLowerCase(), tree.stdout.trim().toLowerCase()];
  }
  try { [candidateCommitSha, candidateTreeSha] = await identity(); }
  catch (error) { block("candidate-unreadable", String(error)); }
  const assetFiles = [];
  for (const assetRoot of requiredAssetRoots) {
    try {
      const files = await inventory(root, assetRoot, mediaExtensions);
      assetFiles.push(...files);
      if (files.length === 0) block("asset-root-empty", `Required root ${assetRoot} contains no media`);
    } catch (error) {
      block(String(error).includes("Nonordinary") ? "nonordinary-path" : "asset-root-unreadable", String(error), { path: assetRoot });
    }
  }
  assetFiles.sort((left, right) => left.path.localeCompare(right.path));
  if (assetFiles.length === 0) block("asset-inventory-empty", "An empty asset inventory cannot pass");
  const groups = [];
  const ids = new Set();
  if (!Array.isArray(manifest?.assetGroups) || manifest.assetGroups.length === 0) {
    block("group-schema", "Nonempty assetGroups are required");
  }
  for (const group of Array.isArray(manifest?.assetGroups) ? manifest.assetGroups : []) {
    if (!group || typeof group !== "object" || typeof group.id !== "string" || !group.id.trim()
      || !Array.isArray(group.paths) || group.paths.length === 0
      || group.paths.some((path) => !safeRelativePath(path, true))) {
      block("group-schema", "Group needs an ID and nonempty safe patterns");
      continue;
    }
    if (ids.has(group.id)) block("group-id", `Duplicate group ID ${group.id}`);
    ids.add(group.id);
    if (!rightsStatuses.has(group.rightsStatus)) block("rights-status", `Unknown rights status in ${group.id}`);
    const reviewed = new Map();
    if (!Array.isArray(group.reviewedAssets)) block("reviewed-assets", `Exact reviewedAssets are required for ${group.id}`);
    for (const asset of Array.isArray(group.reviewedAssets) ? group.reviewedAssets : []) {
      if (!safeRelativePath(asset?.path) || !hashPattern.test(String(asset?.sha256 ?? "")) || reviewed.has(asset.path.toLowerCase())) {
        block("reviewed-assets", `Invalid or duplicate reviewed asset in ${group.id}`);
      } else reviewed.set(asset.path.toLowerCase(), { path: asset.path, sha256: asset.sha256.toLowerCase() });
    }
    const validEvidence = [];
    if (!Array.isArray(group.evidence)) block("evidence-schema", `Evidence must be an array in ${group.id}`);
    const evidencePaths = new Set();
    for (const evidence of Array.isArray(group.evidence) ? group.evidence : []) {
      if (!evidence || typeof evidence !== "object" || !safeRelativePath(evidence.path)
        || !hashPattern.test(String(evidence.sha256 ?? "")) || !evidenceKinds.has(evidence.kind)
        || evidencePaths.has(evidence.path.toLowerCase())) {
        block("evidence-schema", `Evidence needs a unique safe path, known kind and SHA-256 in ${group.id}`);
        continue;
      }
      evidencePaths.add(evidence.path.toLowerCase());
      try {
        const contents = await readOrdinaryFile(root, evidence.path);
        if (hash(contents) !== evidence.sha256.toLowerCase()) block("evidence-hash-drift", `Evidence changed: ${evidence.path}`, { groupId: group.id });
        else {
          let approvalScope = null;
          if (["rightsReview", "projectOutputInventory"].includes(evidence.kind)) {
            try { approvalScope = evidenceOwnedScope(evidence, group.id, contents); }
            catch (error) { block("approval-scope", String(error), { groupId: group.id, evidencePath: evidence.path }); continue; }
          }
          validEvidence.push({ ...evidence, approvalScope });
        }
      } catch (error) { block("evidence-unreadable", String(error), { groupId: group.id }); }
    }
    if (group.rightsStatus === "approved" && !validEvidence.some((item) => item.kind === "rightsReview")) {
      block("approval-evidence", `Approved group ${group.id} needs an applicable rightsReview record`);
    }
    if (group.rightsStatus === "projectSource" && !validEvidence.some((item) => item.kind === "projectSource")) {
      block("approval-evidence", `Project group ${group.id} needs an ordinary projectSource record; vendor records are unnecessary`);
    }
    const ownedScope = new Map();
    const approvalKind = group.rightsStatus === "approved" ? "rightsReview" : "projectOutputInventory";
    for (const evidence of validEvidence.filter((item) => item.kind === approvalKind)) {
      for (const [key, asset] of evidence.approvalScope ?? []) {
        if (ownedScope.has(key) && ownedScope.get(key).sha256 !== asset.sha256) block("approval-scope", `Conflicting immutable output scope in ${group.id}`);
        ownedScope.set(key, asset);
      }
    }
    if (["approved", "projectSource"].includes(group.rightsStatus)) for (const asset of reviewed.values()) {
      const owned = ownedScope.get(asset.path.toLowerCase());
      if (!owned || owned.path !== asset.path || owned.sha256 !== asset.sha256) {
        block("approval-scope", `Manifest scope cannot extend immutable evidence to ${asset.path}`, { groupId: group.id, path: asset.path });
      }
    }
    groups.push({ ...group, matchers: group.paths.map(globToRegExp), reviewed, validEvidence });
  }
  const assets = assetFiles.map((asset) => {
    const matches = groups.filter((group) => group.matchers.some((matcher) => matcher.test(asset.path)));
    if (matches.length === 0) block("asset-untracked", `No provenance group covers ${asset.path}`, { path: asset.path });
    if (matches.length > 1) block("asset-ambiguous", `Multiple provenance groups cover ${asset.path}`, { path: asset.path });
    const group = matches.length === 1 ? matches[0] : null;
    if (group && !["approved", "projectSource"].includes(group.rightsStatus)) {
      block("asset-unresolved", `Rights review remains ${group.rightsStatus} for ${asset.path}`, { path: asset.path, groupId: group.id });
    }
    if (group && ["approved", "projectSource"].includes(group.rightsStatus)) {
      const reviewed = group.reviewed.get(asset.path.toLowerCase());
      if (!reviewed) block("asset-not-reviewed", `Wildcard classification is not approval for ${asset.path}`, { path: asset.path, groupId: group.id });
      else if (reviewed.path !== asset.path || reviewed.sha256 !== asset.sha256) block("asset-hash-drift", `Reviewed bytes changed for ${asset.path}`, { path: asset.path, groupId: group.id });
    }
    return { ...asset, groupId: group?.id ?? null, rightsStatus: group?.rightsStatus ?? "untracked", evidenceCount: group?.validEvidence.length ?? 0 };
  });
  for (const group of groups) {
    for (const reviewed of group.reviewed.values()) {
      if (!assets.some((asset) => asset.path === reviewed.path && asset.groupId === group.id)) {
        block("reviewed-asset-absent", `Review in ${group.id} includes absent or unrelated ${reviewed.path}`);
      }
    }
  }
  try {
    const after = await identity();
    if (after[0] !== candidateCommitSha || after[1] !== candidateTreeSha) block("candidate-drift", "Candidate changed during audit");
    if (hash(await readOrdinaryFile(root, manifestPath)) !== manifestSha256) block("manifest-drift", "Manifest changed during audit");
    const afterAssets = [];
    for (const assetRoot of requiredAssetRoots) afterAssets.push(...await inventory(root, assetRoot, mediaExtensions));
    afterAssets.sort((left, right) => left.path.localeCompare(right.path));
    if (JSON.stringify(afterAssets) !== JSON.stringify(assetFiles)) block("asset-inventory-drift", "Asset path/hash set changed during audit");
    for (const group of groups) for (const evidence of group.validEvidence) {
      if (hash(await readOrdinaryFile(root, evidence.path)) !== evidence.sha256.toLowerCase()) block("evidence-hash-drift", `Evidence changed during audit: ${evidence.path}`);
    }
  } catch (error) { block("final-readback", String(error)); }
  return {
    schemaVersion: 2, evidenceKind: "source-asset-provenance-audit", generatedAt: new Date().toISOString(),
    candidateCommitSha, candidateTreeSha, manifestPath, manifestSha256,
    manifestStatus: manifest?.status ?? null, assetRoots: requiredAssetRoots,
    inputPaths: [manifestPath, ...(Array.isArray(manifest?.assetGroups) ? manifest.assetGroups : []).flatMap((group) =>
      (Array.isArray(group?.evidence) ? group.evidence : []).map((evidence) => typeof evidence === "string" ? evidence : evidence?.path).filter((path) => typeof path === "string"))],
    status: blockers.length === 0 ? "pass" : "blocked",
    scope: "source-media-and-platform-submission-inputs",
    summary: { assetCount: assets.length, trackedCount: assets.filter((asset) => asset.groupId).length, untrackedCount: assets.filter((asset) => !asset.groupId).length, blockerCount: blockers.length, totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0) },
    groups: groups.map((group) => ({ id: group.id, rightsStatus: group.rightsStatus, evidenceCount: group.validEvidence.length, assetCount: assets.filter((asset) => asset.groupId === group.id).length })),
    blockers, assets, shippingGeneratedFontsReviewed: false, packageAcceptance: false,
    commercialReleaseApproved: false, productionCertified: false, finalReleaseSeal: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.cwd());
  const outputPath = resolve(root, process.env.ASSET_AUDIT_OUTPUT ?? "artifacts/release/generated/asset-provenance-audit.json");
  const outputRelative = normalized(relative(root, outputPath));
  const report = await auditAssetProvenance(root);
  await writeOwnedReport(root, outputPath, report, { inputPaths: report.inputPaths });
  console.info(`ASSET_PROVENANCE_AUDIT ${JSON.stringify(report.summary)}`);
  console.info(`Evidence: ${outputRelative}`);
  if (!process.argv.includes("--report-only") && report.status !== "pass") {
    console.error("Asset provenance remains blocked; reconcile existing rights records before release.");
    process.exitCode = 1;
  }
}
