import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectories = [".next", "out"];

for (const directory of outputDirectories) {
  const target = resolve(repositoryRoot, directory);
  if (dirname(target) !== repositoryRoot) {
    throw new Error(`Refusing to clean build output outside the repository: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
  console.log(`Cleaned build output: ${target}`);
}
