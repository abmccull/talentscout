import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const validator = join(process.cwd(), "scripts", "validate-steam-store-assets.mjs");
const tempDirs: string[] = [];
const TEST_TIMEOUT_MS = 20_000;

const manifest = {
  schemaVersion: 1,
  storeCopyPath: "STEAM_STORE_COPY.md",
  assets: {
    headerCapsule: { path: "public/images/steam/steam-header-capsule.png" },
    smallCapsule: { path: "public/images/steam/steam-small-capsule.png" },
    mainCapsule: { path: "public/images/steam/steam-main-capsule.png" },
    heroGraphic: { path: "public/images/steam/steam-store-hero-v2.png" },
    pageBackground: { path: "public/images/steam/steam-page-background.png" },
    libraryCapsule: { path: "public/images/steam/steam-library-capsule-v2.png" },
    libraryHero: { path: "public/images/steam/steam-library-hero.png" },
    transparentLogo: { path: "public/images/steam/steam-logo-transparent.png" },
  },
  screenshots: [
    { slot: 1, path: "public/images/steam/screenshots/01-dashboard.png" },
    { slot: 2, path: "public/images/steam/screenshots/02-observation.png" },
    { slot: 3, path: "public/images/steam/screenshots/03-report-writer.png" },
    { slot: 4, path: "public/images/steam/screenshots/04-player-database.png" },
    { slot: 5, path: "public/images/steam/screenshots/05-world-map.png" },
    { slot: 6, path: "public/images/steam/screenshots/06-scenarios.png" },
    { slot: 7, path: "public/images/steam/screenshots/07-career-progression.png" },
    { slot: 8, path: "public/images/steam/screenshots/08-calendar.png" },
  ],
};

const provenance = {
  schemaVersion: 1,
  status: "owner-attested-approved",
  lastReviewed: "2026-08-04",
  reviewInstructions: "Fixture provenance",
  assetGroups: [
    {
      id: "steam-store-assets",
      paths: ["public/images/steam/*.png", "public/images/steam/screenshots/*.png"],
      source: "fixture",
      generator: "fixture",
      rightsStatus: "approved",
      evidence: ["docs/release/asset-rights-attestation.md"],
      notes: [],
    },
  ],
};

