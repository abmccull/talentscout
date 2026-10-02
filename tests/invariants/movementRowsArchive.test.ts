// Preceding regression proposal; not executed or applied to source.
import { describe, expect, it } from "vitest";
import type { PlayerMovementEvent } from "@/engine/core/types";
import type { StoredPlayerMovementSummary } from "@/engine/world/worldHistoryTypes";
import {
  compactPlayerMovementHistory, expandPlayerMovementHistory,
  compactPlayerMovementSummaries, expandPlayerMovementSummaries,
} from "@/engine/world/movementRowsArchive";

const textEncoder = new TextEncoder();
const charge = (value: unknown) => textEncoder.encode(JSON.stringify(value)).byteLength;
const optional = ["fromClubId", "toClubId", "contractClubId", "fee", "loanDealId", "reason", "financialSettlements"] as const;
const anchor = "player:Unicode-α:exact-long-anchor-00000000000000000000000000000000";
function row(index = 0): PlayerMovementEvent {
  return {
    id: `move:prefix:${anchor}:tail:${index}:${anchor}`, playerId: anchor,
    type: "permanentTransfer", week: 4.5, season: 2,
    fromClubId: "__proto__", toClubId: "constructor", contractClubId: "toString",
    fee: 0.125, loanDealId: `loan:${anchor}:exact`, reason: "Exact wording α\nfalse is a word",
    financialSettlements: [{ type: "sellOnClause", amount: 12.3456789012345,
      creditorClubId: "__proto__", obligationId: `obligation:${anchor}:stable`,
      custom: { falseFact: false, nullFact: null, duplicate: ["same", "same", 0] },
    } as NonNullable<PlayerMovementEvent["financialSettlements"]>[number]],
  };
}
const rawInput = (value: unknown) => value as Parameters<typeof compactPlayerMovementHistory>[0];
const rawStored = (value: unknown) => value as Parameters<typeof expandPlayerMovementHistory>[0];
const summariesInput = (value: unknown) => value as Parameters<typeof compactPlayerMovementSummaries>[0];
const summariesStored = (value: unknown) => value as Parameters<typeof expandPlayerMovementSummaries>[0];

