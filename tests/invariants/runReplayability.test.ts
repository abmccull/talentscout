import { describe, expect, it } from "vitest";
import type { GameState, NarrativeEvent } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import {
  createConsequenceEngineState,
  ensureNarrativeDecision,
  expireDueDecisions,
  narrativeDecisionId,
} from "@/engine/consequences";
import {
  createEventDirectorState,
  directWeeklyNarrativeEvent,
} from "@/engine/events";
import {
  createRunManifest,
  deriveWorldTraitIds,
  getRunSimulationModifiers,
  getWorldTraitDefinitions,
} from "@/engine/run";

function replayState(overrides: Partial<GameState> = {}): GameState {
  const worldTraitIds = [
    "golden-generation",
    "scout-wars",
    "boom-bust-market",
  ];
  return {
    seed: "replayability-seed",
    runManifest: createRunManifest({
      rootSeed: "replayability-seed",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      worldTraitIds,
    }),
    currentWeek: 12,
    currentSeason: 1,
    scout: {
      id: "scout-1",
      primarySpecialization: "youth",
      reputation: 45,
      fatigue: 10,
    },
    fixtures: {},
    reports: {},
    watchlist: [],
    players: {},
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {},
    clubs: {},
    rivalScouts: {},
    narrativeEvents: [],
    activeStorylines: [],
    eventChains: [],
    consequenceState: createConsequenceEngineState(),
    eventDirector: createEventDirectorState({
      tension: 90,
      quietWeeks: 7,
    }),
    ...overrides,
  } as unknown as GameState;
}

describe("run-defining world traits", () => {
  it("derives one deterministic condition from every world dimension", () => {
    const first = deriveWorldTraitIds("distinct-run", "youth");
    const replay = deriveWorldTraitIds("distinct-run", "youth");
    const definitions = getWorldTraitDefinitions(first);

    expect(replay).toEqual(first);
    expect(definitions).toHaveLength(3);
    expect(new Set(definitions.map((trait) => trait.dimension))).toEqual(
      new Set(["talent", "competition", "economy"]),
    );
  });

  it("combines traits into material cross-system simulation modifiers", () => {
    const volatile = getRunSimulationModifiers([
      "golden-generation",
      "scout-wars",
      "boom-bust-market",
    ]);
    const cautious = getRunSimulationModifiers([
      "thin-crop",
      "trusted-circuit",
      "cautious-market",
    ]);

    expect(volatile.youthTalentMultiplier).toBeGreaterThan(
      cautious.youthTalentMultiplier,
    );
    expect(volatile.rivalPoachChanceMultiplier).toBeGreaterThan(
      cautious.rivalPoachChanceMultiplier,
    );
    expect(volatile.economicEventChanceMultiplier).toBeGreaterThan(
      cautious.economicEventChanceMultiplier,
    );
  });
});