const validCopy = `# TalentScout

## Short Description

TalentScout puts you in the stands with a notebook. Watch football, judge talent, and build a scouting reputation before the rest of the world catches up.

## About This Game

TalentScout is a scouting-first football simulation about observation, conviction, and reputation.

## Key Features

- Observe live matches and file reports.
- Build a career across multiple scouting paths.

## Tags

Sports, Simulation, Strategy, Singleplayer
`;

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPngBuffer(
  width: number,
  height: number,
  options: { colorType?: 2 | 6; transparentPixel?: boolean } = {},
) {
  const colorType = options.colorType ?? 2;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(colorType, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rowLength = width * bytesPerPixel + 1;
  const raw = Buffer.alloc(rowLength * height, 0);
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * rowLength;
    raw[rowStart] = 0;
    const pixelsStart = rowStart + 1;
    if (colorType === 6) {
      for (let offset = pixelsStart; offset < rowStart + rowLength; offset += 4) {
        raw[offset] = 255;
        raw[offset + 1] = 255;
        raw[offset + 2] = 255;
        raw[offset + 3] = 255;
      }
    }
  }
  if (colorType === 6 && options.transparentPixel) {
    raw[1 + 3] = 0;
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(
  cwd: string,
  relativePath: string,
  width: number,
  height: number,
  options: { colorType?: 2 | 6; transparentPixel?: boolean } = {},
) {
  const path = join(cwd, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, createPngBuffer(width, height, options));
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-steam-assets-"));
  tempDirs.push(cwd);
  mkdirSync(join(cwd, "docs"), { recursive: true });
  mkdirSync(join(cwd, "public", "images", "steam"), { recursive: true });
  mkdirSync(join(cwd, "docs", "release"), { recursive: true });
  writeFileSync(
    join(cwd, "docs", "release", "asset-rights-attestation.md"),
    "Fixture provenance evidence\n",
    "utf8",
  );
  writeJson(join(cwd, "docs", "steam-store-assets.json"), manifest);
  writeJson(join(cwd, "docs", "asset-provenance.json"), provenance);
  writeFileSync(join(cwd, "STEAM_STORE_COPY.md"), validCopy, "utf8");

  writePng(cwd, manifest.assets.headerCapsule.path, 460, 215);
  writePng(cwd, manifest.assets.smallCapsule.path, 231, 87);
  writePng(cwd, manifest.assets.mainCapsule.path, 616, 353);
  writePng(cwd, manifest.assets.heroGraphic.path, 3840, 1240);
  writePng(cwd, manifest.assets.pageBackground.path, 1438, 810);
  writePng(cwd, manifest.assets.libraryCapsule.path, 600, 900);
  writePng(cwd, manifest.assets.libraryHero.path, 3840, 1240);
  writePng(cwd, manifest.assets.transparentLogo.path, 1280, 720, {
    colorType: 6,
    transparentPixel: true,
  });
  for (const screenshot of manifest.screenshots) {
    writePng(cwd, screenshot.path, 1920, 1080);
  }
  return cwd;
}

function runValidator(cwd: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [validator, ...args], {
    cwd,
    encoding: "utf8",
  });
  const report = JSON.parse(
    readFileSync(join(cwd, "artifacts", "release", "steam-store-assets-report.json"), "utf8"),
  );
  return { result, report };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("steam store asset validator", () => {
  it("passes strict certification for a fully compliant manifest", () => {
    const cwd = fixture();
    const { result, report } = runValidator(cwd);

    expect(result.status).toBe(0);
    expect(report.status).toBe("Passed");
    expect(report.summary.presentScreenshotCount).toBe(8);
    expect(report.copy).toMatchObject({
      status: "Passed",
      shortDescriptionLength: expect.any(Number),
      sections: {
        about: true,
        features: true,
        tags: true,
      },
    });
    expect(report.assets.find((asset: { id: string }) => asset.id === "transparentLogo")).toMatchObject({
      status: "Passed",
      png: {
        width: 1280,
        height: 720,
        colorType: 6,
      },
    });
  }, TEST_TIMEOUT_MS);

  it("keeps report-only non-blocking while surfacing logo and copy failures", () => {
    const cwd = fixture();
    writePng(cwd, manifest.assets.transparentLogo.path, 1280, 720, { colorType: 2 });
    writeFileSync(
      join(cwd, "STEAM_STORE_COPY.md"),
      `## Short Description\n\n${"x".repeat(301)}\n\n## About This Game\n\nStill about scouting.\n\n## Key Features\n\n- One bullet.\n`,
      "utf8",
    );

    const reported = runValidator(cwd, ["--report-only"]);
    expect(reported.result.status).toBe(0);
    expect(reported.report.status).toBe("Failed");
    expect(reported.report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("transparent logo must use PNG color type 6"),
      expect.stringContaining("short description is 301 characters"),
      expect.stringContaining("store copy is missing a Tags section"),
    ]));

    const strict = runValidator(cwd);
    expect(strict.result.status).toBe(1);
    expect(strict.report.status).toBe("Failed");
  }, TEST_TIMEOUT_MS);

  it("rejects asset paths that escape provenance coverage or reuse another slot", () => {
    const cwd = fixture();
    const mutatedManifest = structuredClone(manifest);
    mutatedManifest.assets.headerCapsule.path = "public/images/marketing/steam-header-capsule.png";
    mutatedManifest.assets.smallCapsule.path = mutatedManifest.assets.mainCapsule.path;
    writeJson(join(cwd, "docs", "steam-store-assets.json"), mutatedManifest);
    writePng(cwd, mutatedManifest.assets.headerCapsule.path, 460, 215);

    const { result, report } = runValidator(cwd, ["--report-only"]);
    expect(result.status).toBe(0);
    expect(report.status).toBe("Failed");
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("headerCapsule: asset path is not covered by docs/asset-provenance.json"),
      expect.stringContaining("reuses public/images/steam/steam-main-capsule.png"),
    ]));
  }, TEST_TIMEOUT_MS);
});
