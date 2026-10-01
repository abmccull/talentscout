import type { LoanDeal, Player } from "@/engine/core/types";
import { gameWeeksBetweenWithSeasonLength } from "@/engine/core/gameDate";

/** Ownership contracts expire at the end of their recorded season. */
export function loanContractWeeksRemaining(
  player: Pick<Player, "contractExpiry">, week: number, season: number, seasonLength: number,
): number {
  if (![week, season, seasonLength, player.contractExpiry].every(Number.isSafeInteger)
    || seasonLength < 1 || week < 1 || week > seasonLength || season < 1 || player.contractExpiry < season) return 0;
  return gameWeeksBetweenWithSeasonLength({ week, season },
    { week: seasonLength, season: player.contractExpiry }, seasonLength);
}

export function loanFitsOwnershipContract(
  player: Pick<Player, "contractExpiry">,
  deal: Pick<LoanDeal, "startWeek" | "startSeason" | "endWeek" | "endSeason">,
  seasonLength: number,
): boolean {
  const remaining = loanContractWeeksRemaining(player, deal.startWeek, deal.startSeason, seasonLength);
  if (![deal.endWeek, deal.endSeason].every(Number.isSafeInteger)
    || deal.endWeek < 1 || deal.endWeek > seasonLength || remaining <= 0) return false;
  const duration = gameWeeksBetweenWithSeasonLength(
    { week: deal.startWeek, season: deal.startSeason }, { week: deal.endWeek, season: deal.endSeason }, seasonLength);
  return duration > 0 && duration <= remaining;
}
