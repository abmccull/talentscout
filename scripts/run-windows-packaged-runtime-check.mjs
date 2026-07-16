#!/usr/bin/env node

/**
 * Safe, non-interactive supporting verification for the unpacked Windows
 * Electron runtime. This is intentionally not the complete release matrix:
 * installer elevation, clean-account behavior, physical power interruption,
 * live Steam Cloud conflicts, and other operating systems still need their
 * declared manual/package journeys.
 *
 * The script launches only package copies built by this repository, places all
 * Chromium state below artifacts/release, and removes transient profiles after
 * producing compact JSON evidence.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import {
  evaluateWindowsRuntimeCertification,
  evaluateWindowsSignerBinding,
  inspectWindowsPackageManifestBinding,
  mergeWindowsRuntimeOperatorControls,
  requiredWindowsRuntimeControls,
  validateWindowsRuntimeOperatorAttestation,
  windowsRuntimeOperatorAttestationPolicy,
} from "./windows-runtime-operator-attestation.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const APP_DIR = path.resolve(DIST_DIR, "win-unpacked");
const APP_EXE = path.resolve(APP_DIR, "TalentScout.exe");
const APP_ASAR = path.resolve(APP_DIR, "resources", "app.asar");
const packageDocument = JSON.parse(await readFile(path.resolve(ROOT, "package.json"), "utf8"));
const productVersion = String(packageDocument.version ?? "").trim();
const INSTALLER = path.resolve(DIST_DIR, `TalentScout-Setup-${productVersion}.exe`);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const keepProfile = args.has("--keep-profile");
const strict = args.has("--strict") || process.env.npm_config_strict === "true";
const installJourney = args.has("--install-journey")
  || process.env.WINDOWS_INSTALL_JOURNEY === "true"
  || process.env.npm_config_install_journey === "true";
const manifestArgument = rawArgs.find((argument) => argument.startsWith("--manifest="));
const manifestPath = path.resolve(
  ROOT,
  manifestArgument?.slice("--manifest=".length)
    ?? "artifacts/release/candidate-package-manifest.json",
);
const attestationArgument = rawArgs.find((argument) => argument.startsWith("--attestation="));
const operatorAttestationPath = attestationArgument?.slice("--attestation=".length)
  || process.env.WINDOWS_RUNTIME_OPERATOR_ATTESTATION?.trim()
  || null;
const expectedWorkflowRunId = (
  process.env.WINDOWS_RELEASE_WORKFLOW_RUN_ID
  || process.env.GITHUB_RUN_ID
  || ""
).trim();
const expectedSignerCertificateSha256 = (
  process.env.WINDOWS_RELEASE_SIGNER_SHA256
  || ""
).trim();
const releaseEvidenceStatusPath = path.resolve(
  ROOT,
  "docs",
  "release",
  "release-evidence-status.json",
);

function runGit(argsList) {
  const result = spawnSync("git", argsList, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${argsList.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function normalizeRelative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function safeRemoveTransient(parentPath, childPath) {
  if (!isPathInside(parentPath, childPath)) {
    throw new Error(`Refusing to remove path outside evidence directory: ${childPath}`);
  }
  const basename = path.basename(childPath);
  if (
    basename !== "runtime-profile"
    && basename !== "runtime-package-no-steam"
    && basename !== "runtime-package-under-test"
    && basename !== "runtime-installed-app"
    && basename !== "runtime-profile-installed"
  ) {
    throw new Error(`Refusing to remove unexpected transient path: ${childPath}`);
  }
  await rm(childPath, { recursive: true, force: true, maxRetries: 3 });
}

async function inspectManifestBinding(head, installerArtifact) {
  return inspectWindowsPackageManifestBinding({
    root: ROOT,
    manifestPath,
    candidateCommitSha: head,
    installerArtifact,
    productVersion,
    expectedWorkflowRunId,
    resolveTagCommit: async (tag) => runGit([
      "rev-parse",
      "--verify",
      `refs/tags/${tag}^{commit}`,
    ]),
  });
}

function publicManifestBinding(binding) {
  const { realPath: _realPath, document: _document, ...publicFields } = binding;
  return publicFields;
}

function inspectAuthenticode(filePath) {
  const escapedPath = filePath.replaceAll("'", "''");
  const command = [
    `$signature = Get-AuthenticodeSignature -LiteralPath '${escapedPath}'`,
    "$subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }",
    "$thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }",
    "$sha256 = if ($signature.SignerCertificate) { $algorithm = [Security.Cryptography.SHA256]::Create(); try { -join ($algorithm.ComputeHash($signature.SignerCertificate.RawData) | ForEach-Object { $_.ToString('X2') }) } finally { $algorithm.Dispose() } } else { $null }",
    "$timestamp = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }",
    "[PSCustomObject]@{ Status = $signature.Status.ToString(); StatusMessage = $signature.StatusMessage; SignerSubject = $subject; SignerThumbprintSha1 = $thumbprint; SignerCertificateSha256 = $sha256; TimestampSubject = $timestamp } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  if (result.status !== 0) {
    return {
      status: "Unverified",
      error: result.stderr?.trim() || `PowerShell exited ${result.status}`,
    };
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return { status: "Unverified", error: "Authenticode output was not valid JSON" };
  }
}

function isAdministrator() {
  const command = [
    "$identity = [Security.Principal.WindowsIdentity]::GetCurrent()",
    "$principal = [Security.Principal.WindowsPrincipal]::new($identity)",
    "$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  return result.status === 0 && result.stdout.trim().toLowerCase() === "true";
}

async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex").toUpperCase();
}

async function artifactMetadata(kind, filePath) {
  const details = await stat(filePath);
  return {
    kind,
    path: normalizeRelative(filePath),
    bytes: details.size,
    sha256: await sha256File(filePath),
  };
}

async function assertRequiredFiles() {
  for (const filePath of [APP_EXE, APP_ASAR, INSTALLER]) {
    await access(filePath, fsConstants.R_OK);
  }
}

async function freeTcpPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("Could not allocate a local DevTools port");
  return port;
}

function appendCapped(current, chunk, maxLength = 96_000) {
  const combined = current + String(chunk);
  return combined.length <= maxLength ? combined : combined.slice(-maxLength);
}

async function terminateProcessTree(pid) {
  if (!pid) return;
  const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 && !/not found|no running instance|not running/i.test(output)) {
    throw new Error(`Failed to terminate isolated TalentScout process tree: ${output.trim()}`);
  }
}

async function waitForProcessExit(child, timeoutMs = 12_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolvePromise(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolvePromise(true);
    };
    child.once("exit", onExit);
  });
}

async function connectToPackagedApp({ executable, profileDirectory }) {
  const port = await freeTcpPort();
  const launchArgs = [
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${port}`,
    "--proxy-server=http://127.0.0.1:9",
    "--proxy-bypass-list=<-loopback>",
    "--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE 127.0.0.1",
    "--disable-background-networking",
    "--no-first-run",
  ];
  const child = spawn(executable, launchArgs, {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      ELECTRON_DEV: "0",
      NODE_OPTIONS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout = appendCapped(stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr = appendCapped(stderr, chunk);
  });

  let browser = null;
  const deadline = Date.now() + 35_000;
  while (!browser && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged app exited before DevTools connected (${child.exitCode})`);
    }
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
  }
  if (!browser) {
    await terminateProcessTree(child.pid);
    throw new Error("Timed out connecting to the packaged Chromium runtime");
  }

  const context = browser.contexts()[0];
  if (!context) throw new Error("Packaged app did not expose a browser context");
  let page = context.pages()[0];
  if (!page) page = await context.waitForEvent("page", { timeout: 10_000 });

  const rendererConsoleErrors = [];
  const rendererPageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") rendererConsoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => rendererPageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith("app://")) {
      failedRequests.push({ url, error: request.failure()?.errorText ?? "unknown" });
    }
  });

  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await page.waitForURL(/^app:\/\/host\/play/, { timeout: 30_000 });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: "none",
  });

  async function closeGracefully() {
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: true });
    } catch {
      // The window may have already closed while Electron was quitting.
    }
    try {
      await browser.close();
    } catch {
      // The remote browser disappears when the Electron main process exits.
    }
    const exited = await waitForProcessExit(child);
    if (!exited) await terminateProcessTree(child.pid);
    return {
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      stdout,
      stderr,
    };
  }

  return {
    browser,
    context,
    page,
    cdp,
    child,
    launchArgs,
    diagnostics: {
      rendererConsoleErrors,
      rendererPageErrors,
      failedRequests,
      get stdout() { return stdout; },
      get stderr() { return stderr; },
    },
    closeGracefully,
  };
}

async function skipSplash(page) {
  const skip = page.getByRole("button", { name: "Skip intro" });
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skip.click();
  }
  await page.getByTestId("main-menu-actions").waitFor({ timeout: 30_000 });
}

async function createOfflineCareer(page) {
  await skipSplash(page);
  await page.getByRole("button", { name: "Start Youth Career" }).click();
  await page.locator("#scout-first-name").fill("Offline");
  await page.locator("#scout-last-name").fill("Verifier");
  await page.getByText("Field Investigator", { exact: true }).click();
  for (let step = 0; step < 3; step += 1) {
    const button = page.getByRole("button", { name: "Continue", exact: true });
    await button.waitFor({ state: "visible", timeout: 10_000 });
    await button.click();
  }
  await page.getByRole("button", { name: "Begin Career" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).waitFor({
    timeout: 60_000,
  });
  await page.getByText("Offline Verifier", { exact: true }).waitFor({ timeout: 30_000 });
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor({
    timeout: 30_000,
  });
}

async function quickSaveToFirstSlot(page) {
  await page.getByRole("button", { name: "Quick Save", exact: true }).click();
  await page.getByText("Saved to slot 1", { exact: true }).waitFor({ timeout: 30_000 });
}

async function overwriteFirstSlot(page) {
  await page.getByRole("button", { name: "Manage Saves", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save and Load Game" });
  await dialog.waitFor({ timeout: 10_000 });
  const savePanel = dialog.getByRole("tabpanel", { name: "Save game" });
  await savePanel.getByRole("button", { name: "Save", exact: true }).first().click();
  await savePanel.getByRole("button", { name: "Confirm", exact: true }).click();
  await savePanel.getByText("Saved", { exact: true }).waitFor({ timeout: 30_000 });
  await page.keyboard.press("Escape");
}

async function inspectPersistence(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolvePromise, reject) => {
      const request = indexedDB.open("TalentScoutDB");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    const readAll = (storeName) => new Promise((resolvePromise, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    const [saves, archives, queue] = await Promise.all([
      readAll("saves"),
      readAll("saveArchives"),
      readAll("saveSyncQueue"),
    ]);
    database.close();

    const digest = async (value) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    };
    const head = saves.find((record) => record.slot === 1) ?? null;
    const state = head?.state ?? null;
    const scout = state?.scout ?? {};
    const finances = state?.finances ?? {};
    const snapshotForState = (candidateState) => {
      if (!candidateState) return null;
      const candidateScout = candidateState.scout ?? {};
      const candidateFinances = candidateState.finances ?? {};
      return {
        season: candidateState.currentSeason,
        week: candidateState.currentWeek,
        scoutName: `${candidateScout.firstName ?? ""} ${candidateScout.lastName ?? ""}`.trim(),
        reputation: candidateScout.reputation,
        balance: candidateFinances.balance ?? candidateFinances.cash ?? null,
        reportCount: candidateState.reports ? Object.keys(candidateState.reports).length : 0,
        transferCount: Array.isArray(candidateState.transferRecords)
          ? candidateState.transferRecords.length
          : 0,
        obligationCount: candidateState.consequenceState?.obligations
          ? Object.keys(candidateState.consequenceState.obligations).length
          : 0,
        runId: candidateState.runManifest?.runId ?? null,
      };
    };
    const keySnapshot = state ? {
      season: state.currentSeason,
      week: state.currentWeek,
      scoutName: `${scout.firstName ?? ""} ${scout.lastName ?? ""}`.trim(),
      reputation: scout.reputation,
      balance: finances.balance ?? finances.cash ?? null,
      reportCount: state.reports ? Object.keys(state.reports).length : 0,
      transferCount: Array.isArray(state.transferRecords) ? state.transferRecords.length : 0,
      obligationCount: state.consequenceState?.obligations
        ? Object.keys(state.consequenceState.obligations).length
        : 0,
      runId: state.runManifest?.runId ?? null,
    } : null;

    return {
      databaseVersion: database.version,
      head: head ? {
        slot: head.slot,
        name: head.name,
        schemaVersion: head.schemaVersion,
        rulesVersion: head.rulesVersion,
        buildVersion: head.buildVersion,
        savedAt: head.savedAt,
        storageRevision: head.storageRevision ?? null,
        scoutName: head.scoutName,
        season: head.season,
        week: head.week,
        recordHash: await digest(head),
        stateHash: await digest(head.state),
      } : null,
      keySnapshot,
      archiveCount: archives.length,
      archives: await Promise.all(archives.map(async (archive) => ({
        id: archive.id,
        slot: archive.slot,
        kind: archive.kind,
        recordRevision: archive.recordRevision ?? null,
        verified: archive.verified ?? null,
        recordHash: await digest(archive.record),
        stateHash: await digest(archive.record?.state),
        keySnapshot: snapshotForState(archive.record?.state),
      }))),
      queue: queue.map((entry) => ({
        id: entry.id,
        slot: entry.slot,
        target: entry.target,
        operation: entry.operation ?? "upload",
        status: entry.status,
        attempts: entry.attempts,
        lastError: entry.lastError ?? null,
      })),
    };
  });
}

async function corruptNewestHead(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolvePromise, reject) => {
      const request = indexedDB.open("TalentScoutDB");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolvePromise(request.result);
    });
    const result = await new Promise((resolvePromise, reject) => {
      const transaction = database.transaction("saves", "readwrite");
      const store = transaction.objectStore("saves");
      const read = store.get(1);
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const record = read.result;
        if (!record) {
          reject(new Error("Manual slot 1 is missing"));
          return;
        }
        const previous = {
          savedAt: record.savedAt,
          storageRevision: record.storageRevision ?? null,
          scoutName: record.scoutName,
        };
        record.state = null;
        const write = store.put(record);
        write.onerror = () => reject(write.error);
        transaction.oncomplete = () => resolvePromise(previous);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Corruption transaction aborted"));
      };
    });
    database.close();
    return result;
  });
}

async function audioRangeProbe(page) {
  return page.evaluate(async () => {
    const response = await fetch("app://host/audio/music/title-anthem_1.mp3", {
      headers: { Range: "bytes=0-1023" },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentRange: response.headers.get("content-range"),
      acceptRanges: response.headers.get("accept-ranges"),
      byteLength: bytes.byteLength,
      headerHex: Array.from(bytes.slice(0, 4), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
    };
  });
}

async function steamUnavailableProbe(page) {
  return page.evaluate(async () => ({
    bridgePresent: typeof window.electronAPI?.steam?.isAvailable === "function",
    available: typeof window.electronAPI?.steam?.isAvailable === "function"
      ? await window.electronAPI.steam.isAvailable()
      : null,
  }));
}

async function offlineProbe(page) {
  return page.evaluate(() => ({
    navigatorOnline: navigator.onLine,
    location: location.href,
    protocol: location.protocol,
  }));
}

async function restoreLoadFromMainMenu(page) {
  await skipSplash(page);
  const continueButton = page.getByRole("button", {
    name: /^Continue(?: from (?:verified backup|cloud recovery))?$/,
  });
  await continueButton.waitFor({ timeout: 30_000 });
  await continueButton.click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).waitFor({
    timeout: 30_000,
  });
  await page.getByText("Offline Verifier", { exact: true }).waitFor({ timeout: 30_000 });
}

async function mainMenuRecoveryDisclosure(page) {
  await skipSplash(page);
  await page.getByRole("button", { name: "Load Game", exact: true }).click();
  await page.getByRole("heading", { name: "Load Game", exact: true }).waitFor({ timeout: 10_000 });
  const body = await page.locator("body").innerText();
  return {
    disclosed: /verified backup|recovered|damaged|earlier version/i.test(body),
    matchingText: body
      .split(/\r?\n/)
      .filter((line) => /verified backup|recovered|damaged|earlier version/i.test(line))
      .slice(0, 8),
  };
}

function control(status, evidence, risk = null) {
  return { status, evidence, ...(risk ? { risk } : {}) };
}

async function runExactCandidateInstallJourney({
  evidenceDir,
  head,
  sourceTreeClean,
  manifestBinding,
  installerPath,
  installerSignature,
  unpackedExecutableSignature,
  signerBinding,
  expectedExeSha256,
  expectedAsarSha256,
}) {
  const result = {
    requested: installJourney,
    status: "Unverified",
    preconditions: {
      sourceTreeClean,
      manifestBound: manifestBinding.packagePassed,
      authenticodeStatus: installerSignature.Status ?? "Unverified",
      unpackedExecutableAuthenticodeStatus:
        unpackedExecutableSignature.Status ?? "Unverified",
      signerPinned: signerBinding.passed,
      administrator: isAdministrator(),
    },
    install: null,
    firstRun: null,
    restart: null,
    uninstall: null,
    failures: [],
  };
  if (!installJourney) {
    result.failures.push("Journey was not requested; rerun with --install-journey.");
    return result;
  }

  if (!sourceTreeClean) result.failures.push("working tree is not clean");
  if (!manifestBinding.packagePassed) {
    result.failures.push("installer is not bound to the candidate manifest");
  }
  if (
    result.preconditions.authenticodeStatus !== "Valid"
    || result.preconditions.unpackedExecutableAuthenticodeStatus !== "Valid"
  ) {
    result.failures.push("installer or unpacked executable lacks a valid Authenticode signature");
  }
  if (
    installerSignature.SignerCertificateSha256
    !== unpackedExecutableSignature.SignerCertificateSha256
  ) {
    result.failures.push("installer and unpacked executable use different signing certificates");
  }
  if ((strict || expectedSignerCertificateSha256) && !signerBinding.passed) {
    result.failures.push(`release signer binding failed: ${signerBinding.failures.join("; ")}`);
  }
  if (!result.preconditions.administrator) {
    result.failures.push("current token is not elevated for the per-machine shipping installer");
  }
  if (result.failures.length > 0) return result;

  const installDirectory = path.resolve(evidenceDir, "runtime-installed-app");
  const installedProfile = path.resolve(evidenceDir, "runtime-profile-installed");
  await safeRemoveTransient(evidenceDir, installDirectory);
  await safeRemoveTransient(evidenceDir, installedProfile);
  await mkdir(installedProfile, { recursive: true });

  let activeRun = null;
  let installed = false;
  try {
    const installResult = spawnSync(
      installerPath,
      ["/S", "/allusers", `/D=${installDirectory}`],
      {
        cwd: evidenceDir,
        encoding: "utf8",
        windowsHide: true,
        timeout: 240_000,
      },
    );
    result.install = {
      exitCode: installResult.status,
      signal: installResult.signal,
      error: installResult.error?.message ?? null,
      stdout: installResult.stdout?.trim() ?? "",
      stderr: installResult.stderr?.trim() ?? "",
      directory: normalizeRelative(installDirectory),
    };
    if (installResult.status !== 0) {
      throw new Error(`shipping installer exited ${installResult.status}`);
    }
    installed = true;

    const installedExe = path.resolve(installDirectory, "TalentScout.exe");
    const installedAsar = path.resolve(installDirectory, "resources", "app.asar");
    await access(installedExe, fsConstants.R_OK);
    await access(installedAsar, fsConstants.R_OK);
    const installedAsarSha256 = await sha256File(installedAsar);
    const installedExeSha256 = await sha256File(installedExe);
    const installedExeSignature = inspectAuthenticode(installedExe);
    const installedSignerBinding = evaluateWindowsSignerBinding({
      installerSignature,
      executableSignature: installedExeSignature,
      expectedSignerCertificateSha256,
    });
    result.install.installedAppAsarSha256 = installedAsarSha256;
    result.install.installedAppAsarMatchesBuild = installedAsarSha256 === expectedAsarSha256;
    result.install.installedAppExeSha256 = installedExeSha256;
    result.install.installedAppExeMatchesBuild = installedExeSha256 === expectedExeSha256;
    result.install.installedAppSignature = installedExeSignature;
    result.install.installedSignerBinding = installedSignerBinding;
    if (!result.install.installedAppAsarMatchesBuild) {
      throw new Error("installed app.asar does not match the packaged build under test");
    }
    if (!result.install.installedAppExeMatchesBuild) {
      throw new Error("installed TalentScout.exe does not match the packaged build under test");
    }
    const installedSignatureMatchesInstaller = installedExeSignature.Status === "Valid"
      && installedExeSignature.SignerCertificateSha256
        === installerSignature.SignerCertificateSha256;
    result.install.installedSignatureMatchesInstaller = installedSignatureMatchesInstaller;
    if (!installedSignatureMatchesInstaller) {
      throw new Error("installed TalentScout.exe signature differs from the tested installer signer");
    }
    if ((strict || expectedSignerCertificateSha256) && !installedSignerBinding.passed) {
      throw new Error(`installed TalentScout.exe signer binding failed: ${installedSignerBinding.failures.join("; ")}`);
    }

    activeRun = await connectToPackagedApp({
      executable: installedExe,
      profileDirectory: installedProfile,
    });
    const offline = await offlineProbe(activeRun.page);
    const steam = await steamUnavailableProbe(activeRun.page);
    await createOfflineCareer(activeRun.page);
    await openSettings(activeRun.page);
    await quickSaveToFirstSlot(activeRun.page);
    const persistence = await inspectPersistence(activeRun.page);
    const firstLog = await activeRun.closeGracefully();
    activeRun = null;
    result.firstRun = {
      offline,
      steam,
      persistence,
      gracefulExit: firstLog,
    };

    activeRun = await connectToPackagedApp({
      executable: installedExe,
      profileDirectory: installedProfile,
    });
    const restartOffline = await offlineProbe(activeRun.page);
    await restoreLoadFromMainMenu(activeRun.page);
    const restartPersistence = await inspectPersistence(activeRun.page);
    const restartLog = await activeRun.closeGracefully();
    activeRun = null;
    const identityPreserved = JSON.stringify(restartPersistence.keySnapshot)
      === JSON.stringify(persistence.keySnapshot);
    const headPreserved = restartPersistence.head?.recordHash === persistence.head?.recordHash;
    result.restart = {
      offline: restartOffline,
      persistence: restartPersistence,
      identityPreserved,
      headPreserved,
      gracefulExit: restartLog,
    };

    if (offline.navigatorOnline !== false || restartOffline.navigatorOnline !== false) {
      result.failures.push("installed runtime did not remain offline");
    }
    if (persistence.head?.buildVersion !== head) {
      result.failures.push("installed runtime save buildVersion does not match candidate SHA");
    }
    if (!identityPreserved || !headPreserved) {
      result.failures.push("installed runtime did not preserve the exact local save across restart");
    }
    if (!steam.bridgePresent || steam.available !== false) {
      result.failures.push("installed runtime did not expose the expected unavailable-Steam fallback");
    }
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (activeRun?.child?.pid) {
      await terminateProcessTree(activeRun.child.pid).catch(() => undefined);
    }

    let uninstallPath = null;
    if (installed) {
      try {
        const names = await readdir(installDirectory);
        const uninstallerName = names.find((name) => /^uninstall.*\.exe$/i.test(name));
        if (uninstallerName) uninstallPath = path.resolve(installDirectory, uninstallerName);
      } catch {
        // The install may have failed before a complete directory existed.
      }
    }

    if (uninstallPath) {
      const uninstallResult = spawnSync(
        uninstallPath,
        ["/S", "/allusers"],
        {
          cwd: evidenceDir,
          encoding: "utf8",
          windowsHide: true,
          timeout: 240_000,
        },
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
      let installDirectoryRemains = false;
      try {
        await access(installDirectory);
        installDirectoryRemains = true;
      } catch {
        installDirectoryRemains = false;
      }
      result.uninstall = {
        path: normalizeRelative(uninstallPath),
        exitCode: uninstallResult.status,
        signal: uninstallResult.signal,
        error: uninstallResult.error?.message ?? null,
        installDirectoryRemains,
      };
      if (uninstallResult.status !== 0) {
        result.failures.push(`shipping uninstaller exited ${uninstallResult.status}`);
      }
      if (installDirectoryRemains) {
        result.failures.push("shipping uninstaller left the isolated install directory behind");
      }
    } else if (installed) {
      result.failures.push("shipping installation did not provide an uninstaller");
    }

    await safeRemoveTransient(evidenceDir, installedProfile).catch(() => undefined);
    await safeRemoveTransient(evidenceDir, installDirectory).catch(() => undefined);
  }

  result.status = result.failures.length === 0 ? "Passed" : "Failed";
  return result;
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("This supporting check must run on Windows");
  }
  if (strict && !/^\d+$/.test(expectedWorkflowRunId)) {
    throw new Error(
      "Strict Windows certification requires WINDOWS_RELEASE_WORKFLOW_RUN_ID (or GITHUB_RUN_ID)",
    );
  }
  if (strict && !/^[a-f0-9]{64}$/i.test(expectedSignerCertificateSha256)) {
    throw new Error("Strict Windows certification requires WINDOWS_RELEASE_SIGNER_SHA256");
  }
  await assertRequiredFiles();

  const head = runGit(["rev-parse", "HEAD"]);
  const tree = runGit(["rev-parse", "HEAD^{tree}"]);
  const dirtyEntries = runGit(["status", "--porcelain=v1"])
    .split(/\r?\n/)
    .filter(Boolean);
  const evidenceDir = path.resolve(
    ROOT,
    "artifacts",
    "release",
    "packages",
    head,
    "windows-x64",
  );
  const profileDirectory = path.resolve(evidenceDir, "runtime-profile");
  const noSteamPackage = path.resolve(evidenceDir, "runtime-package-no-steam");
  await mkdir(evidenceDir, { recursive: true });
  await safeRemoveTransient(evidenceDir, profileDirectory);
  await safeRemoveTransient(evidenceDir, noSteamPackage);
  await mkdir(profileDirectory, { recursive: true });
  const runtimeStaging = await stageRuntimeArtifacts(evidenceDir);
  const testedAppExe = runtimeStaging.appExecutable;
  const testedAppAsar = runtimeStaging.appAsar;
  const testedInstaller = runtimeStaging.installer;

  const packagedArtifacts = await Promise.all([
    artifactMetadata("windows-installer", INSTALLER),
    artifactMetadata("windows-unpacked-executable", APP_EXE),
    artifactMetadata("windows-app-asar", APP_ASAR),
  ]);
  const testedArtifacts = await Promise.all([
    artifactMetadata("windows-installer-staged", testedInstaller),
    artifactMetadata("windows-unpacked-executable-staged", testedAppExe),
    artifactMetadata("windows-app-asar-staged", testedAppAsar),
  ]);
  const installerArtifact = packagedArtifacts.find(
    (artifact) => artifact.kind === "windows-installer",
  );
  const testedExeArtifact = testedArtifacts.find(
    (artifact) => artifact.kind === "windows-unpacked-executable-staged",
  );
  const testedAsarArtifact = testedArtifacts.find(
    (artifact) => artifact.kind === "windows-app-asar-staged",
  );
  if (!installerArtifact || !testedExeArtifact || !testedAsarArtifact) {
    throw new Error("Package artifact inventory is incomplete");
  }
  const manifestBinding = await inspectManifestBinding(head, installerArtifact);
  const authenticode = {
    installer: inspectAuthenticode(testedInstaller),
    unpackedExecutable: inspectAuthenticode(testedAppExe),
  };
  const signerBinding = evaluateWindowsSignerBinding({
    installerSignature: authenticode.installer,
    executableSignature: authenticode.unpackedExecutable,
    expectedSignerCertificateSha256,
  });
  const releaseEvidenceStatus = JSON.parse(await readFile(releaseEvidenceStatusPath, "utf8"));
  const requiredControls = requiredWindowsRuntimeControls(releaseEvidenceStatus);
  const operatorPolicy = windowsRuntimeOperatorAttestationPolicy(releaseEvidenceStatus);
  const operatorAttestableControls = operatorPolicy.attestableControls;

  const validateOperatorAttestation = () => validateWindowsRuntimeOperatorAttestation({
    root: ROOT,
    attestationPath: operatorAttestationPath,
    candidateCommitSha: head,
    candidateTreeSha: tree,
    candidateTag: manifestBinding.candidateTag,
    productVersion,
    workflowRunId: manifestBinding.workflowRunId,
    signerCertificateSha256: signerBinding.observedSignerCertificateSha256,
    packageManifestPath: manifestBinding.realPath ?? manifestPath,
    packageManifestGeneratedAt: manifestBinding.generatedAt,
    installerSha256: installerArtifact.sha256,
    requiredControls,
    operatorAttestableControls,
    schemaPath: operatorPolicy.schemaPath,
    certificationBundleRoot: operatorPolicy.certificationBundleRoot,
  });
  const initialOperatorAttestationValidation = operatorAttestationPath
    ? await validateOperatorAttestation()
    : null;
  if (initialOperatorAttestationValidation && !initialOperatorAttestationValidation.accepted) {
    throw new Error(
      `Windows runtime operator attestation was rejected:\n- ${initialOperatorAttestationValidation.failures.join("\n- ")}`,
    );
  }

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceHead: head,
    sourceTree: tree,
    sourceTreeClean: dirtyEntries.length === 0,
    sourceDirtyEntryCount: dirtyEntries.length,
    candidateBound: false,
    productVersion,
    workflowRunId: manifestBinding.workflowRunId ?? null,
    host: {
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      hostname: os.hostname(),
      account: os.userInfo().username,
      standardUserAccountVerified: false,
      filesystem: "Unverified by this script",
    },
    artifacts: packagedArtifacts,
    testedArtifacts,
    artifactStaging: {
      status: "Passed",
      stagedRoot: normalizeRelative(runtimeStaging.stagingRoot),
      sourceFileCount: runtimeStaging.sourceAppInventory.length,
      testedFileCount: runtimeStaging.initialAppInventory.length,
      sourceInventorySha256: createHash("sha256")
        .update(JSON.stringify(runtimeStaging.sourceAppInventory))
        .digest("hex"),
      testedInventorySha256: createHash("sha256")
        .update(JSON.stringify(runtimeStaging.initialAppInventory))
        .digest("hex"),
      sourceStableDuringStage: runtimeStaging.sourceStableDuringStage,
      stagedCopyExact: runtimeStaging.stagedCopyExact,
      unchangedAtCompletion: false,
    },
    candidateManifestBinding: publicManifestBinding(manifestBinding),
    authenticode,
    signerBinding,
    controls: {},
    requiredControlPolicy: {
      path: normalizeRelative(releaseEvidenceStatusPath),
      requiredControls,
      operatorAttestableControls,
      operatorAttestationSchema: operatorPolicy.schemaPath,
      certificationBundleRoot: operatorPolicy.certificationBundleRoot,
    },
    operatorAttestation: initialOperatorAttestationValidation
      ? {
          status: "Accepted",
          path: initialOperatorAttestationValidation.attestationPath,
          sha256: initialOperatorAttestationValidation.attestationSha256,
          tester: initialOperatorAttestationValidation.attestation.tester,
          completedAt: initialOperatorAttestationValidation.attestation.completedAt,
          schema: initialOperatorAttestationValidation.schema,
          certificationBundlePath:
            initialOperatorAttestationValidation.attestation.certificationBundlePath,
          claimedControls: initialOperatorAttestationValidation.attestation.claims.map(
            (claim) => claim.controlId,
          ),
        }
      : {
          status: "Not supplied",
          operatorAttestableControls,
        },
    runs: [],
    limitations: [],
  };

  const sevenZip = path.resolve(ROOT, "node_modules", "7zip-bin", "win", "x64", "7za.exe");
  const archiveTest = spawnSync(sevenZip, ["t", testedInstaller], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
  });
  evidence.installerInspection = {
    archiveIntegrityExitCode: archiveTest.status,
    archiveIntegrityPassed: archiveTest.status === 0 && /Everything is Ok/.test(archiveTest.stdout),
    warning: /data after the end of archive/i.test(archiveTest.stdout)
      ? "Expected NSIS executable tail reported by 7-Zip"
      : null,
    signature: "Not inspected by Node runtime; use platform signing gate on the final candidate",
  };
  evidence.controls.packageArchiveIntegrity = control(
    evidence.installerInspection.archiveIntegrityPassed ? "Passed" : "Failed",
    "7-Zip tested every embedded installer member without an integrity error.",
  );
  evidence.controls.windowsAuthenticodeSignature = control(
    signerBinding.passed ? "Passed" : "Unverified",
    { authenticode, signerBinding },
    signerBinding.passed
      ? null
      : "The package must be validly signed and match WINDOWS_RELEASE_SIGNER_SHA256 before it can certify a release.",
  );
  evidence.controls.packageManifestCandidateBinding = control(
    manifestBinding.passed ? "Passed" : "Unverified",
    manifestBinding,
  );

  let firstRun;
  const activeRuns = new Set();
  let persistedBeforeRestart;
  let runtimeJourneyCompleted = false;
  try {
    firstRun = await connectToPackagedApp({ executable: testedAppExe, profileDirectory });
    activeRuns.add(firstRun);
    const initialOffline = await offlineProbe(firstRun.page);
    const audio = await audioRangeProbe(firstRun.page);
    const steam = await steamUnavailableProbe(firstRun.page);
    await createOfflineCareer(firstRun.page);
    await openSettings(firstRun.page);
    await quickSaveToFirstSlot(firstRun.page);
    await overwriteFirstSlot(firstRun.page);
    await firstRun.page.waitForTimeout(1_500);
    persistedBeforeRestart = await inspectPersistence(firstRun.page);
    const runLog = await firstRun.closeGracefully();
    activeRuns.delete(firstRun);
    evidence.runs.push({
      name: "first-launch-offline-create-save",
      offline: initialOffline,
      audio,
      steam,
      persistence: persistedBeforeRestart,
      launchArgs: firstRun.launchArgs,
      gracefulExit: runLog,
      diagnostics: {
        rendererConsoleErrors: firstRun.diagnostics.rendererConsoleErrors,
        rendererPageErrors: firstRun.diagnostics.rendererPageErrors,
        failedRequests: firstRun.diagnostics.failedRequests,
      },
    });

    evidence.controls.packagedStartupWithoutDevelopmentServer = control(
      initialOffline.protocol === "app:" ? "Passed" : "Failed",
      `${initialOffline.location}; static app protocol loaded from the package.`,
    );
    evidence.controls.offlineFirstLaunchAndNewCareer = control(
      initialOffline.navigatorOnline === false && persistedBeforeRestart.head ? "Passed" : "Failed",
      "The package launched through a dead proxy, CDP reported offline, a Youth career was created, and slot 1 committed locally.",
    );
    evidence.controls.packagedAudioRangeStreaming = control(
      audio.status === 206
        && audio.byteLength === 1024
        && audio.contentType === "audio/mpeg"
        && /^bytes 0-1023\//.test(audio.contentRange ?? "")
        ? "Passed"
        : "Failed",
      audio,
    );
    evidence.controls.steamClientUnavailableFallback = control(
      steam.bridgePresent && steam.available === false && Boolean(persistedBeforeRestart.head)
        ? "Passed"
        : "Failed",
      {
        ...steam,
        localHeadCommitted: Boolean(persistedBeforeRestart.head),
        queuedRemoteIntents: persistedBeforeRestart.queue,
      },
    );
    evidence.controls.offlineRemoteQueueCoalescing = control(
      persistedBeforeRestart.queue.length === 1
        && persistedBeforeRestart.queue[0]?.target === "steam"
        && persistedBeforeRestart.queue[0]?.slot === 1
        ? "Passed"
        : "Failed",
      {
        savesCommittedToSlot: 2,
        queuedIntents: persistedBeforeRestart.queue,
      },
    );
    evidence.controls.transactionalPreviousGeneration = control(
      persistedBeforeRestart.archiveCount >= 1
        && (persistedBeforeRestart.head?.storageRevision ?? 0) >= 2
        ? "Passed"
        : "Failed",
      {
        storageRevision: persistedBeforeRestart.head?.storageRevision ?? null,
        archiveCount: persistedBeforeRestart.archiveCount,
      },
    );
    evidence.controls.saveBuildVersionCandidateBinding = control(
      persistedBeforeRestart.head?.buildVersion === head ? "Passed" : "Failed",
      {
        expectedCandidateSha: head,
        persistedBuildVersion: persistedBeforeRestart.head?.buildVersion ?? null,
      },
      persistedBeforeRestart.head?.buildVersion === head
        ? null
        : "Packaged saves cannot be traced to the source candidate that created them.",
    );

    const secondRun = await connectToPackagedApp({ executable: testedAppExe, profileDirectory });
    activeRuns.add(secondRun);
    const secondOffline = await offlineProbe(secondRun.page);
    await restoreLoadFromMainMenu(secondRun.page);
    const persistedAfterRestart = await inspectPersistence(secondRun.page);
    const identityPreserved = JSON.stringify(persistedAfterRestart.keySnapshot)
      === JSON.stringify(persistedBeforeRestart.keySnapshot);
    const exactHeadPreserved = persistedAfterRestart.head?.recordHash
      === persistedBeforeRestart.head?.recordHash;
    const corruptionTarget = await corruptNewestHead(secondRun.page);
    const secondLog = await secondRun.closeGracefully();
    activeRuns.delete(secondRun);
    evidence.runs.push({
      name: "offline-restart-load-and-corrupt-newest-fixture",
      offline: secondOffline,
      persistence: persistedAfterRestart,
      identityPreserved,
      exactHeadPreserved,
      isolatedCorruptionFixture: corruptionTarget,
      gracefulExit: secondLog,
      diagnostics: {
        rendererConsoleErrors: secondRun.diagnostics.rendererConsoleErrors,
        rendererPageErrors: secondRun.diagnostics.rendererPageErrors,
        failedRequests: secondRun.diagnostics.failedRequests,
      },
    });
    evidence.controls.offlineSaveQuitReopenContinue = control(
      secondOffline.navigatorOnline === false && identityPreserved && exactHeadPreserved
        ? "Passed"
        : "Failed",
      {
        identityPreserved,
        exactHeadPreserved,
        beforeHash: persistedBeforeRestart.head?.recordHash ?? null,
        afterHash: persistedAfterRestart.head?.recordHash ?? null,
      },
    );

    const recoveryRun = await connectToPackagedApp({ executable: testedAppExe, profileDirectory });
    activeRuns.add(recoveryRun);
    const recoveryDisclosure = await mainMenuRecoveryDisclosure(recoveryRun.page);
    await recoveryRun.page.getByRole("button", { name: "Back", exact: true }).click();
    await restoreLoadFromMainMenu(recoveryRun.page);
    const recoveredState = await inspectPersistence(recoveryRun.page);
    const loadedRecoveredCareer = await recoveryRun.page
      .getByText("Offline Verifier", { exact: true })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const archiveMatchesOriginal = recoveredState.archives.some((archive) => {
      const snapshot = archive.keySnapshot;
      const original = persistedBeforeRestart.keySnapshot;
      return snapshot
        && original
        && snapshot.scoutName === original.scoutName
        && snapshot.season === original.season
        && snapshot.week === original.week
        && snapshot.runId === original.runId;
    });
    const recoveryLog = await recoveryRun.closeGracefully();
    activeRuns.delete(recoveryRun);
    evidence.runs.push({
      name: "corrupt-newest-recovery",
      disclosure: recoveryDisclosure,
      recoveredState,
      loadedRecoveredCareer,
      archiveMatchesOriginal,
      gracefulExit: recoveryLog,
      diagnostics: {
        rendererConsoleErrors: recoveryRun.diagnostics.rendererConsoleErrors,
        rendererPageErrors: recoveryRun.diagnostics.rendererPageErrors,
        failedRequests: recoveryRun.diagnostics.failedRequests,
      },
    });
    evidence.controls.corruptNewestGenerationRecovery = control(
      loadedRecoveredCareer && archiveMatchesOriginal ? "Passed" : "Failed",
      {
        loadedRecoveredCareer,
        archiveMatchesOriginal,
        archiveCount: recoveredState.archiveCount,
      },
    );
    evidence.controls.recoveryDisclosureAtEntry = control(
      recoveryDisclosure.disclosed ? "Passed" : "Failed",
      recoveryDisclosure,
      recoveryDisclosure.disclosed
        ? null
        : "The verified fallback loads, but the main-menu save card does not tell the player that recovery occurred.",
    );

    await cp(runtimeStaging.appDirectory, noSteamPackage, { recursive: true, force: false });
    const removedSdkFiles = [
      path.resolve(
        noSteamPackage,
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "steamworks.js",
        "dist",
        "win64",
        "steamworksjs.win32-x64-msvc.node",
      ),
      path.resolve(
        noSteamPackage,
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "steamworks.js",
        "dist",
        "win64",
        "steam_api64.dll",
      ),
    ];
    for (const sdkFile of removedSdkFiles) {
      if (isPathInside(noSteamPackage, sdkFile)) await rm(sdkFile, { force: true });
    }
    const noSteamProfile = path.resolve(noSteamPackage, "runtime-profile");
    await mkdir(noSteamProfile, { recursive: true });
    const noSteamRun = await connectToPackagedApp({
      executable: path.resolve(noSteamPackage, "TalentScout.exe"),
      profileDirectory: noSteamProfile,
    });
    activeRuns.add(noSteamRun);
    const noSteamOffline = await offlineProbe(noSteamRun.page);
    const noSteamBridge = await steamUnavailableProbe(noSteamRun.page);
    await skipSplash(noSteamRun.page);
    const menuAvailable = await noSteamRun.page
      .getByRole("button", { name: "Start Youth Career", exact: true })
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const noSteamLog = await noSteamRun.closeGracefully();
    activeRuns.delete(noSteamRun);
    evidence.runs.push({
      name: "steam-sdk-files-absent-startup",
      removedSdkFiles: removedSdkFiles.map(normalizeRelative),
      offline: noSteamOffline,
      steam: noSteamBridge,
      menuAvailable,
      gracefulExit: noSteamLog,
      diagnostics: {
        rendererConsoleErrors: noSteamRun.diagnostics.rendererConsoleErrors,
        rendererPageErrors: noSteamRun.diagnostics.rendererPageErrors,
        failedRequests: noSteamRun.diagnostics.failedRequests,
      },
    });
    evidence.controls.steamSdkAbsentFallback = control(
      noSteamOffline.protocol === "app:"
        && noSteamBridge.bridgePresent
        && noSteamBridge.available === false
        && menuAvailable
        ? "Passed"
        : "Failed",
      {
        removedSdkFileCount: removedSdkFiles.length,
        bridge: noSteamBridge,
        menuAvailable,
      },
    );
    runtimeJourneyCompleted = true;
  } finally {
    for (const run of activeRuns) {
      if (run?.child?.pid && run.child.exitCode === null) {
        await terminateProcessTree(run.child.pid).catch(() => undefined);
      }
    }
    if (!keepProfile) {
      await safeRemoveTransient(evidenceDir, profileDirectory);
      await safeRemoveTransient(evidenceDir, noSteamPackage);
      if (!runtimeJourneyCompleted) {
        await safeRemoveTransient(evidenceDir, runtimeStaging.stagingRoot);
      }
    }
  }

  const exactInstallJourney = await runExactCandidateInstallJourney({
    evidenceDir,
    head,
    sourceTreeClean: evidence.sourceTreeClean,
    manifestBinding,
    installerPath: testedInstaller,
    installerSignature: authenticode.installer,
    unpackedExecutableSignature: authenticode.unpackedExecutable,
    signerBinding,
    expectedExeSha256: testedExeArtifact.sha256,
    expectedAsarSha256: testedAsarArtifact.sha256,
  });
  evidence.exactCandidateInstallJourney = exactInstallJourney;
  evidence.controls.installerInstalledAppOfflineSaveRestartUninstall = control(
    exactInstallJourney.status,
    {
      requested: exactInstallJourney.requested,
      preconditions: exactInstallJourney.preconditions,
      install: exactInstallJourney.install,
      restart: exactInstallJourney.restart
        ? {
            identityPreserved: exactInstallJourney.restart.identityPreserved,
            headPreserved: exactInstallJourney.restart.headPreserved,
          }
        : null,
      uninstall: exactInstallJourney.uninstall,
      failures: exactInstallJourney.failures,
    },
  );
  evidence.controls.interruptedWriteAtConfirmedTransactionBoundary = control(
    "Unverified",
    "Source-level fault injection covers transaction rollback, but this run did not prove that a forced process termination landed inside the packaged IndexedDB commit window.",
  );
  evidence.controls.cleanStandardUserInstalledRuntime = control(
    "Unverified",
    "The elevated installer journey did not relaunch and complete the matrix under a separate clean standard-user account.",
  );
  evidence.controls.networkLossDuringSave = control(
    "Unverified",
    "The run began offline but did not remove a live network connection during an in-progress packaged save.",
  );
  evidence.controls.legacyGoldenSaveMigration = control(
    "Unverified",
    "The packaged runtime did not load every supported legacy golden save and verify idempotent migration plus backup creation.",
  );
  evidence.controls.offlineReconnectNoDuplicateEffects = control(
    "Unverified",
    "The run did not reconnect after offline advancement and compare ledgers, rewards, reports, transfers, obligations, and season effects for duplication.",
  );
  evidence.controls.permissionDeniedAndDiskFull = control(
    "Unverified",
    "No filesystem ACL or volume-capacity mutation was performed on this workstation.",
  );
  evidence.controls.suspendRebootDuringRollover = control(
    "Unverified",
    "No physical suspend or reboot was performed.",
  );
  evidence.controls.liveSteamCloudConflictAndReconnect = control(
    "Unverified",
    "Steam was deliberately unavailable; local queueing was observed but a live two-device divergence was not created.",
  );
  evidence.controls.macosPackagedRuntime = control(
    "Unverified",
    "A Windows host cannot execute or certify macOS packages.",
  );
  evidence.controls.linuxPackagedRuntime = control(
    "Unverified",
    "A Windows host cannot execute or certify Linux packages.",
  );

  const completionHead = runGit(["rev-parse", "HEAD"]);
  const completionTree = runGit(["rev-parse", "HEAD^{tree}"]);
  const completionDirtyEntries = runGit(["status", "--porcelain=v1"])
    .split(/\r?\n/)
    .filter(Boolean);
  const completionInstallerArtifact = await artifactMetadata("windows-installer", INSTALLER);
  const [
    completionSourceAppInventory,
    completionStagedAppInventory,
    completionStagedInstallerArtifact,
  ] = await Promise.all([
    directoryInventory(APP_DIR),
    directoryInventory(runtimeStaging.appDirectory),
    artifactMetadata("windows-installer-staged", testedInstaller),
  ]);
  const completionAuthenticode = {
    installer: inspectAuthenticode(testedInstaller),
    unpackedExecutable: inspectAuthenticode(testedAppExe),
  };
  const completionSignerBinding = evaluateWindowsSignerBinding({
    installerSignature: completionAuthenticode.installer,
    executableSignature: completionAuthenticode.unpackedExecutable,
    expectedSignerCertificateSha256,
  });
  const completionManifestBinding = await inspectManifestBinding(
    completionHead,
    completionInstallerArtifact,
  );
  evidence.artifactStaging.unchangedAtCompletion = inventoriesMatch(
    runtimeStaging.initialAppInventory,
    completionStagedAppInventory,
  )
    && inventoriesMatch(runtimeStaging.sourceAppInventory, completionSourceAppInventory)
    && runtimeStaging.sourceInstaller.bytes === completionInstallerArtifact.bytes
    && runtimeStaging.sourceInstaller.sha256 === completionInstallerArtifact.sha256
    && runtimeStaging.stagedInstaller.bytes === completionStagedInstallerArtifact.bytes
    && runtimeStaging.stagedInstaller.sha256 === completionStagedInstallerArtifact.sha256
    && completionSignerBinding.passed;
  evidence.completionAuthenticode = completionAuthenticode;
  evidence.completionSignerBinding = completionSignerBinding;
  evidence.sourceTreeCleanAtCompletion = completionDirtyEntries.length === 0;
  evidence.sourceAndPackageUnchangedAtCompletion = completionHead === head
    && completionTree === tree
    && completionDirtyEntries.length === 0
    && completionInstallerArtifact.sha256 === installerArtifact.sha256
    && completionInstallerArtifact.bytes === installerArtifact.bytes
    && completionManifestBinding.passed
    && completionManifestBinding.sha256 === manifestBinding.sha256
    && evidence.artifactStaging.unchangedAtCompletion;
  evidence.completionCandidateManifestBinding = publicManifestBinding(completionManifestBinding);

  if (initialOperatorAttestationValidation) {
    const finalOperatorAttestationValidation = await validateOperatorAttestation();
    if (!finalOperatorAttestationValidation.accepted) {
      throw new Error(
        `Windows runtime operator attestation became invalid during the run:\n- ${finalOperatorAttestationValidation.failures.join("\n- ")}`,
      );
    }
    if (
      finalOperatorAttestationValidation.attestationSha256
      !== initialOperatorAttestationValidation.attestationSha256
    ) {
      throw new Error("Windows runtime operator attestation changed during the harness run");
    }
    const merged = mergeWindowsRuntimeOperatorControls(
      evidence.controls,
      finalOperatorAttestationValidation,
    );
    if (merged.failures.length > 0) {
      throw new Error(
        `Windows runtime operator attestation could not be merged:\n- ${merged.failures.join("\n- ")}`,
      );
    }
    evidence.controls = merged.controls;
  }

  if (!evidence.sourceTreeClean) {
    evidence.limitations.push(
      "The source tree was dirty, so this evidence is not candidate-bound.",
    );
  }
  if (exactInstallJourney.status !== "Passed") {
    evidence.limitations.push(
      exactInstallJourney.requested
        ? "The installer + installed-app journey did not pass; this run remains supporting unpacked-runtime evidence only."
        : "The installer + installed-app journey was not requested; this run remains supporting unpacked-runtime evidence only.",
    );
  }
  evidence.limitations.push(
    "Remote debugging is used only by the verification harness; the shipped window keeps DevTools disabled.",
    "CDP network emulation plus an unreachable proxy is deterministic offline evidence, not a physical adapter-disconnect test.",
  );
  evidence.candidateBound = evidence.sourceTreeClean
    && evidence.sourceAndPackageUnchangedAtCompletion
    && manifestBinding.passed
    && signerBinding.passed
    && evidence.artifactStaging.unchangedAtCompletion
    && evidence.controls.saveBuildVersionCandidateBinding?.status === "Passed"
    && !Object.values(evidence.controls).some((entry) => entry.status === "Failed");
  const certification = evaluateWindowsRuntimeCertification({
    controls: evidence.controls,
    requiredControls,
    candidateBound: evidence.candidateBound,
  });
  evidence.result = certification.result;
  evidence.certification = {
    status: certification.certificationPassed
      ? "Passed"
      : certification.failedControls.length > 0
        ? "Failed"
        : "Incomplete",
    requiredControlCount: requiredControls.length,
    nonPassingRequiredControls: certification.nonPassingRequiredControls,
    failedControls: certification.failedControls,
  };

  const outputPath = path.resolve(evidenceDir, "supporting-runtime-evidence.json");
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (!keepProfile) await safeRemoveTransient(evidenceDir, runtimeStaging.stagingRoot);
  console.log(JSON.stringify({
    result: evidence.result,
    output: normalizeRelative(outputPath),
    controls: Object.fromEntries(
      Object.entries(evidence.controls).map(([name, entry]) => [name, entry.status]),
    ),
    nonPassingRequiredControls: certification.nonPassingRequiredControls,
  }, null, 2));

  if (strict && !certification.certificationPassed) process.exitCode = 1;
}

function isPathInsideOrSame(parentPath, childPath) {
  return path.resolve(parentPath) === path.resolve(childPath)
    || isPathInside(parentPath, childPath);
}

async function directoryInventory(rootDirectory) {
  const canonicalRoot = await realpath(rootDirectory);
  const rootDetails = await lstat(rootDirectory);
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error(`Runtime package root is not a real directory: ${rootDirectory}`);
  }
  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.resolve(directory, entry.name);
      const details = await lstat(filePath);
      if (details.isSymbolicLink()) {
        throw new Error(`Runtime package contains a symbolic link or junction: ${filePath}`);
      }
      const canonicalPath = await realpath(filePath);
      if (!isPathInsideOrSame(canonicalRoot, canonicalPath)) {
        throw new Error(`Runtime package entry resolves outside its root: ${filePath}`);
      }
      if (details.isDirectory()) {
        await walk(filePath);
      } else if (details.isFile()) {
        files.push({
          path: path.relative(rootDirectory, filePath).replaceAll(path.sep, "/"),
          bytes: details.size,
          sha256: await sha256File(filePath),
        });
      } else {
        throw new Error(`Runtime package contains an unsupported filesystem entry: ${filePath}`);
      }
    }
  }
  await walk(rootDirectory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function inventoriesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function stageRuntimeArtifacts(evidenceDir) {
  const stagingRoot = path.resolve(evidenceDir, "runtime-package-under-test");
  const stagedAppDirectory = path.resolve(stagingRoot, "win-unpacked");
  const stagedInstaller = path.resolve(stagingRoot, path.basename(INSTALLER));
  await safeRemoveTransient(evidenceDir, stagingRoot);

  const sourceAppBefore = await directoryInventory(APP_DIR);
  const sourceInstallerBefore = await artifactMetadata("windows-installer", INSTALLER);
  await mkdir(stagingRoot, { recursive: true });
  await cp(APP_DIR, stagedAppDirectory, {
    recursive: true,
    force: false,
    errorOnExist: true,
    verbatimSymlinks: true,
  });
  await cp(INSTALLER, stagedInstaller, { force: false, errorOnExist: true });
  const [sourceAppAfter, sourceInstallerAfter, stagedApp, stagedInstallerArtifact] = await Promise.all([
    directoryInventory(APP_DIR),
    artifactMetadata("windows-installer", INSTALLER),
    directoryInventory(stagedAppDirectory),
    artifactMetadata("windows-installer-staged", stagedInstaller),
  ]);
  const sourceStableDuringStage = inventoriesMatch(sourceAppBefore, sourceAppAfter)
    && sourceInstallerBefore.bytes === sourceInstallerAfter.bytes
    && sourceInstallerBefore.sha256 === sourceInstallerAfter.sha256;
  const stagedCopyExact = inventoriesMatch(sourceAppBefore, stagedApp)
    && sourceInstallerBefore.bytes === stagedInstallerArtifact.bytes
    && sourceInstallerBefore.sha256 === stagedInstallerArtifact.sha256;
  if (!sourceStableDuringStage || !stagedCopyExact) {
    throw new Error("Windows package artifacts changed or diverged while the immutable test copy was staged");
  }
  return {
    stagingRoot,
    appDirectory: stagedAppDirectory,
    appExecutable: path.resolve(stagedAppDirectory, "TalentScout.exe"),
    appAsar: path.resolve(stagedAppDirectory, "resources", "app.asar"),
    installer: stagedInstaller,
    initialAppInventory: stagedApp,
    sourceAppInventory: sourceAppBefore,
    sourceInstaller: sourceInstallerBefore,
    stagedInstaller: stagedInstallerArtifact,
    sourceStableDuringStage,
    stagedCopyExact,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
