import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeRelativePath } from "./audit-asset-provenance.mjs";
import { extractPassivePackage } from "./passive-package-font-extractor.mjs";

const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalized = (value) => value.replaceAll("\\", "/");
const captureScope = "accepted-all-distributable-fonts-and-notices";
const handoffRoot = "artifacts/release/generated/font-handoff";
const acceptedPath = "artifacts/release/generated/accepted-candidate.json";
const manifestPath = "artifacts/release/candidate-package-manifest.json";
const depotPath = "artifacts/release/generated/steam-depot-inventories.json";
const platforms = [
  { id: "windows", artifactName: "steam-windows", asarPath: "dist/win-unpacked/resources/app.asar", kinds: ["windows-installer"] },
  { id: "macos", artifactName: "steam-macos", asarPath: "steam-stage/macos/TalentScout.app/Contents/Resources/app.asar", kinds: ["macos-dmg", "macos-zip"] },
  { id: "linux", artifactName: "steam-linux", asarPath: "dist/linux-unpacked/resources/app.asar", kinds: ["linux-appimage", "linux-deb"] },
];
const kindExtension = { "windows-installer": ".exe", "macos-dmg": ".dmg", "macos-zip": ".zip", "linux-appimage": ".AppImage", "linux-deb": ".deb" };
const fontExtensions = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const noticeExtensions = new Set([".txt", ".md", ".html"]);

