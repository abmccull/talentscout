import type { GameState, Player } from "@/engine/core/types";

/** External diagnostic evidence only; never changes the simulation or its RNG. */
export function collectWorldRosterGaps(state: Pick<GameState, "clubs" | "players">) {
  return Object.values(state.clubs).flatMap((club) => {
    const players = [...new Set(club.playerIds)].map(id => state.players[id])
      .filter((player): player is Player => Boolean(player) && player.clubId === club.id);
    const goalkeepers = players.filter(player => player.position === "GK").length;
    const outfieldPlayers = players.length - goalkeepers;
    if (goalkeepers > 0 && outfieldPlayers >= 10) return [];
    return [{ club, goalkeepers, outfieldPlayers, players }];
  });
}

export function measureWorldRosterHealth(state: Pick<GameState, "clubs" | "players" | "freeAgentPool">) {
  const squads = Object.values(state.clubs).map((club) =>
    [...new Set(club.playerIds)].map((id) => state.players[id])
      .filter((player): player is Player => Boolean(player) && player.clubId === club.id),
  );
  const activePlayers = Object.keys(state.players).length;
  const freeAgents = (state.freeAgentPool?.agents ?? []).filter((agent) =>
    agent.status === "available" || agent.status === "inNegotiation",
  ).length;
  return {
    activePlayers,
    freeAgents,
    freeAgentRatio: freeAgents / Math.max(1, activePlayers),
    clubsBelowTenOutfieldPlayers: squads.filter(players => players.filter(player => player.position !== "GK").length < 10).length,
    clubsBelowElevenSeniors: squads.filter((players) => players.length < 11).length,
    clubsWithoutSeniorGoalkeeper: squads.filter((players) => !players.some((player) => player.position === "GK")).length,
  };
}