describe("complete movement collection storage", () => {
  it("retains full nested facts, duplicate order, exact IDs and closed hostile string dictionaries", () => {
    const rows = Array.from({ length: 48 }, (_, index) => row(index % 3));
    const snapshot = structuredClone(rows);
    const stored = compactPlayerMovementHistory(rows);
    expect(Array.isArray(stored)).toBe(false);
    expect(charge(stored)).toBeLessThan(charge(rows));
    expect(expandPlayerMovementHistory(stored)).toStrictEqual(rows);
    expect(expandPlayerMovementHistory(structuredClone(stored))).toStrictEqual(rows);
    expect(expandPlayerMovementHistory(JSON.parse(JSON.stringify(stored)))).toStrictEqual(rows);
    expect(rows).toStrictEqual(snapshot);
    const envelope = stored as unknown as { movementRowsV1: [number, string[], unknown[]] };
    expect(envelope.movementRowsV1[0]).toBe(0);
    expect(envelope.movementRowsV1[1].length).toBeGreaterThan(0);
    expect(new Set(envelope.movementRowsV1[1]).size).toBe(envelope.movementRowsV1[1].length);
    expect(envelope.movementRowsV1[1]).toContain("__proto__");
    expect(compactPlayerMovementHistory(stored)).toStrictEqual(stored);
    expect(JSON.stringify(compactPlayerMovementHistory(rows))).toBe(JSON.stringify(stored));
  });

  it("preserves every declared optional omission, owned undefined and explicit null after archive JSON", () => {
    const rows = Array.from({ length: 3 ** optional.length }, (_, combination) => {
      const current = { id: `move:${anchor}:${combination}`, playerId: anchor,
        type: "release", week: 0, season: 2 } as unknown as Record<string, unknown>;
      let rest = combination;
      for (const key of optional) {
        const presence = rest % 3; rest = Math.floor(rest / 3);
        if (presence === 1) current[key] = undefined;
        if (presence === 2) current[key] = null;
      }
      return current;
    });
    const stored = compactPlayerMovementHistory(rawInput(rows));
    expect(Array.isArray(stored)).toBe(false);
    const expanded = expandPlayerMovementHistory(JSON.parse(JSON.stringify(stored)));
    expect(expanded).toStrictEqual(rows);
    for (let i = 0; i < rows.length; i++) for (const key of optional) {
      expect(Object.hasOwn(expanded[i], key)).toBe(Object.hasOwn(rows[i], key));
    }
  });

  it("preserves precise old summary objects, ID pairs, masks and duplicates", () => {
    const ordinary = { id: `summary:${anchor}:object`, playerId: anchor, type: "loanReturn", week: 3,
      fromClubId: null, toClubId: undefined, contractClubId: "__proto__", fee: 0.25 };
    const tuple = [[`before:${anchor}:`, ":after"], anchor, "permanentTransfer", 4, 15,
      "constructor", null, undefined, 0.25];
    const custom = { unknownSummaryExtension: { exact: [false, null, "α"] } };
    const rows = Array.from({ length: 48 }, (_, i) => [ordinary, tuple, custom][i % 3]);
    const stored = compactPlayerMovementSummaries(summariesInput(rows));
    expect(charge(stored)).toBeLessThan(charge(rows));
    expect(expandPlayerMovementSummaries(stored)).toStrictEqual(rows);
    expect(expandPlayerMovementSummaries(JSON.parse(JSON.stringify(stored)))).toStrictEqual(rows);
    expect(compactPlayerMovementSummaries(stored)).toStrictEqual(stored);
    expect(Array.isArray(expandPlayerMovementSummaries(stored)[1])).toBe(true);
  });

  it("keeps unknown complete rows through explicit fallbacks and preserves tag-looking row extensions", () => {
    const custom = { ...row(), futureFact: { exactReason: "complete historical fact", zero: 0 } };
    const tagLooking = ["movementRowsV99", { exact: false }];
    const rows = [...Array.from({ length: 32 }, (_, i) => row(i)), custom, tagLooking, custom];
    const stored = compactPlayerMovementHistory(rawInput(rows));
    expect(charge(stored)).toBeLessThan(charge(rows));
    expect(expandPlayerMovementHistory(JSON.parse(JSON.stringify(stored)))).toStrictEqual(rows);
  });

  it("keeps empty and tiny collections and never accepts complete wrapper growth", () => {
    for (const rows of [[], ["tiny"], [{ future: true }]]) {
      expect(compactPlayerMovementHistory(rawInput(rows))).toBe(rows);
      expect(compactPlayerMovementSummaries(summariesInput(rows))).toBe(rows);
    }
    for (const count of [1, 2, 3, 7, 32]) {
      const rows = Array.from({ length: count }, (_, i) => row(i));
      const result = compactPlayerMovementHistory(rows);
      if (result !== rows) expect(charge(result)).toBeLessThan(charge(rows));
      expect(expandPlayerMovementHistory(result)).toStrictEqual(rows);
    }
  });

  it("retains whole exotic scopes without invoking getters or erasing descriptors", () => {
    let getterCalls = 0;
    const getter = row(); Object.defineProperty(getter, "reason", { enumerable: true,
      get() { getterCalls++; throw new Error("getter must stay unobserved"); } });
    const hidden = row(); Object.defineProperty(hidden, "hidden", { value: "exact" });
    const frozen = row(); Object.defineProperty(frozen, "reason", {
      value: "exact", enumerable: true, writable: false, configurable: true,
    });
    const symbol = row() as unknown as Record<PropertyKey, unknown>; symbol[Symbol("extension")] = "exact";
    const customPrototype = Object.assign(Object.create({ inherited: true }), row());
    const nullPrototype = Object.assign(Object.create(null), row());
    const cycle = row() as unknown as Record<string, unknown>; cycle.financialSettlements = [{ cycle }];
    const examples = [getter, hidden, frozen, symbol, customPrototype, nullPrototype, cycle,
      { ...row(), fee: -0 }, { ...row(), fee: Infinity }, { ...row(), fee: NaN },
      { ...row(), financialSettlements: Array(2) },
      { ...row(), financialSettlements: [{ customOwnedUndefined: undefined }] },
      { ...row(), financialSettlements: [{ bigint: BigInt(1) }] },
      { ...row(), financialSettlements: [{ method() {} }] }];
    for (const value of examples) {
      const rows = [...Array.from({ length: 8 }, (_, i) => row(i)), value];
      const stored = compactPlayerMovementHistory(rawInput(rows));
      expect(stored).toBe(rows);
      expect(expandPlayerMovementHistory(stored)).toBe(rows);
    }
    const extended = [row()] as unknown as Record<string, unknown>; extended.extension = "exact";
    expect(compactPlayerMovementHistory(rawInput(extended))).toBe(extended);
    expect(getterCalls).toBe(0);
  });
});

