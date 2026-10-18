import { expect, it } from "vitest";
import { compactMatchFormEntry, expandMatchFormEntry, matchFormRating } from "@/engine/players/matchFormArchive";
import { computeFormFromRatings } from "@/engine/match/ratings";
import type { MatchFormEntry } from "@/engine/core/types/player";

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

it("stores canonical scheduled fixture references without repeating their exact row date", () => {
  const entries = [
    { fixtureId: "fixture-england-premier-s19-w04-0038", week: 4, season: 19, rating: 7.123456789012345 },
    { fixtureId: "fixture-regional-s9-w02-0001-league-s100-w105-15432", week: 105, season: 100, rating: 6.8 },
    { fixtureId: "fixture-england-premier-s0-w00-0000", week: 0, season: 0, rating: 5.75 },
  ];
  const compacted = entries.map(compactMatchFormEntry);
  expect(compacted).toEqual([
    [["england-premier", 38], 4, 19, 7.123456789012345],
    [["regional-s9-w02-0001-league", 15432], 105, 100, 6.8],
    [["england-premier", 0], 0, 0, 5.75],
  ]);
  const restored = JSON.parse(JSON.stringify(compacted)) as MatchFormEntry[];
  expect(restored.map(expandMatchFormEntry)).toEqual(entries);
  expect(restored.map(matchFormRating)).toEqual(entries.map(entry => entry.rating));
});

it("reads persisted nested references by backfilling the fixture ID from its row date", () => {
  const persisted = JSON.parse('[[["england-premier",38],4,19,7.123456789012345]]') as MatchFormEntry[];
  expect(persisted.map(expandMatchFormEntry)).toEqual([
    { fixtureId: "fixture-england-premier-s19-w04-0038", week: 4, season: 19, rating: 7.123456789012345 },
  ]);
  expect(matchFormRating(persisted[0])).toBe(7.123456789012345);
});

