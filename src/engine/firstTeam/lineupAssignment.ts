import type { Player, Position } from "@/engine/core/types";

/** Maximum-weight rectangular assignment. Each player can fill one slot only.
 * Empty columns permit a genuinely missing specialist instead of a duplicate.
 * Caller supplies finite scores; zero represents an empty slot.
 */
export function assignFormationPlayers(
  slots: readonly Position[], players: readonly Player[], score: (player: Player, slot: Position) => number,
): Player[] {
  const rows = slots.length, columns = players.length + rows;
  const costs = slots.map(slot => [...players.map(player => -score(player, slot)), ...Array(rows).fill(0)]);
  const rowPotential = Array(rows + 1).fill(0), columnPotential = Array(columns + 1).fill(0);
  const matchedRow = Array(columns + 1).fill(0), previous = Array(columns + 1).fill(0);
  for (let row = 1; row <= rows; row++) {
    matchedRow[0] = row;
    let column = 0;
    const distance = Array(columns + 1).fill(Infinity), used = Array(columns + 1).fill(false);
    do {
      used[column] = true;
      const activeRow = matchedRow[column];
      let delta = Infinity, nextColumn = 0;
      for (let candidate = 1; candidate <= columns; candidate++) {
        if (used[candidate]) continue;
        const cost = costs[activeRow - 1][candidate - 1] - rowPotential[activeRow] - columnPotential[candidate];
        if (cost < distance[candidate]) { distance[candidate] = cost; previous[candidate] = column; }
        if (distance[candidate] < delta) { delta = distance[candidate]; nextColumn = candidate; }
      }
      for (let candidate = 0; candidate <= columns; candidate++) {
        if (used[candidate]) { rowPotential[matchedRow[candidate]] += delta; columnPotential[candidate] -= delta; }
        else distance[candidate] -= delta;
      }
      column = nextColumn;
    } while (matchedRow[column] !== 0);
    do {
      const predecessor = previous[column];
      matchedRow[column] = matchedRow[predecessor]; column = predecessor;
    } while (column !== 0);
  }
  const selected = new Map<number, Player>();
  for (let column = 1; column <= players.length; column++) {
    if (matchedRow[column] > 0) selected.set(matchedRow[column] - 1, players[column - 1]);
  }
  return [...selected.entries()].sort(([left], [right]) => left - right).map(([, player]) => player);
}

/** Team contribution is measured against eleven places, including vacancies.
 * A short team cannot recover full strength merely by averaging fewer players.
 */
export function calculateLineupStrength(players: readonly Pick<Player, "currentAbility">[]): number {
  return players.slice(0, 11).reduce((sum, player) => sum + player.currentAbility, 0) / 11;
}
