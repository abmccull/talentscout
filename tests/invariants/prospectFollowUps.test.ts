import { describe, expect, it } from "vitest";
import type { GameState, Player, ScoutingCase } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { buildScoutingCaseTimeline } from "@/engine/reports/scoutingCaseTimeline";
import { createRunManifest } from "@/engine/run";
import { projectWeeklyProspectFollowUps } from "@/engine/youth/prospectFollowUps";
import { createWeekSchedule } from "@/engine/core/calendar";
import { calculateLegacyScore } from "@/engine/youth/alumni";
import { createProgressionActions } from "@/stores/actions/progressionActions";
import { finalizeWeeklyState } from "@/stores/actions/weeklyFinalizeState";
import { processWeeklyPostTickSystems } from "@/stores/actions/weeklyPostTickSystems";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

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

type DraftDeliveryReceipt = {
  sourceId: string;
  stage: "early-check" | "decision-point" | "accountability";
  deliveredWeek: number;
  deliveredSeason: number;
};

function recordedDeliveries(sample: GameState): DraftDeliveryReceipt[] {
  const record = sample.scoutingCases[scoutingCase.id] as ScoutingCase & {
    prospectFollowUpDeliveries?: DraftDeliveryReceipt[];
  };
  return record.prospectFollowUpDeliveries ?? [];
}

// Reuse the existing small case fixture; these are the fields read by the
// actual post-tick/finalizer phases. No finances or provider is involved.
function weeklyState(week: number, inbox: GameState["inbox"] = []): GameState {
  const sample = structuredClone(state(week, inbox));
  return {
    ...sample,
    scout: {
      ...sample.scout,
      careerTier: 1,
      careerPath: "independent",
      reputation: 40,
      fatigue: 0,
    },
    schedule: createWeekSchedule(week, 1),
    observations: {},
    contacts: {},
    rivalScouts: {},
    managerProfiles: {},
    narrativeEvents: [],
    performanceReviews: [],
    performanceHistory: [],
    jobOffers: [],
    managerDirectives: [],
    seasonEvents: [],
    activeNegotiations: [],
    freeAgentNegotiations: [],
    legacyScore: calculateLegacyScore([]),
  };
}

function commitAt(sample: GameState, week: number): GameState {
  const beforeWeek = {
    ...sample,
    currentWeek: week - 1,
    schedule: createWeekSchedule(week - 1, sample.currentSeason),
  };
  return processWeeklyPostTickSystems({
    beforeWeek,
    state: {
      ...sample,
      currentWeek: week,
      schedule: createWeekSchedule(week, sample.currentSeason),
    },
  });
}

function ordinaryMessage(id: string): GameState["inbox"][number] {
  return {
    id, week: 3, season: 1, type: "news",
    title: id, body: "Ordinary retained news", read: false,
    actionRequired: false,
  };
}

function readHarness(initialState: GameState) {
  let store = { gameState: initialState } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };
  return {
    actions: createProgressionActions(get, set),
    state: () => store.gameState as GameState,
  };
}

describe("follow-up provenance", () => {
  it.each([3, 7, 19])("labels a sparse saved case as an investigation at week %i", (week) => {
    const saved = JSON.parse(JSON.stringify(state(week))) as GameState;
    const beats = projectWeeklyProspectFollowUps(saved);
    expect(beats.length).toBeGreaterThan(0);
    for (const beat of beats) {
      expect(beat.message.body).toContain("INVESTIGATION PROMPT");
      expect(beat.message.body).toContain("not a confirmed update");
      expect(beat.message.body).not.toMatch(/has supplied|staff report that|family describes|has begun monitoring|has not yet received/);
    }
  });
});

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

    // A later communication must not restart the recorded chronology.
    const messages = [early[0].message, late[0].message, accountability[0].message];
    const introductions = messages.map((message) => message.body.split("\n\n", 1)[0]);
    expect(introductions.filter((introduction) => /\bfirst\b/i.test(introduction))).toHaveLength(1);
    expect(introductions[0]).toMatch(/\bfirst\b/i);
    const reloaded = JSON.parse(JSON.stringify(state(19, messages))) as GameState;
    expect(projectWeeklyProspectFollowUps(reloaded)).toEqual([]);
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
    // Exclude the independent monthly snapshot's own report enumeration.
    sample.currentWeek = 2;

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

    // Observe the actual commit boundary without cloning the counted proxies.
    const weeklyDefaults = weeklyState(sample.currentWeek);
    fixtureEnumerations = 0;
    decisionEnumerations = 0;
    reportEnumerations = 0;
    const committed = commitAt({
      ...weeklyDefaults,
      ...sample,
      scout: { ...weeklyDefaults.scout, ...sample.scout },
    }, sample.currentWeek);
    expect(committed.inbox.filter(message => message.id.startsWith("prospect-follow-up:")))
      .toHaveLength(caseCount);
    expect(Object.values(committed.scoutingCases).every(record =>
      (record as ScoutingCase & { prospectFollowUpDeliveries?: DraftDeliveryReceipt[] })
        .prospectFollowUpDeliveries?.length === 1,
    )).toBe(true);
    expect(fixtureEnumerations).toBe(1);
    expect(decisionEnumerations).toBe(1);
    expect(reportEnumerations).toBe(1);
  });
});

