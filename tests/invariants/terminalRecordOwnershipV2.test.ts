// Preceding contracts: existing public APIs, hand-authored v2 facts, no test encoder.
import { describe, expect, it } from "vitest";
import type { LoanDeal, ClubFinancialObligation } from "@/engine/core/types";
import { compactLoanDeal, expandLoanDeal, compactClubFinancialObligation, expandClubFinancialObligation,
  InvalidTerminalRecordArchiveError, type StoredLoanDeal, type StoredClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

const LOAN_OPTIONAL = ["buyOptionFee", "outcome", "agreedPlayingTime", "startCurrentAbility", "monitoringWeeks", "scoutId", "performanceRecord"] as const;
const OBLIGATION_OPTIONAL = [
  ["creditorClubId", 2], ["amount", 3], ["percentage", 4], ["weeklyAmount", 5], ["remainingWeeks", 6],
  ["trigger", 10], ["triggeredWeek", 11], ["triggeredSeason", 12], ["lastProcessedWeek", 13], ["lastProcessedSeason", 14],
  ["appearanceThreshold", 15], ["goalThreshold", 16], ["assistThreshold", 17], ["appearancesRecorded", 18],
  ["goalsRecorded", 19], ["assistsRecorded", 20], ["lastTriggerEvaluationWeek", 21], ["lastTriggerEvaluationSeason", 22],
] as const;
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function loan(): LoanDeal {
  return { id: "loan:v2", playerId: "p1", parentClubId: "parent", loanClubId: "host", startWeek: 0, startSeason: 2,
    endWeek: 12, endSeason: 2, loanFee: 0, wageContribution: 0, recallClause: false, status: "completed" };
}
function wireLoan(mask: unknown = 1, optional: unknown = {}): unknown[] {
  return [2, "loan:v2", "p1", "parent", "host", 0, 2, 12, 2, 0, 0, false, "completed", mask, optional];
}
function emittedLoan42(mask: unknown = 1, optional: unknown = {}): unknown[] {
  return [42, "loan:v2", "p1", "parent", "host", 0, 2, 12, 2, 0, 0, false, 0, mask, optional];
}
function debt(): ClubFinancialObligation {
  return { id: "obligation:v2", type: "appearanceBonus", playerId: "p1", createdWeek: 0, createdSeason: 2, status: "settled" };
}
function expectUndefined(value: object, key: string): void {
  expect(Object.hasOwn(value, key)).toBe(true);
  expect(Object.getOwnPropertyDescriptor(value, key)).toEqual({ value: undefined, enumerable: true, writable: true, configurable: true });
}

describe("v2 exact optional ownership at the terminal financial leaf", () => {
  it.each(LOAN_OPTIONAL.map((field, index) => ({ field, mask: 2 ** index })))("encodes only loan undefined bit $field/$mask and restores all own flags after JSON", ({ field, mask }) => {
    const source = { ...loan(), [field]: undefined } as LoanDeal;
    const before = Object.getOwnPropertyDescriptors(source);
    const stored = compactLoanDeal(source);
    expect(stored).toEqual(emittedLoan42(mask));
    const decoded = expandLoanDeal(json(stored));
    expect(decoded).toEqual(source);
    expectUndefined(decoded, field);
    for (const absent of LOAN_OPTIONAL.filter(key => key !== field)) expect(Object.hasOwn(decoded, absent)).toBe(false);
    expect(compactLoanDeal(stored)).toBe(stored);
    expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(source));
  });

  it.each(["completed", "recalled", "terminated"] as const)("encodes all seven owned undefined optionals for %s and leaves active identity alone", status => {
    const source = Object.assign({ ...loan(), status }, Object.fromEntries(LOAN_OPTIONAL.map(key => [key, undefined])));
    const expected = emittedLoan42(127); expected[12] = { completed: 0, recalled: 1, terminated: 2 }[status];
    const stored = compactLoanDeal(source);
    expect(stored).toEqual(expected);
    const decoded = expandLoanDeal(json(stored));
    for (const key of LOAN_OPTIONAL) expectUndefined(decoded, key);
    const active = { ...source, status: "active" as const };
    expect(compactLoanDeal(active)).toBe(active);
  });

  it("preserves monitoring duplicates, zero/empty fields and every performance digit alongside undefined", () => {
    const source = { ...loan(), buyOptionFee: undefined, outcome: "successful" as const, agreedPlayingTime: "rotation" as const,
      startCurrentAbility: 0, monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "",
      performanceRecord: { appearances: 26, goals: 0, assists: 7, avgRating: 7.125, developmentDelta: 7.123456789,
        parentClubSatisfaction: 86.123456789, loanClubSatisfaction: 82 } };
    const before = Object.getOwnPropertyDescriptors(source), monitoring = [...source.monitoringWeeks];
    const expected = wireLoan(1, { outcome: "successful", agreedPlayingTime: "rotation", startCurrentAbility: 0,
      monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "", performanceRecord: [26, 0, 7, 7.125, 7.123456789, 86.123456789, 82] });
    const emitted = emittedLoan42(1, { outcome: 0, agreedPlayingTime: 2, startCurrentAbility: 0,
      monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "", performanceRecord: [26, 0, 7, 7.125, 7.123456789, 86.123456789, 82] });
    expect(compactLoanDeal(source)).toEqual(emitted);
    const decoded = expandLoanDeal(json(expected) as unknown as StoredLoanDeal);
    expect(decoded).toEqual(source); expectUndefined(decoded, "buyOptionFee");
    expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    expect(source.monitoringWeeks).toEqual(monitoring);
  });

  it.each(OBLIGATION_OPTIONAL)("encodes obligation undefined %s at bit %i without manufacturing other optional ownership", (field, index) => {
    const bit = 2 ** index, source = { ...debt(), [field]: undefined } as ClubFinancialObligation;
    const before = Object.getOwnPropertyDescriptors(source);
    const stored = compactClubFinancialObligation(source);
    expect(stored).toEqual({ id: source.id, obligationArchiveV32: [899 + bit, bit, 1, "p1", 0, 2, 0] });
    const decoded = expandClubFinancialObligation(json(stored));
    expect(decoded).toEqual(source); expectUndefined(decoded, field);
    for (const [absent] of OBLIGATION_OPTIONAL.filter(([key]) => key !== field)) expect(Object.hasOwn(decoded, absent)).toBe(false);
    expect(compactClubFinancialObligation(stored)).toBe(stored);
    expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThan(new TextEncoder().encode(JSON.stringify(source)).byteLength);
  });

  it("retains all optional undefined bits and distinguishes explicit null/zero/empty and absent before economic normalization", () => {
    const all = Object.assign(debt(), Object.fromEntries(OBLIGATION_OPTIONAL.map(([key]) => [key, undefined])));
    const stored = compactClubFinancialObligation(all);
    expect(stored).toEqual({ id: all.id, obligationArchiveV32: [8_388_607, 8_387_708, 1, "p1", 0, 2, 0] });
    for (const [key] of OBLIGATION_OPTIONAL) expectUndefined(expandClubFinancialObligation(json(stored)), key);
    const mixed = { ...debt(), creditorClubId: null, amount: 0, percentage: undefined, trigger: "", lastProcessedWeek: null } as unknown as ClubFinancialObligation;
    const expected = { id: mixed.id, obligationArchiveV2: [10_143, 16, "appearanceBonus", "p1", null, 0, 0, 2, "settled", "", null] };
    const emitted = { id: mixed.id, obligationArchiveV32: [10_143, 16, 1, "p1", null, 0, 0, 2, 0, "", null] };
    expect(compactClubFinancialObligation(mixed)).toEqual(emitted);
    const decoded = expandClubFinancialObligation(json(expected) as unknown as StoredClubFinancialObligation);
    expect(decoded).toEqual(mixed); expectUndefined(decoded, "percentage");
    expect(Object.hasOwn(decoded, "weeklyAmount")).toBe(false);
    expect(decoded.creditorClubId).toBeNull(); expect(decoded.amount).toBe(0); expect(decoded.trigger).toBe("");
  });

  it("uses the actual UTF-8 size choice rather than treating undefined as a payload column", () => {
    const source: ClubFinancialObligation = { id: "", type: "sellOnClause", playerId: "", createdWeek: 0, createdSeason: 0, status: "settled", amount: undefined };
    const candidate = { id: "", obligationArchiveV32: [907, 8, 4, "", 0, 0, 0] };
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const actual = compactClubFinancialObligation(source);
    if (bytes(candidate) < bytes(source)) expect(actual).toEqual(candidate);
    else expect(actual).toBe(source);
  });

  it("emits current absent/nonundefined leaves and refuses undefined smuggled into legacy v1 payloads", () => {
    const plain = loan(); expect((compactLoanDeal(plain) as unknown[])[0]).toBe(41);
    const plainDebt = debt(); expect(compactClubFinancialObligation(plainDebt)).toHaveProperty("obligationArchiveV31");
    const v1Loan = [1, ...wireLoan().slice(1, 13), { buyOptionFee: undefined }];
    const v1Debt = { id: "o", obligationArchiveV1: [907, "appearanceBonus", "p1", undefined, 0, 2, "settled"] };
    expect(() => expandLoanDeal(v1Loan as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => expandClubFinancialObligation(v1Debt as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
  });

  it("reads legacy v2 zero-mask facts, upgrades once to42 and preserves canonical identity", () => {
    const stored = wireLoan(0) as unknown as StoredLoanDeal;
    const upgraded = compactLoanDeal(stored);
    expect([expandLoanDeal(json(stored)), upgraded]).toEqual([loan(), emittedLoan42(0)]);
    expect(compactLoanDeal(upgraded)).toBe(upgraded);
    expect((compactLoanDeal(loan()) as unknown[])[0]).toBe(41);
  });

  it("keeps required undefined, nonfinite and malformed ordinary payloads as identity fallback", () => {
    const sparse: string[] = ["2:0", "2:1"]; delete sparse[1];
    for (const source of [{ ...loan(), playerId: undefined }, { ...loan(), buyOptionFee: NaN },
      { ...loan(), loanFee: Infinity }, { ...loan(), monitoringWeeks: sparse },
      { ...loan(), performanceRecord: { appearances: 1 } }]) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactLoanDeal(source as unknown as LoanDeal)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
    for (const source of [{ ...debt(), type: undefined }, { ...debt(), amount: NaN },
      { ...debt(), createdSeason: Infinity }, { ...debt(), percentage: -Infinity }]) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactClubFinancialObligation(source as unknown as ClubFinancialObligation)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
  });

  it("retains custom/exotic ordinary identity without calling accessors or deleting undefined", () => {
    let getterCalls = 0;
    const shapes = (base: object, optional: string): object[] => {
      const accessor = { ...base }; Object.defineProperty(accessor, optional, { enumerable: true, get() { getterCalls++; return undefined; } });
      const nonenumerable = { ...base }; Object.defineProperty(nonenumerable, optional, { value: undefined });
      const readonly = { ...base }; Object.defineProperty(readonly, optional, { value: undefined, enumerable: true, writable: false, configurable: true });
      const fixed = { ...base }; Object.defineProperty(fixed, optional, { value: undefined, enumerable: true, writable: true, configurable: false });
      const symbol = { ...base, [optional]: undefined, [Symbol("audit")]: 1 };
      const inherited = Object.assign(Object.create({ authoredAudit: 1 }) as object, base, { [optional]: undefined });
      class AuthoredRecord {} const authored = Object.assign(new AuthoredRecord(), base, { [optional]: undefined });
      return [accessor, nonenumerable, readonly, fixed, symbol, inherited, authored, { ...base, [optional]: undefined, authoredAudit: [1, 2] }];
    };
    for (const source of shapes(loan(), "buyOptionFee")) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactLoanDeal(source as LoanDeal)).toBe(source); expect(expandLoanDeal(source as LoanDeal)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
    for (const source of shapes(debt(), "amount")) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactClubFinancialObligation(source as ClubFinancialObligation)).toBe(source);
      expect(expandClubFinancialObligation(source as ClubFinancialObligation)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
    expect(getterCalls).toBe(0);
    for (const tag of ["obligationArchiveV1", "obligationArchiveV2", "obligationArchiveV3"]) {
      const source = { ...debt(), amount: undefined, [tag]: ["authored"] };
      expect(compactClubFinancialObligation(source)).toBe(source); expect(expandClubFinancialObligation(source)).toBe(source);
    }
  });

  it.each([-1, 0.5, 128, NaN, Infinity, "1"])("refuses loan v2 mask %s without modifying recognized input", mask => {
    const row = wireLoan(mask), before = Object.getOwnPropertyDescriptors(row);
    expect(() => expandLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(Object.getOwnPropertyDescriptors(row)).toEqual(before);
  });
  it("refuses v2 loan overlap, wrong length, future tag and malformed required/nested payloads", () => {
    const future = wireLoan(); future[0] = 3;
    const required = wireLoan(); required[1] = undefined;
    const rows = [wireLoan(1, { buyOptionFee: 0 }), wireLoan().slice(0, 14), [...wireLoan(), "tail"], future, required,
      wireLoan(1, { monitoringWeeks: ["ok", undefined] }), wireLoan(1, { performanceRecord: [1, 2] }), wireLoan(1, { scoutId: null }),
      wireLoan(1, { customOptional: 1 })];
    for (const row of rows) {
      const before = Object.getOwnPropertyDescriptors(row);
      expect(() => expandLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
      expect(() => compactLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
      expect(Object.getOwnPropertyDescriptors(row)).toEqual(before);
    }
  });
  it("refuses invalid obligation masks, required undefined, wrong columns and future V3", () => {
    const rows = [
      { id: "o", obligationArchiveV2: [-1, 0] }, { id: "o", obligationArchiveV2: [2 ** 23, 0] },
      { id: "o", obligationArchiveV2: [899.5, 0] }, { id: "o", obligationArchiveV2: [899, -1] },
      { id: "o", obligationArchiveV2: [899, 0.5] }, { id: "o", obligationArchiveV2: [899, 2 ** 23] },
      { id: "o", obligationArchiveV2: [899, 8, "appearanceBonus", "p1", 0, 2, "settled"] },
      { id: "o", obligationArchiveV2: [899, 1, "p1", 0, 2, "settled"] },
      { id: "o", obligationArchiveV2: [907, 8, "appearanceBonus", "p1", 0, 2] },
      { id: "o", obligationArchiveV2: [907, 8, "appearanceBonus", "p1", 0, 2, "settled", 0] },
      { id: "o", obligationArchiveV2: [907, 0, "appearanceBonus", "p1", undefined, 0, 2, "settled"] },
      { id: "o", obligationArchiveV3: [907, 8, "appearanceBonus", "p1", 0, 2, "settled"] },
      { id: "o", obligationArchiveV2: [907, 8, "appearanceBonus", "p1", 0, 2, "settled"], extra: 1 },
    ];
    for (const row of rows) {
      const before = Object.getOwnPropertyDescriptors(row);
      expect(() => expandClubFinancialObligation(row as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
      expect(() => compactClubFinancialObligation(row as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
      expect(Object.getOwnPropertyDescriptors(row)).toEqual(before);
    }
  });
  it.each(["writable", "configurable"] as const)("retains ordinary required/optional/nested %s:false descriptors instead of flattening them", flag => {
    const fixed = <T extends object>(source: T, key: string): T => {
      Object.defineProperty(source, key, { ...Object.getOwnPropertyDescriptor(source, key), [flag]: false }); return source;
    };
    const full = { ...loan(), buyOptionFee: undefined, scoutId: "", monitoringWeeks: ["2:0", "2:0"],
      performanceRecord: { appearances: 26, goals: 0, assists: 7, avgRating: 7.125, developmentDelta: 7.123456789,
        parentClubSatisfaction: 86, loanClubSatisfaction: 82 } };
    const nestedMonitoring = { ...full, monitoringWeeks: fixed([...full.monitoringWeeks], "0") };
    const nestedPerformance = { ...full, performanceRecord: fixed({ ...full.performanceRecord }, "avgRating") };
    const rows = [fixed({ ...full }, "id"), fixed({ ...full }, "buyOptionFee"), fixed({ ...full }, "scoutId"), nestedMonitoring, nestedPerformance];
    for (const source of rows) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactLoanDeal(source)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
    for (const source of [fixed({ ...debt(), amount: undefined }, "type"), fixed({ ...debt(), amount: undefined }, "amount"),
      fixed({ ...debt(), amount: undefined, trigger: "" }, "trigger")]) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactClubFinancialObligation(source)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
  });

  it.each(["writable", "configurable"] as const)("also preserves %s:false descriptors on otherwise eligible v1 ordinary facts", flag => {
    const fixed = <T extends object>(source: T, key: string): T => {
      Object.defineProperty(source, key, { ...Object.getOwnPropertyDescriptor(source, key), [flag]: false }); return source;
    };
    const performance = { appearances: 26, goals: 0, assists: 7, avgRating: 7.125, developmentDelta: 7.123456789,
      parentClubSatisfaction: 86, loanClubSatisfaction: 82 };
    for (const source of [fixed(loan(), "id"), fixed({ ...loan(), scoutId: "" }, "scoutId"),
      { ...loan(), monitoringWeeks: fixed(["2:0"], "0") }, { ...loan(), performanceRecord: fixed(performance, "avgRating") }]) {
      expect(compactLoanDeal(source)).toBe(source);
    }
    for (const source of [fixed(debt(), "type"), fixed({ ...debt(), amount: 0 }, "amount")]) {
      expect(compactClubFinancialObligation(source)).toBe(source);
    }
    const v1 = [1, ...wireLoan().slice(1, 13), {}]; fixed(v1, "1");
    expect(() => expandLoanDeal(v1 as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactLoanDeal(v1 as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    const v1Debt = { id: "o", obligationArchiveV1: [899, "appearanceBonus", "p1", 0, 2, "settled"] }; fixed(v1Debt, "id");
    expect(() => expandClubFinancialObligation(v1Debt as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactClubFinancialObligation(v1Debt as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
  });
  it.each(["writable", "configurable"] as const)("refuses recognized stored %s:false top-level and nested descriptors", flag => {
    const fixed = <T extends object>(source: T, key: string): T => {
      Object.defineProperty(source, key, { ...Object.getOwnPropertyDescriptor(source, key), [flag]: false }); return source;
    };
    const monitor = fixed(["2:0", "2:0"], "0"), performance = fixed([26, 0, 7, 7.125, 7.123456789, 86, 82], "3");
    const optionals = fixed({ scoutId: "" }, "scoutId");
    for (const row of [fixed(wireLoan(), "1"), fixed(wireLoan(), "13"), wireLoan(1, optionals),
      wireLoan(1, { monitoringWeeks: monitor }), wireLoan(1, { performanceRecord: performance })]) {
      const before = Object.getOwnPropertyDescriptors(row);
      expect(() => expandLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
      expect(() => compactLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
      expect(Object.getOwnPropertyDescriptors(row)).toEqual(before);
    }
    for (const row of [fixed({ id: "o", obligationArchiveV2: [907, 8, "appearanceBonus", "p1", 0, 2, "settled"] }, "id"),
      fixed({ id: "o", obligationArchiveV2: [907, 8, "appearanceBonus", "p1", 0, 2, "settled"] }, "obligationArchiveV2"),
      { id: "o", obligationArchiveV2: fixed([907, 8, "appearanceBonus", "p1", 0, 2, "settled"], "0") }]) {
      expect(() => expandClubFinancialObligation(row as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
      expect(() => compactClubFinancialObligation(row as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    }
  });
  it("rejects hostile recognized descriptors and sparse arrays before any getter is called", () => {
    let calls = 0;
    const sparse = wireLoan(); delete sparse[2];
    const accessor = wireLoan(); Object.defineProperty(accessor, "13", { enumerable: true, get() { calls++; return 1; } });
    const nonenumerable = wireLoan(); Object.defineProperty(nonenumerable, "13", { enumerable: false });
    const symbol = wireLoan(); Object.assign(symbol, { [Symbol("audit")]: 1 });
    const optional = {}; Object.defineProperty(optional, "scoutId", { enumerable: true, get() { calls++; return "scout"; } });
    for (const row of [sparse, accessor, nonenumerable, symbol, wireLoan(1, optional)]) {
      expect(() => expandLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
      expect(() => compactLoanDeal(row as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    }
    const envelope = { id: "o" }; Object.defineProperty(envelope, "obligationArchiveV2", { enumerable: true, get() { calls++; return [907, 8]; } });
    expect(() => expandClubFinancialObligation(envelope as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactClubFinancialObligation(envelope as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    const payload: unknown[] = [907, 8, "appearanceBonus", "p1", 0, 2, "settled"]; delete payload[2];
    expect(() => expandClubFinancialObligation({ id: "o", obligationArchiveV2: payload } as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactClubFinancialObligation({ id: "o", obligationArchiveV2: payload } as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(calls).toBe(0);
  });
});
