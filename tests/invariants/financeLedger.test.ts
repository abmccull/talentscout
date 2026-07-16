import { describe, expect, it } from "vitest";
import type { GameState, NewGameConfig } from "@/engine/core/types";
import {
  applyBalanceTransaction,
  applyDifficultyFinancialAdjustments,
  initializeFinances,
  processWeeklyFinances,
  processStarterStipend,
  sumOperatingExpenses,
} from "@/engine/finance/expenses";
import {
  processLoanPayment,
  repayLoanEarly,
  takeLoan,
} from "@/engine/finance/loans";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { reconcileFinancialLedger } from "@/engine/finance/saveMigration";
import { hireEmployee } from "@/engine/finance/agency";
import { hireAssistantScout } from "@/engine/finance/assistantScouts";
import {
  annualizeWeeklyAmount,
  monthlyEquivalentOfWeeklyAmount,
} from "@/engine/core/annualization";
import {
  closeSatelliteOffice,
  getHomeBaseRelocationQuote,
  openSatelliteOffice,
  relocateHomeBase,
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
  it.each([38, 46, 50])(
    "pays twelve equal financial periods in a %i-week competition",
    (seasonLength) => {
      const created = createScout(CONFIG, new RNG(`salary-periods-${seasonLength}`));
      const scout = {
        ...created,
        careerPath: "club" as const,
        salary: 1_000,
      };
      let finances = initializeFinances(scout, "club", "normal");
      for (let week = 1; week <= seasonLength; week += 1) {
        finances = processWeeklyFinances(finances, scout, week, 1, seasonLength);
      }

      const salaryTransactions = finances.transactions.filter((transaction) =>
        transaction.referenceId?.endsWith(":scout-income")
      );
      const paidSalary = salaryTransactions.reduce(
        (total, transaction) => total + transaction.amount,
        0,
      );
      expect(salaryTransactions).toHaveLength(12);
      expect(paidSalary).toBe(monthlyEquivalentOfWeeklyAmount(1_000) * 12);
      expect(Math.abs(paidSalary - annualizeWeeklyAmount(1_000))).toBeLessThanOrEqual(6);
    },
  );

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

  it("records loan proceeds and early repayment as auditable cash movements", () => {
    const scout = createScout(CONFIG, new RNG("ledger-loan-lifecycle"));
    const opened = initializeFinances(scout, "independent", "normal");
    const borrowed = takeLoan(opened, "business", 1_000, 1, 1);

    expect(borrowed).not.toBeNull();
    expect(borrowed!.balance - opened.balance).toBe(1_000);
    expect(borrowed!.transactions.at(-1)).toMatchObject({
      week: 1,
      season: 1,
      amount: 1_000,
      referenceId: `loan:${borrowed!.activeLoan!.id}:disbursement`,
    });

    const outstanding = borrowed!.activeLoan!.remainingBalance;
    const repaid = repayLoanEarly(borrowed!, 2, 1);
    expect(repaid).not.toBeNull();
    expect(repaid!.activeLoan).toBeUndefined();
    expect(repaid!.balance - borrowed!.balance).toBe(-outstanding);
    expect(repaid!.transactions.at(-1)).toMatchObject({
      week: 2,
      season: 1,
      amount: -outstanding,
      referenceId: `loan:${borrowed!.activeLoan!.id}:early-repayment:s1w2`,
    });
    expect(repaid!.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))
      .toBe(repaid!.balance);
  });

  it("charges each scheduled loan instalment exactly once outside operating expenses", () => {
    const scout = createScout(CONFIG, new RNG("ledger-loan-payment"));
    const opened = initializeFinances(scout, "independent", "normal");
    const borrowed = takeLoan(opened, "business", 5_000, 1, 1)!;
    const outstandingBeforePayment = borrowed.activeLoan!.remainingBalance;

    const monthly = processWeeklyFinances(borrowed, scout, 4, 1);
    expect(monthly.activeLoan!.remainingBalance).toBe(outstandingBeforePayment);

    const notYetDue = processLoanPayment(monthly, 4, 1);
    expect(notYetDue).toBe(monthly);
    const paid = processLoanPayment(monthly, 5, 1);
    const payment = borrowed.activeLoan!.monthlyPayment;
    const paymentReference = `loan:${borrowed.activeLoan!.id}:payment:s1w5`;
    const operatingTransaction = paid.transactions.find(
      (transaction) => transaction.referenceId === "monthly-finance:s1w4:operating-expenses",
    );
    const paymentTransactions = paid.transactions.filter(
      (transaction) => transaction.referenceId === paymentReference,
    );

    expect(operatingTransaction?.amount).toBe(
      -(sumOperatingExpenses(paid.expenses) - paid.expenses.employeeSalaries),
    );
    expect(paymentTransactions).toEqual([expect.objectContaining({
      amount: -payment,
      description: "Monthly loan payment",
    })]);
    expect(paid.activeLoan!.remainingBalance).toBe(outstandingBeforePayment - payment);

    const displayedExpenseTotal = Object.values(paid.expenses)
      .reduce((total, expense) => total + expense, 0);
    const employeeTransactions = paid.transactions.filter(
      (transaction) => transaction.referenceId?.startsWith("monthly-finance:s1w4:employee:"),
    );
    const chargedExpenseTotal = -(operatingTransaction?.amount ?? 0)
      - employeeTransactions.reduce((total, transaction) => total + transaction.amount, 0)
      - paymentTransactions.reduce((total, transaction) => total + transaction.amount, 0);
    expect(chargedExpenseTotal).toBe(displayedExpenseTotal);

    const replayed = processLoanPayment(paid, 5, 1);
    expect(replayed).toBe(paid);
    expect(replayed.transactions.filter(
      (transaction) => transaction.referenceId === paymentReference,
    )).toHaveLength(1);
    expect(replayed.transactions.reduce((sum, transaction) => sum + transaction.amount, 0))
      .toBe(replayed.balance);
  });

  it("anchors the first loan payment four weeks after origination across season end", () => {
    const scout = createScout(CONFIG, new RNG("ledger-loan-cross-season"));
    const opened = {
      ...initializeFinances(scout, "independent", "normal"),
      balance: 10_000,
    };
    const borrowed = takeLoan(opened, "business", 1_000, 36, 1, 2, 38)!;
    expect(borrowed.activeLoan).toMatchObject({
      nextPaymentWeek: 2,
      nextPaymentSeason: 2,
    });
    expect(processLoanPayment(borrowed, 38, 1, 38)).toBe(borrowed);
    const paid = processLoanPayment(borrowed, 2, 2, 38);
    expect(paid.activeLoan?.paymentsMade).toBe(1);
    expect(paid.activeLoan).toMatchObject({
      nextPaymentWeek: 6,
      nextPaymentSeason: 2,
    });
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
    const closed = closeSatelliteOffice(first!, first!.satelliteOffices[0].id, 12, 2);
    const reopened = openSatelliteOffice(closed, "Iberia", 12, 2, 3);

    expect(first?.satelliteOffices[0].id).toBe("sat_Iberia_s2w12_a1");
    expect(closed.balance).toBe(first!.balance - 1_000);
    expect(closed.transactions.at(-1)?.referenceId).toContain("satellite-close:");
    expect(reopened?.satelliteOffices[0].id).toBe("sat_Iberia_s2w12_a3");
    expect(reopened?.actionSequence).toBe(3);
  });

  it("makes headquarters relocation a costly, persistent network decision", () => {
    const scout = {
      ...createScout(CONFIG, new RNG("ledger-relocation")),
      homeCountry: "england",
      careerPath: "independent" as const,
    };
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      balance: 100_000,
    };
    const withBrazilOffice = openSatelliteOffice(finances, "brazil", 1, 2, 1)!;
    const quote = getHomeBaseRelocationQuote(withBrazilOffice, scout, "brazil", 10, 2);

    expect(quote.eligible).toBe(true);
    const relocated = relocateHomeBase(withBrazilOffice, scout, "brazil", 10, 2)!;

    expect(relocated.scout.homeCountry).toBe("brazil");
    expect(relocated.scout.homeBaseRelocations).toHaveLength(1);
    expect(relocated.finances.balance).toBe(withBrazilOffice.balance - quote.cost);
    expect(relocated.finances.satelliteOffices.map((office) => office.region)).toEqual(["england"]);
    expect(relocated.finances.transactions.at(-1)?.referenceId).toBe(
      relocated.scout.homeBaseRelocations?.[0].id,
    );

    const anotherOffice = openSatelliteOffice(relocated.finances, "france", 11, 2, 3)!;
    expect(getHomeBaseRelocationQuote(anotherOffice, relocated.scout, "france", 20, 2).eligible).toBe(false);
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
