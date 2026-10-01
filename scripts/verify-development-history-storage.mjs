import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide source and new report paths");
const raw = await readFile(input), state = JSON.parse(raw).gameState, original = JSON.stringify(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
 const { packDevelopmentHistoryEntry, expandDevelopmentHistoryEntry } = await server.ssrLoadModule("/src/engine/players/developmentHistoryArchive.ts");
 const { getPlayerDevelopmentHistoryId, getPlayerDevelopmentHistorySummary, getPlayerDevelopmentHistoryOutcome } = await server.ssrLoadModule("/src/engine/world/developmentEnvironment.ts");
 let records = 0;
 const players = Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, !player.developmentHistory ? player : { ...player,
  developmentHistory: player.developmentHistory.map(row => {
   const packed = JSON.parse(JSON.stringify(packDevelopmentHistoryEntry(row)));
   assert.deepEqual(expandDevelopmentHistoryEntry(packed), expandDevelopmentHistoryEntry(row));
   assert.equal(getPlayerDevelopmentHistoryId(packed, id), getPlayerDevelopmentHistoryId(row, id));
   assert.equal(getPlayerDevelopmentHistorySummary(packed), getPlayerDevelopmentHistorySummary(row));
   assert.equal(getPlayerDevelopmentHistoryOutcome(packed), getPlayerDevelopmentHistoryOutcome(row));
   records++; return packed;
  }) }]));
 assert.equal(JSON.stringify(state.players), original);
 const beforeBytes = Buffer.byteLength(original), afterBytes = Buffer.byteLength(JSON.stringify(players));
 const report = { scope: "Isolated lossless development-history packing on retained checkpoint; not a career replay or failed-boundary result.", sourceSha256: createHash("sha256").update(raw).digest("hex"),
  season: state.currentSeason, week: state.currentWeek, players: Object.keys(players).length, records, everyRecordRoundTrips: true, publicHistoryUnchanged: true,
  sourceUnchanged: true, beforePlayerBytes: beforeBytes, afterPlayerBytes: afterBytes, savedPlayerBytes: beforeBytes - afterBytes };
 await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" }); console.log(JSON.stringify(report));
} finally { await server.close(); }
