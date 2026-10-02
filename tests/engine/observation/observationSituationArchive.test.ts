// Destination: tests/engine/observation/observationSituationArchive.test.ts.
// Pre-implementation leaf ownership/descriptor contracts; all fixtures are synthetic.
import { describe, expect, it } from "vitest";
import { compactObservationSituationSnapshot as compact, expandObservationSituationSnapshot as expand,
  InvalidObservationSituationArchiveError } from "@/engine/observation/situationArchive";
import { ALL_MASK, OPTIONAL_CASES, REQUIRED_MASK, TAG, jsonBound, jsonBytes, optionalWire,
  snapshot, wire } from "./observationSituationArchiveFixtures";

const record = (value: unknown) => value as Record<string, unknown>;
function assertRefusal(value: unknown) {
  expect(() => expand(value)).toThrow(InvalidObservationSituationArchiveError);
  expect(() => compact(value)).toThrow(InvalidObservationSituationArchiveError);
}

describe("complete observation situation archive", () => {
  it("matches an independently hand-authored required wire, full facts and idempotence", () => {
    const raw = snapshot(); const before = structuredClone(raw); const expected = wire();
    const packed = compact(raw);
    expect(packed).toStrictEqual(expected);
    expect(jsonBytes(packed)).toBeLessThan(jsonBytes(raw));
    expect(expand(jsonBound(expected))).toStrictEqual(raw);
    expect(expand(structuredClone(expected))).toStrictEqual(raw);
    expect(compact(packed)).toBe(packed);
    const restored = expand(expected); expect(expand(restored)).toBe(restored);
    expect(compact(jsonBound(expected))).toStrictEqual(expected);
    expect(raw).toStrictEqual(before);
    expect(Object.keys(record(expand(expected)))).not.toContain(TAG);
  });

  it("carries all twenty-four fields in an independent full wire", () => {
    const input = { ...snapshot(), observationContext: "schoolMatch", countryId: "england",
      travelPosture: "embedded", weather: "rain|é", culturalCalendarWindowIds: ["window:2", "window:1", "window:2"] };
    const expected = { observationSituationV1: [1, ALL_MASK, 0,
      1, "situation|💡:é", "schoolMatch", "schoolMatch", "school", "england", "embedded",
      "school", "selection", "unstructured", "rain|é", 0.55, 0.2, ["event:2", "event:1", "event:2"],
      { technical: 1.2, physical: 1, mental: 0.95, tactical: 1, hidden: 1 },
      { passing: 0.55, firstTouch: 1.25 }, 1.25, 0.17, "school|selection:unstructured:é",
      ["culture:2", "culture:2", "culture:1"], ["window:2", "window:1", "window:2"],
      ["school", "selection", "school"], ["warning:é", "warning:é"],
      ["Complete authored reason | 💡", "Complete authored reason | 💡", "Another reason"]] };
    expect(compact(input)).toStrictEqual(expected);
    expect(expand(jsonBound(expected))).toStrictEqual(input);
    expect(expand(structuredClone(expected))).toStrictEqual(input);
    const owned = { ...input, observationContext: undefined, weather: undefined };
    const ownedWire = structuredClone(expected); ownedWire.observationSituationV1[2] = 1_032;
    ownedWire.observationSituationV1.splice(13, 1); ownedWire.observationSituationV1.splice(6, 1);
    expect(compact(owned)).toStrictEqual(ownedWire);
    expect(expand(jsonBound(ownedWire))).toStrictEqual(owned);
  });

  it.each(OPTIONAL_CASES)("distinguishes omitted, owned undefined, null and full $field values", item => {
    const raw = snapshot(); expect(Object.hasOwn(raw, item.field)).toBe(false);
    expect(Object.hasOwn(record(expand(jsonBound(wire()))), item.field)).toBe(false);
    for (const value of [undefined, null, item.value]) {
      const authored = { ...raw, [item.field]: value };
      const expected = optionalWire(item, value);
      expect(compact(authored)).toStrictEqual(expected);
      for (const persisted of [jsonBound(expected), structuredClone(expected)]) {
        const restored = record(expand(persisted));
        expect(restored).toStrictEqual(authored);
        expect(Object.getOwnPropertyDescriptor(restored, item.field)).toStrictEqual({
          value, enumerable: true, configurable: true, writable: true,
        });
      }
      expect(Object.hasOwn(authored, item.field)).toBe(true);
    }
  });

  it("preserves all numeric map keys, complete Unicode strings and duplicate ordered arrays", () => {
    const input = { ...snapshot(), signalByDomain: Object.fromEntries([
      ["technical", 1.2], ["__proto__", 0.55], ["constructor", 1.25], ["unmodeled|é", 1.1],
    ]), signalByAttribute: { passing: 0.55, firstTouch: 1.25, customFutureSignal: 1.45 },
      culturalCalendarWindowIds: ["window|💡", "window|💡", "window:1"] };
    const packed = compact(input);
    expect(Object.hasOwn(record(packed), TAG)).toBe(true);
    expect(expand(jsonBound(packed))).toStrictEqual(input);
    expect(expand(structuredClone(packed))).toStrictEqual(input);
    expect(jsonBytes(packed)).toBeLessThan(jsonBytes(input));
  });

  it("admits no non-smaller tuple and does not mutate even reordered ordinary fields", () => {
    for (const input of [snapshot(), { ...snapshot(), id: "", reasons: [], contextTags: [],
      biasWarnings: [], culturalInsightIds: [], atmosphereEventIds: [], signalByDomain: {}, signalByAttribute: {} },
      Object.fromEntries(Object.entries(snapshot()).reverse())]) {
      const before = Object.getOwnPropertyDescriptors(input); const out = compact(input);
      if (out !== input) expect(jsonBytes(out)).toBeLessThan(jsonBytes(input));
      expect(expand(out)).toStrictEqual(input);
      expect(Object.getOwnPropertyDescriptors(input)).toStrictEqual(before);
    }
  });

  it("keeps unknown, unsupported and exotic authored snapshots exactly", () => {
    class Custom { constructor() { Object.assign(this, snapshot()); } }
    class CustomArray extends Array<string> {}
    const symbol = { ...snapshot(), [Symbol("author-fact")]: 1 };
    const named = Object.assign(["reason"], { authored: "retain" });
    const hidden = { ...snapshot() }; Object.defineProperty(hidden, "authorFact", { value: 1 });
    const locked = { ...snapshot() }; Object.defineProperty(locked, "weather", { value: "rain", enumerable: true });
    const lengthLocked = ["reason"]; Object.defineProperty(lengthLocked, "length", { writable: false });
    const nestedSymbol = { technical: 1, [Symbol("author-fact")]: 2 };
    let reads = 0; const getter = { ...snapshot() };
    Object.defineProperty(getter, "weather", { enumerable: true, configurable: true, get() { reads++; return "rain"; } });
    const nestedGetter = {}; Object.defineProperty(nestedGetter, "technical", {
      enumerable: true, configurable: true, get() { reads++; return 1; },
    });
    const candidates: unknown[] = [
      { ...snapshot(), authoredExtension: { retain: true } }, { ...snapshot(), version: 2 },
      { ...snapshot(), observationSituationV1: [99] }, symbol, hidden, locked, getter,
      Object.assign(Object.create(null), snapshot()), new Custom(),
      { ...snapshot(), reasons: Array(2) }, { ...snapshot(), reasons: named },
      { ...snapshot(), reasons: lengthLocked }, { ...snapshot(), reasons: new CustomArray("reason") },
      { ...snapshot(), signalByDomain: nestedGetter }, { ...snapshot(), signalByDomain: nestedSymbol },
      { ...snapshot(), signalByDomain: Object.assign(Object.create(null), { technical: 1 }) },
      { ...snapshot(), signalByAttribute: { passing: undefined } },
      { ...snapshot(), signalByDomain: { technical: Infinity } },
      ...[NaN, Infinity, -Infinity, -0, undefined, null, "bad"].map(chaosLevel => ({ ...snapshot(), chaosLevel })),
    ];
    for (const input of candidates) {
      const before = Object.getOwnPropertyDescriptors(input);
      expect(compact(input)).toBe(input); expect(expand(input)).toBe(input);
      expect(Object.getOwnPropertyDescriptors(input)).toStrictEqual(before);
    }
    expect(reads).toBe(0);
  });

  it.each([
    ["future version", (a: unknown[]) => { a[0] = 2; }],
    ["negative mask", (a: unknown[]) => { a[1] = -1; }],
    ["fractional mask", (a: unknown[]) => { a[1] = 1.5; }],
    ["high mask", (a: unknown[]) => { a[1] = 16_777_216; }],
    ["nonfinite mask", (a: unknown[]) => { a[1] = Infinity; }],
    ["undefined not present", (a: unknown[]) => { a[2] = 8; }],
    ["negative undefined", (a: unknown[]) => { a[2] = -1; }],
    ["fractional undefined", (a: unknown[]) => { a[2] = 0.5; }],
    ["high undefined", (a: unknown[]) => { a[2] = 16_777_216; }],
    ["required undefined", (a: unknown[]) => { a[2] = 1; a.splice(3, 1); }],
    ["missing required", (a: unknown[]) => { a[1] = REQUIRED_MASK - 1; a.splice(3, 1); }],
    ["missing value", (a: unknown[]) => { a.pop(); }],
    ["extra value", (a: unknown[]) => { a.push("discarded fact"); }],
    ["unsupported logical version", (a: unknown[]) => { a[3] = 2; }],
    ["wrong required number", (a: unknown[]) => { a[10] = "0.55"; }],
  ] as const)("refuses recognized %s without changing input", (_label, mutate) => {
    const input = wire(); mutate(input.observationSituationV1);
    const before = Object.getOwnPropertyDescriptors(input.observationSituationV1);
    assertRefusal(input); expect(Object.getOwnPropertyDescriptors(input.observationSituationV1)).toStrictEqual(before);
  });

  it("refuses recognized envelope/tuple/nested descriptors before invoking getters", () => {
    let reads = 0;
    const makeGetter = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, {
      enumerable: true, configurable: true, get() { reads++; return value; },
    });
    const tagGetter = wire(); makeGetter(tagGetter, TAG, tagGetter.observationSituationV1);
    const maskGetter = wire(); makeGetter(maskGetter.observationSituationV1, "1", REQUIRED_MASK);
    const valueGetter = wire(); makeGetter(valueGetter.observationSituationV1, "4", "situation");
    const nestedGetter = wire(); makeGetter(nestedGetter.observationSituationV1[13] as object, "technical", 1.2);
    const hidden = wire(); Object.defineProperty(hidden, "hidden", { value: "retain" });
    const symbol = wire(); Object.defineProperty(symbol, Symbol("retain"), { value: "retain", enumerable: true });
    const extra = { ...wire(), custom: "retain" };
    const tagLocked = wire(); Object.defineProperty(tagLocked, TAG, { writable: false });
    const tagHidden = wire(); Object.defineProperty(tagHidden, TAG, { enumerable: false });
    const lengthLocked = wire(); Object.defineProperty(lengthLocked.observationSituationV1, "length", { writable: false });
    const sparse = wire(); delete sparse.observationSituationV1[4];
    const named = wire(); Object.defineProperty(named.observationSituationV1, "authorFact", { value: 1, enumerable: true });
    const nestedNamed = wire(); Object.defineProperty(nestedNamed.observationSituationV1[12] as object, "authorFact", { value: 1, enumerable: true });
    const nestedLocked = wire(); Object.defineProperty(nestedLocked.observationSituationV1[13] as object, "technical", { writable: false });
    for (const input of [tagGetter, maskGetter, valueGetter, nestedGetter, hidden, symbol, extra,
      tagLocked, tagHidden, lengthLocked, sparse, named, nestedNamed, nestedLocked]) assertRefusal(input);
    expect(reads).toBe(0);
  });
});
