import type { Club, DisciplinaryRecord, Player } from "@/engine/core/types";

/** Registered academy cover fills unavailable senior places; injury never grants eligibility. */
export function getEligibleMatchRoster(
  club: Club,
  players: Record<string, Player>,
  discipline: Readonly<Record<string, DisciplinaryRecord>> = {},
): Player[] {
  const eligible = (ids: readonly string[]) => [...new Set(ids)]
    .map((id) => players[id])
    .filter((player): player is Player => Boolean(player)
      && player.clubId === club.id && !player.injured
      && (discipline[player.id]?.suspensionWeeksRemaining ?? 0) <= 0);
  const seniors = eligible([...club.playerIds, ...(club.loanedInPlayerIds ?? [])]);
  const needsCover = seniors.length < 11;
  const needsKeeper = !seniors.some((player) => player.position === "GK");
  if (!needsCover && !needsKeeper) return seniors;
  const selected = new Set(seniors.map((player) => player.id));
  const academy = eligible(club.academyPlayerIds ?? []).filter((player) =>
    !selected.has(player.id) && (needsCover || player.position === "GK"));
  return [...seniors, ...academy];
}
