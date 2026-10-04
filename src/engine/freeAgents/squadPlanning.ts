import type { Club, FreeAgent, Player } from "@/engine/core/types";
import { ALL_POSITIONS } from "@/engine/core/types/player";

type RegisteredClub = Pick<Club, "playerIds"> & Partial<Pick<Club, "id">>;
type ProposedCover = Pick<Player, "id" | "position" | "age">;
const positions = new Set<string>(ALL_POSITIONS);

function registeredCover(club: RegisteredClub, players: Record<string, Player>, proposed?: ProposedCover, proposedSeniorRegistration = false) {
  let keepers = 0, outfield = 0;
  for (const id of new Set(club.playerIds)) {
    const player = players[id];
    if (id === proposed?.id || !player || player.age < 16 || !positions.has(player.position)
      || (club.id !== undefined && player.clubId !== club.id)) continue;
    if (player.position === "GK") keepers++; else outfield++;
  }
  if (proposed && proposed.age >= (proposedSeniorRegistration ? 16 : 18) && positions.has(proposed.position)) {
    if (proposed.position === "GK") keepers++; else outfield++;
  }
  return { keepers, outfield };
}

export interface PlayingSquadQuoteIndex {
  readonly byPlayerId: ReadonlyMap<string, FreeAgent>;
  readonly keepers: readonly FreeAgent[];
  readonly outfield: readonly FreeAgent[];
}

/** Prepare the canonical first stored quote once, without finance or RNG.
 * A duplicate ID cannot price two roles or replace the first recorded demand.
 * Callers discard this index when the pool changes outside their own phase.
 */
export function buildPlayingSquadQuoteIndex(agents: readonly FreeAgent[], players: Record<string, Player>): PlayingSquadQuoteIndex {
  const seen = new Set<string>();
  const byPlayerId = new Map<string, FreeAgent>();
  const keepers: FreeAgent[] = [], outfield: FreeAgent[] = [];
  for (const agent of agents) {
    if (seen.has(agent.playerId)) continue;
    seen.add(agent.playerId);
    const player = players[agent.playerId];
    if (agent.status !== "available" || !player || player.age < 18 || !positions.has(player.position)
      || player.clubId || player.contractClubId || player.loanParentClubId || player.onLoan
      || !Number.isFinite(player.currentAbility) || !Number.isFinite(agent.wageExpectation) || agent.wageExpectation < 0
      || !Number.isFinite(agent.signingBonusExpectation) || agent.signingBonusExpectation < 0) continue;
    byPlayerId.set(agent.playerId, agent);
    (player.position === "GK" ? keepers : outfield).push(agent);
  }
  const order = (a: FreeAgent, b: FreeAgent) => a.wageExpectation - b.wageExpectation || a.playerId.localeCompare(b.playerId);
  return { byPlayerId, keepers: keepers.sort(order), outfield: outfield.sort(order) };
}

/** Price only unresolved playing roles above current actual commitments.
 * Current registrations and accepted ownership are authoritative; a proposal
 * covers its own role but cannot also supply another quote. Market prices are
 * estimates of capacity, never proof of interest, cash affordability or consent.
 * Under-18 proposals need their actual route to register them in the first team.
 */
export function getPlayingSquadWeeklyReserve(
  club: Pick<Club, "id" | "playerIds" | "reputation">,
  players: Record<string, Player>, quotes?: PlayingSquadQuoteIndex,
  proposed?: ProposedCover, unavailable: ReadonlySet<string> = new Set(), proposedSeniorRegistration = false,
): number {
  const cover = registeredCover(club, players, proposed, proposedSeniorRegistration);
  const price = (supply: readonly FreeAgent[], needed: number, fallback: number) => {
    let amount = 0, filled = 0;
    for (const agent of supply) {
      if (filled >= needed) break;
      const player = players[agent.playerId];
      if (agent.playerId === proposed?.id || unavailable.has(agent.playerId) || agent.releasedFrom === club.id
        || !player || player.clubId || player.contractClubId || player.loanParentClubId || player.onLoan
        || player.age < 18 || Math.abs(club.reputation - player.currentAbility / 2) > 25) continue;
      amount += Math.max(fallback, Math.round(agent.wageExpectation));
      filled++;
    }
    return amount + (needed - filled) * fallback;
  };
  return price(quotes?.keepers ?? [], Number(cover.keepers === 0), 1_000)
    + price(quotes?.outfield ?? [], Math.max(0, 10 - cover.outfield), 500);
}

/** Fund a playable eleven first, then reserve for an 18-player first-team squad.
 * This is a conservative £500/week per vacant place, matching the contract
 * baseline floor. Existing contracts are commitments, never rewritten here.
 */
export function canFundSquadCompletion(remainingWeeklyHeadroom: number, filledPlaces: number, proposedWeeklyWage: number, goalkeeperNeed?: "fill" | "reserve", emergencyVacancies?: number, candidateAge?: number, playingWeeklyReserve?: number): boolean {
  // Only a senior player who fills a playing vacancy can use the emergency
  // allowance. Academy recruitment and surplus keepers retain the bench reserve.
  const reserve = (emergencyVacancies ?? Math.max(0, 18 - filledPlaces)) * 500;
  if (!Number.isFinite(remainingWeeklyHeadroom) || remainingWeeklyHeadroom < 0) return false;
  if (playingWeeklyReserve !== undefined) {
    if (!Number.isFinite(playingWeeklyReserve) || remainingWeeklyHeadroom < playingWeeklyReserve) return false;
    if (emergencyVacancies !== undefined) return true;
  }
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
  club: RegisteredClub,
  players: Record<string, Player>,
): "fill" | "reserve" | undefined {
  const hasKeeper = registeredCover(club, players).keepers > 0;
  if (hasKeeper) return undefined;
  return candidate.position === "GK" && candidate.age >= 16 ? "fill" : "reserve";
}

/** One goalkeeper and ten outfield players make an eleven. Extra keepers do
 * not cover outfield vacancies. A candidate already listed is counted once.
 */
export function getEmergencySquadVacancies(
  candidate: Pick<Player, "id" | "position" | "age">,
  club: RegisteredClub,
  players: Record<string, Player>,
  proposedSeniorRegistration = false,
): number | undefined {
  if (candidate.age < (proposedSeniorRegistration ? 16 : 18) || !candidate.position) return undefined;
  const { keepers, outfield } = registeredCover(club, players, { ...candidate, age: 0 });
  if (candidate.position === "GK" ? keepers > 0 : outfield >= 10) return undefined;
  if (outfield >= 10 && keepers > 0) return undefined;
  const afterOutfield = outfield + Number(candidate.position !== "GK");
  const afterKeepers = keepers + Number(candidate.position === "GK");
  return Math.max(0, 10 - afterOutfield) + Number(afterKeepers === 0);
}
