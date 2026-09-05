import { revealPortraits } from "./allocation";
import { migrateVisualIdentities } from "./state";
import type { GameDate, PortraitCatalog, PortraitWorld } from "./types";
export interface LegacyPortraitWorld extends PortraitWorld {
  currentSeason: number; currentWeek: number;
  scout?: { id: string };
  openingCase?: { playerId?: string } | null;
  activeObservationSession?: { players: { playerId: string }[] } | null;
  watchlist?: string[];
  reports?: Record<string, { playerId: string }>;
  discoveryRecords?: { playerId: string }[];
  scoutingCases?: Record<string, { playerId: string }>;
  alumniRecords?: { playerId: string }[];
  observations?: Record<string, { playerId: string }>;
}
function sortedIds(ids: readonly (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
}
/** Priority groups are explicit; within a group imported object insertion order has no authority. */
export function knownPortraitPlayerIds(world: LegacyPortraitWorld): string[] {
  return [...new Set([
    ...(world.openingCase?.playerId ? [world.openingCase.playerId] : []),
    ...sortedIds(world.activeObservationSession?.players.map((player) => player.playerId) ?? []),
    ...sortedIds(world.watchlist ?? []),
    ...sortedIds(Object.values(world.scoutingCases ?? {}).map((scoutingCase) => scoutingCase.playerId)),
    ...sortedIds(Object.values(world.reports ?? {}).map((report) => report.playerId)),
    ...sortedIds((world.discoveryRecords ?? []).map((discovery) => discovery.playerId)),
    ...sortedIds((world.alumniRecords ?? []).map((record) => record.playerId)),
    ...sortedIds(Object.values(world.unsignedYouth ?? {})
      .filter((youth) => world.scout?.id && youth.discoveredBy?.includes(world.scout.id))
      .map((youth) => youth.player.id)),
    ...sortedIds(Object.values(world.observations ?? {}).map((observation) => observation.playerId)),
  ])];
}
export function migrateLegacyPortraits<T extends LegacyPortraitWorld>(
  world: T, catalog: PortraitCatalog,
): ReturnType<typeof migrateVisualIdentities<T>> {
  const date: GameDate = { season: world.currentSeason, week: world.currentWeek };
  return revealPortraits(migrateVisualIdentities(world), knownPortraitPlayerIds(world), date, "legacy", catalog);
}
