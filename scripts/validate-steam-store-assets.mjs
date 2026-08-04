#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(process.cwd());
const manifestPath = resolve(
  root,
  process.env.STEAM_STORE_ASSET_MANIFEST ?? "docs/steam-store-assets.json",
);
const provenancePath = resolve(root, "docs/asset-provenance.json");
const outputPath = resolve(
  root,
  process.env.STEAM_STORE_ASSET_REPORT_OUTPUT
    ?? "artifacts/release/steam-store-assets-report.json",
);

const assetRequirements = {
  headerCapsule: { width: 460, height: 215, required: true },
  smallCapsule: { width: 231, height: 87, required: true },
  mainCapsule: { width: 616, height: 353, required: true },
  heroGraphic: { width: 3840, height: 1240, required: true },
  pageBackground: { width: 1438, height: 810, required: false },
  libraryCapsule: { width: 600, height: 900, required: true },
  libraryHero: { width: 3840, height: 1240, required: true },
  transparentLogo: { width: 1280, height: 720, required: true, requireAlpha: true },
};

const screenshotFileNames = [
  "01-dashboard.png",
  "02-observation.png",
  "03-report-writer.png",
  "04-prospects.png",
  "05-world-map.png",
  "06-rivals.png",
  "07-career-progression.png",
  "08-calendar.png",
];

const requiredYouthEarlyAccessPhrases = [
  "freelance youth scout",
  "first team scout",
  "regional expert",
  "data scout",
  "not part of this early access release",
];

const forbiddenFullGameClaims = [
  "four scouting careers",
  "four specialization paths",
  "10+ challenge scenarios",
  "you can play hundreds of hours right now",
];

function normalizePath(value) {
  return value.split(sep).join("/");
}

function relativePath(path) {
  return normalizePath(relative(root, path));
}

function isPathInsideRoot(path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== ""
    && fromRoot !== ".."
    && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot)
  );
}

