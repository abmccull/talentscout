import { AGE_CHECKPOINTS, type CatalogEntry, type PortraitCatalog, type PortraitPack } from "./types";
import { isVisualDNA } from "./identity";
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(label + ": unsupported metadata");
}
export function validatePortraitPack(raw: unknown): PortraitPack {
  if (!object(raw)) throw new Error("Portrait pack must be an object");
  exactKeys(raw, ["schemaVersion", "packId", "artDirectionVersion", "reviewed", "lineages"], "pack");
  if (raw.schemaVersion !== 1 || raw.artDirectionVersion !== "documentary-v1" || raw.reviewed !== true
    || typeof raw.packId !== "string" || !ID.test(raw.packId)
    || !Array.isArray(raw.lineages) || raw.lineages.length < 1 || raw.lineages.length > 2048) {
    throw new Error("Unsupported or unreviewed portrait pack");
  }
  const lineages = new Set<string>();
  const canonicalFaces = new Set<string>();
  const imageHashes = new Set<string>();
  for (const unknownLineage of raw.lineages) {
    if (!object(unknownLineage)) throw new Error("Invalid lineage");
    const lineage = unknownLineage;
    exactKeys(lineage, ["lineageId", "revision", "canonicalFaceSha256", "anchors", "targetIdentityId", "targetSeed", "provenance", "assets"], "lineage");
    if (typeof lineage.lineageId !== "string" || !ID.test(lineage.lineageId)
      || !Number.isInteger(lineage.revision) || (lineage.revision as number) < 1
      || typeof lineage.canonicalFaceSha256 !== "string" || !SHA256.test(lineage.canonicalFaceSha256)
      || !isVisualDNA(lineage.anchors) || !Array.isArray(lineage.assets) || lineage.assets.length !== AGE_CHECKPOINTS.length
      || !["authored-catalog", "identity-generated"].includes(lineage.provenance as string)) throw new Error("Invalid lineage metadata");
    if (lineages.has(lineage.lineageId) || canonicalFaces.has(lineage.canonicalFaceSha256)) throw new Error("Duplicate person in pack");
    lineages.add(lineage.lineageId);
    canonicalFaces.add(lineage.canonicalFaceSha256);
    if (lineage.provenance === "identity-generated") {
      if (typeof lineage.targetIdentityId !== "string" || !lineage.targetIdentityId.startsWith("person:v1:")
        || lineage.targetSeed !== "face:v1:" + lineage.targetIdentityId.slice("person:v1:".length)) throw new Error("Generated lineage must target an exact identity and seed");
    } else if (lineage.targetIdentityId !== undefined || lineage.targetSeed !== undefined) {
      throw new Error("Catalog lineage cannot claim a generated target");
    }
    const ages = new Set<number>();
    for (const unknownAsset of lineage.assets) {
      if (!object(unknownAsset)) throw new Error("Invalid portrait asset");
      const asset = unknownAsset;
      exactKeys(asset, ["age", "path", "sha256", "width", "height"], "asset");
      if (!(AGE_CHECKPOINTS as readonly unknown[]).includes(asset.age) || ages.has(asset.age as number)
        || typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256) || imageHashes.has(asset.sha256)
        || !Number.isInteger(asset.width) || !Number.isInteger(asset.height)
        || (asset.width as number) < 128 || (asset.height as number) < 128
        || (asset.width as number) > 2048 || (asset.height as number) > 2048) throw new Error("Invalid, repeated or incomplete age asset");
      const prefix = "/images/portraits/" + raw.packId + "/" + lineage.lineageId + "/age-" + asset.age;
      if (typeof asset.path !== "string" || ![".webp", ".avif", ".png", ".jpg"].some((extension) => asset.path === prefix + extension)) {
        throw new Error("Portrait paths must use exact local versioned pack paths");
      }
      ages.add(asset.age as number);
      imageHashes.add(asset.sha256);
    }
  }
  // Return detached trusted data so a caller cannot mutate the source after validation.
  return structuredClone(raw) as unknown as PortraitPack;
}
export function createPortraitCatalog(rawPacks: readonly unknown[]): PortraitCatalog {
  const catalog = new Map<string, CatalogEntry>();
  const canonicalFaces = new Map<string, string>();
  for (const raw of rawPacks) {
    const pack = validatePortraitPack(raw);
    for (const lineage of pack.lineages) {
      const entry = { ...lineage, packId: pack.packId };
      const existing = catalog.get(lineage.lineageId);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(entry)) throw new Error("A published lineage cannot be replaced");
        continue;
      }
      if (canonicalFaces.has(lineage.canonicalFaceSha256)) throw new Error("Same canonical face appears under multiple lineages");
      catalog.set(lineage.lineageId, entry);
      canonicalFaces.set(lineage.canonicalFaceSha256, lineage.lineageId);
    }
  }
  return catalog;
}

