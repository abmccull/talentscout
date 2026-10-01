import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide source and a new report path");
const raw = await readFile(input), state = JSON.parse(raw).gameState;
const server = await createServer({ configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
 const { expandClubSeasonHistory } = await server.ssrLoadModule("/src/engine/world/clubSeasonArchive.ts");
 const rows = [];
 for (const season of state.worldHistory?.seasons ?? []) {
  const clubs = season.clubs.map(expandClubSeasonHistory);
  for (const league of season.leagues) {
   const table = clubs.filter(club => club.leagueId === league.leagueId && club.standing).map(club => club.standing);
   if (!table.length) continue;
   const total = key => table.reduce((sum, entry) => sum + entry[key], 0);
   const appearances = total("played"), matches = appearances / 2, goals = total("goalsFor");
   const checks = { completeTable: table.length === league.clubCount,
    fixtureCount: matches === league.playedFixtures, winsEqualLosses: total("won") === total("lost"),
    goalsBalance: goals === total("goalsAgainst"), recordTotals: table.every(t => t.played === t.won + t.drawn + t.lost),
    points: table.every(t => t.points === 3 * t.won + t.drawn) };
   rows.push({ season: season.season, leagueId: league.leagueId, country: league.country, clubs: table.length, matches,
    goalsPerMatch: matches ? goals / matches : null, drawRate: appearances ? total("drawn") / appearances : null,
    checks });
  }
 }
 assert.ok(rows.length, "No supported league tables");
 const failed = rows.filter(row => Object.values(row.checks).some(value => !value));
 const report = { scope: "Read-only retained league-table integrity and outcome distribution. Rates are descriptive, not a realism or FM-quality certification.",
  sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason,
  leagueSeasons: rows.length, failedChecks: failed, rows };
 await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
 console.log(JSON.stringify({ leagueSeasons: rows.length, failedChecks: failed, sample: rows.slice(0, 6) }));
} finally { await server.close(); }
