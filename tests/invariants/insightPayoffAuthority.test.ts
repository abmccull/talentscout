import { describe, expect, it } from "vitest";

import type {
  Club,
  GameState,
  League,
  ManagerProfile,
  NewGameConfig,
  Observation,
  Player,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import { executeDatabaseQuery } from "@/engine/data/dataActivities";
import type { InsightActionContext } from "@/engine/insight/actions";
import {
  applyInsightActionResult,
  consumeInsightQueryAccuracyEffect,
  consumeInsightReportQualityEffect,
  getPendingInsightQueryAccuracyEffect,
  getPendingInsightReportQualityEffect,
} from "@/engine/insight/effects";
import { createInsightState } from "@/engine/insight/insight";
import type { InsightActionId, InsightActionResult } from "@/engine/insight/types";
import { createSession } from "@/engine/observation/session";
import type { ObservationSession } from "@/engine/observation/types";
import { generatePlayer } from "@/engine/players/generation";
import { generateReportContent, prepareReportSubmission } from "@/engine/reports";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { observePlayerLight } from "@/engine/scout/perception";
import { createObservationActions } from "@/stores/actions/observationActions";
import { createReportActions } from "@/stores/actions/reportActions";
import type { GetState, SetState } from "@/stores/actions/types";
import type { GameStoreState } from "@/stores/gameStore";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Insight",
  scoutLastName: "Tester",
  scoutAge: 33,
  specialization: "data",
  difficulty: "normal",
  worldSeed: "insight-payoff-authority",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 1,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 2,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

function player(seed: string, clubId: string, marketValue: number, potentialAbility: number): Player {
  return {
    ...generatePlayer(new RNG(seed), {
      position: "CM",
      ageRange: [18, 18],
      abilityRange: [90, 90],
      nationality: "English",
      clubId,
    }),
    marketValue,
    potentialAbility,
  };
}

function session(actionId: string, activityType: "databaseQuery" | "schoolMatch" = "schoolMatch"): ObservationSession {
  return createSession({
    activityType,
    specialization: activityType === "databaseQuery" ? "data" : "youth",
    playerPool: [{ playerId: "prospect", name: "Insight Prospect", position: "CM" }],
    targetPlayerId: "prospect",
    seed: `insight-session-${actionId}`,
    week: 6,
    season: 2,
    countryId: "england",
  }, new RNG(`insight-session-${actionId}`));
}

interface Fixture {
  state: GameState;
  scout: Scout;
  prospect: Player;
  marketFind: Player;
  youth: UnsignedYouth;
}

function fixture(): Fixture {
  const scout = {
    ...createScout(CONFIG, new RNG("insight-scout")),
    currentClubId: "club-1",
    insightState: {
      ...createInsightState(),
      points: 80,
      capacity: 80,
    },
  };
  const prospect = {
    ...player("insight-prospect", "club-1", 900_000, 135),
    id: "prospect",
  };
  const marketFind = {
    ...player("insight-market-find", "club-1", 80_000, 185),
    id: "market-find",
  };
  const youth: UnsignedYouth = {
    id: "youth-prospect",
    player: prospect,
    visibility: 10,
    buzzLevel: 5,
    discoveredBy: [],
    regionId: "subregion-1",
    country: "England",
    venueAppearances: [],
    generatedSeason: 2,
    placed: false,
    retired: false,
  };
  const club = {
    id: "club-1",
    name: "Insight FC",
    shortName: "INS",
    leagueId: "league-1",
    reputation: 60,
    budget: 5_000_000,
    scoutingBudget: 250_000,
    scoutingPhilosophy: "marketSmart",
    managerId: "manager-1",
    playerIds: [prospect.id, marketFind.id],
    academyPlayerIds: [],
    youthAcademyRating: 14,
  } as Club;
  const league: League = {
    id: "league-1",
    name: "Insight League",
    shortName: "INL",
    country: "England",
    tier: 1,
    clubIds: [club.id],
    season: 2,
  };
  const manager: ManagerProfile = {
    clubId: club.id,
    managerId: "manager-1",
    managerName: "Morgan Insight",
    preference: "balanced",
    reportInfluence: 0.75,
    preferredFormation: "4-3-3",
  };

  return {
    scout,
    prospect,
    marketFind,
    youth,
    state: {
      seed: CONFIG.worldSeed,
      currentWeek: 6,
      currentSeason: 2,
      difficulty: "normal",
      scout,
      players: {
        [prospect.id]: prospect,
        [marketFind.id]: marketFind,
      },
      clubs: { [club.id]: club },
      leagues: { [league.id]: league },
      managerProfiles: { [club.id]: manager },
      observations: {},
      reports: {},
      scoutingCases: {},
      contacts: {
        "contact-1": {
          id: "contact-1",
          name: "Casey Coach",
          type: "academyCoach",
          organization: "Insight Academy",
          relationship: 20,
          reliability: 85,
          knownPlayerIds: [prospect.id],
        },
      },
      contactIntel: {},
      watchlist: [],
      discoveryRecords: [],
      unsignedYouth: { [youth.id]: youth },
      gutFeelings: [],
      subRegions: {
        "subregion-1": {
          id: "subregion-1",
          name: "North Insight",
          country: "England",
          countryKey: "england",
          familiarity: 35,
        },
      },
      youthTournaments: {},
      systemFitCache: {},
      anomalyFlags: [],
      statisticalProfiles: {},
      predictions: [],
      clubResponses: [],
      managerDirectives: [],
      inbox: [],
      youthRecruitmentBriefs: {},
      retiredPlayers: {},
      internationalAssignments: [],
      activeInternationalAssignment: null,
      schedule: {
        week: 6,
        season: 2,
        activities: Array.from({ length: 7 }, () => null),
        completed: false,
      },
    } as unknown as GameState,
  };
}

function contextFor(
  data: Fixture,
  actionId: string,
  activityType: "databaseQuery" | "schoolMatch" = "schoolMatch",
): { context: InsightActionContext; session: ObservationSession } {
  const activeSession = session(actionId, activityType);
  return {
    session: activeSession,
    context: {
      scout: data.state.scout,
      session: activeSession,
      targetPlayerId: data.prospect.id,
      players: data.state.players,
      contacts: data.state.contacts,
      subRegionId: "subregion-1",
      leagueId: "league-1",
      leaguePlayers: Object.values(data.state.players),
      week: data.state.currentWeek,
      season: data.state.currentSeason,
    },
  };
}

function applyResult(
  data: Fixture,
  state: GameState,
  result: InsightActionResult,
  activityType: "databaseQuery" | "schoolMatch" = "schoolMatch",
): GameState {
  const scoped = contextFor({ ...data, state }, result.actionId, activityType);
  return applyInsightActionResult({
    state,
    ...scoped,
    result,
    insightState: state.scout.insightState ?? createInsightState(),
  }).state;
}

describe("Insight payoff authority", () => {
  it("persists all twelve action payoffs into their canonical gameplay systems", () => {
    const data = fixture();
    const p = data.prospect;
    let state = data.state;
    const results: Array<[InsightActionResult, "databaseQuery" | "schoolMatch"]> = [
      [{
        actionId: "clarityOfVision",
        success: true,
        narrative: "Passing read with complete clarity.",
        observations: [{ playerId: p.id, attribute: "passing", trueValue: p.attributes.passing, confidence: 1 }],
      }, "schoolMatch"],
      [{
        actionId: "hiddenNature",
        success: true,
        narrative: "Professional habits revealed.",
        revealedAttributes: [{ playerId: p.id, attribute: "professionalism", value: p.attributes.professionalism }],
      }, "schoolMatch"],
      [{
        actionId: "theVerdict",
        success: true,
        narrative: "The next report will be a masterwork.",
        reportQualityBonus: 30,
      }, "schoolMatch"],
      [{
        actionId: "secondLook",
        success: true,
        narrative: "An unfocused player is recovered from memory.",
        observations: [{ playerId: p.id, attribute: "vision", trueValue: p.attributes.vision, confidence: 1 }],
        discoveredPlayerId: p.id,
      }, "schoolMatch"],
      [{
        actionId: "diamondInTheRough",
        success: true,
        narrative: "A prospect separates from the field.",
        observations: [{ playerId: p.id, attribute: "firstTouch", trueValue: p.attributes.firstTouch, confidence: 1 }],
        discoveredPlayerId: p.id,
      }, "schoolMatch"],
      [{
        actionId: "generationalWhisper",
        success: true,
        narrative: "The upside signal is exceptionally strong.",
        discoveredPlayerId: p.id,
        wonderkidSignal: { playerId: p.id, perceivedTier: "worldClass", reliability: 0.95 },
      }, "schoolMatch"],
      [{
        actionId: "perfectFit",
        success: true,
        narrative: "The tactical fit is clear.",
        systemFitData: { CM: 90 },
      }, "schoolMatch"],
      [{
        actionId: "pressureTest",
        success: true,
        narrative: "The pressure response is exposed.",
        revealedAttributes: [{
          playerId: p.id,
          attribute: "bigGameTemperament",
          value: p.attributes.bigGameTemperament,
        }],
      }, "schoolMatch"],
      [{
        actionId: "networkPulse",
        success: true,
        narrative: "The network shares a private character read.",
        contactIntel: [{
          playerId: p.id,
          attribute: "consistency",
          hint: "Training standards are dependable.",
          reliability: 0.85,
          sourceContactId: "contact-1",
          sourceName: "Casey Coach",
          recordedWeek: 6,
          recordedSeason: 2,
        }],
      }, "schoolMatch"],
      [{
        actionId: "territoryMastery",
        success: true,
        narrative: "Local patterns become second nature.",
        confidenceBonus: 0.1,
      }, "schoolMatch"],
      [{
        actionId: "algorithmicEpiphany",
        success: true,
        narrative: "The next model cycle will be noise-free.",
        queryAccuracyBonus: 1,
        leagueId: "league-1",
      }, "databaseQuery"],
      [{
        actionId: "marketBlindSpot",
        success: true,
        narrative: "An undervalued player has been isolated.",
        undervaluedPlayers: [data.marketFind.id],
        leagueId: "league-1",
      }, "databaseQuery"],
    ];

    for (const [result, activityType] of results) {
      state = applyResult(data, state, result, activityType);
    }

    expect(Object.values(state.observations)).toHaveLength(5);
    expect(Object.values(state.observations).flatMap((item) => item.attributeReadings))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ attribute: "passing", perceivedValue: p.attributes.passing, confidence: 1 }),
        expect.objectContaining({ attribute: "professionalism", perceivedValue: p.attributes.professionalism, confidence: 1 }),
        expect.objectContaining({ attribute: "bigGameTemperament", perceivedValue: p.attributes.bigGameTemperament, confidence: 1 }),
      ]));
    expect(state.watchlist).toEqual(expect.arrayContaining([p.id, data.marketFind.id]));
    expect(state.discoveryRecords.map((record) => record.playerId))
      .toEqual(expect.arrayContaining([p.id, data.marketFind.id]));
    expect(state.unsignedYouth[data.youth.id].discoveredBy).toContain(data.scout.id);
    expect(state.gutFeelings).toContainEqual(expect.objectContaining({
      playerId: p.id,
      perceivedTier: "worldClass",
      reliability: 0.95,
    }));
    expect(state.systemFitCache[`${p.id}:club-1`]).toEqual(expect.objectContaining({
      playerId: p.id,
      clubId: "club-1",
    }));
    expect(state.contactIntel[p.id]).toContainEqual(expect.objectContaining({
      sourceContactId: "contact-1",
      attribute: "consistency",
    }));
    expect(state.subRegions["subregion-1"].familiarity).toBe(45);
    expect(getPendingInsightReportQualityEffect(state.scout.insightState, p.id)?.bonusPoints).toBe(30);
    expect(getPendingInsightQueryAccuracyEffect(state.scout.insightState)).toMatchObject({
      accuracyBonus: 1,
      leagueId: "league-1",
    });
    expect(state.anomalyFlags).toContainEqual(expect.objectContaining({
      playerId: data.marketFind.id,
      stat: "marketValue",
    }));
    expect(state.scout.insightState?.history.map((record) => record.actionId))
      .toEqual(results.map(([result]) => result.actionId));
  });

  it("replaces rather than stacks deferred effects and consumes each exactly once", () => {
    const data = fixture();
    let state = applyResult(data, data.state, {
      actionId: "theVerdict",
      success: true,
      narrative: "First verdict.",
      reportQualityBonus: 30,
    });
    state = applyResult(data, state, {
      actionId: "theVerdict",
      success: false,
      narrative: "Replacement partial verdict.",
      reportQualityBonus: 18,
    });
    state = applyResult(data, state, {
      actionId: "algorithmicEpiphany",
      success: true,
      narrative: "First query effect.",
      queryAccuracyBonus: 1,
      leagueId: "league-1",
    }, "databaseQuery");
    state = applyResult(data, state, {
      actionId: "algorithmicEpiphany",
      success: false,
      narrative: "Replacement partial query effect.",
      queryAccuracyBonus: 0.6,
      leagueId: "league-1",
    }, "databaseQuery");

    const reportEffect = getPendingInsightReportQualityEffect(state.scout.insightState, data.prospect.id)!;
    const queryEffect = getPendingInsightQueryAccuracyEffect(state.scout.insightState)!;
    expect(state.scout.insightState?.persistedEffects?.pendingReportQuality).toHaveLength(1);
    expect(state.scout.insightState?.persistedEffects?.pendingQueryAccuracy).toHaveLength(1);
    expect(reportEffect.bonusPoints).toBe(18);
    expect(queryEffect.accuracyBonus).toBe(0.6);

    const afterReport = consumeInsightReportQualityEffect(state.scout.insightState!, reportEffect.id);
    const afterQuery = consumeInsightQueryAccuracyEffect(afterReport, queryEffect.id);
    expect(getPendingInsightReportQualityEffect(afterQuery, data.prospect.id)).toBeUndefined();
    expect(getPendingInsightQueryAccuracyEffect(afterQuery)).toBeUndefined();
    expect(consumeInsightReportQualityEffect(afterQuery, reportEffect.id)).toEqual(afterQuery);
    expect(consumeInsightQueryAccuracyEffect(afterQuery, queryEffect.id)).toEqual(afterQuery);
  });

  it("passes league context through the store and records a real market discovery", () => {
    const data = fixture();
    const analysisSession = session("market-store", "databaseQuery");
    let store = {
      activeSession: analysisSession,
      gameState: {
        ...data.state,
        scout: {
          ...data.state.scout,
          primarySpecialization: "data" as const,
          fatigue: 0,
          insightState: { ...createInsightState(), points: 60, capacity: 80 },
        },
      },
      weekSimulation: undefined,
      lastInsightResult: null,
    } as unknown as GameStoreState;
    const get = (() => store) as GetState;
    const set = ((partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    }) as SetState;

    expect(createObservationActions(get, set).useInsight("marketBlindSpot")).toBe(true);
    expect(store.lastInsightResult).toMatchObject({
      actionId: "marketBlindSpot",
      success: true,
      leagueId: "league-1",
    });
    expect(store.gameState!.watchlist).toContain(data.marketFind.id);
    expect(store.gameState!.anomalyFlags.some((flag) => flag.playerId === data.marketFind.id)).toBe(true);
    expect(store.gameState!.scout.insightState?.history.at(-1)).toMatchObject({
      actionId: "marketBlindSpot",
      outcome: "valuable",
    });
    expect(store.gameState!.scout.fatigue).toBe(8);
  });

  it("removes all statistical noise when a full query accuracy effect is consumed", () => {
    const data = fixture();
    const exact = executeDatabaseQuery(
      new RNG("perfect-insight-query"),
      data.scout,
      data.state.leagues["league-1"],
      { [data.prospect.id]: data.prospect },
      {},
      2,
      6,
      { accuracyBonus: 1 },
    ).profiles[0];
    const attributes = data.prospect.attributes;
    const expectedGoals = (
      attributes.shooting * 0.5
      + attributes.composure * 0.25
      + attributes.positioning * 0.25
    ) / 20 * 0.8;

    expect(exact.per90.goals).toBeCloseTo(expectedGoals, 10);
    expect(exact.evidenceContext).toBeUndefined();
  });

  it("applies The Verdict to the matching submitted report and then clears it", () => {
    const data = fixture();
    const observation: Observation = {
      ...observePlayerLight(
        new RNG("insight-report-observation"),
        data.prospect,
        data.scout,
        "academyVisit",
        [],
      ),
      week: 6,
      season: 2,
    };
    let state = applyResult(data, {
      ...data.state,
      observations: { [observation.id]: observation },
    }, {
      actionId: "theVerdict",
      success: true,
      narrative: "A masterwork report is ready.",
      reportQualityBonus: 30,
    });
    const draft = generateReportContent(data.prospect, [observation], state.scout);
    const summary = "A concise evidence-backed assessment with a clear recommendation.";
    const strengths = draft.suggestedStrengths.slice(0, 3);
    const weaknesses = draft.suggestedWeaknesses.slice(0, 2);
    const expected = prepareReportSubmission({
      draft,
      conviction: "recommend",
      summary,
      strengths,
      weaknesses,
      scout: state.scout,
      week: 6,
      season: 2,
      playerId: data.prospect.id,
      observations: [observation],
      playerContext: data.prospect,
      reportQualityBonus: 0.3,
    }).quality.score;
    let store = {
      gameState: state,
      selectedPlayerId: data.prospect.id,
      currentScreen: "reportWriter",
      pendingListingReportId: null,
    } as unknown as GameStoreState;
    const get = (() => store) as GetState;
    const set = ((partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    }) as SetState;

    createReportActions(get, set).submitReport(
      "recommend",
      summary,
      strengths,
      weaknesses,
    );

    expect(Object.values(store.gameState!.reports)[0].qualityScore).toBe(expected);
    expect(getPendingInsightReportQualityEffect(
      store.gameState!.scout.insightState,
      data.prospect.id,
    )).toBeUndefined();
  });
});
