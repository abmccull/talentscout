import { describe, expect, it } from "vitest";

import {
  chooseLateCareerDilemmaOption,
  getSeenLateCareerDilemmaIds,
  materializeLateCareerDilemma,
  offerLateCareerDilemma,
  validateLateCareerDilemmaProfiles,
} from "@/engine/career/lateCareerDilemmaMaterializer";
import {
  LATE_CAREER_DILEMMAS,
  type LateCareerDilemmaDefinition,
} from "@/engine/career/lateCareerDilemmas";
import { createConsequenceEngineState } from "@/engine/consequences/decisionLedger";
import { processDueConsequences } from "@/engine/consequences/processor";
import {
  projectConsequenceMetrics,
  synchronizeConsequenceMetrics,
} from "@/engine/consequences/projection";
import type { GameState } from "@/engine/core/types";

function definition(id: LateCareerDilemmaDefinition["id"]): LateCareerDilemmaDefinition {
  const value = LATE_CAREER_DILEMMAS.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing test definition ${id}`);
  return value;
}

function baseState(rootSeed = "late-career-test"): GameState {
  return {
    seed: rootSeed,
    runManifest: { rootSeed },
    currentWeek: 1,
    currentSeason: 1,
    fixtures: {},
    consequenceState: createConsequenceEngineState(),
    scout: {
      id: "scout-1",
      careerTier: 5,
      careerPath: "club",
      currentClubId: "club-1",
      primarySpecialization: "firstTeam",
      reputation: 60,
      clubTrust: 70,
      specializationReputation: 55,
      fatigue: 20,
    },
    clubs: {
      "club-1": { id: "club-1", managerId: "manager-1" },
    },
    contacts: {
      journalist: {
        id: "journalist",
        name: "Mara Bell",
        type: "journalist",
        organization: "The Football Post",
        relationship: 50,
        trustLevel: 50,
        reliability: 60,
        knownPlayerIds: [],
      },
      agent: {
        id: "agent",
        name: "Dario Costa",
        type: "agent",
        organization: "Costa Sports",
        relationship: 52,
        trustLevel: 52,
        reliability: 55,
        knownPlayerIds: [],
      },
    },
    finances: {
      employees: [{ id: "employee-1", morale: 60 }],
    },
    rivalScouts: {
      rival: {
        id: "rival",
        name: "Nadia Petrov",
        isNemesis: true,
        reputation: 65,
        aggressiveness: 0.5,
      },
    },
  } as unknown as GameState;
}

function processAt(state: GameState, season: number, week: number): GameState {
  const now = { season, week };
  const synchronized = synchronizeConsequenceMetrics(state, state.consequenceState);
  const processed = processDueConsequences(synchronized, now, 38);
  expect(processed.errors).toEqual([]);
  return projectConsequenceMetrics(
    { ...state, currentSeason: season, currentWeek: week, consequenceState: processed.state },
    processed.state,
  );
}

describe("late-career dilemma materializer", () => {
  it("has an executable balance profile for every authored option", () => {
    expect(validateLateCareerDilemmaProfiles(LATE_CAREER_DILEMMAS)).toEqual([]);
  });

  it("never re-offers dilemmas retained only by compaction history or the permanent archive", () => {
    const state = baseState();
    state.consequenceState.history = [
      {
        decisionId: "compacted-dilemma",
        source: { kind: "lateCareerDilemma", id: "clubDoctrineCollision" },
      },
    ] as GameState["consequenceState"]["history"];
    state.careerStoryArchive = {
      version: 1,
      order: ["archived-dilemma"],
      records: {
        "archived-dilemma": {
          id: "archived-dilemma",
          decisionId: "archived-dilemma",
          source: { kind: "lateCareerDilemma", id: "reputationMortgage" },
        },
      },
    } as unknown as GameState["careerStoryArchive"];

    expect([...getSeenLateCareerDilemmaIds(state)].sort()).toEqual([
      "clubDoctrineCollision",
      "reputationMortgage",
    ]);
  });

  it("materializes deterministic opening, reckoning, and callback consequences", () => {
    const state = baseState();
    const first = materializeLateCareerDilemma(state, definition("clubDoctrineCollision"));
    const replay = materializeLateCareerDilemma(state, definition("clubDoctrineCollision"));

    expect(first).toEqual(replay);
    expect(first.decision.options).toHaveLength(4);
    for (const option of first.decision.options) {
      expect(option.immediateEffects.some((effect) => effect.type === "recordFact")).toBe(true);
      expect(option.immediateEffects.some((effect) => effect.type === "createObligation")).toBe(true);
      expect(option.scheduledConsequences.map((item) => item.id)).toEqual(["reckoning", "callback"]);
      expect(option.scheduledConsequences[1]?.effects.some((effect) => effect.type === "transitionObligation")).toBe(true);
    }
  });

  it("grounds family dilemmas in a persistent player and preserves that subject", () => {
    const materialized = materializeLateCareerDilemma(
      baseState(),
      definition("youthGuardianship"),
      { subjectPlayerId: "player-prospect-17" },
    );

    expect(materialized.stakeholders.family).toEqual([
      { kind: "family", id: "player-prospect-17" },
    ]);
    expect(materialized.decision.stakeholders).toContainEqual(
      { kind: "family", id: "player-prospect-17" },
    );
    expect(materialized.decision.metadata?.relatedPlayerId).toBe("player-prospect-17");
  });

  it("projects opening costs into real career and employee state exactly once", () => {
    const offered = offerLateCareerDilemma(baseState(), definition("clubDoctrineCollision"));
    expect(offered.changed).toBe(true);
    const chosen = chooseLateCareerDilemmaOption(
      offered.state,
      offered.decision!.id,
      "threatenExit",
    );

    expect(chosen.error).toBeUndefined();
    expect(chosen.state.scout.reputation).toBe(61);
    expect(chosen.state.scout.clubTrust).toBe(62);
    expect(chosen.state.scout.fatigue).toBe(24);
    expect(chosen.state.finances?.employees[0]?.morale).toBe(62);
    expect(Object.values(chosen.state.consequenceState.obligations)[0]?.status).toBe("active");

    const replay = chooseLateCareerDilemmaOption(
      chosen.state,
      offered.decision!.id,
      "threatenExit",
    );
    expect(replay.changed).toBe(false);
    expect(replay.state).toBe(chosen.state);
  });

  it("keeps manual and batch delayed processing equivalent", () => {
    const offered = offerLateCareerDilemma(baseState(), definition("reputationMortgage"));
    const chosen = chooseLateCareerDilemmaOption(
      offered.state,
      offered.decision!.id,
      "publicConviction",
    ).state;

    const sequential = processAt(processAt(chosen, 1, 9), 2, 15);
    const batch = processAt(chosen, 2, 15);
    const sequentialObligation = Object.values(sequential.consequenceState.obligations)[0];
    const batchObligation = Object.values(batch.consequenceState.obligations)[0];

    expect({
      reputation: batch.scout.reputation,
      clubTrust: batch.scout.clubTrust,
      specializationReputation: batch.scout.specializationReputation,
      obligation: batchObligation?.status,
    }).toEqual({
      reputation: sequential.scout.reputation,
      clubTrust: sequential.scout.clubTrust,
      specializationReputation: sequential.scout.specializationReputation,
      obligation: sequentialObligation?.status,
    });
    expect(Object.values(batch.consequenceState.facts).some((fact) =>
      fact.kind === "LateCareerDilemmaOutcome"
      && (fact.value as { stage?: string }).stage === "callback"
    )).toBe(true);

    const appliedEffectCount = Object.keys(batch.consequenceState.appliedEffects).length;
    const replay = processAt(batch, 2, 15);
    expect(Object.keys(replay.consequenceState.appliedEffects)).toHaveLength(appliedEffectCount);
    expect(replay.scout.reputation).toBe(batch.scout.reputation);
    expect(replay.scout.clubTrust).toBe(batch.scout.clubTrust);
  });

  it("precommits both favorable and costly career callbacks across world seeds", () => {
    const branches = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      const materialized = materializeLateCareerDilemma(
        baseState(`late-career-seed-${index}`),
        definition("reputationMortgage"),
      );
      const callback = materialized.decision.options
        .find((option) => option.id === "publicConviction")
        ?.scheduledConsequences.find((item) => item.id === "callback");
      callback?.tags?.forEach((tag) => {
        if (tag === "favorable" || tag === "costly") branches.add(tag);
      });
    }
    expect([...branches].sort()).toEqual(["costly", "favorable"]);
  });
});
