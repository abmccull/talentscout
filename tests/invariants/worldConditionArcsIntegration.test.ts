import { describe, expect, it } from "vitest";
import type { GameState, RunManifest, Scout } from "@/engine/core/types";
import {
  createConsequenceEngineState,
  processDueConsequences,
  selectDecisionOption,
} from "@/engine/consequences";
import {
  createStoryDirectorStateV2,
  directWeeklyStoryEmissionsV2,
} from "@/engine/events";
import { createRunManifest } from "@/engine/run";
import {
  createWorldConditionArcState,
  reconcileWorldConditionArcDecisions,
} from "@/engine/world/worldConditionArcs";
import {
  getWorldConditionModifiers,
  type WorldConditionInstance,
  type WorldConditionModifiers,
} from "@/engine/world/worldConditions";
import { getRegionalTravelQuote } from "@/engine/world/regionalPresence";
import {
  applyDirectedWorldConditionArcBeats,
  prepareWorldConditionArcWeek,
} from "@/stores/actions/weeklyWorldConditionArcs";

const NEUTRAL_MODIFIERS: WorldConditionModifiers = {
  discoveryMultiplier: 1,
  observationConfidenceMultiplier: 1,
  opportunityMultiplier: 1,
  developmentMultiplier: 1,
  breakthroughMultiplier: 1,
  recruitmentScoreAdjustment: 0,
  travelCostMultiplier: 1,
  travelDurationDelta: 0,
  travelFatigueMultiplier: 1,
  marketplaceValueMultiplier: 1,
  rivalPressureMultiplier: 1,
  seasonalFinanceAdjustment: 0,
};

const CONDITION: WorldConditionInstance = {
  id: "academy-investment-wave:s1:portugal",
  definitionId: "academy-investment-wave",
  scope: "regional",
  season: 1,
  countryId: "portugal",
  modifiers: NEUTRAL_MODIFIERS,
};

function manifest(): RunManifest {
  return createRunManifest({
    rootSeed: "world-arc-production",
    specialization: "youth",
    difficulty: "normal",
    selectedCountries: ["england", "portugal"],
    startingCountry: "england",
    worldTraitIds: [],
  });
}

function scout(): Scout {
  return {
    id: "arc-scout",
    firstName: "Mara",
    lastName: "Vale",
    age: 33,
    nationality: "English",
    homeCountry: "england",
    skills: {},
    attributes: {},
    primarySpecialization: "youth",
    specializationLevel: 5,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 2,
    careerPath: "independent",
    reputation: 40,
    clubTrust: 0,
    specializationReputation: 30,
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 0,
    skillXp: {},
    attributeXp: {},
    npcScoutIds: [],
    countryReputations: {},
    boardDirectives: [],
  } as unknown as Scout;
}

function stateAt(week = 1): GameState {
  const runManifest = manifest();
  return {
    seed: runManifest.rootSeed,
    runManifest,
    currentWeek: week,
    currentSeason: 1,
    difficulty: "normal",
    scout: scout(),
    fixtures: {},
    countries: ["england", "portugal"],
    territories: {
      portugal: {
        id: "territory-portugal",
        country: "Portugal",
        countryKey: "portugal",
        leagueIds: ["league-portugal"],
      },
    },
    leagues: {
      "league-portugal": {
        id: "league-portugal",
        country: "Portugal",
      },
    },
    clubs: {
      "club-portugal": {
        id: "club-portugal",
        leagueId: "league-portugal",
      },
    },
    players: {
      "player-portugal": {
        id: "player-portugal",
        clubId: "club-portugal",
      },
    },
    subRegions: {},
    unsignedYouth: {},
    youthTournaments: {},
    contacts: {},
    npcScouts: {},
    assistantScouts: [],
    regionalKnowledge: {},
    inbox: [],
    narrativeEvents: [],
    storyDirectorV2: createStoryDirectorStateV2(),
    consequenceState: createConsequenceEngineState(),
    worldConditionState: {
      version: 1,
      activeSeason: 1,
      active: [CONDITION],
      history: [{ season: 1, conditions: [CONDITION], callback: "A test wave." }],
    },
    worldConditionArcState: createWorldConditionArcState(),
  } as unknown as GameState;
}

function directDueBeats(state: GameState): GameState {
  const prepared = prepareWorldConditionArcWeek(state);
  const direction = directWeeklyStoryEmissionsV2({
    rootSeed: prepared.state.runManifest.rootSeed,
    state: createStoryDirectorStateV2(prepared.state.storyDirectorV2),
    now: { week: prepared.state.currentWeek, season: prepared.state.currentSeason },
    priorEvents: prepared.state.narrativeEvents,
    emissions: [],
    candidates: prepared.beats.map((beat) => beat.candidate),
    activeChoiceCount: Object.values(prepared.state.consequenceState.decisions)
      .filter((decision) => decision.status === "offered")
      .length,
  });
  return applyDirectedWorldConditionArcBeats({
    state: { ...prepared.state, storyDirectorV2: direction.state },
    beats: prepared.beats,
    acceptedBeatIds: new Set(
      direction.acceptedCandidates.map(({ candidate }) => candidate.id),
    ),
  });
}

function chooseIndependentCircuit(state: GameState): GameState {
  const decision = Object.values(state.consequenceState.decisions).find(
    (candidate) => candidate.source.kind === "worldConditionArc" && candidate.status === "offered",
  );
  if (!decision) return state;
  const now = { week: state.currentWeek, season: state.currentSeason };
  const selected = selectDecisionOption(
    state.consequenceState,
    decision.id,
    "independent-circuit",
    now,
  );
  if (selected.error) throw new Error(selected.error);
  const processed = processDueConsequences(selected.state, now);
  if (processed.errors.length > 0) throw new Error(processed.errors.join("; "));
  return {
    ...state,
    consequenceState: processed.state,
    worldConditionArcState: reconcileWorldConditionArcDecisions({
      state: createWorldConditionArcState(state.worldConditionArcState),
      decisions: processed.state.decisions,
      now,
    }),
  };
}

