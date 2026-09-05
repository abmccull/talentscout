import { pendingVisualDNA, portraitCheckpoint, sameDNA, withVisualIdentity } from "./identity";
import { canonicalPlayers, portraitDisplayName, validatePortraitState } from "./state";
import type { CatalogEntry, GameDate, PlayerPortraitState, PlayerVisualIdentity, PortraitCatalog, PortraitPlayer, PortraitReservation, PortraitResolution, PortraitWorld, VisibilityReason } from "./types";
function affinity(identity: PlayerVisualIdentity, entry: CatalogEntry): number {
  const dna = pendingVisualDNA(identity);
  // Preference only. Authored catalog adoption is not exact generated DNA fidelity.
  return Number(dna.skinTone === entry.anchors.skinTone) * 8
    + Number(dna.hairTexture === entry.anchors.hairTexture) * 4
    + Number(dna.hairColor === entry.anchors.hairColor) * 2
    + Number(dna.faceShape === entry.anchors.faceShape);
}
function choose(reservation: PortraitReservation, ledger: PlayerPortraitState, catalog: PortraitCatalog): CatalogEntry | undefined {
  const identity = reservation.identity;
  return [...catalog.values()].filter((entry) => {
    if (entry.allocationAllowed === false) return false;
    if (ledger.faceOwners[entry.canonicalFaceSha256]) return false;
    if (entry.provenance === "identity-generated") {
      return entry.targetIdentityId === identity.identityId && entry.targetSeed === identity.seed
        && sameDNA(entry.anchors, pendingVisualDNA(identity));
    }
    return true;
  }).sort((left, right) => {
    const targeted = Number(right.provenance === "identity-generated") - Number(left.provenance === "identity-generated");
    return targeted || affinity(identity, right) - affinity(identity, left) || left.lineageId.localeCompare(right.lineageId);
  })[0];
}
function bind(ledger: PlayerPortraitState, reservation: PortraitReservation, catalog: PortraitCatalog): void {
  if (reservation.binding) return;
  const entry = choose(reservation, ledger, catalog);
  if (!entry) return;
  reservation.binding = {
    lineageId: entry.lineageId, packId: entry.packId, revision: entry.revision,
    canonicalFaceSha256: entry.canonicalFaceSha256,
    provenance: entry.provenance === "identity-generated" ? "identity-generated" : "catalog-adopted",
    anchors: structuredClone(entry.anchors),
  };
  ledger.faceOwners[entry.canonicalFaceSha256] = reservation.identity.identityId;
}
/** Called by domain visibility actions, never by image render or asset loading. */
export function revealPortraits<T extends PortraitWorld>(
  source: T, playerIdsInPriorityOrder: readonly string[], date: GameDate,
  reason: VisibilityReason, catalog: PortraitCatalog,
  visiblePlayerSnapshots: readonly PortraitPlayer[] = [],
): T & { playerPortraits: PlayerPortraitState } {
  if (!Number.isInteger(date.season) || date.season < 1 || !Number.isInteger(date.week) || date.week < 1) throw new Error("Invalid game date");
  const world = { ...source, playerPortraits: validatePortraitState(source.playerPortraits) };
  for (const playerId of new Set(playerIdsInPriorityOrder)) {
    const player = world.players[playerId] ?? world.retiredPlayers?.[playerId]
      ?? world.unsignedYouth?.[playerId]?.player
      ?? Object.values(world.unsignedYouth ?? {}).find((youth) => youth.player.id === playerId)?.player
      ?? visiblePlayerSnapshots.find((snapshot) => snapshot.id === playerId);
    const archived = world.playerPortraits.reservations["person:v1:" + playerId];
    const identity = player ? withVisualIdentity(player).visualIdentity : archived?.identity;
    if (!identity) continue;
    const reservation = archived ?? {
      identity: structuredClone(identity), playerId, firstSeen: { ...date }, firstSeenAge: player?.age, reason,
    };
    const displayName = portraitDisplayName(player);
    if (!reservation.displayName && displayName) {
      reservation.displayName = displayName;
    }
    world.playerPortraits.reservations[identity.identityId] = reservation;
    bind(world.playerPortraits, reservation, catalog);
  }
  return world;
}
/** Explicit offline pack installation boundary, preserving every previous binding. */
export function allocateWaitingPortraits(source: PlayerPortraitState, catalog: PortraitCatalog): PlayerPortraitState {
  const ledger = validatePortraitState(source);
  const waiting = Object.values(ledger.reservations).filter((reservation) => !reservation.binding)
    .sort((left, right) => left.firstSeen.season - right.firstSeen.season
      || left.firstSeen.week - right.firstSeen.week
      || left.identity.identityId.localeCompare(right.identity.identityId));
  for (const reservation of waiting) bind(ledger, reservation, catalog);
  return ledger;
}
export function resolvePortrait(
  identity: PlayerVisualIdentity, age: number, ledger: PlayerPortraitState | undefined, catalog: PortraitCatalog,
): PortraitResolution {
  const checkpoint = portraitCheckpoint(age);
  const binding = ledger?.reservations[identity.identityId]?.binding;
  if (!binding) return { status: "fallback", identityId: identity.identityId, checkpoint, reason: "awaiting-pack" };
  const entry = catalog.get(binding.lineageId);
  if (!entry || entry.packId !== binding.packId || entry.revision !== binding.revision
    || entry.canonicalFaceSha256 !== binding.canonicalFaceSha256 || !sameDNA(entry.anchors, binding.anchors)) {
    return { status: "fallback", identityId: identity.identityId, checkpoint, reason: "pack-unavailable" };
  }
  const asset = entry.assets.find((candidate) => candidate.age === checkpoint);
  if (!asset) return { status: "fallback", identityId: identity.identityId, checkpoint, reason: "age-unavailable" };
  return { status: "available", identityId: identity.identityId, checkpoint, binding, asset };
}
export function portraitCoverage(world: PortraitWorld): { people: number; seen: number; photographed: number; awaitingPack: number; permanentlyReservedFaces: number } {
  const reservations = Object.values(world.playerPortraits?.reservations ?? {});
  return {
    people: canonicalPlayers(world).size, seen: reservations.length,
    photographed: reservations.filter((entry) => Boolean(entry.binding)).length,
    awaitingPack: reservations.filter((entry) => !entry.binding).length,
    permanentlyReservedFaces: Object.keys(world.playerPortraits?.faceOwners ?? {}).length,
  };
}