function fail(message, code = "FONT_HANDOFF_GUARD") {
  const error = new Error(`accepted font handoff: ${message}`); error.code = code; throw error;
}
function requireValue(condition, message) { if (!condition) fail(message); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function validRecord(row) {
  return row && safeRelativePath(row.path) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && hashPattern.test(String(row.sha256 ?? ""));
}
async function ordinary(root, path, directory = false) {
  requireValue(safeRelativePath(path), `unsafe path ${String(path)}`);
  let current = root;
  const rootStat = await lstat(current);
  requireValue(rootStat.isDirectory() && !rootStat.isSymbolicLink() && await realpath(current) === resolve(current), "nonordinary root");
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]);
    const stat = await lstat(current);
    const expectDirectory = index < parts.length - 1 || directory;
    requireValue(!stat.isSymbolicLink() && await realpath(current) === current
      && (expectDirectory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1), `nonordinary path ${path}`);
  }
  return current;
}
async function bytesAt(root, path) { return readFile(await ordinary(root, path)); }
const requiredNoticeNames = ["Caveat-OFL.txt", "THIRD-PARTY-NOTICES.txt"];
async function readRequiredSourceNotices(root) {
  const records = [];
  for (const name of requiredNoticeNames) {
    const path = `public/licenses/${name}`;
    let bytes;
    try { bytes = await bytesAt(root, path); }
    catch (error) { fail(`source notice missing or nonordinary ${name}: ${error instanceof Error ? error.message : String(error)}`, "SOURCE_NOTICE_GUARD"); }
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: root, stdio: "pipe" });
      const committed = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, stdio: "pipe" });
      if (!committed.equals(bytes)) fail(`source notice is not bound to committed candidate ${name}`, "SOURCE_NOTICE_GUARD");
    } catch { fail(`source notice is not bound to committed candidate ${name}`, "SOURCE_NOTICE_GUARD"); }
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { fail(`source notice is not readable ${name}`, "SOURCE_NOTICE_GUARD"); }
    if (bytes.length === 0 || bytes.length > 2097152 || !text.trim() || text.includes("\0")) fail(`source notice is not readable ${name}`, "SOURCE_NOTICE_GUARD");
    records.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return records;
}
function assertMandatoryNoticeCoverage(members, sourceNotices, label) {
  requireValue(Array.isArray(members) && members.some((row) => row.kind === "font"), `${label} full font inventory missing`);
  if (!Array.isArray(sourceNotices) || sourceNotices.length !== requiredNoticeNames.length
    || requiredNoticeNames.some((name) => sourceNotices.filter((row) => row.path === `public/licenses/${name}` && validRecord(row)).length !== 1)) {
    fail(`${label} source notice bindings incomplete`, "SOURCE_NOTICE_GUARD");
  }
  for (const name of requiredNoticeNames) {
    const sourceNotice = sourceNotices.find((row) => row.path === `public/licenses/${name}`);
    for (const location of [{ source: "app.asar", prefix: "out/licenses/" }, { source: "resources", prefix: "licenses/" }]) {
      const selected = members.filter((row) => row.kind === "notice" && row.source === location.source && row.memberPath === `${location.prefix}${name}`);
      if (selected.length !== 1 || selected[0].bytes !== sourceNotice.bytes || selected[0].sha256 !== sourceNotice.sha256) {
        fail(`${label} required notice ${location.source}/${location.prefix}${name} missing, duplicated or different from source`, "NOTICE_COVERAGE_GUARD");
      }
    }
  }
}
async function recordAt(root, path) {
  const absolute = await ordinary(root, path);
  const before = await lstat(absolute);
  const sha256 = await new Promise((done, reject) => {
    const digest = createHash("sha256");
    createReadStream(absolute).on("data", (chunk) => digest.update(chunk)).once("error", reject).once("end", () => done(digest.digest("hex")));
  });
  const after = await lstat(absolute);
  requireValue(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino && after.nlink === 1, `input changed while hashing ${path}`);
  return { path, bytes: before.size, sha256 };
}
async function readJson(root, path, expectedHash = null) {
  const bytes = await bytesAt(root, path);
  if (expectedHash) requireValue(hash(bytes) === expectedHash, `hash changed ${path}`);
  return { document: JSON.parse(bytes.toString("utf8")), bytes, sha256: hash(bytes) };
}
async function listFiles(root, path) {
  const paths = [];
  async function visit(current) {
    const absolute = await ordinary(root, current, true);
    const entries = (await readdir(absolute, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    const seen = new Set();
    for (const entry of entries) {
      requireValue(safeRelativePath(entry.name) && !seen.has(entry.name.toLowerCase()), `unsafe or case-duplicate directory entry ${current}/${entry.name}`);
      seen.add(entry.name.toLowerCase());
      const child = `${current}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else { await ordinary(root, child); paths.push(child); }
    }
  }
  await visit(path);
  return paths.sort();
}
async function createOwnedDirectory(root, path) {
  requireValue(safeRelativePath(path) && path.startsWith("artifacts/release/generated/"), "output must be a new ignored generated directory");
  const checked = execFileSync("git", ["check-ignore", "--no-index", path], { cwd: root, encoding: "utf8" }).trim();
  requireValue(checked.length > 0, "output directory is not ignored");
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const parent = parts.slice(0, index).join("/");
    try { await ordinary(root, parent, true); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(resolve(root, parent));
      await ordinary(root, parent, true);
    }
  }
  await mkdir(resolve(root, path));
  await ordinary(root, path, true);
}
async function writeNew(root, path, bytes) {
  requireValue(safeRelativePath(path) && path.startsWith("artifacts/release/generated/"), "unsafe output member");
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const parent = parts.slice(0, index).join("/");
    try { await ordinary(root, parent, true); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(resolve(root, parent));
      await ordinary(root, parent, true);
    }
  }
  const output = await open(resolve(root, path), "wx");
  try { await output.writeFile(bytes); await output.sync(); } finally { await output.close(); }
  requireValue((await bytesAt(root, path)).equals(bytes), `output readback differs ${path}`);
}
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
function currentIdentity(root) {
  const candidateCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const candidateTreeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  requireValue(commitPattern.test(candidateCommitSha) && commitPattern.test(candidateTreeSha), "invalid Git identity");
  requireValue(!execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).trim(), "dirty candidate");
  return { candidateCommitSha, candidateTreeSha };
}
function workflowIdentity() {
  const packageWorkflowRunId = String(process.env.GITHUB_RUN_ID ?? "");
  const packageWorkflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT ?? "");
  const controlWorkflowSha = String(process.env.GITHUB_SHA ?? "");
  requireValue(/^[1-9]\d*$/.test(packageWorkflowRunId) && /^[1-9]\d*$/.test(packageWorkflowAttempt) && commitPattern.test(controlWorkflowSha), "workflow identity is missing");
  return { packageWorkflowRunId, packageWorkflowAttempt, controlWorkflowSha };
}

async function nativeDistributables(root, platform) {
  const names = await readdir(await ordinary(root, "dist", true));
  const rows = [];
  for (const kind of platform.kinds) {
    const matches = names.filter((name) => name.endsWith(kindExtension[kind]));
    requireValue(matches.length === 1, `expected one ${kind} distributable`);
    const file = await recordAt(root, `dist/${matches[0]}`);
    rows.push({ kind, fileName: matches[0], bytes: file.bytes, sha256: file.sha256 });
  }
  return rows;
}
function assertProvenance(document, identity) {
  requireValue(document.schemaVersion === 1 && document.evidenceKind === "shipping-build-provenance"
    && document.status === "Passed" && document.candidateCommitSha === identity.candidateCommitSha
    && Array.isArray(document.matchingFiles) && document.matchingFiles.length > 0, "stale or malformed shipping provenance");
  const seen = new Set();
  for (const path of document.matchingFiles) {
    requireValue(safeRelativePath(path) && path.startsWith("out/_next/") && path.endsWith(".js") && !seen.has(path.toLowerCase()), "invalid provenance matching member");
    seen.add(path.toLowerCase());
  }
}

async function inspectMembers(root, asarPath, identity, provenance) {
  const sourceNotices = await readRequiredSourceNotices(root);
  // Resolve through the immutable candidate, where npm ci installed this library.
  const { listPackage, statFile, extractFile } = createRequire(resolve(root, "package.json"))("@electron/asar");
  const asarAbsolute = resolve(root, asarPath);
  const names = listPackage(asarAbsolute).map((name) => normalized(name).replace(/^\//, ""));
  const seen = new Set();
  const members = [];
  const retained = [];
  for (const memberPath of names) {
    requireValue(safeRelativePath(memberPath) && !seen.has(memberPath.toLowerCase()), `unsafe or case-duplicate archive entry ${memberPath}`);
    seen.add(memberPath.toLowerCase());
    const info = statFile(asarAbsolute, memberPath, false);
    requireValue(!info.link, `archive link ${memberPath}`);
    if (info.files) continue;
    const isFont = fontExtensions.has(extname(memberPath).toLowerCase());
    const isNotice = (memberPath.startsWith("out/licenses/") || memberPath.startsWith("licenses/")) && noticeExtensions.has(extname(memberPath).toLowerCase());
    if (!isFont && !isNotice) continue;
    requireValue(!info.unpacked, `unpacked font/notice ${memberPath}`);
    const bytes = extractFile(asarAbsolute, memberPath, false);
    requireValue(bytes.length > 0 && bytes.length <= (isFont ? 16777216 : 2097152), `invalid font/notice size ${memberPath}`);
    const path = `members/asar/${memberPath}`;
    members.push({ path, memberPath, source: "app.asar", kind: isFont ? "font" : "notice", bytes: bytes.length, sha256: hash(bytes) });
    retained.push({ path, bytes });
  }
  const externalNotices = `${dirname(asarPath)}/licenses`;
  for (const path of await listFiles(root, externalNotices)) {
      requireValue(noticeExtensions.has(extname(path).toLowerCase()), `unsupported notice member ${path}`);
      const bytes = await bytesAt(root, path);
      requireValue(bytes.length > 0 && bytes.length <= 2097152, `invalid notice size ${path}`);
      const memberPath = normalized(relative(resolve(root, dirname(asarPath)), resolve(root, path)));
      const retainedPath = `members/resources/${memberPath}`;
      members.push({ path: retainedPath, memberPath, source: "resources", kind: "notice", bytes: bytes.length, sha256: hash(bytes) });
      retained.push({ path: retainedPath, bytes });
  }
  assertMandatoryNoticeCoverage(members, sourceNotices, "native/extracted archive");
  const matchingFiles = [];
  for (const path of provenance.document.matchingFiles) {
    requireValue(seen.has(path.toLowerCase()), `provenance JS absent from archive ${path}`);
    const info = statFile(asarAbsolute, path, false);
    requireValue(!info.link && !info.files && !info.unpacked, `nonordinary provenance JS ${path}`);
    const bytes = extractFile(asarAbsolute, path, false);
    requireValue(bytes.toString("utf8").toLowerCase().includes(identity.candidateCommitSha), `archive JS lacks candidate SHA ${path}`);
    matchingFiles.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return { members: members.sort((left, right) => left.path.localeCompare(right.path)), sourceNotices, retained, matchingFiles };
}

export async function captureNativeFonts(root, platformId) {
  const platform = platforms.find((entry) => entry.id === platformId);
  requireValue(platform, "unsupported native platform");
  const identity = { ...currentIdentity(root), ...workflowIdentity() };
  const sourceProvenancePath = "artifacts/release/generated/build-provenance.json";
  const provenance = await readJson(root, sourceProvenancePath);
  assertProvenance(provenance.document, identity);
  const appAsar = await recordAt(root, platform.asarPath);
  const distributables = await nativeDistributables(root, platform);
  const { members, sourceNotices, retained, matchingFiles } = await inspectMembers(root, platform.asarPath, identity, provenance);
  const packageContents = [];
  const extractionReceipts = [];
  for (const distributable of distributables) {
    const extracted = await extractPassivePackage(root, platform.id, distributable);
    requireValue(extracted.receipt.selectedAsar.bytes === appAsar.bytes && extracted.receipt.selectedAsar.sha256 === appAsar.sha256,
      `extracted ${distributable.kind} app.asar differs from native package`);
    const observed = await inspectMembers(root, extracted.asarPath, identity, provenance);
    requireValue(same(observed.members, members) && same(observed.sourceNotices, sourceNotices) && same(observed.matchingFiles, matchingFiles),
      `extracted ${distributable.kind} fonts/notices differ from native package`);
    const receiptBytes = await bytesAt(root, extracted.receiptPath);
    const receiptPath = `extractions/${distributable.kind}.json`;
    extractionReceipts.push({ path: receiptPath, bytes: receiptBytes });
    packageContents.push({ kind: distributable.kind, fileName: distributable.fileName, bytes: distributable.bytes, sha256: distributable.sha256,
      extractionReceipt: { path: receiptPath, bytes: receiptBytes.length, sha256: hash(receiptBytes) },
      extractedAppAsar: { bytes: extracted.receipt.selectedAsar.bytes, sha256: extracted.receipt.selectedAsar.sha256 },
      sourceNotices: observed.sourceNotices, members: observed.members });
  }
  requireValue(same(appAsar, await recordAt(root, platform.asarPath)) && same(distributables, await nativeDistributables(root, platform))
    && hash(await bytesAt(root, sourceProvenancePath)) === provenance.sha256 && same(identity, { ...currentIdentity(root), ...workflowIdentity() }), "native inputs changed during capture");
  const output = `artifacts/release/generated/font-captures/${platform.id}`;
  await createOwnedDirectory(root, output);
  for (const member of [...retained, ...extractionReceipts]) await writeNew(root, `${output}/${member.path}`, member.bytes);
  await writeNew(root, `${output}/build-provenance.json`, provenance.bytes);
  const receipt = { schemaVersion: 1, evidenceKind: "native-package-font-capture", scope: captureScope, ...identity,
    platform: platform.id, artifactName: platform.artifactName, appAsar, distributables, packageContents, sourceNotices,
    buildProvenance: { path: "build-provenance.json", bytes: provenance.bytes.length, sha256: provenance.sha256, matchingFiles },
    members: members.sort((left, right) => left.path.localeCompare(right.path)),
    commercialRightsApproved: false, packageAcceptance: false, productionCertified: false, finalReleaseSeal: false };
  await writeNew(root, `${output}/capture.json`, jsonBytes(receipt));
  await validateCapture(root, output, receipt, identity);
  requireValue(same(appAsar, await recordAt(root, platform.asarPath)) && same(distributables, await nativeDistributables(root, platform)), "native inputs changed after capture readback");
  return { path: `${output}/capture.json`, sha256: hash(jsonBytes(receipt)), platform: platform.id };
}

async function validateCapture(root, directory, receipt, identity) {
  const platform = platforms.find((entry) => entry.id === receipt.platform);
  requireValue(platform && receipt.schemaVersion === 1 && receipt.evidenceKind === "native-package-font-capture" && receipt.scope === captureScope
    && receipt.artifactName === platform.artifactName && receipt.appAsar?.path === platform.asarPath && validRecord(receipt.appAsar), "invalid capture schema/platform/archive");
  for (const key of ["candidateCommitSha", "candidateTreeSha", "packageWorkflowRunId", "packageWorkflowAttempt", "controlWorkflowSha"]) {
    requireValue(String(receipt[key]) === String(identity[key]), `capture ${key} mismatch`);
  }
  requireValue(receipt.commercialRightsApproved === false && receipt.packageAcceptance === false && receipt.productionCertified === false && receipt.finalReleaseSeal === false, "capture cannot approve rights or release");
  requireValue(Array.isArray(receipt.distributables) && receipt.distributables.length === platform.kinds.length, "capture distributable inventory incomplete");
  const sourceNotices = await readRequiredSourceNotices(root);
  if (!same(receipt.sourceNotices, sourceNotices)) fail("capture source notice bindings differ from actual candidate source", "SOURCE_NOTICE_GUARD");
  assertMandatoryNoticeCoverage(receipt.members, sourceNotices, "capture readback");
  const kinds = new Set();
  for (const item of receipt.distributables) {
    requireValue(platform.kinds.includes(item.kind) && !kinds.has(item.kind) && safeRelativePath(item.fileName) && !item.fileName.includes("/")
      && item.fileName.endsWith(kindExtension[item.kind]) && Number.isSafeInteger(item.bytes) && item.bytes > 0 && hashPattern.test(String(item.sha256 ?? "")), "invalid capture distributable");
    kinds.add(item.kind);
  }
  requireValue(Array.isArray(receipt.packageContents) && receipt.packageContents.length === platform.kinds.length, "all distributable content extractions required");
  const extractionFiles = [];
  const extractedKinds = new Set();
  for (const content of receipt.packageContents) {
    if (!same(content.sourceNotices, sourceNotices)) fail(`${content.kind} source notice bindings differ from actual candidate source`, "SOURCE_NOTICE_GUARD");
    assertMandatoryNoticeCoverage(content.members, sourceNotices, `${content.kind} extracted capture readback`);
    const distributable = receipt.distributables.find((entry) => entry.kind === content.kind);
    requireValue(distributable && !extractedKinds.has(content.kind) && content.fileName === distributable.fileName
      && content.bytes === distributable.bytes && content.sha256 === distributable.sha256
      && content.extractedAppAsar?.bytes === receipt.appAsar.bytes && content.extractedAppAsar?.sha256 === receipt.appAsar.sha256
      && same(content.members, receipt.members), "distributable contents disagree with captured archive/fonts/notices");
    extractedKinds.add(content.kind);
    const binding = content.extractionReceipt;
    requireValue(binding?.path === `extractions/${content.kind}.json` && validRecord(binding), "unbound passive extraction receipt");
    const rawReceipt = await bytesAt(root, `${directory}/${binding.path}`);
    requireValue(rawReceipt.length === binding.bytes && hash(rawReceipt) === binding.sha256, "passive extraction receipt changed");
    const extracted = JSON.parse(rawReceipt.toString("utf8"));
    requireValue(extracted.schemaVersion === 1 && extracted.evidenceKind === "passive-distributable-font-extraction"
      && extracted.status === "Observed" && extracted.kind === content.kind && extracted.mountCleanupVerified === true
      && extracted.installerExecuted === false && extracted.appImageExecuted === false && extracted.installed === false
      && extracted.packageBefore?.bytes === content.bytes && extracted.packageBefore?.sha256 === content.sha256
      && same(extracted.packageBefore, extracted.packageAfter) && extracted.selectedAsar?.bytes === receipt.appAsar.bytes
      && extracted.selectedAsar?.sha256 === receipt.appAsar.sha256
      && extracted.extractionControlSha256 === hash(await readFile(fileURLToPath(new URL("./passive-package-font-extractor.mjs", import.meta.url))))
      && (content.kind !== "macos-dmg" || extracted.readonlyMountVerified === true)
      && Array.isArray(extracted.tools) && extracted.tools.length > 0 && extracted.tools.every((tool) => hashPattern.test(String(tool.sha256 ?? "")) && Number.isSafeInteger(tool.bytes) && tool.bytes > 0)
      && Array.isArray(extracted.commands) && extracted.commands.length > 0 && extracted.commands.every((command) => command.nativeExitCode === 0 && command.error === null && command.signal === null),
      "passive extraction does not prove actual package contents/cleanup");
    extractionFiles.push(`${directory}/${binding.path}`);
  }
  const provenance = receipt.buildProvenance;
  requireValue(provenance?.path === "build-provenance.json" && validRecord(provenance), "unbound provenance");
  const rawProvenance = await bytesAt(root, `${directory}/${provenance.path}`);
  requireValue(rawProvenance.length === provenance.bytes && hash(rawProvenance) === provenance.sha256, "capture provenance bytes changed");
  const document = JSON.parse(rawProvenance.toString("utf8"));
  assertProvenance(document, identity);
  requireValue(Array.isArray(provenance.matchingFiles) && same(provenance.matchingFiles.map((row) => row.path), document.matchingFiles)
    && provenance.matchingFiles.every(validRecord), "capture provenance matching members incomplete");
  requireValue(Array.isArray(receipt.members) && receipt.members.length > 0, "capture members missing");
  const seen = new Set();
  const expectedFiles = [`${directory}/capture.json`, `${directory}/build-provenance.json`, ...extractionFiles];
  for (const member of receipt.members) {
    requireValue(validRecord(member) && safeRelativePath(member.memberPath) && ["font", "notice"].includes(member.kind)
      && ["app.asar", "resources"].includes(member.source) && !seen.has(member.path.toLowerCase())
      && member.path === `members/${member.source === "app.asar" ? "asar" : "resources"}/${member.memberPath}`, "invalid or duplicate retained member");
    requireValue(member.kind === "font" ? member.source === "app.asar" && fontExtensions.has(extname(member.memberPath).toLowerCase())
      : noticeExtensions.has(extname(member.memberPath).toLowerCase()) && (member.source === "app.asar"
        ? member.memberPath.startsWith("out/licenses/") || member.memberPath.startsWith("licenses/")
        : member.memberPath.startsWith("licenses/")), "unsupported font/notice member scope");
    seen.add(member.path.toLowerCase());
    const path = `${directory}/${member.path}`;
    const bytes = await bytesAt(root, path);
    requireValue(bytes.length === member.bytes && hash(bytes) === member.sha256, `retained ${member.kind} bytes changed ${path}`);
    expectedFiles.push(path);
  }
  assertMandatoryNoticeCoverage(receipt.members, sourceNotices, "retained capture inventory");
  requireValue(same((await listFiles(root, directory)), expectedFiles.sort()), "unexpected or missing capture file");
  return { platform, expectedFiles };
}

async function verifyPackageBindings(root, index, captures, manifest, depots) {
  requireValue(manifest.schemaVersion === 2 && manifest.candidateCommitSha === index.candidateCommitSha
    && String(manifest.workflowRunId) === String(index.packageWorkflowRunId) && Array.isArray(manifest.packages), "package manifest candidate/run mismatch");
  const expectedKinds = platforms.flatMap((platform) => platform.kinds).sort();
  requireValue(same(manifest.packages.map((row) => row.kind).sort(), expectedKinds), "five-kind package manifest incomplete or duplicate");
  for (const packageEntry of manifest.packages) {
    requireValue(validRecord(packageEntry), "invalid package manifest row");
    const actual = await recordAt(root, packageEntry.path);
    requireValue(same(actual, { path: packageEntry.path, bytes: packageEntry.bytes, sha256: packageEntry.sha256 }), "accepted package bytes changed");
  }
  requireValue(depots.schemaVersion === 1 && depots.candidateCommitSha === index.candidateCommitSha && Array.isArray(depots.depots)
    && same(depots.depots.map((depot) => depot.artifactName).sort(), platforms.map((platform) => platform.artifactName).sort()), "depot inventory incomplete or stale");
  for (const receipt of captures) {
    const platform = platforms.find((entry) => entry.id === receipt.platform);
    assertMandatoryNoticeCoverage(receipt.members, await readRequiredSourceNotices(root), "package/depot binding");
    for (const captured of receipt.distributables) {
      const entry = manifest.packages.find((row) => row.kind === captured.kind);
      requireValue(entry && basename(entry.path) === captured.fileName && entry.bytes === captured.bytes && entry.sha256 === captured.sha256, "capture/package distributable mismatch");
    }
    const depot = depots.depots.find((entry) => entry.artifactName === platform.artifactName);
    requireValue(depot.rootPath === platform.asarPath.split("/").slice(0, platform.id === "macos" ? 2 : 2).join("/") && Array.isArray(depot.files), "depot root mismatch");
    const paths = depot.files.map((row) => row?.path?.toLowerCase());
    requireValue(new Set(paths).size === paths.length && depot.files.every(validRecord), "invalid or duplicate depot inventory path");
    const archive = depot.files.filter((entry) => entry.path === platform.asarPath);
    requireValue(archive.length === 1 && same(archive[0], receipt.appAsar), "capture/depot app.asar mismatch");
    for (const notice of receipt.members.filter((row) => row.source === "resources")) {
      const path = `${dirname(platform.asarPath)}/${notice.memberPath}`;
      const entry = depot.files.find((row) => row.path === path);
      requireValue(entry && entry.bytes === notice.bytes && entry.sha256 === notice.sha256, "capture/depot external notice mismatch");
    }
  }
}

export async function stageAcceptedFonts(root) {
  const identity = { ...currentIdentity(root), ...workflowIdentity() };
  const manifest = await readJson(root, manifestPath);
  const depots = await readJson(root, depotPath);
  const captures = [];
  const inputs = [];
  for (const platform of platforms) {
    const directory = `artifacts/release/generated/font-capture-inputs/${platform.id}`;
    const capture = await readJson(root, `${directory}/capture.json`);
    await validateCapture(root, directory, capture.document, identity);
    requireValue(capture.document.platform === platform.id, "capture downloaded into wrong platform directory");
    requireValue(same(await recordAt(root, platform.asarPath), capture.document.appAsar), "downloaded depot archive bytes mismatch");
    captures.push(capture.document);
    for (const path of await listFiles(root, directory)) inputs.push({ path, bytes: await bytesAt(root, path) });
  }
  requireValue(same((await readdir(await ordinary(root, "artifacts/release/generated/font-capture-inputs", true))).sort(), platforms.map((entry) => entry.id).sort()), "capture input platforms incomplete or extra");
  await verifyPackageBindings(root, identity, captures, manifest.document, depots.document);
  await createOwnedDirectory(root, handoffRoot);
  for (const input of inputs) {
    const path = `${handoffRoot}/captures/${input.path.slice("artifacts/release/generated/font-capture-inputs/".length)}`;
    await writeNew(root, path, input.bytes);
  }
  const index = { schemaVersion: 1, evidenceKind: "accepted-package-font-handoff", scope: captureScope, ...identity,
    packageManifest: { path: manifestPath, sha256: manifest.sha256 }, depotInventory: { path: depotPath, sha256: depots.sha256 },
    captures: platforms.map((platform) => {
      const path = `${handoffRoot}/captures/${platform.id}/capture.json`;
      const receipt = captures.find((entry) => entry.platform === platform.id);
      return { platform: platform.id, artifactName: platform.artifactName, path, sha256: hash(jsonBytes(receipt)) };
    }), commercialRightsApproved: false, packageAcceptance: false, productionCertified: false, finalReleaseSeal: false };
  // Preserve the capture receipt's exact downloaded bytes; JSON formatting is part of its binding.
  for (const capture of index.captures) capture.sha256 = hash(await bytesAt(root, capture.path));
  await writeNew(root, `${handoffRoot}/index.json`, jsonBytes(index));
  await validateIndex(root, index, identity);
  requireValue(hash(await bytesAt(root, manifestPath)) === manifest.sha256 && hash(await bytesAt(root, depotPath)) === depots.sha256
    && same(identity, { ...currentIdentity(root), ...workflowIdentity() }), "staging inputs changed");
  return { path: `${handoffRoot}/index.json`, sha256: hash(jsonBytes(index)), scope: captureScope };
}

async function validateIndex(root, index, identity) {
  requireValue(index.schemaVersion === 1 && index.evidenceKind === "accepted-package-font-handoff" && index.scope === captureScope
    && index.commercialRightsApproved === false && index.packageAcceptance === false && index.productionCertified === false && index.finalReleaseSeal === false, "invalid handoff index");
  for (const key of ["candidateCommitSha", "candidateTreeSha", "packageWorkflowRunId", "packageWorkflowAttempt", "controlWorkflowSha"]) requireValue(String(index[key]) === String(identity[key]), `index ${key} mismatch`);
  requireValue(index.packageManifest?.path === manifestPath && hashPattern.test(String(index.packageManifest?.sha256 ?? ""))
    && index.depotInventory?.path === depotPath && hashPattern.test(String(index.depotInventory?.sha256 ?? "")), "index package/depot bindings missing");
  const manifest = await readJson(root, manifestPath, index.packageManifest.sha256);
  const depots = await readJson(root, depotPath, index.depotInventory.sha256);
  requireValue(Array.isArray(index.captures) && index.captures.length === platforms.length, "all three platform captures required");
  const captures = [];
  const fonts = [];
  const notices = [];
  const expectedFiles = [`${handoffRoot}/index.json`];
  const seen = new Set();
  for (const binding of index.captures) {
    const platform = platforms.find((entry) => entry.id === binding.platform);
    requireValue(platform && !seen.has(platform.id) && binding.artifactName === platform.artifactName
      && binding.path === `${handoffRoot}/captures/${platform.id}/capture.json` && hashPattern.test(String(binding.sha256 ?? "")), "invalid or duplicate index platform");
    seen.add(platform.id);
    const capture = await readJson(root, binding.path, binding.sha256);
    const validated = await validateCapture(root, dirname(binding.path), capture.document, identity);
    requireValue(capture.document.platform === platform.id, "index platform disagrees with capture");
    expectedFiles.push(...validated.expectedFiles);
    captures.push(capture.document);
    for (const member of capture.document.members) {
      const row = { platform: platform.id, path: `${dirname(binding.path)}/${member.path}`, memberPath: member.memberPath, source: member.source, bytes: member.bytes, sha256: member.sha256 };
      (member.kind === "font" ? fonts : notices).push(row);
    }
  }
  await verifyPackageBindings(root, index, captures, manifest.document, depots.document);
  requireValue(same(await listFiles(root, handoffRoot), expectedFiles.sort()), "unexpected or missing handoff files");
  return { scope: captureScope, fonts, notices, index };
}

export async function validateAcceptedFontHandoff(root, options = {}) {
  let accepted;
  try { accepted = await readJson(root, acceptedPath); }
  catch (error) {
    if (error?.code === "ENOENT" && !options.workflowRunId) return null;
    throw error;
  }
  const metadata = accepted.document;
  requireValue(metadata.schemaVersion === 1 && metadata.verificationOnly === false
    && metadata.candidateCommitSha === options.candidateSha && metadata.candidateTreeSha === options.candidateTreeSha
    && /^[1-9]\d*$/.test(String(metadata.packageWorkflowRunId)) && /^[1-9]\d*$/.test(String(metadata.packageWorkflowAttempt))
    && commitPattern.test(String(metadata.controlWorkflowSha ?? ""))
    && (!options.workflowRunId || String(metadata.packageWorkflowRunId) === String(options.workflowRunId)), "accepted metadata candidate/run mismatch");
  const binding = metadata.fontHandoff;
  requireValue(binding?.path === `${handoffRoot}/index.json` && hashPattern.test(String(binding?.sha256 ?? "")), "accepted record requires bound font handoff; local out is not a fallback");
  const rawIndex = await readJson(root, binding.path, binding.sha256);
  const result = await validateIndex(root, rawIndex.document, metadata);
  requireValue(!options.packageManifestPath || normalized(relative(root, options.packageManifestPath)) === manifestPath, "accepted handoff must use accepted package manifest");
  return { ...result, path: binding.path, sha256: binding.sha256, acceptedMetadataSha256: accepted.sha256 };
}

async function main() {
  const [mode, platform] = process.argv.slice(2);
  requireValue(process.argv.length === (mode === "capture" ? 4 : 3), "unexpected CLI arguments");
  const root = resolve(process.cwd());
  let result;
  if (mode === "capture") result = await captureNativeFonts(root, platform);
  else if (mode === "stage") result = await stageAcceptedFonts(root);
  else if (mode === "validate") {
    const identity = currentIdentity(root);
    result = await validateAcceptedFontHandoff(root, { candidateSha: identity.candidateCommitSha, candidateTreeSha: identity.candidateTreeSha, workflowRunId: process.env.RELEASE_WORKFLOW_RUN_ID });
    requireValue(result, "accepted metadata missing");
  } else fail("unknown CLI mode");
  console.info(`ACCEPTED_FONT_HANDOFF ${JSON.stringify({ status: "Passed", mode, result })}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => { console.error(`FONT_HANDOFF_FAILURE ${JSON.stringify({ code: String(error?.code ?? "UNKNOWN_ERROR"), message: error instanceof Error ? error.message : String(error), passiveExtractionReceipt: error?.passiveExtractionReceipt ?? null })}`); process.exitCode = 1; });
}