describe("movement archive recognized format refusal", () => {
  // Independent literal v1: discriminator, presence, undefined, ID, player, enum, week, season.
  const valid = () => ({ movementRowsV1: [0, [], [[1, 0, 0, "move:P:one", "P", 1, 4, 2]]] });
  it("decodes independent literal raw and old-summary payloads", () => {
    expect(expandPlayerMovementHistory(rawStored(valid()))).toStrictEqual([
      { id: "move:P:one", playerId: "P", type: "permanentTransfer", week: 4, season: 2 },
    ]);
    const summaries = { movementRowsV1: [1, [], [[1, 1, 9, 0, [1, "move:", ":tail"], "P", 1, 4, "a", 0.25]]] };
    expect(expandPlayerMovementSummaries(summariesStored(summaries))).toStrictEqual([
      [["move:", ":tail"], "P", "permanentTransfer", 4, 9, "a", 0.25],
    ] as unknown as StoredPlayerMovementSummary[]);
  });

  it("refuses future/extended envelopes and malformed masks, dictionary references or payloads", () => {
    const malformed: unknown[] = [
      { movementRowsV2: valid().movementRowsV1 }, { ...valid(), extension: true },
      { movementRowsV1: [1, [], []] }, { movementRowsV1: [0, [], [], "extra"] },
      { movementRowsV1: [0, ["same", "same"], []] }, { movementRowsV1: [0, [1], []] },
    ];
    for (const [column, replacement] of [[0, 2], [1, 128], [2, 1], [3, [0, "short"]],
      [3, [1, "prefix", "suffix"]], [4, 999], [5, 11], [6, Infinity]] as [number, unknown][]) {
      const payload = [1, 0, 0, "move:P:one", "P", 1, 4, 2];
      payload[column] = replacement as never;
      malformed.push({ movementRowsV1: [0, [], [payload]] });
    }
    malformed.push({ movementRowsV1: [0, [], [[1, 0, 0, "id", "P", 1, 4]]] });
    malformed.push({ movementRowsV1: [0, [], [[1, 0, 0, "id", "P", 1, 4, 2, "extra"]]] });
    for (const value of malformed) {
      expect(() => expandPlayerMovementHistory(rawStored(value))).toThrow();
      expect(() => compactPlayerMovementHistory(rawInput(value))).toThrow();
    }
    expect(() => expandPlayerMovementSummaries(summariesStored({ movementRowsV1: [1, [],
      [[1, 2, 0, 0, "id", "P", 1, 4]]] }))).toThrow();
    expect(() => expandPlayerMovementSummaries(summariesStored({ movementRowsV9: [] }))).toThrow();
  });
});