it("keeps custom, abstract, mismatched and noncanonical IDs exactly as supplied", () => {
  const entries = [
    { fixtureId: "custom-fixture-38", week: 4, season: 19, rating: 7.2 },
    { fixtureId: "abstract-england-premier-s19-w4-home-club-away-club", week: 4, season: 19, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s19-w04-0038", week: 5, season: 19, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s19-w04-0038", week: 4, season: 20, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s19-w4-0038", week: 4, season: 19, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s019-w04-0038", week: 4, season: 19, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s19-w04-000038", week: 4, season: 19, rating: 7.2 },
    { fixtureId: "fixture-england-premier-s19-w04-9007199254740993", week: 4, season: 19, rating: 7.2 },
  ];
  for (const entry of entries) {
    const compacted = compactMatchFormEntry(entry);
    expect(compacted).toEqual([entry.fixtureId, entry.week, entry.season, entry.rating]);
    expect(expandMatchFormEntry(JSON.parse(JSON.stringify(compacted)) as MatchFormEntry)).toEqual(entry);
  }
  const custom = { ...entries[2], provider: "custom", metadata: { originalWeek: 4 } };
  expect(compactMatchFormEntry(custom)).toBe(custom);
});

it("upgrades existing string tuples once and preserves exact mixed-row form calculations", () => {
  const old: MatchFormEntry = ["fixture-england-premier-s19-w04-0038", 4, 19, 7.123456789012345];
  const compacted = compactMatchFormEntry(old);
  expect(compacted).toEqual([["england-premier", 38], 4, 19, 7.123456789012345]);
  expect(compacted).not.toBe(old);
  expect(compactMatchFormEntry(compacted)).toBe(compacted);
  const oldCustom: MatchFormEntry = ["custom-fixture", 3, 19, 6.23456789012345];
  expect(compactMatchFormEntry(oldCustom)).toBe(oldCustom);
  const expanded = [
    expandMatchFormEntry(oldCustom),
    { fixtureId: "fixture-england-premier-s18-w46-0552", week: 46, season: 18, rating: 8.23456789012345 },
    expandMatchFormEntry(old),
    { fixtureId: "fixture-england-premier-s19-w06-0050", week: 6, season: 19, rating: 4.123456789012345 },
    { fixtureId: "fixture-england-premier-s19-w05-0044", week: 5, season: 19, rating: 7.98765432109876 },
    { fixtureId: "custom-fixture-later", week: 7, season: 19, rating: 5.76543210987654 },
  ];
  const mixed: MatchFormEntry[] = [oldCustom, compactMatchFormEntry(expanded[1]), compacted, expanded[3], compactMatchFormEntry(expanded[4]), expanded[5]];
  const restored = JSON.parse(JSON.stringify(mixed)) as MatchFormEntry[];
  expect(restored.map(expandMatchFormEntry)).toEqual(expanded);
  expect(restored.map(matchFormRating)).toEqual(expanded.map(entry => entry.rating));
  expect(computeFormFromRatings(restored)).toBe(computeFormFromRatings(expanded));
});

it("reduces a cohort of existing scheduled form tuples without discarding a match or changing precision", () => {
  const oldRows: MatchFormEntry[] = Array.from({ length: 512 * 6 }, (_, index): MatchFormEntry => [
    `fixture-england-premier-s19-w${String(40 + index % 6).padStart(2, "0")}-${String(index + 1).padStart(4, "0")}`,
    40 + index % 6, 19, 7.123456789012345,
  ]);
  const compacted = oldRows.map(compactMatchFormEntry);
  const savedBytes = new TextEncoder().encode(JSON.stringify(oldRows)).byteLength
    - new TextEncoder().encode(JSON.stringify(compacted)).byteLength;
  expect(savedBytes).toBeGreaterThanOrEqual(oldRows.length * 12);
  const restored = JSON.parse(JSON.stringify(compacted)) as MatchFormEntry[];
  expect(restored).toHaveLength(oldRows.length);
  expect(restored.map(expandMatchFormEntry)).toEqual(oldRows.map(expandMatchFormEntry));
  for (const row of compacted) expect(compactMatchFormEntry(row)).toBe(row);
});
const LEGACY_FORM_FIELDS = ["fixtureId", "week", "season", "rating"] as const;
const COMPLETE_LEGACY_FORM = {
  fixtureId: "fixture-england-premier-s19-w04-0038", week: 4, season: 19, rating: 7.123456789012345,
};

function legacyForm(value: Record<string, unknown>): MatchFormEntry {
  // Imported legacy/mod data passes the root save validator before deep codecs.
  return value as unknown as MatchFormEntry;
}

function persistedForm(value: MatchFormEntry): MatchFormEntry {
  return JSON.parse(JSON.stringify(value)) as MatchFormEntry;
}

it.each(LEGACY_FORM_FIELDS)("keeps an object with missing %s instead of introducing a null tuple slot", (field) => {
  const row: Record<string, unknown> = { ...COMPLETE_LEGACY_FORM };
  delete row[field];
  const original = JSON.stringify(row);
  const compacted = compactMatchFormEntry(legacyForm(row));
  expect(compacted).toBe(row);
  expect(expandMatchFormEntry(persistedForm(compacted))).toEqual(JSON.parse(original));
  expect(Object.hasOwn(expandMatchFormEntry(persistedForm(compacted)), field)).toBe(false);
  expect(JSON.stringify(row)).toBe(original);
});

it.each(LEGACY_FORM_FIELDS)("keeps explicit undefined %s in object form with existing JSON omission semantics", (field) => {
  const row = { ...COMPLETE_LEGACY_FORM, [field]: undefined };
  const compacted = compactMatchFormEntry(legacyForm(row));
  expect(compacted).toBe(row);
  expect(expandMatchFormEntry(persistedForm(compacted))).toEqual(JSON.parse(JSON.stringify(row)));
  expect(Object.hasOwn(expandMatchFormEntry(persistedForm(compacted)), field)).toBe(false);
});

it.each(LEGACY_FORM_FIELDS)("preserves explicit null %s as a legacy object fact", (field) => {
  const row = { ...COMPLETE_LEGACY_FORM, [field]: null };
  const compacted = compactMatchFormEntry(legacyForm(row));
  expect(compacted).toBe(row);
  const expanded = expandMatchFormEntry(persistedForm(compacted));
  expect(expanded).toEqual(row);
  expect(Object.hasOwn(expanded, field)).toBe(true);
});

it.each([
  ["fixtureId", 42], ["week", "4"], ["season", "19"], ["rating", "7.25"],
  ["week", Number.NaN], ["season", Number.POSITIVE_INFINITY], ["rating", Number.NEGATIVE_INFINITY],
] as const)("does not reinterpret invalid legacy %s values as a recognized compact row", (field, value) => {
  const row = { ...COMPLETE_LEGACY_FORM, [field]: value };
  const compacted = compactMatchFormEntry(legacyForm(row));
  expect(compacted).toBe(row);
  expect(expandMatchFormEntry(persistedForm(compacted))).toEqual(JSON.parse(JSON.stringify(row)));
});

it("retains zero facts and exact precision while leaving existing null/extra-column tuples unchanged", () => {
  const zero = { fixtureId: "fixture-england-premier-s0-w00-0000", week: 0, season: 0, rating: 0 };
  expect(expandMatchFormEntry(persistedForm(compactMatchFormEntry(zero)))).toEqual(zero);
  const legacyNull = ["custom-fixture", 4, 19, null] as unknown as MatchFormEntry;
  const legacyExtra = ["fixture-england-premier-s19-w04-0038", 4, 19, 7.123456789012345, { provider: "legacy" }] as unknown as MatchFormEntry;
  for (const row of [legacyNull, legacyExtra]) {
    expect(compactMatchFormEntry(row)).toBe(row);
    expect(JSON.stringify(compactMatchFormEntry(row))).toBe(JSON.stringify(row));
  }
});
