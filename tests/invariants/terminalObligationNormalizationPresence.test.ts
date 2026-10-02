// Preceding presence boundary; imports only existing 440ce97 APIs.
import { describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation } from "@/engine/core/types";
import { normalizeClubEconomics } from "@/engine/finance/clubEconomics";
import { expandClubFinancialObligation, type StoredClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
const FIELDS = ["amount", "percentage", "weeklyAmount", "remainingWeeks"] as const;
function row(): ClubFinancialObligation {
  return { id: "terminal-presence", type: "appearanceBonus", playerId: "p1",
    createdWeek: 1, createdSeason: 2, status: "settled" };
}
function normalized(obligation: ClubFinancialObligation): unknown {
  const club = { id: "host", name: "host", shortName: "host", leagueId: "league",
    reputation: 55, budget: 5_000, scoutingPhilosophy: "academyFirst", managerId: "manager",
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 13,
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [obligation] } as Club;
  return normalizeClubEconomics(club, {}, { currentWeek: 7, currentSeason: 3 }).financialObligations?.[0];
}
describe("terminal normalization and original optional presence", () => {
  it("does not manufacture four absent undefined properties before canonical repacking", () => {
    const source = row(), before = JSON.stringify(source);
    expect(normalized(source)).toEqual({ id: "terminal-presence",
      obligationArchiveV31: [899, 1, "p1", 1, 2, 0] });
    for (const key of FIELDS) expect(Object.hasOwn(source, key)).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each(FIELDS)("retains explicitly owned undefined %s through the v2 boundary", (field) => {
    const source = Object.assign(row(), { [field]: undefined });
    const before = Object.getOwnPropertyDescriptors(source);
    const stored = normalized(source) as StoredClubFinancialObligation;
    expect(stored).toHaveProperty("obligationArchiveV32");
    const actual = expandClubFinancialObligation(JSON.parse(JSON.stringify(stored)) as StoredClubFinancialObligation) as unknown as Record<string, unknown>;
    expect(actual).toEqual(source);
    expect(Object.hasOwn(actual, field)).toBe(true);
    expect(actual[field]).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(actual, field)).toEqual({ value: undefined, enumerable: true, writable: true, configurable: true });
    for (const key of FIELDS.filter(key => key !== field)) expect(Object.hasOwn(actual, key)).toBe(false);
    expect(Object.getOwnPropertyDescriptors(source)).toEqual(before);
  });
  it("retains the existing null-to-undefined numeric normalization with own presence", () => {
    const source: Record<string, unknown> = { ...row(), amount: null, percentage: null, weeklyAmount: null, remainingWeeks: null };
    const stored = normalized(source as unknown as ClubFinancialObligation) as StoredClubFinancialObligation;
    expect(stored).toEqual({ id: source.id, obligationArchiveV32: [1019, 120, 1, "p1", 1, 2, 0] });
    const actual = expandClubFinancialObligation(JSON.parse(JSON.stringify(stored)) as StoredClubFinancialObligation) as unknown as Record<string, unknown>;
    expect(actual).toMatchObject({ id: source.id, status: "settled" });
    for (const key of FIELDS) { expect(Object.hasOwn(actual, key)).toBe(true); expect(actual[key]).toBeUndefined(); }
    for (const key of FIELDS) expect(source[key]).toBeNull();
  });
  it("keeps preexisting active normalization and its manufactured undefined fields unchanged", () => {
    const source = { ...row(), status: "active" as const };
    const actual = normalized(source) as Record<string, unknown>;
    expect(actual.status).toBe("active");
    for (const key of FIELDS) { expect(Object.hasOwn(actual, key)).toBe(true); expect(actual[key]).toBeUndefined(); }
  });
  it("still repairs terminal IDs/dates and rounds numeric terms before packing", () => {
    const source = { ...row(), id: "", createdWeek: NaN, createdSeason: NaN,
      amount: 12.7, percentage: 1.23, weeklyAmount: 3.3, remainingWeeks: 1.8 };
    expect(normalized(source)).toEqual({ id: "host_obligation_0",
      obligationArchiveV31: [1019, 1, "p1", 13, 1.23, 3, 2, 7, 3, 0] });
    expect(source.id).toBe("");
    expect(Number.isNaN(source.createdWeek)).toBe(true);
    expect(source.amount).toBe(12.7);
  });
});
