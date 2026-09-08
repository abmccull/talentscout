import { afterEach, describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import { allocateFocus, createSession } from "@/engine/observation/session";
import { createRNG } from "@/engine/rng";
import { migrateSaveState } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";
import { createSessionReflectionResult } from "@/stores/actions/createSessionReflectionResult";
import { resetGameplayAutosaveWatermark } from "@/stores/actions/persistGameplayAutosave";

function career(): GameState {
  return migrateSaveState({
    seed: "reflection-resume",
    currentSeason: 2,
    currentWeek: 7,
    scout: {
      firstName: "Alex", lastName: "Morgan", primarySpecialization: "youth",
      specializationLevel: 1, reputation: 18, skills: {}, unlockedPerks: [],
      attributes: { intuition: 8 },
    },
  });
}

function activeSession(): ObservationSession {
  const base = createSession({
    activityType: "schoolMatch", specialization: "youth",
    playerPool: [{ playerId: "lead-1", name: "Ari Prospect", position: "CM" }],
    targetPlayerId: "lead-1", seed: "reflection-resume",
    week: 7, season: 2, countryId: "england",
  }, createRNG("reflection-resume-session"));
  const moment: PlayerMoment = {
    id: "resume-moment", playerId: "lead-1", momentType: "technicalAction",
    quality: 7, attributesHinted: ["firstTouch"],
    description: "Ari receives on the half-turn and escapes pressure.",
    vagueDescription: "Ari finds a way through pressure.",
    pressureContext: true, isStandout: true,
  };
  return allocateFocus({
    ...base,
    state: "active",
    currentPhaseIndex: 0,
    phases: [{ index: 0, minute: 80, description: "Final live phase", moments: [moment] }],
    scoutingQuestionId: "projection",
    halftimeApproach: "confirm",
  }, "lead-1", "technical");
}

afterEach(() => {
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: null, activeSession: null, lastReflectionResult: null });
});

describe("observation reflection resume", () => {
  it("restores the same reflection content and rewards as uninterrupted phase advancement", () => {
    const state = career();
    const session = activeSession();
    useGameStore.setState({ gameState: { ...state, activeObservationSession: session }, activeSession: session });
    useGameStore.getState().advanceSessionPhase();
    const uninterrupted = useGameStore.getState().lastReflectionResult;
    const saved = structuredClone(useGameStore.getState().gameState!);
    expect(saved.activeObservationSession?.state).toBe("reflection");
    expect(uninterrupted).not.toBeNull();

    useGameStore.setState({ activeSession: null, lastReflectionResult: null });
    useGameStore.getState().loadGame(saved);

    expect(useGameStore.getState().currentScreen).toBe("observation");
    expect(useGameStore.getState().lastReflectionResult).toEqual(uninterrupted);
    expect(useGameStore.getState().activeSession?.state).toBe("reflection");
  });

  it("recovers legacy reflection checkpoints without stored cue or classification fields", () => {
    const session = { ...activeSession(), state: "reflection" as const };
    delete session.scoutingQuestionId;
    delete session.cueReadings;
    delete session.evidenceDecisions;
    const saved = { ...career(), activeObservationSession: session };
    const original = structuredClone(saved);

    useGameStore.getState().loadGame(saved);

    const restored = useGameStore.getState();
    expect(saved).toEqual(original);
    expect(restored.lastReflectionResult?.reflectionPrompts.length).toBeGreaterThan(0);
    expect(restored.activeSession?.cueReadings?.length).toBeGreaterThan(0);
    expect(restored.activeSession?.evidenceDecisions).toEqual({});
    expect(restored.lastReflectionResult).toEqual(
      createSessionReflectionResult(restored.gameState!, restored.activeSession!),
    );
  });

  it.each(["setup", "active", null] as const)("clears another watch's reflection when loading %s", (state) => {
    const saved = career();
    const session = { ...activeSession(), state: "reflection" as const };
    useGameStore.setState({ lastReflectionResult: createSessionReflectionResult(saved, session) });
    useGameStore.getState().loadGame({
      ...saved,
      activeObservationSession: state === null ? null : { ...session, state },
    });
    expect(useGameStore.getState().lastReflectionResult).toBeNull();
  });
});
