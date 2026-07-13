import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const platform = process.argv[2];
const targets = {
  windows: {
    filename: "steam_api64.dll",
    urlEnv: "STEAM_SDK_WINDOWS_URL",
    hashEnv: "STEAM_SDK_WINDOWS_SHA256",
  },
  macos: {
    filename: "libsteam_api.dylib",
    urlEnv: "STEAM_SDK_MACOS_URL",
    hashEnv: "STEAM_SDK_MACOS_SHA256",
  },
  linux: {
    filename: "libsteam_api.so",
    urlEnv: "STEAM_SDK_LINUX_URL",
    hashEnv: "STEAM_SDK_LINUX_SHA256",
  },
};

if (!(platform in targets)) {
  throw new Error("Usage: node scripts/provision-steam-sdk.mjs windows|macos|linux");
}

const appId = process.env.STEAM_APP_ID ?? "4455570";
if (!/^\d+$/.test(appId)) throw new Error("STEAM_APP_ID must contain only digits");
writeFileSync(resolve("steam_appid.txt"), `${appId}\n`, "utf8");

const target = targets[platform];
const targetPath = resolve(target.filename);
const downloadUrl = process.env[target.urlEnv]?.trim();
const downloadToken = process.env.STEAM_SDK_DOWNLOAD_TOKEN?.trim();
const expectedHash = process.env[target.hashEnv]?.trim().toLowerCase();
const required = process.env.REQUIRE_STEAM_SDK === "true";

if (downloadUrl) {
  const parsedUrl = new URL(downloadUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${target.urlEnv} must use HTTPS`);
  }
  const response = await fetch(parsedUrl, {
    headers: {
      Accept: "application/octet-stream",
      ...(downloadToken ? { Authorization: `Bearer ${downloadToken}` } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Unable to download ${target.filename}: HTTP ${response.status}`,
    );
  }
  if (new URL(response.url).protocol !== "https:") {
    throw new Error(`Download for ${target.filename} redirected away from HTTPS`);
  }
  writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

if (!existsSync(targetPath)) {
  const message = `${target.filename} is not provisioned (${target.urlEnv})`;
  if (required) throw new Error(message);
  console.warn(`::warning::${message}; this is a non-Steam verification build.`);
  process.exit(0);
}

if (statSync(targetPath).size < 10_000) {
  throw new Error(`${target.filename} is too small to be a Steamworks redistributable`);
}

const actualHash = createHash("sha256")
  .update(readFileSync(targetPath))
  .digest("hex");

if (required && !expectedHash) {
  throw new Error(`Tagged builds require ${target.hashEnv}`);
}
if (expectedHash && actualHash !== expectedHash) {
  throw new Error(`${target.filename} SHA-256 does not match ${target.hashEnv}`);
}

if (platform !== "windows") chmodSync(targetPath, 0o755);
console.log(`::notice::Provisioned ${target.filename} (${actualHash.slice(0, 12)}...)`);
