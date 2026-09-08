import { isVisualDNA, validateVisualIdentity, withVisualIdentity } from "./identity";
import type { PlayerPortraitState, PlayerVisualIdentity, PortraitPlayer, PortraitReservation, PortraitWorld } from "./types";
export function emptyPortraitState(): PlayerPortraitState {
  return { version: 1, reservations: {}, faceOwners: {} };
}
export function portraitDisplayName(player: PortraitPlayer | undefined): string | undefined {
  const first = player?.firstName?.trim();
  const last = player?.lastName?.trim();
  if (!first || !last) return undefined;
  const name = `${first} ${last}`;
  return name.length <= 256 ? name : undefined;
}
export function canonicalPlayers(world: PortraitWorld): Map<string, PortraitPlayer> {
  const result = new Map<string, PortraitPlayer>();
  for (const youth of Object.values(world.unsignedYouth ?? {})) result.set(youth.player.id, youth.player);
  for (const player of Object.values(world.retiredPlayers ?? {})) result.set(player.id, player);
  for (const player of Object.values(world.players)) result.set(player.id, player);
  return result;
}
function identitiesFor(world: PortraitWorld, ledger: PlayerPortraitState): Map<string, PlayerVisualIdentity> {
  const candidates = new Map<string, PlayerVisualIdentity[]>();
  const add = (player: PortraitPlayer) => {
    if (player.visualIdentity === undefined) return;
    const identity = validateVisualIdentity(player.visualIdentity, player.id);
    candidates.set(player.id, [...(candidates.get(player.id) ?? []), identity]);
  };
  for (const player of canonicalPlayers(world).values()) add(player);
  for (const youth of Object.values(world.unsignedYouth ?? {})) add(youth.player);
  for (const player of Object.values(world.retiredPlayers ?? {})) add(player);
  for (const reservation of Object.values(ledger.reservations)) {
    add({ id: reservation.playerId, age: 0, visualIdentity: reservation.identity });
  }
  const result = new Map<string, PlayerVisualIdentity>();
  for (const [playerId, values] of candidates) {
    result.set(playerId, values[0]!);
  }
  return result;
}
export function validatePortraitState(raw: PlayerPortraitState | undefined): PlayerPortraitState {
  if (raw === undefined) return emptyPortraitState();
  const record = (value: unknown): boolean => Boolean(value) && typeof value === "object"
    && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  if (!record(raw) || raw.version !== 1 || !record(raw.reservations) || !record(raw.faceOwners)) throw new Error("Unsupported portrait state");
  const ledger = structuredClone(raw);
  for (const [identityId, reservation] of Object.entries(ledger.reservations)) {
    if (!record(reservation)) throw new Error("Invalid portrait reservation");
    const identity = validateVisualIdentity(reservation.identity, reservation.playerId);
    if (identityId !== identity.identityId || !Number.isInteger(reservation.firstSeen?.season)
      || reservation.firstSeen.season < 1 || !Number.isInteger(reservation.firstSeen?.week)
      || reservation.firstSeen.week < 1) throw new Error("Invalid portrait reservation");
    if (reservation.firstSeenAge !== undefined && (!Number.isFinite(reservation.firstSeenAge)
      || reservation.firstSeenAge < 0)) throw new Error("Invalid portrait first-seen age");
    if (reservation.displayName !== undefined && (typeof reservation.displayName !== "string"
      || !reservation.displayName.trim() || reservation.displayName.length > 256)) throw new Error("Invalid portrait display name");
    const binding = reservation.binding;
    if (binding) {
      if (!/^[a-f0-9]{64}$/.test(binding.canonicalFaceSha256) || !binding.lineageId
        || !binding.packId || !Number.isInteger(binding.revision) || binding.revision < 1
        || !isVisualDNA(binding.anchors)
        || !["catalog-adopted", "identity-generated"].includes(binding.provenance)) throw new Error("Invalid face binding");
      const owner = ledger.faceOwners[binding.canonicalFaceSha256];
      if (owner && owner !== identityId) throw new Error("Conflicting persisted face ownership");
      ledger.faceOwners[binding.canonicalFaceSha256] = identityId;
    }
  }
  // Tombstones may outlive a full player or reservation. Never discard them.
  for (const [hash, identityId] of Object.entries(ledger.faceOwners)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || typeof identityId !== "string" || !identityId.startsWith("person:v1:")) throw new Error("Invalid face ownership tombstone");
  }
  return ledger;
}
export function migrateVisualIdentities<T extends PortraitWorld>(world: T): T & { playerPortraits: PlayerPortraitState } {
  const ledger = validatePortraitState(world.playerPortraits);
  const known = identitiesFor(world, ledger);
  const convert = <P extends PortraitPlayer>(player: P): P => {
    const identity = known.get(player.id) ?? withVisualIdentity(player).visualIdentity;
    return { ...player, visualIdentity: identity };
  };
  return {
    ...world,
    players: Object.fromEntries(Object.entries(world.players).map(([key, player]) => [key, convert(player)])),
    retiredPlayers: Object.fromEntries(Object.entries(world.retiredPlayers ?? {}).map(([key, player]) => [key, convert(player)])),
    unsignedYouth: Object.fromEntries(Object.entries(world.unsignedYouth ?? {}).map(([key, youth]) => [key, { ...youth, player: convert(youth.player) }])),
    playerPortraits: ledger,
  };
}
export function archivedReservation(ledger: PlayerPortraitState, playerId: string): PortraitReservation | undefined {
  return ledger.reservations["person:v1:" + playerId];
}
