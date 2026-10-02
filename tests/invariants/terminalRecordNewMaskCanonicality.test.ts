// Preceding new-wire metadata controls. Existing public imports; no test-side codec.
import { describe, expect, it } from "vitest";
import { compactLoanDeal, expandLoanDeal, compactClubFinancialObligation, expandClubFinancialObligation,
  InvalidTerminalRecordArchiveError, type StoredLoanDeal, type StoredClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

const PLAYER = "history-player";
function asLoan(value: unknown): StoredLoanDeal { return value as StoredLoanDeal; }
function asDebt(value: unknown): StoredClubFinancialObligation { return value as StoredClubFinancialObligation; }
function capture(action: () => unknown): unknown {
  try { action(); return undefined; } catch (error) { return error; }
}
function dataOnly(value: object): boolean {
  return Reflect.ownKeys(value).every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
}

describe("new terminal metadata refuses negative-zero undefined masks without rewriting old versions", () => {
  it("refuses loan42 negative-zero undefined metadata in both expand and compact", () => {
    const wire = [42, "saved-loan", PLAYER, "parent", "host", 1, 1, 12, 1, 500, 40, false, 0, -0, {}];
    expect(dataOnly(wire)).toBe(true); expect(dataOnly(wire[14] as object)).toBe(true);
    const before = structuredClone(wire);
    const errors = [capture(() => expandLoanDeal(asLoan(wire))), capture(() => compactLoanDeal(asLoan(wire)))];
    expect(wire).toStrictEqual(before); expect(Object.is(wire[13], -0)).toBe(true);
    for (const error of errors) expect(error).toBeInstanceOf(InvalidTerminalRecordArchiveError);
    const positive = structuredClone(wire); positive[13] = 0;
    expect(expandLoanDeal(asLoan(positive))).toMatchObject({ id: "saved-loan", playerId: PLAYER, status: "completed" });
    expect(compactLoanDeal(asLoan(positive))).toBe(positive);
  });

  it("refuses obligationV32 negative-zero undefined metadata in both expand and compact", () => {
    const wire = { id: "saved-obligation", obligationArchiveV32: [899, -0, 0, PLAYER, 1, 1, 1] };
    expect(dataOnly(wire)).toBe(true); expect(dataOnly(wire.obligationArchiveV32)).toBe(true);
    const before = structuredClone(wire);
    const errors = [capture(() => expandClubFinancialObligation(asDebt(wire))), capture(() => compactClubFinancialObligation(asDebt(wire)))];
    expect(wire).toStrictEqual(before); expect(Object.is(wire.obligationArchiveV32[1], -0)).toBe(true);
    for (const error of errors) expect(error).toBeInstanceOf(InvalidTerminalRecordArchiveError);
    const positive = structuredClone(wire); positive.obligationArchiveV32[1] = 0;
    expect(expandClubFinancialObligation(asDebt(positive))).toMatchObject({ id: "saved-obligation", playerId: PLAYER, status: "expired" });
    expect(compactClubFinancialObligation(asDebt(positive))).toBe(positive);
  });

  it("keeps legacy v2 signed-zero masks readable and retains exact stored references", () => {
    const loan = [2, "saved-loan", PLAYER, "parent", "host", 1, 1, 12, 1, 500, 40, false, "completed", -0, {}];
    const debt = { id: "saved-obligation", obligationArchiveV2: [899, -0, "loanWageContribution", PLAYER, 1, 1, "expired"] };
    const loanBefore = structuredClone(loan), debtBefore = structuredClone(debt);
    expect(expandLoanDeal(asLoan(loan)).id).toBe("saved-loan");
    expect(expandClubFinancialObligation(asDebt(debt)).id).toBe("saved-obligation");
    expect(compactLoanDeal(asLoan(loan))).toBe(loan);
    expect(compactClubFinancialObligation(asDebt(debt))).toBe(debt);
    expect(loan).toStrictEqual(loanBefore); expect(debt).toStrictEqual(debtBefore);
    expect(Object.is(loan[13], -0)).toBe(true); expect(Object.is(debt.obligationArchiveV2[1], -0)).toBe(true);
  });
});
