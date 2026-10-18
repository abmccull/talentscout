// Preceding original-input contracts: legacy leaves isolate financial ancestry from new codec versions.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Club, GameState, StoredLoanDeal, StoredClubFinancialObligation } from "@/engine/core/types";
import { migrateSaveState } from "@/lib/db";
import { applyGameplaySaveMigrations } from "@/lib/gameStateGameplayMigration";
import { SaveMigrationError } from "@/lib/saveEnvelope";
import { expandLoanDeal, expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

const SITES = ["loanHistory", "clubs", "club entry", "financialObligations", "loan row", "obligation row"] as const;
type Site = typeof SITES[number];
const BOUNDARIES = [
  { name: "migrateSaveState", run: (state: GameState) => migrateSaveState(state) },
  { name: "applyGameplaySaveMigrations", run: (state: GameState) => applyGameplaySaveMigrations(state) },
] as const;
function legacyLoan(): StoredLoanDeal {
  return [1, "saved-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    "completed", { outcome: "neutral", monitoringWeeks: ["1:4", "1:4"], scoutId: "saved-scout" }] as unknown as StoredLoanDeal;
}
function legacyDebt(): StoredClubFinancialObligation {
  return { id: "saved-obligation", obligationArchiveV1: [25_599,
    "loanWageContribution", "history-player", "parent", 0, 12.5, 0, 0, 1, 1, "expired", 12, 1] };
}
function club(id: string): Club {
  return { id, name: id, shortName: id, leagueId: "saved-league", reputation: 55, budget: 50_000,
    scoutingPhilosophy: "academyFirst", managerId: "saved-manager", playerIds: [], academyPlayerIds: [],
    youthAcademyRating: 13, loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [] };
}
function career(): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state);
  state.scout.id = "saved-scout";
  state.clubs = { parent: club("parent"), host: club("host") };
  state.loanHistory = [legacyLoan()];
  state.clubs.host.financialObligations = [legacyDebt()];
  return state;
}
function target(state: GameState, site: Site): { owner: object; key: string; value: unknown } {
  const clubs = state.clubs, host = clubs.host, loans = state.loanHistory!, obligations = host.financialObligations!;
  switch (site) {
    case "loanHistory": return { owner: state, key: "loanHistory", value: loans };
    case "clubs": return { owner: state, key: "clubs", value: clubs };
    case "club entry": return { owner: clubs, key: "host", value: host };
    case "financialObligations": return { owner: host, key: "financialObligations", value: obligations };
    case "loan row": return { owner: loans, key: "0", value: loans[0] };
    case "obligation row": return { owner: obligations, key: "0", value: obligations[0] };
  }
}
afterEach(() => { vi.restoreAllMocks(); });

describe.each(BOUNDARIES)("$name rejects financial accessor ancestry before clone or normalization", ({ name, run }) => {
  it("accepts ordinary data with valid legacy leaves as a fixture control", () => {
    const source = career(), before = JSON.stringify(source);
    const loan = expandLoanDeal(source.loanHistory![0]);
    const debt = expandClubFinancialObligation(source.clubs.host.financialObligations![0]);
    const actual = run(source);
    expect(actual.loanHistory!.map(row => expandLoanDeal(row))).toStrictEqual([loan]);
    expect(expandClubFinancialObligation(actual.clubs.host.financialObligations![0])).toMatchObject(debt);
    expect(actual.clubs.parent.budget).toBe(50_000);
    expect(actual.clubs.host.budget).toBe(50_000);
    if (name === "migrateSaveState") expect(JSON.stringify(source)).toBe(before);
  });

  it.each(SITES)("refuses own accessor %s without reading it", site => {
    const source = career(), financesBefore = JSON.stringify(source.finances);
    const selected = target(source, site);
    let getterCalls = 0;
    Object.defineProperty(selected.owner, selected.key, {
      enumerable: true, configurable: true,
      get() { getterCalls += 1; return selected.value; },
    });
    const accessorBefore = Object.getOwnPropertyDescriptor(selected.owner, selected.key);
    const clone = vi.spyOn(globalThis, "structuredClone");
    let caught: unknown;
    try { run(source); } catch (error) { caught = error; }
    expect(getterCalls, "financial ancestor must be refused before any getter executes").toBe(0);
    expect(clone).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(SaveMigrationError);
    expect((caught as SaveMigrationError).code).toBe("CORRUPT_SAVE");
    expect(Object.getOwnPropertyDescriptor(selected.owner, selected.key)).toEqual(accessorBefore);
    expect(JSON.stringify(source.finances)).toBe(financesBefore);
  });
});
