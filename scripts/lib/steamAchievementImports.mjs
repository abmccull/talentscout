import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_ROOT = path.resolve(moduleDir, "..", "..");

export const STEAM_ACHIEVEMENT_IMPORT_PATHS = {
  achievementsSource: "src/lib/achievements.ts",
  steamMapSource: "src/lib/steam/achievementMap.ts",
  screenScopeSource: "src/stores/gameScreenScope.ts",
  fullGameImportVdf: "docs/achievements_import.vdf",
  youthEarlyAccessImportVdf: "docs/achievements_import_youth_early_access.vdf",
  youthEarlyAccessManifest: "docs/steam_achievement_scope_youth_early_access.json",
};

function readProjectFile(root, relativePath) {
  return readFileSync(path.resolve(root, relativePath), "utf8");
}

function extractBracketBlock(source, token, openChar, closeChar) {
  const tokenIndex = source.indexOf(token);
  if (tokenIndex === -1) {
    throw new Error(`Could not find token: ${token}`);
  }

  const startIndex = source.indexOf(openChar, tokenIndex + token.length);
  if (startIndex === -1) {
    throw new Error(`Could not find opening ${openChar} for ${token}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Could not find closing ${closeChar} for ${token}`);
}

function extractTopLevelObjects(arraySource) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;

  for (let index = 0; index < arraySource.length; index += 1) {
    const char = arraySource[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        objects.push(arraySource.slice(objectStart, index + 1));
        objectStart = -1;
      }
    }
  }

  return objects;
}

function readQuotedField(block, fieldName) {
  const match = block.match(new RegExp(`\\b${fieldName}:\\s*"([^"]+)"`));
  if (!match) {
    throw new Error(`Missing ${fieldName} in achievement definition block`);
  }
  return match[1];
}

function parseAchievementDefinitions(source) {
  const achievementArray = extractBracketBlock(
    source,
    "export const ACHIEVEMENTS: AchievementDef[] =",
    "[",
    "]",
  );
  const definitions = new Map();

  for (const block of extractTopLevelObjects(achievementArray)) {
    const id = readQuotedField(block, "id");
    definitions.set(id, {
      id,
      name: readQuotedField(block, "name"),
      description: readQuotedField(block, "description"),
      hidden: /\bhidden:\s*true\b/.test(block),
    });
  }

  return definitions;
}

function parseSteamAchievementMap(source) {
  const mapBlock = extractBracketBlock(
    source,
    "export const STEAM_ACHIEVEMENT_MAP: Record<string, string> =",
    "{",
    "}",
  );
  const map = new Map();

  for (const match of mapBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    map.set(match[1], match[2]);
  }

  return map;
}

function parseUnavailableAchievementIds(source) {
  const setBlock = extractBracketBlock(
    source,
    "export const YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS",
    "[",
    "]",
  );
  return [...setBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseVdfAchievementApiNames(source) {
  return [...source.matchAll(/"name"\s+"([^"]+)"/g)].map((match) => match[1]);
}

function validateUniqueIds(ids, label, failures) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      failures.push(`${label} contains duplicate achievement ID: ${id}`);
      continue;
    }
    seen.add(id);
  }
}

function buildEntries(ids, definitions, steamMap, failures, label) {
  return ids.flatMap((id) => {
    const definition = definitions.get(id);
    if (!definition) {
      failures.push(`${label} references missing achievement definition: ${id}`);
      return [];
    }

    const steamApiName = steamMap.get(id);
    if (!steamApiName) {
      failures.push(`${label} references missing Steam mapping: ${id}`);
      return [];
    }

    return [{
      id,
      steamApiName,
      name: definition.name,
      description: definition.description,
      hidden: definition.hidden,
    }];
  });
}

