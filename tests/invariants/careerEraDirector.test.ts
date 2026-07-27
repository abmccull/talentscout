import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import type { CareerEraContext } from "@/engine/events/careerEraDirector";
import {
  applyCareerEraDirection,
  applyDirectedCareerEraBeat,
  CAREER_ERA_HISTORY_LIMIT,
  careerEraIdentityGapWeeks,
  createCareerEraDirectorState,
  directCareerEra,
  deriveCareerEraContext,
  migrateCareerEraDirectorState,
  prepareCareerEraWeek,
} from "@/engine/events/careerEraDirector";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";

function context(overrides: Partial<CareerEraContext> = {}): CareerEraContext {
  return {
    rootSeed: "career-era-test",
    now: { season: 2026, week: 1 },
    seasonLength: 38,
    careerPath: "club",
    careerTier: 2,
    employeeCount: 0,
    financialBalance: 12_000,
    activeRecovery: false,
    activeObligationCount: 0,
    offeredDecisionCount: 0,
    rivalPressure: 1,
    knownCountryCount: 2,
    reportCount: 4,
    primaryCountryId: "england",
    primaryProspectId: "player-1",
    ...overrides,
  };
}

function candidate(overrides: Partial<StoryCandidateV2> = {}): StoryCandidateV2 {
  return {
    id: "candidate-1",
    templateId: "report-callback",
    kind: "callback",
    category: "report-vindication",
    semanticSignature: "callback:prospect",
    baseWeight: 1,
    cast: [],
    topics: [],
    ...overrides,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentWeek: 4,
    currentSeason: 1,
    runManifest: { rootSeed: "career-era-test" },
    scout: {
      careerPath: "club",
      careerTier: 2,
      homeCountry: "england",
    },
    finances: { balance: 12_000, employees: [] },
    consequenceState: createConsequenceEngineState(),
    rivalOrganizationState: {
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
      },
    },
    regionalKnowledge: { england: {} },
    reports: {},
    scoutingCases: {},
    inbox: [],
    ...overrides,
  } as unknown as GameState;
}

