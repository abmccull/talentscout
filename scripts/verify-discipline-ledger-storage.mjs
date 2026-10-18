import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/verify-discipline-ledger-storage.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const parsed = JSON.parse(raw.toString("utf8"));
const state = parsed.gameState ?? parsed;
if (state.disciplinaryRecords === undefined) throw new Error("No authoritative ledger; legacy mirrors must be retained.");
const ledger = structuredClone(state.disciplinaryRecords);
const size = (value) => Buffer.byteLength(JSON.stringify(value));
const beforeBytes = size(state.players);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { withoutDisciplineMirror, getPlayerDisciplinaryRecord } = await server.ssrLoadModule("/src/engine/match/disciplineRecords.ts");
  const { getPlayerAvailability } = await server.ssrLoadModule("/src/engine/match/discipline.ts");
  let removedMirrors = 0;
  for (const [id, player] of Object.entries(state.players)) {
    const compacted = JSON.parse(JSON.stringify(withoutDisciplineMirror(player)));
    deepStrictEqual(getPlayerAvailability(player, ledger), getPlayerAvailability(compacted, ledger));
    deepStrictEqual(getPlayerDisciplinaryRecord(compacted, ledger), ledger[id]);
    const { disciplinaryRecord, ...priorWithoutCache } = player;
    deepStrictEqual(compacted, priorWithoutCache);
    if (disciplinaryRecord !== undefined) removedMirrors++;
    state.players[id] = compacted;
  }
  deepStrictEqual(state.disciplinaryRecords, ledger);
  const afterBytes = size(state.players);
  const report = { input: resolve(input), sha256: createHash("sha256").update(raw).digest("hex"),
    season: state.currentSeason, week: state.currentWeek, checkedPlayers: Object.keys(state.players).length,
    removedMirrors, beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes,
    scope: "Remove obsolete player-side discipline caches only. Every other player field, canonical ledger, and gameplay availability must remain equal after JSON round trip. Old cached season histories are not the active discipline ledger. No career simulation." };
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await server.close(); }
