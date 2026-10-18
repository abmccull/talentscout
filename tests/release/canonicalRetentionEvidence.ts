import type { SaveRetentionCollectionKey } from "@/engine/world/saveRetention";

// Frozen canonical evidence keys. Supporting measurements may grow independently.
// The whole-save total still includes every GameState field, including portraits.
export const CANONICAL_RETENTION_COLLECTION_KEYS = Object.freeze([
  "players", "observations", "finances", "worldHistory", "fixtures", "matchRatings",
  "playerMovementHistory", "retiredPlayers", "retiredPlayerIds", "unsignedYouth",
] as const satisfies readonly SaveRetentionCollectionKey[]);
export type CanonicalRetentionCollectionKey = (typeof CANONICAL_RETENTION_COLLECTION_KEYS)[number];

export const CANONICAL_COLLECTION_BYTE_BUDGETS: Readonly<Record<CanonicalRetentionCollectionKey, number>> = Object.freeze({
  players: 32 * 1024 * 1024,
  observations: 12 * 1024 * 1024,
  finances: 20 * 1024 * 1024,
  worldHistory: 24 * 1024 * 1024,
  fixtures: 8 * 1024 * 1024,
  matchRatings: 8 * 1024 * 1024,
  playerMovementHistory: 8 * 1024 * 1024,
  retiredPlayers: 6 * 1024 * 1024,
  retiredPlayerIds: 512 * 1024,
  unsignedYouth: 12 * 1024 * 1024,
});

export function projectCanonicalCollectionBytes(
  collections: Readonly<Record<CanonicalRetentionCollectionKey, number>>,
): Record<CanonicalRetentionCollectionKey, number> {
  return Object.fromEntries(CANONICAL_RETENTION_COLLECTION_KEYS.map((key) => [key, collections[key]])) as Record<CanonicalRetentionCollectionKey, number>;
}
