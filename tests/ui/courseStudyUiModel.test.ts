import { describe, expect, it } from "vitest";

import {
  COURSE_CATALOG,
  getCoursePlannerStatusModel,
} from "@/engine/career/courses";

const businessFundamentals = COURSE_CATALOG.find((course) => course.id === "business_fundamentals");

describe("course study UI models", () => {
  it("shows planner-required training guidance when no study is scheduled", () => {
    if (!businessFundamentals) {
      throw new Error("business_fundamentals course missing from catalog");
    }

    const activeEnrollment = {
      courseId: businessFundamentals.id,
      startWeek: 10,
      startSeason: 1,
      completionWeek: 13,
      completionSeason: 1,
      studyWeeksCompleted: 0,
      requiredStudyWeeks: 4,
    };

    expect(getCoursePlannerStatusModel({
      activeEnrollment,
      courseDurationWeeks: businessFundamentals.durationWeeks,
      currentWeek: 10,
      currentSeason: 1,
      scheduledStudySessions: 0,
      seasonLength: 38,
    })).toMatchObject({
      progressLabel: "0/4 study weeks banked",
      paceLabel: "No study booked",
      studyWeeksPlanned: 0,
      workloadLabel: "0 planner slots reserved for study",
      projectedCompletionLabel: "No study booked. Finish slips to Season 1, Week 14",
      guidance: "Open Planner and schedule at least one Study session this week or this course will not advance.",
    });

  });

  it("shows scheduled study in training and career summaries", () => {
    if (!businessFundamentals) {
      throw new Error("business_fundamentals course missing from catalog");
    }

    const activeEnrollment = {
      courseId: businessFundamentals.id,
      startWeek: 10,
      startSeason: 1,
      completionWeek: 13,
      completionSeason: 1,
      studyWeeksCompleted: 1,
      requiredStudyWeeks: 4,
    };

    expect(getCoursePlannerStatusModel({
      activeEnrollment,
      courseDurationWeeks: businessFundamentals.durationWeeks,
      currentWeek: 11,
      currentSeason: 1,
      scheduledStudySessions: 2,
      seasonLength: 38,
    })).toMatchObject({
      progressLabel: "1/4 study weeks banked",
      paceLabel: "Intensive pace",
      studyWeeksPlanned: 2,
      workloadLabel: "2 planner slots and 6 fatigue routed through weekly study activities",
      projectedCompletionLabel: "Projected finish Season 1, Week 12",
      guidance: "Planner ready. Close the week with 2 scheduled Study sessions to bank 2 study weeks. This intensive pace costs extra planner capacity and fatigue through the existing weekly study activities.",
    });

  });
});
