import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Club, GameState, ManagerProfile, Player, PlayerMovementEvent, Position, Weather } from "@/engine/core/types";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { createWeekSchedule } from "@/engine/core/calendar";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { compactLongCareerHistory, findSaveRetentionReferenceViolations } from "@/engine/world/saveRetention";
import { compactPlayerMovementHistory, expandPlayerMovementHistory, InvalidMovementRowsArchiveError } from "@/engine/world/movementRowsArchive";

// Same disposable provider boundaries used by the existing engine integration suites.
vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

const verificationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
// Native serialization preserves owned undefined, exact numbers, array/object order and aliases.
const snapshot = (value: unknown) => serialize(value).toString("base64");
const restore = (value: string): unknown => deserialize(Buffer.from(value, "base64"));
const weatherCases: Weather[] = ["clear", "cloudy", "rain", "heavyRain", "windy", "snow"];
const positions: Position[] = ["GK", "GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "CAM", "LW", "RW", "ST", "ST", "CB", "CM"];
const benchmarkEnabled = process.env.THROUGHPUT_BENCHMARK === "1";
let generated: GameState;

beforeAll(async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 16, 0, 0, 0));
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Throughput", scoutLastName: "Differential", scoutAge: 29,
    specialization: "youth", difficulty: "normal", worldSeed: "career-throughput-before-code-v1",
    selectedCountries: ["england"], startingCountry: "england", nationality: "English",
    skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
  });
  generated = useGameStore.getState().gameState!;
  expect(generated).toBeDefined();
});
afterAll(() => vi.restoreAllMocks());

interface FixtureCase {
  name: string; weather?: Weather; managers?: "none" | "embedded"; formation?: string;
  homeSize?: number; awaySize?: number; availability?: boolean; loan?: boolean;
  noisyRoster?: boolean; missingClub?: "home" | "away" | "both";
}
const fixtureCases: FixtureCase[] = [
  ...weatherCases.map(weather => ({ name: `manager-weather-${weather}`, weather })),
  { name: "ordinary-seeded-no-managers", managers: "none" },
  { name: "embedded-manager-fallback", managers: "embedded", formation: "4-4-2" },
  { name: "different-formations", formation: "3-5-2" },
  { name: "suspended-injured-returning", availability: true },
  { name: "promised-loan-and-inactive-deal", loan: true },
  { name: "duplicate-missing-wrong-club-roster", noisyRoster: true },
  { name: "empty-home", homeSize: 0 }, { name: "empty-away", awaySize: 0 },
  { name: "both-empty", homeSize: 0, awaySize: 0, managers: "none" },
  { name: "partial-squads", homeSize: 4, awaySize: 7 },
  { name: "keeper-only", homeSize: 1, awaySize: 2 },
  { name: "missing-home-club", missingClub: "home" },
  { name: "missing-away-club", missingClub: "away" },
  { name: "missing-both-clubs", missingClub: "both" },
];

// Intercepts only the first weather choice and still consumes its normal RNG draw.
// All later RNG operations are real, and continuation is compared across sources.
class FixtureRNG extends RNG {
  draws = 0;
  forcedWeatherChoices = 0;
  constructor(seed: string, private readonly weather?: Weather) { super(seed); }
  override next(): number { this.draws = (this.draws ?? 0) + 1; return super.next(); }
  override pickWeighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T {
    const selected = super.pickWeighted(items);
    if (this.weather && this.forcedWeatherChoices === 0 && items.length === weatherCases.length
      && weatherCases.every(weather => items.some(item => (item.item as unknown) === weather))) {
      this.forcedWeatherChoices++;
      return this.weather as T;
    }
    return selected;
  }
}

