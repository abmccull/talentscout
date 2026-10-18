import { describe, expect, it } from "vitest";
import { getBookableYouthEvidenceContexts, resolvePendingFeaturedActivity } from "@/components/game/calendar/pendingFocus";
import type { Activity } from "@/engine/core/types";

describe("calendar pending focus", () => {
  it("recommends only current activities that can actually reach the named prospect", () => {
    const activities: Activity[] = [
      { type: "academyTrialDay", slots: 1, targetId: "other-player", description: "Other trial" },
      { type: "schoolMatch", slots: 2, description: "Generic venue discovery" },
      { type: "followUpSession", slots: 1, description: "Follow up", targetPool: [
        { id: "player-6", name: "Sixth prospect" },
      ] },
      { type: "trainingVisit", slots: 2, targetId: "player-6", description: "Targeted training" },
    ];
    expect(getBookableYouthEvidenceContexts(activities, "player-6")).toEqual([
      { context: "followUpSession", activityType: "followUpSession" },
      { context: "trainingGround", activityType: "trainingVisit" },
    ]);
    expect(getBookableYouthEvidenceContexts([], "player-6")).toEqual([]);
  });
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
