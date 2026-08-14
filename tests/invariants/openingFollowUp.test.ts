import { describe, expect, it } from "vitest";
import { bookOpeningFollowUp, openingFollowUpDayIndex } from "@/engine/youth/openingFollowUp";
import type { GameState } from "@/engine/core/types";

function emptyWeek() {
  return {
    activities: Array.from({ length: 7 }, () => null),
    completed: false,
  };
}

describe("opening follow-up booking", () => {
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
