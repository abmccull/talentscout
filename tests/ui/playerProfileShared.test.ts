import { describe, expect, it } from "vitest";
import {
  compareSeasonWeekDesc,
  formatMarketValue,
  getFormDisplay,
  isQualitativeIntelMessage,
} from "@/components/game/player-profile/playerProfileFormatting";

describe("playerProfileShared", () => {
  it("clamps form displays to the supported range", () => {
    expect(getFormDisplay(8).label).toBe("Exceptional Form");
    expect(getFormDisplay(-9).label).toBe("Terrible Form");
  });

  it("formats market values with the expected scouting shorthand", () => {
    expect(formatMarketValue(999)).toBe("\u00A3999");
    expect(formatMarketValue(24_000)).toBe("\u00A324K");
    expect(formatMarketValue(1_250_000)).toBe("\u00A31.3M");
  });

  it("identifies qualitative intel by title or body keywords", () => {
    expect(
      isQualitativeIntelMessage({
        id: "msg-1",
        type: "note",
        title: "Network intel: family situation",
        body: "Coach says the player handles pressure well.",
        season: 1,
        week: 2,
      } as never),
    ).toBe(true);
    expect(
      isQualitativeIntelMessage({
        id: "msg-2",
        type: "note",
        title: "Fixture update",
        body: "Kickoff moved to Sunday.",
        season: 1,
        week: 2,
      } as never),
    ).toBe(false);
  });

  it("sorts newer season-week pairs first", () => {
    const rows = [
      { season: 2, week: 1 },
      { season: 1, week: 30 },
      { season: 2, week: 4 },
    ];
    rows.sort(compareSeasonWeekDesc);
    expect(rows).toEqual([
      { season: 2, week: 4 },
      { season: 2, week: 1 },
      { season: 1, week: 30 },
    ]);
  });
});
