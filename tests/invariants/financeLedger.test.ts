import { describe, expect, it } from "vitest";
import type { GameState, NewGameConfig } from "@/engine/core/types";
import {
  applyBalanceTransaction,
  applyDifficultyFinancialAdjustments,
  initializeFinances,
  processWeeklyFinances,
  processStarterStipend,
} from "@/engine/finance/expenses";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { reconcileFinancialLedger } from "@/engine/finance/saveMigration";
import { hireEmployee } from "@/engine/finance/agency";
import { hireAssistantScout } from "@/engine/finance/assistantScouts";
import {
  closeSatelliteOffice,
  openSatelliteOffice,
} from "@/engine/finance/internationalExpansion";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Ledger",
  scoutLastName: "Scout",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "ledger-invariant",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

describe("financial ledger invariants", () => {
  it("starts new careers with an explicit opening-balance entry", () => {
    const scout = createScout(CONFIG, new RNG("ledger-opening"));
    const finances = initializeFinances(scout, "independent", "normal");

    expect(finances.transactions).toEqual([{
      week: 0,
      season: 1,
      amount: finances.balance,
      description: "Opening balance",
      kind: "openingBalance",
    }]);
    expect(finances.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))
      .toBe(finances.balance);
  });

  it("reconciles a legacy ledger without changing cash and is idempotent", () => {
    const scout = createScout(CONFIG, new RNG("ledger-legacy"));
    const initialized = initializeFinances(scout, "independent", "normal");
    const legacy = {
      ...initialized,
      balance: 1_500,
      transactions: [
        { week: 4, season: 1, amount: 500, description: "Report sale" },
        { week: 4, season: 1, amount: -250, description: "Travel" },
      ],
    };

    const migrated = reconcileFinancialLedger(legacy);
    expect(migrated.balance).toBe(1_500);
    expect(migrated.transactions[0]).toEqual({
      week: 0,
      season: 1,
      amount: 1_250,
      description: "Opening balance (legacy reconciliation)",
      kind: "openingBalance",
    });
    expect(migrated.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))
      .toBe(migrated.balance);
    expect(reconcileFinancialLedger(migrated)).toBe(migrated);
  });

  it("cannot apply a finite cash movement without appending its source", () => {
    const scout = createScout(CONFIG, new RNG("ledger-source"));
    const before = initializeFinances(scout, "independent", "normal");
    const after = applyBalanceTransaction(
      before,
      750,
      3,
      2,
      "Legacy career starting budget bonus",
    );

    expect(after.balance - before.balance).toBe(750);
    expect(after.transactions.slice(before.transactions.length)).toEqual([{
      week: 3,
      season: 2,
      amount: 750,
      description: "Legacy career starting budget bonus",
    }]);
  });

  it("records the starter stipend as the source of its balance change", () => {
    const scout = createScout(CONFIG, new RNG("ledger-scout"));
    const before = initializeFinances(scout, "independent", "normal");
    const after = processStarterStipend(before, "normal", 1, 1);
    const newTransactions = after.transactions.slice(before.transactions.length);

    expect(newTransactions).toEqual([
      {
        week: 1,
        season: 1,
        amount: 300,
        description: "Starter scouting stipend",
      },
    ]);
    expect(after.balance - before.balance).toBe(
      newTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    );
    expect(after.starterBonus.starterStipendWeeksRemaining).toBe(3);
  });

  it("reconciles income and expense difficulty adjustments exactly", () => {
    const scout = createScout(CONFIG, new RNG("ledger-difficulty"));
    const before = initializeFinances(scout, "independent", "normal");
    const after = applyDifficultyFinancialAdjustments(
      before,
      -200,
      125,
      4,
      1,
    );
    const deltaTransactions = after.transactions.slice(before.transactions.length);

    expect(deltaTransactions).toEqual([
      {
        week: 4,
        season: 1,
        amount: -200,
        description: "Difficulty income adjustment",
      },
      {
        week: 4,
        season: 1,
        amount: -125,
        description: "Difficulty expense adjustment",
      },
    ]);
    expect(after.balance - before.balance).toBe(
      deltaTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    );
  });

  it("keeps a complete weekly finance pipeline equal to the ledger sum", () => {
    const scout = createScout(CONFIG, new RNG("ledger-weekly-pipeline"));
    const opened = initializeFinances(scout, "independent", "normal");
    const monthly = processWeeklyFinances(opened, scout, 4, 1);
    const stipend = processStarterStipend(monthly, "normal", 4, 1);
    const adjusted = applyDifficultyFinancialAdjustments(
      stipend,
      -100,
      75,
      4,
      1,
    );

    expect(adjusted.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))
      .toBe(adjusted.balance);
  });

  it("allocates unique deterministic IDs for repeated same-week hires", () => {
    const scout = createScout(CONFIG, new RNG("ledger-hires"));
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      office: {
        ...initializeFinances(scout, "independent", "normal").office,
        maxEmployees: 4,
      },
    };
    const first = hireEmployee(
      new RNG("same-week-hire-1"),
      finances,
      "scout",
      8,
      1,
      ["england"],
      1,
    );
    expect(first).not.toBeNull();
    const second = hireEmployee(
      new RNG("same-week-hire-2"),
      first!,
      "scout",
      8,
      1,
      ["england"],
      2,
    );

    expect(second?.employees.map((employee) => employee.id)).toEqual([
      "emp_s1w8_a1",
      "emp_s1w8_a2",
    ]);
    expect(second?.actionSequence).toBe(2);
  });

  it("does not reuse satellite office IDs after close and reopen", () => {
    const scout = createScout(CONFIG, new RNG("ledger-offices"));
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      balance: 30_000,
    };
    const first = openSatelliteOffice(finances, "Iberia", 12, 2, 1);
    expect(first).not.toBeNull();
    const closed = closeSatelliteOffice(first!, first!.satelliteOffices[0].id);
    const reopened = openSatelliteOffice(closed, "Iberia", 12, 2, 2);

    expect(first?.satelliteOffices[0].id).toBe("sat_Iberia_s2w12_a1");
    expect(reopened?.satelliteOffices[0].id).toBe("sat_Iberia_s2w12_a2");
    expect(reopened?.actionSequence).toBe(2);
  });

  it("keeps assistant hire identity unique across a save/reload boundary", () => {
    const scout = createScout(CONFIG, new RNG("ledger-assistants"));
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      balance: 30_000,
    };
    const base = {
      scout,
      finances,
      currentSeason: 1,
      currentWeek: 8,
      assistantScouts: [],
    } as unknown as GameState;
    const first = hireAssistantScout(new RNG("assistant-1"), base, 1);
    expect(first).not.toBeNull();
    const reloaded = structuredClone(first!);
    const second = hireAssistantScout(new RNG("assistant-2"), reloaded, 2);

    expect(second?.assistantScouts?.map((assistant) => assistant.id)).toEqual([
      "asst_s1w8_a1",
      "asst_s1w8_a2",
    ]);
    expect(second?.finances?.actionSequence).toBe(2);
  });
});
