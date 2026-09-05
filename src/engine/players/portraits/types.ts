export const AGE_CHECKPOINTS = [15, 18, 22, 27, 31, 35, 39, 45] as const;
export type PortraitAge = (typeof AGE_CHECKPOINTS)[number];
export const DNA_OPTIONS = {
  skinTone: ["veryLight", "light", "medium", "tan", "brown", "deep"],
  faceShape: ["oval", "round", "square", "oblong", "heart"],
  eyeShape: ["almond", "hooded", "round", "deepSet"],
  eyeColor: ["darkBrown", "brown", "hazel", "green", "blue"],
  noseStructure: ["straight", "softBridge", "broad", "narrow"],
  mouthStructure: ["balanced", "full", "narrow"],
  jawStructure: ["soft", "angular", "broad", "tapered"],
  hairColor: ["black", "darkBrown", "brown", "auburn", "darkBlond", "blond"],
  hairTexture: ["straight", "wavy", "curly", "coily"],
  baselineHairline: ["even", "high", "low"],
  facialHairTendency: ["light", "medium", "dense"],
  build: ["lean", "average", "broad"],
  distinctiveFeature: ["none", "freckles", "browScar", "dimple"],
  cameraAngle: ["front", "slightLeft", "slightRight"],
} as const;
export type VisualDNA = {
  [K in keyof typeof DNA_OPTIONS]: (typeof DNA_OPTIONS)[K][number];
};
export interface PlayerVisualIdentity {
  version: 1;
  identityId: string;
  seed: string;
  /** Pending generation DNA is derived from this pinned-version seed, not duplicated 8,000 times. */
}
export interface PortraitPlayer { id: string; age: number; firstName?: string; lastName?: string; visualIdentity?: PlayerVisualIdentity }
export interface GameDate { season: number; week: number }
export type VisibilityReason = "opening" | "observed" | "selected" | "tracked" | "report" | "history" | "legacy";
export interface PortraitImage {
  age: PortraitAge;
  path: string;
  width: number;
  height: number;
}
/** Delivery-file integrity belongs to the full offline production manifest. */
export interface PortraitAsset extends PortraitImage {
  sha256: string;
}
export interface PortraitLineage {
  lineageId: string;
  revision: number;
  /** Original canonical reference hash, stable across age sets and future packs. */
  canonicalFaceSha256: string;
  /** Structured reviewed anchors, never arbitrary prompt text. */
  anchors: VisualDNA;
  /** Optional exact target for an exported generation request. */
  targetIdentityId?: string;
  targetSeed?: string;
  provenance: "authored-catalog" | "identity-generated";
  assets: PortraitAsset[];
}
export interface PortraitPack {
  schemaVersion: 1;
  packId: string;
  artDirectionVersion: "documentary-v1";
  reviewed: true;
  lineages: PortraitLineage[];
}
export interface CatalogEntry extends Omit<PortraitLineage, "assets"> {
  packId: string;
  assets: PortraitImage[];
  /** Art review may retire new allocation while preserving existing saved faces. */
  allocationAllowed?: boolean;
}
export type PortraitCatalog = ReadonlyMap<string, CatalogEntry>;
export interface PortraitBinding {
  lineageId: string;
  packId: string;
  revision: number;
  canonicalFaceSha256: string;
  provenance: "catalog-adopted" | "identity-generated";
  /** Authoritative, immutable photographic anchors adopted before the first face is shown. */
  anchors: VisualDNA;
}
export interface PortraitReservation {
  identity: PlayerVisualIdentity;
  playerId: string;
  /** The named person remains identifiable after full football records are pruned. */
  displayName?: string;
  firstSeen: GameDate;
  firstSeenAge?: number;
  reason: VisibilityReason;
  binding?: PortraitBinding;
}
export interface PlayerPortraitState {
  version: 1;
  /** Identity snapshots outlive pruned Player records and are never recycled. */
  reservations: Record<string, PortraitReservation>;
  /** Keys are full canonical reference hashes; no hash-modulo mapping. */
  faceOwners: Record<string, string>;
}
export interface PortraitWorld {
  players: Record<string, PortraitPlayer>;
  unsignedYouth?: Record<string, { player: PortraitPlayer; discoveredBy?: string[] }>;
  retiredPlayers?: Record<string, PortraitPlayer>;
  playerPortraits?: PlayerPortraitState;
}
export type PortraitResolution =
  | { status: "available"; identityId: string; checkpoint: PortraitAge; binding: PortraitBinding; asset: PortraitImage }
  | { status: "fallback"; identityId: string; checkpoint: PortraitAge; reason: "awaiting-pack" | "pack-unavailable" | "age-unavailable" };
