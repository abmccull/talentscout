import type { GameState, Player, UnsignedYouth } from "@/engine/core/types";

export type ActionableProspectState = Pick<GameState, "players" | "unsignedYouth"> &
  Partial<Pick<GameState, "scoutingCases" | "alumniRecords" | "retiredPlayers">>;

export interface ActionableProspect {
  player: Player;
  unsignedYouth?: UnsignedYouth;
  source: "unsigned" | "alumni" | "case";
}

/** One dossier follows the person through placement. Never retain a shadow youth. */
export function selectActionableProspects(state: ActionableProspectState): ActionableProspect[] {
  const prospects = new Map<string, ActionableProspect>();
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (youth.retired || youth.placed || state.retiredPlayers?.[youth.player.id]) continue;
    // A signed player is authoritative even when a migrated save retained a youth copy.
    if (state.players?.[youth.player.id]) continue;
    prospects.set(youth.player.id, { player: youth.player, unsignedYouth: youth, source: "unsigned" });
  }
  const addSigned = (id: string, source: "alumni" | "case") => {
    const player = state.players?.[id];
    if (!player || state.retiredPlayers?.[id] || prospects.has(id)) return;
    prospects.set(id, { player, source });
  };
  for (const alumni of state.alumniRecords ?? []) addSigned(alumni.playerId, "alumni");
  for (const scoutingCase of Object.values(state.scoutingCases ?? {})) {
    if (scoutingCase.status !== "closed") addSigned(scoutingCase.playerId, "case");
  }
  return [...prospects.values()];
}

export function resolveActionableProspect(state: ActionableProspectState, targetId: string): ActionableProspect | undefined {
  return selectActionableProspects(state).find(target => target.player.id === targetId || target.unsignedYouth?.id === targetId);
}
