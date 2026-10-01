import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: node scripts/report-career-population.mjs <season-checkpoint.json> <report.json>");
const raw = await readFile(resolve(inputPath));
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
if (!state.players || !Number.isFinite(state.currentSeason)) throw new Error("Expected a game state or seasonal checkpoint with players and currentSeason.");

function distribution(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (fraction) => finite.length ? finite[Math.floor((finite.length - 1) * fraction)] : null;
  return {
    count: values.length, measured: finite.length, missingOrInvalid: values.length - finite.length,
    min: percentile(0), p10: percentile(0.1), median: percentile(0.5), p90: percentile(0.9), max: percentile(1),
  };
}

function cohort(players) {
  return {
    count: players.length,
    age: distribution(players.map((p) => p.age)),
    currentAbility: distribution(players.map((p) => p.currentAbility)),
    potentialAbility: distribution(players.map((p) => p.potentialAbility)),
    weeklyWage: distribution(players.map((p) => p.wage)),
    unsigned: players.filter((p) => !p.clubId).length,
    injured: players.filter((p) => p.injured === true).length,
  };
}

const active = Object.values(state.players);
const clubs = Object.values(state.clubs ?? {});
const seniorCounts = clubs.map((club) => [...new Set(club.playerIds ?? [])]
  .filter((id) => state.players[id]?.clubId === club.id).length);
const clubDiagnostics = clubs.map((club) => {
  const seniors = [...new Set(club.playerIds ?? [])].map((id) => state.players[id])
    .filter((player) => player?.clubId === club.id);
  const owned = active.filter((player) => (player.contractClubId || player.loanParentClubId || player.clubId) === club.id);
  const incoming = {}, outgoing = {};
  for (const movement of state.playerMovementHistory ?? []) {
    if (movement.toClubId === club.id) incoming[movement.type] = (incoming[movement.type] ?? 0) + 1;
    if (movement.fromClubId === club.id) outgoing[movement.type] = (outgoing[movement.type] ?? 0) + 1;
  }
  return {
    clubId: club.id, name: club.name, seniorCount: seniors.length,
    seniorGoalkeepers: seniors.filter((player) => player.position === "GK").length,
    reputation: club.reputation, cash: club.budget, weeklyWageBudget: club.weeklyWageBudget ?? null,
    ownedPlayers: owned.length, weeklyPlayerWages: owned.reduce((sum, player) => sum + (player.wage ?? 0), 0),
    incomingRetainedMovements: incoming, outgoingRetainedMovements: outgoing,
  };
}).sort((a, b) => a.seniorCount - b.seniorCount || a.clubId.localeCompare(b.clubId));
const youth = Object.values(state.unsignedYouth ?? {}).filter((y) => !y.placed && !y.retired).map((y) => y.player);
const byAge = {};
for (const [label, minimum, maximum] of [["under18", 0, 17], ["18to21", 18, 21], ["22to27", 22, 27], ["28to33", 28, 33], ["34plus", 34, Infinity]]) {
  byAge[label] = cohort(active.filter((p) => Number.isFinite(p.age) && p.age >= minimum && p.age <= maximum));
}
const nationalities = [...new Set(active.map((p) => p.nationality ?? "Unknown"))].sort();
const duplicateYouthIds = youth.filter((p) => state.players[p.id]).map((p) => p.id);
const violations = active.flatMap((p) => {
  const issues = [];
  for (const key of ["age", "currentAbility", "potentialAbility", "wage"]) {
    if (!Number.isFinite(p[key]) || p[key] < 0) issues.push({ playerId: p.id, field: key, value: p[key] ?? null });
  }
  if (p.currentAbility > 200 || p.potentialAbility > 200) issues.push({ playerId: p.id, field: "abilityRange" });
  return issues;
});
const report = {
  kind: "career-population-diagnostic", version: 1,
  input: resolve(inputPath), inputSha256: createHash("sha256").update(raw).digest("hex"),
  season: state.currentSeason, week: state.currentWeek,
  completedCanonicalTicks: checkpoint.completedCanonicalTicks ?? null,
  interpretation: "Measurements only. Statistical stability and football realism require comparison across seasons and seeds; this report is not a quality grade.",
  active: cohort(active), unsignedYouth: cohort(youth),
  clubFinances: {
    transferBudget: distribution(clubs.map((club) => club.budget)),
    totalTransferBudget: clubs.every((club) => Number.isFinite(club.budget))
      ? clubs.reduce((sum, club) => sum + club.budget, 0) : null,
    clubsWithNoTransferFunds: clubs.filter((club) => Number.isFinite(club.budget) && club.budget <= 0).length,
    weeklyWageBudget: distribution(clubs.map((club) => club.weeklyWageBudget)),
    contractedWeeklyWages: distribution(clubDiagnostics.map((club) => club.weeklyPlayerWages)),
    clubsWithRecordedAllocation: clubs.filter((club) => club.recruitmentAllocation != null).length,
    latestRecordedAllocations: clubs.flatMap((club) => club.recruitmentAllocation
      ? [{ clubId: club.id, ...club.recruitmentAllocation }] : []),
    interpretation: "Transfer funds and contracted player wages only; not operating profit, and wage headroom excludes additional contractual obligations. Latest allocation records are not a complete cash ledger.",
  },
  clubRosterHealth: {
    clubs: clubs.length,
    seniorSquadSize: distribution(seniorCounts),
    fewerThanElevenSeniors: seniorCounts.filter((count) => count < 11).length,
    fewerThanEighteenSeniors: seniorCounts.filter((count) => count < 18).length,
    moreThanThirtySeniors: seniorCounts.filter((count) => count > 30).length,
    withoutSeniorGoalkeeper: clubDiagnostics.filter((club) => club.seniorGoalkeepers === 0).length,
    academySize: distribution(clubs.map((club) => new Set(club.academyPlayerIds ?? []).size)),
  },
  clubDiagnostics,
  movementHistoryScope: "Counts use retained movement records only; academy graduations and older pruned movements are not a complete transfer ledger.",
  retiredCount: Object.keys(state.retiredPlayers ?? {}).length,
  byAge,
  byNationality: Object.fromEntries(nationalities.map((country) => [country, cohort(active.filter((p) => (p.nationality ?? "Unknown") === country))])),
  activeYouthOverlapIds: duplicateYouthIds, invalidValues: violations,
};
await mkdir(dirname(resolve(outputPath)), { recursive: true });
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
const historyDirectory = resolve(dirname(outputPath), `${basename(outputPath, ".json")}.history`);
const historyPath = resolve(historyDirectory, `s${report.season}-w${report.week}-${report.inputSha256.slice(0, 16)}.json`);
await mkdir(historyDirectory, { recursive: true });
// Immutable source-bound samples survive later refreshes of the latest report.
try {
  await writeFile(historyPath, serializedReport, { flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
await writeFile(resolve(outputPath), serializedReport);
console.log(JSON.stringify({ output: resolve(outputPath), history: historyPath, season: report.season, players: active.length, youth: youth.length, invalidValues: violations.length }));
