// Preceding leaf contract: retain v1 coverage and remove only superseded undefined fallback assertions.
import { describe, expect, it } from "vitest";
import type { ClubFinancialObligation, LoanDeal } from "@/engine/core/types";
import { compactLoanDeal, expandLoanDeal, compactClubFinancialObligation, expandClubFinancialObligation,
  InvalidTerminalRecordArchiveError, type StoredLoanDeal, type StoredClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
const OPTIONAL = ["buyOptionFee", "outcome", "agreedPlayingTime", "startCurrentAbility", "monitoringWeeks", "scoutId", "performanceRecord"] as const;
function loan(): LoanDeal {
  return { id: "loan:canonical", playerId: "p1", parentClubId: "parent", loanClubId: "host",
    startWeek: 0, startSeason: 2, endWeek: 12, endSeason: 2, loanFee: 0,
    wageContribution: 0, recallClause: false, status: "completed" };
}
function fullLoan(): LoanDeal {
  return { ...loan(), buyOptionFee: 123.456789012345, outcome: "successful",
    agreedPlayingTime: "rotation", startCurrentAbility: 73.123456789,
    monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "",
    performanceRecord: { appearances: 26, goals: 5, assists: 7, avgRating: 7.125,
      developmentDelta: 7.123456789, parentClubSatisfaction: 86, loanClubSatisfaction: 82 } };
}
function obligation(): ClubFinancialObligation {
  return { id: "obligation:canonical", type: "performanceBonus", playerId: "p1",
    creditorClubId: "", amount: 0, percentage: 12.123456789, weeklyAmount: 0, remainingWeeks: 0,
    createdWeek: 0, createdSeason: 2, status: "settled", trigger: "",
    triggeredWeek: 3, triggeredSeason: 2, lastProcessedWeek: 4, lastProcessedSeason: 2,
    appearanceThreshold: 0, goalThreshold: 7, assistThreshold: 9,
    appearancesRecorded: 26, goalsRecorded: 7, assistsRecorded: 9,
    lastTriggerEvaluationWeek: 4, lastTriggerEvaluationSeason: 2 };
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("lossless terminal archive leaf contracts", () => {
  it.each(["completed", "recalled", "terminated"] as const)("preserves full %s loan facts through exact current tuples and legacy v1 reads", (status) => {
    const source = { ...fullLoan(), status }, before = JSON.stringify(source);
    const stored = compactLoanDeal(source);
    const legacy = [1, source.id, "p1", "parent", "host", 0, 2, 12, 2, 0, 0, false, status,
      { buyOptionFee: 123.456789012345, outcome: "successful", agreedPlayingTime: "rotation",
        startCurrentAbility: 73.123456789, monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "",
        performanceRecord: [26, 5, 7, 7.125, 7.123456789, 86, 82] }];
    expect([stored, expandLoanDeal(legacy as unknown as StoredLoanDeal)]).toEqual([[41, source.id, "p1", "parent", "host", 0, 2, 12, 2, 0, 0, false,
      { completed: 0, recalled: 1, terminated: 2 }[status],
      { buyOptionFee: 123.456789012345, outcome: 0, agreedPlayingTime: 2,
        startCurrentAbility: 73.123456789, monitoringWeeks: ["2:0", "2:0", "2:12"], scoutId: "",
        performanceRecord: [26, 5, 7, 7.125, 7.123456789, 86, 82] }], source]);
    expect(expandLoanDeal(json(stored))).toEqual(source);
    expect(compactLoanDeal(stored)).toBe(stored);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("preserves absent loan optionals and active/ordinary object identity", () => {
    const source = loan();
    const decoded = expandLoanDeal(json(compactLoanDeal(source)));
    for (const key of OPTIONAL) expect(Object.hasOwn(decoded, key)).toBe(false);
    const active = { ...fullLoan(), status: "active" as const };
    expect(compactLoanDeal(active)).toBe(active);
    expect(expandLoanDeal(active)).toBe(active);
    expect(expandLoanDeal(source)).toBe(source);
  });

  it("keeps null, missing required and custom loan facts as original fallback objects", () => {
    const rows: LoanDeal[] = [
      { ...fullLoan(), customAudit: { externalId: "audit-1" } } as LoanDeal,
      { ...fullLoan(), performanceRecord: { ...fullLoan().performanceRecord!, authoredMetric: [1, 2] } } as LoanDeal,
      { ...loan(), performanceRecord: { appearances: 1 } } as unknown as LoanDeal,
      { ...loan(), startWeek: 1.5 },
    ];
    for (const key of OPTIONAL) {
      rows.push({ ...loan(), [key]: null } as unknown as LoanDeal);
    }
    const missing = { ...loan() } as Partial<LoanDeal>; delete missing.playerId;
    rows.push(missing as LoanDeal);
    for (const source of rows) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactLoanDeal(source)).toBe(source);
      expect(expandLoanDeal(source)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
  });

  it.each(["settled", "expired"] as const)("preserves every %s obligation fact in the full mask payload", (status) => {
    const source = { ...obligation(), status }, before = JSON.stringify(source);
    const stored = compactClubFinancialObligation(source);
    const legacy = { id: source.id, obligationArchiveV1: [8_388_607,
      "performanceBonus", "p1", "", 0, 12.123456789, 0, 0, 0, 2, status, "",
      3, 2, 4, 2, 0, 7, 9, 26, 7, 9, 4, 2] };
    expect([stored, expandClubFinancialObligation(legacy as unknown as StoredClubFinancialObligation)]).toEqual([{ id: source.id, obligationArchiveV31: [8_388_607,
      2, "p1", "", 0, 12.123456789, 0, 0, 0, 2, { settled: 0, expired: 1 }[status], "",
      3, 2, 4, 2, 0, 7, 9, 26, 7, 9, 4, 2] }, source]);
    expect(expandClubFinancialObligation(json(stored))).toEqual(source);
    expect(compactClubFinancialObligation(stored)).toBe(stored);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("preserves obligation absent versus optional null/zero/empty facts before any economic normalization", () => {
    const absent = { id: "optional-presence", type: "appearanceBonus", playerId: "p1",
      createdWeek: 1, createdSeason: 2, status: "expired" } as ClubFinancialObligation;
    const nullable = Object.assign({ ...absent }, { amount: null, creditorClubId: null,
      lastProcessedWeek: null, trigger: "", appearancesRecorded: 0 }) as unknown as ClubFinancialObligation;
    const decodedAbsent = expandClubFinancialObligation(json(compactClubFinancialObligation(absent)));
    const decodedNullable = expandClubFinancialObligation(json(compactClubFinancialObligation(nullable)));
    for (const key of ["amount", "creditorClubId", "lastProcessedWeek"]) {
      expect(Object.hasOwn(decodedAbsent, key)).toBe(false);
      expect(Object.hasOwn(decodedNullable, key)).toBe(true);
      expect((decodedNullable as unknown as Record<string, unknown>)[key]).toBeNull();
    }
    expect(decodedNullable).toEqual(nullable);
  });

  it("keeps ordinary/active/unknown/custom obligation identity", () => {
    const full = obligation();
    const rows = [{ ...full, status: "active" }, { ...full, status: "custom-status" },
      { ...full, authoredAudit: { externalPaymentId: "keep" } },
      { ...full, createdWeek: null }, { ...full, type: "custom-clause" },
      { ...full, obligationArchiveV1: ["authored-extension"] },
    ] as unknown as ClubFinancialObligation[];
    expect(expandClubFinancialObligation(full)).toBe(full);
    for (const source of rows) {
      const before = Object.getOwnPropertyDescriptors(source);
      expect(compactClubFinancialObligation(source)).toBe(source);
      expect(expandClubFinancialObligation(source)).toBe(source);
      expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
    }
  });

  it.each([
    [1], [2, ...([1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "completed", {}].slice(1))],
    [1, "l", "p", "a", "b", 1.5, 1, 1, 1, 0, 0, false, "completed", {}],
    [1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "active", {}],
    [1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "completed", { customOptional: 1 }],
    [1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "completed", { performanceRecord: [1, 2] }],
    [1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "completed", { scoutId: null }],
    [1, "l", "p", "a", "b", 0, 1, 1, 1, 0, 0, false, "completed", {}, "extra-column"],
  ].map(bad => ({ bad })))("refuses malformed/unsupported recognized loan archive $bad without rewriting it", ({ bad }) => {
    const before = JSON.stringify(bad);
    expect(() => expandLoanDeal(bad as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactLoanDeal(bad as unknown as StoredLoanDeal)).toThrow(InvalidTerminalRecordArchiveError);
    expect(JSON.stringify(bad)).toBe(before);
  });

  it.each([
    { id: "o", obligationArchiveV1: [-1] },
    { id: "o", obligationArchiveV1: [2 ** 23] },
    { id: "o", obligationArchiveV1: [899.5, "performanceBonus", "p", 1, 2, "settled"] },
    { id: "o", obligationArchiveV1: [0] },
    { id: "o", obligationArchiveV1: [899, "performanceBonus", "p", 1, 2, "active"] },
    { id: "o", obligationArchiveV1: [899, "performanceBonus", "p", 1, 2, "settled", "extra"] },
    { id: null, obligationArchiveV1: [899, "performanceBonus", "p", 1, 2, "settled"] },
    { id: "o", obligationArchiveV2: [899, "performanceBonus", "p", 1, 2, "settled"] },
    { id: "o", obligationArchiveV1: [899, "performanceBonus", "p", 1, 2, "settled"], customEnvelopeColumn: 1 },
  ])("refuses malformed/newer obligation archives %j without rewriting them", (bad) => {
    const before = JSON.stringify(bad);
    expect(() => expandClubFinancialObligation(bad as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(() => compactClubFinancialObligation(bad as unknown as StoredClubFinancialObligation)).toThrow(InvalidTerminalRecordArchiveError);
    expect(JSON.stringify(bad)).toBe(before);
  });
});
