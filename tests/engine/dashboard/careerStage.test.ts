import { describe, expect, it } from "vitest";

import {
  adaptCareerStageCandidate,
  buildCareerStageQueue,
  classifyCareerAdaptiveTrack,
  deriveCareerStageProfile,
} from "@/engine/dashboard/careerStage";
import type { DashboardPriorityCandidate } from "@/engine/dashboard/types";
import { createWeekSchedule } from "@/engine/core/calendar";
import type { GameState } from "@/engine/core/types";

function createBaseState(): GameState {
  return {
    currentWeek: 8,
    currentSeason: 1,
    seed: "career-stage-test",
    fixtures: {},
    schedule: createWeekSchedule(8, 1),
    scout: {
      id: "scout-1",
      careerTier: 2,
      careerPath: "club",
      careerPathChosen: true,
      primarySpecialization: "youth",
      reputation: 42,
      clubTrust: 58,
      currentClubId: "club-1",
      salary: 1200,
      reportsSubmitted: 12,
      successfulFinds: 3,
      specializationReputation: 50,
      boardDirectives: [],
      npcScoutIds: [],
      unlockedPerks: [],
      skills: {} as never,
      attributes: {
        networking: 12,
        persuasion: 12,
        endurance: 12,
        adaptability: 12,
        memory: 12,
        intuition: 12,
      },
      skillXp: {},
      attributeXp: {},
      fatigue: 12,
      discoveryCredits: [],
      countryReputations: {},
      savings: 0,
      age: 24,
      firstName: "Test",
      lastName: "Scout",
      specializationLevel: 7,
    },
    clubs: {
      "club-1": {
        id: "club-1",
        name: "Northbridge",
        scoutingPhilosophy: "academyFirst",
        reputation: 62,
        budget: 1_000_000,
        youthAcademyRating: 14,
      },
    },
    finances: {
      balance: 8_000,
      careerPath: "club",
      independentTier: undefined,
      retainerContracts: [],
      employees: [],
      pendingEmployeeEvents: [],
      office: {
        tier: "home",
        monthlyCost: 0,
        qualityBonus: 0,
        maxEmployees: 0,
      },
      clientRelationships: [],
      transactions: [],
      expenses: {},
      satelliteOffices: [],
      consultingContracts: [],
      pendingConsultingOffers: [],
      pendingRetainerOffers: [],
      reportListings: [],
      failedContractCount: 0,
      blacklistedClubs: [],
      staffWorkProducts: [],
      monthlyIncome: 0,
      lifestyle: { level: 1, monthlyCost: 200 },
    } as never,
    consequenceState: {
      decisions: {},
      obligations: {},
      memories: {},
      history: [],
      facts: {},
    },
    regionalKnowledge: {
      england: { countryId: "england", knowledgeLevel: 20 },
      spain: { countryId: "spain", knowledgeLevel: 0 },
    },
    leadershipPortfolio: {
      version: 1,
      attentionWeek: 8,
      attentionSeason: 1,
      attentionCapacity: 2,
      attentionUsed: 0,
      responsibilities: {},
      trackRecord: {
        ownedSuccesses: 0,
        ownedFailures: 0,
        delegatedSuccesses: 0,
        delegatedFailures: 0,
        deferrals: 0,
        rejected: 0,
        expired: 0,
      },
    },
    npcDelegations: {},
    rivalOrganizationState: {
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
      },
    },
    boardProfile: undefined,
    managerProfiles: {
      "club-1": {
        clubId: "club-1",
        managerName: "M. Vale",
        preference: "balanced",
        reportInfluence: 0.5,
        preferredFormation: "4-3-3",
      },
    },
    careerRecovery: null,
    careerEraDirectorState: {
      version: 1,
      current: {
        id: "era-1",
        theme: "proveJudgment",
        title: "A judgment worth defending",
        premise: "Reports define trust.",
        deskPrompt: "Find the right case.",
        startedAt: { season: 1, week: 5 },
        endsAt: { season: 1, week: 12 },
        reinforcementCount: 0,
      },
      history: [],
      processedWeekKeys: [],
    },
  } as unknown as GameState;
}

