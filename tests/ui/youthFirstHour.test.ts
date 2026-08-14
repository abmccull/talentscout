import { describe, expect, it } from "vitest";
import { isYouthFirstHour, isYouthOpeningWeek } from "@/lib/youthFirstHour";
import { cycleDialogTab, isElementVisible } from "@/lib/a11y/dialogFocus";

describe("youth first-hour rail", () => {
  it("is only the opening week before a report exists", () => {
    expect(isYouthFirstHour({
      currentWeek: 1,
      currentSeason: 1,
      openingCase: { id: "opening" },
      reports: {},
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
    })).toBe(false);
    expect(isYouthOpeningWeek({ currentWeek: 1, currentSeason: 1 })).toBe(true);
    expect(isYouthOpeningWeek({ currentWeek: 2, currentSeason: 1 })).toBe(false);
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
