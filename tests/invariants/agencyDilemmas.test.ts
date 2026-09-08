import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConsequenceEngineState, expireDueDecisions, selectDecisionOption } from "@/engine/consequences";
import type { ClientRelationship, Club, FinancialRecord, GameState, Player, Scout, ScoutReport } from "@/engine/core/types";
import {
  applyPreparedAgencyDilemma,
  prepareWeeklyAgencyDilemmaCandidate,
  reconcileAgencyDilemmaDecisions,
} from "@/engine/finance";
import { recordRetainerDelivery } from "@/engine/finance/retainers";
import { isValidYouthRetainerBrief } from "@/engine/finance/retainerBriefs";
import { migrateSaveState } from "@/lib/db";
import {
  applyDirectedWeeklyScoutingEcology,
  type PreparedWeeklyScoutingEcology,
} from "@/stores/actions/weeklyScoutingEcologyPhase";

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout",
    firstName: "Lena",
    lastName: "Ward",
    age: 31,
    homeCountry: "england",
    skills: {} as Scout["skills"],
    attributes: {} as Scout["attributes"],
    primarySpecialization: "youth",
    specializationLevel: 8,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 3,
    careerPath: "independent",
    independentTier: 3,
    reputation: 54,
    clubTrust: 50,
    specializationReputation: 48,
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 18,
    ...overrides,
  } as Scout;
}

function clientRelationship(
  clubId: string,
  totalRevenue: number,
  satisfaction: number,
  status: ClientRelationship["status"] = "active",
): ClientRelationship {
  return {
    clubId,
    satisfaction,
    totalReportsDelivered: 4,
    totalRevenue,
    tenureWeeks: 18,
    preferences: ["youth"],
    status,
    lastInteractionWeek: 6,
    lastInteractionSeason: 1,
    failedContracts: 0,
  };
}

function finances(overrides: Partial<FinancialRecord> = {}): FinancialRecord {
  return {
    balance: 6_500,
    transactions: [],
    careerPath: "independent",
    independentTier: 3,
    reportSalesRevenue: 0,
    placementFeeRevenue: 0,
    retainerRevenue: 0,
    consultingRevenue: 0,
    sellOnRevenue: 0,
    bonusRevenue: 0,
    retainerContracts: [],
    placementFeeRecords: [],
    reportListings: [],
    consultingContracts: [],
    office: { tier: "small", monthlyCost: 500, qualityBonus: 0.1, maxEmployees: 3 },
    employees: [],
    analystReviews: [],
    lifestyle: { level: 2, monthlyCost: 300, networkingBonus: 0, salaryOfferBonus: 0 },
    completedCourses: [],
    pendingRetainerOffers: [],
    pendingConsultingOffers: [],
    marketTemperature: "normal",
    activeEconomicEvents: [],
    clientRelationships: [],
    pendingEmployeeEvents: [],
    satelliteOffices: [],
    awards: [],
    loans: [],
    starterBonus: {
      firstPlacementBonusUsed: false,
      firstReportBonusUsed: false,
      starterStipendWeeksRemaining: 0,
    },
    ...overrides,
  } as FinancialRecord;
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentWeek: 8,
    currentSeason: 1,
    fixtures: {},
    countries: ["england", "spain", "germany"],
    runManifest: {
      rootSeed: "agency-dilemma-test-seed",
      specialization: "youth",
    },
    scout: scout(),
    finances: finances(),
    contacts: {
      england_contact: {
        id: "england_contact",
        name: "Tom Hale",
        type: "coach",
        relationship: 56,
        trustLevel: 58,
        country: "england",
        region: "england",
      },
      spain_contact: {
        id: "spain_contact",
        name: "Ines Roca",
        type: "agent",
        relationship: 53,
        trustLevel: 54,
        country: "spain",
        region: "spain",
      },
    },
    clubs: {
      alpha: { id: "alpha", name: "Alpha FC", playerIds: [] },
      beta: { id: "beta", name: "Beta United", playerIds: [] },
      gamma: { id: "gamma", name: "Gamma Athletic", playerIds: [] },
    },
    regionalKnowledge: {
      england: { familiarity: 62 },
      spain: { familiarity: 22 },
    },
    players: {},
    retiredPlayers: {},
    unsignedYouth: {},
    reports: {},
    watchlist: [],
    inbox: [],
    consequenceState: createConsequenceEngineState(),
    accessAgreements: {},
    rivalOrganizationState: {
      organizations: {},
      activities: [],
      opportunities: {},
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
        youthProgressBonus: 0,
      },
      processedWeekKeys: [],
      campaignState: { campaigns: {}, processedWeekKeys: [] },
    },
    rivalScouts: {},
    managerProfiles: {},
    boardProfile: undefined,
    narrativeEvents: [],
    eventChains: [],
    activeStorylines: [],
    worldConditionArcState: undefined,
    careerStoryArchive: [],
    npcScouts: {},
    ...overrides,
  } as unknown as GameState;
}

