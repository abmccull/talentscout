import type { GameState, LoanDeal } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { getSeasonLength } from "@/engine/core/gameDate";
import { assessClubAffordabilityFromContext, buildClubAffordabilityContext } from "@/engine/finance/clubEconomics";
import { calculateLoanTerms, findLoanDestination, isLoanEligible, retainsFirstTeamAfterLoan } from "@/engine/world/loans";
import { getLifecycleWorld, resolvePlayerMovements, withLifecycleWorld } from "@/engine/world/playerLifecycle";
import { canFundSquadCompletion, getEmergencySquadVacancies, getGoalkeeperRecruitmentNeed } from "./squadPlanning";
import { NPC_ACCEPTANCE_CHANCE } from "./pool";

/** A targeted opening-window approach, rather than the weekly chance to list
 * a player. Uses existing reserves to fill a playable eleven and settles each agreement before
 * another club approaches them. Rejection and an empty market remain possible. */
export function recruitOpeningSquadLoans(initial: GameState, rng: RNG): GameState {
  let state = initial;
  const vacancies = (clubId: string) => {
    const club = state.clubs[clubId];
    const squad = [...new Set(club.playerIds)].map(id => state.players[id])
      .filter(player => player?.clubId === clubId && player.age >= 16);
    return { keeper: !squad.some(player => player.position === "GK"),
      outfield: squad.filter(player => player.position !== "GK").length < 10,
      full: squad.length >= 30 };
  };
  const targets = Object.keys(state.clubs).sort().filter(id => {
    const needs = vacancies(id);
    return !needs.full && (needs.keeper || needs.outfield);
  });
  if (!targets.length) return state;
  const seasonLength = getSeasonLength(state.fixtures ?? {}, state.currentSeason);
  const reserves = Object.values(state.players).filter(p => p.age >= 18);
  const reserveIds = {
    keeper: reserves.filter(p => p.position === "GK").map(p => p.id).sort(),
    outfield: reserves.filter(p => p.position !== "GK").map(p => p.id).sort(),
  };
  for (const clubId of rng.shuffle(targets)) {
    let approaches = 0;
    // Seek each role separately so outfield candidates skipped while a keeper
    // was needed remain available afterward. Both roles share the approach cap.
    for (const role of ["keeper", "outfield"] as const) {
      if (!vacancies(clubId)[role] || approaches >= 33) continue;
      for (const id of rng.shuffle(reserveIds[role])) {
        const needs = vacancies(clubId);
        if (needs.full || !needs[role] || approaches >= 33) break;
        const player = state.players[id];
        const parent = state.clubs[player.contractClubId ?? player.loanParentClubId ?? player.clubId];
        if (!parent || parent.id === clubId
          || !isLoanEligible(player, parent, state.players, state.currentSeason, new Set(), state.currentWeek, seasonLength)
          || !retainsFirstTeamAfterLoan(player, parent, state.players)) continue;
        const club = state.clubs[clubId];
        const context = buildClubAffordabilityContext({ [clubId]: club }, state.players,
          { currentWeek: state.currentWeek, currentSeason: state.currentSeason })[clubId];
        let terms: ReturnType<typeof calculateLoanTerms> | undefined;
        const destination = findLoanDestination(player, parent, { [clubId]: club }, state.players, rng, state.leagues, () => {
          terms = calculateLoanTerms(player, parent, club, state.currentWeek, state.currentSeason, rng, seasonLength);
          const contribution = Math.round(player.wage * terms.wageContribution / 100);
          const financial = assessClubAffordabilityFromContext(context,
            { upfrontCost: terms.loanFee, weeklyObligationCommitment: contribution });
          return financial.affordable && canFundSquadCompletion(financial.remainingWeeklyHeadroom,
            new Set([...club.playerIds, id]).size, contribution, getGoalkeeperRecruitmentNeed(player, club, state.players),
            getEmergencySquadVacancies(player, club, state.players), player.age);
        });
        if (!destination || !terms) continue;
        approaches++;
        if (!rng.chance(NPC_ACCEPTANCE_CHANCE)) continue;
        const deal: LoanDeal = { ...terms,
          id: `opening-loan:${state.currentSeason}:${state.currentWeek}:${clubId}:${id}`,
          status: "active", agreedPlayingTime: "regular", startCurrentAbility: player.currentAbility,
          performanceRecord: { appearances: 0, goals: 0, assists: 0, avgRating: 6, developmentDelta: 0,
            parentClubSatisfaction: 50, loanClubSatisfaction: 50 } };
        const resolution = resolvePlayerMovements(getLifecycleWorld(state),
          [{ type: "loanStart", playerId: id, deal, reason: "Season-opening squad vacancy agreement" }],
          state.currentWeek, state.currentSeason, seasonLength);
        if (!resolution.applied.length) continue;
        state = withLifecycleWorld(state, resolution.state);
        const known = Object.values(state.observations ?? {}).some(observation => observation.playerId === id);
        if (known) state = { ...state, inbox: [...(state.inbox ?? []), {
          id: `opening-loan-notice:${deal.id}`, week: state.currentWeek, season: state.currentSeason,
          type: "transferUpdate", title: `Loan Move: ${player.firstName} ${player.lastName}`,
          body: `${player.firstName} ${player.lastName} has joined ${club.name} on loan from ${parent.name} until week ${deal.endWeek} of season ${deal.endSeason}.`,
          read: false, actionRequired: false, relatedId: id, relatedEntityType: "player",
        }] };
      }
    }
  }
  return state;
}

/** Preserve the existing entry point while covering both first-team vacancies. */
export const recruitOpeningGoalkeeperLoans = recruitOpeningSquadLoans;
