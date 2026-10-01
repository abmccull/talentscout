import type { GameState } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { assessClubAffordabilityFromContext, buildClubAffordabilityContext } from "@/engine/finance/clubEconomics";
import { createFreeAgentSigningResolver, getLifecycleWorld, withLifecycleWorld } from "@/engine/world/playerLifecycle";
import { NPC_ACCEPTANCE_CHANCE, scoreFreeAgentClubInterest } from "./pool";
import { canFundSquadCompletion, getEmergencySquadVacancies, getGoalkeeperRecruitmentNeed } from "./squadPlanning";
import { recruitOpeningGoalkeeperLoans } from "./openingLoans";

/** A bounded recruitment window after annual funding and academy intake.
 * Uses existing available players and normal contract acceptance; never
 * guarantees a signing, generates cover, or advances the market clock.
 */
export function recruitForSeasonOpening(initial: GameState, rng: RNG): GameState {
  let state = initial;
  const clubOrder = rng.shuffle(Object.keys(initial.clubs).sort());
  const attempts = new Map(clubOrder.map(id => [id, new Set<string>()]));
  // Give every club a chance to field eleven, then specialist keeper cover,
  // before general bench recruitment can consume the remaining wage headroom.
  for (const phase of ["eleven", "keeperCover", "depth"] as const) {
    // Exhaust permanent vacancy approaches first, then explore loans before
    // optional cover and bench depth spend the remaining recruitment funds.
    if (phase === "keeperCover") state = recruitOpeningGoalkeeperLoans(state, rng);
    let resolveSigning: ReturnType<typeof createFreeAgentSigningResolver> | undefined;
    for (const clubId of clubOrder) {
      const attempted = attempts.get(clubId)!;
      let affordabilityContext: ReturnType<typeof buildClubAffordabilityContext>[string] | undefined;
      // Bound work and make at most one approach to each player for this club.
      for (let approach = 0; approach < 33; approach++) {
        const club = state.clubs[clubId];
        const squad = [...new Set(club.playerIds)].map(id => state.players[id])
          .filter(player => player && player.clubId === clubId && player.age >= 16);
        const keeperCount = squad.filter(player => player.position === "GK").length;
        const needsKeeper = keeperCount < (phase === "keeperCover" ? 2 : 1);
        const needsOutfield = squad.filter(player => player.position !== "GK").length < 10;
        // Use the ordinary market's thirty-player registration ceiling.
        if (squad.length >= 30) break;
        if (phase === "eleven" ? !needsKeeper && !needsOutfield
          : phase === "keeperCover" ? !needsKeeper : squad.length >= 18) break;
        // A declined approach only updates `attempted`, not payroll or cash.
        // Reuse that assessment until an actual movement changes the world.
        const context = affordabilityContext ??= buildClubAffordabilityContext({ [clubId]: club }, state.players,
          { currentWeek: state.currentWeek, currentSeason: state.currentSeason })[clubId];
        const candidates = state.freeAgentPool.agents.flatMap(agent => {
          const player = state.players[agent.playerId];
          if (agent.status !== "available" || attempted.has(agent.playerId) || agent.releasedFrom === clubId
            || !player || player.clubId || player.contractClubId || player.loanParentClubId || player.onLoan || player.age < 18
            || (needsKeeper ? player.position !== "GK"
              : needsOutfield ? player.position === "GK"
              : player.position === "GK" && keeperCount >= 2)
            || Math.abs(club.reputation - player.currentAbility / 2) > 25) return [];
          const affordability = assessClubAffordabilityFromContext(context, {
            upfrontCost: agent.signingBonusExpectation, weeklyWageCommitment: agent.wageExpectation,
          });
          if (!affordability.affordable || !canFundSquadCompletion(affordability.remainingWeeklyHeadroom,
            squad.length + 1, agent.wageExpectation, getGoalkeeperRecruitmentNeed(player, club, state.players),
            getEmergencySquadVacancies(player, club, state.players), player.age)) return [];
          const weight = scoreFreeAgentClubInterest(player, club, state, agent);
          return weight >= 0.25 ? [{ item: agent, weight: weight * (phase === "depth" && player.position === "GK" && keeperCount < 2 ? 2 : 1) }] : [];
        });
        if (candidates.length === 0) break;
        const agent = rng.pickWeighted(candidates);
        attempted.add(agent.playerId);
        // Same base willingness as a normal pending NPC free-agent offer.
        if (!rng.chance(NPC_ACCEPTANCE_CHANCE)) continue;
        const player = state.players[agent.playerId];
        const resolution = (resolveSigning ??= createFreeAgentSigningResolver(
          getLifecycleWorld(state), state.currentWeek, state.currentSeason,
        ))({
          type: "freeAgentSigning", playerId: player.id, toClubId: clubId,
          wage: agent.wageExpectation, signingBonus: agent.signingBonusExpectation,
          contractLength: player.age >= 32 ? 1 : player.age >= 29 ? 2 : 3,
          preserveSquadWageReserve: true, reason: "Season-opening squad vacancy agreement",
        });
        if (resolution.applied.length > 0) {
          state = withLifecycleWorld(state, resolution.state);
          affordabilityContext = undefined;
          if (agent.discoveredByScout) {
            state = { ...state, inbox: [...(state.inbox ?? []), {
              id: `season-opening-notice:${resolution.applied[0].id}`,
              week: state.currentWeek, season: state.currentSeason, type: "event",
              title: `${player.firstName} ${player.lastName} Signs with ${club.name}`,
              body: `Free agent ${player.firstName} ${player.lastName} has signed with ${club.name} before the opening fixtures. He is no longer available.`,
              read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player",
            }] };
          }
        }
      }
    }
  }
  return state;
}
