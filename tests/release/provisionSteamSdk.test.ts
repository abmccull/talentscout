import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "provision-steam-sdk.mjs");
const packagePreflight = join(process.cwd(), "scripts", "prepare-electron-package.mjs");
const tempDirs: string[] = [];

function runProvision(
  required: boolean,
  overrides: Record<string, string> = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-steam-sdk-"));
  tempDirs.push(cwd);
  const env = { ...process.env };
  delete env.STEAM_SDK_WINDOWS_URL;
  delete env.STEAM_SDK_DOWNLOAD_TOKEN;
  delete env.STEAM_SDK_WINDOWS_SHA256;
  env.REQUIRE_STEAM_SDK = String(required);
  Object.assign(env, overrides);

  return {
    cwd,
    result: spawnSync(process.execPath, [script, "windows"], {
      cwd,
      env,
      encoding: "utf8",
    }),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Steam SDK provisioning", () => {
  it("prepares the deterministic app id in a fresh package workspace without claiming an SDK", () => {
    const cwd = mkdtempSync(join(tmpdir(), "talentscout-electron-package-"));
    tempDirs.push(cwd);
    const result = spawnSync(process.execPath, [packagePreflight], {
      cwd,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, "steam_appid.txt"), "utf8")).toBe("4455570\n");
    expect(result.stdout).toContain("does not claim they are available");
  });

  it("creates the app id and labels an optional non-Steam build", () => {
    const { cwd, result } = runProvision(false);

    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, "steam_appid.txt"), "utf8")).toBe("4455570\n");
    expect(result.stderr).toContain("non-Steam verification build");
  });

  it("fails closed when a tagged build has no licensed binary", () => {
    const { cwd, result } = runProvision(true);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(cwd, "steam_api64.dll"))).toBe(false);
    expect(result.stderr).toContain("steam_api64.dll is not provisioned");
  });

  it("refuses insecure SDK download endpoints", () => {
    const { result } = runProvision(false, {
      STEAM_SDK_WINDOWS_URL: "http://example.test/steam_api64.dll",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("STEAM_SDK_WINDOWS_URL must use HTTPS");
  });
});
