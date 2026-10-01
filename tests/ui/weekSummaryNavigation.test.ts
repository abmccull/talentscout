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
  it("carries a dashboard message target into the inbox and clears it when navigating away", () => {
    const state = { gameState: {}, currentScreen: "dashboard", activeMatch: null,
      pendingInboxMessageId: null } as unknown as GameStoreState;
    const set: SetState = (partial) => Object.assign(state,
      typeof partial === "function" ? partial(state) : partial);
    const actions = createNavigationActions(() => state, set);
    actions.openDashboardTarget({ screen: "inbox", messageId: "message-to-review" });
    expect(state.currentScreen).toBe("inbox");
    expect(state.pendingInboxMessageId).toBe("message-to-review");
    actions.setScreen("dashboard");
    expect(state.pendingInboxMessageId).toBeNull();
    actions.openDashboardTarget({ screen: "inbox" });
    expect(state.pendingInboxMessageId).toBeNull();
  });
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

  it("stores dashboard navigation focus before changing screens", () => {
    const selectPlayer = vi.fn();
    const state = {
      currentScreen: "dashboard",
      activeMatch: null,
      gameState: {
        countries: ["england"],
        currentSeason: 1,
        currentWeek: 4,
        contacts: {
          reporter: {
            id: "reporter",
            name: "Mara Vale",
            type: "journalist",
            relationship: 55,
            reliability: 60,
            knownPlayerIds: [],
          },
        },
        players: {
          "player-1": {
            id: "player-1",
            firstName: "Milo",
            lastName: "Hart",
          },
        },
        retiredPlayers: {},
      },
      selectPlayer,
    } as unknown as GameStoreState;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, update);
    };
    const actions = createNavigationActions(() => state, set);

    actions.openDashboardTarget({ screen: "network", contactId: "reporter", playerId: "player-1" });
    expect(state.pendingNetworkContactId).toBe("reporter");
    expect(state.currentScreen).toBe("network");
    expect(selectPlayer).toHaveBeenCalledWith("player-1");

    actions.openDashboardTarget({
      screen: "calendar",
      week: 4,
      season: 1,
      playerId: "player-1",
      focusActivityType: "trainingVisit",
    });
    expect(state.pendingCalendarActivity).toMatchObject({
      type: "trainingVisit",
      targetId: "player-1",
    });
    expect(state.currentScreen).toBe("calendar");

    const incomingFocus = state.pendingCalendarActivity;
    actions.setScreen("calendar");
    expect(state.pendingCalendarActivity).toBe(incomingFocus);
    actions.openDashboardTarget({
      screen: "calendar", week: 4, season: 1,
      playerId: "player-1", focusActivityType: "parentCoachMeeting",
    });
    expect(state.pendingCalendarActivity).toMatchObject({
      type: "parentCoachMeeting", targetId: "player-1",
    });
    actions.setScreen("dashboard");
    expect(state.pendingCalendarActivity).toBeNull();
    actions.setScreen("calendar");
    expect(state.pendingCalendarActivity).toBeNull();

    actions.openDashboardTarget({ screen: "rivals", opportunityId: "opp-social", playerId: "player-1" });
    expect(state.pendingRivalOpportunityId).toBe("opp-social");
    expect(state.currentScreen).toBe("rivals");
  });
});
