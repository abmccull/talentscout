import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Supply sidecar and new report paths");
const raw = await readFile(input, "utf8");
// A live worker can be appending a record. Analyze only newline-terminated rows.
const complete = raw.slice(0, raw.lastIndexOf("\n") + 1);
const snapshots = complete.split("\n").filter(Boolean).map(JSON.parse);
if (!snapshots.length) throw new Error("No complete observations yet");
if (new Set(snapshots.map(row => row.runId)).size !== 1) throw new Error("Mixed run IDs: isolate a single run before comparison");
const tracks = new Map();
let previousTick = -1;
for (const snapshot of snapshots) {
  if (snapshot.completedCanonicalTicks <= previousTick) throw new Error("Duplicate or unordered snapshot ticks");
  previousTick = snapshot.completedCanonicalTicks;
  const seen = new Set();
  for (const player of snapshot.rows) {
    if (seen.has(player.id)) throw new Error("Duplicate player within snapshot");
    seen.add(player.id);
    const track = tracks.get(player.id) ?? [];
    track.push({ ...player, season: snapshot.season, week: snapshot.week });
    tracks.set(player.id, track);
  }
}
const last = snapshots.at(-1);
const active = new Set(last.rows.map(row => row.id));
const stats = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return { count: sorted.length, min: sorted[0] ?? null,
    median: sorted[Math.floor((sorted.length - 1) / 2)] ?? null,
    max: sorted.at(-1) ?? null };
};
const rows = [...tracks].filter(([, track]) => track[0].age <= 17).map(([id, track]) => {
  const first = track[0], final = track.at(-1);
  return { id, firstSeason: first.season, lastObservedSeason: final.season,
    firstAge: first.age, lastAge: final.age, observations: track.length,
    firstAbility: first.ability, lastAbility: final.ability, abilityGain: final.ability - first.ability,
    peakAbility: Math.max(...track.map(row => row.ability)), potentialAtEntry: first.potential,
    activeAtLatestBoundary: active.has(id),
    unattachedAtObservedBoundaries: track.filter(row => !row.clubId).length,
    injuredAtObservedBoundaries: track.filter(row => row.injured).length,
    observedClubChanges: track.slice(1).filter((row, index) => row.clubId !== track[index].clubId).length };
});
const cohorts = [...new Set(rows.map(row => row.firstSeason))].sort((a,b) => a-b).map(firstSeason => {
  const entered = rows.filter(row => row.firstSeason === firstSeason);
  const surviving = entered.filter(row => row.activeAtLatestBoundary);
  return { firstSeason, entered: entered.length, active: surviving.length, absent: entered.length - surviving.length,
    entryAge: stats(entered.map(row => row.firstAge)),
    entryAbility: stats(entered.map(row => row.firstAbility)),
    survivorAbilityGain: stats(surviving.map(row => row.abilityGain)),
    survivorLatestAbility: stats(surviving.map(row => row.lastAbility)),
    everReached150: entered.filter(row => row.peakAbility >= 150).length };
});
const age17Comparison = [true, false].map(initialPopulation => {
  const atAge17 = [...tracks.values()]
    .filter(track => (track[0].season === snapshots[0].season) === initialPopulation)
    .map(track => track.find(row => row.age === 17)).filter(Boolean);
  return { initialPopulation, abilityAt17: stats(atAge17.map(row => row.ability)),
    potentialAt17: stats(atAge17.map(row => row.potential)) };
});
const report = { scope: "Longitudinal PA150+ entrants first observed through age17. Survival and absence shown separately; absence is not proven retirement. Boundary-only observations omit intra-season changes, injuries and club spells. No causal or balance certification implied.",
  inputCompleteLinesSha256: createHash("sha256").update(complete).digest("hex"),
  ignoredTrailingBytes: Buffer.byteLength(raw.slice(complete.length)), runId: last.runId,
  snapshots: snapshots.length, latestSeason: last.season, latestWeek: last.week,
  age17ComparisonScope: "Same-age comparison within tracked high-potential players, not matched clubs, potential, or development exposure. Later entrants can be first observed above their creation age.",
  age17Comparison, cohorts, rows };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
