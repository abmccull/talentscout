import { describe, expect, it } from "vitest";

import type {
  Contact,
  FinancialRecord,
  GameState,
  ScoutReport,
  WeekSchedule,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences/decisionLedger";
import {
  chooseCareerRecoveryPlan,
  openCareerSetback,
  processCareerRecoveryWeek,
} from "@/engine/career/recovery";

function schedule(
  week: number,
  activities: WeekSchedule["activities"] = [null, null, null, null, null, null, null],
): WeekSchedule {
  return { week, season: 1, activities, completed: false };
}

function contact(id: string): Contact {
  return {
    id,
    name: id,
    type: "academyCoach",
    organization: "Local football",
    relationship: 50,
    trustLevel: 50,
    reliability: 60,
    knownPlayerIds: [],
  } as Contact;
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: "career-recovery-test",
    currentWeek: 1,
    currentSeason: 1,
    fixtures: {},
    clubs: {},
    contacts: {},
    reports: {},
    jobOffers: [],
    inbox: [],
    schedule: schedule(1),
    consequenceState: createConsequenceEngineState(),
    scout: {
      id: "scout-1",
      careerTier: 3,
      careerPath: "independent",
      reputation: 42,
      clubTrust: 50,
      fatigue: 55,
      primarySpecialization: "youth",
    },
    ...overrides,
  } as GameState;
}

function report(id: string, playerId: string, qualityScore: number): ScoutReport {
  return {
    id,
    playerId,
    scoutId: "scout-1",
    submittedWeek: 2,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: "recommend",
    summary: "Recovery evidence",
    estimatedValue: 0,
    qualityScore,
  } as ScoutReport;
}

