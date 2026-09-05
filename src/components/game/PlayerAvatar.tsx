"use client";

import { useGameStore } from "@/stores/gameStore";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { resolvePortrait } from "@/engine/players/portraits/allocation";
import { bundledPortraitCatalog } from "@/engine/players/portraits/bundledCatalog";
import { PlayerPortraitFrame } from "./PlayerPortraitFrame";

export interface PlayerAvatarProps {
  playerId: string;
  size?: number;
  /** Kept for call-site compatibility; nationality never determines appearance. */
  nationality?: string;
  age?: number;
  /** Explicit historical view; does not change the current player's age. */
  atAge?: number;
  className?: string;
  alt?: string;
}

export function PlayerAvatar({ playerId, size = 48, age, atAge, className, alt }: PlayerAvatarProps) {
  const player = useGameStore((state) => state.gameState
    ? resolvePlayerEntity(state.gameState, playerId)?.player
    : undefined);
  const ledger = useGameStore((state) => state.gameState?.playerPortraits);
  const canonicalId = player?.id ?? playerId;
  const reservation = ledger?.reservations["person:v1:" + canonicalId];
  const identity = player?.visualIdentity ?? reservation?.identity;
  const displayAge = atAge ?? age ?? player?.age ?? reservation?.firstSeenAge;
  const portrait = identity && displayAge !== undefined
    ? resolvePortrait(identity, displayAge, ledger, bundledPortraitCatalog)
    : undefined;
  const name = alt ?? (player ? `${player.firstName} ${player.lastName}` : reservation?.displayName ?? "Player");
  return <PlayerPortraitFrame portrait={portrait} size={size} name={name} className={className} />;
}

export default PlayerAvatar;
