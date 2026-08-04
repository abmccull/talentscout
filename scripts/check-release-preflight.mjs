import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const argv = process.argv.slice(2);
const allowedModes = new Set([
  "package",
  "certify",
  "promote-github",
  "promote-steam",
  "verification",
]);
const fullGitObjectPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const runIdPattern = /^[0-9]+$/;
const urlPattern = /^https:\/\//i;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const appleTeamIdPattern = /^[A-Z0-9]{10}$/;

function parseArgs(args) {
  let mode = null;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--mode") {
      mode = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token.startsWith("--mode=")) {
      mode = token.slice("--mode=".length);
      continue;
    }
    throw new Error(`Unsupported argument ${token}`);
  }

  return { mode, json };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return { source: name, value: value.trim() };
    }
  }
  return { source: names[0], value: "" };
}

function pushCheck(report, check) {
  report.checks.push(check);
  if (!check.ok && check.failure) report.failures.push(check.failure);
}

function requireField(report, id, names, validator, description) {
  const resolved = resolveEnv(names);
  const present = resolved.value.length > 0;
  let ok = present;
  if (ok && validator) ok = validator(resolved.value);
  pushCheck(report, {
    id,
    ok,
    sourceEnv: resolved.source,
    present,
    failure: ok
      ? null
      : present
        ? `${resolved.source} must be ${description}`
        : `${names[0]} is required`,
  });
  return present && ok ? resolved.value : null;
}

function optionalField(report, id, names, validator, description) {
  const resolved = resolveEnv(names);
  const present = resolved.value.length > 0;
  const ok = !present || !validator || validator(resolved.value);
  pushCheck(report, {
    id,
    ok,
    sourceEnv: resolved.source,
    present,
    failure: ok ? null : `${resolved.source} must be ${description}`,
  });
  return present && ok ? resolved.value : null;
}

function validateUrlShaPair(report, pair, required) {
  const url = resolveEnv([pair.urlEnv]).value;
  const sha = resolveEnv([pair.shaEnv]).value;

  let failure = null;
  if (!url && !sha) {
    if (required) failure = `${pair.urlEnv} and ${pair.shaEnv} are required in package mode`;
  } else if (!url) {
    failure = `${pair.urlEnv} is required when ${pair.shaEnv} is set`;
  } else if (!sha) {
    failure = `${pair.shaEnv} is required when ${pair.urlEnv} is set`;
  } else if (!urlPattern.test(url)) {
    failure = `${pair.urlEnv} must use HTTPS`;
  } else if (!sha256Pattern.test(sha)) {
    failure = `${pair.shaEnv} must contain 64 hexadecimal characters`;
  }

  pushCheck(report, {
    id: `steam-sdk.${pair.label}`,
    ok: failure === null,
    sourceEnv: pair.urlEnv,
    present: Boolean(url || sha),
    required,
    failure,
  });
}

function isInsideRoot(path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot === ""
    || (
      fromRoot !== ".."
      && !fromRoot.startsWith(`..${sep}`)
      && !isAbsolute(fromRoot)
    )
  );
}

function isSafeContentRoot(baseDirectory, contentRoot, allowEmpty) {
  if (!contentRoot) return allowEmpty;
  if (isAbsolute(contentRoot)) return false;
  return isInsideRoot(resolve(baseDirectory, contentRoot));
}

function tokenizeVdf(text, label) {
  const tokens = [];
  const pattern = /"([^"]*)"|([{}])/g;
  let cursor = 0;

  while (cursor < text.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    const skipped = text.slice(cursor, match?.index ?? text.length);
    if (skipped.trim().length > 0) {
      throw new Error(`${label} contains unsupported VDF syntax`);
    }
    if (!match) break;
    if (match[2]) {
      tokens.push({ type: "brace", value: match[2] });
    } else {
      tokens.push({ type: "string", value: match[1] ?? "" });
    }
    cursor = pattern.lastIndex;
  }

  return tokens;
}

