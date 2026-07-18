import { describe, expect, it } from "vitest";
import type { GameState, Player, ScoutingCase } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { buildScoutingCaseTimeline } from "@/engine/reports/scoutingCaseTimeline";
import { createRunManifest } from "@/engine/run";
import { projectWeeklyProspectFollowUps } from "@/engine/youth/prospectFollowUps";

const player = {
  id: "player-1",
  firstName: "Nia",
  lastName: "Mensah",
} as Player;

const scoutingCase: ScoutingCase = {
  id: "case-1",
  playerId: player.id,
  scoutId: "scout-1",
  openedWeek: 1,
  openedSeason: 1,
  lastUpdatedWeek: 1,
  lastUpdatedSeason: 1,
  status: "placed",
  professionalContext: {
    modeId: "youth-scout",
    familyId: "pathway-choice",
    title: "The pathway choice",
    premise: "The placement must fit the player's football and support needs.",
    centralQuestion: "Is this still the right development environment?",
    stakeholderRefs: ["family", "academy"],
    judgmentDecisionIds: [],
  },
  reportIds: ["report-1"],
  listingIds: [],
  deliveryIds: ["delivery-1"],
  decisionIds: ["decision-1"],
  placementReportIds: ["placement-1"],
};

function state(week: number, inbox: GameState["inbox"] = []): GameState {
  return {
    seed: "follow-up-seed",
    runManifest: createRunManifest({
      rootSeed: "follow-up-seed",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    }),
    currentWeek: week,
    currentSeason: 1,
    scout: { id: "scout-1", primarySpecialization: "youth" },
    fixtures: {},
    players: { [player.id]: player },
    retiredPlayers: {},
    unsignedYouth: {},
    clubs: {
      "club-1": { id: "club-1", name: "Northbridge Academy" },
    },
    reports: {},
    scoutingCases: { [scoutingCase.id]: scoutingCase },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: scoutingCase.id,
        deliveryId: "delivery-1",
        reportId: "report-1",
        clubId: "club-1",
        outcome: "accepted",
        decidedWeek: 1,
        decidedSeason: 1,
      },
    },
    inbox,
    consequenceState: createConsequenceEngineState(),
    reflectionJournal: {},
    discoveryRecords: [],
    reportDeliveries: {},
    recommendationReviews: {},
    alumniRecords: [],
    playerMovementHistory: [],
  } as unknown as GameState;
}

describe("prospect follow-up cadence", () => {
  it("surfaces two distinct beats inside eight weeks of an accepted placement", () => {
    expect(projectWeeklyProspectFollowUps(state(2))).toEqual([]);

    const early = projectWeeklyProspectFollowUps(state(3));
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({
      stage: "early-check",
      pathway: "placed",
      playerId: player.id,
    });
    expect(early[0].message.body).toContain("UNRESOLVED:");
    expect(early[0].message.body).toContain(
      "CASE QUESTION: Is this still the right development environment?",
    );
    expect(early[0].message.body).toContain("ACCOUNTABILITY:");

    const lateState = state(7, [early[0].message]);
    const late = projectWeeklyProspectFollowUps(lateState);
    expect(late).toHaveLength(1);
    expect(late[0].stage).toBe("decision-point");

    const accountability = projectWeeklyProspectFollowUps(
      state(19, [early[0].message, late[0].message]),
    );
    expect(accountability).toHaveLength(1);
    expect(accountability[0]).toMatchObject({
      stage: "accountability",
      caseQuestion: "Is this still the right development environment?",
    });
    expect(accountability[0].accountabilitySummary).toContain("long-term review");
  });

  it("is deterministic and idempotent across save/reload", () => {
    const first = projectWeeklyProspectFollowUps(state(3));
    const replay = projectWeeklyProspectFollowUps(
      JSON.parse(JSON.stringify(state(3))) as GameState,
    );
    expect(replay).toEqual(first);
    expect(projectWeeklyProspectFollowUps(state(3, [first[0].message]))).toEqual([]);
  });

  it("does not invent follow-ups for rejected or unrelated cases", () => {
    const rejected = state(4);
    rejected.scoutingCases[scoutingCase.id] = { ...scoutingCase, status: "closed" };
    rejected.clubDecisions["decision-1"] = {
      ...rejected.clubDecisions["decision-1"],
      outcome: "rejected",
    };
    expect(projectWeeklyProspectFollowUps(rejected)).toEqual([]);
  });

  it("projects persisted follow-ups into the causal case timeline", () => {
    const early = projectWeeklyProspectFollowUps(state(3))[0];
    const withBeat = state(3, [early.message]);
    const timeline = buildScoutingCaseTimeline(withBeat, scoutingCase.id);
    expect(timeline?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `follow-up:${early.id}`,
        kind: "milestone",
        title: early.title,
      }),
    ]));
  });

  it("indexes the calendar, decisions, and reports once for a large cross-season casebook", () => {
    const caseCount = 60;
    let fixtureEnumerations = 0;
    let decisionEnumerations = 0;
    let reportEnumerations = 0;
    const sample = state(1);
    sample.currentSeason = 3;
    sample.currentWeek = 1;

    const fixtures = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => {
        const season = index % 2 === 0 ? 1 : 2;
        const week = (index % 38) + 1;
        const id = `fixture-s${season}-${index}`;
        return [id, {
          id,
          season,
          week,
          leagueId: "league",
          homeClubId: "home",
          awayClubId: "away",
          played: true,
        }];
      }),
    ) as GameState["fixtures"];
    sample.fixtures = new Proxy(fixtures, {
      ownKeys: (target) => {
        fixtureEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });

    sample.players = {};
    sample.scoutingCases = {};
    const decisions: GameState["clubDecisions"] = {};
    const reports: GameState["reports"] = {};
    for (let index = 0; index < caseCount; index += 1) {
      const playerId = `player-${index}`;
      const caseId = `case-${index}`;
      const decisionId = `decision-${index}`;
      sample.players[playerId] = { ...player, id: playerId };
      sample.scoutingCases[caseId] = {
        ...scoutingCase,
        id: caseId,
        playerId,
        reportIds: [],
        decisionIds: [decisionId],
      };
      decisions[decisionId] = {
        ...sample.clubDecisions["decision-1"],
        id: decisionId,
        caseId,
        outcome: "accepted",
        decidedSeason: 2,
        decidedWeek: 37,
      };
    }
    sample.clubDecisions = new Proxy(decisions, {
      ownKeys: (target) => {
        decisionEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });
    sample.reports = new Proxy(reports, {
      ownKeys: (target) => {
        reportEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });

    expect(projectWeeklyProspectFollowUps(sample)).toHaveLength(caseCount);
    expect(fixtureEnumerations).toBe(1);
    expect(decisionEnumerations).toBe(1);
    expect(reportEnumerations).toBe(1);
  });
});