describe("career setback and recovery", () => {
  it("requires distinct high-quality player cases and refuses report grinding", () => {
    const opened = openCareerSetback(baseState({
      reports: {
        old: {
          ...report("old", "old-player", 90),
          caseId: "old-case",
          revision: 1,
        },
      },
      clubs: {
        "former-club": {
          id: "former-club",
          reputation: 50,
          scoutingPhilosophy: "academyFirst",
        },
        "comeback-club": {
          id: "comeback-club",
          reputation: 50,
          scoutingPhilosophy: "academyFirst",
        },
      } as unknown as GameState["clubs"],
    }), {
      kind: "firing",
      previousTier: 3,
      previousClubId: "former-club",
    });
    expect(opened.careerRecovery?.current).toMatchObject({
      status: "awaitingChoice",
      previousTier: 3,
    });
    expect(opened.inbox.at(-1)?.actionRequired).toBe(true);
    expect(Object.values(opened.consequenceState.decisions)).toHaveLength(1);

    const selected = chooseCareerRecoveryPlan(opened, "proveTheWork");
    expect(selected.accepted).toBe(true);
    expect(selected.state.careerRecovery?.current).toMatchObject({
      status: "active",
      target: 3,
    });

    const withRepeatedWork = {
      ...selected.state,
      currentWeek: 2,
      reports: {
        old: {
          ...report("old", "old-player", 90),
          caseId: "old-case",
          revision: 1,
        },
        oldRevision: {
          ...report("old-revision", "old-player", 95),
          caseId: "old-case",
          revision: 2,
          supersedesReportId: "old",
        },
        first: report("first", "player-a", 82),
        revision: report("revision", "player-a", 91),
        weak: report("weak", "player-b", 69),
      },
    } as GameState;
    const oneCase = processCareerRecoveryWeek(withRepeatedWork, schedule(1));
    expect(oneCase.careerRecovery?.current).toMatchObject({ progress: 1, status: "active" });

    const completed = processCareerRecoveryWeek({
      ...oneCase,
      currentWeek: 3,
      reports: {
        ...oneCase.reports,
        second: {
          ...report("second", "player-b", 70),
          submittedWeek: 3,
          revision: 2,
          supersedesReportId: "weak",
        },
        third: { ...report("third", "player-c", 88), submittedWeek: 3 },
      },
    }, schedule(2));
    expect(completed.careerRecovery?.current).toMatchObject({
      progress: 3,
      status: "completed",
    });
    expect(completed.scout.reputation).toBe(50);
    expect(completed.jobOffers).toHaveLength(1);
    expect(completed.jobOffers[0]).toMatchObject({
      clubId: "comeback-club",
      tier: 3,
    });
    expect(completed.inbox.at(-1)).toMatchObject({
      type: "jobOffer",
      actionRequired: true,
      relatedId: completed.jobOffers[0].id,
    });
    expect(Object.values(completed.consequenceState.facts)[0]).toMatchObject({
      kind: "careerRecoveryOutcome",
      value: { planId: "proveTheWork", status: "completed" },
    });
  });

  it("turns a formal warning into a distinct-contact trust repair plan", () => {
    const state = baseState({
      contacts: {
        first: contact("first"),
        second: contact("second"),
      },
      scout: {
        ...baseState().scout,
        careerPath: "club",
        currentClubId: "club-1",
        clubTrust: 40,
      },
    });
    const opened = openCareerSetback(state, {
      kind: "warning",
      previousTier: 3,
      previousClubId: "club-1",
    });
    const selected = chooseCareerRecoveryPlan(opened, "rebuildTheNetwork").state;
    const repeatedContactSchedule = schedule(1, [
      { type: "networkMeeting", slots: 1, targetId: "first", description: "Meet first" },
      { type: "networkMeeting", slots: 1, targetId: "first", description: "Meet first again" },
      null, null, null, null, null,
    ]);
    const firstWeek = processCareerRecoveryWeek(
      { ...selected, currentWeek: 2 },
      repeatedContactSchedule,
    );
    expect(firstWeek.careerRecovery?.current?.progress).toBe(1);

    const secondWeek = processCareerRecoveryWeek(
      { ...firstWeek, currentWeek: 3 },
      schedule(2, [
        { type: "networkMeeting", slots: 1, targetId: "second", description: "Meet second" },
        null, null, null, null, null, null,
      ]),
    );
    expect(secondWeek.careerRecovery?.current?.status).toBe("completed");
    expect(secondWeek.scout.clubTrust).toBe(45);
    expect(secondWeek.scout.reputation).toBe(47);
    expect(secondWeek.jobOffers).toEqual([]);
  });

  it("makes stepping back cost reputation and counts only genuinely quiet weeks", () => {
    const opened = openCareerSetback(baseState({
      scout: { ...baseState().scout, careerTier: 4, reputation: 60 },
    }), { kind: "firing", previousTier: 4 });
    const selected = chooseCareerRecoveryPlan(opened, "stepBack").state;
    expect(selected.scout.reputation).toBe(57);
    expect(selected.careerRecovery?.current?.target).toBe(6);

    const workingWeek = processCareerRecoveryWeek(
      { ...selected, currentWeek: 2 },
      schedule(1, [
        { type: "study", slots: 1, description: "Keep working" },
        null, null, null, null, null, null,
      ]),
    );
    expect(workingWeek.careerRecovery?.current?.progress).toBe(0);

    const quietWeek = processCareerRecoveryWeek(
      { ...workingWeek, currentWeek: 3 },
      schedule(2),
    );
    expect(quietWeek.careerRecovery?.current?.progress).toBe(1);
  });

  it("does not complete a bankruptcy comeback before financial clearance", () => {
    const finances = {
      bankruptcyRecoveryCooldown: 2,
    } as FinancialRecord;
    const opened = openCareerSetback(baseState({ finances }), {
      kind: "bankruptcy",
      previousTier: 3,
    });
    let state = chooseCareerRecoveryPlan(opened, "stepBack").state;
    for (let week = 2; week <= 5; week += 1) {
      state = processCareerRecoveryWeek(
        { ...state, currentWeek: week },
        schedule(week - 1),
      );
    }
    expect(state.careerRecovery?.current).toMatchObject({
      progress: 4,
      status: "active",
    });

    const cleared = processCareerRecoveryWeek({
      ...state,
      currentWeek: 6,
      finances: { ...state.finances!, bankruptcyRecoveryCooldown: 0 },
    }, schedule(5, [
      { type: "study", slots: 1, description: "Resume work" },
      null, null, null, null, null, null,
    ]));
    expect(cleared.careerRecovery?.current?.status).toBe("completed");
    expect(cleared.scout.fatigue).toBe(20);
  });

  it("defaults an ignored recovery choice to the slower step-back route", () => {
    const opened = openCareerSetback(baseState(), {
      kind: "firing",
      previousTier: 3,
    });
    const defaulted = processCareerRecoveryWeek(
      { ...opened, currentWeek: 4 },
      schedule(3),
    );
    expect(defaulted.careerRecovery?.current).toMatchObject({
      status: "active",
      planId: "stepBack",
    });
    expect(defaulted.scout.reputation).toBe(39);
    expect(defaulted.consequenceState.decisions[opened.careerRecovery!.current!.decisionId]).toMatchObject({
      selectedOptionId: "stepBack",
      selectionKind: "default",
    });
  });
});