function fixtureState(spec: FixtureCase): GameState {
  const state = structuredClone(generated);
  const league = Object.values(state.leagues).find(candidate => candidate.clubIds.length >= 2)!;
  expect(league).toBeDefined();
  const clubs = league.clubIds.slice(0, 2).map(id => state.clubs[id]);
  const players: Record<string, Player> = {};
  const managerProfiles: Record<string, ManagerProfile> = {};
  for (const [side, club] of clubs.entries()) {
    const playerIds = positions.slice(0, side === 0 ? spec.homeSize ?? positions.length : spec.awaySize ?? positions.length)
      .map((position, index) => {
        const id = `throughput-${side}-${index}`;
        players[id] = { ...generatePlayer(new RNG(id), { position, ageRange: [24, 24],
          abilityRange: [90 + index, 90 + index], nationality: "English", clubId: club.id }),
          id, form: 0, secondaryPositions: [], injured: false, injuryWeeksRemaining: 0, contractExpiry: 20 };
        return id;
      });
    const manager: ManagerProfile = { clubId: club.id, managerId: `throughput-manager-${side}`,
      managerName: `Manager ${side}`, preference: "balanced", reportInfluence: 0.5,
      preferredFormation: side === 0 ? spec.formation ?? "4-3-3" : "4-2-3-1" };
    clubs[side] = { ...club, playerIds, academyPlayerIds: [], loanedInPlayerIds: [],
      loanedOutPlayerIds: [], financialObligations: [] };
    delete (clubs[side] as Club & { manager?: ManagerProfile }).manager;
    if (spec.managers === "embedded") (clubs[side] as Club & { manager?: ManagerProfile }).manager = manager;
    else if (spec.managers !== "none") managerProfiles[club.id] = manager;
  }
  Object.assign(state, {
    currentWeek: 7, currentSeason: 1, totalWeeksPlayed: 6,
    leagues: { [league.id]: { ...league, clubIds: clubs.map(club => club.id), coverageTier: "full" } },
    clubs: Object.fromEntries(clubs.map(club => [club.id, club])), players, managerProfiles,
    fixtures: {
      target: { id: "target", homeClubId: clubs[0].id, awayClubId: clubs[1].id, leagueId: league.id, season: 1, week: 7, played: false },
      future: { id: "future", homeClubId: clubs[1].id, awayClubId: clubs[0].id, leagueId: league.id, season: 1, week: 46, played: false },
    },
    matchRatings: {}, disciplinaryRecords: {}, unsignedYouth: {}, retiredPlayers: {}, retiredPlayerIds: [],
    activeLoans: [], loanHistory: [], loanRecommendations: [], playerMovementHistory: [],
    freeAgentPool: { ...state.freeAgentPool, agents: [] }, freeAgentNegotiations: [],
    observations: {}, reports: {}, placementReports: {}, alumniRecords: [], inbox: [],
    npcScouts: {}, npcReports: {}, rivalScouts: {}, rivalActivities: [], contacts: {},
    seasonEvents: [], negotiations: [], worldHistory: undefined,
    schedule: createWeekSchedule(7, 1), playedFixtures: [],
  });
  if (spec.availability) {
    players["throughput-0-12"].injured = true;
    players["throughput-0-12"].injuryWeeksRemaining = 3;
    state.disciplinaryRecords = Object.fromEntries([3, 1].map((weeks, index) => {
      const playerId = `throughput-1-${index + 12}`;
      return [playerId, { playerId, season: 1, yellowCards: 0, redCards: 1, suspensionWeeksRemaining: weeks, cardHistory: [] }];
    }));
  }
  if (spec.loan) {
    const player = players["throughput-0-13"];
    Object.assign(player, { onLoan: true, loanParentClubId: clubs[1].id, contractClubId: clubs[1].id });
    state.activeLoans = [{ id: "promised-key", playerId: player.id, parentClubId: clubs[1].id,
      loanClubId: clubs[0].id, startWeek: 1, startSeason: 1, endWeek: 40, endSeason: 1,
      loanFee: 0, wageContribution: 0, recallClause: false, status: "active", agreedPlayingTime: "key" }];
    state.loanHistory = [{ ...state.activeLoans[0], id: "inactive-deal", status: "completed" }];
  }
  if (spec.noisyRoster) clubs[0].playerIds.push(clubs[0].playerIds[0], "missing-player", clubs[1].playerIds[0]);
  if (spec.missingClub === "home" || spec.missingClub === "both") state.fixtures.target.homeClubId = "missing-home-club";
  if (spec.missingClub === "away" || spec.missingClub === "both") state.fixtures.target.awayClubId = "missing-away-club";
  return state;
}

