import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Supply checkpoint and new report paths");
const input = resolve(inputArg), output = resolve(outputArg);
if (input === output) throw new Error("Cannot overwrite input");
const raw = await readFile(input);
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactClubSeasonHistory, expandClubSeasonHistory } = await server.ssrLoadModule("/src/engine/world/clubSeasonArchive.ts");
  const { buildWorldArchiveComparisonCatalog } = await server.ssrLoadModule("/src/engine/world/historyComparison.ts");
  const { compactLongCareerHistory } = await server.ssrLoadModule("/src/engine/world/saveRetention.ts");
  const { migrateVisualIdentities } = await server.ssrLoadModule("/src/engine/players/portraits/state.ts");
  const { revealKnownGamePortraits } = await server.ssrLoadModule("/src/engine/players/portraits/gameIntegration.ts");
  const { getPlayerDevelopmentHistoryOutcome } = await server.ssrLoadModule("/src/engine/world/developmentEnvironment.ts");
  const originalHistory = JSON.stringify(state.worldHistory);
  const start = performance.now();
  let rows = 0, packedRows = 0;
  const history = { ...state.worldHistory, seasons: state.worldHistory.seasons.map(season => ({
    ...season, clubs: season.clubs.map(club => {
      rows++;
      const packed = compactClubSeasonHistory(club);
      if ("archiveV1" in packed) packedRows++;
      deepStrictEqual(expandClubSeasonHistory(JSON.parse(JSON.stringify(packed))), expandClubSeasonHistory(club));
      deepStrictEqual(compactClubSeasonHistory(packed), packed);
      return packed;
    }),
  })) };
  const elapsedMs = performance.now() - start;
  deepStrictEqual(buildWorldArchiveComparisonCatalog(history), buildWorldArchiveComparisonCatalog(state.worldHistory));
  deepStrictEqual(JSON.stringify(state.worldHistory), originalHistory);
  const retained = compactLongCareerHistory(state);
  let developmentRows = 0;
  for (const [id, player] of Object.entries(state.players)) {
    const original = player.developmentHistory ?? [];
    const current = retained.players[id]?.developmentHistory ?? [];
    const expanded = rows => rows.map(entry => ({ ...entry, outcome: getPlayerDevelopmentHistoryOutcome(entry) }));
    deepStrictEqual(expanded(current), expanded(original));
    developmentRows += current.length;
  }
  for (const season of retained.worldHistory.seasons) {
    const original = state.worldHistory.seasons.find(row => row.season === season.season);
    deepStrictEqual(season.clubs.map(expandClubSeasonHistory), original.clubs.map(expandClubSeasonHistory));
    deepStrictEqual(season.clubs, history.seasons.find(row => row.season === season.season).clubs);
  }
  const beforeBytes = bytes(state), afterBytes = bytes({ ...state, worldHistory: history });
  const withPortraits = revealKnownGamePortraits(migrateVisualIdentities(retained));
  const report = { scope: "Read-only club archive compaction of successful checkpoint, not a canonical week or failed-state replay. Every row round-tripped exactly; archive comparison catalog equal; source unchanged.",
    input, inputSha256: createHash("sha256").update(raw).digest("hex"),
    season: state.currentSeason, week: state.currentWeek, rows, packedRows, elapsedMs,
    beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes,
    historyBeforeBytes: bytes(state.worldHistory), historyAfterBytes: bytes(history),
    canonicalRetentionClubRowsEqual: true, developmentRows, developmentRowsEqual: true,
    canonicalRetentionTotalBytes: bytes(retained),
    withCurrentKnownPortraitsBytes: bytes(withPortraits),
    withCurrentPortraitPlayerBytes: bytes(withPortraits.players),
    serializedBudgetBytes: 80 * 1024 * 1024, playerBudgetBytes: 32 * 1024 * 1024 };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
} finally { await server.close(); }