function runThroughWeekNine(source: GameState, reloadEachWeek: boolean): GameState {
  let state = source;
  for (let week = 1; week <= 9; week += 1) {
    state = { ...state, currentWeek: week };
    if (reloadEachWeek) state = JSON.parse(JSON.stringify(state)) as GameState;
    state = chooseIndependentCircuit(directDueBeats(state));
  }
  return state;
}

describe("world-condition arc production integration", () => {
  it("never skips an unseen signal when its decision date arrives", () => {
    const prepared = prepareWorldConditionArcWeek(stateAt());
    const overdue = prepareWorldConditionArcWeek({
      ...prepared.state,
      currentWeek: 3,
    });

    expect(overdue.beats).toHaveLength(1);
    expect(overdue.beats[0].phase).toBe("signal");
    expect(overdue.beats[0].candidate.continuation).toBe(true);
  });

  it("shares one opening slot with legacy narrative sources", () => {
    const prepared = prepareWorldConditionArcWeek(stateAt());
    const direction = directWeeklyStoryEmissionsV2({
      rootSeed: prepared.state.runManifest.rootSeed,
      state: createStoryDirectorStateV2(),
      now: { week: 1, season: 1 },
      priorEvents: [],
      emissions: [{
        event: {
          id: "standalone-competitor",
          type: "mediaInterview",
          week: 1,
          season: 1,
          title: "A competing story",
          description: "Only one new story should open this week.",
          relatedIds: [],
          acknowledged: false,
        },
      }],
      candidates: prepared.beats.map((beat) => beat.candidate),
    });

    expect(direction.accepted.length + direction.acceptedCandidates.length).toBe(1);
    expect(direction.rejected.length + direction.rejectedCandidates.length).toBe(1);
  });

  it("emits and registers each directed beat exactly once", () => {
    const prepared = prepareWorldConditionArcWeek(stateAt());
    expect(prepared.beats.map((beat) => beat.phase)).toEqual(["signal"]);
    const direction = directWeeklyStoryEmissionsV2({
      rootSeed: prepared.state.runManifest.rootSeed,
      state: createStoryDirectorStateV2(),
      now: { week: 1, season: 1 },
      priorEvents: [],
      emissions: [],
      candidates: prepared.beats.map((beat) => beat.candidate),
    });
    const acceptedIds = new Set(
      direction.acceptedCandidates.map(({ candidate }) => candidate.id),
    );
    const once = applyDirectedWorldConditionArcBeats({
      state: prepared.state,
      beats: prepared.beats,
      acceptedBeatIds: acceptedIds,
    });
    const twice = applyDirectedWorldConditionArcBeats({
      state: once,
      beats: prepared.beats,
      acceptedBeatIds: acceptedIds,
    });

    expect(twice).toEqual(once);
    expect(once.inbox.filter((message) => message.id.startsWith("world-arc-beat:")))
      .toHaveLength(1);
    expect(prepareWorldConditionArcWeek(once).beats).toEqual([]);

    const decisionWeek = directDueBeats({ ...once, currentWeek: 3 });
    const replayedDecisionWeek = directDueBeats(decisionWeek);
    const arcDecisions = Object.values(decisionWeek.consequenceState.decisions)
      .filter((decision) => decision.source.kind === "worldConditionArc");

    expect(arcDecisions).toHaveLength(1);
    expect(decisionWeek.inbox.filter((message) => message.actionRequired))
      .toHaveLength(1);
    expect(replayedDecisionWeek).toEqual(decisionWeek);
  });

  it("keeps manual, batched, and save-reloaded weekly scheduling deterministic", () => {
    const source = stateAt();
    const manual = runThroughWeekNine(structuredClone(source), false);
    const batched = runThroughWeekNine(structuredClone(source), false);
    const saveReloaded = runThroughWeekNine(structuredClone(source), true);

    expect(batched.worldConditionArcState).toEqual(manual.worldConditionArcState);
    expect(saveReloaded.worldConditionArcState).toEqual(manual.worldConditionArcState);
    expect(saveReloaded.consequenceState.decisions).toEqual(
      manual.consequenceState.decisions,
    );
    expect(saveReloaded.storyDirectorV2).toEqual(manual.storyDirectorV2);
    expect(manual.worldConditionArcState?.active).toEqual({});
    expect(manual.worldConditionArcState?.completed).toHaveLength(1);
    expect(manual.inbox.filter((message) => message.id.startsWith("world-arc-beat:")))
      .toHaveLength(3);
  });

  it("routes a selected arc strategy through canonical regional travel mechanics", () => {
    const signal = directDueBeats(stateAt());
    const decision = directDueBeats({ ...signal, currentWeek: 3 });
    const baseQuote = getRegionalTravelQuote(decision, "portugal");
    const selected = chooseIndependentCircuit(decision);
    const strategyQuote = getRegionalTravelQuote(selected, "portugal");
    const portugalModifiers = getWorldConditionModifiers(selected, "portugal");
    const englandModifiers = getWorldConditionModifiers(selected, "england");

    expect(portugalModifiers.travelCostMultiplier).toBeCloseTo(1.08, 6);
    expect(englandModifiers.travelCostMultiplier).toBe(1);
    expect(strategyQuote.cost).toBeGreaterThan(baseQuote.cost);
    expect(strategyQuote.cost).toBe(Math.round(baseQuote.cost * 1.08));
  });
});
