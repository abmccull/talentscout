import type { GameState, Player } from "@/engine/core/types";
import { getSeasonBirthYear } from "@/engine/core/seasonDate";

/**
 * Repair generated birthday years from the active season-age authority. Retired
 * records are historical snapshots, so the current season cannot date them.
 * No age, birthday day/month, or historical event is invented by this repair.
 */
export function migratePlayerChronology(state: GameState): GameState {
  if (!Number.isInteger(state.currentSeason) || state.currentSeason < 1) return state;

  const repair = (player: Player): Player => {
    if (!Number.isInteger(player.age) || player.age < 0 || !player.dateOfBirth) return player;
    const year = getSeasonBirthYear(player.age, state.currentSeason);
    return player.dateOfBirth.year === year
      ? player
      : { ...player, dateOfBirth: { ...player.dateOfBirth, year } };
  };

  let players = state.players;
  for (const [id, player] of Object.entries(state.players ?? {})) {
    const repaired = repair(player);
    if (repaired === player) continue;
    if (players === state.players) players = { ...players };
    players[id] = repaired;
  }

  let unsignedYouth = state.unsignedYouth;
  for (const [id, youth] of Object.entries(state.unsignedYouth ?? {})) {
    if (youth.retired) continue;
    // A placed youth's pool copy is a snapshot, not a second living player.
    if (youth.placed) continue;
    const player = repair(youth.player);
    if (player === youth.player) continue;
    if (unsignedYouth === state.unsignedYouth) unsignedYouth = { ...unsignedYouth };
    unsignedYouth[id] = { ...youth, player };
  }

  return players === state.players && unsignedYouth === state.unsignedYouth
    ? state
    : { ...state, players, unsignedYouth };
}
