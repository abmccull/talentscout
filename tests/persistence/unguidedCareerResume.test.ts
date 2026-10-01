import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";

const careerHolder = vi.hoisted(() => ({ value: null as GameState | null }));
// Navigation uses the real milestone catalog without booting a generated world.
vi.mock("@/stores/gameStore", () => ({
  useGameStore: { getState: () => ({ gameState: careerHolder.value }) },
}));

const tutorialKey = "talentscout_tutorial";
let storage: Storage;

function checkpoint(requested?: boolean, stage = "observation"): GameState {
  return {
    ...(requested === undefined ? {} : { guidedSessionRequested: requested }),
    scout: { id: "scout-1", primarySpecialization: "youth" },
    currentWeek: 1,
    openingCase: { id: "opening-discovery:scout-1:lead-1", playerId: "lead-1", stage },
    activeObservationSession: stage === "observation" ? {
      id: "watch-1",
      activityInstanceId: "opening-discovery:scout-1:lead-1",
      state: "reflection",
      currentPhaseIndex: 2,
      players: [{ playerId: "lead-1", isFocused: true, focusedPhases: [0] }],
      flaggedMoments: [{ phaseIndex: 1, moment: { playerId: "lead-1", isStandout: true } }],
    } : null,
  } as unknown as GameState;
}

async function reloadTutorialModule() {
  vi.resetModules();
  return (await import("@/stores/tutorialStore")).useTutorialStore;
}

beforeEach(() => {
  const values = new Map<string, string>();
  storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  careerHolder.value = checkpoint();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  careerHolder.value = null;
});