interface CaseResult {
  name: string; inputSha256: string; inputSnapshot: string; inputJson: string;
  exactResult: string; resultJson: string; summary: unknown;
}
function fixtureResult(spec: FixtureCase): CaseResult {
  const state = fixtureState(spec), before = snapshot(state), inputJson = JSON.stringify(state);
  const rng = new FixtureRNG(`weekly-throughput-${spec.name}`, spec.weather);
  const tick = processWeeklyTick(state, rng);
  expect(state, `${spec.name}: tick mutated input`).toStrictEqual(restore(before));
  expect(JSON.stringify(state), `${spec.name}: tick changed serialized input order`).toBe(inputJson);
  expect(tick.fixturesPlayed).toHaveLength(1);
  const fixture = tick.fixturesPlayed[0];
  if (spec.weather) { expect(fixture.weather).toBe(spec.weather); expect(rng.forcedWeatherChoices).toBe(1); }
  expect([fixture.homeGoals, fixture.awayGoals, fixture.attendance].every(Number.isFinite)).toBe(true);
  const participants = Object.keys(fixture.playerRatings ?? {});
  expect(participants.length).toBeLessThanOrEqual(22);
  expect(participants.every(id => state.players[id] && !state.players[id].injured)).toBe(true);
  if (spec.availability) expect(participants).not.toContain("throughput-1-12");
  const draws = rng.draws, continuation = Array.from({ length: 32 }, () => rng.next());
  const applied = advanceWeek(state, tick);
  expect(state, `${spec.name}: advance mutated input`).toStrictEqual(restore(before));
  expect(JSON.stringify(state), `${spec.name}: advance changed serialized input order`).toBe(inputJson);
  expect(applied.fixtures.target.played).toBe(true);
  const result = { tick, applied, draws, continuation,
    appliedPlayerOrder: Object.keys(applied.players), appliedFixtureOrder: Object.keys(applied.fixtures) };
  return { name: spec.name, inputSha256: sha(before), inputSnapshot: before, inputJson,
    exactResult: snapshot(result), resultJson: JSON.stringify(result),
    summary: { weather: fixture.weather, goals: [fixture.homeGoals, fixture.awayGoals], participants, draws } };
}

function retentionState(packed: boolean, movementCount = 96): GameState {
  const state = fixtureState({ name: "retention" });
  state.currentSeason = 10;
  const ids = Object.keys(state.players), causal = ids[0], retiredId = "throughput-recent-retired";
  state.reports = { causal: { id: "causal-report", playerId: causal } as GameState["reports"][string] };
  state.retiredPlayers = { [retiredId]: { ...state.players[ids[1]], id: retiredId } };
  state.retiredPlayerIds = [retiredId];
  const rows: PlayerMovementEvent[] = Array.from({ length: movementCount }, (_, index) => ({
    id: `movement:${ids[index % ids.length]}:exact:${index}`, playerId: ids[index % ids.length],
    type: index % 5 === 0 ? "contractRenewal" : "permanentTransfer",
    week: index % 46 + 1, season: [1, 7, 9][index % 3], fromClubId: "old-club", toClubId: "new-club",
    fee: index + 0.125, reason: `Exact historical reason ${index}`, loanDealId: undefined,
  }));
  rows.push({ id: "legacy-unprojected", playerId: ids[2], type: "release", week: 2, season: 2 });
  rows.push({ id: "recent-retirement", playerId: retiredId, type: "retirement", week: 3, season: 9 });
  rows.push({ ...rows[3] });
  const extensionRow = { ...rows[4], id: "future-row-extension", extension: { exact: [false, null, "α"] } } as PlayerMovementEvent;
  // Opaque fallback rows must be JSON-safe; recognized rows retain owned undefined above.
  delete extensionRow.loanDealId;
  rows.push(extensionRow);
  state.playerMovementHistory = packed ? compactPlayerMovementHistory(rows) : rows;
  if (packed) expect(Array.isArray(state.playerMovementHistory)).toBe(false);
  state.worldHistory = { version: 1, latestRecordedSeason: 9, seasons: [1, 7, 9].map(season => ({
    season, recordedAfterTotalWeeks: season * 46, leagues: [], clubs: [],
    players: [{ playerId: causal, age: 24, position: "GK", currentAbility: 90, marketValue: 1000,
      status: "contracted", movementEventIds: rows.filter(row => row.playerId === causal && row.season === season && row.type !== "contractRenewal").map(row => row.id) }],
  })) };
  return state;
}

