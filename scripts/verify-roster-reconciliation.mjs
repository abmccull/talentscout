import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Usage: node scripts/verify-roster-reconciliation.mjs <checkpoint> <new-report>");
const input = resolve(inputArg), output = resolve(outputArg);
if (input === output) throw new Error("Cannot overwrite the checkpoint");
const raw = await readFile(input);
const state = JSON.parse(raw).gameState;
const before = JSON.stringify(state);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { reconcileClubRosters, selectStartingXI } = await server.ssrLoadModule("/src/engine/core/gameLoop.ts");
  const result = reconcileClubRosters(state.clubs, state.players, state.disciplinaryRecords);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(reconcileClubRosters(result, state.players, state.disciplinaryRecords), result);
  const changes = Object.values(result).flatMap(club => {
    const old = state.clubs[club.id];
    if (JSON.stringify(old) === JSON.stringify(club)) return [];
    const promoted = club.playerIds.filter(id => !old.playerIds.includes(id));
    return [{ clubId: club.id, name: club.name, promoted: promoted.map(id => {
      const player = state.players[id];
      assert.ok(player.age >= 16);
      assert.ok(old.academyPlayerIds.includes(id));
      return { id, name: `${player.firstName} ${player.lastName}`, age: player.age, position: player.position };
    }) }];
  });
  const lineupHealth = clubs => {
    const lineups = Object.values(clubs).map(club => selectStartingXI(club, state.players,
      state.disciplinaryRecords, undefined, state.managerProfiles?.[club.id]));
    return { noAvailableKeeper: lineups.filter(team => !team.some(p => p.position === "GK")).length,
      shortLineup: lineups.filter(team => team.length < 11).length };
  };
  const { buildAcademyPromotionNews } = await server.ssrLoadModule("/src/engine/youth/academyPromotionNews.ts");
  const promotionNews = buildAcademyPromotionNews(state, state.clubs, result, state.players, state.currentWeek, state.currentSeason);
  const report = { promotionNews, lineupBefore: lineupHealth(state.clubs), lineupAfter: lineupHealth(result), evidenceKind: "isolated-roster-reconciliation-not-career-replay",
    sourceSha256: createHash("sha256").update(raw).digest("hex"),
    season: state.currentSeason, week: state.currentWeek,
    sourceUnchanged: true, idempotent: true, changes };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(report));
} finally { await server.close(); }
