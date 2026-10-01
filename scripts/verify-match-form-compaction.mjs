import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/verify-match-form-compaction.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw);
const state = checkpoint.gameState ?? checkpoint;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const before = bytes(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactMatchFormEntry, expandMatchFormEntry } = await server.ssrLoadModule("/src/engine/players/matchFormArchive.ts");
  const { computeFormFromRatings } = await server.ssrLoadModule("/src/engine/match/ratings.ts");
  let rows = 0;
  for (const player of Object.values(state.players)) {
    const previous = player.recentMatchRatings ?? [];
    const compact = JSON.parse(JSON.stringify(previous.map(compactMatchFormEntry)));
    deepStrictEqual(compact.map(expandMatchFormEntry), previous.map(expandMatchFormEntry));
    deepStrictEqual(computeFormFromRatings(compact, player), computeFormFromRatings(previous, player));
    rows += previous.length;
    player.recentMatchRatings = compact;
  }
  const after = bytes(state.players);
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Exact form-row equality and identical computed form after compact JSON round trip. No history pruning or career progression.",
    season: state.currentSeason, week: state.currentWeek, players: Object.keys(state.players).length,
    rows, beforeBytes: before, afterBytes: after, savedBytes: before - after };
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await server.close(); }
