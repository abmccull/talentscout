import type { GameState, InboxMessage } from "@/engine/core/types";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import {
  resolvePlayerMovements,
  type LifecycleResolution,
  type PlayerMovementIntent,
} from "@/engine/world/playerLifecycle";
import { createFreeAgentFromPlayer, type ContractExpiryResult } from "./expiry";

/** Resolve expiring ownership after transfers/loan returns have actually settled.
 * Offers are already decided: no new randomness or unaffordable forced renewal.
 * A returned loan can still renew; a rejected renewal must end in a release.
 */
export function settleSeasonContracts(
  initial: LifecycleResolution,
  decisions: Pick<ContractExpiryResult, "renewals" | "releasedPlayers"> | undefined,
  context: Pick<GameState, "currentWeek" | "currentSeason" | "leagues">,
  seasonLength: number,
): LifecycleResolution & { messages: InboxMessage[] } {
  let result = initial;
  const ownerOf = (player: GameState["players"][string]) =>
    player.contractClubId ?? player.loanParentClubId ?? player.clubId;
  const apply = (intents: PlayerMovementIntent[]) => {
    if (intents.length === 0) return;
    const next = resolvePlayerMovements(result.state, intents,
      context.currentWeek, context.currentSeason, seasonLength);
    result = { state: next.state, applied: [...result.applied, ...next.applied],
      rejected: [...result.rejected, ...next.rejected] };
  };

  apply((decisions?.renewals ?? []).flatMap((renewal): PlayerMovementIntent[] => {
    const player = result.state.players[renewal.playerId];
    return player && ownerOf(player) === renewal.clubId
      && player.contractExpiry <= context.currentSeason
      ? [{ ...renewal, type: "contractRenewal", reason: "Season-end renewal after movement settlement" }]
      : [];
  }));

  const pendingReleases = Object.values(result.state.players).filter((player) =>
    ownerOf(player) && result.state.clubs[ownerOf(player)]
    && Number.isInteger(player.contractExpiry) && player.contractExpiry <= context.currentSeason);
  const availableRecords = new Map((decisions?.releasedPlayers ?? []).map((agent) => [agent.playerId, agent]));
  for (const player of pendingReleases) {
    const club = result.state.clubs[ownerOf(player)];
    const country = normalizeCountryKey(context.leagues[club.leagueId]?.country)
      ?? countryKeyFromNationality(player.nationality) ?? "england";
    availableRecords.set(player.id, createFreeAgentFromPlayer(player, club, context.currentSeason, country));
  }
  apply(pendingReleases.map((player) => ({ type: "release", playerId: player.id,
    fromClubId: ownerOf(player), reason: "Contract expired without an affordable completed renewal" })));

  // Index only committed releases. A proposed release superseded by retirement
  // or a transfer must not inflate the pool or its seasonal release counter.
  const existing = new Set(result.state.freeAgentPool.agents.map((agent) => agent.playerId));
  const added = result.applied.flatMap((movement) => {
    const agent = availableRecords.get(movement.playerId);
    const player = result.state.players[movement.playerId];
    if (movement.type !== "release" || !agent || !player || ownerOf(player)
      || existing.has(player.id)) return [];
    existing.add(player.id);
    return [agent];
  });
  if (added.length > 0) result = { ...result, state: { ...result.state, freeAgentPool: {
    ...result.state.freeAgentPool,
    agents: [...result.state.freeAgentPool.agents, ...added],
    totalReleasedThisSeason: result.state.freeAgentPool.totalReleasedThisSeason + added.length,
  } } };
  const messages: InboxMessage[] = added.flatMap((agent) => {
    const player = result.state.players[agent.playerId];
    if (player.currentAbility <= 65) return [];
    return [{
      id: `contract-release:${context.currentSeason}:${context.currentWeek}:${player.id}`,
      week: context.currentWeek, season: context.currentSeason, type: "event",
      title: `${player.firstName} ${player.lastName} Released`,
      body: `${player.firstName} ${player.lastName} (${player.age}, ${player.position}) has left ${result.state.clubs[agent.releasedFrom]?.name ?? "the club"} after the contract expired and is available as a free agent.`,
      read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player",
    }];
  });
  return { ...result, messages };
}
