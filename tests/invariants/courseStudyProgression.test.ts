import { describe, expect, it } from "vitest";

import {
  enrollInCourse,
  getCourseStudyProgress,
  getCourseStudyWeeksPlanned,
  processWeeklyCourseProgress,
} from "@/engine/career/courses";
import type { FinancialRecord } from "@/engine/core/types";

function finances(balance = 10_000): FinancialRecord {
  return {
    balance,
    completedCourses: [],
    transactions: [],
  } as unknown as FinancialRecord;
}

describe("course study progression", () => {
  it("requires scheduled study to bank a course week", () => {
    const enrolled = enrollInCourse(
      finances(),
      "business_fundamentals",
      10,
      1,
      2,
      38,
    );
    expect(enrolled.success).toBe(true);
    if (!enrolled.success) return;

    const initialProgress = getCourseStudyProgress(
      enrolled.finances.activeEnrollment,
      { courseDurationWeeks: 4 },
    );
    expect(initialProgress).toMatchObject({
      studyWeeksCompleted: 0,
      requiredStudyWeeks: 4,
      remainingStudyWeeks: 4,
    });
    expect(enrolled.finances.activeEnrollment).toMatchObject({
      completionSeason: 1,
      completionWeek: 13,
    });

    const withoutStudy = processWeeklyCourseProgress(
      enrolled.finances,
      10,
      1,
      38,
      0,
    );
    expect(getCourseStudyProgress(
      withoutStudy.activeEnrollment,
      { courseDurationWeeks: 4 },
    )).toMatchObject({
      studyWeeksCompleted: 0,
      requiredStudyWeeks: 4,
    });
    expect(withoutStudy.activeEnrollment).toMatchObject({
      completionSeason: 1,
      completionWeek: 14,
    });

    const withStudy = processWeeklyCourseProgress(
      enrolled.finances,
      10,
      1,
      38,
      1,
    );
    expect(getCourseStudyProgress(
      withStudy.activeEnrollment,
      { courseDurationWeeks: 4 },
    )).toMatchObject({
      studyWeeksCompleted: 1,
      requiredStudyWeeks: 4,
      remainingStudyWeeks: 3,
    });
    expect(withStudy.activeEnrollment).toMatchObject({
      completionSeason: 1,
      completionWeek: 13,
    });
  });

  it("lets 2 or more study sessions accelerate by one extra bounded study week", () => {
    expect(getCourseStudyWeeksPlanned(0, 4)).toBe(0);
    expect(getCourseStudyWeeksPlanned(1, 4)).toBe(1);
    expect(getCourseStudyWeeksPlanned(2, 4)).toBe(2);
    expect(getCourseStudyWeeksPlanned(3, 4)).toBe(2);
    expect(getCourseStudyWeeksPlanned(3, 1)).toBe(1);

    const enrolled = enrollInCourse(
      finances(),
      "business_fundamentals",
      10,
      1,
      2,
      38,
    );
    expect(enrolled.success).toBe(true);
    if (!enrolled.success) return;

    const accelerated = processWeeklyCourseProgress(
      enrolled.finances,
      10,
      1,
      38,
      2,
    );
    expect(getCourseStudyProgress(
      accelerated.activeEnrollment,
      { courseDurationWeeks: 4 },
    )).toMatchObject({
      studyWeeksCompleted: 2,
      requiredStudyWeeks: 4,
      remainingStudyWeeks: 2,
    });
    expect(accelerated.activeEnrollment).toMatchObject({
      completionSeason: 1,
      completionWeek: 12,
    });

    const nearlyDone = {
      ...accelerated,
      activeEnrollment: {
        ...accelerated.activeEnrollment!,
        studyWeeksCompleted: 3,
        requiredStudyWeeks: 4,
        completionWeek: 11,
        completionSeason: 1,
      },
    };
    const bounded = processWeeklyCourseProgress(
      nearlyDone,
      11,
      1,
      38,
      3,
    );
    expect(bounded.activeEnrollment).toBeUndefined();
    expect(bounded.completedCourses).toContain("business_fundamentals");
  });

  it("completes only after the required study weeks across season rollover", () => {
    const enrolled = enrollInCourse(
      finances(),
      "business_fundamentals",
      37,
      1,
      2,
      38,
    );
    expect(enrolled.success).toBe(true);
    if (!enrolled.success) return;

    const afterWeek37 = processWeeklyCourseProgress(
      enrolled.finances,
      37,
      1,
      38,
      1,
    );
    const afterWeek38 = processWeeklyCourseProgress(
      afterWeek37,
      38,
      1,
      38,
      1,
    );
    const afterSeason2Week1 = processWeeklyCourseProgress(
      afterWeek38,
      1,
      2,
      38,
      1,
    );

    expect(afterSeason2Week1.activeEnrollment).toBeDefined();
    expect(getCourseStudyProgress(
      afterSeason2Week1.activeEnrollment,
      { courseDurationWeeks: 4 },
    )?.studyWeeksCompleted).toBe(3);

    const completed = processWeeklyCourseProgress(
      afterSeason2Week1,
      2,
      2,
      38,
      1,
    );
    expect(completed.activeEnrollment).toBeUndefined();
    expect(completed.completedCourses).toContain("business_fundamentals");
  });
});
