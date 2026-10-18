import { describe, expect, it, vi } from "vitest";
import type { Activity, GameState } from "@/engine/core/types";
import { createWeekSchedule } from "@/engine/core/calendar";
import { useTutorialStore, type TutorialState } from "@/stores/tutorialStore";
import { processWeeklyContextualHint, processWeeklyTutorialMilestones } from "@/stores/actions/weeklyPresentationEffects";
import { createWeeklyActions } from "@/stores/actions/weeklyActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

describe.each(["schoolMatch", "databaseQuery", "oppositionAnalysis"] as const)("scheduling %s respects guide preference", (type) => {
  it.each([
    { requested: false, replay: false, opens: false },
    { requested: true, replay: false, opens: true },
    { requested: undefined, replay: false, opens: true },
    { requested: false, replay: true, opens: true },
  ])("requested=$requested replay=$replay", ({ requested, replay, opens }) => {
    let store = {
      gameState: {
        currentWeek: 1, currentSeason: 1, guidedSessionRequested: requested,
        scout: { fatigue: 0 }, schedule: createWeekSchedule(1, 1),
      },
    } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) };
    };
    const tutorial = {
      checkAutoAdvance: vi.fn(), completeMilestone: vi.fn(), startSequence: vi.fn(),
      guidedSessionForcedReplay: replay,
    } as unknown as TutorialState;
    const actions = createWeeklyActions(get, set, {
      persistenceEnabled: false, getTutorialState: () => tutorial,
    });
    const activity: Activity = { type, slots: 1, description: "Scheduled scouting work" };
    actions.scheduleActivity(activity, 1);
    expect(store.gameState?.schedule.activities[1]).toMatchObject(activity);
    expect(store.gameState?.guidedSessionRequested).toBe(requested);
    expect(tutorial.completeMilestone).toHaveBeenCalledWith("scheduledActivity");
    expect(tutorial.checkAutoAdvance).toHaveBeenCalledWith("activityScheduled");
    if (type === "schoolMatch") expect(tutorial.checkAutoAdvance).toHaveBeenCalledWith("youthActivityScheduled");
    if (type === "databaseQuery") expect(tutorial.checkAutoAdvance).toHaveBeenCalledWith("dataActivityScheduled");
    expect(tutorial.startSequence).toHaveBeenCalledTimes(opens ? 1 : 0);
  });
});

describe("first-month mentor respects career guide preference", () => {
  it.each([false, true, undefined])("keeps milestone tracking while requested=%s", (requested) => {
    const state = {
      currentSeason: 1, currentWeek: 2, guidedSessionRequested: requested,
      scout: { primarySpecialization: "youth", unlockedPerks: [] },
      npcScouts: {}, contacts: {}, rivalScouts: {}, placementReports: {},
      anomalyFlags: [], npcReports: {}, contactIntel: {},
    } as unknown as GameState;
    const tutorial = {
      completeMilestone: vi.fn(), startSequence: vi.fn(), queueSequence: vi.fn(),
      recordFeatureDiscovery: vi.fn(), completedSequences: new Set(),
    } as unknown as TutorialState;
    processWeeklyTutorialMilestones({ ...state, currentWeek: 1 }, state, false, tutorial);
    expect(tutorial.completeMilestone).toHaveBeenCalledWith("advancedWeek");
    if (requested === false) expect(tutorial.startSequence).not.toHaveBeenCalled();
    else expect(tutorial.startSequence).toHaveBeenCalledWith("mentorCheckin:week2");
  });

  it("does not create an automatic weekly hint after opting out", () => {
    const showHint = vi.fn();
    processWeeklyContextualHint(
      { guidedSessionRequested: false } as GameState,
      { showHint, guidedSessionForcedReplay: false } as unknown as TutorialState,
    );
    expect(showHint).not.toHaveBeenCalled();
  });

  it("records unguided visits without opening a panel and keeps requested help available", () => {
    useTutorialStore.setState({
      dismissed: false, guidedSessionActive: false, guidedSessionForcedReplay: false,
      visitedScreens: new Set(), activeScreenGuide: null, pendingScreenGuide: null,
    });
    useTutorialStore.getState().recordScreenVisit("calendar", false);
    expect(useTutorialStore.getState().visitedScreens.has("calendar")).toBe(true);
    expect(useTutorialStore.getState().activeScreenGuide).toBeNull();
    expect(useTutorialStore.getState().pendingScreenGuide).toBeNull();
    useTutorialStore.getState().openScreenGuide("calendar");
    expect(useTutorialStore.getState().activeScreenGuide).toBe("calendar");
    useTutorialStore.getState().closeScreenGuide();
    expect(useTutorialStore.getState().activeScreenGuide).toBeNull();
  });
});
