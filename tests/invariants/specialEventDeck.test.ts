import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import { RNG } from "@/engine/rng";
import {
  createConsequenceEngineState,
  ensureNarrativeDecision,
  evaluateStakeholderMemoryPolicy,
  expireDueDecisions,
  getActiveRelationshipConflictGroups,
  getRecurringRelationshipIdentities,
  narrativeDecisionId,
  processDueConsequences,
  projectConsequenceMetrics,
  selectNarrativeDecision,
} from "@/engine/consequences";
import {
  SCOUTING_SPECIAL_EVENT_DECK,
  EVENT_TEMPLATES,
  buildSpecialEventDecisionOption,
  createEventDirectorState,
  createScoutingSpecialEvent,
  getSpecialEventSelectionWeights,
  selectScoutingSpecialEvent,
} from "@/engine/events";
import { createRunManifest } from "@/engine/run";

function specialState(
  worldTraitIds: string[] = [
    "golden-generation",
    "scout-wars",
    "boom-bust-market",
  ],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    seed: "special-event-deck",
    runManifest: createRunManifest({
      rootSeed: "special-event-deck",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      worldTraitIds,
    }),
    currentWeek: 10,
    currentSeason: 1,
    fixtures: {},
    scout: {
      id: "scout-1",
      primarySpecialization: "youth",
      currentClubId: "club-1",
      reputation: 45,
      fatigue: 12,
      clubTrust: 50,
      specializationReputation: 40,
    },
    reports: {},
    watchlist: ["player-1"],
    players: {
      "player-1": {
        id: "player-1",
        firstName: "Ari",
        lastName: "Prospect",
      },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {
      "contact-agent": {
        id: "contact-agent",
        name: "Morgan Price",
        relationship: 72,
        trustLevel: 65,
        type: "agent",
      },
      "contact-journalist": {
        id: "contact-journalist",
        name: "Riley Shah",
        relationship: 68,
        trustLevel: 62,
        type: "journalist",
      },
      "contact-school": {
        id: "contact-school",
        name: "Jamie Okafor",
        relationship: 64,
        trustLevel: 60,
        type: "schoolCoach",
      },
    },
    finances: {
      employees: [{
        id: "employee-1",
        name: "Samira Cole",
        role: "scout",
        quality: 14,
        salary: 2_400,
        morale: 64,
        fatigue: 10,
        hiredWeek: 1,
        hiredSeason: 1,
        reportsGenerated: [],
        experience: 120,
        weeklyLog: [],
        regionFocusWeeks: 0,
      }],
    } as unknown as NonNullable<GameState["finances"]>,
    clubs: {
      "club-1": { id: "club-1", name: "Northside Academy" },
    },
    rivalScouts: {
      "rival-1": {
        id: "rival-1",
        name: "Alex Vale",
        quality: 4,
        specialization: "youth",
        clubId: "club-2",
        targetPlayerIds: ["player-1"],
        reputation: 62,
        personality: "aggressive",
        isNemesis: true,
        competingForPlayers: ["player-1"],
        scoutingProgress: {},
        aggressiveness: 0.55,
        budgetTier: "medium",
        winsAgainstPlayer: 2,
        lossesToPlayer: 1,
      },
    },
    consequenceState: createConsequenceEngineState(),
    eventDirector: createEventDirectorState(),
    narrativeEvents: [],
    activeStorylines: [],
    eventChains: [],
    ...overrides,
  } as unknown as GameState;
}

