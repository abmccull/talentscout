import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";

const [checkpoint, baselineRoot, output] = process.argv.slice(2);
if (!checkpoint || !baselineRoot || !output || resolve(checkpoint) === resolve(output)) {
  throw new Error("Provide checkpoint, frozen baseline root, and new report path");
}
const raw = await readFile(checkpoint);
const state = JSON.parse(raw).gameState;
const input = {
  worldSeed: state.seed, season: state.currentSeason, week: 1,
  leagues: state.leagues, clubs: state.clubs, players: state.players,
  disciplinaryRecords: state.disciplinaryRecords ?? {},
};
// Replay the first scheduled round on a copy of this checkpoint's population.
// This isolates eligibility; it is not a canonical continuation of the save.
const before = JSON.stringify(input);
async function inspect(root) {
  const server = await createServer({ root, configFile: false,
    server: { middlewareMode: true }, resolve: { alias: { "@": resolve(root, "src") } }, appType: "custom" });
  try {
    const { simulateAbstractCompetitionWeek } = await server.ssrLoadModule("/src/engine/world/abstractCompetition.ts");
    const result = simulateAbstractCompetitionWeek(input);
    const unavailable = [], shortTeams = [], missingKeepers = [];
    let appearances = 0;
    for (const fixture of result.fixturesPlayed) {
      for (const [id, rating] of Object.entries(fixture.playerRatings)) {
        appearances++;
        const player = state.players[id];
        const reasons = [];
        if (player.injured) reasons.push("injured");
        if ((input.disciplinaryRecords[id]?.suspensionWeeksRemaining ?? 0) > 0) reasons.push("suspended");
        if (player.age < 16 && state.clubs[player.clubId]?.academyPlayerIds?.includes(id)) reasons.push("academy-under16");
        if (reasons.length) unavailable.push({ fixtureId: fixture.id, playerId: id, minutes: rating.minutesPlayed, reasons });
      }
      for (const clubId of [fixture.homeClubId, fixture.awayClubId]) {
        const starters = Object.entries(fixture.playerRatings).filter(([id, rating]) => state.players[id].clubId === clubId && rating.started);
        if (starters.length < 11) shortTeams.push({ clubId, starters: starters.length });
        if (!starters.some(([id]) => state.players[id].position === "GK")) missingKeepers.push(clubId);
      }
    }
    assert.equal(JSON.stringify(input), before, "Simulation mutated checkpoint input");
    return { fixtures: result.fixturesPlayed.length, appearances, unavailable, shortTeams, missingKeepers };
  } finally { await server.close(); }
}
const baseline = await inspect(resolve(baselineRoot));
const current = await inspect(process.cwd());
assert.ok(current.fixtures > 0, "No actual fixtures tested");
assert.equal(current.unavailable.length, 0, "Unavailable players still participate");
assert.deepEqual(await readFile(checkpoint), raw, "Source checkpoint changed during inspection");
const report = { scope: "Isolated first-round eligibility replay on retained population, not canonical career advancement or realism certification.",
  sourceSha256: createHash("sha256").update(raw).digest("hex"), sourceSeason: state.currentSeason,
  sourceWeek: state.currentWeek, baselineRoot: resolve(baselineRoot), baseline, current };
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ baselineUnavailable: baseline.unavailable.length, currentUnavailable: current.unavailable.length,
  fixtures: current.fixtures, baselineShortTeams: baseline.shortTeams.length, currentShortTeams: current.shortTeams.length,
  currentMissingKeepers: current.missingKeepers.length }));
