import { AGE_CHECKPOINTS, DNA_OPTIONS, type PlayerVisualIdentity, type PortraitAge, type PortraitPlayer, type VisualDNA } from "./types";

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}
export function createVisualIdentity(playerId: string): PlayerVisualIdentity {
  if (!playerId || playerId.length > 1024) throw new Error("A valid canonical player ID is required");
  return { version: 1, identityId: "person:v1:" + playerId, seed: "face:v1:" + playerId };
}
/** A controlled generation brief, not a claim about an unseen photographic face. */
export function pendingVisualDNA(identity: PlayerVisualIdentity): VisualDNA {
  const seed = identity.seed;
  const dna = Object.fromEntries(
    Object.entries(DNA_OPTIONS).map(([key, options]) => [
      key, options[stableHash(seed + ":" + key) % options.length],
    ]),
  ) as VisualDNA;
  return dna;
}
export function isVisualDNA(value: unknown): value is VisualDNA {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === Object.keys(DNA_OPTIONS).length
    && Object.entries(DNA_OPTIONS).every(([key, options]) =>
      typeof candidate[key] === "string" && (options as readonly string[]).includes(candidate[key] as string),
    );
}
export function sameDNA(left: VisualDNA, right: VisualDNA): boolean {
  return (Object.keys(DNA_OPTIONS) as (keyof VisualDNA)[]).every((key) => left[key] === right[key]);
}
export function validateVisualIdentity(value: unknown, playerId: string): PlayerVisualIdentity {
  if (!value || typeof value !== "object") throw new Error("Invalid visual identity");
  const identity = value as PlayerVisualIdentity;
  if (identity.version !== 1) throw new Error("Unsupported visual identity version");
  if (identity.identityId !== "person:v1:" + playerId || identity.seed !== "face:v1:" + playerId) {
    throw new Error("Visual identity does not match the canonical player");
  }
  return identity;
}
export function withVisualIdentity<T extends PortraitPlayer>(player: T): T & { visualIdentity: PlayerVisualIdentity } {
  const identity = player.visualIdentity === undefined
    ? createVisualIdentity(player.id)
    : validateVisualIdentity(player.visualIdentity, player.id);
  return { ...player, visualIdentity: identity };
}
export function portraitCheckpoint(age: number): PortraitAge {
  if (!Number.isFinite(age) || age < 0) throw new Error("Portrait age must be a non-negative finite number");
  let checkpoint: PortraitAge = 15;
  for (const candidate of AGE_CHECKPOINTS) if (age >= candidate) checkpoint = candidate;
  return checkpoint;
}
