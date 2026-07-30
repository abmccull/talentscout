import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shippingHtmlPath = resolve(repositoryRoot, "out", "play.html");
const outputPath = resolve(
  repositoryRoot,
  "artifacts",
  "release",
  "generated",
  "shipping-bundle-budget.json",
);

// TalentScout ships as a local Electron application, but the static export is
// also served over HTTP during browser validation. Keep the complete initial
// /play script graph below 1.15 MiB gzip. This provides measured headroom above
// the approved 2026-07-29 baseline without allowing silent payload growth.
const maximumInitialGzipBytes = 1_205_862;

const html = await readFile(shippingHtmlPath, "utf8");
const scriptSources = [
  ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g),
].map((match) => match[1]);

if (scriptSources.length === 0) {
  throw new Error(`No shipping JavaScript was found in ${shippingHtmlPath}`);
}

const uniqueScriptSources = [...new Set(scriptSources)];
const files = [];
let rawBytes = 0;
let gzipBytes = 0;

for (const source of uniqueScriptSources) {
  if (!source.startsWith("/_next/static/")) {
    throw new Error(`Unexpected non-static shipping script: ${source}`);
  }

  const absolutePath = resolve(repositoryRoot, "out", source.replace(/^\//, ""));
  const contents = await readFile(absolutePath);
  const compressedBytes = gzipSync(contents, { level: 6 }).byteLength;
  rawBytes += contents.byteLength;
  gzipBytes += compressedBytes;
  files.push({
    source,
    rawBytes: contents.byteLength,
    gzipBytes: compressedBytes,
  });
}

const candidateCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim().toLowerCase();
const passed = gzipBytes <= maximumInitialGzipBytes;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  candidateCommitSha,
  route: "/play",
  measurement: "complete initial HTML script graph compressed with gzip level 6",
  budget: {
    maximumInitialGzipBytes,
  },
  measured: {
    scriptCount: files.length,
    rawBytes,
    gzipBytes,
    remainingGzipBytes: maximumInitialGzipBytes - gzipBytes,
  },
  files,
  status: passed ? "pass" : "fail",
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.info(
  `Shipping /play bundle: ${gzipBytes} gzip bytes `
  + `(budget ${maximumInitialGzipBytes}, ${passed ? "pass" : "fail"})`,
);

if (!passed) {
  throw new Error(
    `Shipping /play initial JavaScript is ${gzipBytes} gzip bytes; `
    + `the production budget is ${maximumInitialGzipBytes}`,
  );
}
