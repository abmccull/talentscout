import { describe, expect, it } from "vitest";
import type {
  BoardPersonality,
  Fixture,
  GameState,
  ManagerMeetingApproach,
  ScoutingPreference,
} from "@/engine/core/types";
import { createConsequenceEngineState, evaluateStakeholderMemoryPolicy } from "@/engine/consequences";
import {
  conductBoardMeeting,
  conductManagerMeeting,
  getBoardMeetingEligibility,
  getManagerMeetingEligibility,
  migratePoliticalMeetingState,
} from "@/engine/career/politicalMeetings";

function fixtures(seasonLength = 38): Record<string, Fixture> {
  return {
    end: {
      id: "fixture-end",
      week: seasonLength,
      season: 1,
      homeClubId: "club-1",
      awayClubId: "club-2",
      leagueId: "league-1",
      played: false,
    } as Fixture,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  const base = {
    seed: "political-integrity",
    currentWeek: 37,
    currentSeason: 1,
    fixtures: fixtures(),
    schedule: {
      week: 37,
      season: 1,
      activities: [null, null, null, null, null, null, null],
      completed: false,
    },
    scout: {
      id: "scout-1",
      firstName: "Ari",
      lastName: "Vale",
      careerTier: 5,
      careerPath: "club",
      currentClubId: "club-1",
      fatigue: 10,
      reputation: 55,
      attributes: {
        networking: 12,
        persuasion: 12,
        endurance: 10,
        adaptability: 10,
        memory: 10,
        intuition: 10,
      },
      managerRelationship: {
        managerName: "Mara Quinn",
        trust: 50,
        influence: 45,
        scoutingPreference: "balanced",
        meetingsThisSeason: 0,
      },
    },
    clubs: {
      "club-1": {
        id: "club-1",
        name: "Northbridge",
        shortName: "NOR",
        leagueId: "league-1",
        reputation: 60,
        budget: 10_000_000,
        scoutingPhilosophy: "marketSmart",
        managerId: "manager-1",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 12,
      },
    },
    players: {},
    managerProfiles: {
      "club-1": {
        clubId: "club-1",
        managerName: "Mara Quinn",
        preference: "balanced",
        reportInfluence: 0.6,
        preferredFormation: "4-3-3",
      },
    },
    managerDirectives: [],
    boardProfile: {
      personality: "patient",
      patience: 65,
      satisfactionLevel: 58,
      budgetMultiplier: 1,
      ultimatumIssued: true,
      ultimatumDeadline: 2,
      ultimatumDeadlineSeason: 2,
      recentDirectives: [],
    },
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    satisfactionHistory: [],
  } as unknown as GameState;
  return { ...base, ...overrides };
}

function withManager(
  base: GameState,
  name: string,
  preference: ScoutingPreference = "balanced",
): GameState {
  const clubId = base.scout.currentClubId!;
  return {
    ...base,
    scout: {
      ...base.scout,
      managerRelationship: {
        ...base.scout.managerRelationship!,
        managerName: name,
        scoutingPreference: preference,
        nextMeetingAt: undefined,
        lastMeetingOutcome: undefined,
      },
    },
    managerProfiles: {
      ...base.managerProfiles,
      [clubId]: {
        ...base.managerProfiles[clubId],
        managerName: name,
        preference,
      },
    },
  };
}

describe("political meeting authority", () => {
  it("records one manager outcome, charges once, and carries its cooldown across seasons", () => {
    const before = state();
    const first = conductManagerMeeting(before, "listen");

    expect(first.executed).toBe(true);
    expect(first.state.scout.fatigue).toBe(14);
    expect(first.state.scout.managerRelationship).toMatchObject({
      meetingsThisSeason: 1,
      nextMeetingAt: { season: 2, week: 3 },
    });
    expect(first.state.scout.managerRelationship?.lastMeetingOutcome?.summary).toBeTruthy();
    expect(Object.values(first.state.consequenceState.memories)).toHaveLength(1);
    expect(first.state.inbox.filter((message) => message.title.startsWith("Meeting with"))).toHaveLength(1);

    const repeated = conductManagerMeeting(first.state, "challenge");
    expect(repeated).toMatchObject({ executed: false });
    expect(repeated.state).toBe(first.state);
    expect(getManagerMeetingEligibility(first.state)).toMatchObject({
      eligible: false,
      nextAvailableAt: { season: 2, week: 3 },
    });
  });

  it("persists any generated request as a canonical manager directive", () => {
    let generated:
      | ReturnType<typeof conductManagerMeeting>
      | undefined;
    for (let attempt = 0; attempt < 80 && !generated?.outcome?.directiveCreated; attempt++) {
      generated = conductManagerMeeting(
        { ...state(), seed: `directive-seed-${attempt}` },
        "listen",
      );
    }
    expect(generated?.outcome?.directiveCreated).toBe(true);
    const directiveId = generated!.outcome!.directiveId!;
    expect(generated!.state.managerDirectives.some((directive) => directive.id === directiveId)).toBe(true);
    expect(generated!.state.inbox.at(-1)?.relatedId).toBe(directiveId);
  });

  it.each<ManagerMeetingApproach>(["listen", "evidence", "challenge"])(
    "makes the %s approach deterministic across save/reload",
    (approach) => {
      const before = state({ currentWeek: 12, schedule: { ...state().schedule, week: 12 } });
      const direct = conductManagerMeeting(before, approach);
      const reloaded = JSON.parse(JSON.stringify(before)) as GameState;
      const afterReload = conductManagerMeeting(reloaded, approach);

      expect(afterReload.outcome).toEqual(direct.outcome);
      expect(afterReload.state.managerDirectives).toEqual(direct.state.managerDirectives);
      expect(afterReload.state.consequenceState.memories).toEqual(direct.state.consequenceState.memories);
    },
  );

  it("keeps a replacement manager isolated from the predecessor's memories", () => {
    const first = conductManagerMeeting(state(), "listen");
    const replaced = withManager(
      {
        ...first.state,
        currentWeek: 5,
        currentSeason: 2,
        schedule: { ...first.state.schedule, week: 5, season: 2 },
      },
      "Ivo Santos",
      "dataFirst",
    );
    const second = conductManagerMeeting(replaced, "evidence");
    const memories = Object.values(second.state.consequenceState.memories);

    expect(second.executed).toBe(true);
    expect(memories).toHaveLength(2);
    expect(new Set(memories.map((memory) => memory.stakeholder.id)).size).toBe(2);
    expect(second.outcome?.memoryReason).toBeUndefined();
  });

  it("never extends an ultimatum and prevents same-week board reward farming", () => {
    const before = state();
    const result = conductBoardMeeting(before, "accountability");

    expect(result.executed).toBe(true);
    expect(result.state.boardProfile).toMatchObject({
      ultimatumDeadline: 2,
      ultimatumDeadlineSeason: 2,
      nextMeetingAt: { season: 2, week: 5 },
    });
    expect(result.state.scout.fatigue).toBe(18);
    expect(result.state.boardProfile?.lastMeetingOutcome).toEqual(result.outcome);
    expect(conductBoardMeeting(result.state, "vision").state).toBe(result.state);
    expect(result.state.inbox.at(-1)?.body).toContain("deadline remains unchanged");
  });

  it.each<[BoardPersonality, { season: number; week: number }]>([
    ["impatient", { season: 2, week: 3 }],
    ["patient", { season: 2, week: 5 }],
    ["penny-pinching", { season: 2, week: 5 }],
    ["ambitious", { season: 2, week: 5 }],
    ["hands-off", { season: 2, week: 7 }],
  ])("gives %s boards a distinct persisted cadence", (personality, expectedDate) => {
    const before = state({
      boardProfile: { ...state().boardProfile!, personality },
    });
    expect(conductBoardMeeting(before, "accountability").state.boardProfile?.nextMeetingAt)
      .toEqual(expectedDate);
  });

  it("makes efficiency a real board tradeoff instead of free reputation", () => {
    const result = conductBoardMeeting(state(), "efficiency");
    expect(result.state.boardProfile?.budgetMultiplier).toBe(0.97);
    expect(result.outcome?.budgetMultiplierDelta).toBe(-0.03);
    expect(result.state.scout.reputation).toBe(55);
  });

  it("blocks direct execution when the same meeting is already scheduled, then charges only the scheduled cost", () => {
    const scheduled = state({
      schedule: {
        week: 37,
        season: 1,
        completed: false,
        activities: [
          { type: "managerMeeting", slots: 1, description: "Manager meeting" },
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      },
    });
    expect(getManagerMeetingEligibility(scheduled)).toMatchObject({
      eligible: false,
      reason: expect.stringContaining("already scheduled"),
    });
    expect(conductManagerMeeting(scheduled, "challenge").state).toBe(scheduled);

    const scheduleCharged = {
      ...scheduled,
      scout: { ...scheduled.scout, fatigue: 14 },
    };
    const executed = conductManagerMeeting(scheduleCharged, "listen", { fatigueAlreadyPaid: true });
    expect(executed.executed).toBe(true);
    expect(executed.state.scout.fatigue).toBe(14);
  });

  it("caps manager and board memory influence at the shared strict policy bound", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `board-memory-${index}`,
      stakeholder: { kind: "board", id: "club-1" },
      subject: { kind: "scout", id: "scout-1" },
      tags: ["boardMeeting", "meetingPositive"],
      valence: 100,
      intensity: 100,
      salience: 100,
      visibility: "stakeholders" as const,
      createdAt: { season: 1, week: 1 },
    }));
    expect(evaluateStakeholderMemoryPolicy({
      memories: many,
      stakeholder: { kind: "board", id: "club-1" },
      subject: { kind: "scout", id: "scout-1" },
      now: { season: 1, week: 2 },
      domain: "boardMeeting",
    })).toMatchObject({ scoreAdjustment: 12, probabilityAdjustment: 0.12 });
  });

  it("migrates malformed optional political state without inventing history", () => {
    const legacy = state();
    legacy.scout.managerRelationship!.meetingsThisSeason = Number.NaN;
    (legacy.boardProfile as { nextMeetingAt?: unknown }).nextMeetingAt = { week: "soon" };
    const migrated = migratePoliticalMeetingState(legacy);
    const reloaded = migratePoliticalMeetingState(JSON.parse(JSON.stringify(migrated)) as GameState);

    expect(migrated.scout.managerRelationship?.meetingsThisSeason).toBe(0);
    expect(migrated.boardProfile?.nextMeetingAt).toBeUndefined();
    expect(reloaded).toEqual(migrated);
    expect(Object.values(migrated.consequenceState.memories)).toHaveLength(0);
  });

  it("fails closed when fatigue or employment cannot support a meeting", () => {
    const exhausted = state({ scout: { ...state().scout, fatigue: 97 } });
    expect(getManagerMeetingEligibility(exhausted).eligible).toBe(false);
    expect(getBoardMeetingEligibility(exhausted).eligible).toBe(false);
    const unemployed = state({
      scout: { ...state().scout, careerPath: "independent", currentClubId: undefined },
    });
    expect(getManagerMeetingEligibility(unemployed).reason).toContain("club employment");
    expect(getBoardMeetingEligibility(unemployed).reason).toContain("club employment");
  });
});
