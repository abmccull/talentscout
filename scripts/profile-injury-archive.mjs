import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Supply source checkpoint and distinct new report");
const raw = await readFile(input);
const checkpoint = JSON.parse(raw);
const state = checkpoint.gameState ?? checkpoint;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const beforePlayers = bytes(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { compactInjuryArchive, expandHistoricalInjury } = await server.ssrLoadModule("/src/engine/players/injuryArchive.ts");
  let incidents = 0;
  let packed = 0;
  const players = Object.fromEntries(Object.entries(state.players).map(([id, player]) => {
    if (!player.injuryHistory) return [id, player];
    const history = player.injuryHistory;
    const compact = compactInjuryArchive(history);
    const restored = JSON.parse(JSON.stringify(compact));
    const expand = value => ({ ...value, injuries: value.injuries.map(entry => expandHistoricalInjury(entry, value.playerId)) });
    deepStrictEqual(expand(restored), expand(history));
    deepStrictEqual(compactInjuryArchive(compact), compact);
    incidents += history.injuries.length;
    packed += compact.injuries.filter(Array.isArray).length;
    return [id, { ...player, injuryHistory: compact }];
  }));
  deepStrictEqual(bytes(state.players), beforePlayers);
  const report = { scope: "Read-only supplied checkpoint. Every retained player injury incident and cumulative history field reconstructed exactly after JSON round trip. No incidents removed; not the failed S18 state or long-career certification.",
    inputSha256: createHash("sha256").update(raw).digest("hex"),
    season: state.currentSeason, week: state.currentWeek, incidents, packed,
    beforePlayerBytes: beforePlayers, afterPlayerBytes: bytes(players), savedBytes: beforePlayers - bytes(players) };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
} finally { await server.close(); }
