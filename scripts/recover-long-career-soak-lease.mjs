import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const lockTarget = resolve("artifacts/release/generated/long-career-soak-orchestrator");
const lockPath = `${lockTarget}.lock`;
const ownerPath = `${lockTarget}.owner.json`;
const claimSuffix = `recovery-${process.pid}-${randomUUID()}`;
const claimedLockPath = `${lockPath}.${claimSuffix}`;
const claimedOwnerPath = `${ownerPath}.${claimSuffix}`;

function normalize(value) {
  return String(value ?? "").replaceAll("\\", "/").toLowerCase();
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    // Permission errors and unknown platform responses fail closed.
    return true;
  }
}

function listNodeProcesses() {
  if (process.platform === "win32") {
    const command = [
      "$items = @(Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | ForEach-Object {",
      "  [pscustomobject]@{ pid = [int]$_.ProcessId; commandLine = [string]$_.CommandLine }",
      "})",
      "$items | ConvertTo-Json -Compress",
    ].join("\n");
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
      pid: Number(entry.pid),
      commandLine: String(entry.commandLine ?? ""),
    }));
  }

  const raw = execFileSync("ps", ["-ww", "-eo", "pid=,args="], { encoding: "utf8" });
  return raw.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), commandLine: match[2] }] : [];
  });
}

function activeSoakProcesses() {
  const repository = normalize(process.cwd());
  return listNodeProcesses().filter((entry) => {
    if (entry.pid === process.pid) return false;
    const command = normalize(entry.commandLine);
    return command.includes("run-long-career-release-soak.mjs")
      || command.includes("vitest.release-soak.config.ts")
      || (
        command.includes(repository)
        && (
          command.includes("/node_modules/vitest/")
          || command.includes("/node_modules/tinypool/")
        )
      );
  });
}

function assertNoActiveSoakProcesses(stage) {
  const active = activeSoakProcesses();
  if (active.length === 0) return;
  const summary = active
    .map((entry) => `${entry.pid}:${entry.commandLine.slice(0, 180)}`)
    .join(" | ");
  throw new Error(`Refusing lease recovery during ${stage}; active soak processes: ${summary}`);
}

async function readOwner() {
  try {
    return JSON.parse(await readFile(ownerPath, "utf8"));
  } catch {
    return null;
  }
}

try {
  await stat(lockPath);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.info("LONG_CAREER_SOAK_LEASE_RECOVERY no-lock");
    process.exit(0);
  }
  throw error;
}

const owner = await readOwner();
if (owner && isPidAlive(Number(owner.pid))) {
  throw new Error(
    `Refusing lease recovery because recorded orchestrator PID ${owner.pid} is still alive`,
  );
}

assertNoActiveSoakProcesses("initial verification");

let ownerClaimed = false;
try {
  await rename(ownerPath, claimedOwnerPath);
  ownerClaimed = true;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

try {
  // The canonical lock still blocks new owners while this second scan closes
  // the process-discovery race. The final rename is the atomic recovery act.
  assertNoActiveSoakProcesses("final verification");
  let lockClaimed = false;
  try {
    await rename(lockPath, claimedLockPath);
    lockClaimed = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.info("LONG_CAREER_SOAK_LEASE_RECOVERY already-recovered");
  }

  if (lockClaimed) {
    await rm(claimedLockPath, { recursive: true, force: true });
    console.info(`LONG_CAREER_SOAK_LEASE_RECOVERY recovered lease=${owner?.leaseId ?? "unknown"}`);
  }
} finally {
  if (ownerClaimed) await rm(claimedOwnerPath, { force: true });
}