function createCandidate(
  id: string,
  title: string,
  explanation: string,
  score: number,
  overrides: Partial<DashboardPriorityCandidate> = {},
): DashboardPriorityCandidate {
  return {
    id,
    canonicalKey: id,
    aliasKeys: [],
    category: "required_action",
    severity: "medium",
    title,
    explanation,
    relatedEntityIds: [],
    sourceSystem: "career",
    actionLabel: "Open",
    actionTarget: { screen: "inbox" },
    score,
    scoreBreakdown: [],
    collector: "planner",
    ...overrides,
  };
}

describe("careerStage", () => {
  it("derives an early-career club profile and suppresses advanced management by default", () => {
    const state = createBaseState();

    const profile = deriveCareerStageProfile(state);

    expect(profile.band).toBe("early");
    expect(profile.operatingPath).toBe("club");
    expect(profile.suppressAdvancedManagement).toBe(true);
    expect(profile.rolePackage.title).toBe("Youth Scout");
  });

  it("promotes fragile senior agency careers into the late band with agency pressure", () => {
    const state = createBaseState();
    state.scout.careerPath = "independent";
    state.scout.currentClubId = undefined;
    state.scout.salary = 0;
    state.scout.careerTier = 4;
    state.scout.independentTier = 4;
    state.finances = {
      ...state.finances!,
      careerPath: "independent",
      independentTier: 4,
      balance: 1_200,
      office: {
        tier: "professional",
        monthlyCost: 1500,
        qualityBonus: 0.15,
        maxEmployees: 6,
      },
      employees: [
        {
          id: "emp-1",
          name: "Agency Scout",
          role: "scout",
          quality: 65,
          salary: 1200,
          morale: 34,
          fatigue: 82,
          hiredWeek: 2,
          hiredSeason: 1,
          experience: 12,
          weeklyLog: [],
          regionFocusWeeks: 0,
        },
      ],
      clientRelationships: [
        {
          clubId: "club-1",
          satisfaction: 41,
          tenureWeeks: 2,
          status: "active",
          lastInteractionWeek: 7,
          lastInteractionSeason: 1,
        },
      ],
      retainerContracts: [
        {
          id: "retainer-1",
          clubId: "club-1",
          tier: 2,
          monthlyFee: 900,
          requiredReportsPerMonth: 2,
          reportsDeliveredThisMonth: 0,
          status: "active",
          consecutivePeriodsMissed: 1,
        },
      ],
    } as never;

    const profile = deriveCareerStageProfile(state);

    expect(profile.band).toBe("late");
    expect(profile.operatingPath).toBe("agency");
    expect(profile.pressure).toBe("agency");
    expect(profile.prioritizeLateCareerSystems).toBe(true);
  });

  it("classifies dashboard candidates into career-adaptive tracks deterministically", () => {
    expect(classifyCareerAdaptiveTrack(createCandidate(
      "agency",
      "Agency runway is short",
      "Client concentration and runway are both under pressure.",
      100,
      { sourceSystem: "career", collector: "reports" },
    ))).toBe("agency");

    expect(classifyCareerAdaptiveTrack(createCandidate(
      "politics",
      "Board directive is waiting",
      "Manager trust is thin and the board expects a response.",
      100,
      {
        sourceSystem: "career",
        collector: "offered_decision" as never,
      },
    ))).toBe("politics");

    expect(classifyCareerAdaptiveTrack(createCandidate(
      "territory",
      "Open world outlook",
      "Regional access and international travel define the next move.",
      100,
      { sourceSystem: "scouting" },
    ))).toBe("territory");
  });

  it("suppresses non-blocking advanced management in early careers but preserves blocking items", () => {
    const profile = deriveCareerStageProfile(createBaseState());
    const passiveLeadership = adaptCareerStageCandidate(
      createCandidate(
        "leadership-passive",
        "Leadership responsibility",
        "Delegated staff quality needs a review.",
        120,
        { sourceSystem: "career", collector: "offered_decision" as never },
      ),
      profile,
    );
    const blockingLeadership = adaptCareerStageCandidate(
      createCandidate(
        "leadership-blocking",
        "Leadership responsibility",
        "Delegated staff quality needs a review.",
        120,
        {
          sourceSystem: "career",
          collector: "offered_decision" as never,
          scoreBreakdown: [
            {
              factor: "must_resolve_before_advance",
              score: 100,
              note: "Blocks week advance.",
            },
          ],
        },
      ),
      profile,
    );

    expect(passiveLeadership.advancedManagement).toBe(true);
    expect(passiveLeadership.adjustedScore).toBeLessThan(80);
    expect(blockingLeadership.blocking).toBe(true);
    expect(blockingLeadership.adjustedScore).toBeGreaterThan(passiveLeadership.adjustedScore);
  });

  it("creates at least 60 percent queue divergence between early and late careers when representative candidates exist", () => {
    const earlyProfile = deriveCareerStageProfile(createBaseState());
    const lateState = createBaseState();
    lateState.scout.careerTier = 5;
    lateState.scout.clubTrust = 28;
    lateState.scout.managerRelationship = {
      managerName: "M. Vale",
      trust: 34,
      influence: 52,
      scoutingPreference: "balanced",
      meetingsThisSeason: 0,
    };
    lateState.boardProfile = {
      personality: "ambitious",
      patience: 46,
      satisfactionLevel: 42,
      budgetMultiplier: 1,
      ultimatumIssued: true,
      recentDirectives: [],
    };
    lateState.leadershipPortfolio!.responsibilities = {
      "lead-1": {
        id: "lead-1",
        playerId: "player-1",
        title: "Urgent second opinion",
        description: "Own or delegate the call.",
        priority: "critical",
        createdWeek: 8,
        createdSeason: 1,
        dueWeek: 10,
        dueSeason: 1,
        status: "open",
        deferrals: 0,
      },
    };
    const lateProfile = deriveCareerStageProfile(lateState);

    const candidates = [
      createCandidate("craft-1", "Write the report on Milo Hart", "Prepared notes are ready for a recommendation.", 168, {
        sourceSystem: "reports",
        collector: "reports",
      }),
      createCandidate("craft-2", "Follow up on Ari Cole", "The club asked for clearer supporting evidence.", 164, {
        sourceSystem: "reports",
        collector: "reports",
      }),
      createCandidate("planner-1", "2 days are still unallocated this week", "Unused planner space leaves attention on the table.", 160, {
        sourceSystem: "planner",
        collector: "planner",
      }),
      createCandidate("territory-1", "Open world outlook", "Regional access and international travel shape the next edge.", 150, {
        sourceSystem: "scouting",
        collector: "planner",
      }),
      createCandidate("rival-1", "Open Showcase Window", "A rival opening expires soon.", 154, {
        sourceSystem: "rivals",
        collector: "rivals",
        category: "opportunity",
      }),
      createCandidate("leadership-1", "Leadership responsibility delivered", "Delegated staff work changed the department outcome.", 146, {
        sourceSystem: "career",
        collector: "offered_decision" as never,
      }),
      createCandidate("politics-1", "Board directive is waiting", "Manager trust is thin and the board expects a response.", 148, {
        sourceSystem: "career",
        collector: "offered_decision" as never,
      }),
      createCandidate("agency-1", "Agency runway is short", "Client concentration and operating runway are both under pressure.", 152, {
        sourceSystem: "career",
        collector: "reports",
      }),
      createCandidate("legacy-1", "Historical callback: Season 1 review", "A formal review still defines the trust floor.", 144, {
        sourceSystem: "career",
        collector: "narrative_event" as never,
        category: "career_story",
      }),
    ];

    const earlyQueue = buildCareerStageQueue(candidates, earlyProfile).selected.map((item) => item.candidate.id);
    const lateQueue = buildCareerStageQueue(candidates, lateProfile).selected.map((item) => item.candidate.id);
    const overlap = earlyQueue.filter((id) => lateQueue.includes(id));

    expect(overlap.length).toBeLessThanOrEqual(2);
    expect(earlyQueue).toEqual(
      expect.arrayContaining(["craft-1", "craft-2", "planner-1"]),
    );
    expect(lateQueue).toEqual(
      expect.arrayContaining(["leadership-1", "politics-1", "legacy-1"]),
    );
  });
});
