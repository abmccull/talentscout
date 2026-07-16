import { describe, expect, it } from "vitest";
import type { NewGameConfig, RetainerContract } from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  acceptRetainer,
  closeRetainerPeriod,
  getRetainerCloseReferenceId,
  processRetainerRenewals,
} from "@/engine/finance/retainers";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Retainer",
  scoutLastName: "Invariant",
  scoutAge: 32,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "retainer-close-invariant",
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

function activeRetainer(overrides: Partial<RetainerContract> = {}): RetainerContract {
  return {
    id: "retainer-club-1",
    clubId: "club-1",
    tier: 1,
    monthlyFee: 1_000,
    requiredReportsPerMonth: 2,
    reportsDeliveredThisMonth: 2,
    status: "active",
    ...overrides,
  };
}

function financesWithRetainer(contract: RetainerContract, satisfaction = 50) {
  const scout = createScout(CONFIG, new RNG("retainer-close-scout"));
  const finances = initializeFinances(scout, "independent", "normal");
  return {
    ...finances,
    retainerContracts: [contract],
    clientRelationships: [{
      clubId: contract.clubId,
      satisfaction,
      totalReportsDelivered: 0,
      totalRevenue: 0,
      tenureWeeks: 4,
      preferences: [],
      status: "active" as const,
      lastInteractionWeek: 1,
      lastInteractionSeason: 1,
    }],
  };
}

describe("retainer period-close invariant", () => {
  it("pays and resets a fulfilled contract exactly once", () => {
    const before = financesWithRetainer(activeRetainer());
    const referenceId = getRetainerCloseReferenceId("retainer-club-1", 4, 1);

    const closed = closeRetainerPeriod(before, 4, 1);
    const replayed = closeRetainerPeriod(closed.finances, 4, 1);

    expect(closed.events).toEqual([
      expect.objectContaining({
        contractId: "retainer-club-1",
        outcome: "paid",
        amount: 1_000,
        referenceId,
      }),
    ]);
    expect(closed.finances.balance - before.balance).toBe(1_000);
    expect(closed.finances.retainerRevenue - before.retainerRevenue).toBe(1_000);
    expect(closed.finances.retainerContracts[0]).toMatchObject({
      status: "active",
      reportsDeliveredThisMonth: 0,
    });
    expect(closed.finances.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toHaveLength(1);
    expect(replayed.finances).toBe(closed.finances);
    expect(replayed.events).toEqual([]);
    expect(replayed.finances.transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    )).toBe(replayed.finances.balance);
  });

  it("applies one failure, suspends the contract, and records a zero-value close", () => {
    const before = financesWithRetainer(activeRetainer({ reportsDeliveredThisMonth: 1 }));
    const referenceId = getRetainerCloseReferenceId("retainer-club-1", 4, 1);

    const closed = closeRetainerPeriod(before, 4, 1);
    const replayed = closeRetainerPeriod(closed.finances, 4, 1);

    expect(closed.events).toEqual([
      expect.objectContaining({ outcome: "missed", amount: 0, referenceId }),
    ]);
    expect(closed.finances.clientRelationships[0].satisfaction).toBe(40);
    expect(closed.finances.retainerContracts[0]).toMatchObject({
      status: "suspended",
      reportsDeliveredThisMonth: 0,
    });
    expect(closed.finances.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toEqual([expect.objectContaining({ amount: 0 })]);
    expect(replayed.finances).toBe(closed.finances);
    expect(replayed.events).toEqual([]);
    expect(replayed.reputationPenalty).toBe(0);
  });

  it("reports a termination penalty once when satisfaction crosses the threshold", () => {
    const before = financesWithRetainer(
      activeRetainer({ reportsDeliveredThisMonth: 0 }),
      30,
    );
    const referenceId = getRetainerCloseReferenceId("retainer-club-1", 8, 1);

    const closed = closeRetainerPeriod(before, 8, 1);
    const replayed = closeRetainerPeriod(closed.finances, 8, 1);

    expect(closed.events).toEqual([
      expect.objectContaining({ outcome: "terminated", referenceId }),
    ]);
    expect(closed.reputationPenalty).toBe(5);
    expect(closed.finances.retainerContracts).toEqual([]);
    expect(closed.finances.failedContractCount).toBe(1);
    expect(closed.finances.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toHaveLength(1);
    expect(replayed.finances).toBe(closed.finances);
    expect(replayed.events).toEqual([]);
    expect(replayed.reputationPenalty).toBe(0);
  });

  it("does not close a period on an ordinary week", () => {
    const before = financesWithRetainer(activeRetainer());
    const result = closeRetainerPeriod(before, 3, 1);

    expect(result.finances).toBe(before);
    expect(result.events).toEqual([]);
    expect(result.reputationPenalty).toBe(0);
  });

  it("anchors settlement and renewal dates to the contract start", () => {
    const created = createScout(CONFIG, new RNG("retainer-relative-scout"));
    const scout = {
      ...created,
      careerPath: "independent" as const,
      independentTier: 2 as const,
    };
    const base = initializeFinances(scout, "independent", "normal");
    const contract = activeRetainer({
      offeredWeek: 3,
      offeredSeason: 1,
      termMonths: 3,
    });
    const accepted = acceptRetainer(base, contract, scout, 38);
    expect(accepted).not.toBeNull();
    if (!accepted) return;

    const withRelationship = {
      ...accepted,
      clientRelationships: [{
        clubId: contract.clubId,
        satisfaction: 50,
        totalReportsDelivered: 0,
        totalRevenue: 0,
        tenureWeeks: 0,
        preferences: [],
        status: "active" as const,
        lastInteractionWeek: 3,
        lastInteractionSeason: 1,
      }],
    };
    expect(withRelationship.retainerContracts[0]).toMatchObject({
      startWeek: 3,
      startSeason: 1,
      nextSettlementWeek: 7,
      nextSettlementSeason: 1,
      termEndsWeek: 15,
      termEndsSeason: 1,
    });

    expect(closeRetainerPeriod(withRelationship, 4, 1, 38).events).toEqual([]);
    const settled = closeRetainerPeriod(withRelationship, 7, 1, 38);
    expect(settled.events[0]).toMatchObject({ outcome: "paid", amount: 1_000 });
    expect(settled.finances.retainerContracts[0]).toMatchObject({
      nextSettlementWeek: 11,
      nextSettlementSeason: 1,
    });

    const beforeTerm = processRetainerRenewals(
      new RNG("retainer-renew-before"),
      settled.finances,
      12,
      1,
      38,
    );
    expect(beforeTerm.retainerContracts[0].termEndsWeek).toBe(15);
    const renewed = processRetainerRenewals(
      new RNG("retainer-renew-due"),
      beforeTerm,
      15,
      1,
      38,
    );
    expect(renewed.retainerContracts[0]).toMatchObject({
      status: "active",
      termEndsWeek: 27,
      termEndsSeason: 1,
    });
  });
});
