import type { GameState, Player } from "@/engine/core/types";
import { bundledPortraitCatalog } from "./bundledCatalog";
import { revealPortraits } from "./allocation";
import { knownPortraitPlayerIds } from "./migration";
import { portraitDisplayName, validatePortraitState } from "./state";
import type { PortraitCatalog, VisibilityReason } from "./types";

/** Domain boundary only. A repeat view returns the original state and needs no new save. */
export function revealGamePortraits(
  state: GameState,
  entityIds: readonly string[],
  reason: VisibilityReason,
  visibleSnapshots: readonly Player[] = [],
  catalog: PortraitCatalog = bundledPortraitCatalog,
): GameState {
  if (entityIds.length === 0) return state;
  const playerIds = [...new Set(entityIds.map((entityId) =>
    state.players?.[entityId]?.id
      ?? state.retiredPlayers?.[entityId]?.id
      ?? state.unsignedYouth?.[entityId]?.player.id
      ?? entityId,
  ))];
  // Loaded/domain-owned bindings are already validated and immutable. Revisiting
  // a photographed player should not clone a lifetime of retained reservations.
  if (playerIds.every((id) => {
    const reservation = state.playerPortraits?.reservations["person:v1:" + id];
    if (!reservation?.binding) return false;
    if (reservation.displayName) return true;
    const player = state.players?.[id] ?? state.retiredPlayers?.[id]
      ?? state.unsignedYouth?.[id]?.player
      ?? Object.values(state.unsignedYouth ?? {}).find((youth) => youth.player.id === id)?.player
      ?? visibleSnapshots.find((snapshot) => snapshot.id === id);
    // A pruned legacy person cannot supply missing metadata. Do not repeatedly
    // clone the lifetime ledger trying to recover a name that is no longer saved.
    return !portraitDisplayName(player);
  })) return state;
  const next = revealPortraits(
    state, playerIds, { season: state.currentSeason, week: state.currentWeek },
    reason, catalog, visibleSnapshots,
  );
  return JSON.stringify(next.playerPortraits) === JSON.stringify(state.playerPortraits)
    ? state
    : next;
}

export function revealKnownGamePortraits(
  state: GameState,
  catalog: PortraitCatalog = bundledPortraitCatalog,
): GameState {
  return revealGamePortraits(state, knownPortraitPlayerIds(state), "observed", [], catalog);
}

/** Only the portrait ledger may have changed while a football worker was running. */
export function isPortraitOnlyStateChange(source: GameState, current: GameState | null): boolean {
  if (!current) return false;
  if (source === current) return true;
  return [...new Set([...Object.keys(source), ...Object.keys(current)])]
    .filter((key) => key !== "playerPortraits")
    .every((key) => Object.is(source[key as keyof GameState], current[key as keyof GameState]));
}

/**
 * A headless football transaction never allocates photos. Carry the latest live
 * reservations into its result, then allocate newly observed people sequentially.
 */
export function preparePortraitWeekCommit(
  simulated: GameState,
  latest: GameState,
  catalog: PortraitCatalog = bundledPortraitCatalog,
): GameState {
  if (simulated.seed !== latest.seed) throw new Error("Cannot merge portrait identities from another career");
  const preserved = {
    ...simulated,
    playerPortraits: validatePortraitState(latest.playerPortraits ?? simulated.playerPortraits),
  };
  return revealKnownGamePortraits(preserved, catalog);
}

