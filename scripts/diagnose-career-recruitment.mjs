import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/diagnose-career-recruitment.mjs <checkpoint> <output>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const economics = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
  const { scoreFreeAgentClubInterest } = await server.ssrLoadModule("/src/engine/freeAgents/pool.ts");
  const { canFundSquadCompletion, getEmergencySquadVacancies, getGoalkeeperRecruitmentNeed } = await server.ssrLoadModule("/src/engine/freeAgents/squadPlanning.ts");
  const { isLoanEligible, retainsFirstTeamAfterLoan, findLoanDestination } = await server.ssrLoadModule("/src/engine/world/loans.ts");
  const context = economics.buildClubAffordabilityContext(state.clubs, state.players, {
    currentWeek: state.currentWeek, currentSeason: state.currentSeason,
  });
  const agents = state.freeAgentPool.agents.filter((agent) => agent.status === "available" && state.players[agent.playerId]);
  const firstTeams = Object.values(state.clubs).map((club) => [...new Set(club.playerIds)]
    .map((id) => state.players[id]).filter((player) => player?.clubId === club.id));
  const adults = agents.filter((agent) => state.players[agent.playerId].age >= 18);
  const supply = {
    clubCount: firstTeams.length,
    firstTeamPlayers: firstTeams.reduce((sum, roster) => sum + roster.length, 0),
    vacanciesToEleven: firstTeams.reduce((sum, roster) => sum + Math.max(0, 11 - roster.length), 0),
    vacanciesToEighteen: firstTeams.reduce((sum, roster) => sum + Math.max(0, 18 - roster.length), 0),
    availableAgents: agents.length,
    adultAgents: adults.length,
    adultWageBands: [600, 1_000, 2_000, 5_000, Infinity].map((ceiling, index, limits) => {
      const floor = index === 0 ? -Infinity : limits[index - 1];
      const band = adults.filter((agent) => agent.wageExpectation > floor && agent.wageExpectation <= ceiling);
      return { above: Number.isFinite(floor) ? floor : null,
        atMost: Number.isFinite(ceiling) ? ceiling : null, players: band.length,
        goalkeepers: band.filter((agent) => state.players[agent.playerId].position === "GK").length };
    }),
    scope: "Current free-agent supply, not a claim of total reachable recruitment supply. Transfers, loans and academy promotions require separate assessment. Wage bands omit signing bonuses, club eligibility and competition; their counts are optimistic bounds, not guaranteed signings.",
  };
  const clubs = Object.values(state.clubs).flatMap((club) => {
    const roster = [...new Set(club.playerIds)].map((id) => state.players[id]).filter((p) => p?.clubId === club.id);
    if (roster.length >= 18 && roster.some((p) => p.position === "GK")) return [];
    const baseline = economics.assessClubAffordabilityFromContext(context[club.id], {});
    const counts = { available: agents.length, formerClubExcluded: 0, reputationExcluded: 0,
      cashBlocked: 0, wagesBlocked: 0, squadReserveBlocked: 0, interestBlocked: 0, eligible: 0, eligibleKeepers: 0,
      eligibleWithPriorPoolTicks: 0 };
    const eligibleAdultIds = [];
    const affordableCandidates = [];
    for (const agent of agents) {
      const player = state.players[agent.playerId];
      if (agent.releasedFrom === club.id) { counts.formerClubExcluded++; continue; }
      if (Math.abs(club.reputation - player.currentAbility / 2) > 25) { counts.reputationExcluded++; continue; }
      const finance = economics.assessClubAffordabilityFromContext(context[club.id], {
        upfrontCost: agent.signingBonusExpectation, weeklyWageCommitment: agent.wageExpectation,
      });
      if (finance.remainingBudgetAfterReserve < 0) counts.cashBlocked++;
      if (finance.remainingWeeklyHeadroom < 0) counts.wagesBlocked++;
      if (!finance.affordable) continue;
      if (!canFundSquadCompletion(finance.remainingWeeklyHeadroom, new Set([...club.playerIds, player.id]).size, agent.wageExpectation, getGoalkeeperRecruitmentNeed(player, club, state.players), getEmergencySquadVacancies(player, club, state.players))) {
        counts.squadReserveBlocked++; continue;
      }
      if (scoreFreeAgentClubInterest(player, club, state, agent) < 0.25) { counts.interestBlocked++; continue; }
      counts.eligible++;
      if (player.age >= 18) eligibleAdultIds.push(player.id);
      if (agent.weeksInPool > 0) counts.eligibleWithPriorPoolTicks++;
      if (player.position === "GK") counts.eligibleKeepers++;
      affordableCandidates.push({ id: player.id, position: player.position, age: player.age,
        ability: player.currentAbility, wage: agent.wageExpectation, weeksAvailable: agent.weeksInPool });
    }
    return [{ id: club.id, name: club.name, firstTeamCount: roster.length,
      goalkeepers: roster.filter((p) => p.position === "GK").length,
      reputation: club.reputation, weeklyWageBudget: club.weeklyWageBudget,
      ownedPayroll: Object.values(state.players)
        .filter((p) => (p.contractClubId ?? p.loanParentClubId ?? p.clubId) === club.id)
        .map((p) => ({ id: p.id, position: p.position, age: p.age, ability: p.currentAbility,
          wage: p.wage, expiry: p.contractExpiry, registered: club.playerIds.includes(p.id),
          onLoan: p.onLoan ?? false }))
        .sort((a, b) => b.wage - a.wage),
      cash: club.budget, payrollHeadroom: baseline.remainingWeeklyHeadroom,
      counts, eligibleAdultIds, affordableCandidates: affordableCandidates.sort((a, b) => a.wage - b.wage).slice(0, 8) }];
  }).sort((a, b) => a.firstTeamCount - b.firstTeamCount || a.id.localeCompare(b.id));
  const depleted = clubs.filter((club) => club.goalkeepers === 0 || club.firstTeamCount - club.goalkeepers < 10);
  const loanEligibleAdults = Object.values(state.players).filter((player) => {
    const parent = state.clubs[player.contractClubId ?? player.loanParentClubId ?? player.clubId];
    return player.age >= 18 && parent && isLoanEligible(player, parent, state.players, state.currentSeason);
  });
  const surplusLoanAdults = loanEligibleAdults.filter((player) => retainsFirstTeamAfterLoan(
    player, state.clubs[player.contractClubId ?? player.clubId], state.players,
  ));
  const regions = new Map();
  for (const club of Object.values(state.clubs)) {
    const country = state.leagues[club.leagueId]?.country ?? "unknown";
    const row = regions.get(country) ?? { country, clubs: 0, vacanciesToEleven: 0, adultSurplusAboveEighteen: 0,
      registeredAcademy: 0, academyRegistrationsEndingBeforeEighteen: 0,
      legacyExpectedAnnualIntakeBeforeCapacity: 0, expectedAnnualIntakeBeforeCapacity: 0 };
    const roster = [...new Set(club.playerIds)].map((id) => state.players[id]).filter((p) => p?.clubId === club.id);
    row.clubs++;
    row.vacanciesToEleven += Math.max(0, 11 - roster.length);
    row.adultSurplusAboveEighteen += Math.max(0, roster.filter((p) => p.age >= 18).length - 18);
    const academy = [...new Set(club.academyPlayerIds ?? [])].map((id) => state.players[id])
      .filter((player) => player?.clubId === club.id && player.age < 18);
    row.registeredAcademy += academy.length;
    row.academyRegistrationsEndingBeforeEighteen += academy.filter((player) =>
      player.contractExpiry < state.currentSeason + 18 - player.age).length;
    row.legacyExpectedAnnualIntakeBeforeCapacity += Math.floor(club.youthAcademyRating / 5) + 0.5;
    row.expectedAnnualIntakeBeforeCapacity += Math.max(2, Math.floor(club.youthAcademyRating / 5)) + 0.5;
    regions.set(country, row);
  }
  supply.regionalSquads = [...regions.values()].sort((a, b) => b.vacanciesToEleven - a.vacanciesToEleven);
  supply.loans = {
    eligibleAdultsBeforeCover: loanEligibleAdults.length,
    eligibleAdultsWithCover: surplusLoanAdults.length,
    depletedDestinations: depleted.map((diagnosed) => {
      const destination = state.clubs[diagnosed.id];
      let routes = 0;
      let affordableAtMinimumShare = 0;
      for (const player of surplusLoanAdults) {
        const parent = state.clubs[player.contractClubId ?? player.clubId];
        const route = findLoanDestination(player, parent, { [destination.id]: destination }, state.players,
          { pickWeighted: (items) => items[0].item }, state.leagues);
        if (!route) continue;
        routes++;
        const contribution = Math.round(player.wage * 0.3);
        const finance = economics.assessClubAffordabilityFromContext(context[destination.id], {
          weeklyObligationCommitment: contribution,
        });
        if (finance.affordable && canFundSquadCompletion(finance.remainingWeeklyHeadroom,
          new Set([...destination.playerIds, player.id]).size, contribution, getGoalkeeperRecruitmentNeed(player, destination, state.players))) affordableAtMinimumShare++;
      }
      return { clubId: destination.id, routes, affordableAtMinimumShare };
    }),
    scope: "Adult development-loan supply with parent cover protected. Destination route gate is current production logic. Financial bound assumes minimum 30% wage share and zero loan fee; actual terms and shared-parent cover make fewer loans feasible. Does not assume every candidate will agree.",
  };
  // Maximum bipartite matching: one free agent can cover only one vacancy.
  // Edges use initial single-deal affordability, so this deliberately ignores
  // cumulative payroll, positions and acceptance and is only an upper bound.
  const slots = depleted.flatMap((club) => Array.from({ length: 11 - club.firstTeamCount }, () => club));
  const assignedPlayer = new Map();
  function fillSlot(slot, visited) {
    for (const playerId of slots[slot].eligibleAdultIds) {
      if (visited.has(playerId)) continue;
      visited.add(playerId);
      const previous = assignedPlayer.get(playerId);
      if (previous === undefined || fillSlot(previous, visited)) {
        assignedPlayer.set(playerId, slot);
        return true;
      }
    }
    return false;
  }
  for (let slot = 0; slot < slots.length; slot++) fillSlot(slot, new Set());
  supply.optimisticFirstElevenMatching = {
    vacancies: slots.length, matched: assignedPlayer.size, unfillable: slots.length - assignedPlayer.size,
    scope: "Maximum matching of current adult free agents to first-eleven vacancies. Ignores cumulative spending, positions, acceptance and competition from nondepleted clubs; actual recruitment can be worse. Does not include loans or transfers.",
  };
  supply.depletedClubCandidates = {
    clubs: depleted.length,
    noEligibleAdult: depleted.filter((club) => club.eligibleAdultIds.length === 0).length,
    distinctEligibleAdults: new Set(depleted.flatMap((club) => club.eligibleAdultIds)).size,
    scope: "One-player affordability only; shared candidates counted once. Later arrivals consume funds, so this is an optimistic supply bound, not a feasible assignment.",
  };
  supply.depletedByWageBudget = [20_000, 100_000, Infinity].map((ceiling, index, limits) => {
    const floor = index === 0 ? -Infinity : limits[index - 1];
    const cohort = depleted.filter((club) => club.weeklyWageBudget > floor && club.weeklyWageBudget <= ceiling);
    return { above: Number.isFinite(floor) ? floor : null, atMost: Number.isFinite(ceiling) ? ceiling : null,
      clubs: cohort.length, vacanciesToEleven: cohort.reduce((sum, club) => sum + 11 - club.firstTeamCount, 0),
      distinctEligibleAdults: new Set(cohort.flatMap((club) => club.eligibleAdultIds)).size,
      noEligibleAdult: cohort.filter((club) => club.eligibleAdultIds.length === 0).length };
  });
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    season: state.currentSeason, week: state.currentWeek,
    supply,
    scope: "Current main economics and interest score against checkpoint data; instantaneous eligibility, not simulated acceptance. Cash and wage blocker counts can overlap. First-team roster includes registered under-18s; no age-based senior claim.", clubs };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output: resolve(output), season: report.season, clubs: clubs.length, supply,
    worst: clubs.slice(0, 3).map(({ id, firstTeamCount, counts }) => ({ id, firstTeamCount, counts })) }));
} finally {
  await server.close();
}
