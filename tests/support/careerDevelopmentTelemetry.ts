import type { GameState } from "@/engine/core/types";

/** External diagnostic only. Never persisted into saves or consumed by football RNG. */
export function captureCareerDevelopmentCohort(
  state: Pick<GameState, "players" | "currentSeason" | "currentWeek">,
  previouslyTracked: ReadonlySet<string>,
) {
  const tracked = new Set(previouslyTracked);
  for (const player of Object.values(state.players)) {
    if (player.potentialAbility >= 150) tracked.add(player.id);
  }
  const ids = [...tracked].sort();
  const rows = ids.flatMap(id => {
    const player = state.players[id];
    if (!player) return [];
    return [{ id, age: player.age, clubId: player.clubId || null,
      position: player.position, ability: player.currentAbility, potential: player.potentialAbility,
      profile: player.developmentProfile, attributes: { ...player.attributes },
      injured: player.injured, injuryWeeksRemaining: player.injuryWeeksRemaining,
      form: player.form,
    }];
  });
  return {
    tracked,
    snapshot: {
      schemaVersion: 1,
      scope: "Season-boundary observations of all PA150+ players and previously tracked identities. Absence means missing from active players, not proven retirement. Club changes between boundaries omit intermediate moves. Attributes and ability are diagnostic hidden data; never display to players.",
      season: state.currentSeason, week: state.currentWeek,
      newlyTrackedIds: ids.filter(id => !previouslyTracked.has(id)),
      absentIds: ids.filter(id => !state.players[id]),
      rows,
    },
  };
}
