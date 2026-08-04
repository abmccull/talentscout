import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.cwd());
const rootRealPath = await realpath(root);
const defaultReleaseDirectory = "release-artifacts";
const defaultInventoryPath = "artifacts/release/release-artifact-inventory.json";
const defaultPromotionPath = "artifacts/release/release-promotion-files.txt";
const blockmapSuffix = ".blockmap";
const requiredArtifacts = [
  {
    kind: "windows-installer",
    subdirectory: "windows-build",
    extension: ".exe",
  },
  {
    kind: "macos-dmg",
    subdirectory: "macos-build",
    extension: ".dmg",
  },
  {
    kind: "macos-zip",
    subdirectory: "macos-build",
    extension: ".zip",
  },
  {
    kind: "linux-appimage",
    subdirectory: "linux-build",
    extension: ".AppImage",
  },
  {
    kind: "linux-deb",
    subdirectory: "linux-build",
    extension: ".deb",
  },
];

const requiredArtifactByKind = new Map(requiredArtifacts.map((artifact) => [artifact.kind, artifact]));
const allowedSubdirectories = [...new Set(requiredArtifacts.map((artifact) => artifact.subdirectory))];

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function pathInsideRoot(candidatePath) {
  const fromRoot = relative(rootRealPath, candidatePath);
  return (
    fromRoot === ""
    || (
      fromRoot !== ".."
      && !fromRoot.startsWith(`..${sep}`)
      && !isAbsolute(fromRoot)
    )
  );
}