describe("career era director", () => {
  it("counts earned territorial knowledge instead of every zero-filled world entry", () => {
    const state = gameState({
      regionalKnowledge: {
        england: { countryId: "england", knowledgeLevel: 25 },
        brazil: { countryId: "brazil", knowledgeLevel: 0 },
        japan: { countryId: "japan", knowledgeLevel: 9 },
      },
    } as unknown as Partial<GameState>);

    expect(deriveCareerEraContext(state, 38).knownCountryCount).toBe(1);
  });

  it("creates the same medium-horizon era for the same named seed and context", () => {
    const first = directCareerEra(undefined, context());
    const second = directCareerEra(undefined, context());

    expect(first).toEqual(second);
    expect(first.current?.startedAt).toEqual({ season: 2026, week: 1 });
    expect(first.current?.endsAt).toBeDefined();
    expect(first.current?.primaryCountryId).toBe("england");
  });

  it("is idempotent when the same career week is processed twice", () => {
    const first = directCareerEra(undefined, context());
    const second = directCareerEra(first, context());

    expect(second).toEqual(first);
    expect(second.processedWeekKeys).toEqual(["2026:1"]);
  });

  it("makes an active recovery the authoritative career era", () => {
    const state = directCareerEra(undefined, context({ activeRecovery: true }));

    expect(state.current?.theme).toBe("recovery");
    expect(state.current?.title).toContain("comeback");
  });

  it("archives expired eras while keeping history bounded", () => {
    let state = directCareerEra(undefined, context());
    for (let index = 0; index < CAREER_ERA_HISTORY_LIMIT + 5; index += 1) {
      const current = state.current!;
      const nextWeek = current.endsAt.week === 38 ? 1 : current.endsAt.week + 1;
      const nextSeason = current.endsAt.week === 38
        ? current.endsAt.season + 1
        : current.endsAt.season;
      state = directCareerEra(state, context({
        now: { season: nextSeason, week: nextWeek },
      }));
    }

    expect(state.history).toHaveLength(CAREER_ERA_HISTORY_LIMIT);
  });

  it("rolls expired eras across a season boundary", () => {
    const opening = directCareerEra(undefined, context({
      now: { season: 1, week: 35 },
    }));
    const rolled = directCareerEra({
      current: {
        ...opening.current!,
        endsAt: { season: 1, week: 38 },
      },
      history: opening.history,
      processedWeekKeys: ["1:35"],
    }, context({
      now: { season: 2, week: 1 },
    }));

    expect(rolled.history).toEqual([
      expect.objectContaining({
        id: opening.current!.id,
        endedAt: { season: 1, week: 38 },
      }),
    ]);
    expect(rolled.current?.id).not.toBe(opening.current?.id);
    expect(rolled.current?.startedAt).toEqual({ season: 2, week: 1 });
    expect(rolled.processedWeekKeys).toEqual(["1:35", "2:1"]);
  });

  it("keeps the identity-gap clock stable across a season rollover", () => {
    const era = migrateCareerEraDirectorState({
      current: {
        id: "rollover-era",
        theme: "proveJudgment",
        startedAt: { season: 1, week: 34 },
        endsAt: { season: 1, week: 38 },
        lastReinforcedAt: { season: 1, week: 38 },
        reinforcementCount: 1,
      },
    }).current!;

    expect(careerEraIdentityGapWeeks(
      era,
      { season: 2, week: 3 },
      38,
    )).toBe(3);
  });

  it("boosts aligned candidates without replacing prior relevance modifiers", () => {
    const era = directCareerEra(undefined, context({ activeRecovery: true })).current!;
    const [directed] = applyCareerEraDirection([
      candidate({ relevanceMultipliers: [1.2], category: "career-recovery" }),
    ], era);

    expect(directed.relevanceMultipliers).toEqual([1.2, 1.65]);
  });

  it("preserves a neutral multiplier for unrelated critical candidates", () => {
    const era = directCareerEra(undefined, context({ activeRecovery: true })).current!;
    const [directed] = applyCareerEraDirection([
      candidate({
        kind: "worldArc",
        templateId: "unrelated-weather",
        category: "unrelated-weather",
        semanticSignature: "unrelated-weather",
        critical: true,
      }),
    ], era);

    expect(directed.relevanceMultipliers).toEqual([1]);
  });

  it("shapes legacy-emission candidates without muting continuations or critical beats", () => {
    const era = migrateCareerEraDirectorState({
      current: {
        id: "territory-era",
        theme: "territoryBuild",
        startedAt: { season: 2026, week: 1 },
        endsAt: { season: 2026, week: 8 },
        reinforcementCount: 0,
      },
    }).current!;
    const directed = applyCareerEraDirection([
      candidate({
        id: "legacy-world-arc",
        kind: "worldArc",
        category: "legacy-weather",
        semanticSignature: "legacy-weather",
        templateId: "legacy-weather",
      }),
      candidate({
        id: "legacy-finance",
        category: "finance-checkin",
        semanticSignature: "finance-checkin",
        templateId: "finance-checkin",
      }),
      candidate({
        id: "continuation-finance",
        category: "finance-checkin",
        semanticSignature: "finance-checkin",
        templateId: "finance-checkin",
        continuation: true,
      }),
      candidate({
        id: "critical-job",
        kind: "special",
        category: "job-opening",
        semanticSignature: "job-opening",
        templateId: "job-opening",
        critical: true,
      }),
    ], era);

    expect(directed.map((entry) => entry.relevanceMultipliers)).toEqual([
      [1.65],
      [0.82],
      [1],
      [1],
    ]);
  });

  it("normalizes malformed persisted state and preserves the identity-gap clock", () => {
    const migrated = migrateCareerEraDirectorState({
      version: 999,
      current: {
        id: "legacy-era",
        theme: "proveJudgment",
        startedAt: { season: 2026, week: 2 },
        endsAt: { season: 2026, week: 8 },
        reinforcementCount: -4,
      },
      history: [null, { bad: true }],
      processedWeekKeys: ["2026:2", "2026:2", 4],
    });

    expect(migrated.version).toBe(1);
    expect(migrated.current?.reinforcementCount).toBe(0);
    expect(migrated.processedWeekKeys).toEqual(["2026:2"]);
    expect(careerEraIdentityGapWeeks(
      migrated.current!,
      { season: 2026, week: 5 },
      38,
    )).toBe(3);
  });

  it("fills a genuinely quiet identity gap with a non-modal beat", () => {
    const initial = directCareerEra(undefined, context({
      now: { season: 1, week: 1 },
    }));
    const state = gameState({ careerEraDirectorState: initial });
    const prepared = prepareCareerEraWeek({
      state,
      directorState: initial,
      seasonLength: 38,
      blockedByActivity: false,
    });
    const blocked = prepareCareerEraWeek({
      state,
      directorState: initial,
      seasonLength: 38,
      blockedByActivity: true,
    });

    expect(prepared.candidate?.continuation).toBe(true);
    expect(prepared.message).toMatchObject({ type: "news", actionRequired: false });
    expect(blocked.candidate).toBeUndefined();
  });

  it("records an accepted era beat once and advances its reinforcement clock", () => {
    const initial = directCareerEra(undefined, context({
      now: { season: 1, week: 1 },
    }));
    const state = gameState({ careerEraDirectorState: initial });
    const prepared = prepareCareerEraWeek({
      state,
      directorState: initial,
      seasonLength: 38,
      blockedByActivity: false,
    });
    const acceptedIds = new Set([prepared.candidate!.id]);
    const accepted = applyDirectedCareerEraBeat({
      gameState: state,
      prepared,
      acceptedCandidateIds: acceptedIds,
    });
    const replayed = applyDirectedCareerEraBeat({
      gameState: accepted,
      prepared,
      acceptedCandidateIds: acceptedIds,
    });

    expect(accepted.inbox.filter((message) => message.id === prepared.message!.id)).toHaveLength(1);
    expect(replayed.inbox.filter((message) => message.id === prepared.message!.id)).toHaveLength(1);
    expect(accepted.careerEraDirectorState?.current?.reinforcementCount).toBe(1);
    expect(replayed.careerEraDirectorState?.current?.reinforcementCount).toBe(1);
  });
});
