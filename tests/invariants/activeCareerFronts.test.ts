import { describe, expect, it } from "vitest";
import type { AlumniRecord, GameState, Player } from "@/engine/core/types";
import {
  applyPreparedActiveCareerFront,
  prepareWeeklyActiveCareerFrontCandidate,
  projectActiveCareerFronts,
} from "@/engine/career/activeCareerFronts";
import {
  createConsequenceEngineState,
  maintainConsequenceLifecycle,
  processDueConsequences,
  selectDecisionOption,
} from "@/engine/consequences";
import { buildDashboardActiveFronts } from "@/engine/dashboard/activeFronts";
import {
  collectCareerInterventionEvidence,
  determineCareerInterventionEnvironmentStrategy,
  projectCareerInterventionPortfolio,
} from "@/engine/career/careerInterventionPortfolio";
import { createRunManifest } from "@/engine/run";
import { createActiveCareerFrontCallbackMessage } from "@/stores/actions/weeklyNarrativeConsequences";
import {
  createDevelopmentEnvironmentIndex,
  evaluatePlayerDevelopmentEnvironment,
} from "@/engine/world/developmentEnvironment";
import { processPlayerDevelopment } from "@/engine/core/weekly/playerSimulation";
import { RNG } from "@/engine/rng";

class RecordingRNG extends RNG {
  readonly chanceProbabilities: number[] = [];

  override chance(probability: number): boolean {
    this.chanceProbabilities.push(probability);
    return false;
  }
}

function releasedPlayer(): Player {
  return {
    id: "player-front",
    firstName: "Alex",
    lastName: "Pathway",
    age: 18,
    dateOfBirth: { day: 1, month: 1, year: 2008 },
    nationality: "English",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "",
    contractExpiry: 0,
    wage: 0,
    marketValue: 0,
    attributes: {},
    currentAbility: 70,
    potentialAbility: 110,
    developmentProfile: "steadyGrower",
    wonderkidTier: "journeyman",
    form: 50,
    morale: 45,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  } as unknown as Player;
}

