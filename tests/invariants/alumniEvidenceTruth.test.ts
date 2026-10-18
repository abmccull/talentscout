import { describe, expect, it } from "vitest";
import type { AlumniRecord, Club, Fixture, Player, PlayerMatchRating, PlayerMovementEvent } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { calculateLegacyScore, calculatePlacementSuccessRate, processAlumniWeek } from "@/engine/youth/alumni";

function record(): AlumniRecord {
  return { id: "alumni-truth", playerId: "prospect", placedClubId: "academy", currentClubId: "academy", placedWeek: 1, placedSeason: 3,
    milestones: [], careerUpdates: [], careerSnapshots: [], seasonStats: [], currentStatus: "academy", becameContact: false };
}
const clubs = { academy: { id: "academy", name: "Academy" }, senior: { id: "senior", name: "Senior" } } as unknown as Record<string, Club>;
function player(overrides: Partial<Player> = {}): Player {
  return { id: "prospect", firstName: "Real", lastName: "Prospect", currentAbility: 95, potentialAbility: 180, age: 17, clubId: "academy",
    injured: false, injuryWeeksRemaining: 0, nationality: "English", ...overrides } as Player;
}
function evidence(minutesPlayed = 30, goals = 1) {
  const fixture: Fixture = { id: "senior-fixture", week: 2, season: 3, played: true, homeClubId: "academy", awayClubId: "senior", leagueId: "league" };
  const rating: PlayerMatchRating = { playerId: "prospect", fixtureId: fixture.id, started: false, minutesPlayed, rating: 7.8, source: "simulated", eventCount: 0, stats: { goals } };
  return { fixtures: { [fixture.id]: fixture }, matchRatings: { [fixture.id]: { prospect: rating } }, movements: [] as PlayerMovementEvent[] };
}
function run(initial: AlumniRecord, prospect: Player, facts = evidence(0, 0), retiredIds: string[] = []) {
  const rng = new RNG("alumni-truth"); rng.chance = () => true;
  return processAlumniWeek(rng, [initial], { prospect }, clubs, 2, 3, retiredIds, facts);
}

describe("alumni feedback requires committed causal facts", () => {
  it.each(["academy", "released", "retired"])("gives an unplayed high-ability %s youth no fictional achievement, first-team status, contact or success credit", status => {
    const result = run(record(), player({ clubId: status === "released" ? "" : "academy" }), evidence(0, 99), status === "retired" ? ["prospect"] : []);
    expect(result.newMilestones).toEqual([]);
    expect(result.newMessages).toEqual([]);
    expect(result.contactPromotions).toEqual([]);
    expect(result.updatedAlumni[0].currentStatus).toBe(status);
    expect(calculatePlacementSuccessRate(result.updatedAlumni)).toBe(0);
    expect(calculateLegacyScore(result.updatedAlumni).firstTeamBreakthroughs).toBe(0);
  });

  it("awards a low-ability sixteen-year-old's real debut and goal once, keeps fixture provenance and survives replay and JSON reload", () => {
    const prospect = player({ age: 16, currentAbility: 65, potentialAbility: 90 });
    const facts = evidence();
    const result = run(record(), prospect, facts);
    expect(result.newMilestones.map(m => m.type)).toEqual(["firstTeamDebut", "firstGoal"]);
    expect(result.newMilestones.every(m => m.sourceId === "senior-fixture")).toBe(true);
    expect(result.newMessages).toHaveLength(2);
    expect(new Set(result.newMessages.map(message => message.id)).size).toBe(2);
    expect(result.updatedAlumni[0].currentStatus).toBe("firstTeam");
    expect(calculatePlacementSuccessRate(result.updatedAlumni)).toBe(100);
    const replay = run(JSON.parse(JSON.stringify(result.updatedAlumni[0])), prospect, facts);
    expect(replay.newMilestones).toEqual([]);
    expect(replay.newMessages).toEqual([]);
    expect(replay.updatedAlumni[0].milestones).toHaveLength(2);
  });

  it.each(["unplayed", "orphan", "pre-placement", "prior-season"])("rejects %s fixture goals as a new alumni achievement", invalid => {
    const facts = evidence();
    if (invalid === "unplayed") facts.fixtures["senior-fixture"].played = false;
    if (invalid === "orphan") delete facts.fixtures["senior-fixture"];
    if (invalid === "pre-placement") facts.fixtures["senior-fixture"].week = 0;
    if (invalid === "prior-season") facts.fixtures["senior-fixture"].season = 2;
    expect(run(record(), player(), facts).newMilestones).toEqual([]);
  });

  it.each(["release", "loanStart", "permanentTransfer"] as const)("projects applied %s facts without treating a release or loan as permanent transfer", type => {
    const facts = evidence(0, 0);
    facts.movements = [{ id: `movement-${type}`, playerId: "prospect", type, week: 2, season: 3, fromClubId: "academy", ...(type === "release" ? {} : { toClubId: "senior" }) }];
    const prospect = player({ clubId: type === "release" ? "" : "senior", onLoan: type === "loanStart" });
    const result = run(record(), prospect, facts);
    expect(result.newMilestones.map(m => m.type)).toEqual(type === "permanentTransfer" ? ["transfer"] : []);
    expect(result.updatedAlumni[0].careerUpdates[0]).toMatchObject({ sourceId: `movement-${type}`, type: type === "release" ? "released" : type === "loanStart" ? "loanMove" : "transfer" });
    expect(result.newMessages).toHaveLength(1);
    expect(run(result.updatedAlumni[0], prospect, facts).newMessages).toEqual([]);
  });

  it("does not convert an unexplained club change or unsupported legacy narrative into verified placement success", () => {
    const initial = record();
    initial.currentStatus = "firstTeam";
    initial.milestones = [{ type: "firstTeamDebut", week: 1, season: 3, description: "Legacy unsupported debut", notified: true },
      { type: "internationalCallUp", week: 1, season: 3, description: "Legacy unsupported call-up", notified: true }];
    const original = JSON.stringify(initial);
    const result = run(initial, player({ clubId: "senior" }));
    expect(result.newMilestones).toEqual([]);
    expect(result.updatedAlumni[0].currentStatus).toBe("academy");
    expect(result.updatedAlumni[0].milestones).toEqual(initial.milestones);
    expect(calculatePlacementSuccessRate(result.updatedAlumni)).toBe(0);
    expect(calculateLegacyScore(result.updatedAlumni).internationalCapsFromFinds).toBe(0);
    expect(JSON.stringify(initial)).toBe(original);
  });
});