function parseVdf(text, label) {
  const tokens = tokenizeVdf(text, label);
  let index = 0;

  function nextString(context) {
    const token = tokens[index];
    if (!token || token.type !== "string") {
      throw new Error(`${label} expected ${context}`);
    }
    index += 1;
    return token.value;
  }

  function nextBrace(expected) {
    const token = tokens[index];
    if (!token || token.type !== "brace" || token.value !== expected) {
      throw new Error(`${label} expected ${expected}`);
    }
    index += 1;
  }

  function parseObject() {
    const value = {};
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === "brace" && token.value === "}") {
        index += 1;
        return value;
      }
      const key = nextString("a key");
      const next = tokens[index];
      if (!next) throw new Error(`${label} truncated after key ${key}`);
      if (next.type === "brace" && next.value === "{") {
        index += 1;
        value[key] = parseObject();
        continue;
      }
      value[key] = nextString(`a value for ${key}`);
    }
    throw new Error(`${label} is missing a closing brace`);
  }

  const rootKey = nextString("a root key");
  nextBrace("{");
  const value = parseObject();
  if (index !== tokens.length) throw new Error(`${label} has trailing tokens`);
  return { rootKey, value };
}

async function validateSteamVdf(report) {
  const appBuildPath = resolve(root, "steamcmd", "app_build_4455570.vdf");
  let appBuildText = "";
  try {
    appBuildText = await readFile(appBuildPath, "utf8");
  } catch (error) {
    pushCheck(report, {
      id: "steamcmd.app-build",
      ok: false,
      present: false,
      failure: `steamcmd/app_build_4455570.vdf cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  try {
    const parsed = parseVdf(appBuildText, "steamcmd/app_build_4455570.vdf");
    const depots = parsed.value.depots;
    let failure = null;
    if (parsed.rootKey !== "appbuild") {
      failure = "steamcmd/app_build_4455570.vdf must use the appbuild root key";
    } else if (parsed.value.appid !== "4455570") {
      failure = "steamcmd/app_build_4455570.vdf must target app 4455570";
    } else if (!isSafeContentRoot(resolve(root, "steamcmd"), parsed.value.contentroot ?? "", true)) {
      failure = "steamcmd/app_build_4455570.vdf has an unsafe contentroot";
    } else if (!depots || typeof depots !== "object") {
      failure = "steamcmd/app_build_4455570.vdf must define depot mappings";
    } else {
      const expectedDepots = {
        4455571: "depot_build_4455571_windows.vdf",
        4455572: "depot_build_4455572_macos.vdf",
        4455573: "depot_build_4455573_linux.vdf",
      };
      const actualKeys = Object.keys(expectedDepots);
      for (const depotId of actualKeys) {
        if (depots[depotId] !== expectedDepots[depotId]) {
          failure = `steamcmd/app_build_4455570.vdf must map depot ${depotId} to ${expectedDepots[depotId]}`;
          break;
        }
      }
      if (!failure && Object.keys(depots).length !== actualKeys.length) {
        failure = "steamcmd/app_build_4455570.vdf must only reference depots 4455571-4455573";
      }
    }
    pushCheck(report, {
      id: "steamcmd.app-build",
      ok: failure === null,
      present: true,
      failure,
    });
  } catch (error) {
    pushCheck(report, {
      id: "steamcmd.app-build",
      ok: false,
      present: true,
      failure: error instanceof Error ? error.message : String(error),
    });
  }

  const depotDefinitions = [
    {
      id: "4455571",
      file: "depot_build_4455571_windows.vdf",
      expectedContentRoot: "../dist/win-unpacked",
    },
    {
      id: "4455572",
      file: "depot_build_4455572_macos.vdf",
      expectedContentRoot: "../steam-stage/macos",
    },
    {
      id: "4455573",
      file: "depot_build_4455573_linux.vdf",
      expectedContentRoot: "../dist/linux-unpacked",
    },
  ];

  for (const definition of depotDefinitions) {
    const depotPath = resolve(root, "steamcmd", definition.file);
    let depotText = "";
    try {
      depotText = await readFile(depotPath, "utf8");
    } catch (error) {
      pushCheck(report, {
        id: `steamcmd.depot.${definition.id}`,
        ok: false,
        present: false,
        failure: `steamcmd/${definition.file} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    try {
      const parsed = parseVdf(depotText, `steamcmd/${definition.file}`);
      let failure = null;
      if (parsed.rootKey !== "DepotBuildConfig") {
        failure = `steamcmd/${definition.file} must use the DepotBuildConfig root key`;
      } else if (parsed.value.DepotID !== definition.id) {
        failure = `steamcmd/${definition.file} must target depot ${definition.id}`;
      } else if (parsed.value.contentroot !== definition.expectedContentRoot) {
        failure = `steamcmd/${definition.file} must use contentroot ${definition.expectedContentRoot}`;
      } else if (
        !isSafeContentRoot(resolve(root, "steamcmd"), parsed.value.contentroot ?? "", false)
      ) {
        failure = `steamcmd/${definition.file} has an unsafe contentroot`;
      }
      pushCheck(report, {
        id: `steamcmd.depot.${definition.id}`,
        ok: failure === null,
        present: true,
        failure,
      });
    } catch (error) {
      pushCheck(report, {
        id: `steamcmd.depot.${definition.id}`,
        ok: false,
        present: true,
        failure: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isDecodableNonEmptyBase64(value) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false;
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 0) return false;
  return decoded.toString("utf8").trim().length > 0;
}

function renderText(report) {
  if (report.ok) {
    return `release preflight passed for mode ${report.mode}`;
  }
  return [
    `release preflight failed for mode ${report.mode}`,
    ...report.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

async function main() {
  const { mode, json } = parseArgs(argv);
  const report = {
    schemaVersion: 1,
    mode: mode ?? null,
    ok: false,
    checkedAt: new Date().toISOString(),
    packageVersion: null,
    failures: [],
    checks: [],
  };

  if (!mode || !allowedModes.has(mode)) {
    pushCheck(report, {
      id: "mode",
      ok: false,
      present: Boolean(mode),
      failure: `--mode must be one of ${Array.from(allowedModes).join(", ")}`,
    });
  }

  try {
    const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    const packageVersion = String(packageDocument.version ?? "").trim();
    report.packageVersion = packageVersion || null;
    pushCheck(report, {
      id: "package.version",
      ok: packageVersion.length > 0,
      present: packageVersion.length > 0,
      failure: packageVersion.length > 0 ? null : "package.json must define a version",
    });

    const candidateSha = requireField(
      report,
      "candidate.sha",
      ["RELEASE_CANDIDATE_SHA", "CANDIDATE_SHA", "GITHUB_SHA"],
      (value) => fullGitObjectPattern.test(value),
      "a full 40- or 64-character Git commit SHA",
    );
    requireField(
      report,
      "candidate.treeSha",
      ["RELEASE_CANDIDATE_TREE_SHA", "CANDIDATE_TREE_SHA"],
      (value) => fullGitObjectPattern.test(value),
      "a full 40- or 64-character Git tree SHA",
    );
    const candidateTag = requireField(
      report,
      "candidate.tag",
      ["RELEASE_CANDIDATE_TAG", "CANDIDATE_TAG", "GITHUB_REF_NAME"],
      (value) => /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(value),
      "a release tag like v1.0.0 or v1.0.0-rc.1",
    );
    requireField(
      report,
      "candidate.runId",
      ["RELEASE_CANDIDATE_RUN_ID", "CANDIDATE_RUN_ID"],
      (value) => runIdPattern.test(value),
      "a numeric workflow run ID",
    );

    if (candidateTag && packageVersion) {
      const compatibleTagPattern = new RegExp(
        `^v${escapeRegex(packageVersion)}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$`,
      );
      pushCheck(report, {
        id: "candidate.tagVersion",
        ok: compatibleTagPattern.test(candidateTag),
        present: true,
        failure: compatibleTagPattern.test(candidateTag)
          ? null
          : `RELEASE_CANDIDATE_TAG must match package.json version ${packageVersion}`,
      });
    }

    if (mode === "promote-steam" && candidateTag) {
      pushCheck(report, {
        id: "candidate.finalSteamTag",
        ok: !candidateTag.includes("-"),
        present: true,
        failure: candidateTag.includes("-")
          ? "promote-steam requires a final release tag without prerelease suffixes"
          : null,
      });
    }

    const requireSdkPairs = mode === "package";
    for (const pair of [
      { label: "windows", urlEnv: "STEAM_SDK_WINDOWS_URL", shaEnv: "STEAM_SDK_WINDOWS_SHA256" },
      { label: "macos", urlEnv: "STEAM_SDK_MACOS_URL", shaEnv: "STEAM_SDK_MACOS_SHA256" },
      { label: "linux", urlEnv: "STEAM_SDK_LINUX_URL", shaEnv: "STEAM_SDK_LINUX_SHA256" },
    ]) {
      validateUrlShaPair(report, pair, requireSdkPairs);
    }

    if (mode === "package") {
      requireField(
        report,
        "sentry.clientDsn",
        ["NEXT_PUBLIC_SENTRY_DSN"],
        (value) => urlPattern.test(value),
        "an HTTPS URL",
      );
      requireField(report, "signing.windows.link", ["WIN_CSC_LINK"], null, "present");
      requireField(report, "signing.windows.password", ["WIN_CSC_KEY_PASSWORD"], null, "present");
      requireField(report, "signing.macos.link", ["CSC_LINK"], null, "present");
      requireField(report, "signing.macos.password", ["CSC_KEY_PASSWORD"], null, "present");
      requireField(
        report,
        "notarization.appleId",
        ["APPLE_ID"],
        (value) => emailPattern.test(value),
        "a valid Apple ID email address",
      );
      requireField(report, "notarization.applePassword", ["APPLE_ID_PASSWORD"], null, "present");
      requireField(
        report,
        "notarization.appleTeamId",
        ["APPLE_TEAM_ID"],
        (value) => appleTeamIdPattern.test(value),
        "a 10-character Apple team ID",
      );
    } else {
      optionalField(
        report,
        "sentry.clientDsn",
        ["NEXT_PUBLIC_SENTRY_DSN"],
        (value) => urlPattern.test(value),
        "an HTTPS URL",
      );
      optionalField(
        report,
        "notarization.appleId",
        ["APPLE_ID"],
        (value) => emailPattern.test(value),
        "a valid Apple ID email address",
      );
      optionalField(
        report,
        "notarization.appleTeamId",
        ["APPLE_TEAM_ID"],
        (value) => appleTeamIdPattern.test(value),
        "a 10-character Apple team ID",
      );
    }

    if (mode === "promote-steam") {
      requireField(report, "steam.username", ["STEAM_USERNAME"], null, "present");
      requireField(
        report,
        "steam.configVdf",
        ["STEAM_CONFIG_VDF"],
        (value) => isDecodableNonEmptyBase64(value),
        "decodable non-empty base64",
      );
    }

    await validateSteamVdf(report);

    if (!candidateSha) {
      pushCheck(report, {
        id: "candidate.binding",
        ok: false,
        present: false,
        failure: "candidate identifiers are incomplete",
      });
    }
  } catch (error) {
    pushCheck(report, {
      id: "preflight",
      ok: false,
      present: false,
      failure: error instanceof Error ? error.message : String(error),
    });
  }

  report.ok = report.failures.length === 0;

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.ok) {
    process.stdout.write(`${renderText(report)}\n`);
  } else {
    process.stderr.write(`${renderText(report)}\n`);
  }

  process.exitCode = report.ok ? 0 : 1;
}

await main();
