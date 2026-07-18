import { describe, expect, it } from "vitest";
import type {
  EventChain,
  GameState,
  NarrativeEvent,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import {
  createConsequenceEngineState,
  registerDecision,
  selectDecisionOption,
} from "@/engine/consequences/decisionLedger";
import { processDueConsequences } from "@/engine/consequences/processor";
import { maintainConsequenceLifecycle } from "@/engine/consequences/lifecycle";
import {
  createStakeholderProfileRegistry,
  getManagerStakeholderRef,
  getStakeholderAuthoritativeMetricKeys,
  type StakeholderProfileRole,
} from "@/engine/consequences/stakeholderProfiles";
import {
  getAuthoredRelationshipConflictDefinitions,
  materializeAuthoredRelationshipConflict,
  registerMaterializedRelationshipConflict,
  selectAuthoredRelationshipConflict,
  validateAuthoredRelationshipConflicts,
} from "@/engine/consequences/authoredRelationshipConflicts";
import { directWeeklyRelationshipConflict } from "@/engine/consequences/relationshipConflictDirector";
import {
  archiveMaterialCareerStories,
  createCareerStoryArchiveState,
  registerCareerStoryCallback,
} from "@/engine/consequences/careerStoryArchive";
import type {
  DecisionRecord,
  EntityRef,
  WorldFact,
} from "@/engine/consequences/types";
import {
  adaptLegacyStoryCandidate,
  createStoryDirectorStateV2,
  migrateStoryDirectorStateV2,
  recordStorySelectionV2,
  scoreStoryCandidatesV2,
  selectStoryCandidateV2,
  type StoryCandidateV2,
} from "@/engine/events/storyDirectorV2";
import {
  adaptWeeklyNarrativeEmissionV2,
  directWeeklyStoryEmissionsV2,
  inferNarrativeEntityRefsV2,
} from "@/engine/events/weeklyStoryDirectorAdapter";
import { computeChainChoiceEffects } from "@/engine/events/eventChains";
import {
  applyWorldConditionArcDecision,
  createWorldConditionArcState,
  getDueWorldConditionArcBeats,
  getWorldConditionArcDefinitions,
  getWorldConditionArcModifiers,
  recordWorldConditionArcBeat,
  startWorldConditionArcs,
} from "@/engine/world/worldConditionArcs";
import type {
  WorldConditionInstance,
  WorldConditionModifiers,
} from "@/engine/world/worldConditions";
import { refreshWeeklyStakeholderProfiles } from "@/stores/actions/weeklyActions";
import { clearTerminalConsequenceInboxActions } from "@/stores/actions/narrativeInboxState";

const week1 = { season: 1, week: 1 } as const;

function narrativeEvent(
  id: string,
  overrides: Partial<NarrativeEvent> = {},
): NarrativeEvent {
  return {
    id,
    type: "exclusiveTip",
    week: 1,
    season: 1,
    title: id,
    description: `${id} description`,
    relatedIds: [],
    acknowledged: false,
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: Partial<StoryCandidateV2> = {},
): StoryCandidateV2 {
  return {
    id,
    templateId: `template:${id}`,
    kind: "standalone",
    category: "test",
    semanticSignature: `signature:${id}`,
    baseWeight: 1,
    cast: [],
    topics: [],
    ...overrides,
  };
}

function relationshipFixture(): GameState {
  return {
    currentWeek: 1,
    currentSeason: 1,
    runManifest: { rootSeed: "relationships-seed" },
    contacts: {
      reporter: {
        id: "reporter",
        name: "Mara Vale",
        type: "journalist",
        relationship: 58,
        trustLevel: 61,
      },
    },
    finances: { employees: [] },
    rivalScouts: {},
    managerProfiles: {},
    boardProfile: undefined,
    scout: { id: "scout" },
    clubs: {},
    players: {
      prospect: { id: "prospect", firstName: "Ivo", lastName: "Santos" },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    reports: {},
    watchlist: ["prospect"],
    fixtures: {},
    inbox: [],
    consequenceState: createConsequenceEngineState({
      memories: {
        "family-memory": {
          id: "family-memory",
          stakeholder: { kind: "family", id: "prospect" },
          subject: { kind: "scout", id: "scout" },
          tags: ["privacy"],
          valence: 20,
          intensity: 50,
          salience: 60,
          visibility: "stakeholders",
          createdAt: week1,
        },
      },
    }),
  } as unknown as GameState;
}

describe("persistent stakeholder profiles and authored conflicts", () => {
  it("builds deterministic identities while leaving relationship meters authoritative", () => {
    const game = relationshipFixture();
    const first = createStakeholderProfileRegistry(game);
    const second = createStakeholderProfileRegistry(game);
    expect(first).toEqual(second);

    const journalist = first.profiles["contact:reporter"];
    const family = first.profiles["family:prospect"];
    expect(journalist.role).toBe("journalist");
    expect(family.name).toBe("The Santos family");
    expect(getStakeholderAuthoritativeMetricKeys(journalist)).toEqual([
      "contact:reporter:relationship",
      "contact:reporter:trust",
      "contact:reporter:loyalty",
    ]);
    expect(journalist).not.toHaveProperty("trust");
    expect(journalist).not.toHaveProperty("relationship");

    const preserved = createStakeholderProfileRegistry(game, {
      ...first,
      profiles: {
        ...first.profiles,
        "contact:reporter": { ...journalist, voiceId: "press-custom" },
      },
    });
    expect(preserved.profiles["contact:reporter"].voiceId).toBe("press-custom");
  });

  it("uses one stable manager identity across the stakeholder spine", () => {
    const game = relationshipFixture();
    game.scout.currentClubId = "club-1";
    game.clubs = {
      "club-1": { id: "club-1", name: "Northbridge", managerId: "manager-1" },
    } as unknown as GameState["clubs"];
    game.managerProfiles = {
      "club-1": { clubId: "club-1", managerId: "manager-1", managerName: "Asha Morgan" },
    } as unknown as GameState["managerProfiles"];
    const canonical = getManagerStakeholderRef(game, "club-1");
    const registry = createStakeholderProfileRegistry(game);

    expect(canonical).toEqual({ kind: "manager", id: "manager-1" });
    expect(registry.profiles["manager:manager-1"]).toMatchObject({
      name: "Asha Morgan",
      affiliation: "Northbridge",
    });
    expect(Object.keys(registry.profiles)).not.toContain("manager:club-1:asha-morgan");
  });

  it("retains departed people for history but never casts them into new conflicts", () => {
    const active = relationshipFixture();
    active.finances = {
      employees: [{ id: "employee-gone", name: "Nico Vale", morale: 44 }],
    } as GameState["finances"];
    const withEmployee = createStakeholderProfileRegistry(active);
    const departed = {
      ...active,
      finances: { ...active.finances, employees: [] },
    } as GameState;
    const refreshed = createStakeholderProfileRegistry(departed, withEmployee);
    const cast = selectAuthoredRelationshipConflict({
      rootSeed: active.runManifest.rootSeed,
      now: week1,
      registry: refreshed,
      subject: { kind: "player", id: "prospect" },
    });

    expect(refreshed.profiles["employee:employee-gone"]).toMatchObject({
      name: "Nico Vale",
      active: false,
    });
    expect([cast?.left.entity.id, cast?.right.entity.id]).not.toContain("employee-gone");
  });

  it("covers every recurring role family with validated, non-equivalent conflicts", () => {
    expect(validateAuthoredRelationshipConflicts()).toEqual([]);
    const roles = new Set<StakeholderProfileRole>();
    for (const definition of getAuthoredRelationshipConflictDefinitions()) {
      roles.add(definition.leftRole);
      roles.add(definition.rightRole);
      expect(new Set(definition.options.map((option) => [
        option.leftOutcome,
        option.rightOutcome,
        option.leftValence,
        option.rightValence,
        option.fatigueDelta,
        option.reputationDelta,
      ].join(":"))).size).toBe(definition.options.length);
    }
    expect([...roles].sort()).toEqual([
      "agent",
      "coach",
      "contact",
      "director",
      "employee",
      "family",
      "journalist",
      "manager",
      "organizer",
      "rival",
      "scout",
    ]);
  });

  it("registers both opposed obligations atomically and resolves distinct memories", () => {
    const game = relationshipFixture();
    const registry = createStakeholderProfileRegistry(game);
    const cast = selectAuthoredRelationshipConflict({
      rootSeed: game.runManifest.rootSeed,
      now: week1,
      registry,
      subject: { kind: "player", id: "prospect" },
    });
    expect(cast?.definition.id).toBe("family-versus-journalist-privacy");
    const materialized = materializeAuthoredRelationshipConflict({
      id: "conflict:privacy",
      cast: cast!,
      scoutId: "scout",
      now: week1,
      deadlineAt: { season: 1, week: 2 },
      outcomeRoll: 0.42,
    });

    const registered = registerMaterializedRelationshipConflict(
      createConsequenceEngineState(),
      materialized,
    );
    expect(registered.error).toBeUndefined();
    expect(Object.keys(registered.state.obligations)).toHaveLength(2);
    expect(registerMaterializedRelationshipConflict(registered.state, materialized).changed).toBe(false);

    const selected = selectDecisionOption(
      registered.state,
      materialized.decision.id,
      "protect-family",
      week1,
    );
    const processed = processDueConsequences(selected.state, week1);
    expect(Object.values(processed.state.obligations).map((obligation) => obligation.status).sort())
      .toEqual(["breached", "fulfilled"]);
    expect(Object.values(processed.state.memories)).toHaveLength(2);
    expect(new Set(Object.values(processed.state.memories).map((memory) => memory.valence)).size)
      .toBe(2);
  });

  it("refreshes the recurring cast without rerolling an established personality", () => {
    const game = refreshWeeklyStakeholderProfiles(relationshipFixture());
    const originalVoice = game.stakeholderProfiles!.profiles["contact:reporter"].voiceId;
    game.contacts.reporter = {
      ...game.contacts.reporter,
      name: "Mara Vale-Santos",
    };
    game.contacts.coach = {
      ...game.contacts.reporter,
      id: "coach",
      name: "Tomas Reed",
      type: "academyCoach",
    };

    const refreshed = refreshWeeklyStakeholderProfiles(game);
    expect(refreshed.stakeholderProfiles!.profiles["contact:reporter"]).toMatchObject({
      name: "Mara Vale-Santos",
      voiceId: originalVoice,
    });
    expect(refreshed.stakeholderProfiles!.profiles["contact:coach"].role).toBe("coach");
  });

  it("offers at most one deterministic weekly conflict under the shared choice cap", () => {
    const first = directWeeklyRelationshipConflict({
      state: relationshipFixture(),
      forceTrigger: true,
    });
    const replay = directWeeklyRelationshipConflict({
      state: relationshipFixture(),
      forceTrigger: true,
    });
    expect(first.offeredDecisionId).toBe(replay.offeredDecisionId);
    expect(first.offeredDecisionId).toBeTruthy();
    expect(first.state.inbox.at(-1)).toMatchObject({
      actionRequired: true,
      relatedId: first.offeredDecisionId,
    });
    expect(Object.values(first.state.consequenceState.obligations)).toHaveLength(2);

    const blocked = directWeeklyRelationshipConflict({
      state: first.state,
      forceTrigger: true,
    });
    expect(blocked.blockedReason).toBe("unresolved-conflict");
    expect(blocked.state).toBe(first.state);

    const decisionId = first.offeredDecisionId!;
    const recentResolved = {
      ...first.state,
      currentWeek: 5,
      consequenceState: {
        ...first.state.consequenceState,
        decisions: {
          ...first.state.consequenceState.decisions,
          [decisionId]: {
            ...first.state.consequenceState.decisions[decisionId],
            status: "resolved" as const,
            resolvedAt: { season: 1, week: 2 },
          },
        },
      },
    };
    expect(directWeeklyRelationshipConflict({
      state: recentResolved,
      forceTrigger: true,
    }).blockedReason).toBe("cooldown");
  });

  it("clears a conflict inbox pin after its consequence decision becomes terminal", () => {
    const offered = directWeeklyRelationshipConflict({
      state: relationshipFixture(),
      forceTrigger: true,
    });
    const decisionId = offered.offeredDecisionId!;
    const terminalState = {
      ...offered.state.consequenceState,
      decisions: {
        ...offered.state.consequenceState.decisions,
        [decisionId]: {
          ...offered.state.consequenceState.decisions[decisionId],
          status: "resolved" as const,
          resolvedAt: week1,
        },
      },
    };
    expect(clearTerminalConsequenceInboxActions(offered.state.inbox, terminalState).at(-1))
      .toMatchObject({ read: true, actionRequired: false, relatedId: decisionId });
  });
});

describe("Story Director v2", () => {
  it("selects deterministically regardless of input order and save round-trip", () => {
    const state = createStoryDirectorStateV2();
    const candidates = [candidate("alpha"), candidate("beta", { baseWeight: 2 })];
    const left = selectStoryCandidateV2({
      rootSeed: "story-seed",
      state,
      now: week1,
      candidates,
    });
    const right = selectStoryCandidateV2({
      rootSeed: "story-seed",
      state: migrateStoryDirectorStateV2(JSON.parse(JSON.stringify(state))),
      now: week1,
      candidates: [...candidates].reverse(),
    });
    expect(left.selected?.id).toBe(right.selected?.id);
  });

  it("enforces semantic, cast, topic and callback novelty without blocking continuations", () => {
    const actor: EntityRef = { kind: "contact", id: "one" };
    const topic: EntityRef = { kind: "player", id: "prospect" };
    let state = createStoryDirectorStateV2();
    const first = candidate("one", {
      cast: [actor],
      topics: [topic],
      callbackFingerprint: "callback:one",
    });
    state = recordStorySelectionV2(state, first, week1);
    state = recordStorySelectionV2(state, candidate("two", { cast: [actor] }), { season: 1, week: 2 });

    const scored = scoreStoryCandidatesV2({
      state,
      now: { season: 1, week: 3 },
      candidates: [
        candidate("same-signature", { semanticSignature: first.semanticSignature }),
        candidate("same-topic", { topics: [topic] }),
        candidate("same-cast", { cast: [actor] }),
        candidate("same-callback", { callbackFingerprint: "callback:one" }),
        candidate("continuation", {
          continuation: true,
          semanticSignature: first.semanticSignature,
          cast: [actor],
          topics: [topic],
        }),
      ],
    });
    const byId = Object.fromEntries(scored.map((entry) => [entry.candidate.id, entry]));
    expect(byId["same-signature"].blockedReasons).toContain("semantic-repeat");
    expect(byId["same-topic"].blockedReasons).toContain("topic-repeat");
    expect(byId["same-cast"].blockedReasons).toContain("cast-overuse");
    expect(byId["same-callback"].blockedReasons).toContain("callback-already-shown");
    expect(byId.continuation.eligible).toBe(true);
  });

  it("migrates malformed ledgers without trusting nested save values", () => {
    expect(() => migrateStoryDirectorStateV2({
      recentOccurrences: [{ occurredAt: null, castKeys: null }],
      recentTemplates: { bad: [{ week: "x", season: 1 }] },
      callbackFingerprints: ["valid", 3, "valid"],
    })).not.toThrow();
    const migrated = migrateStoryDirectorStateV2({
      recentOccurrences: [{ occurredAt: null }],
      callbackFingerprints: ["valid", 3, "valid"],
    });
    expect(migrated.recentOccurrences).toEqual([]);
    expect(migrated.callbackFingerprints).toEqual(["valid"]);
  });

  it("gives actual due chain/storyline beats priority over a second opening beat", () => {
    const prior = narrativeEvent("chain-opening", { chainId: "chain:one" });
    const continuation = narrativeEvent("chain-follow-up", {
      chainId: "chain:one",
      choices: [{ label: "Act", effect: "act" }],
    });
    const standalone = narrativeEvent("new-opening");
    expect(adaptWeeklyNarrativeEmissionV2({
      emission: { event: continuation },
      priorEvents: [prior],
    }).continuation).toBe(true);

    const directed = directWeeklyStoryEmissionsV2({
      rootSeed: "weekly-story",
      state: createStoryDirectorStateV2(),
      now: { season: 1, week: 2 },
      priorEvents: [prior],
      emissions: [{ event: standalone }, { event: continuation }],
    });
    expect(directed.accepted.map((entry) => entry.emission.event.id)).toEqual(["chain-follow-up"]);
    expect(directed.rejected.map((entry) => entry.emission.event.id)).toEqual(["new-opening"]);
  });

  it("allows only one new opening across all four shipped story sources", () => {
    const emissions = [
      { event: narrativeEvent("standalone-opening") },
      { event: narrativeEvent("chain-opening", { chainId: "chain:new" }) },
      { event: narrativeEvent("storyline-opening", { storylineId: "story:new" }) },
      { event: narrativeEvent("special-opening", { specialEventId: "special:new" }) },
    ];
    const kinds = emissions.map((emission) =>
      adaptWeeklyNarrativeEmissionV2({ emission, priorEvents: [] }).kind,
    );
    expect(kinds).toEqual(["standalone", "chain", "storyline", "special"]);

    const first = directWeeklyStoryEmissionsV2({
      rootSeed: "one-opening",
      state: createStoryDirectorStateV2(),
      now: week1,
      priorEvents: [],
      emissions,
    });
    const reordered = directWeeklyStoryEmissionsV2({
      rootSeed: "one-opening",
      state: createStoryDirectorStateV2(),
      now: week1,
      priorEvents: [],
      emissions: [...emissions].reverse(),
    });
    expect(first.accepted).toHaveLength(1);
    expect(first.accepted[0].candidate.id).toBe(reordered.accepted[0].candidate.id);
  });

  it("resolves actual related entities into cast and topic novelty ledgers", () => {
    const game = relationshipFixture();
    const refs = inferNarrativeEntityRefsV2(game, narrativeEvent("cast", {
      relatedIds: ["reporter", "prospect", "unknown"],
    }));
    expect(refs.cast).toEqual([
      { kind: "player", id: "prospect" },
      { kind: "contact", id: "reporter" },
    ]);
    expect(refs.topics).toContainEqual({ kind: "entity", id: "unknown" });
  });

  it("classifies receipt callbacks even when the legacy adapter calls them standalone", () => {
    const event = narrativeEvent(
      "callback:rival:rival-activity:rival-1:targetAcquired:prospect:s1:w8",
      { type: "rivalPoach", relatedIds: ["prospect"] },
    );
    const adapted = adaptLegacyStoryCandidate({
      source: event,
      kind: "standalone",
      templateId: event.type,
      category: event.type,
      semanticSignature: `standalone:${event.type}`,
    });

    expect(adapted).toMatchObject({
      kind: "callback",
      templateId: "callback:rival",
      category: "callback:rival",
      semanticSignature: "callback:rival",
      callbackFingerprint: event.id,
    });
    const recorded = recordStorySelectionV2(
      createStoryDirectorStateV2(),
      adapted,
      { season: 1, week: 8 },
    );
    expect(scoreStoryCandidatesV2({
      state: recorded,
      now: { season: 1, week: 13 },
      candidates: [adapted],
    })[0].blockedReasons).toContain("callback-already-shown");
  });
});

describe("career story archive", () => {
  it("retains the professional artifact after heavy consequence records compact", () => {
    const decision: DecisionRecord = {
      id: "decision:historic-call",
      source: { kind: "report", id: "report:one" },
      offeredAt: week1,
      deadlineAt: { season: 1, week: 2 },
      status: "resolved",
      visibility: "public",
      stakeholders: [{ kind: "club", id: "club:one" }],
      options: [{
        id: "back-player",
        label: "Back the player",
        knownTradeoffs: ["Your reputation is attached", "The club spends now"],
        immediateEffects: [],
        scheduledConsequences: [],
      }],
      selectedOptionId: "back-player",
      selectedAt: week1,
      selectionKind: "player",
      resolvedAt: { season: 1, week: 2 },
      outcomeRoll: 0.5,
      consequenceIds: [],
      metadata: {
        title: "The Call on Ivo Santos",
        relatedPlayerId: "prospect",
        relatedClubId: "club:one",
      },
    };
    const fact: WorldFact = {
      id: "fact:historic-call",
      kind: "recommendationOutcome",
      subject: { kind: "player", id: "prospect" },
      value: "signed",
      observedAt: { season: 1, week: 2 },
      visibility: "public",
      sourceDecisionId: decision.id,
    };
    const engine = createConsequenceEngineState({
      decisions: { [decision.id]: decision },
      facts: { [fact.id]: fact },
    });
    const archived = archiveMaterialCareerStories({
      state: engine,
      archive: createCareerStoryArchiveState(),
      rootSeed: "archive-seed",
      resolveEntityName: (entity) => entity.id,
    });
    const recordId = `career-story:${decision.id}`;
    expect(archived.archive.records[recordId].knownTradeoffs).toHaveLength(2);
    expect(archived.archive.records[recordId].outcomeFacts).toHaveLength(1);

    const compacted = maintainConsequenceLifecycle(engine, { season: 5, week: 1 });
    expect(compacted.state.decisions[decision.id]).toBeUndefined();
    expect(archived.archive.records[recordId].selectedOptionLabel).toBe("Back the player");

    const callback = registerCareerStoryCallback(
      archived.archive,
      recordId,
      "callback:international-debut",
    );
    expect(registerCareerStoryCallback(callback, recordId, "callback:international-debut"))
      .toBe(callback);
  });
});

const neutralModifiers: WorldConditionModifiers = {
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

describe("world-condition narrative arcs", () => {
  it("provides four authored three-phase arcs with materially different choices", () => {
    expect(getWorldConditionArcDefinitions().map((definition) => definition.conditionDefinitionId).sort())
      .toEqual([
        "academy-investment-wave",
        "agent-exclusivity-wave",
        "data-rights-dispute",
        "local-football-recession",
      ]);
    for (const definition of getWorldConditionArcDefinitions()) {
      expect(definition.choices).toHaveLength(3);
      expect(new Set(definition.choices.map((choice) => JSON.stringify(choice.modifiers))).size)
        .toBe(3);
      expect(definition.choices.every((choice) => choice.knownTradeoffs.length >= 2)).toBe(true);
    }
  });

  it("starts deterministically, records a decision, applies bounded modifiers, and completes once", () => {
    const condition: WorldConditionInstance = {
      id: "academy-investment-wave:s1:portugal",
      definitionId: "academy-investment-wave",
      scope: "regional",
      season: 1,
      countryId: "portugal",
      modifiers: neutralModifiers,
    };
    let arcs = startWorldConditionArcs({
      state: createWorldConditionArcState(),
      rootSeed: "world-arc-seed",
      conditions: [condition],
      now: week1,
    });
    const replay = startWorldConditionArcs({
      state: createWorldConditionArcState(),
      rootSeed: "world-arc-seed",
      conditions: [condition],
      now: week1,
    });
    expect(arcs).toEqual(replay);
    const arcId = Object.keys(arcs.active)[0];
    const signal = getDueWorldConditionArcBeats({ state: arcs, now: week1 });
    expect(signal.map((beat) => beat.phase)).toEqual(["signal"]);
    arcs = recordWorldConditionArcBeat(arcs, arcId, "signal", week1);
    expect(getDueWorldConditionArcBeats({ state: arcs, now: week1 })).toEqual([]);

    const decisionBeat = getDueWorldConditionArcBeats({
      state: arcs,
      now: { season: 1, week: 3 },
    })[0];
    expect(decisionBeat.phase).toBe("decision");
    const registered = registerDecision(
      createConsequenceEngineState(),
      decisionBeat.decision!,
    ).state;
    const selected = selectDecisionOption(
      registered,
      decisionBeat.decision!.id,
      "embed-locally",
      { season: 1, week: 3 },
    ).state;
    const processed = processDueConsequences(selected, { season: 1, week: 3 });
    arcs = recordWorldConditionArcBeat(arcs, arcId, "decision", { season: 1, week: 3 });
    arcs = applyWorldConditionArcDecision({
      state: arcs,
      decision: processed.state.decisions[decisionBeat.decision!.id],
      now: { season: 1, week: 3 },
    });
    expect(getWorldConditionArcModifiers(arcs, "portugal").discoveryMultiplier).toBe(1.12);
    expect(getWorldConditionArcModifiers(arcs, "spain").discoveryMultiplier).toBe(1);

    const aftermath = getDueWorldConditionArcBeats({
      state: arcs,
      now: { season: 1, week: 8 },
    });
    expect(aftermath.map((beat) => beat.phase)).toEqual(["aftermath"]);
    arcs = recordWorldConditionArcBeat(arcs, arcId, "aftermath", { season: 1, week: 8 });
    expect(Object.keys(arcs.active)).toHaveLength(0);
    expect(arcs.completed).toHaveLength(1);
    expect(getWorldConditionArcModifiers(arcs, "portugal").discoveryMultiplier).toBe(1);
    expect(recordWorldConditionArcBeat(arcs, arcId, "aftermath", { season: 1, week: 8 }))
      .toBe(arcs);
  });
});

describe("authored chain choice stakes", () => {
  function chain(templateKey: string, currentStep: number): EventChain {
    return {
      id: `chain:${templateKey}`,
      templateKey,
      startWeek: 1,
      currentStep,
      maxSteps: 4,
      resolved: false,
      choiceHistory: [],
      context: {},
      nextStepWeek: 1,
      eventIds: [],
    };
  }

  it("uses authored stakes for shipped choices and retains a legacy fallback", () => {
    const rng = createRNG("chain-effects");
    expect(computeChainChoiceEffects(chain("rivalPoaching", 2), 0, rng, 1))
      .toEqual({ reputationChange: 3, fatigueChange: 7 });
    expect(computeChainChoiceEffects(chain("rivalPoaching", 2), 2, rng, 1))
      .toEqual({ reputationChange: 0, fatigueChange: -2 });
    expect(computeChainChoiceEffects(chain("dressingRoomConflict", 1), 0, rng, 0))
      .toEqual({ reputationChange: 2, fatigueChange: 3 });
  });
});
