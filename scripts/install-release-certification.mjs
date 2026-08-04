import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const reservedFiles = new Set([
  "source-workflow-run.json",
  "source-workflow-jobs.json",
  "package-workflow-run.json",
  "package-workflow-jobs.json",
]);
const reservedDirectories = new Set(["source-long-career-shards"]);

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function pathInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== ""
    && fromRoot !== ".."
    && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot)
  );
}

async function collectSourceFiles(sourceRoot, currentDirectory = sourceRoot) {
  const files = [];
  for (const entry of (await readdir(currentDirectory)).sort()) {
    const sourcePath = resolve(currentDirectory, entry);
    const sourceStat = await lstat(sourcePath);
    const relativePath = normalizePath(relative(sourceRoot, sourcePath));
    if (sourceStat.isSymbolicLink()) {
      throw new Error(`Certification bundles may not contain symbolic links: ${relativePath}`);
    }
    const resolvedSourcePath = await realpath(sourcePath);
    if (!pathInside(sourceRoot, resolvedSourcePath)) {
      throw new Error(`Certification bundle entry escapes its source root: ${relativePath}`);
    }
    if (sourceStat.isDirectory()) {
      files.push(...await collectSourceFiles(sourceRoot, sourcePath));
      continue;
    }
    if (!sourceStat.isFile()) {
      throw new Error(`Certification bundle entry is not a regular file: ${relativePath}`);
    }
    files.push({ sourcePath, relativePath });
  }
  return files;
}

export async function installReleaseCertification(options) {
  const workspaceRoot = await realpath(resolve(options.workspaceRoot ?? process.cwd()));
  const sourcePath = resolve(workspaceRoot, options.sourceDirectory ?? "");
  const destinationPath = resolve(workspaceRoot, options.destinationDirectory ?? "");
  if (!pathInside(workspaceRoot, sourcePath) || !pathInside(workspaceRoot, destinationPath)) {
    throw new Error("Certification source and destination must remain inside the workspace");
  }

  const sourceStat = await lstat(sourcePath);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error("Certification source must be a regular directory, not a symbolic link");
  }
  const sourceRoot = await realpath(sourcePath);
  if (!pathInside(workspaceRoot, sourceRoot)) {
    throw new Error("Certification source resolves outside the workspace");
  }
  await mkdir(destinationPath, { recursive: true });
  const destinationRoot = await realpath(destinationPath);
  if (!pathInside(workspaceRoot, destinationRoot)) {
    throw new Error("Certification destination resolves outside the workspace");
  }
  const sourceFiles = await collectSourceFiles(sourceRoot);
  if (sourceFiles.length === 0) throw new Error("Certification bundle contains no evidence files");

  const pendingCopies = [];
  for (const sourceFile of sourceFiles) {
    const firstSegment = sourceFile.relativePath.split("/")[0];
    if (reservedFiles.has(sourceFile.relativePath) || reservedDirectories.has(firstSegment)) {
      throw new Error(
        `Certification bundle may not replace trusted workflow evidence: ${sourceFile.relativePath}`,
      );
    }
    const destinationFile = resolve(destinationRoot, sourceFile.relativePath);
    if (!pathInside(destinationRoot, destinationFile)) {
      throw new Error(`Certification bundle path escapes its destination: ${sourceFile.relativePath}`);
    }
    try {
      await lstat(destinationFile);
      throw new Error(`Certification bundle collides with accepted evidence: ${sourceFile.relativePath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    pendingCopies.push({ ...sourceFile, destinationFile });
  }

  for (const pending of pendingCopies) {
    await mkdir(dirname(pending.destinationFile), { recursive: true });
    await copyFile(pending.sourcePath, pending.destinationFile, constants.COPYFILE_EXCL);
  }

  return pendingCopies.map((entry) => entry.relativePath);
}

function parseArguments(argv) {
  const result = {};
  for (const argument of argv) {
    if (argument.startsWith("--source=")) result.sourceDirectory = argument.slice("--source=".length);
    else if (argument.startsWith("--destination=")) {
      result.destinationDirectory = argument.slice("--destination=".length);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

async function main() {
  const installed = await installReleaseCertification(parseArguments(process.argv.slice(2)));
  console.info(`RELEASE_CERTIFICATION_INSTALLED ${JSON.stringify({ files: installed })}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