describe("unguided career save resume", () => {
  it("clears a previous active guide using the new-career unguided action", async () => {
    const store = await reloadTutorialModule();
    store.getState().startGuidedSession(false, "discoveryHook", { careerId: "old-career" });
    store.getState().completeMilestone("attendedMatch");
    // This is the explicit new-game branch when guideFirstHour is false.
    store.getState().skipGuidedSession();
    store.getState().resumeGuidedSession(checkpoint(false));
    expect(store.getState()).toMatchObject({
      guidedSessionActive: false, currentGuidedTask: null,
      guidedSessionCompleted: false, dismissed: false,
    });
    expect(JSON.parse(storage.getItem(tutorialKey)!)).toMatchObject({ guidedSessionActive: false });
  });

  it("keeps a skipped Reflection unguided after real tutorial-module hydration and later decisions", async () => {
    let store = await reloadTutorialModule();
    store.getState().startGuidedSession(false, "discoveryHook", { careerId: "scout-1" });
    store.getState().completeMilestone("attendedMatch");
    store.getState().skipGuidedSession();
    store = await reloadTutorialModule();
    expect(store.getState().currentGuidedTask).toBeNull();
    for (const stage of ["observation", "decision", "report", "complete"]) {
      const saved = checkpoint(false, stage);
      const original = structuredClone(saved);
      store.getState().resumeGuidedSession(saved);
      store.getState().completeMilestone("completedMatch");
      store.getState().completeMilestone("resolvedOpeningDiscovery");
      expect(saved).toEqual(original);
      expect(store.getState()).toMatchObject({ guidedSessionActive: false, currentGuidedTask: null });
    }
  });

  it("honors the saved career's opt-out over a newer active tutorial cache", async () => {
    let store = await reloadTutorialModule();
    store.getState().startGuidedSession(false, "discoveryHook", { careerId: "scout-1" });
    store = await reloadTutorialModule();
    store.getState().resumeGuidedSession(checkpoint(false));
    expect(store.getState()).toMatchObject({ guidedSessionActive: false, currentGuidedTask: null });
  });

  it("does not turn untouched legacy tutorial defaults into an active guide", async () => {
    storage.setItem(tutorialKey, JSON.stringify({ guidedSessionKind: "firstWeek", guidedMilestones: {} }));
    const store = await reloadTutorialModule();
    store.getState().resumeGuidedSession({ ...checkpoint(undefined, "complete"), currentWeek: 2 });
    expect(store.getState()).toMatchObject({ guidedSessionActive: false, currentGuidedTask: null });
  });

  it("rejects a legacy first-week task for a youth career at week two", async () => {
    storage.setItem(tutorialKey, JSON.stringify({ guidedSessionKind: "firstWeek", guidedMilestones: { viewedDashboard: true } }));
    const store = await reloadTutorialModule();
    expect(store.getState().currentGuidedTask).toBe("openedCalendar");
    store.getState().resumeGuidedSession({ ...checkpoint(undefined, "complete"), currentWeek: 2 });
    expect(store.getState()).toMatchObject({ guidedSessionActive: false, currentGuidedTask: null });
  });

  it.each([false, true])("retains a valid guided Reflection resume (legacy cache: %s)", async (legacy) => {
    let store = await reloadTutorialModule();
    store.getState().startGuidedSession(false, "discoveryHook", { careerId: "scout-1" });
    store.getState().completeMilestone("attendedMatch");
    if (legacy) {
      const savedTutorial = JSON.parse(storage.getItem(tutorialKey)!);
      delete savedTutorial.guidedSessionActive;
      delete savedTutorial.guidedSessionCareerId;
      storage.setItem(tutorialKey, JSON.stringify(savedTutorial));
    }
    store = await reloadTutorialModule();
    store.getState().resumeGuidedSession(checkpoint(legacy ? undefined : true));
    expect(store.getState()).toMatchObject({ guidedSessionActive: true, currentGuidedTask: "completedMatch" });
    store.getState().completeMilestone("completedMatch");
    store.getState().completeMilestone("resolvedOpeningDiscovery");
    expect(store.getState().currentGuidedTask).toBe("wroteReport");
  });

  it("does not carry an explicitly bound guide into another career", async () => {
    const store = await reloadTutorialModule();
    store.getState().startGuidedSession(false, "discoveryHook", { careerId: "other-career" });
    store.getState().resumeGuidedSession(checkpoint(true));
    expect(store.getState()).toMatchObject({ guidedSessionActive: false, currentGuidedTask: null });
  });

  it("preserves live forced replay but does not recreate replay authority on refresh", async () => {
    let store = await reloadTutorialModule();
    store.setState({ dismissed: true, guidedSessionCompleted: true });
    store.getState().startGuidedSession(false, "discoveryHook", { forceReplay: true, careerId: "scout-1" });
    store.getState().resumeGuidedSession(checkpoint(true));
    expect(store.getState()).toMatchObject({
      guidedSessionActive: true, currentGuidedTask: "completedMatch",
      guidedSessionForcedReplay: true, dismissed: true, guidedSessionCompleted: true,
    });
    store = await reloadTutorialModule();
    store.getState().resumeGuidedSession(checkpoint(true));
    expect(store.getState()).toMatchObject({
      guidedSessionActive: false, currentGuidedTask: null,
      guidedSessionForcedReplay: false, dismissed: true, guidedSessionCompleted: true,
    });
  });
});

describe("navigation never locks for an invisible tutorial task", () => {
  it("uses the actual youth mentor catalog, including for legacy week-two tasks", async () => {
    const { shouldLockGuidedNavigation } = await import("@/components/game/tutorial/guidedSession");
    expect(shouldLockGuidedNavigation(true, null)).toBe(false);
    expect(shouldLockGuidedNavigation(true, "viewedDashboard")).toBe(false);
    expect(shouldLockGuidedNavigation(true, "openedCalendar")).toBe(false);
    expect(shouldLockGuidedNavigation(true, "checkedInbox")).toBe(false);
    expect(shouldLockGuidedNavigation(false, "wroteReport")).toBe(false);
    expect(shouldLockGuidedNavigation(true, "wroteReport")).toBe(true);
    expect(shouldLockGuidedNavigation(true, "advancedWeek")).toBe(true);
  });
});
