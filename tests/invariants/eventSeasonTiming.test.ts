import { describe, expect, it } from "vitest";
import type {
  EventChain,
  Fixture,
  GameState,
  StorylineState,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import {
  advanceChain,
  checkPendingChains,
  resolveChainChoice,
  startChain,
} from "@/engine/events/eventChains";
import {
  processActiveStorylines,
  resolveStorylineChoice,
  type SimpleRNG,
} from "@/engine/events/storylines";

const SEASON_LENGTH = 50;

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "fixture-final",
    homeClubId: "club-1",
    awayClubId: "club-2",
    leagueId: "league-1",
    season: 1,
    week: SEASON_LENGTH,
    played: false,
    ...overrides,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentWeek: 49,
    currentSeason: 1,
    fixtures: {
      "fixture-final": fixture(),
      "fixture-next-final": fixture({ id: "fixture-next-final", season: 2 }),
    },
    eventChains: [],
    activeStorylines: [],
    players: {
      "player-1": {
        id: "player-1",
        firstName: "Ari",
        lastName: "Prospect",
        age: 18,
      },
    },
    clubs: {
      "club-1": { id: "club-1", name: "Academy FC" },
      "club-2": { id: "club-2", name: "Town FC" },
    },
    scout: {
      id: "scout-1",
      reputation: 50,
      careerTier: 3,
      careerPath: "club",
      primarySpecialization: "youth",
    },
    contacts: {},
    reports: {},
    countries: ["england"],
    ...overrides,
  } as unknown as GameState;
}

function wonderkidStoryline(
  overrides: Partial<StorylineState> = {},
): StorylineState {
  return {
    id: "storyline-1",
    templateId: "wonderkidChase",
    name: "The Wonderkid Chase",
    stages: [],
    currentStage: 0,
    nextStageWeek: 49,
    nextStageSeason: 1,
    startedWeek: 49,
    startedSeason: 1,
    resolved: false,
    context: {
      contactName: "Coach Morgan",
      contactId: "contact-1",
      wonderkidId: "player-1",
      wonderkidName: "Ari Prospect",
      playerChoice: null,
    },
    ...overrides,
  };
}

describe("authoritative narrative season timing", () => {
  it("keeps event-chain delays aligned across a non-38-week season", () => {
    const initial = gameState();
    const started = startChain(
      new RNG("event-chain-season-length"),
      initial,
      "youthBreakthrough",
    );

    expect(started).not.toBeNull();
    const chain = started!.chain;
    expect(chain.nextStepWeek).toBe(52);

    const seasonTwoWeekOne = gameState({
      currentSeason: 2,
      currentWeek: 1,
      eventChains: [chain],
    });
    expect(checkPendingChains(seasonTwoWeekOne)).toEqual([]);

    const seasonTwoWeekTwo = gameState({
      currentSeason: 2,
      currentWeek: 2,
      eventChains: [chain],
    });
    expect(checkPendingChains(seasonTwoWeekTwo).map((item) => item.id)).toEqual([
      chain.id,
    ]);

    const advanced = advanceChain(
      new RNG("event-chain-season-length-advance"),
      seasonTwoWeekTwo,
      chain,
    );
    expect(advanced.event).toMatchObject({ season: 2, week: 2 });
    expect(advanced.chain.nextStepWeek).toBe(56);
    expect(advanced.chain.awaitingChoice).toMatchObject({
      eventId: advanced.event!.id,
      stepIndex: 1,
      terminal: false,
    });

    const beforeNextBeat = gameState({
      currentSeason: 2,
      currentWeek: 5,
      eventChains: [advanced.chain],
    });
    expect(checkPendingChains(beforeNextBeat)).toEqual([]);

    const nextBeat = gameState({
      currentSeason: 2,
      currentWeek: 6,
      eventChains: [advanced.chain],
    });
    expect(checkPendingChains(nextBeat)).toEqual([]);

    const choiceResolved = resolveChainChoice(
      advanced.chain,
      advanced.event!.id,
      1,
    );
    const releasedNextBeat = gameState({
      currentSeason: 2,
      currentWeek: 6,
      eventChains: [choiceResolved],
    });
    expect(choiceResolved.choiceHistory[1]).toBe(1);
    expect(choiceResolved.awaitingChoice).toBeUndefined();
    expect(checkPendingChains(releasedNextBeat).map((item) => item.id)).toEqual([
      chain.id,
    ]);

    const outcome = advanceChain(
      new RNG("event-chain-after-choice"),
      releasedNextBeat,
      choiceResolved,
    );
    expect(outcome.event?.title).toBeTruthy();
    expect(outcome.chain.resolved).toBe(true);
  });

  it("applies a terminal event-chain choice before resolving the chain", () => {
    const chain: EventChain = {
      id: "chain-terminal-choice",
      templateKey: "youthBreakthrough",
      startWeek: 1,
      currentStep: 3,
      maxSteps: 3,
      resolved: false,
      choiceHistory: [],
      context: {},
      nextStepWeek: 8,
      eventIds: ["event-terminal-choice"],
      awaitingChoice: {
        eventId: "event-terminal-choice",
        stepIndex: 2,
        terminal: true,
      },
    };

    const resolved = resolveChainChoice(
      chain,
      "event-terminal-choice",
      1,
    );
    expect(resolved.choiceHistory[2]).toBe(1);
    expect(resolved.awaitingChoice).toBeUndefined();
    expect(resolved.resolved).toBe(true);
  });

  it("schedules storyline stages against the fixture-derived season boundary", () => {
    const storyline = wonderkidStoryline();
    const firstTick = processActiveStorylines(
      gameState({ activeStorylines: [storyline] }),
      new RNG("storyline-season-length"),
    );

    expect(firstTick.events).toHaveLength(1);
    expect(firstTick.events[0]).toMatchObject({
      storylineId: storyline.id,
      storylineStage: 0,
    });
    expect(firstTick.updatedStorylines[0]).toMatchObject({
      currentStage: 1,
      nextStageSeason: 2,
      nextStageWeek: 2,
    });

    const beforeDue = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 1,
        activeStorylines: firstTick.updatedStorylines,
      }),
      new RNG("storyline-before-due"),
    );
    expect(beforeDue.events).toEqual([]);

    const whenDue = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 2,
        activeStorylines: firstTick.updatedStorylines,
      }),
      new RNG("storyline-when-due"),
    );
    expect(whenDue.events[0]).toMatchObject({
      storylineId: storyline.id,
      storylineStage: 1,
      season: 2,
      week: 2,
    });
  });
});

