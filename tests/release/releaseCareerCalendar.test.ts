import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Fixture, GameState, League } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameDate";
import { createRNG } from "@/engine/rng";
import { ensureSeasonFixtures } from "@/engine/world/fixtures";
import { simulateAbstractCompetitionWeek } from "@/engine/world/abstractCompetition";
import {
  applyRelegationResult,
  processRelegationPromotion,
} from "@/engine/world/relegation";
import { ENGLAND_LEAGUES } from "@/data/england";
// Tests-first seam: Root adds this release-only module after these tests exist.
import { admitReleaseCareerCalendar } from "./releaseCareerCalendar";

// These are the same two persistence mocks used by the actual release soak.
// World generation, league data, fixture generation and club movement are real.
vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: {
      put: async () => undefined,
      clear: async () => undefined,
    },
  },
}));

const DIAGNOSTIC = "ERR_RELEASE_CALENDAR";
const ENGLAND_IDS = [...ENGLAND_LEAGUES]
  .sort((left, right) => left.tier - right.tier)
  .map((league) => league.id);
type Mutation = (state: GameState) => void;
type TransitionCheck = "assertBeforeDrive" | "assertAfterDrive";

let initial: GameState;
let scheduledLeagueIds: string[];

beforeAll(async () => {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Release",
    scoutLastName: "Soak",
    scoutAge: 24,
    specialization: "youth",
    difficulty: "normal",
    worldSeed: "release-calendar-integration-real-world-v1",
    selectedCountries: ["england"],
    startingCountry: "england",
    nationality: "English",
    skillAllocations: {
      technicalEye: 2,
      psychologicalRead: 2,
      playerJudgment: 2,
      potentialAssessment: 2,
    },
    openingMode: "desk",
    originId: "academy-apprentice",
    flawId: "fragile-network",
    doctrineIds: ["evidence-first"],
  });
  const actual = useGameStore.getState().gameState;
  if (!actual) throw new Error("Real release-calendar world did not initialize");
  initial = structuredClone(actual);
  scheduledLeagueIds = [...new Set(
    Object.values(initial.fixtures).map((fixture) => fixture.leagueId),
  )].sort();
  expect(scheduledLeagueIds).toEqual([...ENGLAND_IDS].sort());
  expect(initial).toMatchObject({
    currentSeason: 1, currentWeek: 1, totalWeeksPlayed: 0,
  });
}, 60_000);

function fresh(): GameState {
  return structuredClone(initial);
}

function england(state: GameState): League[] {
  return ENGLAND_IDS.map((id) => state.leagues[id]);
}

function firstFixture(state: GameState): Fixture {
  const fixture = Object.values(state.fixtures).find(
    (item) => item.leagueId === ENGLAND_IDS[0] && item.season === state.currentSeason,
  );
  if (!fixture) throw new Error("Test setup lacks a real Premier League fixture");
  return fixture;
}

function setField(target: object, field: string, value: unknown): void {
  (target as unknown as Record<string, unknown>)[field] = value;
}

function expectCalendarError(action: () => unknown): void {
  let failure: unknown;
  try { action(); } catch (error) { failure = error; }
  expect(failure, "Only the calendar diagnostic counts as a refusal").toBeInstanceOf(Error);
  expect((failure as Error).message).toContain(DIAGNOSTIC);
}

function countryClubSets(state: GameState): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const league of Object.values(state.leagues)) {
    (result[league.country] ??= []).push(...league.clubIds);
  }
  for (const ids of Object.values(result)) ids.sort();
  return result;
}

function regenerateCurrentSchedule(state: GameState): void {
  state.fixtures = ensureSeasonFixtures(
    createRNG(`${state.seed}-calendar-integration-s${state.currentSeason}`),
    state.leagues,
    {},
    state.currentSeason,
    scheduledLeagueIds,
    Math.max(1, state.currentSeason - 1),
  );
}

// Deliberate diagnostic setup, not weekly simulation or completed-career proof.
// Dates/counters are explicit expected boundaries; schedules use the real engine.
function syntheticBoundary(season: number, week: number, ticks: number): GameState {
  const state = fresh();
  state.currentSeason = season;
  state.currentWeek = week;
  state.totalWeeksPlayed = ticks;
  // Actual gameLoop rollover stamps all league seasons, including secondary pools.
  for (const league of Object.values(state.leagues)) league.season = season;
  state.fixtures = ensureSeasonFixtures(
    createRNG(`${state.seed}-fixtures-s${season}`),
    state.leagues,
    state.fixtures,
    season,
    scheduledLeagueIds,
    Math.max(1, season - 1),
  );
  return state;
}