function alumni(): AlumniRecord {
  return {
    id: "alumni-front",
    caseId: "case-front",
    placementReportId: "placement-front",
    originatingReportId: "report-front",
    playerId: "player-front",
    placedClubId: "club-front",
    currentClubId: "club-front",
    milestones: [],
    careerSnapshots: [],
    placedWeek: 1,
    placedSeason: 1,
    careerUpdates: [{
      week: 3,
      season: 1,
      type: "released",
      description: "The academy released Alex before a senior route opened.",
    }],
    currentStatus: "released",
    seasonStats: [],
    becameContact: false,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  const player = releasedPlayer();
  return {
    seed: "active-front-test",
    currentWeek: 12,
    currentSeason: 1,
    difficulty: "normal",
    runManifest: createRunManifest({
      rootSeed: "active-front-test",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    }),
    scout: {
      id: "scout-front",
      firstName: "Youth",
      lastName: "Scout",
      primarySpecialization: "youth",
      reputation: 40,
      fatigue: 10,
      clubTrust: 50,
    },
    players: { [player.id]: player },
    unsignedYouth: {},
    retiredPlayers: {},
    alumniRecords: [alumni()],
    clubs: {
      "club-front": {
        id: "club-front",
        name: "Northbridge Academy",
        playerIds: [],
        academyPlayerIds: [],
        leagueId: "league-front",
        scoutingPhilosophy: "academyFirst",
        reputation: 50,
        youthAcademyRating: 50,
      },
    },
    leagues: {
      "league-front": {
        id: "league-front",
        country: "england",
        tier: 2,
      },
    },
    fixtures: {},
    managerProfiles: {},
    matchRatings: {},
    activeLoans: [],
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    scoutingCases: {},
    reports: {},
    ...overrides,
  } as unknown as GameState;
}

describe("active career fronts", () => {
  it("projects a deterministic live front from a released placed-player career", () => {
    const first = projectActiveCareerFronts(state());
    const replay = projectActiveCareerFronts(state());

    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "stalledPathway",
      trigger: "released",
      urgency: "critical",
      decisionStatus: "unaddressed",
      playerId: "player-front",
      alumniRecordId: "alumni-front",
    });
    expect(first[0].title).toContain("pathway has collapsed");
    expect(first[0].evidenceIds).toEqual(expect.arrayContaining([
      "alumni-front",
      "case-front",
      "report-front",
      "placement-front",
    ]));
  });

  it("registers one three-way response through the shared consequence ledger", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial);
    expect(prepared).toBeDefined();
    expect(prepared?.candidate.requiresChoice).toBe(true);
    expect(prepared?.decision.options.map((option) => option.id)).toEqual([
      "back-pathway",
      "reopen-route",
      "revise-call",
    ]);

    const applied = applyPreparedActiveCareerFront(initial, prepared!);
    const replayed = applyPreparedActiveCareerFront(applied.state, prepared!);

    expect(applied.changed).toBe(true);
    expect(applied.state.consequenceState.decisions[prepared!.decision.id]).toBeDefined();
    expect(applied.state.inbox).toContainEqual(expect.objectContaining({
      relatedId: prepared!.decision.id,
      actionRequired: true,
    }));
    expect(replayed.changed).toBe(false);
    expect(replayed.state.inbox.filter((message) =>
      message.relatedId === prepared!.decision.id,
    )).toHaveLength(1);
  });

  it("bounds new-front review cadence while preserving open and cheap pathway projections", () => {
    expect(prepareWeeklyActiveCareerFrontCandidate(state({ currentWeek: 13 })))
      .toBeUndefined();

    const reviewState = state({
      managerProfiles: new Proxy({}, {
        get: () => {
          throw new Error("released pathways must not build the development index");
        },
      }),
    });
    expect(projectActiveCareerFronts(reviewState)).toHaveLength(1);

    const player = { ...releasedPlayer(), clubId: "club-front" };
    const healthyRecord = {
      ...alumni(),
      currentStatus: "academy" as const,
      seasonStats: [{
        season: 1,
        appearances: 4,
        goals: 0,
        assists: 0,
        avgRating: 6.5,
        clubId: "club-front",
      }],
    };
    expect(projectActiveCareerFronts(state({
      players: { [player.id]: player },
      alumniRecords: [healthyRecord],
      managerProfiles: new Proxy({}, {
        get: () => {
          throw new Error("healthy pathways must be filtered before indexing");
        },
      }),
    }))).toEqual([]);

    const prepared = prepareWeeklyActiveCareerFrontCandidate(state())!;
    const applied = applyPreparedActiveCareerFront(state(), prepared).state;
    const nextWeek = { ...applied, currentWeek: 13 };
    expect(prepareWeeklyActiveCareerFrontCandidate(nextWeek)).toBeUndefined();
    expect(projectActiveCareerFronts(nextWeek)[0]?.decisionStatus).toBe("offered");
  });

  it("turns the selected response into a later player-career callback", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
    const applied = applyPreparedActiveCareerFront(initial, prepared).state;
    const selected = selectDecisionOption(
      applied.consequenceState,
      prepared.decision.id,
      "reopen-route",
      { week: applied.currentWeek, season: applied.currentSeason },
      "player",
      38,
    );
    const consequence = Object.values(selected.state.consequences).find((record) =>
      record.tags.includes("active-career-front"),
    );
    expect(consequence).toBeDefined();
    const withImmediateRouteEffect = processDueConsequences(
      selected.state,
      { week: applied.currentWeek, season: applied.currentSeason },
      38,
    ).state;

    const message = createActiveCareerFrontCallbackMessage({
      ...applied,
      consequenceState: withImmediateRouteEffect,
    }, consequence!);

    expect(message).toMatchObject({
      relatedId: "player-front",
      actionRequired: false,
      title: "Alex Pathway: pathway review",
    });
    expect(message?.body).toContain("Reopen the route search");
    expect(message?.body).toContain("Current evidence:");
    expect(message?.body).toContain("remains unsettled at 15/100");
    expect(message?.body).not.toContain("The route has opened");
  });

  it("persists three distinct bounded route effects that weekly development consumes", () => {
    const selectedState = (optionId: "back-pathway" | "reopen-route" | "revise-call") => {
      const initial = state();
      const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
      const applied = applyPreparedActiveCareerFront(initial, prepared).state;
      const selected = selectDecisionOption(
        applied.consequenceState,
        prepared.decision.id,
        optionId,
        { week: applied.currentWeek, season: applied.currentSeason },
        "player",
        38,
      );
      const processed = processDueConsequences(
        selected.state,
        { week: applied.currentWeek, season: applied.currentSeason },
        38,
      );
      return { ...applied, consequenceState: processed.state };
    };
    const states = {
      stability: selectedState("back-pathway"),
      mobility: selectedState("reopen-route"),
      recalibration: selectedState("revise-call"),
    };
    const evaluations = Object.fromEntries(
      Object.entries(states).map(([key, selected]) => [
        key,
        evaluatePlayerDevelopmentEnvironment(
          selected,
          selected.players["player-front"],
          { index: createDevelopmentEnvironmentIndex(selected) },
        ),
      ]),
    );

    expect(new Set(Object.values(evaluations).map((evaluation) =>
      JSON.stringify(evaluation.mechanics),
    )).size).toBe(3);
    expect(evaluations.stability.mechanics.growthQualityMultiplier)
      .toBeGreaterThan(evaluations.mobility.mechanics.growthQualityMultiplier);
    expect(evaluations.mobility.mechanics.breakthroughMultiplier)
      .toBeGreaterThan(evaluations.stability.mechanics.breakthroughMultiplier);
    expect(evaluations.recalibration.mechanics.growthChanceMultiplier)
      .toBeLessThan(evaluations.stability.mechanics.growthChanceMultiplier);

    const mobilityFact = Object.values(states.mobility.consequenceState.facts)
      .find((fact) => fact.kind === "activeCareerFrontResponse")!;
    expect(mobilityFact).toMatchObject({
      value: "reopen-route",
      observedAt: { season: 1, week: 12 },
      metadata: {
        routeEffectVersion: 1,
        routeEffectKind: "exposure",
      },
    });
    expect(mobilityFact.expiresAt).toBeDefined();
    expect(JSON.parse(JSON.stringify(states.mobility)).consequenceState.facts[mobilityFact.id])
      .toEqual(mobilityFact);

    const simulationProbabilities = Object.fromEntries(
      Object.entries(states).map(([key, selected]) => {
        const rng = new RecordingRNG(`active-pathway-${key}`);
        processPlayerDevelopment(
          selected,
          rng,
          createDevelopmentEnvironmentIndex(selected),
        );
        return [key, rng.chanceProbabilities];
      }),
    );
    expect(simulationProbabilities.stability[0])
      .not.toBe(simulationProbabilities.mobility[0]);
    expect(simulationProbabilities.mobility[1])
      .toBeGreaterThan(simulationProbabilities.stability[1]);
    expect(simulationProbabilities.recalibration[0])
      .toBeLessThan(simulationProbabilities.stability[0]);

    const expiredMobility = {
      ...states.mobility,
      currentSeason: mobilityFact.expiresAt!.season,
      currentWeek: mobilityFact.expiresAt!.week,
    };
    expect(evaluatePlayerDevelopmentEnvironment(
      expiredMobility,
      expiredMobility.players["player-front"],
    ).projection.factors.some((factor) => factor.id === "pathway-intervention"))
      .toBe(false);
  });

  it("retains selected pathway responses as a deterministic intervention portfolio", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
    const applied = applyPreparedActiveCareerFront(initial, prepared).state;
    const selected = selectDecisionOption(
      applied.consequenceState,
      prepared.decision.id,
      "reopen-route",
      { week: applied.currentWeek, season: applied.currentSeason },
      "player",
      38,
    );
    const selectedState = { ...applied, consequenceState: selected.state };

    const first = projectCareerInterventionPortfolio(selectedState);
    const replay = projectCareerInterventionPortfolio(selectedState);

    expect(first).toEqual(replay);
    expect(first.interventions).toHaveLength(1);
    expect(first.interventions[0]).toMatchObject({
      playerId: "player-front",
      optionId: "reopen-route",
      optionLabel: "Reopen the route search",
      outcome: "monitoring",
      originalEnvironmentScore: 15,
      currentEnvironmentScore: 15,
    });
    expect(first.summary).toContain("awaiting review");
  });

  it("supports deterministic intervention filtering by player set", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
    const applied = applyPreparedActiveCareerFront(initial, prepared).state;
    const selected = selectDecisionOption(
      applied.consequenceState,
      prepared.decision.id,
      "reopen-route",
      { week: applied.currentWeek, season: applied.currentSeason },
      "player",
      38,
    );
    const selectedState = { ...applied, consequenceState: selected.state };

    expect(collectCareerInterventionEvidence(selectedState, new Set(["player-front"])))
      .toEqual(collectCareerInterventionEvidence(selectedState, "player-front"));
    expect(collectCareerInterventionEvidence(selectedState, new Set(["missing-player"])))
      .toEqual([]);
  });

  it("chooses direct projection only for small filtered intervention batches", () => {
    expect(determineCareerInterventionEnvironmentStrategy(undefined)).toBe("indexed");
    expect(determineCareerInterventionEnvironmentStrategy("player-front")).toBe("direct");
    expect(determineCareerInterventionEnvironmentStrategy(new Set(["a", "b", "c"]))).toBe("direct");
    expect(determineCareerInterventionEnvironmentStrategy(new Set(["a", "b", "c", "d"])))
      .toBe("indexed");
    expect(determineCareerInterventionEnvironmentStrategy("player-front", "indexed"))
      .toBe("indexed");
  });

  it("preserves intervention evidence across direct and indexed environment resolution paths", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
    const applied = applyPreparedActiveCareerFront(initial, prepared).state;
    const selected = selectDecisionOption(
      applied.consequenceState,
      prepared.decision.id,
      "reopen-route",
      { week: applied.currentWeek, season: applied.currentSeason },
      "player",
      38,
    );
    const selectedState = { ...applied, consequenceState: selected.state };

    const singletonFilter = new Set(["player-front"]);
    const largeFilter = new Set(["player-front", "other-1", "other-2", "other-3"]);

    expect(collectCareerInterventionEvidence(selectedState, singletonFilter, "adaptive"))
      .toEqual(collectCareerInterventionEvidence(selectedState, singletonFilter, "direct"));
    expect(collectCareerInterventionEvidence(selectedState, singletonFilter, "direct"))
      .toEqual(collectCareerInterventionEvidence(selectedState, singletonFilter, "indexed"));
    expect(collectCareerInterventionEvidence(selectedState, largeFilter, "adaptive"))
      .toEqual(collectCareerInterventionEvidence(selectedState, largeFilter, "indexed"));
    expect(collectCareerInterventionEvidence(selectedState, largeFilter, "indexed"))
      .toEqual(collectCareerInterventionEvidence(selectedState, largeFilter, "direct"));
  });

  it("does not re-offer a late-season front until the prior pathway arc fully clears", () => {
    const lateSeason = state({ currentWeek: 36, currentSeason: 1 });
    const prepared = prepareWeeklyActiveCareerFrontCandidate(lateSeason)!;
    const applied = applyPreparedActiveCareerFront(lateSeason, prepared).state;
    const selected = selectDecisionOption(
      applied.consequenceState,
      prepared.decision.id,
      "reopen-route",
      { week: applied.currentWeek, season: applied.currentSeason },
      "player",
      38,
    );
    const monitoringState = {
      ...applied,
      currentSeason: 2,
      currentWeek: 4,
      consequenceState: selected.state,
    };

    const monitoringFront = projectActiveCareerFronts(monitoringState)[0];
    expect(monitoringFront?.decisionStatus).toBe("monitoring");
    expect(monitoringFront?.decisionId).toBe(prepared.decision.id);
    expect(prepareWeeklyActiveCareerFrontCandidate(monitoringState)).toBeUndefined();

    const callbackProcessed = processDueConsequences(
      monitoringState.consequenceState,
      { season: 2, week: 6 },
      38,
    ).state;
    const callbackWeekState = {
      ...monitoringState,
      currentWeek: 6,
      consequenceState: callbackProcessed,
    };
    expect(projectActiveCareerFronts(callbackWeekState)[0]?.decisionStatus).toBe("monitoring");
    expect(prepareWeeklyActiveCareerFrontCandidate(callbackWeekState)).toBeUndefined();

    const clearedFacts = maintainConsequenceLifecycle(
      callbackWeekState.consequenceState,
      { season: 2, week: 8 },
      38,
    ).state;
    const reopenedWindow = {
      ...callbackWeekState,
      currentWeek: 8,
      consequenceState: clearedFacts,
    };
    const replay = prepareWeeklyActiveCareerFrontCandidate(reopenedWindow);
    expect(replay).toBeDefined();
    expect(replay?.decision.id).toBe("active-career-front:stalled-pathway:alumni-front:s2");
  });

  it("uses the same live front for dashboard action and career context", () => {
    const initial = state();
    const prepared = prepareWeeklyActiveCareerFrontCandidate(initial)!;
    const applied = applyPreparedActiveCareerFront(initial, prepared).state;
    const front = buildDashboardActiveFronts(applied)
      .find((candidate) => candidate.family === "stalled_pathway");

    expect(front).toMatchObject({
      playerId: "player-front",
      urgency: "critical",
      actionLabel: "Choose pathway response",
      actionTarget: {
        screen: "inbox",
        decisionId: prepared.decision.id,
      },
    });
    expect(front?.careerFront?.evidenceIds).toContain("alumni-front");
  });
});