describe("event director", () => {
  it("creates a turning point after sustained quiet pressure", () => {
    const chanceResults = [false, true];
    const rng = {
      chance: () => chanceResults.shift() ?? false,
      next: () => 0,
      nextInt: () => 4321,
    } as unknown as RNG;
    const result = directWeeklyNarrativeEvent(rng, replayState());

    expect(result.generatedSpecialEvent).toBe(true);
    expect(result.event).toMatchObject({
      type: "careerCrossroads",
      specialEventId: "career-board-vote",
      defaultChoiceIndex: 2,
      decisionDeadlineWeeks: 2,
    });
    expect(result.director.lastSpecialSeason).toBe(1);
    expect(result.director.recentSpecialEventIds).toEqual(["career-board-vote"]);
    expect(result.director.tension).toBeLessThan(90);
  });

  it("allows two spaced turning points but caps seasonal overload", () => {
    const priorSpecial = {
      id: "special-week-1",
      type: "careerCrossroads",
      specialEventId: "career-board-vote",
      week: 1,
      season: 1,
      title: "Earlier turning point",
      description: "Already resolved.",
      relatedIds: [],
      acknowledged: true,
      selectedChoice: 2,
    } as NarrativeEvent;
    const rng = {
      chance: (() => {
        const outcomes = [false, true];
        return () => outcomes.shift() ?? false;
      })(),
      next: () => 0,
      nextInt: () => 1234,
    } as unknown as RNG;
    const second = directWeeklyNarrativeEvent(rng, replayState({
      currentWeek: 12,
      narrativeEvents: [priorSpecial],
    }));

    expect(second.generatedSpecialEvent).toBe(true);
    expect(second.event?.specialEventId).not.toBe("career-board-vote");

    const capped = directWeeklyNarrativeEvent({
      chance: () => false,
      next: () => 0,
      nextInt: () => 5678,
    } as unknown as RNG, replayState({
      currentWeek: 30,
      narrativeEvents: [
        priorSpecial,
        { ...priorSpecial, id: "special-week-12", week: 12, specialEventId: "discovery-last-empty-seat" },
      ],
    }));
    expect(capped.generatedSpecialEvent).toBe(false);
    expect(capped.event).toBeNull();
  });

  it("forces a turning point after eight quiet weeks at maximum tension", () => {
    const result = directWeeklyNarrativeEvent({
      chance: () => false,
      next: () => 0,
      nextInt: () => 9999,
    } as unknown as RNG, replayState({
      eventDirector: createEventDirectorState({ tension: 100, quietWeeks: 8 }),
    }));

    expect(result.generatedSpecialEvent).toBe(true);
    expect(result.event?.specialEventId).toBeTruthy();
    expect(result.director.tension).toBeLessThan(100);
  });

  it("surfaces an aging confidentiality promise before it can silently expire", () => {
    const obligationId = "obligation:source-promise";
    const result = directWeeklyNarrativeEvent({
      chance: () => false,
      next: () => 0,
      nextInt: () => 2468,
    } as unknown as RNG, replayState({
      currentWeek: 12,
      consequenceState: createConsequenceEngineState({
        obligations: {
          [obligationId]: {
            id: obligationId,
            debtor: { kind: "scout", id: "scout-1" },
            creditor: { kind: "contact", id: "contact-1" },
            kind: "confidentiality",
            terms: "Keep the source private.",
            status: "active",
            createdAt: { week: 2, season: 1 },
            dueAt: { week: 16, season: 1 },
            sourceDecisionId: "decision:access",
          },
        },
      }),
    }));

    expect(result.event).toMatchObject({
      type: "confidentialityDilemma",
      relatedIds: ["contact-1"],
    });
    expect(result.event?.choices?.every(
      (choice) => (choice.knownTradeoffs?.length ?? 0) >= 2,
    )).toBe(true);
  });

  it("precommits the hidden football outcome and survives save/reload", () => {
    const event: NarrativeEvent = {
      id: "director-crossroads-test",
      type: "careerCrossroads",
      week: 12,
      season: 1,
      title: "Put Your Name On It",
      description: "A career-defining recommendation.",
      relatedIds: [],
      acknowledged: false,
      choices: [
        { label: "Stake your reputation", effect: "crossroadsAllIn" },
        { label: "Build a coalition", effect: "crossroadsCoalition" },
        { label: "Walk away", effect: "crossroadsWalkAway" },
      ],
      decisionDeadlineWeeks: 2,
      defaultChoiceIndex: 2,
    };
    const registered = ensureNarrativeDecision(replayState(), event);
    const reloaded = ensureNarrativeDecision(structuredClone(registered), event);
    const decision = registered.consequenceState.decisions[
      narrativeDecisionId(event.id)
    ];
    const allInOutcome = decision.options[0].scheduledConsequences[0];

    expect(allInOutcome.tags).toContain("turning-point");
    expect(allInOutcome.dueAt).toEqual({ season: 1, week: 18 });
    expect(reloaded.consequenceState).toEqual(registered.consequenceState);
  });

  it("never auto-defaults a final-week event before the player can see it", () => {
    const state = replayState({ currentWeek: 38 });
    const event: NarrativeEvent = {
      id: "final-week-choice",
      type: "exclusiveAccess",
      week: 38,
      season: 1,
      title: "Late Access",
      description: "An offer arrives at the season boundary.",
      relatedIds: [],
      acknowledged: false,
      choices: [
        { label: "Attend", effect: "accessAttend" },
        { label: "Pass", effect: "accessPass" },
      ],
      decisionDeadlineWeeks: 2,
      defaultChoiceIndex: 1,
    };
    const registered = ensureNarrativeDecision(state, event);
    const decisionId = narrativeDecisionId(event.id);

    expect(registered.consequenceState.decisions[decisionId]?.deadlineAt).toEqual({
      season: 2,
      week: 2,
    });
    const afterRollover = expireDueDecisions(
      registered.consequenceState,
      { season: 2, week: 1 },
      38,
    );
    expect(afterRollover.expiredDecisionIds).toEqual([]);
    expect(afterRollover.state.decisions[decisionId]?.status).toBe("offered");
  });
});
