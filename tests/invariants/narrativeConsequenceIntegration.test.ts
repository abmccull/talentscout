import { describe, expect, it } from "vitest";
import type {
  GameState,
  NarrativeEvent,
  StorylineState,
} from "@/engine/core/types";
import {
  createConsequenceEngineState,
  ensureNarrativeDecision,
  expireDueDecisions,
  narrativeDecisionId,
  processDueConsequences,
  selectNarrativeDecision,
} from "@/engine/consequences";
import { createRunManifest } from "@/engine/run";
import { RNG } from "@/engine/rng";
import { generateNarrativeEventOfType } from "@/engine/events";
import { createProgressionActions } from "@/stores/actions/progressionActions";
import { projectExpiredNarrativeDefaults } from "@/stores/actions/weeklyActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const CONTACT_ID = "contact-insider";

function narrativeEvent(
  overrides: Partial<NarrativeEvent> = {},
): NarrativeEvent {
  return {
    id: "event-exclusive-access",
    type: "exclusiveAccess",
    week: 6,
    season: 1,
    title: "A Closed Training Session",
    description: "A trusted contact offers access that no rival scout has.",
    relatedIds: [CONTACT_ID],
    acknowledged: false,
    choices: [
      { label: "Attend the session", effect: "accessAttend" },
      { label: "Pass this time", effect: "accessPass" },
    ],
    ...overrides,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: "narrative-consequence-integration",
    runManifest: createRunManifest({
      rootSeed: "narrative-consequence-integration",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    }),
    currentWeek: 6,
    currentSeason: 1,
    fixtures: {},
    scout: {
      id: "scout-1",
      reputation: 40,
      fatigue: 10,
      careerTier: 2,
      primarySpecialization: "youth",
    },
    narrativeEvents: [],
    activeStorylines: [],
    eventChains: [],
    inbox: [],
    consequenceState: createConsequenceEngineState(),
    contacts: {
      [CONTACT_ID]: {
        id: CONTACT_ID,
        name: "Morgan Price",
        type: "academyCoach",
        organization: "Northside Academy",
        relationship: 80,
        reliability: 75,
        trustLevel: 70,
        loyalty: 60,
        knownPlayerIds: [],
      },
    },
    clubs: {},
    players: {},
    retiredPlayers: {},
    unsignedYouth: {},
    rivalScouts: {},
    ...overrides,
  } as unknown as GameState;
}

function progressionHarness(initialState: GameState): {
  actions: ReturnType<typeof createProgressionActions>;
  state: () => GameState;
} {
  let store = { gameState: initialState } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };
  return {
    actions: createProgressionActions(get, set),
    state: () => store.gameState as GameState,
  };
}

