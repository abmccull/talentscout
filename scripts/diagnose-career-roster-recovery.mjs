import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/diagnose-career-roster-recovery.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw.toString("utf8"));
let state = checkpoint.gameState ?? checkpoint;
function rosterHealth() {
  const clubs = Object.values(state.clubs).map((club) => {
    const players = [...new Set(club.playerIds)].map((id) => state.players[id]).filter((p) => p?.clubId === club.id);
    return { id: club.id, name: club.name, count: players.length, keepers: players.filter((p) => p.position === "GK").length };
  });
  return { season: state.currentSeason, week: state.currentWeek,
    belowEleven: clubs.filter((c) => c.count < 11).length,
    withoutPlayingEleven: clubs.filter((c) => c.keepers === 0 || c.count - c.keepers < 10).length,
    belowEighteen: clubs.filter((c) => c.count < 18).length,
    withoutKeeper: clubs.filter((c) => c.keepers === 0).length,
    worst: clubs.sort((a, b) => a.count - b.count || a.id.localeCompare(b.id)).slice(0, 8) };
}
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { processWeeklyWorldProgression } = await server.ssrLoadModule("/src/stores/actions/weeklyWorldProgression.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const samples = [rosterHealth()];
  const rng = new RNG(`${state.seed}-diagnostic-roster-recovery`);
  for (let index = 0; index < 12; index++) {
    const started = performance.now();
    state = processWeeklyWorldProgression({ state, sourceWeek: state.currentWeek,
      sourceSeason: state.currentSeason, dayResults: [], rng }).state;
    const sample = { ...rosterHealth(), elapsedMs: performance.now() - started };
    samples.push(sample);
    console.log(JSON.stringify({ ...sample, worst: sample.worst.slice(0, 1) }));
  }
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Twelve isolated core-world ticks from a preserved checkpoint with diagnostic RNG and empty day results. Excludes later weekly phases; not a canonical career or release certification.", samples };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  await writeFile(resolve(output) + ".checkpoint.json", JSON.stringify(state));
} finally { await server.close(); }
