import type { Club, Player } from "@/engine/core/types";

/** Fund a playable eleven first, then reserve for an 18-player first-team squad.
 * This is a conservative £500/week per vacant place, matching the contract
 * baseline floor. Existing contracts are commitments, never rewritten here.
 */
export function canFundSquadCompletion(remainingWeeklyHeadroom: number, filledPlaces: number, proposedWeeklyWage: number, goalkeeperNeed?: "fill" | "reserve", emergencyVacancies?: number, candidateAge?: number): boolean {
  // Only a senior player who fills a playing vacancy can use the emergency
  // allowance. Academy recruitment and surplus keepers retain the bench reserve.
  const reserve = (emergencyVacancies ?? Math.max(0, 18 - filledPlaces)) * 500;
  if (!Number.isFinite(remainingWeeklyHeadroom) || remainingWeeklyHeadroom < 0) return false;
  // Cheap outfield depth must not spend the last specialist recruitment funds.
  if (goalkeeperNeed === "reserve" && remainingWeeklyHeadroom < 1_000) return false;
  if (goalkeeperNeed === "fill" && proposedWeeklyWage <= 1_000) return true;
  // A club already short of the reserve must still be able to add minimum-cost
  // depth. Allow the £500 baseline plus a modest negotiation premium; otherwise
  // a legacy expensive contract could freeze every affordable squad repair.
  return (candidateAge !== undefined && candidateAge >= 18 && proposedWeeklyWage <= 600)
    || remainingWeeklyHeadroom >= reserve;
}

/** Keep a specialist allowance while the first team has no goalkeeper. */
export function getGoalkeeperRecruitmentNeed(
  candidate: Pick<Player, "position" | "age">,
  club: Pick<Club, "playerIds">,
  players: Record<string, Player>,
): "fill" | "reserve" | undefined {
  const hasKeeper = club.playerIds.some(id => players[id]?.position === "GK" && players[id].age >= 16);
  if (hasKeeper) return undefined;
  return candidate.position === "GK" && candidate.age >= 16 ? "fill" : "reserve";
}

/** One goalkeeper and ten outfield players make an eleven. Extra keepers do
 * not cover outfield vacancies. A candidate already listed is counted once.
 */
export function getEmergencySquadVacancies(
  candidate: Pick<Player, "id" | "position" | "age">,
  club: Pick<Club, "playerIds">,
  players: Record<string, Player>,
): number | undefined {
  if (candidate.age < 18 || !candidate.position) return undefined;
  const others = [...new Set(club.playerIds)].filter(id => id !== candidate.id)
    .map(id => players[id]).filter(p => p && p.age >= 16 && p.position);
  const keepers = others.filter(p => p.position === "GK").length;
  const outfield = others.length - keepers;
  if (candidate.position === "GK" ? keepers > 0 : outfield >= 10) return undefined;
  if (outfield >= 10 && keepers > 0) return undefined;
  const afterOutfield = outfield + Number(candidate.position !== "GK");
  const afterKeepers = keepers + Number(candidate.position === "GK");
  return Math.max(0, 10 - afterOutfield) + Number(afterKeepers === 0);
}