function escapeRegExpCharacter(character) {
  return /[|\\{}()[\]^$+?.]/.test(character) ? `\\${character}` : character;
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExpCharacter(character);
    }
  }
  return new RegExp(`${source}$`, "i");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalizeHeading(heading) {
  return heading
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[():-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFrontMatter(markdown) {
  return markdown.startsWith("---\n")
    ? markdown.replace(/^---\n[\s\S]*?\n---\n/, "")
    : markdown;
}

function parseMarkdownSections(markdown) {
  const source = stripFrontMatter(markdown);
  const matches = [...source.matchAll(/^##\s+(.+?)\s*$/gm)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = normalizeHeading(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? source.length : source.length;
    sections.set(heading, source.slice(start, end).trim());
  }
  return sections;
}

function findSectionContent(sections, patterns) {
  for (const [heading, content] of sections.entries()) {
    if (patterns.some((pattern) => pattern.test(heading))) {
      return content;
    }
  }
  return null;
}

function extractShortDescription(content) {
  const fencedBlock = /```(?:\w+)?\s*([\s\S]*?)```/m.exec(content);
  if (fencedBlock) {
    return fencedBlock[1].replace(/\s+/g, " ").trim();
  }
  const paragraphs = content
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((entry) => !/^[(>*`]/.test(entry));
  return paragraphs[0] ?? "";
}

function createAssetResult(id, path, requirement, expectedName = null, expectedSha256 = null) {
  return {
    id,
    path,
    expectedName,
    required: requirement.required,
    expectedDimensions: {
      width: requirement.width,
      height: requirement.height,
    },
    exists: false,
    provenanceCovered: false,
    status: "Unverified",
    failures: [],
    expectedSha256,
    sha256: null,
    png: null,
  };
}

function parsePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("file is not a PNG");
  }

  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlaceMethod = null;
  const idat = [];
  let hasTransparencyChunk = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`PNG chunk ${type} exceeds file length`);
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlaceMethod = data.readUInt8(12);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "tRNS") {
      hasTransparencyChunk = true;
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || !Number.isInteger(bitDepth)
    || !Number.isInteger(colorType)
  ) {
    throw new Error("PNG is missing an IHDR chunk");
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlaceMethod,
    hasTransparencyChunk,
    compressedImageData: Buffer.concat(idat),
  };
}

function bytesPerPixel(colorType, bitDepth) {
  if (bitDepth !== 8) return null;
  if (colorType === 2) return 3;
  if (colorType === 6) return 4;
  return null;
}

function paethPredictor(left, up, upperLeft) {
  const predictor = left + up - upperLeft;
  const leftDistance = Math.abs(predictor - left);
  const upDistance = Math.abs(predictor - up);
  const upperLeftDistance = Math.abs(predictor - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function pngHasVisibleAlpha(png) {
  if (png.colorType !== 6) return false;
  const perPixel = bytesPerPixel(png.colorType, png.bitDepth);
  if (perPixel === null) {
    throw new Error("transparent logo must use an 8-bit RGBA PNG");
  }
  if (png.interlaceMethod !== 0) {
    throw new Error("transparent logo must use non-interlaced PNG encoding");
  }
  const rowLength = png.width * perPixel;
  const inflated = inflateSync(png.compressedImageData);
  if (inflated.length !== (rowLength + 1) * png.height) {
    throw new Error("inflated PNG data does not match the declared image dimensions");
  }

  let offset = 0;
  let previousRow = Buffer.alloc(rowLength, 0);
  const currentRow = Buffer.alloc(rowLength, 0);
  for (let rowIndex = 0; rowIndex < png.height; rowIndex += 1) {
    const filterType = inflated.readUInt8(offset);
    offset += 1;
    const encodedRow = inflated.subarray(offset, offset + rowLength);
    offset += rowLength;
    for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
      const raw = encodedRow[columnIndex];
      const left = columnIndex >= perPixel ? currentRow[columnIndex - perPixel] : 0;
      const up = previousRow[columnIndex];
      const upperLeft = columnIndex >= perPixel ? previousRow[columnIndex - perPixel] : 0;
      let value = raw;
      if (filterType === 1) value = (raw + left) & 0xff;
      else if (filterType === 2) value = (raw + up) & 0xff;
      else if (filterType === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (raw + paethPredictor(left, up, upperLeft)) & 0xff;
      else if (filterType !== 0) {
        throw new Error(`unsupported PNG filter type ${String(filterType)}`);
      }
      currentRow[columnIndex] = value;
    }
    for (let alphaIndex = 3; alphaIndex < currentRow.length; alphaIndex += perPixel) {
      if (currentRow[alphaIndex] < 255) return true;
    }
    previousRow = Buffer.from(currentRow);
  }
  return false;
}

function validateCopyDocument(path, markdown) {
  const result = {
    path,
    status: "Passed",
    shortDescriptionLength: null,
    sections: {
      about: false,
      features: false,
      tags: false,
    },
    releaseScope: {
      requiredPhrasesPresent: [],
      forbiddenClaimsPresent: [],
    },
    failures: [],
  };
  const sections = parseMarkdownSections(markdown);
  const shortDescriptionContent = findSectionContent(sections, [/^short description\b/]);
  const aboutContent = findSectionContent(sections, [/^about this game$/, /^long description\b/]);
  const featuresContent = findSectionContent(sections, [/^key features$/, /^feature list\b/]);
  const tagsContent = findSectionContent(sections, [/^tags$/, /^steam tags$/]);

  const shortDescription = shortDescriptionContent
    ? extractShortDescription(shortDescriptionContent)
    : "";
  result.shortDescriptionLength = shortDescription.length;
  result.sections.about = Boolean(aboutContent?.trim());
  result.sections.features = Boolean(featuresContent?.trim());
  result.sections.tags = Boolean(tagsContent?.trim());

  if (!shortDescription) {
    result.failures.push("store copy is missing a short description");
  } else if (shortDescription.length > 300) {
    result.failures.push(`short description is ${String(shortDescription.length)} characters; limit is 300`);
  }
  if (!result.sections.about) result.failures.push("store copy is missing an About section");
  if (!result.sections.features) result.failures.push("store copy is missing a Features section");
  if (!result.sections.tags) result.failures.push("store copy is missing a Tags section");

  const normalizedCopy = markdown.toLowerCase().replace(/\s+/g, " ");
  result.releaseScope.requiredPhrasesPresent = requiredYouthEarlyAccessPhrases.filter((phrase) =>
    normalizedCopy.includes(phrase)
  );
  result.releaseScope.forbiddenClaimsPresent = forbiddenFullGameClaims.filter((phrase) =>
    normalizedCopy.includes(phrase)
  );
  for (const phrase of requiredYouthEarlyAccessPhrases) {
    if (!normalizedCopy.includes(phrase)) {
      result.failures.push(`Youth Early Access store copy must include scope phrase: ${phrase}`);
    }
  }
  for (const claim of result.releaseScope.forbiddenClaimsPresent) {
    result.failures.push(`Youth Early Access store copy contains a forbidden full-game claim: ${claim}`);
  }
  if (result.failures.length > 0) result.status = "Failed";
  return result;
}

function validateManifestPath(configuredPath, label) {
  const failures = [];
  if (typeof configuredPath !== "string" || !configuredPath.trim()) {
    failures.push(`${label} path is missing`);
    return { path: "", normalizedPath: "", absolutePath: root, failures };
  }
  if (isAbsolute(configuredPath)) {
    failures.push(`${label} path must be repository-relative`);
  }
  const absolutePath = resolve(root, configuredPath);
  if (!isPathInsideRoot(absolutePath)) {
    failures.push(`${label} path escapes the repository root`);
  }
  const normalizedPath = relativePath(absolutePath);
  if (!normalizedPath.toLowerCase().endsWith(".png")) {
    failures.push(`${label} path must point to a PNG file`);
  }
  return {
    path: configuredPath,
    normalizedPath,
    absolutePath,
    failures,
  };
}

function appendFailures(reportFailures, scopedFailures) {
  reportFailures.push(...scopedFailures);
}

export async function validateSteamStoreAssets(options = {}) {
  const reportOnly = options.reportOnly === true;
  const failures = [];
  const assetResults = [];
  const screenshotResults = [];
  let manifest = null;
  let provenance = null;
  let copyResult = {
    path: null,
    status: "Failed",
    shortDescriptionLength: null,
    sections: {
      about: false,
      features: false,
      tags: false,
    },
    releaseScope: {
      requiredPhrasesPresent: [],
      forbiddenClaimsPresent: [],
    },
    failures: ["store copy path is unavailable because the manifest could not be read"],
  };

  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    failures.push(
      `steam store asset manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    provenance = await readJson(provenancePath);
  } catch (error) {
    failures.push(
      `asset provenance manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const provenanceMatchers = Array.isArray(provenance?.assetGroups)
    ? provenance.assetGroups.flatMap((group) =>
      Array.isArray(group?.paths)
        ? group.paths
          .filter((path) => typeof path === "string" && path.trim())
          .map((path) => globToRegExp(path))
        : [])
    : [];

  if (manifest) {
    if (manifest.schemaVersion !== 1) {
      failures.push(`steam store asset manifest has unsupported schemaVersion ${String(manifest.schemaVersion)}`);
    }

    const copyPath = typeof manifest.storeCopyPath === "string" ? manifest.storeCopyPath.trim() : "";
    if (!copyPath) {
      failures.push("storeCopyPath is missing from the steam store asset manifest");
      copyResult = {
        ...copyResult,
        failures: ["storeCopyPath is missing from the steam store asset manifest"],
      };
    } else if (isAbsolute(copyPath)) {
      failures.push("storeCopyPath must be repository-relative");
      copyResult = {
        ...copyResult,
        path: copyPath,
        failures: ["storeCopyPath must be repository-relative"],
      };
    } else {
      const absoluteCopyPath = resolve(root, copyPath);
      if (!isPathInsideRoot(absoluteCopyPath)) {
        failures.push("storeCopyPath escapes the repository root");
        copyResult = {
          ...copyResult,
          path: copyPath,
          failures: ["storeCopyPath escapes the repository root"],
        };
      } else {
        try {
          const markdown = await readFile(absoluteCopyPath, "utf8");
          copyResult = validateCopyDocument(relativePath(absoluteCopyPath), markdown);
          appendFailures(failures, copyResult.failures.map((failure) => `store copy: ${failure}`));
        } catch (error) {
          failures.push(
            `store copy cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          );
          copyResult = {
            ...copyResult,
            path: relativePath(absoluteCopyPath),
            failures: [
              `store copy cannot be read: ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      }
    }

    const manifestAssets = manifest.assets && typeof manifest.assets === "object"
      ? manifest.assets
      : null;
    if (!manifestAssets) {
      failures.push("steam store asset manifest is missing its assets map");
    }
    const manifestAssetKeys = manifestAssets ? Object.keys(manifestAssets) : [];
    for (const assetId of manifestAssetKeys) {
      if (!(assetId in assetRequirements)) {
        failures.push(`steam store asset manifest contains an unknown asset id ${assetId}`);
      }
    }

    const pathOwners = new Map();
    const registerPath = (normalizedPath, ownerLabel) => {
      if (!normalizedPath) return;
      const previousOwner = pathOwners.get(normalizedPath);
      if (previousOwner) {
        failures.push(`${ownerLabel} reuses ${normalizedPath}, already claimed by ${previousOwner}`);
      } else {
        pathOwners.set(normalizedPath, ownerLabel);
      }
    };

    for (const [assetId, requirement] of Object.entries(assetRequirements)) {
      const configured = manifestAssets?.[assetId];
      const configuredPath = typeof configured?.path === "string" ? configured.path.trim() : "";
      const configuredSha256 = typeof configured?.sha256 === "string"
        ? configured.sha256.trim().toLowerCase()
        : "";
      const result = createAssetResult(assetId, configuredPath, requirement, null, configuredSha256);
      assetResults.push(result);

      if (!configuredPath) {
        result.status = requirement.required ? "Failed" : "MissingOptional";
        result.failures.push("asset path is missing from the manifest");
        if (requirement.required) failures.push(`${assetId}: asset path is missing from the manifest`);
        continue;
      }

      const validatedPath = validateManifestPath(configuredPath, assetId);
      result.path = validatedPath.normalizedPath || configuredPath;
      result.failures.push(...validatedPath.failures);
      if (validatedPath.failures.length > 0) {
        result.status = "Failed";
        appendFailures(failures, validatedPath.failures.map((failure) => `${assetId}: ${failure}`));
        continue;
      }

      registerPath(validatedPath.normalizedPath, assetId);
      if (!/^[0-9a-f]{64}$/.test(configuredSha256)) {
        result.failures.push("asset manifest must declare a lowercase SHA-256 hash");
      }
      result.provenanceCovered = provenanceMatchers.some((matcher) => matcher.test(validatedPath.normalizedPath));
      if (!result.provenanceCovered) {
        result.failures.push("asset path is not covered by docs/asset-provenance.json");
      }

      try {
        const buffer = await readFile(validatedPath.absolutePath);
        result.exists = true;
        result.sha256 = createHash("sha256").update(buffer).digest("hex");
        if (/^[0-9a-f]{64}$/.test(configuredSha256) && result.sha256 !== configuredSha256) {
          result.failures.push(`asset SHA-256 is ${result.sha256}; expected ${configuredSha256}`);
        }
        const png = parsePng(buffer);
        result.png = {
          width: png.width,
          height: png.height,
          bitDepth: png.bitDepth,
          colorType: png.colorType,
          hasTransparencyChunk: png.hasTransparencyChunk,
        };
        if (png.width !== requirement.width || png.height !== requirement.height) {
          result.failures.push(
            `image dimensions are ${String(png.width)}x${String(png.height)}; expected ${String(requirement.width)}x${String(requirement.height)}`,
          );
        }
        if (requirement.requireAlpha) {
          if (png.colorType !== 6) {
            result.failures.push(`transparent logo must use PNG color type 6 (RGBA); found ${String(png.colorType)}`);
          } else if (!pngHasVisibleAlpha(png)) {
            result.failures.push("transparent logo does not contain any transparent pixels");
          }
        }
      } catch (error) {
        if (error?.code === "ENOENT") {
          result.status = requirement.required ? "Failed" : "MissingOptional";
          result.failures.push("asset file is missing");
        } else {
          result.failures.push(
            `asset file could not be validated: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (result.failures.length === 0) {
        result.status = "Passed";
      } else if (result.status === "Unverified") {
        result.status = "Failed";
      }
      if (result.status === "Failed") {
        appendFailures(failures, result.failures.map((failure) => `${assetId}: ${failure}`));
      }
    }

    if (!Array.isArray(manifest.screenshots)) {
      failures.push("steam store asset manifest must declare a screenshots array");
    } else if (manifest.screenshots.length !== screenshotFileNames.length) {
      failures.push(`steam store asset manifest must declare exactly ${String(screenshotFileNames.length)} screenshots`);
    }

    const screenshotEntries = Array.isArray(manifest?.screenshots) ? manifest.screenshots : [];
    const slotMap = new Map();
    for (const entry of screenshotEntries) {
      const slot = Number(entry?.slot);
      if (slotMap.has(slot)) failures.push(`screenshot slot ${String(slot)} is duplicated in the manifest`);
      else slotMap.set(slot, entry);
    }

    for (let index = 0; index < screenshotFileNames.length; index += 1) {
      const slot = index + 1;
      const expectedName = screenshotFileNames[index];
      const entry = slotMap.get(slot);
      const result = createAssetResult(
        `screenshot${String(slot).padStart(2, "0")}`,
        typeof entry?.path === "string" ? entry.path.trim() : "",
        { width: 1920, height: 1080, required: true },
        expectedName,
        typeof entry?.sha256 === "string" ? entry.sha256.trim().toLowerCase() : "",
      );
      screenshotResults.push(result);

      if (!entry) {
        result.status = "Failed";
        result.failures.push("screenshot slot is missing from the manifest");
        failures.push(`screenshot ${String(slot)}: screenshot slot is missing from the manifest`);
        continue;
      }

      const validatedPath = validateManifestPath(result.path, `screenshot ${String(slot)}`);
      result.path = validatedPath.normalizedPath || result.path;
      result.failures.push(...validatedPath.failures);
      if (validatedPath.failures.length > 0) {
        result.status = "Failed";
        appendFailures(
          failures,
          validatedPath.failures.map((failure) => `screenshot ${String(slot)}: ${failure}`),
        );
        continue;
      }

      if (basename(validatedPath.normalizedPath) !== expectedName) {
        result.failures.push(`screenshot filename must be ${expectedName}`);
      }

      registerPath(validatedPath.normalizedPath, `screenshot ${String(slot)}`);
      if (!/^[0-9a-f]{64}$/.test(result.expectedSha256 ?? "")) {
        result.failures.push("screenshot manifest must declare a lowercase SHA-256 hash");
      }
      result.provenanceCovered = provenanceMatchers.some((matcher) => matcher.test(validatedPath.normalizedPath));
      if (!result.provenanceCovered) {
        result.failures.push("screenshot path is not covered by docs/asset-provenance.json");
      }

      try {
        const buffer = await readFile(validatedPath.absolutePath);
        result.exists = true;
        result.sha256 = createHash("sha256").update(buffer).digest("hex");
        if (/^[0-9a-f]{64}$/.test(result.expectedSha256 ?? "") && result.sha256 !== result.expectedSha256) {
          result.failures.push(`screenshot SHA-256 is ${result.sha256}; expected ${result.expectedSha256}`);
        }
        const png = parsePng(buffer);
        result.png = {
          width: png.width,
          height: png.height,
          bitDepth: png.bitDepth,
          colorType: png.colorType,
          hasTransparencyChunk: png.hasTransparencyChunk,
        };
        if (png.width !== 1920 || png.height !== 1080) {
          result.failures.push(
            `image dimensions are ${String(png.width)}x${String(png.height)}; expected 1920x1080`,
          );
        }
      } catch (error) {
        if (error?.code === "ENOENT") {
          result.failures.push("screenshot file is missing");
        } else {
          result.failures.push(
            `screenshot file could not be validated: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (result.failures.length === 0) result.status = "Passed";
      else {
        result.status = "Failed";
        appendFailures(failures, result.failures.map((failure) => `screenshot ${String(slot)}: ${failure}`));
      }
    }

    const presentScreenshotCount = screenshotResults.filter((result) => result.exists).length;
    if (presentScreenshotCount < 5) {
      failures.push(`Steam requires at least 5 screenshots; found ${String(presentScreenshotCount)}`);
    }
    if (presentScreenshotCount !== screenshotFileNames.length) {
      failures.push(
        `deterministic certification expects ${String(screenshotFileNames.length)} screenshots; found ${String(presentScreenshotCount)}`,
      );
    }
  }

  const requiredAssets = assetResults.filter((result) => result.required);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: reportOnly ? "report-only" : "strict",
    manifestPath: relativePath(manifestPath),
    provenancePath: relativePath(provenancePath),
    status: failures.length > 0 ? "Failed" : "Passed",
    summary: {
      requiredAssetCount: requiredAssets.length,
      presentRequiredAssetCount: requiredAssets.filter((result) => result.exists).length,
      optionalAssetCount: assetResults.length - requiredAssets.length,
      presentOptionalAssetCount: assetResults.filter((result) => !result.required && result.exists).length,
      screenshotDefinitionCount: screenshotResults.length,
      presentScreenshotCount: screenshotResults.filter((result) => result.exists).length,
      failureCount: failures.length,
    },
    copy: copyResult,
    assets: assetResults,
    screenshots: screenshotResults,
    failures,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(
    `STEAM_STORE_ASSET_CERTIFICATION ${JSON.stringify({ status: report.status, failures: failures.length })}`,
  );
  console.info(`Evidence: ${relativePath(outputPath)}`);

  if (!reportOnly && failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }

  return report;
}

async function main() {
  const reportOnly = process.argv.includes("--report-only");
  await validateSteamStoreAssets({ reportOnly });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
