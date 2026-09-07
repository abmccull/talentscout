/**
 * Post-apply competitive roster repair — restocks funded clubs that are still
 * below a registered XI or without a registered keeper after lifecycle apply.
 *
 * The weekly free-agent tick restocks against projected outflows, but some
 * detachments only become visible on the authoritative post-advance world.
 * This pass closes those residual gaps before the week is handed to the UI.
 */

import type { RNG } from "@/engine/rng";
import type { FreeAgent, GameState, Player, Position } from "@/engine/core/types";
import {
  assessClubAffordabilityFromContext,
  buildClubAffordabilityContext,
} from "@/engine/finance/clubEconomics";
import { calculatePlayerWeeklyWage } from "@/engine/finance/wages";
import { generatePlayer } from "@/engine/players/generation";
import { getClubAbilityMidpoint } from "@/engine/players/clubAbility";
import {
  COMPETITIVE_REGISTERED_FLOOR,
  listRegisteredAtClub,
} from "@/engine/match/eligibleRoster";
import { getSeasonLength } from "@/engine/core/gameDate";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  type PlayerMovementIntent,
} from "@/engine/world/playerLifecycle";

const MIN_WAGE = 200;
const EMERGENCY_OUTFIELD_ORDER: readonly Position[] = [
  "CB", "CM", "ST", "LB", "RB", "CDM", "CAM", "LW", "RW",
];

/**
 * After advanceWeek, ensure every funded club still has a competitive
 * registered XI and at least one registered keeper.
 */
