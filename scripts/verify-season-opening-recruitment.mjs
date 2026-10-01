import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import assert from "node:assert/strict";

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide a checkpoint and a distinct new report path");
const raw = await readFile(input), state = JSON.parse(raw).gameState;
const original = JSON.stringify(state);
const keeperCoverage = world => Object.values(world.clubs).map(club => {
  const keepers = [...new Set(club.playerIds)].map(id => world.players[id])
    .filter(player => player?.clubId === club.id && player.position === "GK" && player.age >= 16);
  return { clubId: club.id, registered: keepers.length,
    available: keepers.filter(player => !player.injured
      && (world.disciplinaryRecords?.[player.id]?.suspensionWeeksRemaining ?? 0) <= 0).length };
});
const gaps = world => Object.values(world.clubs).flatMap(club => {
  const squad = [...new Set(club.playerIds)].map(id => world.players[id]).filter(p => p?.clubId === club.id);
  const keepers = squad.filter(p => p.position === "GK").length, outfield = squad.length - keepers;
  return keepers > 0 && outfield >= 10 ? [] : [{ id: club.id, keepers, outfield }];
});
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { recruitForSeasonOpening } = await server.ssrLoadModule("/src/engine/freeAgents/seasonOpening.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const result = recruitForSeasonOpening(state, new RNG(`${state.seed}-season-opening-market-s${state.currentSeason}`));
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(Object.keys(result.players).sort(), Object.keys(state.players).sort());
  for (const player of Object.values(state.players)) {
    if (player.clubId || player.contractClubId) assert.deepEqual(result.players[player.id], player);
  }
  const { buildClubAffordabilityContext } = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
  const financialHealth = world => {
    const context = buildClubAffordabilityContext(world.clubs, world.players,
      { currentWeek: world.currentWeek, currentSeason: world.currentSeason });
    return { wageOverruns: Object.values(context).filter(entry => entry.currentWeeklyCommitment > entry.club.weeklyWageBudget).length,
      negativeCash: Object.values(world.clubs).filter(club => club.budget < 0).length };
  };
  const financesBefore = financialHealth(state), financesAfter = financialHealth(result);
  assert.ok(financesAfter.wageOverruns <= financesBefore.wageOverruns);
  assert.ok(financesAfter.negativeCash <= financesBefore.negativeCash);
  const report = { financesBefore, financesAfter, scope: "Isolated season-opening pass on retained state; not a canonical career replay.",
    sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason,
    sourceUnchanged: true, existingContractsUnchanged: true, noPlayersCreated: true,
    before: gaps(state), after: gaps(result),
    keeperCoverageBefore: keeperCoverage(state), keeperCoverageAfter: keeperCoverage(result),
    depthBefore: Object.values(state.clubs).filter(club => club.playerIds.length < 18).length,
    depthAfter: Object.values(result.clubs).filter(club => club.playerIds.length < 18).length,
    agreements: result.playerMovementHistory.slice(state.playerMovementHistory.length) };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(report));
} finally { await server.close(); }
