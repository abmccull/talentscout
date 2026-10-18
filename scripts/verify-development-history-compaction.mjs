import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/verify-development-history-compaction.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const before = bytes(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactPlayerDevelopmentHistory, getPlayerDevelopmentHistorySummary, getPlayerDevelopmentHistoryId } =
    await server.ssrLoadModule("/src/engine/world/developmentEnvironment.ts");
  let checkedEntries = 0;
  for (const player of Object.values(state.players)) {
    if (!player.developmentHistory) continue;
    const prior = player.developmentHistory;
    const reconstructed = (entry) => ({ ...entry, id: getPlayerDevelopmentHistoryId(entry, player.id),
      summary: getPlayerDevelopmentHistorySummary(entry) });
    const compacted = JSON.parse(JSON.stringify(compactPlayerDevelopmentHistory(prior, player.id)));
    // Require every retained event, identifier, date, club, outcome, and exact
    // readable sentence to survive. A pruned or altered row fails this audit.
    deepStrictEqual(compacted.map(reconstructed), prior.map(reconstructed));
    checkedEntries += prior.length;
    player.developmentHistory = compacted;
  }
  const after = bytes(state.players);
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Isolated development-history representation only; exact reconstructed event equality after JSON round trip. No career progression or release certification.",
    season: state.currentSeason, week: state.currentWeek, players: Object.keys(state.players).length,
    checkedEntries, beforeBytes: before, afterBytes: after, savedBytes: before - after,
    belowExisting32MiBBudget: after <= 32 * 1024 * 1024 };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await server.close(); }