describe("prospect follow-up delivery through inbox retention", () => {
  it("keeps previews pure and commits one actual delivery without changing its authored body", () => {
    const source = weeklyState(3);
    const snapshot = structuredClone(source);
    const preview = projectWeeklyProspectFollowUps(source);
    expect(projectWeeklyProspectFollowUps(source)).toEqual(preview);
    expect(source).toEqual(snapshot);

    const committed = commitAt(source, 3);
    expect(committed.inbox.find(message => message.id === preview[0].id))
      .toEqual(preview[0].message);
    expect(projectWeeklyProspectFollowUps(committed)).toEqual([]);
    expect(recordedDeliveries(committed)).toEqual([{
      sourceId: "decision-1", stage: "early-check",
      deliveredWeek: 3, deliveredSeason: 1,
    }]);
    const reentered = commitAt(committed, 3);
    expect(reentered.inbox.filter(message => message.id === preview[0].id)).toHaveLength(1);
    expect(recordedDeliveries(reentered)).toEqual(recordedDeliveries(committed));
  });

  it("does not replay a real delivered beat after real ordinary inbox eviction inside its window", () => {
    const delivered = commitAt(weeklyState(3), 3);
    const early = delivered.inbox.find(message =>
      message.id === "prospect-follow-up:case-1:decision-1:early-check",
    )!;
    expect(early).toBeDefined();

    const crowded = {
      ...delivered,
      inbox: [
        ...delivered.inbox,
        ...Array.from({ length: 200 }, (_, index) => ordinaryMessage(`news-${index}`)),
      ],
    };
    const pruned = finalizeWeeklyState(delivered, crowded);
    expect(pruned.inbox.some(message => message.id === early.id)).toBe(false);
    expect(pruned.inbox).toHaveLength(200);

    // This is the primary red baseline: current 2b16 projects early-check again.
    // It reaches only existing exports and fails a behavior assertion.
    const nextWeek = { ...pruned, currentWeek: 4, schedule: createWeekSchedule(4, 1) };
    expect(projectWeeklyProspectFollowUps(nextWeek)).toEqual([]);
    expect(recordedDeliveries(pruned)).toEqual(recordedDeliveries(delivered));
    const decisionWeek = { ...pruned, currentWeek: 7, schedule: createWeekSchedule(7, 1) };
    expect(projectWeeklyProspectFollowUps(decisionWeek).map(beat => beat.stage))
      .toEqual(["decision-point"]);
  });

  it("preserves delivery through read actions and a defensive imported-state removal/reconstruction", () => {
    const delivered = commitAt(weeklyState(3), 3);
    const earlyId = "prospect-follow-up:case-1:decision-1:early-check";
    const harness = readHarness(delivered);
    harness.actions.markMessageRead(earlyId);
    expect(harness.state().inbox.find(message => message.id === earlyId)?.read).toBe(true);
    harness.actions.markAllRead();
    expect(harness.state().inbox.some(message => message.id === earlyId)).toBe(true);

    // There is no current public delete UI. This represents an imported or
    // legacy state whose ordinary message is absent; it is not a UI journey.
    const absent = {
      ...harness.state(),
      inbox: harness.state().inbox.filter(message => message.id !== earlyId),
    };
    const restored = JSON.parse(JSON.stringify(absent)) as GameState;
    expect(projectWeeklyProspectFollowUps({ ...restored, currentWeek: 7 })
      .map(beat => beat.stage)).toEqual(["decision-point"]);
    expect(recordedDeliveries(restored)).toEqual(recordedDeliveries(delivered));

    const late = commitAt(restored, 7);
    const next = {
      ...late,
      inbox: late.inbox.filter(message => message.id !==
        "prospect-follow-up:case-1:decision-1:decision-point"),
    };
    expect(projectWeeklyProspectFollowUps(next)).toEqual([]);
    const accountability = commitAt(next, 19);
    expect(accountability.inbox.some(message => message.id ===
      "prospect-follow-up:case-1:decision-1:accountability")).toBe(true);
    expect(recordedDeliveries(accountability)).toEqual([
      { sourceId: "decision-1", stage: "early-check", deliveredWeek: 3, deliveredSeason: 1 },
      { sourceId: "decision-1", stage: "decision-point", deliveredWeek: 7, deliveredSeason: 1 },
      { sourceId: "decision-1", stage: "accountability", deliveredWeek: 19, deliveredSeason: 1 },
    ]);
    expect(projectWeeklyProspectFollowUps({
      ...accountability, currentWeek: 20, inbox: [],
    })).toEqual([]);
  });

  it("starts a distinct anchor cadence without clearing earlier-anchor receipts", () => {
    const first = commitAt(weeklyState(3), 3);
    const replacementAnchor = {
      ...first,
      clubDecisions: {
        ...first.clubDecisions,
        "decision-2": {
          ...first.clubDecisions["decision-1"],
          id: "decision-2", decidedWeek: 4,
        },
      },
      scoutingCases: {
        ...first.scoutingCases,
        [scoutingCase.id]: {
          ...first.scoutingCases[scoutingCase.id],
          decisionIds: ["decision-1", "decision-2"],
        },
      },
    };
    const second = commitAt(replacementAnchor, 6);
    expect(second.inbox.some(message => message.id ===
      "prospect-follow-up:case-1:decision-2:early-check")).toBe(true);
    expect(recordedDeliveries(second)).toEqual([
      { sourceId: "decision-1", stage: "early-check", deliveredWeek: 3, deliveredSeason: 1 },
      { sourceId: "decision-2", stage: "early-check", deliveredWeek: 6, deliveredSeason: 1 },
    ]);
  });

  it("captures retained exact legacy evidence before prune but does not infer missing earlier delivery", () => {
    const oldEarly = projectWeeklyProspectFollowUps(state(3))[0].message;
    const legacy = weeklyState(7, [oldEarly]);
    const observed = commitAt(legacy, 7);
    expect(observed.inbox.some(message => message.id ===
      "prospect-follow-up:case-1:decision-1:decision-point")).toBe(true);
    expect(recordedDeliveries(observed)).toEqual([
      { sourceId: "decision-1", stage: "early-check", deliveredWeek: 3, deliveredSeason: 1 },
      { sourceId: "decision-1", stage: "decision-point", deliveredWeek: 7, deliveredSeason: 1 },
    ]);

    // Missing legacy inbox is unknown. Six elapsed weeks prove due eligibility,
    // not prior delivery. Record only the early message actually appended now.
    const unknown = commitAt(weeklyState(7), 7);
    expect(recordedDeliveries(unknown)).toEqual([{
      sourceId: "decision-1", stage: "early-check",
      deliveredWeek: 7, deliveredSeason: 1,
    }]);
    const lateOnly = projectWeeklyProspectFollowUps(state(7, [oldEarly]))[0].message;
    const laterEvidence = commitAt(weeklyState(7, [lateOnly]), 7);
    expect(recordedDeliveries(laterEvidence)).toEqual(expect.arrayContaining([
      { sourceId: "decision-1", stage: "early-check", deliveredWeek: 7, deliveredSeason: 1 },
      { sourceId: "decision-1", stage: "decision-point", deliveredWeek: 7, deliveredSeason: 1 },
    ]));
  });

  it.each([199, 200, 201])("keeps %i real unread job actions while respecting ordinary allocation", (count) => {
    const sample = weeklyState(3);
    sample.jobOffers = Array.from({ length: count }, (_, index) => ({
      id: `offer-${index}`, clubId: "club-1", tier: 1,
      role: "Youth Scout", salary: 100, contractLength: 1, expiresWeek: 10,
    }));
    const priority = sample.jobOffers.map(offer => ({
      id: `action-${offer.id}`, week: 3, season: 1,
      type: "jobOffer" as const, title: "Job offer", body: "Choose a live offer",
      read: false, actionRequired: true,
      relatedId: offer.id, relatedEntityType: "jobOffer" as const,
    }));
    const ordinary = [
      ordinaryMessage("older-news"),
      { ...priority[0], id: "already-read-action", read: true },
      ordinaryMessage("newest-news"),
    ];
    sample.inbox = [...ordinary, ...priority];
    const finalized = finalizeWeeklyState(sample, structuredClone(sample));
    // Related offer records are present and unexpired, so reconciliation must
    // preserve these action pins. The read action is intentionally ordinary.
    expect(finalized.inbox.filter(message => message.actionRequired && !message.read))
      .toEqual(priority);
    const retainedOrdinary = finalized.inbox.filter(message =>
      !(message.actionRequired && !message.read),
    );
    expect(retainedOrdinary).toEqual(count === 199 ? [ordinary[2]] : []);
    expect(finalized.inbox).toEqual([
      ...(count === 199 ? [ordinary[2]] : []), ...priority,
    ]);
    expect(finalized.inbox).toHaveLength(count === 199 ? 200 : count);
  });
});
