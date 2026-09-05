import { beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { ObservationSession } from "@/engine/observation/types";
import {
  createEmptyGuidedMilestones,
  getDiscoveryHookMilestoneOrder,
  useTutorialStore,
} from "@/stores/tutorialStore";

const openingId = "opening-discovery:scout-1:lead-1";

function checkpoint(overrides: Partial<ObservationSession> = {}): GameState {
  return {
    scout: { id: "scout-1", primarySpecialization: "youth" },
    openingCase: { id: openingId, playerId: "lead-1", stage: "observation" },
    activeObservationSession: {
      id: "session-1",
      activityInstanceId: openingId,
      state: "setup",
      currentPhaseIndex: 0,
      players: [],
      flaggedMoments: [],
      ...overrides,
    },
  } as unknown as GameState;
}

function focusedPlayer(overrides: Record<string, unknown> = {}) {
  return {
    playerId: "lead-1",
    isFocused: true,
    focusedPhases: [0],
    focusHistory: [{ phaseIndex: 0, lens: "technical" }],
    ...overrides,
  } as ObservationSession["players"][number];
}

function flaggedMoment(playerId = "lead-1", isStandout = true) {
  return {
    phaseIndex: 1,
    moment: { id: "standout-1", playerId, isStandout },
    reaction: "promising",
  } as ObservationSession["flaggedMoments"][number];
}

beforeEach(() => {
  const milestones = createEmptyGuidedMilestones();
  for (const id of getDiscoveryHookMilestoneOrder()) milestones[id] = true;
  useTutorialStore.setState({
    dismissed: false,
    guidedSessionCompleted: false,
    guidedSessionForcedReplay: false,
    guidedSessionKind: "discoveryHook",
    guidedSessionActive: false,
    currentGuidedTask: "completedMatch",
    guidedMilestones: { ...milestones, viewedDashboard: true },
  });
});

describe("opening observation guide resume", () => {
  it("rewinds newer tutorial progress to the saved setup without changing career data", () => {
    const saved = checkpoint();
    const original = structuredClone(saved);
    expect(useTutorialStore.getState().reconcileOpeningObservationProgress(saved)).toBe(true);
    expect(saved).toEqual(original);
    expect(useTutorialStore.getState()).toMatchObject({
      guidedSessionActive: true,
      currentGuidedTask: "attendedMatch",
      guidedMilestones: {
        attendedMatch: false,
        focusedPlayer: false,
        flaggedBreakthrough: false,
        completedMatch: false,
        resolvedOpeningDiscovery: false,
        wroteReport: false,
        submittedReport: false,
        advancedWeek: false,
        viewedDashboard: true,
      },
    });
  });

  it("resumes an active watch at focus when no focus was saved", () => {
    useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint({ state: "active" }));
    expect(useTutorialStore.getState().currentGuidedTask).toBe("focusedPlayer");
  });

  it.each([
    focusedPlayer(),
    focusedPlayer({ isFocused: false }),
    focusedPlayer({ isFocused: false, focusedPhases: [], focusHistory: [{ phaseIndex: 0, lens: "technical" }] }),
  ])("retains saved focus provenance after focus removal or a phase change", (player) => {
    useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint({
      state: "active", currentPhaseIndex: 2, players: [player],
    }));
    expect(useTutorialStore.getState().currentGuidedTask).toBe("flaggedBreakthrough");
  });

  it.each([flaggedMoment("other-player")])(
    "requires evidence from the opening prospect", (flag) => {
      useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint({
        state: "active", currentPhaseIndex: 1, players: [focusedPlayer()], flaggedMoments: [flag],
      }));
      expect(useTutorialStore.getState().currentGuidedTask).toBe("flaggedBreakthrough");
    },
  );

  it("resumes an ordinary lead concern as recorded evidence without requiring a standout", () => {
    useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint({
      state: "active", currentPhaseIndex: 1, players: [focusedPlayer()],
      flaggedMoments: [{ ...flaggedMoment("lead-1", false), reaction: "concerning" }],
    }));
    expect(useTutorialStore.getState().currentGuidedTask).toBe("completedMatch");
  });

  it.each(["active", "reflection"] as const)("keeps Complete Reflection pending in %s", (state) => {
    useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint({
      state, currentPhaseIndex: 2, players: [focusedPlayer()], flaggedMoments: [flaggedMoment()],
    }));
    expect(useTutorialStore.getState().currentGuidedTask).toBe("completedMatch");
    expect(useTutorialStore.getState().guidedMilestones.completedMatch).toBe(false);
  });

  it("preserves a live forced replay and permanent profile truth", () => {
    useTutorialStore.setState({
      dismissed: true, guidedSessionCompleted: true,
      guidedSessionForcedReplay: true, guidedSessionActive: true,
    });
    useTutorialStore.getState().reconcileOpeningObservationProgress(checkpoint());
    expect(useTutorialStore.getState()).toMatchObject({
      dismissed: true, guidedSessionCompleted: true,
      guidedSessionForcedReplay: true, guidedSessionActive: true,
      currentGuidedTask: "attendedMatch",
    });
  });

  it.each([{ dismissed: true }, { guidedSessionCompleted: true }])(
    "never recreates replay permission after refresh", (profile) => {
      useTutorialStore.setState({ ...profile, currentGuidedTask: null });
      const original = useTutorialStore.getState();
      expect(original.reconcileOpeningObservationProgress(checkpoint())).toBe(true);
      expect(useTutorialStore.getState()).toBe(original);
    },
  );

  it("retains an explicitly skipped guide in the current session", () => {
    useTutorialStore.setState({ guidedSessionActive: false, currentGuidedTask: null });
    const original = useTutorialStore.getState();
    expect(original.reconcileOpeningObservationProgress(checkpoint())).toBe(true);
    expect(useTutorialStore.getState()).toBe(original);
  });

  it.each([
    { openingCase: undefined },
    { openingCase: { ...checkpoint().openingCase, stage: "decision" } },
    { openingCase: { ...checkpoint().openingCase, stage: "report" } },
    { veteranPrologue: {} },
    { activeObservationSession: { ...checkpoint().activeObservationSession, activityInstanceId: "scheduled-2" } },
    { scout: { id: "scout-1", primarySpecialization: "firstTeam" } },
  ])("leaves unrelated saves to the existing resume path", (overrides) => {
    const original = useTutorialStore.getState();
    const saved = { ...checkpoint(), ...overrides } as unknown as GameState;
    expect(original.reconcileOpeningObservationProgress(saved)).toBe(false);
    expect(useTutorialStore.getState()).toBe(original);
  });

  it("leaves the first-week tutorial unchanged", () => {
    useTutorialStore.setState({ guidedSessionKind: "firstWeek" });
    const original = useTutorialStore.getState();
    expect(original.reconcileOpeningObservationProgress(checkpoint())).toBe(false);
    expect(useTutorialStore.getState()).toBe(original);
  });
});