function retentionResult(name: string, state: GameState, throws = false): CaseResult {
  const before = snapshot(state), inputJson = JSON.stringify(state);
  let output: unknown;
  if (throws) {
    let caught: unknown;
    try { compactLongCareerHistory(state); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(InvalidMovementRowsArchiveError);
    expect((caught as InvalidMovementRowsArchiveError).code).toBe(name.endsWith("-future") ? "FUTURE_VERSION" : "CORRUPT_SAVE");
    output = { name: (caught as Error).name, message: (caught as Error).message,
      code: (caught as InvalidMovementRowsArchiveError).code };
  } else {
    const compacted = compactLongCareerHistory(state);
    const violations = findSaveRetentionReferenceViolations(compacted);
    expect(violations).toEqual([]);
    output = { compacted, expanded: expandPlayerMovementHistory(compacted.playerMovementHistory), violations,
      playerOrder: Object.keys(compacted.players), retiredPlayerOrder: Object.keys(compacted.retiredPlayers) };
  }
  expect(state, `${name}: retention mutated input`).toStrictEqual(restore(before));
  expect(JSON.stringify(state), `${name}: retention changed serialized input order`).toBe(inputJson);
  return { name, inputSha256: sha(before), inputSnapshot: before, inputJson,
    exactResult: snapshot(output), resultJson: JSON.stringify(output), summary: { throws } };
}

async function sourceFilePins(sourceRoot: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all([
    ["test", fileURLToPath(import.meta.url)], ["config", resolve(verificationRoot, "vitest.career-throughput.config.ts")],
    ["gameLoop", resolve(sourceRoot, "src/engine/core/gameLoop.ts")],
    ["saveRetention", resolve(sourceRoot, "src/engine/world/saveRetention.ts")],
  ].map(async ([name, path]) => [name, sha(await readFile(path))])));
}

it.skipIf(benchmarkEnabled)("compares complete fixture ticks, applied states, RNG continuation and packed/plain retention", async () => {
  const mode = process.env.THROUGHPUT_MODE, sourceRoot = process.env.THROUGHPUT_SOURCE_ROOT!;
  const outputPath = process.env.THROUGHPUT_OUTPUT, baselinePath = process.env.THROUGHPUT_BASELINE;
  if (!outputPath || !baselinePath || !isAbsolute(outputPath) || !isAbsolute(baselinePath)) throw new Error("Absolute baseline/output paths required");
  if (mode !== "baseline" && mode !== "candidate") throw new Error("Invalid differential mode");
  if ((mode === "baseline") !== (resolve(outputPath) === resolve(baselinePath))) throw new Error("Baseline mode must write only the baseline; candidate output must differ");
  if (!process.env.THROUGHPUT_SOURCE_COMMIT) throw new Error("Actual independently checked source identity is required");
  const cases = fixtureCases.map(fixtureResult);
  const plain = retentionResult("retention-plain", retentionState(false));
  const packed = retentionResult("retention-packed", retentionState(true));
  expect(restore(packed.exactResult)).toStrictEqual(restore(plain.exactResult));
  expect(packed.resultJson).toBe(plain.resultJson);
  cases.push(plain, packed);
  for (const [name, value] of [
    ["empty", []], ["absent", undefined],
    ["corrupt", { movementRowsV1: [0, [], [[1]]] }],
    ["future", { movementRowsV99: [] }],
  ] as const) {
    const state = retentionState(false);
    state.worldHistory = undefined;
    state.playerMovementHistory = value as unknown as GameState["playerMovementHistory"];
    cases.push(retentionResult(`retention-${name}`, state, name === "corrupt" || name === "future"));
  }
  const filePins = await sourceFilePins(sourceRoot);
  let comparedBaselineSha256: string | null = null;
  if (mode === "candidate") {
    const baselineRaw = await readFile(baselinePath);
    const baseline = JSON.parse(baselineRaw.toString("utf8"));
    expect(baseline.schemaVersion).toBe(1); expect(baseline.mode).toBe("baseline");
    expect(baseline.runtime).toBe(process.version);
    expect(baseline.filePins.test).toBe(filePins.test); expect(baseline.filePins.config).toBe(filePins.config);
    expect(cases.map(row => row.name)).toStrictEqual(baseline.cases.map((row: CaseResult) => row.name));
    for (const [index, row] of cases.entries()) {
      const expected = baseline.cases[index] as CaseResult;
      expect(restore(row.inputSnapshot), `${row.name}: baseline inputs differ`).toStrictEqual(restore(expected.inputSnapshot));
      expect(restore(row.exactResult), `${row.name}: complete output or RNG differs`).toStrictEqual(restore(expected.exactResult));
      expect(row.inputJson, `${row.name}: serialized baseline inputs differ`).toBe(expected.inputJson);
      expect(row.resultJson, `${row.name}: serialized output or insertion order differs`).toBe(expected.resultJson);
      expect(row.summary).toStrictEqual(expected.summary);
    }
    comparedBaselineSha256 = sha(baselineRaw);
  }
  const artifact = { schemaVersion: 1, mode, recordedAtUtc: new Date().toISOString(),
    sourceRoot: resolve(sourceRoot), sourceIdentity: process.env.THROUGHPUT_SOURCE_COMMIT,
    runtime: process.version, filePins, comparedBaselineSha256, caseCount: cases.length,
    correctnessOnly: true, releaseCampaignAccepted: false, cases };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
});

