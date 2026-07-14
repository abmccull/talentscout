import { describe, expect, it, vi } from "vitest";
import { createNavigationActions } from "@/stores/actions/navigationActions";
import type { GameStoreState, WeekSummary } from "@/stores/gameStoreTypes";
import type { SetState } from "@/stores/actions/types";

function summary(continueScreen?: WeekSummary["continueScreen"]): WeekSummary {
  return {
    continueScreen,
    fatigueChange: 0,
    reputationChange: 0,
    skillXpGained: {},
    attributeXpGained: {},
    matchesAttended: 0,
    reportsWritten: 0,
    meetingsHeld: 0,
    newMessages: 0,
    rivalAlerts: 0,
    financeSummary: null,
    activityQualities: [],
    playersDiscovered: 0,
    observationsGenerated: 0,
  };
}

describe("week summary continuation", () => {
  it("opens the queued season review only after dismissing the summary", () => {
    const setScreen = vi.fn();
    const state = {
      lastWeekSummary: summary("seasonAwards"),
      setScreen,
    } as unknown as GameStoreState;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, update);
    };
    const actions = createNavigationActions(() => state, set);

    actions.dismissWeekSummary();

    expect(state.lastWeekSummary).toBeNull();
    expect(setScreen).toHaveBeenCalledOnce();
    expect(setScreen).toHaveBeenCalledWith("seasonAwards");
  });

  it("dismisses an ordinary weekly summary without redirecting", () => {
    const setScreen = vi.fn();
    const state = {
      lastWeekSummary: summary(),
      setScreen,
    } as unknown as GameStoreState;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, update);
    };
    const actions = createNavigationActions(() => state, set);

    actions.dismissWeekSummary();

    expect(state.lastWeekSummary).toBeNull();
    expect(setScreen).not.toHaveBeenCalled();
  });
});
