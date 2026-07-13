import { describe, expect, it } from "vitest";
import {
  buildStakeholderEcologyProfile,
  createConsequenceEngineState,
  createDecisionRecord,
  processDueConsequences,
  registerDecision,
  selectDecisionOption,
  type ConsequenceEffect,
  type DecisionOption,
} from "@/engine/consequences";
import type { RivalScout } from "@/engine/core/types";
import {
  buildOpeningCaseDirectorChain,
  composeOpeningCaseDirectorOptions,
} from "@/engine/youth/openingCaseDirector";
import type { OpeningCaseState } from "@/engine/youth/openingCase";

const openingCase: OpeningCaseState = {
  id: "opening-discovery:scout-1:player-1",
  youthId: "youth-1",
  playerId: "player-1",
  scoutId: "scout-1",
  playerPoolIds: ["player-1"],
  sourceContactId: "contact-1",
  sourceContactName: "Tommy Reyes",
  clubId: "club-1",
  stage: "decision",
  startedWeek: 1,
  startedSeason: 1,
  discoveryRecordCreated: true,
};

const rival: RivalScout = {
  id: "rival-1",
  name: "Morgan Vale",
  quality: 4,
  specialization: "youth",
  clubId: "club-2",
  targetPlayerIds: ["player-1"],
  reputation: 70,
  personality: "methodical",
  isNemesis: true,
  competingForPlayers: ["player-1"],
  currentTarget: "player-1",
  scoutingProgress: { "player-1": 2 },
  aggressiveness: 0.6,
  budgetTier: "medium",
  winsAgainstPlayer: 0,
  lossesToPlayer: 0,
};

function baseOptions(): DecisionOption[] {
  return ["protect", "callClub", "verify"].map((id) => ({
    id,
    label: id,
    knownTradeoffs: [],
    immediateEffects: [],
    scheduledConsequences: [],
  }));
}

describe("opening case director", () => {
  it("builds a deterministic three-stage chain carrying the recurring cast and deadlines", () => {
    const input = {
      seed: "seed-1",
      openingCase,
      scoutId: "scout-1",
      now: { week: 1, season: 1 },
      fixtures: {},
      rivals: { [rival.id]: rival },
    };
    const first = buildOpeningCaseDirectorChain(input);
    const second = buildOpeningCaseDirectorChain(input);

    expect(first).toEqual(second);
    expect(first.cast).toMatchObject({
      player: { kind: "player", id: "player-1" },
      contact: { kind: "contact", id: "contact-1" },
      club: { kind: "club", id: "club-1" },
      rival: { kind: "rival", id: "rival-1" },
    });
    expect(first.stages.map((stage) => stage.dueAt)).toEqual([
      { week: 1, season: 1 },
      { week: 3, season: 1 },
      { week: 7, season: 1 },
    ]);
  });

  it("processes later stages once and creates cross-stakeholder memories", () => {
    const decisionId = "decision:opening-case";
    const directed = composeOpeningCaseDirectorOptions({
      director: {
        seed: "seed-1",
        openingCase,
        scoutId: "scout-1",
        now: { week: 1, season: 1 },
        fixtures: {},
        rivals: { [rival.id]: rival },
      },
      decisionId,
      options: baseOptions(),
    });
    const decision = createDecisionRecord({
      id: decisionId,
      source: { kind: "openingCase", id: openingCase.id },
      offeredAt: { week: 1, season: 1 },
      deadlineAt: { week: 1, season: 1 },
      visibility: "stakeholders",
      stakeholders: [
        directed.chain.cast.contact!,
        directed.chain.cast.club!,
        directed.chain.cast.rival!,
      ],
      options: directed.options,
      outcomeRoll: 0.2,
    });
    const registered = registerDecision(createConsequenceEngineState(), decision);
    const selected = selectDecisionOption(
      registered.state,
      decisionId,
      "callClub",
      { week: 1, season: 1 },
    );

    const access = processDueConsequences(selected.state, { week: 3, season: 1 });
    expect(Object.values(access.state.memories).map((memory) => memory.stakeholder.kind).sort())
      .toEqual(["contact", "rival"]);

    const echo = processDueConsequences(access.state, { week: 7, season: 1 });
    expect(new Set(Object.values(echo.state.memories).map((memory) => memory.stakeholder.kind)))
      .toEqual(new Set(["contact", "club", "rival"]));
    expect(processDueConsequences(echo.state, { week: 7, season: 1 }).state).toEqual(echo.state);
  });
});

describe("stakeholder ecology selector", () => {
  it("projects specific memories, promises, decisions, trust, and influence", () => {
    const contact = { kind: "contact", id: "contact-1" };
    const now = { week: 8, season: 1 };
    const decisionId = "decision:relationship";
    const scheduledEffect: ConsequenceEffect = {
      id: "effect:future-fact",
      type: "recordFact",
      fact: {
        id: "fact:future",
        kind: "followUp",
        observedAt: { week: 9, season: 1 },
        visibility: "stakeholders",
        value: true,
      },
    };
    const decision = createDecisionRecord({
      id: decisionId,
      source: { kind: "openingCase", id: openingCase.id },
      offeredAt: { week: 6, season: 1 },
      deadlineAt: { week: 6, season: 1 },
      visibility: "stakeholders",
      stakeholders: [contact],
      options: [
        {
          id: "protect",
          label: "Protect the source",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [{
            id: "follow-up",
            dueAt: { week: 9, season: 1 },
            effects: [scheduledEffect],
          }],
        },
        {
          id: "share",
          label: "Share the lead",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [],
        },
      ],
      outcomeRoll: 0.4,
      metadata: { caseId: openingCase.id },
    });
    const registered = registerDecision(createConsequenceEngineState(), decision);
    const selected = selectDecisionOption(
      registered.state,
      decisionId,
      "protect",
      { week: 6, season: 1 },
    );
    const state = {
      ...selected.state,
      memories: {
        "memory-1": {
          id: "memory-1",
          stakeholder: contact,
          subject: { kind: "scout", id: "scout-1" },
          tags: ["protectedSource"],
          valence: 24,
          intensity: 80,
          salience: 90,
          visibility: "stakeholders" as const,
          createdAt: { week: 6, season: 1 },
          metadata: { playerId: "player-1" },
        },
      },
      obligations: {
        "obligation-1": {
          id: "obligation-1",
          debtor: { kind: "scout", id: "scout-1" },
          creditor: contact,
          kind: "confidentiality",
          terms: "Keep the lead private until the second viewing",
          status: "active" as const,
          createdAt: { week: 6, season: 1 },
          dueAt: { week: 10, season: 1 },
          sourceDecisionId: decisionId,
        },
      },
    };
    const profile = buildStakeholderEcologyProfile({
      state,
      stakeholder: contact,
      now,
      scoutId: "scout-1",
      baseTrust: 55,
      baseInfluence: 40,
      resolveEntityName: (entity) => entity.id === "player-1" ? "Alex Morgan" : undefined,
    });

    expect(profile.memories[0].summary).toContain("Alex Morgan");
    expect(profile.obligations[0]).toMatchObject({ role: "owedByYou", status: "active" });
    expect(profile.decisions[0]).toMatchObject({
      summary: "Opening prospect handling",
      selectedOption: "Protect the source",
      nextConsequenceAt: { week: 9, season: 1 },
    });
    expect(profile.trust.effective).toBeGreaterThan(55);
    expect(profile.influence.activeObligations).toBe(1);
  });
});
