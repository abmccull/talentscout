import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";
const [checkpoint, output] = process.argv.slice(2);
if (!checkpoint || !output || resolve(checkpoint) === resolve(output)) throw new Error("Provide checkpoint and new report path");
const raw = await readFile(checkpoint), state = JSON.parse(raw).gameState;
const original = JSON.stringify(state);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const loans = await server.ssrLoadModule("/src/engine/world/loans.ts");
  const economics = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
  const planning = await server.ssrLoadModule("/src/engine/freeAgents/squadPlanning.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const { getSeasonLength } = await server.ssrLoadModule("/src/engine/core/gameDate.ts");
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const finances = economics.buildClubAffordabilityContext(state.clubs, state.players,
    { currentWeek: state.currentWeek, currentSeason: state.currentSeason });
  const targets = Object.values(state.clubs).filter(club => !club.playerIds.some(id =>
    state.players[id]?.clubId === club.id && state.players[id].position === "GK" && state.players[id].age >= 16));
  const rows = [];
  for (const target of targets) {
    const offers = [];
    let eligibleKeepers = 0;
    let routesConsidered = 0, financeRejected = 0, reserveRejected = 0;
    for (const player of Object.values(state.players)) {
      const parent = state.clubs[player.contractClubId ?? player.loanParentClubId ?? player.clubId];
      if (player.position !== "GK" || player.age < 18 || !parent || player.injured
        || !loans.isLoanEligible(player, parent, state.players, state.currentSeason, new Set(), state.currentWeek, seasonLength)
        || !loans.retainsFirstTeamAfterLoan(player, parent, state.players)) continue;
      eligibleKeepers++;
      const rng = new RNG(`keeper-options:${state.seed}:${target.id}:${player.id}`);
      let terms;
      const destination = loans.findLoanDestination(player, parent, { [target.id]: target }, state.players, rng, state.leagues, club => {
        routesConsidered++;
        terms = loans.calculateLoanTerms(player, parent, club, state.currentWeek, state.currentSeason, rng,
          seasonLength);
        const wage = Math.round(player.wage * terms.wageContribution / 100);
        const finance = economics.assessClubAffordabilityFromContext(finances[club.id],
          { upfrontCost: terms.loanFee, weeklyObligationCommitment: wage });
        if (!finance.affordable) { financeRejected++; return false; }
        const reserveAllowed = planning.canFundSquadCompletion(finance.remainingWeeklyHeadroom,
          new Set([...club.playerIds, player.id]).size, wage,
          planning.getGoalkeeperRecruitmentNeed(player, club, state.players),
          planning.getEmergencySquadVacancies(player, club, state.players), player.age);
        if (!reserveAllowed) reserveRejected++;
        return reserveAllowed;
      });
      if (destination) offers.push({ playerId: player.id, parentClubId: parent.id, age: player.age,
        ability: player.currentAbility, weeklyContribution: Math.round(player.wage * terms.wageContribution / 100), terms });
    }
    rows.push({ clubId: target.id, name: target.name, eligibleKeepers, routesConsidered, financeRejected, reserveRejected, offers });
  }
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(await readFile(checkpoint), raw);
  const report = { scope: "Isolated route and affordability checks with deterministic sample terms. No loans agreed, no acceptance simulated, not canonical continuation.",
    sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason, rows };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(rows.map(({ offers, ...row }) => ({ ...row, feasibleSampledOffers: offers.length }))));
} finally { await server.close(); }
