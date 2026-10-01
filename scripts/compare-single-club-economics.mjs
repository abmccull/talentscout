import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";

const [input, baseline, output] = process.argv.slice(2);
if (!input || !baseline || !output) throw Error("Provide checkpoint, baseline root, new output path");
const raw = await readFile(input);
const state = JSON.parse(raw).gameState;
const hash = data => createHash("sha256").update(data).digest("hex");
const before = JSON.stringify(state);
const rows = [];
let expected;
const roots = [resolve(baseline), process.cwd()];
if (process.argv.includes("--current-first")) roots.reverse();
for (const root of roots) {
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true },
    resolve: { alias: { "@": resolve(root, "src") } }, appType: "custom" });
  try {
    const { buildClubAffordabilityContext: build } = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
    const options = { currentWeek: state.currentWeek, currentSeason: state.currentSeason };
    const indexed = build(state.clubs, state.players, options);
    for (let iteration = 0; iteration < 3; iteration++) {
      const start = performance.now(), cpuStart = process.cpuUsage();
      const result = {};
      for (const [id, club] of Object.entries(state.clubs)) {
        result[id] = build({ [id]: club }, state.players, options)[id];
      }
      const elapsedMs = performance.now() - start, cpu = process.cpuUsage(cpuStart);
      assert.deepEqual(result, indexed);
      const resultHash = hash(JSON.stringify(result));
      if (expected) assert.equal(resultHash, expected); else expected = resultHash;
      assert.equal(JSON.stringify(state), before);
      rows.push({ root, iteration, elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000, resultHash });
    }
  } finally { await server.close(); }
}
assert.deepEqual(await readFile(input), raw);
const report = { scope: "All single-club assessments versus full world index and baseline; input unchanged. Timings are diagnostic, not a full rollover gate.",
  inputSha256: hash(raw), clubs: Object.keys(state.clubs).length, players: Object.keys(state.players).length, rows };
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify(report));
