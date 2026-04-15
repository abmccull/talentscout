import type { GameState, HiddenIntel, Player, UnsignedYouth } from "@/engine/core/types";

export interface ResolvedPlayerEntity {
  player: Player;
  unsignedYouth: UnsignedYouth | null;
  playerId: string;
  sourceId: string;
  isUnsignedYouth: boolean;
}

export function findUnsignedYouthByPlayerId(
  state: Pick<GameState, "unsignedYouth">,
  playerId: string,
): UnsignedYouth | null {
  return Object.values(state.unsignedYouth).find((youth) => youth.player.id === playerId) ?? null;
}

export function resolveUnsignedYouth(
  state: Pick<GameState, "unsignedYouth">,
  entityId: string,
): UnsignedYouth | null {
  return state.unsignedYouth[entityId] ?? findUnsignedYouthByPlayerId(state, entityId);
}

export function resolvePlayerEntity(
  state: Pick<GameState, "players" | "unsignedYouth">,
  entityId: string,
): ResolvedPlayerEntity | null {
  const seniorPlayer = state.players[entityId];
  if (seniorPlayer) {
    return {
      player: seniorPlayer,
      unsignedYouth: null,
      playerId: seniorPlayer.id,
      sourceId: entityId,
      isUnsignedYouth: false,
    };
  }

  const youth = resolveUnsignedYouth(state, entityId);
  if (!youth) return null;

  return {
    player: youth.player,
    unsignedYouth: youth,
    playerId: youth.player.id,
    sourceId: entityId,
    isUnsignedYouth: true,
  };
}

export function getResolvedPlayerIds(
  state: Pick<GameState, "players" | "unsignedYouth">,
  entityId: string,
): string[] {
  const resolved = resolvePlayerEntity(state, entityId);
  if (!resolved) return [entityId];

  const ids = new Set<string>([
    entityId,
    resolved.playerId,
    resolved.unsignedYouth?.id ?? "",
  ]);
  ids.delete("");
  return [...ids];
}

export function getResolvedContactIntel(
  state: Pick<GameState, "players" | "unsignedYouth" | "contactIntel">,
  entityId: string,
): HiddenIntel[] {
  const deduped = new Map<string, HiddenIntel>();

  for (const id of getResolvedPlayerIds(state, entityId)) {
    for (const intel of state.contactIntel[id] ?? []) {
      const key = `${intel.playerId}:${intel.attribute}:${intel.hint}`;
      if (!deduped.has(key)) {
        deduped.set(key, intel);
      }
    }
  }

  return [...deduped.values()];
}
