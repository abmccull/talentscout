import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const expectedArgument = process.argv.find((argument) => argument.startsWith("--expected="));
const expected = (
  expectedArgument?.slice("--expected=".length)
  ?? process.env.NEXT_PUBLIC_BUILD_VERSION
  ?? ""
).trim().toLowerCase();
const outputDirectoryArgument = process.argv.find((argument) => argument.startsWith("--dir="));
const outputDirectory = resolve(
  root,
  outputDirectoryArgument?.slice("--dir=".length) ?? "out/_next",
);

if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(expected)) {
  throw new Error("Shipping provenance requires a full Git commit SHA");
}

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

const matches = [];
for (const path of await javascriptFiles(outputDirectory)) {
  const source = await readFile(path, "utf8");
  if (source.toLowerCase().includes(expected)) {
    matches.push(relative(root, path).replaceAll("\\", "/"));
  }
}
if (matches.length === 0) {
  throw new Error(
    `Shipping JavaScript does not contain the exact build provenance ${expected}`,
  );
}

const evidencePath = resolve(root, "artifacts/release/generated/build-provenance.json");
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify({
  schemaVersion: 1,
  evidenceKind: "shipping-build-provenance",
  candidateCommitSha: expected,
  status: "Passed",
  matchingFiles: matches,
}, null, 2)}\n`, "utf8");
console.info(`SHIPPING_BUILD_PROVENANCE ${JSON.stringify({ candidateCommitSha: expected, matches: matches.length })}`);
