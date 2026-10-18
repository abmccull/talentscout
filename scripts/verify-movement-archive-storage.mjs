import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide source and new report paths");
const raw = await readFile(input), root = JSON.parse(raw), state = root.gameState;
const original = JSON.stringify(state);
const server = await createServer({ configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactPlayerMovementSummary, expandPlayerMovementSummary } = await server.ssrLoadModule("/src/engine/world/worldHistoryTypes.ts");
  let records = 0;
  const compacted = { ...state, worldHistory: { ...state.worldHistory, seasons: state.worldHistory.seasons.map(season => ({ ...season,
    ...(season.playerMovementSummaries ? { playerMovementSummaries: season.playerMovementSummaries.map(row => {
      const stored = compactPlayerMovementSummary(row);
      assert.deepEqual(expandPlayerMovementSummary(JSON.parse(JSON.stringify(stored))), expandPlayerMovementSummary(row));
      records++; return stored;
    }) } : {}) })) } };
  assert.equal(JSON.stringify(state), original);
  const beforeBytes = Buffer.byteLength(original), afterBytes = Buffer.byteLength(JSON.stringify(compacted));
  const report = { scope: "Isolated lossless storage projection on last preserved checkpoint, not the failed boundary or a career replay.",
    sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason, week: state.currentWeek,
    records, everyRecordRoundTrips: true, sourceUnchanged: true, beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" }); console.log(JSON.stringify(report));
} finally { await server.close(); }