export function renderSteamAchievementImportVdf(entries) {
  const lines = ["\"achievements\"", "{"];

  entries.forEach((entry, index) => {
    lines.push(`\t"${index + 1}"`);
    lines.push("\t{");
    lines.push(`\t\t"name"\t\t"${entry.steamApiName}"`);
    lines.push('\t\t"display"');
    lines.push("\t\t{");
    lines.push('\t\t\t"name"');
    lines.push("\t\t\t{");
    lines.push(`\t\t\t\t"english"\t\t"${entry.name}"`);
    lines.push("\t\t\t}");
    lines.push('\t\t\t"desc"');
    lines.push("\t\t\t{");
    lines.push(`\t\t\t\t"english"\t\t"${entry.description}"`);
    lines.push("\t\t\t}");
    lines.push("\t\t}");
    lines.push(`\t\t"hidden"\t\t"${entry.hidden ? "1" : "0"}"`);
    lines.push("\t}");
  });

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function auditSteamAchievementImports(root = DEFAULT_ROOT) {
  const failures = [];
  const manifest = JSON.parse(
    readProjectFile(root, STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessManifest),
  );
  const achievementsSource = readProjectFile(
    root,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.achievementsSource,
  );
  const steamMapSource = readProjectFile(
    root,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.steamMapSource,
  );
  const screenScopeSource = readProjectFile(
    root,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.screenScopeSource,
  );
  const fullGameImportSource = readProjectFile(
    root,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.fullGameImportVdf,
  );
  const youthImportAbsolutePath = path.resolve(
    root,
    STEAM_ACHIEVEMENT_IMPORT_PATHS.youthEarlyAccessImportVdf,
  );
  const currentYouthImportSource = existsSync(youthImportAbsolutePath)
    ? readFileSync(youthImportAbsolutePath, "utf8")
    : null;

  const definitions = parseAchievementDefinitions(achievementsSource);
  const steamMap = parseSteamAchievementMap(steamMapSource);
  const codeReservedIds = parseUnavailableAchievementIds(screenScopeSource);
  const manifestIncludedIds = manifest.youthEarlyAccessAchievementIds ?? [];
  const manifestReservedIds = manifest.futureBuildOnlyAchievementIds ?? [];

  if (manifest.schemaVersion !== 1) {
    failures.push(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
  }

  validateUniqueIds(manifestIncludedIds, "Youth EA manifest", failures);
  validateUniqueIds(manifestReservedIds, "Future-build manifest", failures);

  if (manifestIncludedIds.length !== 36) {
    failures.push(
      `Youth EA manifest must contain 36 scoped achievements, found ${manifestIncludedIds.length}`,
    );
  }
  if (manifestReservedIds.length !== 9) {
    failures.push(
      `Future-build manifest must contain 9 reserved achievements, found ${manifestReservedIds.length}`,
    );
  }

  const overlap = manifestIncludedIds.filter((id) => manifestReservedIds.includes(id));
  if (overlap.length > 0) {
    failures.push(
      `Youth EA manifest and future-build manifest overlap: ${overlap.join(", ")}`,
    );
  }

  const totalAuditedIds = new Set([...manifestIncludedIds, ...manifestReservedIds]);
  if (totalAuditedIds.size !== 45) {
    failures.push(
      `Audited Steam achievement scope must cover 45 unique IDs, found ${totalAuditedIds.size}`,
    );
  }

  const reservedFromCode = [...codeReservedIds].sort();
  const reservedFromManifest = [...manifestReservedIds].sort();
  if (JSON.stringify(reservedFromCode) !== JSON.stringify(reservedFromManifest)) {
    failures.push(
      "Future-build manifest does not match YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS",
    );
  }

  const youthEntries = buildEntries(
    manifestIncludedIds,
    definitions,
    steamMap,
    failures,
    "Youth EA manifest",
  );
  const reservedEntries = buildEntries(
    manifestReservedIds,
    definitions,
    steamMap,
    failures,
    "Future-build manifest",
  );

  const generatedYouthImportVdf = renderSteamAchievementImportVdf(youthEntries);
  const fullGameImportApiNames = parseVdfAchievementApiNames(fullGameImportSource);
  const youthImportApiNames = youthEntries.map((entry) => entry.steamApiName);

  if (fullGameImportApiNames.length !== 45) {
    failures.push(
      `docs/achievements_import.vdf must remain a 45-entry full-game import, found ${fullGameImportApiNames.length}`,
    );
  }

  const missingReservedFromFullGame = reservedEntries
    .map((entry) => entry.steamApiName)
    .filter((steamApiName) => !fullGameImportApiNames.includes(steamApiName));

  return {
    failures,
    manifest,
    youthEntries,
    reservedEntries,
    generatedYouthImportVdf,
    currentYouthImportSource,
    fullGameImportApiNames,
    youthImportApiNames,
    missingReservedFromFullGame,
    codeReservedIds,
    counts: {
      youthEarlyAccess: manifestIncludedIds.length,
      futureBuildOnly: manifestReservedIds.length,
      auditedSteamScope: totalAuditedIds.size,
      fullGameImportVdf: fullGameImportApiNames.length,
    },
  };
}
