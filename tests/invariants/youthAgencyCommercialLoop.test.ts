import { describe, expect, it } from "vitest";

import type {
  AcademyRecruitmentBrief,
} from "@/engine/youth/recruitmentBriefs";
import type {
  ClubDecision,
  ConsultingContract,
  GameState,
  NewGameConfig,
  Observation,
  PlacementReport,
  Player,
  PlayerMovementEvent,
  Scout,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { initializeFinances, settleYouthAgencyPlacement } from "@/engine/finance";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { observePlayerLight } from "@/engine/scout/perception";
import {
  fulfillAcademyRecruitmentBrief,
} from "@/engine/youth/recruitmentBriefs";
import { createReportActions } from "@/stores/actions/reportActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Youth",
  scoutLastName: "Commercial",
  scoutAge: 32,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "youth-commercial-loop",
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

function makeScout(
  overrides: Partial<Scout> = {},
): Scout {
  return {
    ...createScout(CONFIG, new RNG("youth-commercial-scout")),
    careerPath: "independent" as const,
    careerTier: 3,
    independentTier: 3,
    ...overrides,
  } as Scout;
}

function makeUnsignedYouthPlayer(overrides: Partial<Player> = {}): Player {
  return generatePlayer(new RNG("youth-commercial-player"), {
    position: "CM",
    ageRange: [16, 16],
    abilityRange: [96, 96],
    nationality: "English",
    clubId: "club-origin",
    firstName: "Ari",
    lastName: "Unsigned",
    ...overrides,
  });
}

function withDate(observation: Observation, index: number): Observation {
  return { ...observation, week: index + 1, season: 1 };
}

function makeBrief(overrides: Partial<AcademyRecruitmentBrief> = {}): AcademyRecruitmentBrief {
  return {
    id: "brief-1",
    clubId: "club-client",
    type: "academyPlacement",
    createdWeek: 1,
    createdSeason: 1,
    expiresWeek: 10,
    expiresSeason: 1,
    requiredPositions: ["CM"],
    preferredRole: "boxToBox",
    developmentPriority: "highCeiling",
    maxAge: 17,
    riskTolerance: "medium",
    weeklyWageBudget: 900,
    competitionPressure: 40,
    status: "open",
    targetPosition: "CM",
    priority: "high",
    reason: "thinDepth",
    rationale: "The academy needs a central midfielder with pathway upside.",
    ageRange: [15, 17],
    minimumReportQuality: 60,
    minimumConviction: "recommend",
    issuedWeek: 1,
    issuedSeason: 1,
    ...overrides,
  };
}

function makeStructuredInput() {
  return {
    briefId: "brief-1",
    intendedClubId: "club-client",
    intendedAudience: "academyDirector" as const,
    recruitmentNeed: "Add a credible central-midfield pathway option.",
    projectedRole: "boxToBox" as const,
    recommendedAction: "offerAcademyPlace" as const,
    riskFactors: ["Physical adaptation"],
    estimatedWeeklyWage: 650,
    decisionDeadlineWeek: 7,
    decisionDeadlineSeason: 1,
    categoryVerdicts: {
      potential: {
        verdict: "High-upside central midfielder with repeatable habits.",
        confidence: "high" as const,
        hypothesisIds: ["hyp-potential"],
        acknowledgedUncertainty: "Needs a bigger sample against stronger peers.",
      },
      roleFit: {
        verdict: "Profiles naturally into a box-to-box academy role.",
        confidence: "high" as const,
        hypothesisIds: ["hyp-role"],
        acknowledgedUncertainty: "Must prove the same rhythm at pro tempo.",
      },
      characterRisk: {
        verdict: "Handles coaching well and responds to adversity.",
        confidence: "medium" as const,
        hypothesisIds: ["hyp-character"],
        acknowledgedUncertainty: "Still need one more away-day environment.",
      },
    },
    alternativePlayerIds: [],
  };
}

function makeConsultingContract(): ConsultingContract {
  return {
    id: "consulting-youth-audit",
    clubId: "club-client",
    type: "youthAudit",
    fee: 7_500,
    deadline: 8,
    deadlineSeason: 1,
    status: "active",
    deliveredReportIds: [],
    deliverables: [
      { type: "reports", description: "Three academy pathway reports", required: 3, delivered: 0 },
      { type: "analysis", description: "Academy pipeline audit", required: 1, delivered: 0 },
      { type: "presentation", description: "Academy findings presentation", required: 1, delivered: 0 },
    ],
  };
}

describe("youth agency commercial loop", () => {
  it("credits unsigned-youth reports to the intended client club and only counts new cases", () => {
    const scout = makeScout();
    const player = makeUnsignedYouthPlayer();
    const unsignedYouth = {
      id: "unsigned-1",
      player,
      visibility: 55,
      buzzLevel: 40,
      discoveredBy: [scout.id],
      regionId: "region-1",
      country: "England",
      venueAppearances: [],
      generatedSeason: 1,
      placed: false,
      retired: false,
    };
    const firstObservation = withDate(observePlayerLight(
      new RNG("unsigned-observation-1"),
      player,
      scout,
      "academyVisit",
      [],
    ), 0);
    const secondObservation = withDate(observePlayerLight(
      new RNG("unsigned-observation-2"),
      player,
      scout,
      "liveMatch",
      [firstObservation],
    ), 1);
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      retainerContracts: [{
        id: "retainer-client",
        clubId: "club-client",
        tier: 1,
        monthlyFee: 1_000,
        requiredReportsPerMonth: 2,
        reportsDeliveredThisMonth: 0,
        status: "active" as const,
        deliveredReportIds: [],
      }, {
        id: "retainer-origin",
        clubId: "club-origin",
        tier: 1,
        monthlyFee: 1_000,
        requiredReportsPerMonth: 2,
        reportsDeliveredThisMonth: 0,
        status: "active" as const,
        deliveredReportIds: [],
      }],
      consultingContracts: [makeConsultingContract()],
      clientRelationships: [],
    };
    const brief = makeBrief();

    let store = {
      gameState: {
        seed: CONFIG.worldSeed,
        currentWeek: 1,
        currentSeason: 1,
        difficulty: CONFIG.difficulty,
        scout,
        players: {},
        unsignedYouth: { [unsignedYouth.id]: unsignedYouth },
        retiredPlayers: {},
        observations: {
          [firstObservation.id]: firstObservation,
          [secondObservation.id]: secondObservation,
        },
        reports: {},
        scoutingCases: {},
        discoveryRecords: [],
        clubResponses: [],
        systemFitCache: {},
        predictions: [],
        inbox: [],
        finances,
        youthRecruitmentBriefs: { [brief.id]: brief },
        scoutingInfrastructure: {
          dataSubscription: "none",
          travelBudget: "economy",
          officeEquipment: "professional",
          investmentCosts: { weekly: 0, oneTime: 0 },
        },
      } as unknown as GameState,
      selectedPlayerId: unsignedYouth.id,
      currentScreen: "reportWriter",
      pendingListingReportId: null,
    } as unknown as GameStoreState;
    const get = (() => store) as GetState;
    const set = ((partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    }) as SetState;
    const actions = createReportActions(get, set);
    const structured = makeStructuredInput();

    actions.submitReport(
      "recommend",
      "Decision-ready unsigned youth report for the client academy.",
      ["Tempo control", "Receives on the half-turn"],
      ["Needs more aerial duels"],
      structured,
    );

    const afterFirst = store.gameState!;
    const storedReport = Object.values(afterFirst.reports)[0];
    const clientRetainer = afterFirst.finances!.retainerContracts.find(
      (contract) => contract.clubId === "club-client",
    )!;
    const originRetainer = afterFirst.finances!.retainerContracts.find(
      (contract) => contract.clubId === "club-origin",
    )!;
    const clientRelationship = afterFirst.finances!.clientRelationships.find(
      (relationship) => relationship.clubId === "club-client",
    );
    const originRelationship = afterFirst.finances!.clientRelationships.find(
      (relationship) => relationship.clubId === "club-origin",
    );
    const consulting = afterFirst.finances!.consultingContracts[0];

    expect(storedReport.intendedClubId).toBe("club-client");
    expect(storedReport.qualityScore).toBeGreaterThanOrEqual(50);
    expect(clientRetainer.reportsDeliveredThisMonth).toBe(1);
    expect(clientRetainer.deliveredReportIds).toEqual([storedReport.id]);
    expect(originRetainer.reportsDeliveredThisMonth).toBe(0);
    expect(originRetainer.deliveredReportIds).toEqual([]);
    expect(clientRelationship).toMatchObject({
      clubId: "club-client",
      totalReportsDelivered: 1,
      totalRevenue: 0,
      status: "active",
    });
    expect(originRelationship).toBeUndefined();
    expect(consulting.deliveredReportIds).toEqual([storedReport.id]);
    expect(consulting.deliverables).toEqual([
      expect.objectContaining({ type: "reports", delivered: 1 }),
      expect.objectContaining({ type: "analysis", delivered: 1 }),
      expect.objectContaining({ type: "presentation", delivered: 0 }),
    ]);

    const thirdObservation = withDate(observePlayerLight(
      new RNG("unsigned-observation-3"),
      player,
      scout,
      "videoAnalysis",
      [firstObservation, secondObservation],
    ), 2);
    store = {
      ...store,
      currentScreen: "reportWriter",
      gameState: {
        ...afterFirst,
        currentWeek: 2,
        observations: {
          ...afterFirst.observations,
          [thirdObservation.id]: thirdObservation,
        },
      },
    };

    actions.submitReport(
      "strongRecommend",
      "Revision with new evidence, but still the same client case.",
      ["Tempo control", "Receives on the half-turn", "Defensive coverage"],
      ["Needs more aerial duels"],
      structured,
    );

    const afterRevision = store.gameState!;
    const revisedClientRetainer = afterRevision.finances!.retainerContracts.find(
      (contract) => contract.clubId === "club-client",
    )!;
    const revisedRelationship = afterRevision.finances!.clientRelationships.find(
      (relationship) => relationship.clubId === "club-client",
    )!;
    const revisedConsulting = afterRevision.finances!.consultingContracts[0];

    expect(Object.values(afterRevision.reports)).toHaveLength(2);
    expect(revisedClientRetainer.reportsDeliveredThisMonth).toBe(1);
    expect(revisedClientRetainer.deliveredReportIds).toEqual([storedReport.id]);
    expect(revisedRelationship.totalReportsDelivered).toBe(1);
    expect(revisedConsulting.deliveredReportIds).toEqual([storedReport.id]);
  });

  it("fulfills academy briefs only from the canonical placed case and youth signing", () => {
    const brief = makeBrief();
    const player = makeUnsignedYouthPlayer({ id: "player-fulfill", clubId: "club-client" });
    const scoutingCase: ScoutingCase = {
      id: "case-1",
      playerId: player.id,
      scoutId: "scout-1",
      openedWeek: 1,
      openedSeason: 1,
      lastUpdatedWeek: 5,
      lastUpdatedSeason: 1,
      status: "placed",
      briefId: brief.id,
      reportIds: ["report-1"],
      listingIds: [],
      deliveryIds: ["delivery-1"],
      decisionIds: ["decision-1"],
      placementReportIds: ["placement-1"],
      hypothesisIds: [],
      reviewIds: [],
    };
    const report: ScoutReport = {
      id: "report-1",
      caseId: scoutingCase.id,
      briefId: brief.id,
      playerId: player.id,
      scoutId: "scout-1",
      submittedWeek: 2,
      submittedSeason: 1,
      attributeAssessments: [],
      strengths: ["Intelligent movement"],
      weaknesses: ["Physical adaptation"],
      conviction: "recommend",
      summary: "Decision-ready academy recommendation.",
      estimatedValue: 0,
      qualityScore: 75,
    };
    const placementReport: PlacementReport = {
      id: "placement-1",
      reportId: report.id,
      caseId: scoutingCase.id,
      deliveryId: "delivery-1",
      decisionId: "decision-1",
      briefId: brief.id,
      unsignedYouthId: "unsigned-fulfill",
      targetClubId: brief.clubId,
      scoutId: report.scoutId,
      conviction: report.conviction,
      clubResponse: "accepted",
      placementType: "youthContract",
      qualityScore: report.qualityScore,
      week: 4,
      season: 1,
    };
    const clubDecision: ClubDecision = {
      id: "decision-1",
      caseId: scoutingCase.id,
      deliveryId: "delivery-1",
      reportId: report.id,
      clubId: brief.clubId,
      outcome: "accepted",
      decidedWeek: 5,
      decidedSeason: 1,
      placementReportId: placementReport.id,
    };
    const movement: PlayerMovementEvent = {
      id: "movement-1",
      playerId: player.id,
      type: "youthSigning",
      week: 5,
      season: 1,
      toClubId: brief.clubId,
      contractClubId: brief.clubId,
      reason: "Placement report accepted",
    };

    const missingMovement = fulfillAcademyRecruitmentBrief({
      brief,
      player,
      playerAgeAtPlacement: 16,
      scoutingCase,
      report,
      placementReport,
      clubDecision,
      movementHistory: [],
      currentWeek: 5,
      currentSeason: 1,
    });
    expect(missingMovement.fulfilled).toBe(false);
    expect(missingMovement.failures).toContain("missingCanonicalYouthSigning");

    const fulfilled = fulfillAcademyRecruitmentBrief({
      brief,
      player,
      playerAgeAtPlacement: 16,
      scoutingCase,
      report,
      placementReport,
      clubDecision,
      movementHistory: [movement],
      currentWeek: 5,
      currentSeason: 1,
    });
    expect(fulfilled.fulfilled).toBe(true);
    expect(fulfilled.brief).toMatchObject({
      status: "fulfilled",
      fulfilledCaseId: scoutingCase.id,
      fulfilledReportId: report.id,
      fulfilledPlacementReportId: placementReport.id,
      fulfilledDecisionId: clubDecision.id,
      fulfilledMovementId: movement.id,
      assignedCaseId: scoutingCase.id,
      fulfilledByPlayerId: player.id,
    });
  });

  it("settles the independent youth placement once and routes club scouts to a smaller bonus", () => {
    const independentScout = makeScout({ reputation: 60 });
    const independentFinances = initializeFinances(independentScout, "independent", "normal");

    const first = settleYouthAgencyPlacement({
      finances: independentFinances,
      scout: independentScout,
      report: { conviction: "recommend" },
      placementReport: { placementType: "youthContract" },
      club: { id: "club-client", reputation: 72 },
      playerId: "player-1",
      playerAge: 16,
      movementId: "movement-commercial",
      week: 5,
      season: 1,
    });
    const replay = settleYouthAgencyPlacement({
      finances: first.finances,
      scout: independentScout,
      report: { conviction: "recommend" },
      placementReport: { placementType: "youthContract" },
      club: { id: "club-client", reputation: 72 },
      playerId: "player-1",
      playerAge: 16,
      movementId: "movement-commercial",
      week: 5,
      season: 1,
    });

    expect(first.rewardKind).toBe("placementFee");
    expect(first.amount).toBeGreaterThan(0);
    expect(first.referenceId).toBe(replay.referenceId);
    expect(first.finances.placementFeeRevenue).toBe(first.amount);
    expect(first.finances.placementFeeRecords).toHaveLength(1);
    expect(first.finances.transactions.filter(
      (transaction) => transaction.referenceId === first.referenceId,
    )).toHaveLength(1);
    expect(first.finances.clientRelationships.find(
      (relationship) => relationship.clubId === "club-client",
    )).toMatchObject({
      totalRevenue: first.amount,
      satisfaction: 56,
      status: "active",
    });
    expect(replay.finances).toBe(first.finances);

    const clubScout = makeScout({
      careerPath: "club" as const,
      careerTier: 3,
      reputation: 60,
      currentClubId: "club-employer",
    });
    const clubFinances = initializeFinances(clubScout, "club", "normal");
    const clubResult = settleYouthAgencyPlacement({
      finances: clubFinances,
      scout: clubScout,
      report: { conviction: "recommend" },
      placementReport: { placementType: "youthContract" },
      club: { id: "club-client", reputation: 72 },
      playerId: "player-2",
      playerAge: 16,
      movementId: "movement-club",
      week: 5,
      season: 1,
    });

    expect(clubResult.rewardKind).toBe("discoveryBonus");
    expect(clubResult.amount).toBeGreaterThan(0);
    expect(clubResult.amount).toBeLessThan(first.amount);
    expect(clubResult.finances.bonusRevenue).toBe(clubResult.amount);
    expect(clubResult.finances.placementFeeRecords).toEqual([]);
    expect(clubResult.finances.transactions.filter(
      (transaction) => transaction.referenceId === clubResult.referenceId,
    )).toHaveLength(1);
  });
});
