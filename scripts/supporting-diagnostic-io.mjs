// Bounded supporting output. This module grants no canonical campaign authority.
import { open, lstat, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
const cap = 16 * 1024 * 1024;
const same = (a, b) => ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);
// Windows lstat can expose dev=0 while the descriptor reports the actual volume.
// Compare path and descriptor using the same narrow rule as release-artifact-io.
const sameFile = (path, fd) => ["ino", "mode", "nlink", "size", "mtimeNs"].every((key) => path[key] === fd[key])
  && (path.dev === fd.dev || process.platform === "win32" && path.dev === 0n);
export async function readSupportingJson(path) {
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n || named.size > BigInt(cap)) throw new Error("Supporting JSON size/type admission failed");
  const descriptor = await open(path, "r");
  try {
    const before = await descriptor.stat({ bigint: true });
    if (!sameFile(named, before) || !before.isFile() || before.size > BigInt(cap)) throw new Error("Supporting JSON descriptor admission failed");
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const result = await descriptor.read(bytes, offset, Math.min(65536, bytes.length - offset), offset);
      if (!result.bytesRead) throw new Error("Supporting JSON changed while reading");
      offset += result.bytesRead;
    }
    const overflow = await descriptor.read(Buffer.alloc(1), 0, 1, offset);
    const ended = await descriptor.stat({ bigint: true });
    const pathAfter = await lstat(path, { bigint: true });
    if (overflow.bytesRead !== 0 || !same(before, ended) || !same(named, pathAfter) || !sameFile(pathAfter, ended)) throw new Error("Supporting JSON changed while reading");
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await descriptor.close(); }
}
export async function writeSupportingJson(path, value) {
  const body = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  if (body.length > cap) throw new Error("Supporting JSON exceeds 16 MiB output limit");
  const descriptor = await open(path, "wx");
  try { await descriptor.writeFile(body); } finally { await descriptor.close(); }
  const result = await readSupportingJson(path);
  if (result.sha256 !== createHash("sha256").update(body).digest("hex")) throw new Error("Supporting JSON readback mismatch");
  return result;
}
export async function supportingOutputPath(directory, filename) {
  const root = await realpath(directory);
  if ((await lstat(directory)).isSymbolicLink() || !(await lstat(root)).isDirectory()) throw new Error("Supporting output directory must be ordinary");
  const path = resolve(root, filename);
  const part = relative(root, path);
  if (!part || part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part) || part.includes(sep)) throw new Error("Supporting output must be directly inside its owned directory");
  return path;
}
