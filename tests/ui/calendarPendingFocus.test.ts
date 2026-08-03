import { describe, expect, it } from "vitest";
import { resolvePendingFeaturedActivity } from "@/components/game/calendar/pendingFocus";
import type { Activity } from "@/engine/core/types";

describe("calendar pending focus", () => {
  it("requires an exact type and target match for dashboard planner focus", () => {
    const activities: Activity[] = [
      {
        type: "trainingVisit",
        slots: 1,
        targetId: "player-1",
        description: "Visit training",
      },
      {
        type: "followUpSession",
        slots: 1,
        targetId: "player-1",
        description: "Follow up on the player",
      },
    ];

    expect(resolvePendingFeaturedActivity(activities, {
      type: "followUpSession",
      targetId: "player-1",
      label: "Review planner",
    })?.type).toBe("followUpSession");

    expect(resolvePendingFeaturedActivity(activities, {
      type: "networkMeeting",
      targetId: "player-1",
      label: "Review planner",
    })).toBeNull();
  });
});
