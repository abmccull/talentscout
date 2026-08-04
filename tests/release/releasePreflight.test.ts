import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "check-release-preflight.mjs");
const tempDirs: string[] = [];
const fullSha = "a".repeat(40);
const fullTreeSha = "b".repeat(40);
const fullSha256 = "c".repeat(64);

function writeVdfFixture(cwd: string, overrides: Partial<Record<string, string>> = {}) {
  mkdirSync(join(cwd, "steamcmd"), { recursive: true });
  writeFileSync(
    join(cwd, "steamcmd", "app_build_4455570.vdf"),
    overrides.appBuild
      ?? `"appbuild"
{
  "appid"      "4455570"
  "desc"       "TalentScout build"
  "buildoutput" "../steam_build_output"
  "contentroot" ""
  "setlive"    ""

  "depots"
  {
    "4455571" "depot_build_4455571_windows.vdf"
    "4455572" "depot_build_4455572_macos.vdf"
    "4455573" "depot_build_4455573_linux.vdf"
  }
}
`,
    "utf8",
  );
  writeFileSync(
    join(cwd, "steamcmd", "depot_build_4455571_windows.vdf"),
    overrides.windowsDepot
      ?? `"DepotBuildConfig"
{
  "DepotID"    "4455571"
  "contentroot" "../dist/win-unpacked"
}
`,
    "utf8",
  );
  writeFileSync(
    join(cwd, "steamcmd", "depot_build_4455572_macos.vdf"),
    overrides.macosDepot
      ?? `"DepotBuildConfig"
{
  "DepotID"    "4455572"
  "contentroot" "../steam-stage/macos"
}
`,
    "utf8",
  );
  writeFileSync(
    join(cwd, "steamcmd", "depot_build_4455573_linux.vdf"),
    overrides.linuxDepot
      ?? `"DepotBuildConfig"
{
  "DepotID"    "4455573"
  "contentroot" "../dist/linux-unpacked"
}
`,
    "utf8",
  );
}

function fixture(version = "1.2.3", overrides: Partial<Record<string, string>> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-release-preflight-"));
  tempDirs.push(cwd);
  writeFileSync(
    join(cwd, "package.json"),
    `${JSON.stringify({ name: "talentscout-test", version }, null, 2)}\n`,
    "utf8",
  );
  writeVdfFixture(cwd, overrides);
  return cwd;
}

function baseEnv(overrides: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RELEASE_CANDIDATE_SHA: fullSha,
    RELEASE_CANDIDATE_TREE_SHA: fullTreeSha,
    RELEASE_CANDIDATE_TAG: "v1.2.3",
    RELEASE_CANDIDATE_RUN_ID: "30550945547",
  };
  delete env.CANDIDATE_SHA;
  delete env.CANDIDATE_TREE_SHA;
  delete env.CANDIDATE_TAG;
  delete env.CANDIDATE_RUN_ID;
  delete env.GITHUB_SHA;
  delete env.GITHUB_REF_NAME;
  return { ...env, ...overrides };
}

function run(
  cwd: string,
  mode: string,
  overrides: Record<string, string> = {},
) {
  const result = spawnSync(process.execPath, [script, "--mode", mode, "--json"], {
    cwd,
    env: baseEnv(overrides),
    encoding: "utf8",
  });
  return {
    ...result,
    report: JSON.parse(result.stdout || "{}") as {
      ok: boolean;
      failures: string[];
      mode: string;
      checks: Array<{ id: string; ok: boolean }>;
    },
  };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("release preflight checker", () => {
  it("passes package mode with full production credentials and redacted JSON output", () => {
    const cwd = fixture();
    const result = run(cwd, "package", {
      STEAM_SDK_WINDOWS_URL: "https://secret.example/windows",
      STEAM_SDK_WINDOWS_SHA256: fullSha256,
      STEAM_SDK_MACOS_URL: "https://secret.example/macos",
      STEAM_SDK_MACOS_SHA256: fullSha256,
      STEAM_SDK_LINUX_URL: "https://secret.example/linux",
      STEAM_SDK_LINUX_SHA256: fullSha256,
      WIN_CSC_LINK: "base64:pfx-secret",
      WIN_CSC_KEY_PASSWORD: "windows-password",
      CSC_LINK: "base64:p12-secret",
      CSC_KEY_PASSWORD: "mac-password",
      APPLE_ID: "builds@talentscout.game",
      APPLE_ID_PASSWORD: "app-password",
      APPLE_TEAM_ID: "A1B2C3D4E5",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.ok).toBe(true);
    expect(result.report.mode).toBe("package");
    expect(result.stdout).not.toContain("https://secret.example/windows");
    expect(result.stdout).not.toContain("windows-password");
    expect(result.stdout).not.toContain("app-password");
  });

  it("allows verification mode without signing credentials or SDK secrets", () => {
    const cwd = fixture();
    const result = run(cwd, "verification");

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.ok).toBe(true);
  });

  it("fails verification mode when a configured SDK URL is missing its SHA", () => {
    const cwd = fixture();
    const result = run(cwd, "verification", {
      STEAM_SDK_WINDOWS_URL: "https://example.test/windows-sdk.zip",
    });

    expect(result.status).toBe(1);
    expect(result.report.ok).toBe(false);
    expect(result.report.failures).toContain(
      "STEAM_SDK_WINDOWS_SHA256 is required when STEAM_SDK_WINDOWS_URL is set",
    );
  });

  it("fails certify mode when the candidate tag is incompatible with package.json version", () => {
    const cwd = fixture("1.2.3");
    const result = run(cwd, "certify", {
      RELEASE_CANDIDATE_TAG: "v9.9.9",
    });

    expect(result.status).toBe(1);
    expect(result.report.failures).toContain(
      "RELEASE_CANDIDATE_TAG must match package.json version 1.2.3",
    );
  });

  it("passes promote-github mode with exact candidate identifiers only", () => {
    const cwd = fixture();
    const result = run(cwd, "promote-github");

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.ok).toBe(true);
  });

  it("fails promote-steam when authentication secrets are missing or malformed", () => {
    const cwd = fixture();
    const result = run(cwd, "promote-steam", {
      STEAM_CONFIG_VDF: "%%%%",
    });

    expect(result.status).toBe(1);
    expect(result.report.failures).toContain("STEAM_USERNAME is required");
    expect(result.report.failures).toContain(
      "STEAM_CONFIG_VDF must be decodable non-empty base64",
    );
  });

  it("rejects unsafe Steam content roots and wrong depot bindings", () => {
    const cwd = fixture("1.2.3", {
      macosDepot: `"DepotBuildConfig"
{
  "DepotID"    "4455572"
  "contentroot" "../../outside"
}
`,
    });
    const result = run(cwd, "verification");

    expect(result.status).toBe(1);
    expect(result.report.failures).toContain(
      "steamcmd/depot_build_4455572_macos.vdf must use contentroot ../steam-stage/macos",
    );
  });

  it("accepts a decodable non-empty Steam config in promote-steam mode", () => {
    const cwd = fixture();
    const result = run(cwd, "promote-steam", {
      STEAM_USERNAME: "publisher-user",
      STEAM_CONFIG_VDF: Buffer.from("\"InstallConfigStore\"{}", "utf8").toString("base64"),
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.report.ok).toBe(true);
  });
});
