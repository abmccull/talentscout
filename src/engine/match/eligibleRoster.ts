import type { Club, DisciplinaryRecord, Player } from "@/engine/core/types";

/** Competitive XI floor used by football-health preflight and attrition guards. */
export const COMPETITIVE_REGISTERED_FLOOR = 11;

/**
 * Outflow guard keeps a small buffer above the XI floor so clubs cannot drip
 * from 12 → 11 → 10 through ordinary sales and mid-season terminations.
 */
export const COMPETITIVE_ROSTER_OUTFLOW_FLOOR = COMPETITIVE_REGISTERED_FLOOR + 3;

/** Jointly registered bodies at a club (seniors, academy, and loaned-in with matching clubId). */
export function listRegisteredAtClub(
  club: Club,
  players: Record<string, Player>,
): Player[] {
  return [...new Set([
    ...club.playerIds,
    ...(club.academyPlayerIds ?? []),
    ...(club.loanedInPlayerIds ?? []),
  ])]
    .map((id) => players[id])
    .filter((player): player is Player => Boolean(player) && player.clubId === club.id);
}

export function countRegisteredAtClub(
  club: Club,
  players: Record<string, Player>,
): number {
  return listRegisteredAtClub(club, players).length;
}

export function countRegisteredKeepers(
  club: Club,
  players: Record<string, Player>,
): number {
  return listRegisteredAtClub(club, players)
    .filter((player) => player.position === "GK").length;
}

/**
 * True when removing this player would leave the club below a competitive
 * registered XI or without a registered goalkeeper.
 */
export function wouldBreachCompetitiveRosterFloor(
  club: Club,
  players: Record<string, Player>,
  removingPlayerId: string,
  minimumRegistered: number = COMPETITIVE_REGISTERED_FLOOR,
): boolean {
  const registered = listRegisteredAtClub(club, players);
  const remaining = registered.filter((player) => player.id !== removingPlayerId);
  if (remaining.length < minimumRegistered) return true;
  const keepers = remaining.filter((player) => player.position === "GK").length;
  return keepers === 0 && registered.some((player) => player.id === removingPlayerId && player.position === "GK");
}

/** Seller / mid-season outflow guard with buffer above the hard XI floor. */
export function wouldBreachCompetitiveOutflowGuard(
  club: Club,
  players: Record<string, Player>,
  removingPlayerId: string,
): boolean {
  return wouldBreachCompetitiveRosterFloor(
    club,
    players,
    removingPlayerId,
    COMPETITIVE_ROSTER_OUTFLOW_FLOOR,
  );
}

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
  const needsCover = seniors.length < COMPETITIVE_REGISTERED_FLOOR;
  const needsKeeper = !seniors.some((player) => player.position === "GK");
  if (!needsCover && !needsKeeper) return seniors;
  const selected = new Set(seniors.map((player) => player.id));
  const academy = eligible(club.academyPlayerIds ?? []).filter((player) =>
    !selected.has(player.id) && (needsCover || player.position === "GK"));
  return [...seniors, ...academy];
}
