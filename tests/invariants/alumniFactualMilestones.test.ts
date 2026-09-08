import { describe, expect, it, vi } from "vitest";
import type { AlumniRecord, Club, Fixture, GameState, Player, PlayerMatchRating } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { calculateLegacyScore, processAlumniWeek } from "@/engine/youth/alumni";
import { processWeeklyPostTickSystems } from "@/stores/actions/weeklyPostTickSystems";
import { processWeeklyTick } from "@/engine/core/gameLoop";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

function alumnus(): AlumniRecord {
  return { id: "alumni", playerId: "player", placedClubId: "club", currentClubId: "club",
    placedWeek: 2, placedSeason: 1, milestones: [], careerUpdates: [], careerSnapshots: [],
    seasonStats: [], currentStatus: "academy", becameContact: false };
}
function player(): Player {
  return { id: "player", firstName: "Alex", lastName: "Reed", clubId: "club", age: 18,
    currentAbility: 130, potentialAbility: 180, injured: false,
    injuryWeeksRemaining: 0 } as Player;
}
const clubs = { club: { id: "club", name: "Riverside", playerIds: [], academyPlayerIds: ["player"] } as unknown as Club };
function ledger(count = 0, rating = 7.5) {
  const fixtures: Record<string, Fixture> = {};
  const matchRatings: Record<string, Record<string, PlayerMatchRating>> = {};
  for (let i = 0; i < count; i++) {
    const id = `match-${i}`;
    fixtures[id] = { id, season: 1, week: i + 3, played: true,
      homeClubId: "club", awayClubId: "opponent", leagueId: "league" };
    matchRatings[id] = { player: { playerId: "player", fixtureId: id, minutesPlayed: 90,
      started: true, rating, stats: { goals: i === 0 ? 1 : 0 }, source: "simulated", eventCount: 1 } };
  }
  return { fixtures, matchRatings };
}
function tick(record = alumnus(), matches = ledger(), subject = player(), week = 30) {
  return processAlumniWeek(createRNG("alumni-facts"), [record], { player: subject }, clubs,
    week, 1, [], matches);
}