export function repairCompetitiveRosterGaps(state: GameState, rng: RNG): GameState {
  if (!state.freeAgentPool) return state;

  const affordabilityContext = buildClubAffordabilityContext(
    state.clubs,
    state.players,
    { currentWeek: state.currentWeek, currentSeason: state.currentSeason },
  );
  const claimableAgents: FreeAgent[] = state.freeAgentPool.agents
    .filter((agent) => agent.status === "available")
    .map((agent) => ({ ...agent }));
  const claimedAgentIds = new Set<string>();
  const spawnedPlayers: Player[] = [];
  const signings: Array<{
    playerId: string;
    clubId: string;
    wage: number;
    signingBonus: number;
    contractLength: number;
  }> = [];

  const thinTargets = Object.values(state.clubs)
    .map((club) => {
      const remaining = listRegisteredAtClub(club, state.players);
      return {
        club,
        registered: remaining.length,
        keepers: remaining.filter((player) => player.position === "GK").length,
      };
    })
    .filter((entry) =>
      entry.registered < COMPETITIVE_REGISTERED_FLOOR || entry.keepers === 0)
    .sort((left, right) => left.registered - right.registered
      || left.keepers - right.keepers
      || left.club.id.localeCompare(right.club.id));

  if (thinTargets.length === 0) return state;

  for (const target of thinTargets) {
    let registered = target.registered;
    let keepers = target.keepers;

    const claimNext = (requireKeeper: boolean): boolean => {
      let chosenIndex = -1;
      let chosenWage = Number.POSITIVE_INFINITY;
      for (let index = 0; index < claimableAgents.length; index += 1) {
        const agent = claimableAgents[index]!;
        if (agent.status !== "available" || claimedAgentIds.has(agent.playerId)) continue;
        if (agent.releasedFrom === target.club.id) continue;
        const player = state.players[agent.playerId];
        if (!player) continue;
        if (requireKeeper && player.position !== "GK") continue;
        const entry = affordabilityContext[target.club.id];
        if (!entry) continue;
        const affordability = assessClubAffordabilityFromContext(entry, {
          upfrontCost: agent.signingBonusExpectation,
          weeklyWageCommitment: 0,
        });
        if (affordability.remainingBudgetAfterReserve < 0) continue;
        if (!requireKeeper) {
          const playerReputation = player.currentAbility / 2;
          if (Math.abs(target.club.reputation - playerReputation) > 55) continue;
        }
        if (
          agent.wageExpectation < chosenWage
          || (agent.wageExpectation === chosenWage
            && (chosenIndex < 0 || agent.playerId < claimableAgents[chosenIndex]!.playerId))
        ) {
          chosenIndex = index;
          chosenWage = agent.wageExpectation;
        }
      }
      if (chosenIndex < 0) return false;
      const agent = claimableAgents[chosenIndex]!;
      const player = state.players[agent.playerId]!;
      claimedAgentIds.add(agent.playerId);
      signings.push({
        playerId: agent.playerId,
        clubId: target.club.id,
        wage: agent.wageExpectation,
        signingBonus: agent.signingBonusExpectation,
        contractLength: player.age >= 32 ? 1 : player.age >= 29 ? 2 : 3,
      });
      const entry = affordabilityContext[target.club.id];
      if (entry) entry.currentWeeklyCommitment += Math.max(0, agent.wageExpectation);
      registered += 1;
      if (player.position === "GK") keepers += 1;
      return true;
    };

    const spawnEmergency = (requireKeeper: boolean): boolean => {
      const entry = affordabilityContext[target.club.id];
      if (!entry) return false;
      const affordability = assessClubAffordabilityFromContext(entry, {
        upfrontCost: 0,
        weeklyWageCommitment: 0,
      });
      if (affordability.remainingBudgetAfterReserve < 0) return false;

      const midpoint = getClubAbilityMidpoint(target.club.reputation);
      const ability = Math.max(20, Math.round(midpoint * 0.75));
      const position: Position = requireKeeper
        ? "GK"
        : EMERGENCY_OUTFIELD_ORDER[registered % EMERGENCY_OUTFIELD_ORDER.length]!;
      const nationality = state.leagues[target.club.leagueId]?.country ?? "English";
      const spawned = generatePlayer(rng, {
        position,
        ageRange: [24, 30],
        abilityRange: [Math.max(15, ability - 5), ability + 5],
        nationality,
        clubId: "",
        currentSeason: state.currentSeason,
        clubReputation: target.club.reputation,
        idNamespace: `emgfix_${target.club.id}`,
      });
      spawned.clubId = "";
      spawned.contractClubId = undefined;
      spawned.contractExpiry = 0;
      const wage = Math.max(
        MIN_WAGE,
        calculatePlayerWeeklyWage(spawned.currentAbility, target.club.reputation),
      );
      spawned.wage = wage;
      spawnedPlayers.push(spawned);
      claimedAgentIds.add(spawned.id);
      signings.push({
        playerId: spawned.id,
        clubId: target.club.id,
        wage,
        signingBonus: 0,
        contractLength: spawned.age >= 29 ? 2 : 3,
      });
      entry.currentWeeklyCommitment += wage;
      registered += 1;
      if (position === "GK") keepers += 1;
      return true;
    };

    while (keepers === 0) {
      if (claimNext(true)) continue;
      if (!spawnEmergency(true)) break;
    }
    while (registered < COMPETITIVE_REGISTERED_FLOOR) {
      if (claimNext(false)) continue;
      if (!spawnEmergency(false)) break;
    }
  }

  if (signings.length === 0) return state;

  const players = { ...state.players };
  for (const spawned of spawnedPlayers) {
    players[spawned.id] = spawned;
  }
  const intents: PlayerMovementIntent[] = signings.map((signing) => ({
    type: "freeAgentSigning" as const,
    playerId: signing.playerId,
    toClubId: signing.clubId,
    wage: signing.wage,
    signingBonus: signing.signingBonus,
    contractLength: signing.contractLength,
    relaxWeeklyWageCap: true,
    reason: "Post-advance competitive roster repair",
  }));
  const resolution = resolvePlayerMovements(
    {
      ...getLifecycleWorld(state),
      players,
      clubs: state.clubs,
      freeAgentPool: state.freeAgentPool,
    },
    intents,
    state.currentWeek,
    state.currentSeason,
    getSeasonLength(state.fixtures, state.currentSeason),
  );

  return {
    ...state,
    players: resolution.state.players,
    clubs: resolution.state.clubs,
    freeAgentPool: resolution.state.freeAgentPool,
    activeLoans: resolution.state.activeLoans,
    loanHistory: resolution.state.loanHistory,
    retiredPlayers: resolution.state.retiredPlayers,
    retiredPlayerIds: resolution.state.retiredPlayerIds,
    playerMovementHistory: resolution.state.playerMovementHistory,
  };
}