describe("narrative decision integration", () => {
  it("registers one deterministic decision with a persisted roll", () => {
    const initial = gameState();
    const event = narrativeEvent();
    const decisionId = narrativeDecisionId(event.id);

    const registered = ensureNarrativeDecision(initial, event);
    const replayedRegistration = ensureNarrativeDecision(registered, event);
    const independentlyRegistered = ensureNarrativeDecision(
      structuredClone(initial),
      structuredClone(event),
    );

    expect(registered.consequenceState.decisions[decisionId]).toMatchObject({
      id: decisionId,
      status: "offered",
      defaultOptionId: "accesspass-2",
      opportunitySetId: `narrative:${event.id}`,
    });
    expect(registered.consequenceState.decisions[decisionId]?.outcomeRoll).toBeGreaterThanOrEqual(0);
    expect(registered.consequenceState.decisions[decisionId]?.outcomeRoll).toBeLessThan(1);
    expect(replayedRegistration).toBe(registered);
    expect(Object.keys(replayedRegistration.consequenceState.decisions)).toEqual([decisionId]);
    expect(independentlyRegistered.consequenceState).toEqual(registered.consequenceState);
  });

  it("selects exactly once and closes every mutually exclusive alternative", () => {
    const event = narrativeEvent();
    const decisionId = narrativeDecisionId(event.id);
    const selected = selectNarrativeDecision(gameState(), event, 0);

    expect(selected.error).toBeUndefined();
    expect(selected.optionId).toBe("accessattend-1");
    expect(selected.state.consequenceState.decisions[decisionId]).toMatchObject({
      status: "resolved",
      selectedOptionId: "accessattend-1",
      selectionKind: "player",
    });

    const locks = Object.values(selected.state.consequenceState.opportunityLocks);
    expect(locks).toHaveLength(2);
    expect(locks.find((lock) => lock.opportunityId === "accessattend-1")?.status)
      .toBe("consumed");
    expect(locks.find((lock) => lock.opportunityId === "accesspass-2")?.status)
      .toBe("closed");
    expect(selected.state.consequenceState.facts[`fact:${decisionId}:selected`]?.value)
      .toEqual({
        choiceIndex: 0,
        optionId: "accessattend-1",
        narrativeType: "exclusiveAccess",
      });

    const conflictingChoice = selectNarrativeDecision(selected.state, event, 1);
    expect(conflictingChoice.error).toContain("already resolved");
    expect(conflictingChoice.state.consequenceState.decisions[decisionId]?.selectedOptionId)
      .toBe("accessattend-1");
    expect(Object.values(conflictingChoice.state.consequenceState.opportunityLocks)
      .filter((lock) => lock.status === "consumed")).toHaveLength(1);
  });

  it("does not reroll or duplicate a selected decision after save and reload", () => {
    const event = narrativeEvent();
    const decisionId = narrativeDecisionId(event.id);
    const registered = ensureNarrativeDecision(gameState(), event);
    const reloadedBeforeChoice = structuredClone(registered);

    const beforeReloadSelection = selectNarrativeDecision(registered, event, 0);
    const afterReloadSelection = selectNarrativeDecision(reloadedBeforeChoice, event, 0);
    expect(afterReloadSelection.error).toBeUndefined();
    expect(afterReloadSelection.state.consequenceState).toEqual(
      beforeReloadSelection.state.consequenceState,
    );

    const reloadedAfterChoice = structuredClone(afterReloadSelection.state);
    const retry = selectNarrativeDecision(reloadedAfterChoice, event, 0);
    expect(retry.error).toBeUndefined();
    expect(retry.state.consequenceState.decisions[decisionId]?.outcomeRoll).toBe(
      beforeReloadSelection.state.consequenceState.decisions[decisionId]?.outcomeRoll,
    );
    expect(Object.keys(retry.state.consequenceState.decisions)).toHaveLength(1);
    expect(Object.keys(retry.state.consequenceState.consequences)).toHaveLength(1);
    expect(Object.keys(retry.state.consequenceState.callbacks)).toHaveLength(1);
    expect(Object.keys(retry.state.consequenceState.facts)).toHaveLength(1);
    expect(Object.values(retry.state.consequenceState.opportunityLocks)
      .filter((lock) => lock.status === "consumed")).toHaveLength(1);
  });

  it("projects an exclusive-access choice into the contact, memory, and obligation state", () => {
    const event = narrativeEvent();
    const harness = progressionHarness(gameState({ narrativeEvents: [event] }));

    harness.actions.resolveNarrativeEventChoice(event.id, 0);
    const resolved = harness.state();
    const decisionId = narrativeDecisionId(event.id);

    expect(resolved.narrativeEvents[0]?.selectedChoice).toBe(0);
    expect(resolved.scout.reputation).toBe(41);
    expect(resolved.contacts[CONTACT_ID]).toMatchObject({
      relationship: 85,
      trustLevel: 78,
      loyalty: 60,
      dormant: false,
    });
    expect(resolved.consequenceState.memories[`memory:${decisionId}:${CONTACT_ID}`])
      .toMatchObject({
        stakeholder: { kind: "contact", id: CONTACT_ID },
        tags: ["exclusiveAccess", "reciprocity", "confidentiality"],
        valence: 35,
        halfLifeWeeks: 76,
      });
    expect(resolved.consequenceState.obligations[
      `obligation:${decisionId}:confidentiality`
    ]).toMatchObject({
      status: "active",
      debtor: { kind: "scout", id: "scout-1" },
      creditor: { kind: "contact", id: CONTACT_ID },
    });

    harness.actions.resolveNarrativeEventChoice(event.id, 0);
    expect(harness.state()).toBe(resolved);
  });

  it("does not duplicate the canonical promise for a deck-backed access event", () => {
    const event = narrativeEvent({
      id: "event-special-access",
      specialEventId: "access-closed-training",
      decisionDeadlineWeeks: 1,
      defaultChoiceIndex: 1,
    });
    const harness = progressionHarness(gameState({ narrativeEvents: [event] }));

    harness.actions.resolveNarrativeEventChoice(event.id, 0);
    const resolved = harness.state();
    const obligations = Object.values(resolved.consequenceState.obligations);

    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({
      kind: "confidentiality",
      status: "active",
      creditor: { kind: "contact", id: CONTACT_ID },
      dueAt: { week: 26, season: 1 },
    });
  });

  it("forces a later trust tradeoff that fulfills or breaches confidentiality", () => {
    const accessEvent = narrativeEvent();
    const harness = progressionHarness(gameState({ narrativeEvents: [accessEvent] }));
    harness.actions.resolveNarrativeEventChoice(accessEvent.id, 0);
    const afterAccess = harness.state();
    const obligationId = `obligation:${narrativeDecisionId(accessEvent.id)}:confidentiality`;
    const dilemma = narrativeEvent({
      id: "event-confidentiality-test",
      type: "confidentialityDilemma",
      title: "Trust Test",
      relatedIds: [CONTACT_ID, obligationId],
      choices: [
        { label: "Keep your word", effect: "confidentialityKeep" },
        { label: "Share the information", effect: "confidentialityLeak" },
      ],
      defaultChoiceIndex: 0,
    });
    const dilemmaHarness = progressionHarness({
      ...afterAccess,
      narrativeEvents: [...afterAccess.narrativeEvents, dilemma],
    });

    dilemmaHarness.actions.resolveNarrativeEventChoice(dilemma.id, 1);
    const breached = dilemmaHarness.state();

    expect(breached.consequenceState.obligations[obligationId]).toMatchObject({
      status: "breached",
      resolutionNote: "The scout disclosed information obtained under confidence.",
    });
    expect(breached.contacts[CONTACT_ID]).toMatchObject({
      relationship: 55,
      trustLevel: 38,
      loyalty: 35,
    });
    expect(breached.scout.reputation).toBe(45);
    expect(Object.values(breached.consequenceState.memories).some((memory) =>
      memory.tags.includes("promiseBroken"),
    )).toBe(true);
  });

  it("binds a confidentiality dilemma to the nearest active promise deadline", () => {
    const state = gameState({
      reports: {},
      contacts: {
        [CONTACT_ID]: gameState().contacts[CONTACT_ID],
        "contact-urgent": {
          ...gameState().contacts[CONTACT_ID],
          id: "contact-urgent",
          name: "Urgent Source",
        },
      },
      consequenceState: createConsequenceEngineState({
        obligations: {
          "obligation-later": {
            id: "obligation-later",
            debtor: { kind: "scout", id: "scout-1" },
            creditor: { kind: "contact", id: CONTACT_ID },
            kind: "confidentiality",
            terms: "Later promise",
            status: "active",
            createdAt: { week: 1, season: 1 },
            dueAt: { week: 30, season: 1 },
            sourceDecisionId: "decision-later",
          },
          "obligation-urgent": {
            id: "obligation-urgent",
            debtor: { kind: "scout", id: "scout-1" },
            creditor: { kind: "contact", id: "contact-urgent" },
            kind: "confidentiality",
            terms: "Urgent promise",
            status: "active",
            createdAt: { week: 2, season: 1 },
            dueAt: { week: 12, season: 1 },
            sourceDecisionId: "decision-urgent",
          },
        },
      }),
    });

    const event = generateNarrativeEventOfType(
      new RNG("confidentiality-priority"),
      state,
      "confidentialityDilemma",
    );
    expect(event?.relatedIds).toEqual(["contact-urgent"]);
    expect(event?.description).toContain("Urgent Source");
  });

  it("projects a timed-out narrative default through the same promise and relationship effects", () => {
    const accessEvent = narrativeEvent();
    const accessHarness = progressionHarness(gameState({ narrativeEvents: [accessEvent] }));
    accessHarness.actions.resolveNarrativeEventChoice(accessEvent.id, 0);
    const afterAccess = accessHarness.state();
    const obligationId = `obligation:${narrativeDecisionId(accessEvent.id)}:confidentiality`;
    const dilemma = narrativeEvent({
      id: "event-confidentiality-timeout",
      type: "confidentialityDilemma",
      week: 6,
      title: "Trust Test Deadline",
      relatedIds: [CONTACT_ID, obligationId],
      choices: [
        { label: "Keep your word", effect: "confidentialityKeep" },
        { label: "Share the information", effect: "confidentialityLeak" },
      ],
    });
    const registered = ensureNarrativeDecision({
      ...afterAccess,
      narrativeEvents: [...afterAccess.narrativeEvents, dilemma],
    }, dilemma);
    const expired = expireDueDecisions(
      registered.consequenceState,
      { week: 10, season: 1 },
      38,
    );
    const projected = projectExpiredNarrativeDefaults({
      ...registered,
      currentWeek: 10,
      consequenceState: expired.state,
    }, expired.expiredDecisionIds);

    expect(expired.expiredDecisionIds).toEqual([narrativeDecisionId(dilemma.id)]);
    expect(projected.narrativeEvents.find((event) => event.id === dilemma.id)?.selectedChoice)
      .toBe(0);
    expect(projected.consequenceState.obligations[obligationId]).toMatchObject({
      status: "fulfilled",
      resolutionNote: "The scout refused to disclose the confidential access.",
    });
    expect(projected.contacts[CONTACT_ID]).toMatchObject({
      relationship: 89,
      trustLevel: 88,
      loyalty: 65,
    });
    expect(projected.scout.reputation).toBe(43);
    expect(projectExpiredNarrativeDefaults(projected, expired.expiredDecisionIds)).toBe(projected);

    // Compatibility path: older saves can contain the generic default
    // selection (and its processed immediate effects) without the narrative
    // event, relationship, and obligation projection introduced later.
    const legacyProcessed = processDueConsequences(
      expired.state,
      { week: 10, season: 1 },
      38,
    );
    const recovered = projectExpiredNarrativeDefaults({
      ...registered,
      currentWeek: 10,
      consequenceState: legacyProcessed.state,
    }, []);
    expect(recovered.narrativeEvents.find((event) => event.id === dilemma.id)?.selectedChoice)
      .toBe(0);
    expect(recovered.consequenceState.obligations[obligationId]?.status).toBe("fulfilled");
    expect(recovered.contacts[CONTACT_ID]).toMatchObject({
      relationship: 89,
      trustLevel: 88,
      loyalty: 65,
    });
  });

  it("records a timed-out rival-poach concession exactly like the manual choice", () => {
    const event = narrativeEvent({
      id: "event-rival-poach-timeout",
      type: "rivalPoachBid",
      relatedIds: ["player-1", "rival-1"],
      choices: [
        { label: "Counter-Bid", effect: "counterBid" },
        { label: "Concede", effect: "concede" },
      ],
    });
    const offered = ensureNarrativeDecision(gameState({
      narrativeEvents: [event],
      players: {
        "player-1": { id: "player-1", firstName: "Ari", lastName: "Prospect" },
      } as unknown as GameState["players"],
      rivalScouts: {
        "rival-1": {
          id: "rival-1",
          name: "Alex Vale",
          winsAgainstPlayer: 2,
          lossesToPlayer: 0,
        },
      } as unknown as GameState["rivalScouts"],
    }), event);
    const expired = expireDueDecisions(
      offered.consequenceState,
      { week: 10, season: 1 },
      38,
    );
    const projected = projectExpiredNarrativeDefaults({
      ...offered,
      currentWeek: 10,
      consequenceState: expired.state,
    }, expired.expiredDecisionIds);

    expect(projected.narrativeEvents[0]?.selectedChoice).toBe(1);
    expect(projected.rivalScouts["rival-1"]?.winsAgainstPlayer).toBe(3);
    expect(projected.inbox.filter((message) => message.title === "Nemesis: Alex Vale"))
      .toHaveLength(1);
    expect(projectExpiredNarrativeDefaults(projected, [])).toBe(projected);
  });

  it("routes a tagged storyline choice into its persisted branch context", () => {
    const storyline: StorylineState = {
      id: "storyline-wonderkid",
      templateId: "wonderkidChase",
      name: "The Wonderkid Chase",
      stages: [],
      currentStage: 2,
      nextStageWeek: 9,
      nextStageSeason: 1,
      startedWeek: 3,
      startedSeason: 1,
      resolved: false,
      context: {
        wonderkidId: "player-1",
        wonderkidName: "Ari Prospect",
        playerChoice: null,
      },
    };
    const event = narrativeEvent({
      id: "event-wonderkid-pressure",
      type: "wonderkidPressure",
      title: "Submit Now or Observe Again",
      relatedIds: ["player-1"],
      choices: [
        { label: "Rush a report now", effect: "wonderkidRush" },
        { label: "Wait for more data", effect: "wonderkidWait" },
      ],
      storylineId: storyline.id,
      storylineStage: 1,
    });
    const harness = progressionHarness(gameState({
      narrativeEvents: [event],
      activeStorylines: [storyline],
      players: {
        "player-1": {
          id: "player-1",
          firstName: "Ari",
          lastName: "Prospect",
        },
      } as unknown as GameState["players"],
    }));

    harness.actions.resolveNarrativeEventChoice(event.id, 0);
    const resolved = harness.state();

    expect(resolved.activeStorylines[0]?.context.playerChoice).toBe("wonderkidRush");
    expect(resolved.scout.fatigue).toBe(15);
    expect(resolved.narrativeEvents[0]?.selectedChoice).toBe(0);
    expect(resolved.inbox.at(-1)).toMatchObject({
      title: "The Wonderkid Chase: Decision Recorded",
      relatedId: event.id,
    });
  });

  it("routes and applies a terminal storyline choice before completion", () => {
    const event = narrativeEvent({
      id: "event-prodigal-verdict",
      type: "reportCitedInBoardMeeting",
      title: "Time for Your Verdict",
      choices: [
        { label: "Recommend - still has it", effect: "prodigalRecommend" },
        { label: "Pass - too much decline", effect: "prodigalPass" },
      ],
      storylineId: "storyline-prodigal",
      storylineStage: 1,
    });
    const storyline: StorylineState = {
      id: "storyline-prodigal",
      templateId: "prodigalReturn",
      name: "The Prodigal Return",
      stages: [],
      currentStage: 1,
      nextStageWeek: 6,
      nextStageSeason: 1,
      startedWeek: 2,
      startedSeason: 1,
      resolved: false,
      context: { playerChoice: null },
      awaitingChoice: {
        eventId: event.id,
        stageIndex: 1,
        nextStageIndex: 2,
        terminal: true,
      },
    };
    const harness = progressionHarness(gameState({
      narrativeEvents: [event],
      activeStorylines: [storyline],
    }));

    harness.actions.resolveNarrativeEventChoice(event.id, 0);
    const resolved = harness.state();

    expect(resolved.activeStorylines[0]).toMatchObject({
      currentStage: 2,
      resolved: true,
      context: { playerChoice: "prodigalRecommend" },
    });
    expect(resolved.activeStorylines[0]?.awaitingChoice).toBeUndefined();
    expect(resolved.scout.reputation).not.toBe(40);
    expect(resolved.narrativeEvents[0]?.selectedChoice).toBe(0);
  });

  it("can project a designed default through the normal narrative route", () => {
    const event = narrativeEvent({
      id: "event-defaulted-prodigal-verdict",
      type: "reportCitedInBoardMeeting",
      title: "Time for Your Verdict",
      choices: [
        { label: "Recommend - still has it", effect: "prodigalRecommend" },
        { label: "Pass - too much decline", effect: "prodigalPass" },
      ],
      storylineId: "storyline-defaulted-prodigal",
      storylineStage: 1,
    });
    const storyline: StorylineState = {
      id: "storyline-defaulted-prodigal",
      templateId: "prodigalReturn",
      name: "The Prodigal Return",
      stages: [],
      currentStage: 1,
      nextStageWeek: 6,
      nextStageSeason: 1,
      startedWeek: 2,
      startedSeason: 1,
      resolved: false,
      context: { playerChoice: null },
      awaitingChoice: {
        eventId: event.id,
        stageIndex: 1,
        nextStageIndex: 2,
        terminal: true,
      },
    };
    const offered = ensureNarrativeDecision(gameState({
      narrativeEvents: [event],
      activeStorylines: [storyline],
    }), event);
    const expired = expireDueDecisions(
      offered.consequenceState,
      { week: 1, season: 2 },
      38,
    );
    const harness = progressionHarness({
      ...offered,
      currentWeek: 1,
      currentSeason: 2,
      consequenceState: expired.state,
    });

    // Weekly advancement invokes this same route for expired narrative IDs.
    harness.actions.resolveNarrativeEventChoice(event.id, 1);
    const resolved = harness.state();
    const decision = resolved.consequenceState.decisions[
      narrativeDecisionId(event.id)
    ];
    expect(decision?.selectionKind).toBe("default");
    expect(resolved.narrativeEvents[0]?.selectedChoice).toBe(1);
    expect(resolved.activeStorylines[0]).toMatchObject({
      currentStage: 2,
      resolved: true,
      context: { playerChoice: "prodigalPass" },
    });
  });
});
