import { describe, expect, it } from "vitest";
import { compactSeasonRating, expandSeasonRating } from "@/engine/players/seasonRatingArchive";

describe("season rating archive", () => {
  it("preserves all career statistics and numeric precision through a mixed-format JSON save", () => {
    const records = Array.from({ length: 30 }, (_, index) => ({ season: index + 1,
      avgRating: 6.123456789 + index / 100, appearances: 30 + index, goals: index,
      assists: index + 2, cleanSheets: index % 6 }));
    const encoded = records.map((record, index) => index % 2 ? compactSeasonRating(record) : record);
    expect(JSON.parse(JSON.stringify(encoded)).map(expandSeasonRating)).toEqual(records);
    expect(JSON.stringify(records.map(compactSeasonRating)).length).toBeLessThan(JSON.stringify(records).length / 2);
    const compact = compactSeasonRating(records[0]);
    expect(compactSeasonRating(compact)).toBe(compact);
  });

  it("preserves custom fields instead of dropping mod history", () => {
    const record = { season: 1, avgRating: 7, appearances: 20, goals: 4, assists: 6, cleanSheets: 0,
      clubBreakdown: { academy: 8, senior: 12 } };
    expect(compactSeasonRating(record)).toBe(record);
    expect(expandSeasonRating(compactSeasonRating(record))).toEqual(record);
  });
});
