import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { safeRelativePath } from "./audit-asset-provenance.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const here = fileURLToPath(import.meta.url);
const normalized = (value) => value.replaceAll("\\", "/");
const fail = (message) => { const error = new Error(`passive package extraction: ${message}`); error.code = "PASSIVE_EXTRACTION_GUARD"; throw error; };
function requireValue(value, message) { if (!value) fail(message); }
async function ordinary(path, directory = false) {
  const resolved = resolve(path);
  requireValue(await realpath(resolved) === resolved, `selected alias ${resolved}`);
  let current = resolved;
  while (true) {
    const stat = await lstat(current);
    requireValue(!stat.isSymbolicLink() && (current === resolved && !directory ? stat.isFile() && stat.nlink === 1 : stat.isDirectory()), `nonordinary selected path ${resolved}`);
    const parent = dirname(current);
    if (current === parent) break;
    current = parent;
  }
  return resolved;
}
async function fileRecord(path) {
  const absolute = await ordinary(path);
  const before = await lstat(absolute);
  const sha256 = await new Promise((done, reject) => {
    const digest = createHash("sha256");
    createReadStream(absolute).on("data", (bytes) => digest.update(bytes)).once("error", reject).once("end", () => done(digest.digest("hex")));
  });
  const after = await lstat(absolute);
  requireValue(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && after.nlink === 1, "input changed during hashing");
  return { bytes: before.size, sha256 };
}
async function createExtractionDirectory(root, relativePath) {
  requireValue(safeRelativePath(relativePath) && relativePath.startsWith("artifacts/release/generated/package-font-extraction/"), "unsafe extraction output");
  requireValue(execFileSync("git", ["check-ignore", "--no-index", relativePath], { cwd: root, encoding: "utf8" }).trim().length > 0, "extraction output is not ignored");
  const parts = relativePath.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const parent = resolve(root, ...parts.slice(0, index));
    try { await ordinary(parent, true); }
    catch (error) { if (error?.code !== "ENOENT") throw error; await mkdir(parent); await ordinary(parent, true); }
  }
  const output = resolve(root, relativePath); await mkdir(output); await ordinary(output, true);
  return output;
}
async function pinnedTool(name) {
  const path = String(process.env[`FONT_CAPTURE_${name}_PATH`] ?? "");
  const expected = String(process.env[`FONT_CAPTURE_${name}_SHA256`] ?? "");
  requireValue(isAbsolute(path) && /^[a-f0-9]{64}$/.test(expected), `missing ${name} tool path/SHA pin`);
  const actual = await fileRecord(path);
  requireValue(actual.sha256 === expected, `${name} tool SHA pin mismatch`);
  return { name, path, ...actual };
}
async function runTool(tool, args, cwd, commands, input = null) {
  requireValue(JSON.stringify(await fileRecord(tool.path)) === JSON.stringify({ bytes: tool.bytes, sha256: tool.sha256 }), "tool changed before execution");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "HOME", "LANG", "LC_ALL"].includes(key.toUpperCase())));
  const result = spawnSync(tool.path, args, { cwd, env, input, encoding: "utf8", timeout: 120000, maxBuffer: 16777216, windowsHide: true });
  const command = { tool: tool.name, argv: [tool.path, ...args], nativeExitCode: result.status, signal: result.signal,
    error: result.error?.message ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  commands.push(command);
  requireValue(result.status === 0 && !result.error && !result.signal, `${tool.name} failed or timed out`);
  requireValue(JSON.stringify(await fileRecord(tool.path)) === JSON.stringify({ bytes: tool.bytes, sha256: tool.sha256 }), "tool changed during execution");
  return result.stdout;
}
function pathInside(root, path) {
  const value = relative(root, path);
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
function archiveMembers(text, destination) {
  const marker = text.indexOf("----------");
  requireValue(marker >= 0, "archive listing lacks member boundary");
  const entries = text.slice(marker + 10).trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map((block) => Object.fromEntries(
    block.split(/\r?\n/).filter((line) => line.includes(" = ")).map((line) => { const at = line.indexOf(" = "); return [line.slice(0, at), line.slice(at + 3)]; }),
  ));
  const seen = new Set();
  for (const item of entries) {
    const original = normalized(item.Path ?? "").replace(/\/$/, "");
    const path = original.replace(/^(?:\.\/)+/, "");
    if (path === "." || path === "") {
      requireValue((original === "." || /^(?:\.\/)*\.$/.test(original))
        && (item.Folder === "+" || /^D/.test(item.Attributes ?? "") || /^d/.test(item.Mode ?? ""))
        && !seen.has("<tar-root>"), "unmarked/duplicate archive root entry");
      requireValue(!item["Symbolic Link"] && !item["Hard Link"] && item.Encrypted !== "+"
        && !/^l/.test(item.Attributes ?? "") && !/^l/.test(item.Mode ?? ""), "ignored root record cannot be an alias or encrypted");
      seen.add("<tar-root>"); item.ignoredRootDirectory = true; continue;
    }
    requireValue(safeRelativePath(path) && !seen.has(path.toLowerCase()), "unsafe/duplicate archive member");
    seen.add(path.toLowerCase());
    requireValue(item.Encrypted !== "+", "encrypted package member");
    const link = item["Symbolic Link"] ?? item["Hard Link"];
    if (link) {
      requireValue(!isAbsolute(link) && !link.includes(":"), "absolute archive alias");
      const target = resolve(destination, dirname(path), normalized(link));
      requireValue(pathInside(destination, target), "archive alias escapes extraction root");
    } else requireValue(!/^l/.test(item.Attributes ?? ""), "unresolved archive alias");
    item.normalizedPath = path;
  }
  requireValue(entries.length > 0, "empty package archive");
  return entries.filter((entry) => !entry.ignoredRootDirectory);
}
async function extractArchive(tool, archive, destination, root, commands) {
  await ordinary(archive);
  await mkdir(destination);
  await ordinary(destination, true);
  const text = await runTool(tool, ["l", "-slt", archive], root, commands);
  const entries = archiveMembers(text, destination);
  await runTool(tool, ["x", "-y", "-bd", "-bb0", `-o${destination}`, archive], root, commands);
  return entries;
}
async function selectedArchives(root) {
  const result = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isSymbolicLink()) continue; // Framework aliases are not selected font evidence.
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name === "app.asar") { await ordinary(child); result.push(child); }
      else if (!entry.isFile()) fail("unsupported extracted entry");
    }
  }
  await walk(root);
  requireValue(result.length === 1, "package must contain one ordinary selected app.asar");
  return result[0];
}
async function squashOffset(path) {
  const handle = await open(await ordinary(path), "r");
  try {
    const size = (await handle.stat()).size;
    const header = Buffer.alloc(64); await handle.read(header, 0, header.length, 0);
    requireValue(header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) && header[4] === 2 && header[5] === 1
      && header[8] === 0x41 && header[9] === 0x49 && header[10] === 2, "expected little-endian ELF64 AppImage type 2");
    const readSafe64 = (buffer, offset) => { const value = buffer.readBigUInt64LE(offset); requireValue(value <= BigInt(Number.MAX_SAFE_INTEGER), "ELF integer exceeds safe range"); return Number(value); };
    const phoff = readSafe64(header, 32), shoff = readSafe64(header, 40);
    const phsize = header.readUInt16LE(54), phcount = header.readUInt16LE(56), shsize = header.readUInt16LE(58), shcount = header.readUInt16LE(60);
    requireValue(phsize >= 56 && phcount > 0 && phcount < 4096 && shsize >= 64 && shcount > 0 && shcount < 65535
      && phoff + phsize * phcount < size && shoff + shsize * shcount < size, "invalid ELF tables");
    let elfEnd = Math.max(64, phoff + phsize * phcount, shoff + shsize * shcount);
    for (let index = 0; index < phcount; index += 1) {
      const row = Buffer.alloc(phsize); await handle.read(row, 0, row.length, phoff + index * phsize);
      elfEnd = Math.max(elfEnd, readSafe64(row, 8) + readSafe64(row, 32));
    }
    for (let index = 0; index < shcount; index += 1) {
      const row = Buffer.alloc(shsize); await handle.read(row, 0, row.length, shoff + index * shsize);
      if (row.readUInt32LE(4) !== 8) elfEnd = Math.max(elfEnd, readSafe64(row, 24) + readSafe64(row, 32));
    }
    requireValue(elfEnd < size, "ELF payload extends beyond AppImage");
    const scan = Buffer.alloc(Math.min(1048576 + 96, size - elfEnd)); await handle.read(scan, 0, scan.length, elfEnd);
    const candidates = [];
    for (let at = 0; at + 96 <= scan.length; at += 1) {
      if (scan.readUInt32LE(at) !== 0x73717368) continue;
      const offset = elfEnd + at;
      const block = scan.readUInt32LE(at + 12), compression = scan.readUInt16LE(at + 20), major = scan.readUInt16LE(at + 28), minor = scan.readUInt16LE(at + 30);
      const used = readSafe64(scan, at + 40);
      if (major === 4 && minor === 0 && scan.readUInt32LE(at + 4) > 0 && block >= 4096 && block <= 1048576 && (block & (block - 1)) === 0
        && compression >= 1 && compression <= 6 && used >= 96 && offset + used <= size) candidates.push({ offset, bytesUsed: used, compression, blockSize: block });
    }
    requireValue(candidates.length === 1, "missing or ambiguous canonical SquashFS offset");
    return { elfEnd, ...candidates[0] };
  } finally { await handle.close(); }
}
async function retainFailure(folder, receipt) {
  const handle = await open(resolve(folder, "extraction-receipt.json"), "wx");
  try { await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
}

export async function extractPassivePackage(root, platform, packageEntry) {
  const allowed = { windows: ["windows-installer"], macos: ["macos-dmg", "macos-zip"], linux: ["linux-appimage", "linux-deb"] };
  requireValue(allowed[platform]?.includes(packageEntry.kind) && safeRelativePath(packageEntry.fileName) && !packageEntry.fileName.includes("/"), "invalid package/platform");
  const packagePath = resolve(root, "dist", packageEntry.fileName);
  const packageBefore = await fileRecord(packagePath);
  requireValue(packageBefore.bytes === packageEntry.bytes && packageBefore.sha256 === packageEntry.sha256, "package hash does not match capture");
  const folder = await createExtractionDirectory(root, `artifacts/release/generated/package-font-extraction/${platform}/${packageEntry.kind}`);
  const commands = [], tools = [];
  const receipt = { schemaVersion: 1, evidenceKind: "passive-distributable-font-extraction", status: "Failed", kind: packageEntry.kind,
    packageBefore, packageAfter: null, selectedAsar: null, tools, commands, squashfs: null, mountCleanupVerified: packageEntry.kind !== "macos-dmg",
    extractionControlSha256: hash(await readFile(here)), installerExecuted: false, appImageExecuted: false, installed: false,
    commercialRightsApproved: false, packageAcceptance: false, productionCertified: false, finalReleaseSeal: false };
  let selected;
  let mountpoint = null, device = null, hdiutil = null, plutil = null;
  let failure = null;
  try {
    if (packageEntry.kind === "macos-dmg") {
      hdiutil = await pinnedTool("HDIUTIL"); plutil = await pinnedTool("PLUTIL"); tools.push(hdiutil, plutil);
      mountpoint = resolve(folder, "readonly-volume"); await mkdir(mountpoint);
      const attached = await runTool(hdiutil, ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountpoint, "-plist", packagePath], root, commands);
      const parsed = JSON.parse(await runTool(plutil, ["-convert", "json", "-o", "-", "-"], root, commands, attached));
      const entities = parsed["system-entities"];
      requireValue(Array.isArray(entities), "DMG attach metadata is missing");
      const volumes = entities.filter((entity) => entity["mount-point"]);
      requireValue(volumes.length === 1 && volumes[0]["mount-point"] === mountpoint && typeof volumes[0]["dev-entry"] === "string", "unexpected DMG mounted volume");
      device = volumes[0]["dev-entry"];
      const mountedInfo = await runTool(hdiutil, ["info", "-plist"], root, commands);
      const mounted = JSON.parse(await runTool(plutil, ["-convert", "json", "-o", "-", "-"], root, commands, mountedInfo));
      const image = (mounted.images ?? []).find((entry) => entry["image-path"] === packagePath
        && (entry["system-entities"] ?? []).some((entity) => entity["mount-point"] === mountpoint));
      requireValue(image && image.writeable === false, "owned DMG image is not confirmed read-only");
      receipt.readonlyMountVerified = true;
      selected = await selectedArchives(mountpoint);
      // Copy selected files while the mount is live; fonts/notices are inspected by the caller.
      const appParent = dirname(selected);
      const resourceDir = resolve(folder, "selected-resources"); await mkdir(resourceDir);
      const asar = await readFile(await ordinary(selected));
      const output = await open(resolve(resourceDir, "app.asar"), "wx"); try { await output.writeFile(asar); await output.sync(); } finally { await output.close(); }
      async function copyNotices(current, target) {
        await ordinary(current, true);
        for (const entry of await readdir(current, { withFileTypes: true })) {
          requireValue(safeRelativePath(entry.name) && !entry.isSymbolicLink(), `selected notice alias/unsafe member ${normalized(relative(appParent, resolve(current, entry.name)))}`);
          const source = resolve(current, entry.name), destination = resolve(target, entry.name);
          if (entry.isDirectory()) { await mkdir(destination); await copyNotices(source, destination); }
          else { const bytes = await readFile(await ordinary(source)); const handle = await open(destination, "wx"); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
        }
      }
      await ordinary(resolve(appParent, "licenses"), true);
      await mkdir(resolve(resourceDir, "licenses"));
      await copyNotices(resolve(appParent, "licenses"), resolve(resourceDir, "licenses"));
      selected = resolve(resourceDir, "app.asar");
    } else if (packageEntry.kind === "linux-appimage") {
      const tool = await pinnedTool("UNSQUASHFS"); tools.push(tool);
      receipt.squashfs = await squashOffset(packagePath);
      const destination = resolve(folder, "squashfs");
      const listing = await runTool(tool, ["-ll", "-o", String(receipt.squashfs.offset), packagePath], root, commands);
      requireValue(listing.length > 0, "SquashFS selected entries are missing");
      await runTool(tool, ["-no-progress", "-no-xattrs", "-o", String(receipt.squashfs.offset), "-d", destination, packagePath], root, commands);
      selected = await selectedArchives(destination);
    } else {
      const tool = await pinnedTool("7ZIP"); tools.push(tool);
      const outer = resolve(folder, "outer");
      const entries = await extractArchive(tool, packagePath, outer, root, commands);
      if (packageEntry.kind === "windows-installer") {
        const payloads = entries.filter((entry) => /(?:^|\/)app-(?:32|64|arm64)\.7z$/i.test(entry.normalizedPath));
        requireValue(payloads.length === 1 && /(?:^|\/)app-64\.7z$/i.test(payloads[0].normalizedPath), "missing/multiple NSIS application payloads");
        const inner = resolve(folder, "application");
        await extractArchive(tool, resolve(outer, payloads[0].normalizedPath), inner, root, commands);
        selected = await selectedArchives(inner);
      } else if (packageEntry.kind === "linux-deb") {
        const payloads = entries.filter((entry) => /^data\.tar(?:\.(?:gz|xz|zst|bz2))?$/.test(entry.normalizedPath));
        requireValue(payloads.length === 1, "missing/multiple deb data.tar payloads");
        const inner = resolve(folder, "data");
        const dataArchive = resolve(outer, payloads[0].normalizedPath);
        const dataEntries = await extractArchive(tool, dataArchive, inner, root, commands);
        // Compressed tar creates an intermediate ordinary tar, which must be opened passively too.
        const intermediate = dataEntries.filter((entry) => entry.normalizedPath.endsWith(".tar"));
        if (intermediate.length) {
          requireValue(intermediate.length === 1 && dataEntries.length === 1, "ambiguous compressed deb tar payload");
          const unpacked = resolve(folder, "application"); await extractArchive(tool, resolve(inner, intermediate[0].normalizedPath), unpacked, root, commands);
          selected = await selectedArchives(unpacked);
        } else selected = await selectedArchives(inner);
      } else selected = await selectedArchives(outer);
    }
    const selectedRecord = await fileRecord(selected);
    receipt.selectedAsar = { path: normalized(relative(root, selected)), ...selectedRecord };
    receipt.status = "Observed";
  } catch (error) { failure = error; receipt.error = error instanceof Error ? error.message : String(error); }
  finally {
    if (mountpoint && hdiutil) {
      try {
        await runTool(hdiutil, ["detach", device ?? mountpoint], root, commands);
        const info = await runTool(hdiutil, ["info", "-plist"], root, commands);
        const parsed = JSON.parse(await runTool(plutil, ["-convert", "json", "-o", "-", "-"], root, commands, info));
        const stillMounted = (parsed.images ?? []).flatMap((image) => image["system-entities"] ?? []).some((entity) => entity["mount-point"] === mountpoint);
        requireValue(!stillMounted, "DMG detach did not close the owned mount");
        receipt.mountCleanupVerified = true;
      } catch (error) { failure ??= error; receipt.status = "Failed"; receipt.cleanupError = error instanceof Error ? error.message : String(error); }
    }
    try {
      receipt.packageAfter = await fileRecord(packagePath);
      requireValue(JSON.stringify(receipt.packageAfter) === JSON.stringify(packageBefore), "package input changed during passive extraction");
    } catch (error) { failure ??= error; receipt.status = "Failed"; receipt.inputReadbackError = error instanceof Error ? error.message : String(error); }
    if (failure) receipt.status = "Failed";
    await retainFailure(folder, receipt);
  }
  if (failure) {
    failure.passiveExtractionReceipt = { path: normalized(relative(root, resolve(folder, "extraction-receipt.json"))), ...await fileRecord(resolve(folder, "extraction-receipt.json")) };
    throw failure;
  }
  requireValue(receipt.mountCleanupVerified && receipt.status === "Observed", "passive extraction is incomplete");
  return { asarPath: receipt.selectedAsar.path, receiptPath: normalized(relative(root, resolve(folder, "extraction-receipt.json"))), receipt };
}
