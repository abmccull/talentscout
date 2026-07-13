import { describe, expect, it } from "vitest";

import type {
  GameState,
  NPCScout,
  NPCScoutReport,
  Player,
  Scout,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences/decisionLedger";
import {
  LEADERSHIP_PORTFOLIO_CAPACITY,
  LEADERSHIP_TERMINAL_RETENTION,
  chooseLeadershipResponsibility,
  createLeadershipPortfolioState,
  processLeadershipPortfolioWeek,
  type LeadershipResponsibility,
} from "@/engine/career/leadership";

function player(id: string, index: number): Player {
  return {
    id,
    firstName: `Player${index}`,
    lastName: "Prospect",
    age: 18 + index,
    currentAbility: 80,
    potentialAbility: 130,
  } as Player;
}

function npc(id: string, quality = 3): NPCScout {
  return {
    id,
    firstName: id === "npc-1" ? "Morgan" : "Jamie",
    lastName: "Vale",
    quality,
    territoryId: "territory-1",
    specialization: "youth",
    salary: 500,
    fatigue: 10,
    reportsSubmitted: 0,
    morale: 6,
  };
}

function scout(tier: 3 | 4 = 4): Scout {
  return {
    id: "scout-1",
    careerTier: tier,
    careerPath: "club",
    currentClubId: "club-1",
    reputation: 60,
    clubTrust: 50,
    managerRelationship: {
      managerName: "Alex Director",
      trust: 50,
      influence: 50,
      scoutingPreference: "balanced",
      meetingsThisSeason: 0,
    },
  } as Scout;
}

function baseState(tier: 3 | 4 = 4): GameState {
  const players = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const prospect = player(`player-${index + 1}`, index);
      return [prospect.id, prospect];
    }),
  );
  return {
    seed: "leadership-seed",
    currentWeek: 5,
    currentSeason: 2,
    scout: scout(tier),
    players,
    fixtures: {},
    observations: {},
    reports: {},
    watchlist: Object.keys(players),
    contacts: {},
    retiredPlayerIds: [],
    npcScouts: {
      "npc-1": npc("npc-1"),
      "npc-2": npc("npc-2", 4),
    },
    npcReports: {},
    npcDelegations: {},
    territories: {
      "territory-1": {
        id: "territory-1",
        name: "Home region",
        country: "England",
        leagueIds: [],
        maxScouts: 3,
        assignedScoutIds: ["npc-1", "npc-2"],
      },
    },
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    boardProfile: {
      personality: "patient",
      patience: 60,
      satisfactionLevel: 55,
      budgetMultiplier: 1,
      ultimatumIssued: false,
      recentDirectives: [],
    },
  } as unknown as GameState;
}

function activeResponsibilities(state: GameState): LeadershipResponsibility[] {
  return Object.values(state.leadershipPortfolio?.responsibilities ?? {}).filter(
    (responsibility) => ["open", "owned", "delegated", "deferred"].includes(responsibility.status),
  );
}

