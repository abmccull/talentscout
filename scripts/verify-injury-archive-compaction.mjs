import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/verify-injury-archive-compaction.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const beforeBytes = bytes(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactInjuryArchive, expandHistoricalInjury } = await server.ssrLoadModule("/src/engine/players/injuryArchive.ts");
  let checkedEntries = 0;
  const expand = (history) => ({ ...history,
    injuries: history.injuries.map((entry) => expandHistoricalInjury(entry, history.playerId)) });
  for (const player of Object.values(state.players)) {
    if (!player.injuryHistory) continue;
    const prior = player.injuryHistory;
    const compacted = JSON.parse(JSON.stringify(compactInjuryArchive(prior)));
    deepStrictEqual(expand(compacted), expand(prior));
    checkedEntries += prior.injuries.length;
    player.injuryHistory = compacted;
  }
  const afterBytes = bytes(state.players);
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Injury archive representation only. Every reconstructed incident and cumulative history field must match after JSON round trip. No career progression or history pruning.",
    season: state.currentSeason, week: state.currentWeek, players: Object.keys(state.players).length,
    checkedEntries, beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes,
    belowExisting32MiBBudget: afterBytes <= 32 * 1024 * 1024 };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await server.close(); }
