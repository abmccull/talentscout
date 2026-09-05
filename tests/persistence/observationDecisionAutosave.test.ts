import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, ScoutCueReading } from "@/engine/core/types";
import { createSession } from "@/engine/observation/session";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { createObservationActions } from "@/stores/actions/observationActions";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import type { GameStoreState, SetState } from "@/stores/actions/types";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(),
  snapshotPersistedGameState: (state: GameState) => state,
}));

function setup(overrides: Partial<ObservationSession> = {}) {
  const skeleton = createSession({
    activityType: "schoolMatch", specialization: "youth", seed: "resume-watch",
    week: 1, season: 1,
    playerPool: [{ playerId: "lead", name: "Ari Prospect", position: "CM" }],
    targetPlayerId: "lead",
  }, createRNG("resume-watch"));
  const session = {
    ...skeleton,
    scoutingQuestionId: "projection",
    ...overrides,
  } as ObservationSession;
  let store = {
    activeSession: session,
    gameState: {
      seed: "resume-watch", currentWeek: 1, currentSeason: 1,
      scout: { primarySpecialization: "youth", skills: {}, attributes: {} },
      regionalKnowledge: {},
      activeObservationSession: session,
    } as GameState,
  } as GameStoreState;
  const set: SetState = (partial) => {
    store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) };
  };
  const actions = createObservationActions(() => store, set);
  const savedSession = () => {
    const calls = vi.mocked(queueGameplayAutosave).mock.calls;
    return calls.at(-1)?.[0].activeObservationSession;
  };
  return { actions, savedSession, current: () => store };
}

beforeEach(() => vi.clearAllMocks());

describe("observation decisions queue resumable checkpoints", () => {
  it("saves session start, lens, token spend, and phase without requiring unload", () => {
    const { actions, savedSession, current } = setup();
    actions.beginSession();
    expect(savedSession()?.state).toBe("active");
    actions.allocateSessionFocus("lead", "technical");
    expect(savedSession()?.players[0]).toMatchObject({ isFocused: true, currentLens: "technical" });
    expect(savedSession()?.focusTokens.available).toBe(2);
    actions.advanceSessionPhase();
    expect(savedSession()?.currentPhaseIndex).toBe(1);
    expect(savedSession()).toBe(current().activeSession);
    expect(current().gameState?.activeObservationSession).toBe(current().activeSession);
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(3);
  });

  it("saves one flagged judgment and ignores repeated or invalid flags", () => {
    const original = setup();
    const session = original.current().activeSession!;
    const moment = {
      id: "standout", playerId: "lead", isStandout: true, quality: 8,
      description: "A composed pass", vagueDescription: "A composed pass",
    } as PlayerMoment;
    const { actions, savedSession } = setup({
      state: "active",
      phases: session.phases.map((phase, index) => index === 0 ? { ...phase, moments: [moment] } : phase),
    });
    actions.flagSessionMoment("missing", "promising");
    expect(queueGameplayAutosave).not.toHaveBeenCalled();
    actions.flagSessionMoment("standout", "promising");
    expect(savedSession()?.flaggedMoments).toHaveLength(1);
    expect(savedSession()?.flaggedMoments[0]).toMatchObject({ reaction: "promising", moment: { id: "standout" } });
    actions.flagSessionMoment("standout", "concerning");
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(1);
    expect(savedSession()?.flaggedMoments[0].reaction).toBe("promising");
  });

  it("saves reflection interpretation and private notes in the same latest session", () => {
    const cue = { id: "cue-1", suggestedClassifications: ["technicalExecution"] } as ScoutCueReading;
    const { actions, savedSession } = setup({ state: "reflection", cueReadings: [cue] });
    actions.classifySessionEvidence("cue-1", "technicalExecution");
    actions.addSessionNote("See the player against stronger pressure.");
    expect(savedSession()?.evidenceDecisions?.["cue-1"]).toEqual({ cueId: "cue-1", classification: "technicalExecution" });
    expect(savedSession()?.reflectionNotes).toContain("See the player against stronger pressure.");
    expect(queueGameplayAutosave).toHaveBeenCalledTimes(2);
  });
});
