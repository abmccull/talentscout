/** Offline authoring/import verification only. Never export from the client barrel. */
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { validatePortraitPack } from "../catalog";
import type { PortraitAsset } from "../types";

function contained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path);
}

async function verifiedFile(root: string, declaredPath: string): Promise<Buffer> {
  const path = resolve(root, declaredPath);
  if (!contained(root, path)) throw new Error("Portrait asset escapes the declared directory");
  const actual = await realpath(path);
  if (!contained(root, actual)) throw new Error("Portrait symlink escapes the declared directory");
  const metadata = await stat(actual);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > 10_000_000) throw new Error("Invalid portrait asset size");
  return readFile(actual);
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export async function verifyPortraitPackFiles(rawPack: unknown, publicDirectory: string): Promise<{
  packId: string;
  people: number;
  images: number;
  bytes: number;
  files: (PortraitAsset & { bytes: number })[];
}> {
  const pack = validatePortraitPack(rawPack);
  const root = await realpath(publicDirectory);
  if (!(await stat(root)).isDirectory()) throw new Error("Portrait public root is not a directory");
  const files: (PortraitAsset & { bytes: number })[] = [];
  for (const lineage of pack.lineages) {
    for (const asset of lineage.assets) {
      const bytes = await verifiedFile(root, "." + asset.path);
      if (sha256(bytes) !== asset.sha256) throw new Error("Portrait hash mismatch: " + asset.path);
      const image = sharp(bytes, { limitInputPixels: 2048 * 2048, failOn: "warning" });
      const metadata = await image.metadata();
      if (metadata.width !== asset.width || metadata.height !== asset.height) throw new Error("Portrait dimension mismatch: " + asset.path);
      const expected = asset.path.endsWith(".jpg") ? "jpeg" : asset.path.split(".").at(-1);
      // Sharp identifies AVIF as the HEIF container format.
      if (metadata.format !== expected && !(expected === "avif" && metadata.format === "heif")) throw new Error("Portrait encoding mismatch: " + asset.path);
      const decoded = await image.raw().toBuffer({ resolveWithObject: true });
      if (decoded.info.width !== asset.width || decoded.info.height !== asset.height) throw new Error("Portrait decode mismatch: " + asset.path);
      files.push({ ...asset, bytes: bytes.length });
    }
  }
  return { packId: pack.packId, people: pack.lineages.length, images: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
}

export async function verifyPortraitSourceReferences(rawPack: unknown, sourceDirectory: string): Promise<number> {
  const pack = validatePortraitPack(rawPack);
  const root = await realpath(sourceDirectory);
  let count = 0;
  for (const lineage of pack.lineages) {
    const source = await verifiedFile(root, lineage.lineageId + "/age-22.png");
    if (sha256(source) !== lineage.canonicalFaceSha256) throw new Error("Canonical face reference hash mismatch: " + lineage.lineageId);
    const image = sharp(source, { limitInputPixels: 2048 * 2048, failOn: "warning" });
    const metadata = await image.metadata();
    const expected = lineage.assets.find((asset) => asset.age === 22)!;
    if (metadata.format !== "png" || metadata.width !== expected.width || metadata.height !== expected.height) throw new Error("Canonical face reference dimension mismatch: " + lineage.lineageId);
    await image.raw().toBuffer();
    count++;
  }
  return count;
}
