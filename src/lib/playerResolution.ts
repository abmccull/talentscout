import type { GameState, HiddenIntel, Player, UnsignedYouth } from "@/engine/core/types";

export interface ResolvedPlayerEntity {
  player: Player;
  unsignedYouth: UnsignedYouth | null;
  playerId: string;
  sourceId: string;
  isUnsignedYouth: boolean;
  isRetired: boolean;
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
  state: Pick<GameState, "players" | "unsignedYouth"> & {
    retiredPlayers?: Record<string, Player>;
  },
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
      isRetired: false,
    };
  }

  const retiredPlayer = state.retiredPlayers?.[entityId];
  if (retiredPlayer) {
    return {
      player: retiredPlayer,
      unsignedYouth: null,
      playerId: retiredPlayer.id,
      sourceId: entityId,
      isUnsignedYouth: false,
      isRetired: true,
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
    isRetired: false,
  };
}

export function getResolvedPlayerIds(
  state: Pick<GameState, "players" | "unsignedYouth"> & {
    retiredPlayers?: Record<string, Player>;
  },
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
  state: Pick<GameState, "players" | "unsignedYouth" | "contactIntel"> & {
    retiredPlayers?: Record<string, Player>;
  },
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
