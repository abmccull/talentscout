import { describe, expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import {
  createConsequenceEngineState,
  processDueConsequences,
  projectConsequenceMetrics,
  selectDecisionOption,
  synchronizeConsequenceMetrics,
} from "@/engine/consequences";
import { buildScoutingCaseTimeline } from "@/engine/reports/scoutingCaseTimeline";
import { createRunManifest } from "@/engine/run";
import {
  YOUTH_EVERGREEN_CASE_DEFINITIONS,
  directWeeklyYouthProfessionalCase,
  getYouthProfessionalCaseTriggerChance,
  validateYouthEvergreenCaseDefinitions,
} from "@/engine/youth/evergreenCases";
import { emitProfessionalCaseCallbacks } from "@/stores/actions/weeklyProfessionalCaseCallbacks";

function prospect(): Player {
  return {
    id: "prospect-1",
    firstName: "Noah",
    lastName: "Mensah",
    age: 17,
    nationality: "ghana",
    secondaryPositions: ["RW"],
    injured: false,
    clubId: "",
  } as unknown as Player;
}

function state(seed = "evergreen-case"): GameState {
  const player = prospect();
  return {
    seed,
    runManifest: createRunManifest({
      rootSeed: seed,
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england", "ghana"],
      startingCountry: "england",
    }),
    currentWeek: 9,
    currentSeason: 1,
    fixtures: {},
    countries: ["england", "ghana"],
    scout: {
      id: "scout-1",
      firstName: "Alex",
      lastName: "Morgan",
      primarySpecialization: "youth",
      reputation: 35,
      fatigue: 20,
      clubTrust: 50,
      specializationReputation: 30,
    },
    players: {},
    clubs: {},
    unsignedYouth: {
      "unsigned-1": {
        id: "unsigned-1",
        player,
        visibility: 25,
        buzzLevel: 18,
        discoveredBy: ["scout-1"],
        regionId: "region-1",
        country: "ghana",
        venueAppearances: ["schoolMatch"],
        generatedSeason: 1,
        placed: false,
        retired: false,
      },
    },
    observations: {},
    reports: {},
    scoutingCases: {},
    reportDeliveries: {},
    clubDecisions: {},
    contacts: {
      agent: {
        id: "agent",
        name: "Maya Okoro",
        type: "agent",
        relationship: 65,
        trustLevel: 60,
        dormant: false,
      },
    },
    rivalScouts: {
      rival: {
        id: "rival",
        name: "Jordan Vale",
        aggressiveness: 0.6,
      },
    },
    watchlist: [],
    npcReports: {},
    youthTournaments: {},
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    reflectionJournal: {},
    discoveryRecords: [],
    alumniRecords: [],
    recommendationReviews: {},
    playerMovementHistory: [],
    retiredPlayers: {},
  } as unknown as GameState;
}

describe("evergreen Youth professional cases", () => {
  it("ships twelve non-equivalent, tradeoff-bearing case families", () => {
    expect(YOUTH_EVERGREEN_CASE_DEFINITIONS).toHaveLength(12);
    expect(validateYouthEvergreenCaseDefinitions()).toEqual([]);
  });

  it("escalates the first multi-stakeholder case to a season-one guarantee", () => {
    expect(getYouthProfessionalCaseTriggerChance({ ...state(), currentWeek: 4 })).toBe(0);
    expect(getYouthProfessionalCaseTriggerChance({ ...state(), currentWeek: 5 })).toBe(0.12);
    expect(getYouthProfessionalCaseTriggerChance({ ...state(), currentWeek: 9 })).toBe(0.24);
    const guaranteed = { ...state(), currentWeek: 13 };
    expect(getYouthProfessionalCaseTriggerChance(guaranteed)).toBe(1);
    expect(directWeeklyYouthProfessionalCase({ state: guaranteed }).offeredDecisionId).toBeTruthy();
  });

  it("opens one deterministic case on a real discovered prospect", () => {
    const first = directWeeklyYouthProfessionalCase({
      state: state(),
      forceTrigger: true,
    });
    const replay = directWeeklyYouthProfessionalCase({
      state: state(),
      forceTrigger: true,
    });

    expect(first.offeredDecisionId).toBe(replay.offeredDecisionId);
    expect(first.caseId).toBe("case_scout-1_prospect-1");
    const decision = first.state.consequenceState.decisions[first.offeredDecisionId!];
    expect(decision.source.kind).toBe("professionalCase");
    expect(decision.options).toHaveLength(3);
    for (const option of decision.options) {
      expect(option.scheduledConsequences).toHaveLength(2);
      expect(option.scheduledConsequences.reduce(
        (sum, consequence) => sum + (consequence.probability ?? 1),
        0,
      )).toBeCloseTo(1, 10);
      expect(option.scheduledConsequences.reduce(
        (sum, consequence) => sum + (consequence.outcomeRoll ?? 0),
        0,
      )).toBeCloseTo(1, 10);
    }
    expect(decision.metadata).toMatchObject({
      caseId: first.caseId,
      playerId: "prospect-1",
    });
    expect(first.state.scoutingCases[first.caseId!].professionalContext)
      .toMatchObject({ modeId: "youth-scout" });
    expect(first.state.inbox.at(-1)).toMatchObject({
      relatedId: first.offeredDecisionId,
      actionRequired: true,
    });
  });

  it("records the selected approach as state and case history", () => {
    const offered = directWeeklyYouthProfessionalCase({
      state: state("case-choice"),
      forceTrigger: true,
    });
    const decision = offered.state.consequenceState.decisions[offered.offeredDecisionId!];
    const option = decision.options[0];
    const now = { week: offered.state.currentWeek, season: offered.state.currentSeason };
    const synchronized = synchronizeConsequenceMetrics(
      offered.state,
      offered.state.consequenceState,
    );
    const selected = selectDecisionOption(
      synchronized,
      decision.id,
      option.id,
      now,
      "player",
    );
    expect(selected.error).toBeUndefined();
    const processed = processDueConsequences(selected.state, now);
    const projected = projectConsequenceMetrics(
      { ...offered.state, consequenceState: processed.state },
      processed.state,
    );

    expect(projected.consequenceState.facts[`fact:${offered.caseId}:approach`]?.value)
      .toBe(option.id);
    const timeline = buildScoutingCaseTimeline(projected, offered.caseId!);
    expect(timeline?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "judgment",
        decisionId: decision.id,
      }),
    ]));
  });

  it("respects the shared decision cap and does not create case spam", () => {
    const offered = directWeeklyYouthProfessionalCase({
      state: state("case-cap"),
      forceTrigger: true,
    });
    const repeated = directWeeklyYouthProfessionalCase({
      state: offered.state,
      forceTrigger: true,
    });

    expect(repeated.offeredDecisionId).toBeUndefined();
    expect(repeated.blockedReason).toBe("unresolved-case");
  });

  it("resolves every chosen approach into exactly one opening or setback", () => {
    const offered = directWeeklyYouthProfessionalCase({
      state: state("case-complementary-outcome"),
      forceTrigger: true,
    });
    const decision = offered.state.consequenceState.decisions[offered.offeredDecisionId!];
    const option = decision.options[0];
    const selected = selectDecisionOption(
      synchronizeConsequenceMetrics(
        offered.state,
        offered.state.consequenceState,
      ),
      decision.id,
      option.id,
      { week: offered.state.currentWeek, season: offered.state.currentSeason },
      "player",
    );
    const dueAt = option.scheduledConsequences[0].dueAt;
    const processed = processDueConsequences(selected.state, dueAt);
    const delayedRecords = Object.values(processed.state.consequences)
      .filter((consequence) => consequence.tags.includes("professional-case"));
    const callbackFacts = Object.values(processed.state.facts)
      .filter((fact) => fact.kind === "professionalCaseCallback");

    expect(delayedRecords.filter((consequence) => consequence.status === "applied"))
      .toHaveLength(1);
    expect(delayedRecords.filter((consequence) => consequence.status === "skipped"))
      .toHaveLength(1);
    expect(callbackFacts).toHaveLength(1);
    expect(callbackFacts[0].metadata?.outcome).toMatch(/^(opening|setback)$/);

    const callbackState = {
      ...offered.state,
      currentWeek: dueAt.week,
      currentSeason: dueAt.season,
      consequenceState: processed.state,
    };
    const emitted = emitProfessionalCaseCallbacks(callbackState);
    expect(emitted.inbox.at(-1)?.body).toContain(
      String(callbackFacts[0].metadata?.detail),
    );
  });

  it("emits a delayed callback exactly once from an applied case fact", () => {
    const offered = directWeeklyYouthProfessionalCase({
      state: state("case-callback"),
      forceTrigger: true,
    });
    const callbackFact = {
      id: "callback-fact",
      kind: "professionalCaseCallback",
      subject: { kind: "player", id: "prospect-1" },
      value: "approach-created-an-opening",
      observedAt: { week: offered.state.currentWeek, season: offered.state.currentSeason },
      visibility: "stakeholders" as const,
      sourceDecisionId: offered.offeredDecisionId,
      metadata: {
        caseId: offered.caseId!,
        outcome: "opening",
        detail: "The chosen pathway produced access",
      },
    };
    const withFact: GameState = {
      ...offered.state,
      consequenceState: {
        ...offered.state.consequenceState,
        facts: {
          ...offered.state.consequenceState.facts,
          [callbackFact.id]: callbackFact,
        },
      },
    };

    const emitted = emitProfessionalCaseCallbacks(withFact);
    const replayed = emitProfessionalCaseCallbacks(emitted);
    expect(emitted.inbox.filter((message) =>
      message.id === "professional-case-callback:callback-fact",
    )).toHaveLength(1);
    expect(replayed.inbox).toEqual(emitted.inbox);
  });
});
