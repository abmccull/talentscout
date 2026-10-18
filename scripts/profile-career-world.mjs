import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { Session } from "node:inspector";
import { createServer } from "vite";

const [input, output, weekOverride] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/profile-career-world.mjs <checkpoint> <output.json> [controlled-week-override]");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const originalWeek = state.currentWeek;
if (weekOverride !== undefined) {
  const week = Number(weekOverride);
  if (!Number.isInteger(week) || week < 1 || week > 52) throw new Error("Invalid week override");
  state.currentWeek = week;
}
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
const session = new Session();
const post = (method) => new Promise((resolvePost, reject) =>
  session.post(method, (error, result) => error ? reject(error) : resolvePost(result)));
try {
  const { processWeeklyWorldProgression } = await server.ssrLoadModule("/src/stores/actions/weeklyWorldProgression.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  session.connect();
  await post("Profiler.enable");
  await post("Profiler.start");
  const started = performance.now();
  const result = processWeeklyWorldProgression({ state, sourceWeek: state.currentWeek,
    sourceSeason: state.currentSeason, dayResults: [], rng: new RNG(`${state.seed}-profile-world`) });
  const elapsedMs = performance.now() - started;
  const { profile } = await post("Profiler.stop");
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }
  const hotFunctions = [...self].map(([id, microseconds]) => ({
    ...nodes.get(id).callFrame, selfMs: microseconds / 1000,
  })).sort((a, b) => b.selfMs - a.selfMs).slice(0, 40);
  const report = { input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Isolated core world progression with diagnostic RNG and empty day results; optional controlled date override. Not an exact canonical-week replay or release certification.",
    originalWeek, testedWeek: state.currentWeek, season: state.currentSeason,
    resultSeason: result.state.currentSeason, resultWeek: result.state.currentWeek,
    resultStateSha256: createHash("sha256").update(JSON.stringify(result.state)).digest("hex"),
    elapsedMs, hotFunctions };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output) + ".cpuprofile", JSON.stringify(profile));
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  session.disconnect();
  await server.close();
}