describe("agency dilemmas", () => {
  it.each([
    { choice: "exclusiveAnchor", context: "clientConcentration", balance: 6_500, secondStatus: "active" as const },
    { choice: "signatureRetainer", context: "capitalCrossroads", balance: 900, secondStatus: "prospect" as const },
  ])("creates a deliverable $choice contract with the same terms before and after reload", ({ choice, context, balance, secondStatus }) => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url)), "utf8"));
    const initial = migrateSaveState({
      ...fixture.state,
      ...baseState({
        currentWeek: 45,
        countries: ["england"],
        regionalKnowledge: {},
        contacts: {},
        scout: scout({ reputation: 62, independentTier: 3, careerTier: 3 }),
        finances: finances({ balance, clientRelationships: [
          clientRelationship("alpha", 18_000, 74),
          clientRelationship("beta", 6_000, 61, secondStatus),
        ] }),
      }),
      fixtures: { final: { id: "final", week: 46, season: 1, homeClubId: "alpha", awayClubId: "beta", played: false } },
      clubs: Object.fromEntries(["alpha", "beta"].map((id) => [id, {
        id, name: `${id} FC`, shortName: id, managerId: `manager-${id}`, leagueId: "league-1",
        reputation: 50, budget: 1_000_000, scoutingPhilosophy: "academyFirst",
        playerIds: [], academyPlayerIds: [], youthAcademyRating: 12,
      } satisfies Club])),
    });
    const prepared = prepareWeeklyAgencyDilemmaCandidate({ state: initial, forceTrigger: true }).prepared;
    expect(prepared?.context.id).toBe(context);
    const offered = applyPreparedAgencyDilemma(initial, prepared!).state;
    const decision = Object.values(offered.consequenceState.decisions).find((entry) => entry.source.kind === "agencyDilemma")!;
    const now = { season: initial.currentSeason, week: initial.currentWeek };
    const selected = selectDecisionOption(offered.consequenceState, decision.id, choice, now);
    expect(selected.changed).toBe(true);
    const selectedState = { ...offered, consequenceState: selected.state };
    const staleClubState = { ...selectedState, clubs: {} };
    expect(reconcileAgencyDilemmaDecisions(staleClubState, now)).toBe(staleClubState);
    const created = reconcileAgencyDilemmaDecisions(selectedState, now);
    const contract = created.finances!.retainerContracts[0];
    expect(isValidYouthRetainerBrief(contract.brief)).toBe(true);
    expect(contract).toMatchObject({
      startWeek: 45, startSeason: 1, nextSettlementWeek: 3, nextSettlementSeason: 2,
      termEndsWeek: 15, termEndsSeason: 2, averageDeliveredQuality: 0,
      consecutivePeriodsMet: 0, consecutivePeriodsMissed: 0,
    });

    // A later roster change must not redefine work that was already promised.
    const player = { id: "delivery-player", age: 17, position: contract.brief!.targetPositions[0] } as Player;
    const changedRoster = {
      ...created,
      players: { ...created.players, [player.id]: player },
      clubs: { ...created.clubs, alpha: { ...created.clubs.alpha, playerIds: [player.id] } },
    };
    const reloaded = migrateSaveState(JSON.parse(JSON.stringify(changedRoster)));
    expect(reloaded.finances!.retainerContracts).toEqual(created.finances!.retainerContracts);
    const report = { id: "retainer-report", qualityScore: 90 } as ScoutReport;
    const direct = recordRetainerDelivery(created.finances!, "alpha", report, player);
    const afterReload = recordRetainerDelivery(reloaded.finances!, "alpha", report, player);
    expect(direct.retainerContracts[0]).toMatchObject({
      reportsDeliveredThisMonth: 1, deliveredReportIds: [report.id], averageDeliveredQuality: 90,
    });
    expect(afterReload.retainerContracts).toEqual(direct.retainerContracts);
    expect(recordRetainerDelivery(direct, "alpha", report, player).retainerContracts).toEqual(direct.retainerContracts);
    expect(reconcileAgencyDilemmaDecisions(created, now).finances).toEqual(created.finances);
    expect(reconcileAgencyDilemmaDecisions(reloaded, now).finances!.retainerContracts).toEqual(created.finances!.retainerContracts);
  });

  it("surfaces through the shared scouting ecology gate", () => {
    const state = baseState({
      finances: finances({
        clientRelationships: [
          clientRelationship("alpha", 18_000, 74),
          clientRelationship("beta", 6_000, 61),
        ],
      }),
      scout: scout({ reputation: 50, independentTier: 2, careerTier: 2 }),
    });

    const forcedAgency = prepareWeeklyAgencyDilemmaCandidate({
      state,
      forceTrigger: true,
    }).prepared;
    const prepared: PreparedWeeklyScoutingEcology = {
      agencyDilemma: forcedAgency,
      candidates: forcedAgency ? [forcedAgency.candidate] : [],
    };
    const candidateId = forcedAgency?.candidate.id;

    expect(forcedAgency?.context.id).toBe("clientConcentration");
    expect(candidateId).toBeTruthy();

    const accepted = applyDirectedWeeklyScoutingEcology({
      state,
      prepared,
      acceptedCandidateIds: new Set([candidateId!]),
    });

    expect(Object.values(accepted.consequenceState.decisions).filter(
      (decision) => decision.source.kind === "agencyDilemma",
    )).toHaveLength(1);
    expect(accepted.inbox.some((message) => message.relatedId === candidateId)).toBe(true);
  });

  it("applies concentration choices exactly once with real finance and policy effects", () => {
    const initialState = baseState({
      finances: finances({
        clientRelationships: [
          clientRelationship("alpha", 18_000, 74),
          clientRelationship("beta", 6_000, 61),
        ],
        retainerContracts: [{
          id: "retainer-alpha",
          clubId: "alpha",
          tier: 2,
          monthlyFee: 1_800,
          requiredReportsPerMonth: 2,
          reportsDeliveredThisMonth: 0,
          status: "active",
        }],
      }),
      scout: scout({ reputation: 50, independentTier: 2, careerTier: 2 }),
    });

    const prepared = prepareWeeklyAgencyDilemmaCandidate({
      state: initialState,
      forceTrigger: true,
    }).prepared;
    expect(prepared?.context.id).toBe("clientConcentration");

    const offered = applyPreparedAgencyDilemma(initialState, prepared!).state;
    const decision = Object.values(offered.consequenceState.decisions).find(
      (entry) => entry.source.kind === "agencyDilemma",
    );
    expect(decision).toBeDefined();

    const selected = selectDecisionOption(
      offered.consequenceState,
      decision!.id,
      "exclusiveAnchor",
      { season: offered.currentSeason, week: offered.currentWeek },
    );
    expect(selected.changed).toBe(true);

    const reconciled = reconcileAgencyDilemmaDecisions({
      ...offered,
      consequenceState: selected.state,
    }, { season: offered.currentSeason, week: offered.currentWeek });
    const replayed = reconcileAgencyDilemmaDecisions(
      reconciled,
      { season: offered.currentSeason, week: offered.currentWeek },
    );
    expect(reconciled.finances).toBeDefined();
    expect(replayed.finances).toBeDefined();

    const alphaRetainer = reconciled.finances!.retainerContracts.find((contract) => contract.clubId === "alpha");
    expect(alphaRetainer?.monthlyFee).toBe(1_800);
    expect(reconciled.finances!.clientRelationships.find((client) => client.clubId === "alpha")?.satisfaction).toBe(84);
    expect(reconciled.finances!.clientRelationships.find((client) => client.clubId === "beta")?.satisfaction).toBe(55);
    expect(reconciled.finances!.agencyStrategyState?.policy).toBe("stableRetainers");
    expect(reconciled.finances!.transactions.filter(
      (transaction) => transaction.referenceId === `agency-dilemma:${decision!.id}:exclusiveAnchor`,
    )).toHaveLength(1);
    expect(replayed.finances!.transactions.filter(
      (transaction) => transaction.referenceId === `agency-dilemma:${decision!.id}:exclusiveAnchor`,
    )).toHaveLength(1);
    expect(replayed.finances!.retainerContracts.find((contract) => contract.clubId === "alpha")?.monthlyFee).toBe(1_800);
  });

  it("bounds capital crossroads to one resolved funding choice and keeps retainers idempotent", () => {
    const initialState = baseState({
      countries: ["england"],
      contacts: {
        england_contact: {
          id: "england_contact",
          name: "Tom Hale",
          type: "academyCoach",
          organization: "England Academy Network",
          relationship: 56,
          reliability: 64,
          knownPlayerIds: [],
          trustLevel: 58,
          country: "england",
          region: "england",
        },
      },
      regionalKnowledge: {
        england: {
          countryId: "england",
          knowledgeLevel: 62,
          discoveredLeagues: [],
          culturalInsights: [],
          localContacts: ["england_contact"],
          scoutingEfficiency: 1.12,
        },
      },
      finances: finances({
        balance: 900,
        clientRelationships: [
          clientRelationship("alpha", 18_000, 74),
          clientRelationship("beta", 6_000, 61, "prospect"),
        ],
      }),
      scout: scout({ reputation: 62, independentTier: 3, careerTier: 3 }),
    });

    const prepared = prepareWeeklyAgencyDilemmaCandidate({
      state: initialState,
      forceTrigger: true,
    }).prepared;
    expect(prepared?.context.id).toBe("capitalCrossroads");

    const offered = applyPreparedAgencyDilemma(initialState, prepared!).state;
    const decision = Object.values(offered.consequenceState.decisions).find(
      (entry) => entry.source.kind === "agencyDilemma",
    );
    expect(decision).toBeDefined();

    const selected = selectDecisionOption(
      offered.consequenceState,
      decision!.id,
      "signatureRetainer",
      { season: offered.currentSeason, week: offered.currentWeek },
    );

    const reconciled = reconcileAgencyDilemmaDecisions({
      ...offered,
      consequenceState: selected.state,
    }, { season: offered.currentSeason, week: offered.currentWeek });
    const replayed = reconcileAgencyDilemmaDecisions(
      reconciled,
      { season: offered.currentSeason, week: offered.currentWeek },
    );

    const alphaRetainers = replayed.finances?.retainerContracts.filter((contract) => contract.clubId === "alpha") ?? [];
    expect(alphaRetainers).toHaveLength(1);
    expect(alphaRetainers[0]?.monthlyFee).toBe(2_400);
    expect(alphaRetainers[0]?.requiredReportsPerMonth).toBe(3);

    const futureState = {
      ...replayed,
      currentWeek: replayed.currentWeek + 9,
      consequenceState: expireDueDecisions(
        replayed.consequenceState,
        { season: replayed.currentSeason, week: replayed.currentWeek + 9 },
      ).state,
    };
    expect(prepareWeeklyAgencyDilemmaCandidate({
      state: futureState,
      forceTrigger: true,
    }).blockedReason).toBe("no-eligible-dilemma");
  });

  it("applies defaulted regional choices once during weekly consequence expiry", () => {
    const initialState = baseState({
      scout: scout({ reputation: 50, independentTier: 3, careerTier: 3 }),
      finances: finances({
        balance: 8_000,
        clientRelationships: [clientRelationship("alpha", 9_000, 69)],
        retainerContracts: [{
          id: "retainer-alpha",
          clubId: "alpha",
          tier: 2,
          monthlyFee: 1_500,
          requiredReportsPerMonth: 2,
          reportsDeliveredThisMonth: 0,
          status: "active",
        }],
      }),
    });

    const prepared = prepareWeeklyAgencyDilemmaCandidate({
      state: initialState,
      forceTrigger: true,
    }).prepared;
    expect(prepared?.context.id).toBe("regionalCommitment");

    const offered = applyPreparedAgencyDilemma(initialState, prepared!).state;
    const decision = Object.values(offered.consequenceState.decisions).find(
      (entry) => entry.source.kind === "agencyDilemma",
    );
    expect(decision).toBeDefined();

    const afterDeadline = {
      ...offered,
      currentWeek: 11,
    };
    const expired = expireDueDecisions(
      afterDeadline.consequenceState,
      { season: afterDeadline.currentSeason, week: afterDeadline.currentWeek },
    );
    const reconciled = reconcileAgencyDilemmaDecisions({
      ...afterDeadline,
      consequenceState: expired.state,
    }, { season: afterDeadline.currentSeason, week: afterDeadline.currentWeek });
    expect(reconciled.finances).toBeDefined();

    expect(reconciled.finances!.agencyStrategyState?.policy).toBe("regionalDepth");
    expect(reconciled.finances!.agencyStrategyState?.focusRegionId).toBe("england");
    expect(Object.values(reconciled.accessAgreements ?? {}).some((agreement) =>
      agreement.scope === "regionalIntro" && agreement.regionId === "england",
    )).toBe(true);
    expect(reconciled.consequenceState.facts[`fact:${decision!.id}:domain-applied`]).toBeDefined();
  });
});
