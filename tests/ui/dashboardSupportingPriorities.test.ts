import { describe, expect, it } from "vitest";
import { getDashboardPlannerObjectiveKey, type DashboardPriorityItem } from "@/components/game/dashboard/dashboardPriorityModel";
import { selectDashboardSupportingItems } from "@/components/game/dashboard/dashboardWorkspaceModel";

function item(id: string, objectiveKey?: string): DashboardPriorityItem {
  return {
    id, objectiveKey, category: "required_action", severity: "high",
    title: id, explanation: "A distinct responsibility", relatedEntityIds: [],
    sourceSystem: "planner", actionLabel: "Open planner",
    actionTarget: { screen: "calendar", season: 1, week: 6 },
  };
}

describe("supporting Desk priorities", () => {
  it("removes only the represented objective and promotes the next distinct matter", () => {
    const key = getDashboardPlannerObjectiveKey(1, 6);
    const gap = item("gap", key);
    const deadline = item("report-deadline", "report-follow-up:decision-42");
    const travel = item("travel-conflict", "travel:booking-17");
    const priorities = [gap, deadline, travel];
    expect(selectDashboardSupportingItems(priorities, key)).toEqual([deadline, travel]);
    // The original queue remains authoritative for save dispositions and resumption.
    expect(priorities).toEqual([gap, deadline, travel]);
  });

  it("does not merge distinct people, deadlines or objectives sharing Planner", () => {
    const first = item("first-person", "case:player-1");
    const second = item("second-person", "case:player-2");
    expect(selectDashboardSupportingItems([first, second], first.objectiveKey)).toEqual([second]);
    expect(selectDashboardSupportingItems([first, second], "report:player-1")).toEqual([first, second]);
  });

  it("keeps priorities without an identity and never suppresses another week's diary", () => {
    const current = item("current", getDashboardPlannerObjectiveKey(1, 6));
    const next = item("next", getDashboardPlannerObjectiveKey(1, 7));
    const unknown = item("unknown");
    expect(selectDashboardSupportingItems([current, next, unknown], current.objectiveKey)).toEqual([next, unknown]);
    expect(selectDashboardSupportingItems([current, next, unknown])).toEqual([current, next, unknown]);
  });

  it("has no duplicate supporting action when the active case owns the only matter", () => {
    const gap = item("gap", getDashboardPlannerObjectiveKey(2, 1));
    expect(selectDashboardSupportingItems([gap], gap.objectiveKey)).toEqual([]);
  });
});
