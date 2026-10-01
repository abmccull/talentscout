import { describe, expect, it } from "vitest";
import { bookOpeningFollowUp, openingFollowUpDayIndex, reconcileOpeningReportStage } from "@/engine/youth/openingFollowUp";
import type { GameState } from "@/engine/core/types";

function emptyWeek() {
  return {
    activities: Array.from({ length: 7 }, () => null),
    completed: false,
  };
}

describe("opening follow-up booking", () => {
  it("completes a filed opening without rebooking or changing its report on repeated recovery", () => {
    const state = {
      scout: { id: "scout-1" },
      openingCase: { id: "opening", playerId: "p1", stage: "report" },
      reports: { r1: { id: "r1", scoutId: "scout-1", playerId: "p1" } },
      schedule: emptyWeek(),
    } as unknown as GameState;
    const completed = reconcileOpeningReportStage(state);
    expect(completed.openingCase?.stage).toBe("complete");
    expect(state.openingCase?.stage).toBe("report");
    expect(completed.reports).toBe(state.reports);
    expect(completed.schedule).toBe(state.schedule);
    expect(reconcileOpeningReportStage(completed)).toBe(completed);
  });

  it.each([
    { scoutId: "another-scout", playerId: "p1" },
    { scoutId: "scout-1", playerId: "another-player" },
  ])("does not skip an opening based on an unrelated report", (report) => {
    const state = {
      scout: { id: "scout-1" },
      openingCase: { playerId: "p1", stage: "report" },
      reports: { r1: report },
    } as unknown as GameState;
    expect(reconcileOpeningReportStage(state)).toBe(state);
  });

  it("keeps an unfiled opening pending", () => {
    const state = {
      scout: { id: "scout-1" }, openingCase: { playerId: "p1", stage: "report" }, reports: {},
    } as unknown as GameState;
    expect(reconcileOpeningReportStage(state)).toBe(state);
  });

  it("places a follow-up session on the first empty day", () => {
    const state = {
      openingCase: { id: "opening", playerId: "p1" },
      schedule: emptyWeek(),
      scout: { fatigue: 10 },
    } as unknown as GameState;

    const next = bookOpeningFollowUp(state);
    expect(openingFollowUpDayIndex(next)).toBe(0);
    expect(next.schedule.activities[0]).toMatchObject({
      type: "followUpSession",
      targetId: "p1",
      slots: 1,
    });
  });

  it("does not double-book the same opening player", () => {
    const first = bookOpeningFollowUp({
      openingCase: { id: "opening", playerId: "p1" },
      schedule: emptyWeek(),
      scout: { fatigue: 10 },
    } as unknown as GameState);
    const second = bookOpeningFollowUp(first);
    expect(second.schedule.activities.filter(Boolean)).toHaveLength(1);
  });
});
