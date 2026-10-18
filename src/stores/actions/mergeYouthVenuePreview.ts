import type { GameState, UnsignedYouth, WeekSimulationState, YouthVenueType } from "@/engine/core/types";

type Preview = NonNullable<WeekSimulationState["youthVenueResults"]>;

/** Retain current entities; apply only effects backed by an accepted preview observation. */
export function mergeYouthVenuePreview(state: GameState, preview: Preview, completedIds: ReadonlySet<string>) {
  const accepted = Object.values(preview.newObservations).filter(o =>
    (!o.activityInstanceId || !completedIds.has(o.activityInstanceId))
    && !state.observations[o.id],
  );
  const youthByPlayer = new Map(Object.values(state.unsignedYouth).map(y => [y.player.id, y]));
  const updatedYouth: Record<string, UnsignedYouth> = { ...state.unsignedYouth };
  const applicable = accepted.filter(o => youthByPlayer.has(o.playerId));
  for (const observation of applicable) {
    const youthId = youthByPlayer.get(observation.playerId)!.id;
    const current = updatedYouth[youthId];
    const effect = preview.observationEffects?.[observation.id];
    // Legacy previews have no recoverable per-booking delta. Preserve current
    // values instead of copying a stale entity or inventing the missing reward.
    const validEffect = effect?.youthId === youthId ? effect : undefined;
    updatedYouth[youthId] = {
      ...current,
      buzzLevel: Math.min(100, current.buzzLevel + (validEffect?.buzzIncrease ?? 0)),
      visibility: Math.min(100, current.visibility + (validEffect?.visibilityIncrease ?? 0)),
      discoveredBy: [...new Set([...current.discoveredBy, observation.scoutId])],
      venueAppearances: [...new Set([...current.venueAppearances, observation.context as YouthVenueType])],
    };
  }
  const acceptedPlayers = new Set(applicable.map(o => o.playerId));
  const discoveredPlayers = new Set(state.discoveryRecords.map(d => d.playerId));
  const discoveries = preview.newDiscoveries.filter(d => {
    if (!acceptedPlayers.has(d.playerId) || discoveredPlayers.has(d.playerId)) return false;
    discoveredPlayers.add(d.playerId);
    return true;
  });
  return { observations: applicable, unsignedYouth: updatedYouth, discoveries };
}
