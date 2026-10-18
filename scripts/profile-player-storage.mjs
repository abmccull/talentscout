import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/profile-player-storage.mjs <checkpoint> <report>");
const raw = await readFile(resolve(input));
const checkpoint = JSON.parse(raw);
const state = checkpoint.gameState ?? checkpoint;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const players = Object.values(state.players);
const fields = {};
const ages = {};
const emptyFields = {};
for (const player of players) {
  const age = String(player.age);
  ages[age] ??= { count: 0, bytes: 0 };
  ages[age].count += 1;
  ages[age].bytes += bytes(player);
  for (const [key, value] of Object.entries(player)) {
    fields[key] ??= { count: 0, valueBytes: 0, rows: 0, maxRows: 0 };
    fields[key].count += 1;
    fields[key].valueBytes += bytes(value);
    if (Array.isArray(value)) {
      fields[key].rows += value.length;
      fields[key].maxRows = Math.max(fields[key].maxRows, value.length);
    }
    if (value === null || (Array.isArray(value) && value.length === 0)
      || (typeof value === "object" && value && Object.keys(value).length === 0)) {
      emptyFields[key] = (emptyFields[key] ?? 0) + 1;
    }
  }
}
const report = {
  input: resolve(input), inputSha256: createHash("sha256").update(raw).digest("hex"),
  scope: "Read-only player storage profile. No save mutation or history pruning.",
  season: state.currentSeason, week: state.currentWeek, players: players.length,
  playerBytes: bytes(state.players), ages, emptyFields,
  fields: Object.fromEntries(Object.entries(fields).sort((a, b) => b[1].valueBytes - a[1].valueBytes)),
};
const clubs = Object.values(state.clubs ?? {}).map((club) => {
  const senior = [...new Set(club.playerIds ?? [])].map(id => state.players[id]).filter(player => player?.clubId === club.id);
  return { id: club.id, name: club.name, senior: senior.length,
    keepers: senior.filter(player => player.position === "GK").length,
    academy: (club.academyPlayerIds ?? []).length };
});
report.rosterCoverage = {
  scope: "Registered roster coverage only, not match availability after injuries/suspensions or competitive quality.",
  clubs: clubs.length,
  belowEleven: clubs.filter(club => club.senior < 11).length,
  belowEighteen: clubs.filter(club => club.senior < 18).length,
  withoutKeeper: clubs.filter(club => club.keepers === 0).length,
  worst: clubs.sort((a, b) => a.senior - b.senior || a.id.localeCompare(b.id)).slice(0, 12),
};
// Measure a candidate encoding without modifying the checkpoint or game state.
// Unknown extension fields retain their full object representation.
const seasonKeys = ["season", "avgRating", "appearances", "goals", "assists", "cleanSheets"];
let eligibleSeasonRows = 0;
let alreadyCompactRows = 0;
let preservedExtendedRows = 0;
let seasonBytesBefore = 0;
let seasonBytesAfter = 0;
for (const player of players) {
  const records = player.seasonRatings ?? [];
  const encoded = records.map((record) => {
    if (Array.isArray(record)) { alreadyCompactRows += 1; return record; }
    if (Object.keys(record).length !== seasonKeys.length
      || !seasonKeys.every((key) => typeof record[key] === "number" && Number.isFinite(record[key]))) {
      preservedExtendedRows += 1;
      return record;
    }
    eligibleSeasonRows += 1;
    return seasonKeys.map((key) => record[key]);
  });
  const restored = JSON.parse(JSON.stringify(encoded)).map((row) => Array.isArray(row)
    ? Object.fromEntries(seasonKeys.map((key, index) => [key, row[index]])) : row);
  deepStrictEqual(restored, records.map(row => Array.isArray(row)
    ? Object.fromEntries(seasonKeys.map((key, index) => [key, row[index]])) : row));
  seasonBytesBefore += bytes(records);
  seasonBytesAfter += bytes(encoded);
}
report.seasonRatingEncodingExperiment = {
  scope: "Diagnostic re-encoding estimate; existing compact rows are retained. Every decoded row equals the original after JSON round trip. Runtime verification is separate.",
  eligibleSeasonRows, alreadyCompactRows, preservedExtendedRows, seasonBytesBefore, seasonBytesAfter,
  savedBytes: seasonBytesBefore - seasonBytesAfter,
  projectedPlayerBytesAtThisCheckpoint: report.playerBytes - seasonBytesBefore + seasonBytesAfter,
};
await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, ages: undefined, fields: Object.entries(report.fields).slice(0, 16) }, null, 2));