describe("trait-sensitive scouting special-event deck", () => {
  it("covers every required scouting conflict with explicit decision policy", () => {
    expect(SCOUTING_SPECIAL_EVENT_DECK).toHaveLength(11);
    expect(new Set(SCOUTING_SPECIAL_EVENT_DECK.map((event) => event.category)))
      .toEqual(new Set([
        "discovery",
        "access",
        "ethics",
        "media",
        "playerWelfare",
        "marketShock",
        "rivalConflict",
        "careerPolitics",
      ]));

    const state = specialState();
    for (const definition of SCOUTING_SPECIAL_EVENT_DECK) {
      const event = createScoutingSpecialEvent(state, definition.id, {});
      expect(event).not.toBeNull();
      expect(event?.decisionDeadlineWeeks).toBeGreaterThan(0);
      expect(event?.defaultChoiceIndex).toBe(definition.defaultChoiceIndex);
      expect(event?.choices?.every((choice) =>
        (choice.knownTradeoffs?.length ?? 0) >= 2,
      )).toBe(true);
      expect(definition.defaultChoiceIndex).toBeLessThan(definition.options.length);
      expect(definition.options.length).toBeGreaterThanOrEqual(2);
      for (const option of definition.options) {
        const payload = buildSpecialEventDecisionOption(
          state,
          event!,
          `decision:test:${definition.id}`,
          option.effect,
        );
        expect(payload?.knownTradeoffs.length).toBeGreaterThanOrEqual(2);
        expect(payload?.immediateEffects.length).toBeGreaterThan(0);
        expect(payload?.scheduledConsequences).toHaveLength(1);
        expect(payload?.scheduledConsequences[0]?.tags).toContain("special-event");
      }
    }
  });

  it("materially changes event weights with world traits", () => {
    const volatile = specialState([
      "golden-generation",
      "scout-wars",
      "boom-bust-market",
    ]);
    const relational = specialState([
      "thin-crop",
      "trusted-circuit",
      "cautious-market",
    ]);
    const volatileWeights = getSpecialEventSelectionWeights(volatile, {});
    const relationalWeights = getSpecialEventSelectionWeights(relational, {});

    expect(volatileWeights["market-window-collapse"]).toBeGreaterThan(
      relationalWeights["market-window-collapse"],
    );
    expect(volatileWeights["rival-credit-war"]).toBeGreaterThan(
      relationalWeights["rival-credit-war"],
    );
    expect(relationalWeights["access-closed-training"]).toBeGreaterThan(
      volatileWeights["access-closed-training"],
    );
  });

  it("binds profession-specific stories to the correct persistent contact", () => {
    const state = specialState();
    const ethics = createScoutingSpecialEvent(state, "ethics-agent-envelope", {})!;
    const media = createScoutingSpecialEvent(state, "media-wonderkid-leak", {})!;
    const discovery = createScoutingSpecialEvent(state, "discovery-last-empty-seat", {})!;

    expect(ethics.relatedIds).toEqual(["contact-agent"]);
    expect(ethics.description).toContain("Morgan Price");
    expect(media.relatedIds).toEqual(["player-1", "contact-journalist"]);
    expect(media.description).toContain("Riley Shah");
    expect(discovery.relatedIds).toContain("contact-school");

    const noProfessional = specialState([], {
      contacts: {
        "contact-school": state.contacts["contact-school"],
      },
    });
    expect(createScoutingSpecialEvent(noProfessional, "ethics-agent-envelope", {})).toBeNull();
    expect(createScoutingSpecialEvent(noProfessional, "media-wonderkid-leak", {})).toBeNull();
    expect(getSpecialEventSelectionWeights(noProfessional, {})["ethics-agent-envelope"]).toBe(0);
    expect(getSpecialEventSelectionWeights(noProfessional, {})["media-wonderkid-leak"]).toBe(0);
  });

  it("selects deterministically across save/reload and suppresses recent repeats", () => {
    const state = specialState();
    const first = selectScoutingSpecialEvent(
      new RNG("special-selector"),
      state,
      {},
    );
    const replay = selectScoutingSpecialEvent(
      new RNG("special-selector"),
      structuredClone(state),
      structuredClone({}),
    );
    expect(first).not.toBeNull();
    expect(replay).toEqual(first);

    const history = {
      recentSpecialEventIds: [first!.specialEventId!],
      specialEventCounts: { [first!.specialEventId!]: 1 },
    };
    const next = selectScoutingSpecialEvent(
      new RNG("special-selector"),
      state,
      history,
    );
    expect(next).not.toBeNull();
    expect(next?.specialEventId).not.toBe(first?.specialEventId);
    expect(getSpecialEventSelectionWeights(state, history)[first!.specialEventId!])
      .toBe(0);
  });

  it("precommits delayed branches and preserves them through save/reload", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "ethics-agent-envelope",
      {},
    )!;
    const registered = ensureNarrativeDecision(state, event);
    const reloaded = ensureNarrativeDecision(
      structuredClone(registered),
      structuredClone(event),
    );
    const decisionId = narrativeDecisionId(event.id);
    const decision = registered.consequenceState.decisions[decisionId];

    expect(reloaded.consequenceState).toEqual(registered.consequenceState);
    expect(
      reloaded.consequenceState.decisions[decisionId]
        ?.options[0].scheduledConsequences[0].outcomeRoll,
    ).toBe(decision.options[0].scheduledConsequences[0].outcomeRoll);
    expect(decision.options[0].scheduledConsequences[0].tags)
      .not.toEqual(decision.options[1].scheduledConsequences[0].tags);
    expect(decision.options[0].knownTradeoffs)
      .not.toEqual(decision.options[1].knownTradeoffs);
  });

  it("produces divergent persisted outcomes for opposing choices", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "ethics-agent-envelope",
      {},
    )!;
    const exposed = selectNarrativeDecision(structuredClone(state), event, 0);
    const leveraged = selectNarrativeDecision(structuredClone(state), event, 1);
    expect(exposed.error).toBeUndefined();
    expect(leveraged.error).toBeUndefined();

    const due = { week: 20, season: 1 };
    const exposedOutcome = processDueConsequences(
      exposed.state.consequenceState,
      due,
      38,
    );
    const leveragedOutcome = processDueConsequences(
      leveraged.state.consequenceState,
      due,
      38,
    );
    const exposedFacts = Object.values(exposedOutcome.state.facts).filter(
      (fact) => fact.kind === "ScoutingSpecialEventOutcome",
    );
    const leveragedFacts = Object.values(leveragedOutcome.state.facts).filter(
      (fact) => fact.kind === "ScoutingSpecialEventOutcome",
    );

    expect(exposedFacts).toHaveLength(1);
    expect(leveragedFacts).toHaveLength(1);
    expect(exposedFacts[0]?.value).not.toEqual(leveragedFacts[0]?.value);
    expect(
      exposed.state.consequenceState.decisions[narrativeDecisionId(event.id)]
        ?.selectedOptionId,
    ).not.toBe(
      leveraged.state.consequenceState.decisions[narrativeDecisionId(event.id)]
        ?.selectedOptionId,
    );
  });

  it("turns confidential access into one durable promise and future relationship memory", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(state, "access-closed-training", {})!;
    const selected = selectNarrativeDecision(state, event, 0);
    expect(selected.error).toBeUndefined();

    const selectedProjection = selected.state.consequenceState;
    const obligation = Object.values(selectedProjection.obligations)[0];
    expect(obligation).toMatchObject({
      debtor: { kind: "scout", id: "scout-1" },
      creditor: { kind: "contact", id: "contact-agent" },
      kind: "confidentiality",
      status: "active",
    });
    expect(Object.values(selectedProjection.obligations)).toHaveLength(1);
    const confidentialityDilemma = EVENT_TEMPLATES.find(
      (template) => template.type === "confidentialityDilemma",
    );
    expect(confidentialityDilemma?.prerequisites(selected.state)).toBe(true);
    expect(confidentialityDilemma?.choices?.every(
      (choice) => (choice.knownTradeoffs?.length ?? 0) >= 2,
    )).toBe(true);
    expect(Object.values(selectedProjection.memories)).toHaveLength(0);

    const due = { week: 20, season: 1 };
    const resolved = processDueConsequences(selectedProjection, due, 38);
    const replayed = processDueConsequences(resolved.state, due, 38);
    const resolvedObligation = resolved.state.obligations[obligation.id];
    expect(resolvedObligation.status).toBe("active");
    expect(resolvedObligation.dueAt).toEqual({ week: 30, season: 1 });
    expect(Object.values(resolved.state.memories)).toHaveLength(1);
    expect(replayed.state).toEqual(resolved.state);

    const policy = evaluateStakeholderMemoryPolicy({
      memories: resolved.state.memories,
      obligations: resolved.state.obligations,
      stakeholder: { kind: "contact", id: "contact-agent" },
      subject: { kind: "scout", id: "scout-1" },
      now: due,
      domain: "contactRelationship",
      seasonLength: 38,
    });
    expect(policy.scoreAdjustment).not.toBe(0);
    expect(policy.reason).toBeTruthy();

    const repeatedEvent = createScoutingSpecialEvent(
      selected.state,
      "access-closed-training",
      { specialEventCounts: { "access-closed-training": 1 } },
    )!;
    const repeatedSelection = selectNarrativeDecision(selected.state, repeatedEvent, 0);
    expect(repeatedSelection.error).toBeUndefined();
    expect(Object.values(repeatedSelection.state.consequenceState.obligations)).toHaveLength(1);
    expect(repeatedSelection.state.consequenceState.obligations[obligation.id]).toEqual(obligation);
  });

  it("materializes simultaneous family and journalist requests before selection", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "relationships-family-media-embargo",
      {},
    )!;
    const offered = ensureNarrativeDecision(state, event);
    const conflicts = getActiveRelationshipConflictGroups(offered);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.stakeholderRefs).toEqual(expect.arrayContaining([
      { kind: "family", id: "player-1" },
      { kind: "contact", id: "contact-journalist" },
    ]));
    expect(Object.values(offered.consequenceState.obligations)).toHaveLength(2);

    const protectedFamily = selectNarrativeDecision(offered, event, 0);
    expect(protectedFamily.error).toBeUndefined();
    const statuses = Object.fromEntries(Object.values(
      protectedFamily.state.consequenceState.obligations,
    ).map((obligation) => [obligation.kind, obligation.status]));
    expect(statuses).toMatchObject({
      familyPrivacy: "fulfilled",
      mediaAccess: "breached",
    });
    const memoryActors = Object.values(protectedFamily.state.consequenceState.memories)
      .map((memory) => `${memory.stakeholder.kind}:${memory.stakeholder.id}`);
    expect(memoryActors).toEqual(expect.arrayContaining([
      "family:player-1",
      "contact:contact-journalist",
    ]));

    const projected = projectConsequenceMetrics(
      protectedFamily.state,
      protectedFamily.state.consequenceState,
    );
    expect(projected.contacts["contact-journalist"].trustLevel).toBe(55);
    const cast = getRecurringRelationshipIdentities(projected);
    expect(cast.find((identity) => identity.entity.kind === "family")?.name)
      .toBe("The Prospect family");
  });

  it("keeps conflict offers idempotent across reload and resolves timeout defaults", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "relationships-family-media-embargo",
      {},
    )!;
    const registered = ensureNarrativeDecision(state, event);
    const reloaded = ensureNarrativeDecision(
      structuredClone(registered),
      structuredClone(event),
    );
    expect(reloaded.consequenceState).toEqual(registered.consequenceState);
    expect(Object.values(reloaded.consequenceState.obligations)).toHaveLength(2);

    const decision = reloaded.consequenceState.decisions[narrativeDecisionId(event.id)];
    const expired = expireDueDecisions(
      reloaded.consequenceState,
      addGameWeeks(state.fixtures, decision.deadlineAt, 1),
      38,
    );
    const processed = processDueConsequences(expired.state, decision.deadlineAt, 38);
    expect(expired.error).toBeUndefined();
    expect(Object.values(processed.state.obligations).map((obligation) => obligation.status))
      .toEqual(["fulfilled", "fulfilled"]);
    expect(getActiveRelationshipConflictGroups({ consequenceState: processed.state }))
      .toHaveLength(0);
  });

  it("makes employee-versus-agent loyalty change real morale and access", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "relationships-employee-agent-credit",
      {},
    )!;
    expect(event.description).toContain("Samira Cole");
    expect(event.description).toContain("Morgan Price");

    const selected = selectNarrativeDecision(state, event, 0);
    expect(selected.error).toBeUndefined();
    const projected = projectConsequenceMetrics(
      selected.state,
      selected.state.consequenceState,
    );
    expect(projected.finances?.employees[0]?.morale).toBe(74);
    expect(projected.contacts["contact-agent"].trustLevel).toBe(57);
    expect(Object.values(projected.consequenceState.memories).map(
      (memory) => memory.stakeholder.kind,
    )).toEqual(expect.arrayContaining(["employee", "contact"]));
  });

  it("turns an individual rival dispute into persistent behavioral pressure", () => {
    const state = specialState();
    const event = createScoutingSpecialEvent(
      state,
      "relationships-rival-agent-ceasefire",
      {},
    )!;
    expect(event.description).toContain("Alex Vale");

    const selected = selectNarrativeDecision(state, event, 1);
    expect(selected.error).toBeUndefined();
    const projected = projectConsequenceMetrics(
      selected.state,
      selected.state.consequenceState,
    );
    expect(projected.rivalScouts["rival-1"].aggressiveness).toBe(0.7);
    expect(projected.contacts["contact-agent"].trustLevel).toBe(74);
    const rivalMemory = Object.values(projected.consequenceState.memories).find(
      (memory) => memory.stakeholder.kind === "rival",
    );
    expect(rivalMemory?.stakeholder.id).toBe("rival-1");
    expect(rivalMemory?.tags).toContain("directCompetition");
  });

  it("auto-selects each event's designed default only after its deadline", () => {
    const state = specialState();
    for (const definition of SCOUTING_SPECIAL_EVENT_DECK) {
      const event = createScoutingSpecialEvent(state, definition.id, {})!;
      const registered = ensureNarrativeDecision(state, event);
      const decisionId = narrativeDecisionId(event.id);
      const decision = registered.consequenceState.decisions[decisionId];
      const deadline = addGameWeeks(
        state.fixtures,
        { week: event.week, season: event.season },
        definition.deadlineWeeks,
      );
      expect(decision.deadlineAt).toEqual(deadline);
      expect(decision.defaultOptionId).toBe(
        decision.options[definition.defaultChoiceIndex]?.id,
      );

      const atDeadline = expireDueDecisions(
        registered.consequenceState,
        deadline,
        38,
      );
      expect(atDeadline.expiredDecisionIds).toEqual([]);
      const afterDeadline = expireDueDecisions(
        registered.consequenceState,
        addGameWeeks(state.fixtures, deadline, 1),
        38,
      );
      expect(afterDeadline.expiredDecisionIds).toEqual([decisionId]);
      expect(afterDeadline.state.decisions[decisionId]).toMatchObject({
        selectedOptionId: decision.options[definition.defaultChoiceIndex]?.id,
        selectionKind: "default",
      });
    }
  });
});
