import type { Club, GameState, InboxMessage, Player } from "@/engine/core/types";

/** Announce actual academy-to-senior registration changes for known players.
 * This records an opportunity, not an appearance or a successful performance.
 */
export function buildAcademyPromotionNews(
  state: Pick<GameState, "observations" | "reports" | "watchlist" | "inbox">,
  before: Record<string, Club>, after: Record<string, Club>, players: Record<string, Player>,
  week: number, season: number,
): InboxMessage[] {
  const known = new Set([...(state.watchlist ?? []),
    ...Object.values(state.observations ?? {}).map(row => row.playerId),
    ...Object.values(state.reports ?? {}).map(row => row.playerId)]);
  const existing = new Set((state.inbox ?? []).map(message => message.id));
  const messages: InboxMessage[] = [];
  for (const club of Object.values(after)) {
    const old = before[club.id];
    if (!old) continue;
    const academy = new Set(old.academyPlayerIds ?? []), senior = new Set(old.playerIds);
    for (const playerId of new Set(club.playerIds)) {
      const player = players[playerId];
      if (!known.has(playerId) || !academy.has(playerId) || senior.has(playerId)
        || !player || player.clubId !== club.id) continue;
      const id = `academy-senior:${club.id}:${playerId}:s${season}`;
      if (existing.has(id)) continue;
      existing.add(id);
      messages.push({ id, week, season, type: "news", title: `${player.firstName} ${player.lastName}: first-team opportunity`,
        body: `${player.firstName} ${player.lastName} has moved from ${club.name}'s academy into its senior squad. Check whether he earns minutes and how he handles the higher level.`,
        read: false, actionRequired: false, relatedId: playerId, relatedEntityType: "player" });
    }
  }
  return messages;
}