const MALFORMED_NUMBERS: Array<[string, unknown]> = [
  ["negative", -1], ["fractional", 1.25], ["NaN", Number.NaN],
  ["infinity", Number.POSITIVE_INFINITY], ["negative infinity", Number.NEGATIVE_INFINITY],
  ["unsafe", Number.MAX_SAFE_INTEGER + 1], ["string", "1"],
  ["null", null], ["missing", undefined], ["boolean", true],
];

const FIXTURE_MUTATIONS: Array<[string, Mutation]> = [
  ["missing explicit season even with a generated legacy ID", (state) => {
    delete firstFixture(state).season;
  }],
  ["truly unscoped fixture", (state) => {
    const fixture = firstFixture(state);
    delete state.fixtures[fixture.id];
    fixture.id = "unscoped-release-friendly";
    delete fixture.season;
    state.fixtures[fixture.id] = fixture;
  }],
  ["future fixture season", (state) => { firstFixture(state).season = 2; }],
  ["zero fixture season", (state) => { firstFixture(state).season = 0; }],
  ["zero fixture week", (state) => { firstFixture(state).week = 0; }],
  ["NaN fixture week after admission", (state) => { firstFixture(state).week = Number.NaN; }],
  ["fractional fixture season after admission", (state) => { firstFixture(state).season = 1.25; }],
  ["week47 widens the world calendar", (state) => { firstFixture(state).week = 47; }],
  ["Premier League week39 is outside its own38 rounds", (state) => {
    firstFixture(state).week = 39;
  }],
  ["unknown fixture league", (state) => { firstFixture(state).leagueId = "unknown-league"; }],
  ["missing fixture league", (state) => { setField(firstFixture(state), "leagueId", undefined); }],
  ["unknown home participant", (state) => { firstFixture(state).homeClubId = "unknown-club"; }],
  ["missing away participant", (state) => { setField(firstFixture(state), "awayClubId", undefined); }],
  ["self-playing participants", (state) => {
    const fixture = firstFixture(state);
    fixture.awayClubId = fixture.homeClubId;
  }],
  ["current participant belongs to another league", (state) => {
    firstFixture(state).homeClubId = england(state)[1].clubIds[0];
  }],
  ["missing every week46 fixture", (state) => {
    for (const [id, fixture] of Object.entries(state.fixtures)) {
      if (fixture.season === 1 && fixture.week === 46) delete state.fixtures[id];
    }
  }],
  ["missing one final-round fixture despite remaining week46 rows", (state) => {
    const fixture = Object.values(state.fixtures).find((item) => item.week === 46);
    if (!fixture) throw new Error("Test setup lacks a real final-round fixture");
    delete state.fixtures[fixture.id];
    expect(getSeasonLength(state.fixtures, 1)).toBe(46);
  }],
  ["same row count and max week but duplicated pair and missing pair", (state) => {
    const fixture = firstFixture(state);
    const other = Object.values(state.fixtures).find((item) => (
      item.leagueId === fixture.leagueId && item.week === fixture.week && item.id !== fixture.id
    ));
    if (!other) throw new Error("Test setup lacks a second real same-week fixture");
    fixture.homeClubId = other.homeClubId;
    fixture.awayClubId = other.awayClubId;
    expect(getSeasonLength(state.fixtures, 1)).toBe(46);
  }],
  ["no current schedule", (state) => { state.fixtures = {}; }],
];

