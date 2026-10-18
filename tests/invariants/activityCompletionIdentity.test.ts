import { expect, it } from "vitest";
import type { Activity } from "@/engine/core/types";
import { findScheduledInteractiveActivity, getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";

it("keeps daily visit identities distinct while resolving their shared booking guidance", () => {
  const booking = { type: "schoolMatch", instanceId: "school-visit:d3", slots: 2, description: "Two-day visit" } as Activity;
  const activities = [booking, booking];
  const first = getInteractiveActivityCompletionKey(booking, 0);
  const second = getInteractiveActivityCompletionKey(booking, 1);
  expect(first).not.toBe(second);
  expect(findScheduledInteractiveActivity(activities, first)).toBe(booking);
  expect(findScheduledInteractiveActivity(activities, second)).toBe(booking);
  expect(findScheduledInteractiveActivity(activities, booking.instanceId)).toBe(booking);
  expect(findScheduledInteractiveActivity(activities, "school-visit:d3:d2")).toBeUndefined();
  expect(findScheduledInteractiveActivity(activities, undefined)).toBeUndefined();
});