describe("late-career leadership portfolio", () => {
  it("leaves early careers unchanged and creates exactly three Tier 4 responsibilities", () => {
    const early = baseState(3);
    expect(processLeadershipPortfolioWeek(early)).toBe(early);
    expect(early.leadershipPortfolio).toBeUndefined();

    const late = processLeadershipPortfolioWeek(baseState(4));
    expect(activeResponsibilities(late)).toHaveLength(LEADERSHIP_PORTFOLIO_CAPACITY);
    expect(new Set(activeResponsibilities(late).map((item) => item.playerId)).size).toBe(3);
    expect(late.leadershipPortfolio).toMatchObject({
      attentionCapacity: 2,
      attentionUsed: 0,
    });
  });

  it("enforces attention, allows one deferral, and records the second deferral as a failure", () => {
    const initialized = processLeadershipPortfolioWeek(baseState());
    const [ownedResponsibility, deferredResponsibility] = activeResponsibilities(initialized);
    const owned = chooseLeadershipResponsibility(
      initialized,
      ownedResponsibility.id,
      "own",
    );
    expect(owned.accepted).toBe(true);
    expect(owned.state.leadershipPortfolio?.attentionUsed).toBe(2);

    const overCapacity = chooseLeadershipResponsibility(
      owned.state,
      deferredResponsibility.id,
      "delegate",
      "npc-1",
    );
    expect(overCapacity).toMatchObject({ accepted: false });
    expect(overCapacity.reason).toContain("0 leadership attention");

    const deferred = chooseLeadershipResponsibility(
      owned.state,
      deferredResponsibility.id,
      "defer",
    );
    expect(deferred.accepted).toBe(true);
    expect(deferred.state.leadershipPortfolio?.responsibilities[deferredResponsibility.id]).toMatchObject({
      status: "deferred",
      deferrals: 1,
    });

    const reopened = processLeadershipPortfolioWeek({
      ...deferred.state,
      currentWeek: deferred.state.currentWeek + 1,
    });
    expect(reopened.leadershipPortfolio?.responsibilities[deferredResponsibility.id].status).toBe("open");
    const failed = chooseLeadershipResponsibility(
      reopened,
      deferredResponsibility.id,
      "defer",
    );
    expect(failed.accepted).toBe(true);
    expect(failed.state.leadershipPortfolio?.responsibilities[deferredResponsibility.id]).toMatchObject({
      status: "failed",
      outcomeReason: expect.stringContaining("second deferral"),
    });
    expect(failed.state.leadershipPortfolio?.trackRecord.deferrals).toBe(2);
    expect(failed.state.leadershipPortfolio?.trackRecord.ownedFailures).toBe(0);
    expect(Object.values(failed.state.consequenceState.memories)).toHaveLength(1);
  });

  it("attributes a delegated failure to the actual NPC report and persists stakeholder consequences", () => {
    const initialized = processLeadershipPortfolioWeek(baseState());
    const responsibility = activeResponsibilities(initialized)[0];
    const delegated = chooseLeadershipResponsibility(
      initialized,
      responsibility.id,
      "delegate",
      "npc-1",
    );
    expect(delegated.accepted).toBe(true);
    const delegation = Object.values(delegated.state.npcDelegations)[0];
    const report: NPCScoutReport = {
      id: "delegated-low-report",
      npcScoutId: "npc-1",
      playerId: responsibility.playerId,
      week: delegated.state.currentWeek,
      season: delegated.state.currentSeason,
      quality: 41,
      summary: "The evidence remained too thin.",
      recommendation: "monitor",
      reviewed: false,
    };
    const resolved = processLeadershipPortfolioWeek({
      ...delegated.state,
      npcReports: { [report.id]: report },
      npcDelegations: {
        ...delegated.state.npcDelegations,
        [delegation.id]: {
          ...delegation,
          completed: true,
          weeksRemaining: 0,
          completedWeek: delegated.state.currentWeek,
          completedSeason: delegated.state.currentSeason,
          resultReportId: report.id,
        },
      },
    });

    expect(resolved.leadershipPortfolio?.responsibilities[responsibility.id]).toMatchObject({
      status: "failed",
      attributedNpcScoutId: "npc-1",
      outcomeReason: expect.stringContaining("41/100"),
    });
    expect(resolved.leadershipPortfolio?.trackRecord.delegatedFailures).toBe(1);
    expect(resolved.npcScouts["npc-1"].morale).toBe(5);
    expect(resolved.scout.managerRelationship?.trust).toBe(47);
    expect(resolved.scout.clubTrust).toBe(47);
    expect(resolved.boardProfile?.satisfactionLevel).toBe(52);
    expect(Object.values(resolved.consequenceState.memories)[0]).toMatchObject({
      stakeholder: { kind: "board", id: "club-1" },
      subject: { kind: "npcScout", id: "npc-1" },
      valence: -30,
    });
    expect(resolved.inbox.at(-1)?.body).toContain("Morgan Vale is named in the outcome record");
  });

  it("turns an independent responsibility into a specific contact consequence", () => {
    const state = baseState();
    const independent = processLeadershipPortfolioWeek({
      ...state,
      scout: {
        ...state.scout,
        careerPath: "independent",
        currentClubId: undefined,
        managerRelationship: undefined,
      },
      contacts: {
        "contact-1": {
          id: "contact-1",
          name: "Riley Morgan",
          type: "academyDirector",
          organization: "Local Academy",
          relationship: 70,
          trustLevel: 72,
          reliability: 80,
          knownPlayerIds: Object.keys(state.players),
        },
      },
      boardProfile: undefined,
    });
    const responsibility = activeResponsibilities(independent)[0];
    expect(responsibility.sourceContactId).toBe("contact-1");

    const rejected = chooseLeadershipResponsibility(
      independent,
      responsibility.id,
      "reject",
    );
    expect(rejected.accepted).toBe(true);
    expect(rejected.state.contacts["contact-1"]).toMatchObject({
      relationship: 66,
      trustLevel: 68,
    });
    expect(Object.values(rejected.state.consequenceState.memories)[0]).toMatchObject({
      stakeholder: { kind: "contact", id: "contact-1" },
      subject: { kind: "scout", id: "scout-1" },
      valence: -45,
    });
  });

  it("resolves personal ownership from a visible report and bounds terminal history", () => {
    const initialized = processLeadershipPortfolioWeek(baseState());
    const responsibility = activeResponsibilities(initialized)[0];
    const owned = chooseLeadershipResponsibility(initialized, responsibility.id, "own");
    const withReport = {
      ...owned.state,
      reports: {
        "owned-report": {
          id: "owned-report",
          playerId: responsibility.playerId,
          scoutId: "scout-1",
          submittedWeek: owned.state.currentWeek,
          submittedSeason: owned.state.currentSeason,
          attributeAssessments: [],
          strengths: [],
          weaknesses: [],
          conviction: "recommend",
          summary: "A defensible leadership recommendation.",
          estimatedValue: 0,
          qualityScore: 72,
        },
      },
    } as GameState;
    const resolved = processLeadershipPortfolioWeek(withReport);
    expect(resolved.leadershipPortfolio?.responsibilities[responsibility.id]).toMatchObject({
      status: "succeeded",
      outcomeReason: expect.stringContaining("72/100"),
    });
    expect(resolved.leadershipPortfolio?.trackRecord.ownedSuccesses).toBe(1);

    const terminalResponsibilities = Object.fromEntries(
      Array.from({ length: 35 }, (_, index) => {
        const item: LeadershipResponsibility = {
          id: `terminal-${index}`,
          playerId: `player-${(index % 8) + 1}`,
          title: "Archived responsibility",
          description: "Bounded history fixture.",
          priority: "high",
          createdWeek: 1,
          createdSeason: 1,
          dueWeek: 2,
          dueSeason: 1,
          status: index % 2 === 0 ? "succeeded" : "failed",
          deferrals: 0,
          resolvedWeek: index + 1,
          resolvedSeason: 1,
        };
        return [item.id, item];
      }),
    );
    const compacted = processLeadershipPortfolioWeek({
      ...baseState(),
      leadershipPortfolio: createLeadershipPortfolioState({
        responsibilities: terminalResponsibilities,
      }, 5, 2),
    });
    const retained = Object.values(compacted.leadershipPortfolio?.responsibilities ?? {});
    expect(retained.filter((item) => !["open", "owned", "delegated", "deferred"].includes(item.status))).toHaveLength(
      LEADERSHIP_TERMINAL_RETENTION,
    );
    expect(activeResponsibilities(compacted)).toHaveLength(LEADERSHIP_PORTFOLIO_CAPACITY);
  });
});