it.runIf(benchmarkEnabled)("retains optional sequential weekly-tick and packed-retention timings", async () => {
  const sourceRoot = process.env.THROUGHPUT_SOURCE_ROOT!;
  const outputPath = process.env.THROUGHPUT_BENCHMARK_OUTPUT;
  if (!outputPath || !isAbsolute(outputPath)) throw new Error("Absolute THROUGHPUT_BENCHMARK_OUTPUT required");
  if (!process.env.THROUGHPUT_SOURCE_COMMIT) throw new Error("Actual independently checked source identity is required");
  const warmups = 2, measuredSamples = 7, fixtureCount = 16, movementCount = 3072;
  const workloads = [];
  for (const name of ["weekly-manager", "weekly-no-manager-fallback", "retention-packed"] as const) {
    const samples = [];
    let inputSnapshot: string | undefined, resultSnapshot: string | undefined;
    let workloadInputJson: string | undefined, workloadResultJson: string | undefined;
    let workloadSize: Record<string, number | boolean> | undefined;
    for (let iteration = 0; iteration < warmups + measuredSamples; iteration++) {
      // Construction, snapshots and validation are deliberately outside timing.
      const retention = name === "retention-packed";
      const state = retention ? retentionState(true, movementCount)
        : fixtureState({ name, managers: name === "weekly-no-manager-fallback" ? "none" : undefined });
      if (!retention) {
        const fixture = state.fixtures.target;
        state.fixtures = { ...Object.fromEntries(Array.from({ length: fixtureCount }, (_, index) => {
          const id = `benchmark-fixture-${index}`;
          return [id, { ...fixture, id }];
        })), future: state.fixtures.future };
      }
      const before = snapshot(state), inputJson = JSON.stringify(state);
      if (inputSnapshot === undefined) {
        inputSnapshot = before;
        workloadInputJson = inputJson;
        workloadSize = { clubs: Object.keys(state.clubs).length, players: Object.keys(state.players).length,
          currentWeekFixtures: Object.values(state.fixtures).filter(fixture => !fixture.played
            && fixture.week === state.currentWeek && fixture.season === state.currentSeason).length,
          movementRows: expandPlayerMovementHistory(state.playerMovementHistory ?? []).length,
          movementStorageBytes: Buffer.byteLength(JSON.stringify(state.playerMovementHistory ?? [])),
          packedMovement: !Array.isArray(state.playerMovementHistory),
          archivedSeasons: state.worldHistory?.seasons.length ?? 0 };
      } else {
        expect(state, `${name}: workload inputs differ`).toStrictEqual(restore(inputSnapshot));
        expect(inputJson, `${name}: workload serialized inputs differ`).toBe(workloadInputJson);
      }
      const rng = new FixtureRNG(`benchmark-${name}`);
      const cpuStart = process.cpuUsage(), wallStart = performance.now();
      const result = retention ? compactLongCareerHistory(state) : processWeeklyTick(state, rng);
      const wallMs = performance.now() - wallStart, cpu = process.cpuUsage(cpuStart);
      samples.push({ iteration, phase: iteration < warmups ? "warmup" : "measured",
        wallMs, cpuUserUs: cpu.user, cpuSystemUs: cpu.system, cpuTotalUs: cpu.user + cpu.system });
      expect(state, `${name}: measured call mutated input`).toStrictEqual(restore(before));
      expect(JSON.stringify(state), `${name}: measured call changed serialized input order`).toBe(inputJson);
      if (retention) expect(findSaveRetentionReferenceViolations(result as GameState)).toEqual([]);
      else expect((result as ReturnType<typeof processWeeklyTick>).fixturesPlayed).toHaveLength(fixtureCount);
      const semanticResult = { result, draws: rng.draws, continuation: Array.from({ length: 32 }, () => rng.next()) };
      if (resultSnapshot === undefined) {
        resultSnapshot = snapshot(semanticResult);
        workloadResultJson = JSON.stringify(semanticResult);
      } else {
        expect(semanticResult, `${name}: repeated result differs`).toStrictEqual(restore(resultSnapshot));
        expect(JSON.stringify(semanticResult), `${name}: repeated serialized result differs`).toBe(workloadResultJson);
      }
    }
    workloads.push({ name, workloadSize, inputSnapshot, inputSha256: sha(inputSnapshot!),
      inputJson: workloadInputJson, exactResult: resultSnapshot, resultJson: workloadResultJson, samples });
  }
  const filePins = await sourceFilePins(sourceRoot);
  let comparedBaselineSha256: string | null = null;
  if (process.env.THROUGHPUT_MODE === "candidate") {
    const baselinePath = process.env.THROUGHPUT_BENCHMARK_BASELINE;
    if (!baselinePath || !isAbsolute(baselinePath)) throw new Error("Absolute THROUGHPUT_BENCHMARK_BASELINE required for candidate measurement");
    const baselineRaw = await readFile(baselinePath);
    const baseline = JSON.parse(baselineRaw.toString("utf8"));
    expect(baseline.evidenceKind).toBe("career-throughput-local-benchmark-v1");
    expect(baseline.mode).toBe("baseline");
    expect(baseline.runtime).toBe(process.version);
    expect(baseline.filePins.test).toBe(filePins.test);
    expect(baseline.filePins.config).toBe(filePins.config);
    expect(workloads.map(row => row.name)).toStrictEqual(baseline.workloads.map((row: { name: string }) => row.name));
    for (const [index, row] of workloads.entries()) {
      const expected = baseline.workloads[index];
      expect(row.workloadSize).toStrictEqual(expected.workloadSize);
      expect(restore(row.inputSnapshot!)).toStrictEqual(restore(expected.inputSnapshot));
      expect(restore(row.exactResult!)).toStrictEqual(restore(expected.exactResult));
      expect(row.inputJson).toBe(expected.inputJson);
      expect(row.resultJson).toBe(expected.resultJson);
    }
    comparedBaselineSha256 = sha(baselineRaw);
  }
  const hostCpus = cpus();
  const artifact = { schemaVersion: 1, evidenceKind: "career-throughput-local-benchmark-v1",
    recordedAtUtc: new Date().toISOString(), mode: process.env.THROUGHPUT_MODE,
    sourceRoot: resolve(sourceRoot), sourceIdentity: process.env.THROUGHPUT_SOURCE_COMMIT,
    filePins, comparedBaselineSha256, runtime: process.version, v8: process.versions.v8,
    executable: process.execPath, execArgv: process.execArgv, platform: process.platform, arch: process.arch,
    cpuModel: hostCpus[0]?.model, logicalCpus: hostCpus.length, totalMemoryBytes: totalmem(),
    warmups, measuredSamples, fixtureBatchIsSynthetic: true, fixtureCount, movementCount,
    measuredOperations: ["processWeeklyTick", "compactLongCareerHistory"],
    measurement: "Only the production operation is timed; preparation, assertions, serialization and RNG continuation are excluded",
    cpuUnits: "microseconds", wallUnits: "milliseconds", thresholdApplied: false,
    releaseCampaignAccepted: false, workloads };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
});
