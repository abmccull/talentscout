import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const args = process.argv.slice(2);
const outputArgument = args.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(
  root,
  outputArgument?.slice("--out=".length) ?? "artifacts/release/candidate-package-manifest.json",
);
const packageArguments = args.filter((arg) => !arg.startsWith("--out="));
const kindExtensions = new Map([
  ["windows-installer", ".exe"],
  ["macos-dmg", ".dmg"],
  ["macos-zip", ".zip"],
  ["linux-appimage", ".appimage"],
  ["linux-deb", ".deb"],
]);

function inferredKind(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".exe") return "windows-installer";
  if (extension === ".dmg") return "macos-dmg";
  if (extension === ".zip") return "macos-zip";
  if (extension === ".appimage") return "linux-appimage";
  if (extension === ".deb") return "linux-deb";
  throw new Error(`Cannot infer package kind for ${path}; use kind=path`);
}

function parsePackageArgument(argument) {
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex > 0) {
    return {
      kind: argument.slice(0, equalsIndex),
      path: argument.slice(equalsIndex + 1),
    };
  }
  return { kind: inferredKind(argument), path: argument };
}

function pathInsideRoot(path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectHash);
    stream.once("end", resolveHash);
  });
  return hash.digest("hex");
}

if (packageArguments.length === 0) {
  throw new Error("Provide at least one package path (or kind=path)");
}
if (!pathInsideRoot(outputPath)) {
  throw new Error("Release package manifest output must remain inside the repository");
}

const { stdout: shaOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
const { stdout: treeOutput } = await execFileAsync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { cwd: root },
);
if (treeOutput.trim()) {
  throw new Error("Refusing to create a release package manifest from a dirty working tree");
}
const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const productVersion = String(packageDocument.version ?? "").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(productVersion)) {
  throw new Error(`package.json has an invalid release version: ${productVersion || "<missing>"}`);
}
const candidateTag = (
  process.env.RELEASE_CANDIDATE_TAG
  ?? (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "")
).trim() || null;
if (candidateTag) {
  const escapedVersion = productVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compatibleTag = new RegExp(
    `^v${escapedVersion}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$`,
  );
  if (!compatibleTag.test(candidateTag)) {
    throw new Error(`Release tag ${candidateTag} is not compatible with version ${productVersion}`);
  }
}

const packages = [];
const seenKindsAndPaths = new Set();
const seenKinds = new Set();
for (const argument of packageArguments) {
  const parsed = parsePackageArgument(argument);
  if (!parsed.kind || !parsed.path || isAbsolute(parsed.path)) {
    throw new Error(`Invalid package argument ${argument}`);
  }
  const absolutePath = resolve(root, parsed.path);
  if (!pathInsideRoot(absolutePath)) throw new Error(`Package path escapes the repository: ${parsed.path}`);
  const normalizedPath = relative(root, absolutePath).replaceAll("\\", "/");
  const normalizedKind = parsed.kind.trim();
  if (seenKinds.has(normalizedKind)) throw new Error(`Duplicate package kind ${normalizedKind}`);
  seenKinds.add(normalizedKind);
  const expectedExtension = kindExtensions.get(normalizedKind);
  if (expectedExtension && extname(normalizedPath).toLowerCase() !== expectedExtension) {
    throw new Error(`${normalizedKind} must use the ${expectedExtension} file extension`);
  }
  const duplicateKey = `${parsed.kind}:${normalizedPath}`;
  if (seenKindsAndPaths.has(duplicateKey)) throw new Error(`Duplicate package ${duplicateKey}`);
  seenKindsAndPaths.add(duplicateKey);
  const packageStat = await stat(absolutePath);
  if (!packageStat.isFile()) throw new Error(`${normalizedPath} is not a file`);
  packages.push({
    kind: normalizedKind,
    path: normalizedPath,
    bytes: packageStat.size,
    sha256: await sha256(absolutePath),
  });
}

const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  candidateCommitSha: shaOutput.trim().toLowerCase(),
  candidateTag,
  product: String(packageDocument.productName ?? packageDocument.name ?? "TalentScout"),
  productVersion,
  workflowRunId: process.env.GITHUB_RUN_ID?.trim() || null,
  packages,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.info(`RELEASE_PACKAGE_MANIFEST ${relative(root, outputPath)}`);