function repositoryRelativePath(candidatePath) {
  return normalizePath(relative(rootRealPath, candidatePath));
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

function resolveInsideRoot(configuredPath, label) {
  if (!configuredPath || typeof configuredPath !== "string") {
    throw new Error(`${label} must be a non-empty repository-relative path`);
  }
  if (isAbsolute(configuredPath)) {
    throw new Error(`${label} must be repository-relative`);
  }
  const absolutePath = resolve(rootRealPath, configuredPath);
  if (!pathInsideRoot(absolutePath)) {
    throw new Error(`${label} escapes the repository root: ${configuredPath}`);
  }
  return absolutePath;
}

function inferKindFromFileName(fileName) {
  for (const artifact of requiredArtifacts) {
    if (fileName.endsWith(artifact.extension)) return artifact.kind;
  }
  return null;
}

function expectedKindsForSubdirectory(subdirectory) {
  return requiredArtifacts.filter((artifact) => artifact.subdirectory === subdirectory);
}

async function assertDirectory(directoryPath, label) {
  const directoryStat = await lstat(directoryPath).catch((error) => {
    throw new Error(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (directoryStat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!directoryStat.isDirectory()) throw new Error(`${label} is not a directory`);
  const realDirectoryPath = await realpath(directoryPath);
  if (!pathInsideRoot(realDirectoryPath)) {
    throw new Error(`${label} resolves outside the repository root`);
  }
}

async function classifyDirectoryEntry(absoluteDirectoryPath, entryName) {
  const absolutePath = resolve(absoluteDirectoryPath, entryName);
  const entryStat = await lstat(absolutePath);
  if (entryStat.isSymbolicLink()) {
    throw new Error(`Symlinks are not allowed in release artifacts: ${repositoryRelativePath(absolutePath)}`);
  }
  const realEntryPath = await realpath(absolutePath);
  if (!pathInsideRoot(realEntryPath)) {
    throw new Error(`Release artifact resolves outside the repository root: ${repositoryRelativePath(absolutePath)}`);
  }
  if (entryStat.isDirectory()) {
    throw new Error(`Nested directories are not allowed in release artifacts: ${repositoryRelativePath(absolutePath)}`);
  }
  if (!entryStat.isFile()) {
    throw new Error(`Unsupported release artifact entry type: ${repositoryRelativePath(absolutePath)}`);
  }
  return {
    absolutePath,
    relativePath: repositoryRelativePath(absolutePath),
    bytes: entryStat.size,
    sha256: await sha256(absolutePath),
  };
}

async function scanArtifactDirectory(releaseDirectoryPath, subdirectory) {
  const absoluteDirectoryPath = resolve(releaseDirectoryPath, subdirectory);
  await assertDirectory(absoluteDirectoryPath, `${repositoryRelativePath(absoluteDirectoryPath)} directory`);
  const entries = (await readdir(absoluteDirectoryPath)).sort((left, right) => left.localeCompare(right));
  const supportedKinds = expectedKindsForSubdirectory(subdirectory);
  const supportedKindsByKind = new Map(supportedKinds.map((artifact) => [artifact.kind, artifact]));
  const inventoryByKind = new Map();
  const pendingBlockmaps = [];

  for (const entryName of entries) {
    const classified = await classifyDirectoryEntry(absoluteDirectoryPath, entryName);
    if (entryName.endsWith(blockmapSuffix)) {
      const distributableName = entryName.slice(0, -blockmapSuffix.length);
      const distributableKind = inferKindFromFileName(distributableName);
      if (!distributableKind || !supportedKindsByKind.has(distributableKind)) {
        throw new Error(`Unexpected blockmap sidecar: ${classified.relativePath}`);
      }
      pendingBlockmaps.push({
        kind: distributableKind,
        distributableRelativePath: normalizePath(
          `${repositoryRelativePath(absoluteDirectoryPath)}/${distributableName}`,
        ),
        path: classified.relativePath,
        bytes: classified.bytes,
        sha256: classified.sha256,
      });
      continue;
    }

    const distributableKind = inferKindFromFileName(entryName);
    if (!distributableKind) {
      throw new Error(`Unexpected release artifact file: ${classified.relativePath}`);
    }
    const expectedArtifact = supportedKindsByKind.get(distributableKind);
    if (!expectedArtifact) {
      throw new Error(
        `Unexpected ${distributableKind} artifact in ${repositoryRelativePath(absoluteDirectoryPath)}: ${classified.relativePath}`,
      );
    }
    if (inventoryByKind.has(distributableKind)) {
      throw new Error(
        `Duplicate distributable kind ${distributableKind}: ${inventoryByKind.get(distributableKind).path} and ${classified.relativePath}`,
      );
    }
    inventoryByKind.set(distributableKind, {
      kind: distributableKind,
      path: classified.relativePath,
      bytes: classified.bytes,
      sha256: classified.sha256,
    });
  }

  for (const blockmap of pendingBlockmaps) {
    const distributable = inventoryByKind.get(blockmap.kind);
    if (!distributable || distributable.path !== blockmap.distributableRelativePath) {
      throw new Error(
        `Blockmap sidecar has no matching distributable: ${blockmap.path}`,
      );
    }
    if (distributable.blockmapPath) {
      throw new Error(`Duplicate blockmap sidecar for ${distributable.path}`);
    }
    distributable.blockmapPath = blockmap.path;
    distributable.blockmapBytes = blockmap.bytes;
    distributable.blockmapSha256 = blockmap.sha256;
  }

  return inventoryByKind;
}

export async function validateReleaseArtifacts(options = {}) {
  const releaseDirectory = options.releaseDirectory ?? defaultReleaseDirectory;
  const inventoryOutput = options.inventoryOutput ?? defaultInventoryPath;
  const promotionOutput = options.promotionOutput ?? defaultPromotionPath;
  const absoluteReleaseDirectory = resolveInsideRoot(releaseDirectory, "Release artifact directory");
  const absoluteInventoryOutput = resolveInsideRoot(inventoryOutput, "Inventory output path");
  const absolutePromotionOutput = resolveInsideRoot(promotionOutput, "Promotion output path");

  await assertDirectory(absoluteReleaseDirectory, repositoryRelativePath(absoluteReleaseDirectory));
  const releaseEntries = (await readdir(absoluteReleaseDirectory)).sort((left, right) =>
    left.localeCompare(right),
  );
  const expectedSubdirectories = new Set(allowedSubdirectories);

  for (const entryName of releaseEntries) {
    const absoluteEntryPath = resolve(absoluteReleaseDirectory, entryName);
    const entryStat = await lstat(absoluteEntryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in release artifacts: ${repositoryRelativePath(absoluteEntryPath)}`);
    }
    if (!entryStat.isDirectory()) {
      throw new Error(`Unexpected release artifact root entry: ${repositoryRelativePath(absoluteEntryPath)}`);
    }
    if (!expectedSubdirectories.has(entryName)) {
      throw new Error(`Unexpected release artifact root entry: ${repositoryRelativePath(absoluteEntryPath)}`);
    }
  }

  const inventory = [];
  for (const subdirectory of allowedSubdirectories) {
    const foundInventory = await scanArtifactDirectory(absoluteReleaseDirectory, subdirectory);
    for (const artifact of expectedKindsForSubdirectory(subdirectory)) {
      const distributable = foundInventory.get(artifact.kind);
      if (!distributable) {
        throw new Error(
          `Missing required distributable kind ${artifact.kind} in ${normalizePath(`${releaseDirectory}/${subdirectory}`)}`,
        );
      }
      inventory.push(distributable);
    }
  }

  if (inventory.length !== requiredArtifacts.length) {
    throw new Error(`Expected ${requiredArtifacts.length} distributables, found ${inventory.length}`);
  }

  const seenKinds = new Set();
  for (const artifact of inventory) {
    if (seenKinds.has(artifact.kind)) {
      throw new Error(`Duplicate distributable kind ${artifact.kind}`);
    }
    const expectedArtifact = requiredArtifactByKind.get(artifact.kind);
    if (!expectedArtifact || !artifact.path.endsWith(expectedArtifact.extension)) {
      throw new Error(`Unexpected distributable classification for ${artifact.path}`);
    }
    seenKinds.add(artifact.kind);
  }

  const orderedInventory = requiredArtifacts.map((artifact) =>
    inventory.find((entry) => entry.kind === artifact.kind),
  );
  const promotionFiles = orderedInventory.flatMap((artifact) =>
    artifact.blockmapPath ? [artifact.path, artifact.blockmapPath] : [artifact.path],
  );
  const report = {
    schemaVersion: 1,
    releaseDirectory: normalizePath(releaseDirectory),
    artifacts: orderedInventory,
    promotionFiles,
  };

  await mkdir(dirname(absoluteInventoryOutput), { recursive: true });
  await mkdir(dirname(absolutePromotionOutput), { recursive: true });
  await writeFile(absoluteInventoryOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(absolutePromotionOutput, `${promotionFiles.join("\n")}\n`, "utf8");

  return {
    report,
    inventoryOutput: repositoryRelativePath(absoluteInventoryOutput),
    promotionOutput: repositoryRelativePath(absolutePromotionOutput),
  };
}

function parseArguments(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument.startsWith("--release-dir=")) {
      options.releaseDirectory = argument.slice("--release-dir=".length);
      continue;
    }
    if (argument.startsWith("--out=")) {
      options.inventoryOutput = argument.slice("--out=".length);
      continue;
    }
    if (argument.startsWith("--promote=")) {
      options.promotionOutput = argument.slice("--promote=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await validateReleaseArtifacts(options);
  console.info(
    `RELEASE_ARTIFACT_INVENTORY ${JSON.stringify({
      inventory: result.inventoryOutput,
      promotionFiles: result.promotionOutput,
      distributables: result.report.artifacts.length,
    })}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