const TOPOLOGY_MUTATIONS: Array<[string, Mutation]> = [
  ["duplicate membership inside one league", (state) => {
    const league = england(state)[0];
    league.clubIds[1] = league.clubIds[0];
  }],
  ["duplicate membership across leagues", (state) => {
    england(state)[0].clubIds[0] = england(state)[1].clubIds[0];
  }],
  ["unknown club membership", (state) => { england(state)[0].clubIds[0] = "unknown-club"; }],
  ["missing club record", (state) => { delete state.clubs[england(state)[0].clubIds[0]]; }],
  ["shrunk league", (state) => { england(state)[0].clubIds.pop(); }],
  ["grown league with a new internally consistent club", (state) => {
    const league = england(state)[0];
    const source = state.clubs[league.clubIds[0]];
    const id = "new-release-club";
    state.clubs[id] = { ...source, id };
    league.clubIds.push(id);
    regenerateCurrentSchedule(state);
  }],
  ["extra unlisted club", (state) => {
    const source = state.clubs[england(state)[0].clubIds[0]];
    state.clubs["unlisted-release-club"] = { ...source, id: "unlisted-release-club" };
  }],
  ["inconsistent Club.leagueId", (state) => {
    state.clubs[england(state)[0].clubIds[0]].leagueId = ENGLAND_IDS[1];
  }],
  ["missing league", (state) => { delete state.leagues[ENGLAND_IDS[0]]; }],
  ["extra unknown league", (state) => {
    state.leagues["new-release-league"] = {
      ...england(state)[0], id: "new-release-league", tier: 99, clubIds: [],
    };
  }],
  ["duplicate league identity under a different record key", (state) => {
    england(state)[1].id = ENGLAND_IDS[0];
  }],
  ["changed country club identity with unchanged cardinality and valid new schedule", (state) => {
    const league = england(state)[0];
    const oldId = league.clubIds[0];
    const newId = "replacement-release-club";
    state.clubs[newId] = { ...state.clubs[oldId], id: newId };
    delete state.clubs[oldId];
    league.clubIds[0] = newId;
    regenerateCurrentSchedule(state);
  }],
  ["cross-country swap with unchanged counts and global club identities", (state) => {
    const home = england(state)[0];
    const secondary = Object.values(state.leagues).find((league) => (
      league.country !== home.country && league.clubIds.length > 0
    ));
    if (!secondary) throw new Error("Real world lacks a secondary-country club");
    const homeId = home.clubIds[0];
    const otherId = secondary.clubIds[0];
    home.clubIds[0] = otherId;
    secondary.clubIds[0] = homeId;
    state.clubs[homeId].leagueId = secondary.id;
    state.clubs[otherId].leagueId = home.id;
    regenerateCurrentSchedule(state);
  }],
  ["duplicate membership in an unscheduled secondary-country league", (state) => {
    const secondary = Object.values(state.leagues).find((league) => (
      !scheduledLeagueIds.includes(league.id) && league.clubIds.length >= 2
    ));
    if (!secondary) throw new Error("Real world lacks its secondary-country talent pools");
    secondary.clubIds[1] = secondary.clubIds[0];
  }],
];

