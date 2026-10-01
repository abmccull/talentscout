import type { GameState } from "@/engine/core/types";

/** Planning only: the lifecycle resolver still owns the actual transactions. */
export function projectSeasonEndRecruitmentState(
  state: GameState,
  departingPlayerIds: ReadonlySet<string>,
  renewals: readonly { playerId: string; clubId: string; contractLength: number; wage: number }[],
): GameState {
  const players = { ...state.players };
  for (const id of departingPlayerIds) delete players[id];
  for (const renewal of renewals) {
    const player = players[renewal.playerId];
    if (!player) continue;
    players[player.id] = { ...player, wage: renewal.wage,
      contractExpiry: state.currentSeason + renewal.contractLength };
  }
  const clubs = Object.fromEntries(Object.entries(state.clubs).map(([id, club]) => [id, {
    ...club,
    playerIds: club.playerIds.filter(id => !departingPlayerIds.has(id)),
    academyPlayerIds: club.academyPlayerIds?.filter(id => !departingPlayerIds.has(id)),
    loanedOutPlayerIds: club.loanedOutPlayerIds?.filter(id => !departingPlayerIds.has(id)),
    loanedInPlayerIds: club.loanedInPlayerIds?.filter(id => !departingPlayerIds.has(id)),
  }]));
  return { ...state, players, clubs };
}
