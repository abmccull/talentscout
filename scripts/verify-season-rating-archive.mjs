import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/verify-season-rating-archive.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw);
const state = checkpoint.gameState ?? checkpoint;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const before = bytes(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactSeasonRating, expandSeasonRating } = await server.ssrLoadModule("/src/engine/players/seasonRatingArchive.ts");
  const { assessRetirementIntent } = await server.ssrLoadModule("/src/engine/transfers/retirementPlanning.ts");
  let rows = 0;
  let retirementComparisons = 0;
  for (const player of Object.values(state.players)) {
    const previous = player.seasonRatings ?? [];
    const compact = JSON.parse(JSON.stringify(previous.map(compactSeasonRating)));
    deepStrictEqual(compact.map(expandSeasonRating), previous.map(expandSeasonRating));
    if (player.age >= 30 && retirementComparisons < 50) {
      deepStrictEqual(assessRetirementIntent({ ...player, seasonRatings: compact }, state), assessRetirementIntent(player, state));
      retirementComparisons += 1;
    }
    rows += previous.length;
    player.seasonRatings = compact;
  }
  const after = bytes(state.players);
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Actual runtime encoder: exact row equality after JSON round trip; retirement assessment equality for up to 50 veterans. No checkpoint mutation or career progression.",
    season: state.currentSeason, week: state.currentWeek, players: Object.keys(state.players).length,
    rows, retirementComparisons, beforeBytes: before, afterBytes: after, savedBytes: before - after };
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await server.close(); }