describe("release career calendar with the actual fresh England world", () => {
  it("derives the immutable30-season receipt from real topology and full schedules", () => {
    const state = fresh();
    expect(england(state).map((league) => league.clubIds.length)).toEqual([20, 24, 24, 24]);
    for (const league of england(state)) {
      const fixtures = Object.values(state.fixtures).filter((fixture) => fixture.leagueId === league.id);
      expect(fixtures).toHaveLength(league.clubIds.length * (league.clubIds.length - 1));
      expect(fixtures.every((fixture) => fixture.season === 1)).toBe(true);
    }
    expect(getSeasonLength(state.fixtures, 1)).toBe(46);
    const guard = admitReleaseCareerCalendar(state, 30);
    expect(guard.admission).toEqual({
      kind: "fresh-builtin-england-v1",
      leagueClubCounts: [20, 24, 24, 24],
      weeksPerSeason: 46,
      maxCanonicalTicks: 1380,
    });
    expect(() => guard.assertBeforeDrive(state, 0)).not.toThrow();
  });

  it.each([
    ["zero", 0], ["negative", -1], ["fractional", 1.5], ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY], ["negative infinity", Number.NEGATIVE_INFINITY],
    ["unsafe count", Number.MAX_SAFE_INTEGER + 1],
    ["safe count with unsafe multiplication", Number.MAX_SAFE_INTEGER],
  ])("refuses %s seasonCount", (_name, count) => {
    expectCalendarError(() => admitReleaseCareerCalendar(fresh(), count as number));
  });

  it.each(["currentSeason", "currentWeek", "totalWeeksPlayed"] as const)(
    "refuses non-fresh %s admission", (field) => {
      const state = fresh();
      state[field] = field === "totalWeeksPlayed" ? 1 : 2;
      expectCalendarError(() => admitReleaseCareerCalendar(state, 30));
    },
  );

  for (const field of ["currentSeason", "currentWeek", "totalWeeksPlayed"] as const) {
    it.each(MALFORMED_NUMBERS)(`refuses ${field} with %s at admission`, (_name, value) => {
      const state = fresh();
      setField(state, field, value);
      expectCalendarError(() => admitReleaseCareerCalendar(state, 30));
    });
  }

  it.each(["currentSeason", "currentWeek"] as const)("refuses zero %s", (field) => {
    const state = fresh();
    state[field] = 0;
    expectCalendarError(() => admitReleaseCareerCalendar(state, 30));
  });

  for (const [name, mutate] of [...FIXTURE_MUTATIONS, ...TOPOLOGY_MUTATIONS]) {
    it(`refuses admission: ${name}`, () => {
      const state = fresh();
      mutate(state);
      expectCalendarError(() => admitReleaseCareerCalendar(state, 30));
    });
    for (const method of ["assertBeforeDrive", "assertAfterDrive"] as const) {
      it(`refuses ${method} corruption: ${name}`, () => {
        const guard = admitReleaseCareerCalendar(fresh(), 30);
        const state = fresh();
        state.currentWeek = 2;
        state.totalWeeksPlayed = 1;
        mutate(state);
        expectCalendarError(() => guard[method](state, 1));
      });
    }
  }

  for (const field of ["season", "week"] as const) {
    it.each(MALFORMED_NUMBERS)(`refuses malformed fixture ${field}: %s`, (_name, value) => {
      const state = fresh();
      setField(firstFixture(state), field, value);
      expectCalendarError(() => admitReleaseCareerCalendar(state, 30));
    });
  }

  it.each(TOPOLOGY_MUTATIONS)("refuses rollover topology corruption: %s", (_name, mutate) => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    const state = syntheticBoundary(2, 1, 46);
    mutate(state);
    expectCalendarError(() => guard.assertAfterDrive(state, 46));
    expectCalendarError(() => guard.assertBeforeDrive(state, 46));
  });

  for (const method of ["assertBeforeDrive", "assertAfterDrive"] as const satisfies readonly TransitionCheck[]) {
    it.each([
      ["unchanged", 1, 2], ["backwards", 1, 1], ["skipped", 1, 4],
      ["early season rollover", 2, 1], ["week outside ceiling", 1, 47],
    ])(`${method} rejects %s after two completed ticks`, (_name, season, week) => {
      const guard = admitReleaseCareerCalendar(fresh(), 30);
      const state = fresh();
      state.currentSeason = season as number;
      state.currentWeek = week as number;
      state.totalWeeksPlayed = 2;
      expectCalendarError(() => guard[method](state, 2));
    });
    for (const field of ["currentSeason", "currentWeek", "totalWeeksPlayed"] as const) {
      it.each(MALFORMED_NUMBERS)(`${method} refuses malformed ${field}: %s`, (_name, value) => {
        const guard = admitReleaseCareerCalendar(fresh(), 30);
        const state = fresh();
        state.currentWeek = 3;
        state.totalWeeksPlayed = 2;
        setField(state, field, value);
        expectCalendarError(() => guard[method](state, 2));
      });
    }
    it(`${method} refuses a valid date with a mismatched integer counter`, () => {
      const guard = admitReleaseCareerCalendar(fresh(), 30);
      const state = fresh();
      state.currentWeek = 3;
      state.totalWeeksPlayed = 1;
      expectCalendarError(() => guard[method](state, 2));
    });
  }

  it("accepts the expected two-tick date on the real world without claiming real drives", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    const state = fresh();
    state.currentWeek = 3;
    state.totalWeeksPlayed = 2;
    expect(() => guard.assertAfterDrive(state, 2)).not.toThrow();
    expect(() => guard.assertBeforeDrive(state, 2)).not.toThrow();
    expectCalendarError(() => guard.assertComplete(state, 2));
  });

  it("accepts actual secondary abstract results and still refuses their week47 corruption", () => {
    const state = fresh();
    const guard = admitReleaseCareerCalendar(state, 30);
    const abstractWeek = simulateAbstractCompetitionWeek({
      worldSeed: state.seed,
      season: 1,
      week: 1,
      seasonLength: guard.admission.weeksPerSeason,
      leagues: state.leagues,
      clubs: state.clubs,
      players: state.players,
      fixtures: state.fixtures,
      matchRatings: state.matchRatings,
      disciplinaryRecords: state.disciplinaryRecords,
    });
    expect(abstractWeek.fixturesPlayed.length).toBeGreaterThan(0);
    for (const fixture of abstractWeek.fixturesPlayed) {
      expect(fixture.simulationDetail).toBe("abstract");
      expect(scheduledLeagueIds).not.toContain(fixture.leagueId);
      state.fixtures[fixture.id] = fixture;
    }
    state.matchRatings = { ...state.matchRatings, ...abstractWeek.matchRatingsByFixture };
    state.currentWeek = 2;
    state.totalWeeksPlayed = 1;
    // This invokes the actual abstract producer, not a canonical weekly drive.
    expect(() => guard.assertAfterDrive(state, 1)).not.toThrow();
    expect(() => guard.assertBeforeDrive(state, 1)).not.toThrow();
    const invalid = structuredClone(state);
    invalid.fixtures[abstractWeek.fixturesPlayed[0].id].week = 47;
    expectCalendarError(() => guard.assertAfterDrive(invalid, 1));
  });

  for (const method of ["assertBeforeDrive", "assertAfterDrive", "assertComplete"] as const) {
    it.each(MALFORMED_NUMBERS)(`${method} rejects malformed completedTicks: %s`, (_name, value) => {
      const guard = admitReleaseCareerCalendar(fresh(), 30);
      expectCalendarError(() => guard[method](fresh(), value as number));
    });
  }

  it("does not recapture mutated initial aliases or widen the admitted receipt", () => {
    const admittedState = fresh();
    const guard = admitReleaseCareerCalendar(admittedState, 30);
    const oldReceipt = structuredClone(guard.admission);
    firstFixture(admittedState).week = 47;
    admittedState.currentWeek = 2;
    admittedState.totalWeeksPlayed = 1;
    expectCalendarError(() => guard.assertAfterDrive(admittedState, 1));
    expect(guard.admission).toEqual(oldReceipt);
    expect(guard.admission.maxCanonicalTicks).toBe(1380);
  });

  it("keeps admitted country identities when the same original arrays are mutated", () => {
    const admittedState = fresh();
    const guard = admitReleaseCareerCalendar(admittedState, 30);
    const replaceIdentity = TOPOLOGY_MUTATIONS.find(([name]) => name.startsWith("changed country"));
    if (!replaceIdentity) throw new Error("Missing declared identity mutation");
    replaceIdentity[1](admittedState);
    admittedState.currentWeek = 2;
    admittedState.totalWeeksPlayed = 1;
    expectCalendarError(() => guard.assertBeforeDrive(admittedState, 1));
  });

  it("enforces method-specific zero/early/exact/extra tick endpoints", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    expectCalendarError(() => guard.assertAfterDrive(fresh(), 0));
    expectCalendarError(() => guard.assertComplete(fresh(), 0));
    const early = syntheticBoundary(30, 46, 1379);
    expect(() => guard.assertBeforeDrive(early, 1379)).not.toThrow();
    expectCalendarError(() => guard.assertComplete(early, 1379));
    const terminal = syntheticBoundary(31, 1, 1380);
    expectCalendarError(() => guard.assertBeforeDrive(terminal, 1380));
    expect(() => guard.assertAfterDrive(terminal, 1380)).not.toThrow();
    expect(() => guard.assertComplete(terminal, 1380)).not.toThrow();
    const extra = syntheticBoundary(31, 2, 1381);
    expectCalendarError(() => guard.assertBeforeDrive(extra, 1381));
    expectCalendarError(() => guard.assertAfterDrive(extra, 1381));
    expectCalendarError(() => guard.assertComplete(extra, 1381));
  });

  it("refuses a false final date even when the counter is exactly1380", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    for (const [season, week] of [[30, 46], [31, 2], [32, 1]]) {
      const state = syntheticBoundary(season, week, 1380);
      expectCalendarError(() => guard.assertAfterDrive(state, 1380));
      expectCalendarError(() => guard.assertComplete(state, 1380));
    }
  });

  for (const field of ["currentSeason", "currentWeek", "totalWeeksPlayed"] as const) {
    it.each(MALFORMED_NUMBERS)(`Complete refuses malformed ${field} in an otherwise terminal world: %s`, (_name, value) => {
      const guard = admitReleaseCareerCalendar(fresh(), 30);
      const state = syntheticBoundary(31, 1, 1380);
      setField(state, field, value);
      expectCalendarError(() => guard.assertComplete(state, 1380));
    });
  }

  it("Complete refuses a terminal date with a mismatched integer counter", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    const state = syntheticBoundary(31, 1, 1379);
    expectCalendarError(() => guard.assertComplete(state, 1380));
  });

  it("refuses loss of the new current season's final round at a synthetic rollover", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    const state = syntheticBoundary(2, 1, 46);
    expect(() => guard.assertAfterDrive(state, 46)).not.toThrow();
    for (const [id, fixture] of Object.entries(state.fixtures)) {
      if (fixture.season === 2 && fixture.week === 46) delete state.fixtures[id];
    }
    expectCalendarError(() => guard.assertAfterDrive(state, 46));
    expectCalendarError(() => guard.assertBeforeDrive(state, 46));
  });

  it("accepts synthetic S30W46 to S31W1 with real promotion and real new fixtures; not a full career", () => {
    const guard = admitReleaseCareerCalendar(fresh(), 30);
    const before = syntheticBoundary(30, 46, 1379);
    for (const fixture of Object.values(before.fixtures)) {
      if (fixture.season === 30) {
        fixture.played = true;
        fixture.homeGoals = 1;
        fixture.awayGoals = 0;
      }
    }
    expect(() => guard.assertBeforeDrive(before, 1379)).not.toThrow();
    const movement = processRelegationPromotion(before, createRNG("calendar-real-movement-s30"));
    expect(movement.events.some((event) => event.type === "promoted")).toBe(true);
    expect(movement.events.some((event) => event.type === "relegated")).toBe(true);
    const applied = applyRelegationResult(before, movement);
    const after: GameState = {
      ...before, ...applied,
      currentSeason: 31, currentWeek: 1, totalWeeksPlayed: 1380,
    };
    for (const league of Object.values(after.leagues)) league.season = 31;
    after.fixtures = ensureSeasonFixtures(
      createRNG(`${after.seed}-fixtures-s31`),
      after.leagues,
      before.fixtures,
      31,
      scheduledLeagueIds,
      30,
    );
    expect(england(after).map((league) => league.clubIds.length)).toEqual([20, 24, 24, 24]);
    expect(countryClubSets(after)).toEqual(countryClubSets(initial));
    expect(Object.keys(after.clubs).sort()).toEqual(Object.keys(initial.clubs).sort());
    const promoted = movement.events.find((event) => event.type === "promoted");
    if (!promoted) throw new Error("Real movement did not produce a promoted club");
    expect(after.clubs[promoted.clubId].leagueId).toBe(promoted.toLeagueId);
    const historical = Object.values(after.fixtures).find((fixture) => (
      fixture.season === 30 && fixture.leagueId === promoted.fromLeagueId
      && (fixture.homeClubId === promoted.clubId || fixture.awayClubId === promoted.clubId)
    ));
    expect(historical, "Keep actual pre-promotion fixture history").toBeDefined();
    if (!historical) throw new Error("Missing retained promoted-club fixture");
    expect(historical.played).toBe(true);
    expect(historical.leagueId).not.toBe(after.clubs[promoted.clubId].leagueId);
    for (const fixture of Object.values(after.fixtures).filter((item) => item.season === 31)) {
      expect(after.clubs[fixture.homeClubId].leagueId).toBe(fixture.leagueId);
      expect(after.clubs[fixture.awayClubId].leagueId).toBe(fixture.leagueId);
    }
    expect(getSeasonLength(after.fixtures, 31)).toBe(46);
    expect(() => guard.assertAfterDrive(after, 1380)).not.toThrow();
    expect(() => guard.assertComplete(after, 1380)).not.toThrow();

    // Retention may remove older rows; only the CURRENT schedule must be complete.
    const compacted = structuredClone(after);
    delete compacted.fixtures[historical.id];
    expect(() => guard.assertComplete(compacted, 1380)).not.toThrow();

    // A historical membership allowance must not admit a bad current-season row.
    const invalidCurrent = structuredClone(after);
    const oldLeagueFixture = Object.values(invalidCurrent.fixtures).find((fixture) => (
      fixture.season === 31 && fixture.leagueId === promoted.fromLeagueId
    ));
    if (!oldLeagueFixture) throw new Error("Missing real old-league season31 schedule");
    oldLeagueFixture.homeClubId = promoted.clubId;
    expectCalendarError(() => guard.assertAfterDrive(invalidCurrent, 1380));
  });
});
