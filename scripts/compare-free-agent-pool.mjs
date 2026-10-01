import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";

const [checkpointPath, baselineRoot, output] = process.argv.slice(2);
if (!checkpointPath || !baselineRoot || !output) throw Error("Provide checkpoint, baseline root, and new output path");
const raw = await readFile(checkpointPath);
const state = JSON.parse(raw).gameState;
const original = JSON.stringify(state);
const hash = value => createHash("sha256").update(value).digest("hex");
const rows = [];
let expected;
// This measures the preserved pool, not a full season-end or release gate.
const roots = [resolve(baselineRoot), process.cwd()];
if (process.argv[5] === "--current-first") roots.reverse();
for (const root of roots) {
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true },
    resolve: { alias: { "@": resolve(root, "src") } }, appType: "custom" });
  try {
    const { tickFreeAgentPool } = await server.ssrLoadModule("/src/engine/freeAgents/pool.ts");
    const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
    for (const seed of ["pool-comparison-1", "pool-comparison-2", "pool-comparison-3"]) {
      const rng = new RNG(seed), cpuStart = process.cpuUsage(), started = performance.now();
      const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
      const elapsedMs = performance.now() - started, cpu = process.cpuUsage(cpuStart);
      const resultHash = hash(JSON.stringify(result)), nextRandom = rng.nextInt(0, 1_000_000);
      assert.equal(JSON.stringify(state), original);
      rows.push({ root, seed, elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000, resultHash, nextRandom,
        signings: result.npcSignedPlayerIds.length });
    }
    const latest = rows.slice(-3).map(({ seed, resultHash, nextRandom }) => ({ seed, resultHash, nextRandom }));
    if (expected) assert.deepEqual(latest, expected); else expected = latest;
  } finally { await server.close(); }
}
assert.deepEqual(await readFile(checkpointPath), raw);
const report = { scope: "Three-seed isolated pool comparison on retained population; no dates advanced or career saved. Results and next RNG draw must match; timings are descriptive.",
  checkpointSha256: hash(raw), season: state.currentSeason, week: state.currentWeek,
  poolSize: state.freeAgentPool.agents.length, rows };
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify(report));
