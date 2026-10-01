#!/usr/bin/env node

/** Local Electron + production-export diagnostics. Never package certification. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  connectToPackagedApp,
  createOfflineCareer,
  inspectPersistence,
  openSettings,
  quickSaveToFirstSlot,
  restoreLoadFromMainMenu,
  terminateProcessTree,
} from "./run-windows-packaged-runtime-check.mjs";

const root = process.cwd();
const executable = path.resolve(process.env.TALENTSCOUT_ELECTRON_EXECUTABLE
  || path.join(root, "node_modules/electron/dist/electron.exe"));
const entryPath = path.join(root, "electron/main.js");
const evidenceRoot = path.join(root, "artifacts/source-runtime-diagnostics");

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || "Could not inspect source provenance");
  return result.stdout.trim();
}

async function main() {
  if (process.platform !== "win32") throw new Error("This diagnostic requires Windows");
  // Read-only preflight: no implicit Electron download or production build.
  for (const required of [executable, entryPath, path.join(root, "out/play.html")]) await access(required);
  const provenance = spawnSync(process.execPath, ["scripts/assert-shipping-provenance.mjs", `--expected=${git(["rev-parse", "HEAD"])}`], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  if (provenance.status !== 0) throw new Error(`Production export provenance failed: ${provenance.stderr || provenance.stdout}`);

  await mkdir(evidenceRoot, { recursive: true });
  const runDirectory = await mkdtemp(path.join(evidenceRoot, "run-"));
  const profileDirectory = path.join(runDirectory, "runtime-profile");
  const evidence = {
    schemaVersion: 1,
    evidenceKind: "source-electron-runtime-diagnostic",
    generatedAt: new Date().toISOString(),
    sourceHead: git(["rev-parse", "HEAD"]),
    sourceDirtyEntryCount: git(["status", "--porcelain=v1"]).split(/\r?\n/).filter(Boolean).length,
    candidateBound: false,
    packagedRuntime: false,
    executable,
    entryPath,
    entrySha256: createHash("sha256").update(await readFile(entryPath)).digest("hex"),
    controls: {},
    runs: [],
    error: null,
    limitations: [
      "Runs Electron source and the production export, not a built installer or ASAR.",
      "Does not verify signing, Electron packaging fuses, installation, uninstallation, native Steam, or other operating systems.",
      "Network isolation is simulated using CDP plus an unreachable proxy; no live provider writes are intended.",
    ],
  };
  const active = new Set();
  try {
    const first = await connectToPackagedApp({ executable, entryPath, profileDirectory });
    active.add(first);
    await createOfflineCareer(first.page);
    await openSettings(first.page);
    await quickSaveToFirstSlot(first.page);
    const before = await inspectPersistence(first.page);
    const firstExit = await first.closeGracefully();
    active.delete(first);
    evidence.runs.push({ name: "create-save-close", persistence: before, exit: firstExit });
    evidence.controls.completedOpeningAndManualSave = Boolean(before.head);
    evidence.controls.closedAfterSaveWithoutForce = firstExit.exitedWithoutForce;

    const second = await connectToPackagedApp({ executable, entryPath, profileDirectory });
    active.add(second);
    await restoreLoadFromMainMenu(second.page);
    const after = await inspectPersistence(second.page);
    const secondExit = await second.closeGracefully();
    active.delete(second);
    evidence.runs.push({ name: "reopen-load-close", persistence: after, exit: secondExit });
    evidence.controls.reopenedExactManualSave = before.head?.recordHash === after.head?.recordHash;
    evidence.controls.reopenedCareerIdentity = JSON.stringify(before.keySnapshot) === JSON.stringify(after.keySnapshot);
    evidence.controls.secondCloseWithoutForce = secondExit.exitedWithoutForce;
    evidence.controls.rendererErrorsAbsent = [first, second].every((run) => run.diagnostics.rendererPageErrors.length === 0);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    for (const run of active) {
      const screenshot = path.join(runDirectory, `failure-${evidence.runs.length + 1}.png`);
      const screen = await Promise.race([run.page.evaluate(() => ({
        url: location.href,
        title: document.title,
        visibleText: document.body.innerText.slice(0, 8_000),
      })).catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), 2_000))]);
      const savedScreenshot = await run.page.screenshot({ path: screenshot, timeout: 2_000 })
        .then(() => screenshot).catch(() => null);
      evidence.runs.push({
        name: "failed-journey",
        screen,
        screenshot: savedScreenshot,
        rendererPageErrors: run.diagnostics.rendererPageErrors,
        rendererConsoleErrors: run.diagnostics.rendererConsoleErrors,
      });
    }
  } finally {
    for (const run of active) {
      if (run.child.exitCode === null) await terminateProcessTree(run.child.pid).catch(() => {});
    }
    const relative = path.relative(evidenceRoot, profileDirectory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.basename(profileDirectory) !== "runtime-profile") {
      throw new Error("Refusing to remove a profile outside diagnostic evidence");
    }
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3 });
  }
  evidence.result = !evidence.error && Object.values(evidence.controls).every(Boolean) ? "diagnostic_pass" : "diagnostic_fail";
  const output = path.join(runDirectory, "source-runtime-diagnostic.json");
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result: evidence.result, output, controls: evidence.controls, error: evidence.error }, null, 2));
  if (evidence.result !== "diagnostic_pass") process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