describe("factual alumni milestones", () => {
  it("cannot manufacture achievements, first-team status or contacts from hidden CA/PA alone", () => {
    const baseline = tick(alumnus(), ledger(), { ...player(), currentAbility: 30, potentialAbility: 40 });
    const high = tick();
    expect(high).toEqual(baseline);
    expect(high.newMilestones).toEqual([]);
    expect(high.updatedAlumni[0].currentStatus).toBe("academy");
    expect(high.contactPromotions).toEqual([]);
  });

  it("credits dated post-placement participation and goals, including an academy player's senior appearance", () => {
    const result = tick(alumnus(), ledger(1), { ...player(), currentAbility: 30, potentialAbility: 40 });
    expect(result.newMilestones.map((m) => m.type)).toEqual(["firstTeamDebut", "firstGoal"]);
    expect(result.newMilestones.every((m) => m.week === 3 && m.season === 1)).toBe(true);
    expect(result.updatedAlumni[0].currentStatus).toBe("firstTeam");
    expect(result.newMessages).toHaveLength(2);
    expect(result.newMessages.every((m) => !m.body.includes("age"))).toBe(true);
  });

  it("rejects pre-placement, same-week, future, undated, unplayed, duplicate and mismatched evidence", () => {
    for (const invalidate of [
      (x: ReturnType<typeof ledger>) => { x.fixtures["match-0"].week = 1; },
      (x: ReturnType<typeof ledger>) => { x.fixtures["match-0"].week = 2; },
      (x: ReturnType<typeof ledger>) => { x.fixtures["match-0"].week = 31; },
      (x: ReturnType<typeof ledger>) => { delete x.fixtures["match-0"].season; },
      (x: ReturnType<typeof ledger>) => { x.fixtures["match-0"].played = false; },
      (x: ReturnType<typeof ledger>) => { x.matchRatings["match-0"].player.fixtureId = "different"; },
      (x: ReturnType<typeof ledger>) => { x.matchRatings["match-0"].player.playerId = "someone-else"; },
      (x: ReturnType<typeof ledger>) => { x.matchRatings["match-0"].player.minutesPlayed = 0; },
      (x: ReturnType<typeof ledger>) => { x.matchRatings["match-0"].player.minutesPlayed = Number.NaN; },
    ]) {
      const evidence = ledger(1); invalidate(evidence);
      expect(tick(alumnus(), evidence).newMilestones).toEqual([]);
    }
    const duplicate = ledger(19);
    duplicate.fixtures.alias = duplicate.fixtures["match-0"];
    duplicate.matchRatings.alias = duplicate.matchRatings["match-0"];
    expect(tick(alumnus(), duplicate).newMilestones.some((m) => m.type === "wonderkidStatus")).toBe(false);
  });

  it("keeps absent minutes unknown even if a legacy record says started", () => {
    const evidence = ledger(1);
    delete evidence.matchRatings["match-0"].player.minutesPlayed;
    expect(tick(alumnus(), evidence).newMilestones).toEqual([]);
  });

  it("recognizes sustained young-player performance, independent of hidden potential", () => {
    const low = { ...player(), currentAbility: 30, potentialAbility: 40 };
    expect(tick(alumnus(), ledger(19), low).newMilestones.some((m) => m.type === "wonderkidStatus")).toBe(false);
    expect(tick(alumnus(), ledger(20, 7.49), low).newMilestones.some((m) => m.type === "wonderkidStatus")).toBe(false);
    const result = tick(alumnus(), ledger(20), low);
    expect(result.newMilestones.map((m) => m.type)).toEqual(["firstTeamDebut", "firstGoal", "wonderkidStatus"]);
    expect(result.newMilestones[2].description).toContain("20 rated appearances");
    expect(result.newMilestones[2].description).not.toMatch(/potential|ceiling|wonderkid/i);
    expect(result.contactPromotions).toHaveLength(1);
    expect(tick(alumnus(), ledger(20), { ...low, age: 22 }).newMilestones.some((m) => m.type === "wonderkidStatus")).toBe(false);
  });

  it("does not turn actual match results into national selection, captaincy or team-of-week claims", () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = processAlumniWeek(createRNG(`alumni-${seed}`), [alumnus()], { player: player() }, clubs,
        30, 1, [], ledger(20));
      expect(result.newMilestones.some((m) => m.type === "internationalCallUp")).toBe(false);
      expect(result.updatedAlumni[0].careerUpdates.some((u) => u.type === "captaincy" || u.type === "teamOfWeek")).toBe(false);
    }
  });

  it("preserves historical awards/contacts and does not duplicate earned records after a reload/repeated tick", () => {
    const first = tick(alumnus(), ledger(20));
    const saved = JSON.parse(JSON.stringify(first.updatedAlumni[0])) as AlumniRecord;
    const replay = tick(saved, ledger(20));
    expect(replay.newMilestones).toEqual([]);
    expect(replay.newMessages).toEqual([]);
    expect(replay.contactPromotions).toEqual([]);
    expect(calculateLegacyScore(replay.updatedAlumni)).toEqual(calculateLegacyScore(first.updatedAlumni));
    saved.milestones.push({ type: "internationalCallUp", week: 1, season: 1,
      description: "Historical call-up", notified: true });
    const before = structuredClone(saved);
    expect(tick(saved).updatedAlumni[0]).toEqual(before);
  });

  it("never promotes a retired player or describes a release as a transfer to an invented club", () => {
    const retired = processAlumniWeek(createRNG("retired"), [alumnus()], { player: player() }, clubs,
      30, 1, ["player"], ledger(20));
    expect(retired.newMilestones).toEqual([]);
    expect(retired.contactPromotions).toEqual([]);
    expect(retired.updatedAlumni[0].currentStatus).toBe("retired");
    const released = tick(alumnus(), ledger(), { ...player(), clubId: "" });
    expect(released.newMilestones).toEqual([]);
    expect(released.updatedAlumni[0].currentStatus).toBe("released");
  });

  it("does not duplicate the tick's authoritative milestone inbox message in the post-tick phase", () => {
    const result = tick(alumnus(), ledger(1));
    const state = { seed: "alumni-post-tick", currentSeason: 1, currentWeek: 3,
      scout: { careerTier: 1, primarySpecialization: "youth", careerPath: "independent", fatigue: 0 },
      players: {}, unsignedYouth: {}, reports: {}, observations: {}, contacts: {}, fixtures: {},
      clubs: {}, discoveryRecords: [], alumniRecords: result.updatedAlumni, performanceHistory: [],
      inbox: result.newMessages } as unknown as GameState;
    const once = processWeeklyPostTickSystems({ beforeWeek: state, state, alumniMilestones: result.newMilestones });
    const twice = processWeeklyPostTickSystems({ beforeWeek: state, state: once, alumniMilestones: result.newMilestones });
    expect(once.inbox.filter((m) => m.body === result.newMilestones[0].description)).toHaveLength(1);
    expect(twice.inbox.filter((m) => m.body === result.newMilestones[0].description)).toHaveLength(1);
  });

  it("feeds the actual newly played fixture ledger through the canonical weekly producer", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Alumni", scoutLastName: "Invariant", scoutAge: 28,
      specialization: "youth", difficulty: "normal", worldSeed: "factual-alumni-week",
      selectedCountries: ["england"], startingCountry: "england",
      skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    });
    const generated = useGameStore.getState().gameState!;
    const fixture = Object.values(generated.fixtures).find((f) => f.week === 2)!;
    expect(fixture).toBeDefined();
    const club = generated.clubs[fixture.homeClubId];
    const records = [...club.playerIds, ...(club.academyPlayerIds ?? [])].map((playerId) => ({
      ...alumnus(), id: `alumni-${playerId}`, playerId, placedClubId: club.id,
      currentClubId: club.id, placedWeek: 1,
    }));
    const result = processWeeklyTick({ ...generated, currentWeek: 2, alumniRecords: records }, createRNG("actual-alumni-fixture"));
    const played = result.fixturesPlayed.find((f) => f.id === fixture.id)!;
    expect(played?.playerRatings).toBeDefined();
    const appeared = records.filter((r) => (played.playerRatings![r.playerId]?.minutesPlayed ?? 0) > 0);
    expect(appeared.length).toBeGreaterThan(0);
    for (const record of result.alumniRecords ?? []) {
      const actual = appeared.some((r) => r.playerId === record.playerId);
      expect(record.milestones.some((m) => m.type === "firstTeamDebut")).toBe(actual);
    }
    for (const milestone of result.alumniMilestones ?? []) {
      expect(result.newMessages.filter((m) => m.body === milestone.description)).toHaveLength(1);
    }
  });
});
