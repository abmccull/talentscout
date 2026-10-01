import { describe, expect, it } from "vitest";
import { getWeeklyWorkCounts } from "@/lib/weeklyWorkCounts";
import type { Activity, GameState, ScoutReport } from "@/engine/core/types";

function state(activities: Array<Activity | null>, reports: Record<string, ScoutReport> = {}) {
  return {
    currentWeek: 1, currentSeason: 2, scout: { id: "scout" }, reports,
    schedule: { week: 1, season: 2, completed: false,
      activities: [...activities, ...Array(7 - activities.length).fill(null)] },
  } as GameState;
}
function report(id: string, overrides: Partial<ScoutReport> = {}): ScoutReport {
  return { id, scoutId: "scout", submittedWeek: 1, submittedSeason: 2, ...overrides } as ScoutReport;
}

describe("completed weekly work counts", () => {
  it("separates a follow-up from its source meeting and includes a report filed during the live week", () => {
    const before = state([
      { description: "Review activity", type: "followUpSession", slots: 1, targetId: "player" },
      { description: "Review activity", type: "parentCoachMeeting", slots: 1, targetId: "player" },
    ], { filed: report("filed") });
    expect(getWeeklyWorkCounts(before, before)).toEqual({
      scoutingSessions: 1, matchesAttended: 0, meetingsHeld: 1, reportsWritten: 1,
    });
  });

  it("counts a multi-day visit once and does not call desk preparation a filing", () => {
    const visit: Activity = { description: "Review activity", type: "academyVisit", slots: 2, instanceId: "academy" };
    const before = state([visit, visit, { description: "Review activity", type: "writeReport", slots: 1, targetId: "player" }]);
    expect(getWeeklyWorkCounts(before, before)).toEqual({
      scoutingSessions: 1, matchesAttended: 0, meetingsHeld: 0, reportsWritten: 0,
    });
  });

  it("uses the completed week at season rollover and excludes foreign, old and future filings", () => {
    const before = state([{ description: "Review activity", type: "attendMatch", slots: 1, targetId: "match" }]);
    const after = { ...before, currentWeek: 1, currentSeason: 3, reports: {
      filed: report("filed"), revised: report("revised", { revision: 2, supersedesReportId: "filed" }),
      foreign: report("foreign", { scoutId: "other" }), old: report("old", { submittedSeason: 1 }),
      future: report("future", { submittedSeason: 3 }),
    } };
    expect(getWeeklyWorkCounts(before, after)).toEqual({
      scoutingSessions: 1, matchesAttended: 1, meetingsHeld: 0, reportsWritten: 2,
    });
  });
});

