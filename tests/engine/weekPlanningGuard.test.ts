import { expect, test } from "vitest";

import type { Activity } from "@/engine/core/types";
import { countOpenScheduleDays, createWeekSchedule } from "@/engine/core/calendar";

test("countOpenScheduleDays reflects the remaining open planner days", () => {
  const schedule = createWeekSchedule(1, 1);
  expect(countOpenScheduleDays(schedule)).toBe(7);

  schedule.activities[0] = {
    type: "schoolMatch",
    slots: 1,
    description: "School match look",
  } as Activity;
  schedule.activities[1] = {
    type: "rest",
    slots: 1,
    description: "Recovery",
  } as Activity;

  expect(countOpenScheduleDays(schedule)).toBe(5);
});

test("countOpenScheduleDays tolerates missing schedules during rehydration", () => {
  expect(countOpenScheduleDays(undefined)).toBe(7);
  expect(countOpenScheduleDays(null)).toBe(7);
  const rehydratingSchedule = createWeekSchedule(1, 1);
  rehydratingSchedule.activities = [];
  expect(countOpenScheduleDays(rehydratingSchedule)).toBe(7);
});