describe("storyline choice causality", () => {
  it("persists the selected branch and changes the later storyline outcome", () => {
    const pendingChoice = wonderkidStoryline({
      currentStage: 2,
      nextStageSeason: 2,
      nextStageWeek: 2,
    });
    const stableRoll: SimpleRNG = { next: () => 0.5 };

    const rushed = resolveStorylineChoice(pendingChoice, 1, 0, stableRoll);
    const waited = resolveStorylineChoice(pendingChoice, 1, 1, stableRoll);

    expect(rushed.storyline.context.playerChoice).toBe("wonderkidRush");
    expect(waited.storyline.context.playerChoice).toBe("wonderkidWait");
    expect(rushed.fatigueChange).toBe(5);
    expect(waited.fatigueChange).toBe(0);

    const rushedOutcome = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 2,
        activeStorylines: [rushed.storyline],
      }),
      { next: () => 0.5 },
    );
    const waitedOutcome = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 2,
        activeStorylines: [waited.storyline],
      }),
      { next: () => 0.5 },
    );

    expect(rushedOutcome.events[0].title).toContain("+8 Reputation");
    expect(waitedOutcome.events[0].title).toContain("-5 Reputation");
    expect(rushedOutcome.events[0].description).not.toBe(
      waitedOutcome.events[0].description,
    );
  });

  it("does not advance a storyline past an unresolved choice beat", () => {
    const choiceBeat = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 2,
        activeStorylines: [wonderkidStoryline({
          currentStage: 1,
          nextStageSeason: 2,
          nextStageWeek: 2,
        })],
      }),
      new RNG("storyline-choice-gate"),
    );

    const event = choiceBeat.events[0];
    const waiting = choiceBeat.updatedStorylines[0];
    expect(event.choices).toHaveLength(2);
    expect(waiting).toMatchObject({
      currentStage: 1,
      resolved: false,
      awaitingChoice: {
        eventId: event.id,
        stageIndex: 1,
        nextStageIndex: 2,
        nextStageSeason: 2,
        nextStageWeek: 5,
        terminal: false,
      },
    });

    const overdue = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 6,
        activeStorylines: [waiting],
      }),
      new RNG("storyline-choice-still-waiting"),
    );
    expect(overdue.events).toEqual([]);
    expect(overdue.updatedStorylines[0]).toEqual(waiting);

    const resolved = resolveStorylineChoice(
      waiting,
      1,
      1,
      { next: () => 0.5 },
      event.id,
    );
    expect(resolved.storyline).toMatchObject({
      currentStage: 2,
      nextStageSeason: 2,
      nextStageWeek: 5,
      resolved: false,
      context: { playerChoice: "wonderkidWait" },
    });
    expect(resolved.storyline.awaitingChoice).toBeUndefined();

    const continued = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 6,
        activeStorylines: [resolved.storyline],
      }),
      { next: () => 0.5 },
    );
    expect(continued.events[0].title).toContain("-5 Reputation");
  });

  it("applies a final-stage choice before terminalizing the storyline", () => {
    const finalChoice: StorylineState = {
      id: "storyline-final-choice",
      templateId: "prodigalReturn",
      name: "The Prodigal Return",
      stages: [],
      currentStage: 1,
      nextStageWeek: 4,
      nextStageSeason: 2,
      startedWeek: 50,
      startedSeason: 1,
      resolved: false,
      context: {
        playerId: "player-1",
        playerName: "Ari Prospect",
        playerChoice: null,
      },
    };
    const generated = processActiveStorylines(
      gameState({
        currentSeason: 2,
        currentWeek: 4,
        activeStorylines: [finalChoice],
      }),
      new RNG("storyline-final-choice"),
    );
    const event = generated.events[0];
    const waiting = generated.updatedStorylines[0];

    expect(event.choices).toHaveLength(2);
    expect(waiting).toMatchObject({
      currentStage: 1,
      resolved: false,
      awaitingChoice: {
        eventId: event.id,
        stageIndex: 1,
        nextStageIndex: 2,
        terminal: true,
      },
    });

    const resolved = resolveStorylineChoice(
      waiting,
      1,
      0,
      { next: () => 0.25 },
      event.id,
    );
    expect(resolved.reputationChange).toBe(6);
    expect(resolved.storyline).toMatchObject({
      currentStage: 2,
      resolved: true,
      context: { playerChoice: "prodigalRecommend" },
    });
    expect(resolved.storyline.awaitingChoice).toBeUndefined();
  });
});
