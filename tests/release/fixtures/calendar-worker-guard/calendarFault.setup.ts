import { vi } from "vitest";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";

const observed = vi.hoisted(() => ({
  attempts: 0, returns: 0, starts: 0, seq: 0,
  store: null as any, seasonLength: null as any,
}));
const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
const spec = catalog.cases.find((entry: any) => entry.id === process.env.CALENDAR_E2E_CASE);
assert(spec, "TEST_CALENDAR_SETUP_ORACLE: unknown case");
const directory = process.env.CALENDAR_E2E_DIRECTORY!;
assert(directory, "TEST_CALENDAR_SETUP_ORACLE: missing case directory");
const journalPath = join(directory, "setup-driver.jsonl");

function journal(event: string, facts: Record<string, unknown> = {}) {
  assert(observed.seq < 32, "TEST_CALENDAR_SETUP_ORACLE: journal bound");
  const row = { schemaVersion: 1, case: spec.id, seq: ++observed.seq,
    pid: process.pid, ppid: process.ppid, event, ...facts };
  const raw = JSON.stringify(row) + "\n";
  if (observed.seq === 1) writeFileSync(journalPath, raw, { flag: "wx" });
  else appendFileSync(journalPath, raw);
}
function snapshot() {
  const state = observed.store.getState().gameState;
  assert(state, "TEST_CALENDAR_SETUP_ORACLE: missing real state");
  return { season: state.currentSeason, week: state.currentWeek,
    totalWeeksPlayed: state.totalWeeksPlayed,
    seasonLength: observed.seasonLength(state.fixtures, state.currentSeason),
    leagueCount: Object.keys(state.leagues).length, clubCount: Object.keys(state.clubs).length,
    englandLeagues: catalog.fresh.englandLeagues.map(([id]: [string, number]) => {
      const league = state.leagues[id];
      assert(league, "TEST_CALENDAR_SETUP_ORACLE: missing England league " + id);
      return { id, country: league.country, tier: league.tier,
        clubCount: league.clubIds.length, uniqueClubCount: new Set(league.clubIds).size };
    }) };
}
function mutate() {
  const state = observed.store.getState().gameState;
  const before = snapshot();
  let target: Record<string, unknown>;
  if (spec.fault === "backwards-week") {
    assert.equal(before.season, 1); assert.equal(before.week, 3);
    assert.equal(before.totalWeeksPlayed, 2);
    observed.store.setState({ gameState: { ...state, currentWeek: 1 } });
    target = { field: "currentWeek", before: 3, after: 1 };
  } else if (spec.fault === "fixture-week-47") {
    const fixture = (Object.values(state.fixtures) as any[])
      .filter(row => row.season === 1 && row.week === 46
        && row.leagueId === "league-championship" && row.played === false)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    assert(fixture, "TEST_CALENDAR_SETUP_ORACLE: missing real week-46 Championship fixture");
    assert.equal(before.seasonLength, 46);
    observed.store.setState({ gameState: { ...state,
      fixtures: { ...state.fixtures, [fixture.id]: { ...fixture, week: 47 } } } });
    target = { field: "fixture.week", id: fixture.id, leagueId: fixture.leagueId,
      season: fixture.season, played: fixture.played, before: 46, after: 47 };
  } else if (spec.fault === "duplicate-membership") {
    const league = state.leagues["league-championship"];
    assert.equal(league.clubIds.length, 24); assert.equal(new Set(league.clubIds).size, 24);
    const clubId = league.clubIds[0];
    assert(state.clubs[clubId], "TEST_CALENDAR_SETUP_ORACLE: unknown actual club");
    observed.store.setState({ gameState: { ...state, leagues: { ...state.leagues,
      [league.id]: { ...league, clubIds: [...league.clubIds, clubId] } } } });
    target = { field: "league.clubIds", id: league.id, repeatedClubId: clubId,
      before: 24, after: 25, uniqueAfter: 24 };
  } else throw new Error("TEST_CALENDAR_SETUP_ORACLE: unexpected mutation");
  journal("fault-applied", { fault: spec.fault, phase: spec.phase, target, before, after: snapshot() });
}

// This factory is invoked lazily by the original test/driver import graph.
// Do not import gameStore before the original soak registers its DB/save mocks.
vi.mock("@/stores/gameStore", async importOriginal => {
  const actual = await importOriginal<any>();
  observed.store = actual.useGameStore;
  observed.seasonLength = (await import("@/engine/core/gameDate")).getSeasonLength;
  const originalStart = actual.useGameStore.getState().startNewGame;
  actual.useGameStore.setState({ startNewGame: async (...args: any[]) => {
    journal("start-attempt", { config: args[0],
      selectedScenarioId: actual.useGameStore.getState().selectedScenarioId });
    const result = await originalStart(...args);
    observed.starts += 1;
    assert.equal(observed.starts, 1, "TEST_CALENDAR_SETUP_ORACLE: unexpected second career");
    journal("real-start-return", { snapshot: snapshot() });
    if (spec.phase === "fresh") mutate();
    journal("start-wrapper-return", { snapshot: snapshot() });
    return result;
  } });
  return { ...actual };
});

// The alias resolves to the exact original autonomousYouthCareerDriver.ts.
vi.mock("@calendar-e2e-driver", async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, driveAutonomousYouthCareerWeek: async (...args: any[]) => {
    observed.attempts += 1;
    journal("drive-attempt", { attempt: observed.attempts, snapshot: snapshot() });
    if (observed.returns >= spec.realDrives) {
      journal("bound-stop", { attempt: observed.attempts, realReturns: observed.returns });
      throw new Error(catalog.boundMarker + spec.id);
    }
    const timing = await actual.driveAutonomousYouthCareerWeek(...args);
    observed.returns += 1;
    const real = snapshot();
    assert.equal(real.season, 1, "TEST_CALENDAR_SETUP_ORACLE: unexpected real season");
    assert.equal(real.week, observed.returns + 1, "TEST_CALENDAR_SETUP_ORACLE: unexpected real week");
    assert.equal(real.totalWeeksPlayed, observed.returns, "TEST_CALENDAR_SETUP_ORACLE: unexpected real totalWeeksPlayed");
    journal("real-drive-return", { realReturn: observed.returns, snapshot: real, timing });
    if (spec.phase === "post" && spec.fault !== "none" && observed.returns === spec.realDrives) mutate();
    journal("drive-wrapper-return", { realReturn: observed.returns, snapshot: snapshot() });
    return timing; // Exact real timing result; no copied weekly implementation.
  } };
});

journal("setup-ready", { execArgv: process.execArgv,
  v8HeapLimitBytes: getHeapStatistics().heap_size_limit,
  gcType: typeof (globalThis as any).gc });
