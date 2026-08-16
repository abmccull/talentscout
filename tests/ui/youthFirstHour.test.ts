import { describe, expect, it } from "vitest";
import {
  isYouthFirstHour,
  isYouthOpeningWeek,
  shouldHoldAchievementToasts,
  shouldShowYouthInbox,
  shouldShowYouthWorldCareer,
} from "@/lib/youthFirstHour";
import { cycleDialogTab, isElementVisible } from "@/lib/a11y/dialogFocus";

describe("youth first-hour rail", () => {
  it("stays first-hour until a day is booked or the week moves", () => {
    expect(isYouthFirstHour({
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
      reports: {},
    })).toBe(true);
    expect(isYouthFirstHour({
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
      reports: { r1: {} },
    })).toBe(true);
    expect(isYouthFirstHour({
      currentWeek: 1,
      currentSeason: 1,
      reports: {},
    })).toBe(false);
    expect(isYouthFirstHour({
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
      reports: { r1: {} },
      schedule: { activities: [{ id: "school-match" }] },
    })).toBe(false);
    expect(isYouthOpeningWeek({ currentWeek: 1, currentSeason: 1 })).toBe(true);
    expect(isYouthOpeningWeek({ currentWeek: 2, currentSeason: 1 })).toBe(false);
  });

  it("hides inbox and holds achievement juice for the whole opening week", () => {
    const firstHour = {
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
      reports: { r1: {} },
    };
    const booked = {
      ...firstHour,
      schedule: { activities: [{ id: "school-match" }] },
    };

    expect(shouldShowYouthInbox(firstHour)).toBe(false);
    expect(shouldShowYouthInbox(booked)).toBe(false);
    expect(shouldHoldAchievementToasts("reportWriter", firstHour)).toBe(true);
    expect(shouldHoldAchievementToasts("dashboard", firstHour)).toBe(true);
    expect(shouldHoldAchievementToasts("observation", booked)).toBe(true);
    expect(shouldHoldAchievementToasts("dashboard", booked)).toBe(true);
    expect(shouldShowYouthInbox({
      currentWeek: 2,
      currentSeason: 1,
      openingCase: { id: "opening" },
      schedule: { activities: [{ id: "school-match" }] },
    })).toBe(true);
    expect(shouldHoldAchievementToasts("dashboard", {
      currentWeek: 2,
      currentSeason: 1,
      openingCase: { id: "opening" },
    })).toBe(false);
    expect(shouldHoldAchievementToasts("dashboard", {
      currentWeek: 3,
      currentSeason: 1,
      openingCase: { id: "opening" },
    })).toBe(false);
  });

  it("keeps week 1 on the four real rooms and opens World/Career after the opening week", () => {
    const week1 = {
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
    };
    const week2 = {
      currentWeek: 2,
      currentSeason: 1,
      openingCase: { id: "opening" },
    };
    expect(shouldShowYouthWorldCareer(week1)).toBe(false);
    expect(shouldShowYouthWorldCareer(week2)).toBe(true);
    expect(shouldShowYouthWorldCareer({
      currentWeek: 2,
      currentSeason: 2,
      openingCase: { id: "opening" },
    })).toBe(true);
  });
});

describe("dialog focus helpers", () => {
  it("does not swallow Tab when the dialog is not visible", () => {
    const hidden = {
      offsetParent: null,
      getClientRects: () => [],
    } as unknown as HTMLElement;
    const event = {
      key: "Tab",
      preventDefault: () => {
        throw new Error("Tab should not be trapped on a hidden dialog");
      },
    } as unknown as KeyboardEvent;

    expect(isElementVisible(hidden)).toBe(false);
    expect(() => cycleDialogTab(event, hidden)).not.toThrow();
  });
});
