import { expect, it } from "vitest";
import { compactMatchFormEntry, expandMatchFormEntry, matchFormRating } from "@/engine/players/matchFormArchive";
import { computeFormFromRatings } from "@/engine/match/ratings";

it("preserves exact fixture, date and rating across compact JSON and mixed old/new entries", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({ fixtureId: `custom-fixture-${index}`,
    season: index < 2 ? 1 : 2, week: index + 1, rating: 5.3 + index * 0.5 }));
  const compact = JSON.parse(JSON.stringify(entries.map(compactMatchFormEntry)));
  expect(compact.map(expandMatchFormEntry)).toEqual(entries);
  expect(compact.map(matchFormRating)).toEqual(entries.map(e => e.rating));
  expect(computeFormFromRatings(compact)).toBe(computeFormFromRatings(entries));
  expect(computeFormFromRatings([...compact.slice(0, 3), ...entries.slice(3)])).toBe(computeFormFromRatings(entries));
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(entries).length);
});

it("preserves custom extension fields and does not alter compact rows twice", () => {
  const custom = { fixtureId: "f", week: 1, season: 1, rating: 7, provider: "custom" };
  expect(compactMatchFormEntry(custom)).toBe(custom);
  const compact = compactMatchFormEntry({ fixtureId: "f", week: 1, season: 1, rating: 7 });
  expect(compactMatchFormEntry(compact)).toBe(compact);
});
