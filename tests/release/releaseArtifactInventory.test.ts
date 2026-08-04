import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const validator = join(process.cwd(), "scripts", "validate-release-artifacts.mjs");
const tempDirs: string[] = [];

function sha256(contents: string) {
  return createHash("sha256").update(contents).digest("hex");
}

function writeFile(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function createFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-release-artifacts-"));
  tempDirs.push(cwd);
  for (const relativePath of [
    "release-artifacts/windows-build",
    "release-artifacts/macos-build",
    "release-artifacts/linux-build",
  ]) {
    mkdirSync(join(cwd, relativePath), { recursive: true });
  }
  writeFile(
    join(cwd, "release-artifacts", "windows-build", "TalentScout-Setup-1.0.0.exe"),
    "windows-installer",
  );
  writeFile(
    join(cwd, "release-artifacts", "windows-build", "TalentScout-Setup-1.0.0.exe.blockmap"),
    "windows-blockmap",
  );
  writeFile(
    join(cwd, "release-artifacts", "macos-build", "TalentScout-1.0.0-arm64.dmg"),
    "macos-dmg",
  );
  writeFile(
    join(cwd, "release-artifacts", "macos-build", "TalentScout-1.0.0-arm64.dmg.blockmap"),
    "macos-dmg-blockmap",
  );
  writeFile(
    join(cwd, "release-artifacts", "macos-build", "TalentScout-1.0.0-arm64.zip"),
    "macos-zip",
  );
  writeFile(
    join(cwd, "release-artifacts", "linux-build", "TalentScout-1.0.0-x86_64.AppImage"),
    "linux-appimage",
  );
  writeFile(
    join(cwd, "release-artifacts", "linux-build", "TalentScout-1.0.0-amd64.deb"),
    "linux-deb",
  );
  return cwd;
}

function runValidator(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("release artifact inventory validator", () => {
  it("writes a deterministic inventory and promotion list for the exact package set", () => {
    const cwd = createFixture();
    const firstRun = runValidator(cwd);
    expect(firstRun.status, firstRun.stderr).toBe(0);

    const inventoryPath = join(cwd, "artifacts", "release", "release-artifact-inventory.json");
    const promotionPath = join(cwd, "artifacts", "release", "release-promotion-files.txt");
    const firstInventory = readFileSync(inventoryPath, "utf8");
    const firstPromotion = readFileSync(promotionPath, "utf8");

    expect(JSON.parse(firstInventory)).toEqual({
      schemaVersion: 1,
      releaseDirectory: "release-artifacts",
      artifacts: [
        {
          kind: "windows-installer",
          path: "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe",
          bytes: 17,
          sha256: sha256("windows-installer"),
          blockmapPath: "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe.blockmap",
          blockmapBytes: 16,
          blockmapSha256: sha256("windows-blockmap"),
        },
        {
          kind: "macos-dmg",
          path: "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg",
          bytes: 9,
          sha256: sha256("macos-dmg"),
          blockmapPath: "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg.blockmap",
          blockmapBytes: 18,
          blockmapSha256: sha256("macos-dmg-blockmap"),
        },
        {
          kind: "macos-zip",
          path: "release-artifacts/macos-build/TalentScout-1.0.0-arm64.zip",
          bytes: 9,
          sha256: sha256("macos-zip"),
        },
        {
          kind: "linux-appimage",
          path: "release-artifacts/linux-build/TalentScout-1.0.0-x86_64.AppImage",
          bytes: 14,
          sha256: sha256("linux-appimage"),
        },
        {
          kind: "linux-deb",
          path: "release-artifacts/linux-build/TalentScout-1.0.0-amd64.deb",
          bytes: 9,
          sha256: sha256("linux-deb"),
        },
      ],
      promotionFiles: [
        "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe",
        "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe.blockmap",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg.blockmap",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.zip",
        "release-artifacts/linux-build/TalentScout-1.0.0-x86_64.AppImage",
        "release-artifacts/linux-build/TalentScout-1.0.0-amd64.deb",
      ],
    });
    expect(firstPromotion).toBe(
      [
        "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe",
        "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe.blockmap",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.dmg.blockmap",
        "release-artifacts/macos-build/TalentScout-1.0.0-arm64.zip",
        "release-artifacts/linux-build/TalentScout-1.0.0-x86_64.AppImage",
        "release-artifacts/linux-build/TalentScout-1.0.0-amd64.deb",
        "",
      ].join("\n"),
    );

    const secondRun = runValidator(cwd);
    expect(secondRun.status, secondRun.stderr).toBe(0);
    expect(readFileSync(inventoryPath, "utf8")).toBe(firstInventory);
    expect(readFileSync(promotionPath, "utf8")).toBe(firstPromotion);
  });

  it("fails closed on duplicate distributable kinds", () => {
    const cwd = createFixture();
    writeFile(
      join(cwd, "release-artifacts", "macos-build", "TalentScout-1.0.0-universal.zip"),
      "duplicate-macos-zip",
    );

    const result = runValidator(cwd);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Duplicate distributable kind macos-zip");
  });

  it("rejects orphan blockmaps and unexpected files", () => {
    const cwd = createFixture();
    writeFile(
      join(cwd, "release-artifacts", "linux-build", "ghost.deb.blockmap"),
      "orphan-blockmap",
    );

    const orphanResult = runValidator(cwd);
    expect(orphanResult.status).not.toBe(0);
    expect(orphanResult.stderr).toContain("Blockmap sidecar has no matching distributable");

    unlinkSync(join(cwd, "release-artifacts", "linux-build", "ghost.deb.blockmap"));
    writeFile(join(cwd, "release-artifacts", "linux-build", "notes.txt"), "unexpected");

    const strayFileResult = runValidator(cwd);
    expect(strayFileResult.status).not.toBe(0);
    expect(strayFileResult.stderr).toContain("Unexpected release artifact file");
  });

  it("rejects nested directories in artifact folders", () => {
    const cwd = createFixture();
    mkdirSync(join(cwd, "release-artifacts", "linux-build", "nested"), { recursive: true });

    const result = runValidator(cwd);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Nested directories are not allowed in release artifacts");
  });

  it("rejects symlinked distributables", () => {
    const cwd = createFixture();
    const symlinkPath = join(
      cwd,
      "release-artifacts",
      "windows-build",
      "TalentScout-Setup-1.0.0.exe",
    );
    const targetPath = join(cwd, "real-installer.exe");
    writeFile(targetPath, "real-windows-installer");
    unlinkSync(symlinkPath);
    symlinkSync(targetPath, symlinkPath, "file");

    const result = runValidator(cwd);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Symlinks are not allowed in release artifacts");
  });

  it("rejects repo-escaping output paths", () => {
    const cwd = createFixture();
    const result = runValidator(cwd, ["--out=../outside.json"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Inventory output path escapes the repository root");
  });
});
