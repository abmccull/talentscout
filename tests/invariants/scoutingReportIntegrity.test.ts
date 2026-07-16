import { describe, expect, it } from "vitest";
import type {
  GameState,
  MatchPhase,
  NewGameConfig,
  Observation,
  Player,
  Scout,
} from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { generateReportContent, prepareReportSubmission } from "@/engine/reports";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import {
  createObservationEvidenceIndex,
  getPlayerObservationEvidence,
  observePlayer,
  observePlayerLight,
  upsertObservationEvidence,
} from "@/engine/scout/perception";
import { createReportActions } from "@/stores/actions/reportActions";
import { createFinanceActions } from "@/stores/actions/financeActions";
import { initializeFinances } from "@/engine/finance";
import { calculatePerformanceReview } from "@/engine/career/progression";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const NEW_GAME_CONFIG: NewGameConfig = {
  scoutFirstName: "Test",
  scoutLastName: "Scout",
  scoutAge: 32,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "scouting-integrity",
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

function makeScout(): Scout {
  return createScout(NEW_GAME_CONFIG, new RNG("scouting-integrity-scout"));
}

function makePlayer(): Player {
  return generatePlayer(new RNG("scouting-integrity-player"), {
    position: "CM",
    ageRange: [17, 17],
    abilityRange: [90, 90],
    nationality: "English",
    clubId: "",
    firstName: "Linear",
    lastName: "Evidence",
  });
}

function withDate(observation: Observation, index: number): Observation {
  return { ...observation, week: index + 1, season: 1 };
}

describe("scouting evidence invariants", () => {
  it("keeps indexed transaction evidence outcome- and RNG-equivalent", () => {
    const player = makePlayer();
    const otherPlayer = generatePlayer(new RNG("indexed-other-player"), {
      position: "CB",
      ageRange: [18, 18],
      abilityRange: [85, 85],
      nationality: "English",
      clubId: "",
    });
    const scout = makeScout();
    const first = withDate(observePlayerLight(
      new RNG("indexed-history-first"),
      player,
      scout,
      "academyVisit",
      [],
    ), 0);
    const unrelated = withDate(observePlayerLight(
      new RNG("indexed-history-other"),
      otherPlayer,
      scout,
      "trainingGround",
      [],
    ), 0);
    const history = [first, unrelated];
    const index = createObservationEvidenceIndex(history);
    const legacyRng = new RNG("indexed-equivalence-next");
    const indexedRng = new RNG("indexed-equivalence-next");

    const legacyNext = observePlayerLight(
      legacyRng,
      player,
      scout,
      "videoAnalysis",
      history,
    );
    const indexedNext = observePlayerLight(
      indexedRng,
      player,
      scout,
      "videoAnalysis",
      getPlayerObservationEvidence(index, player.id),
    );

    expect(indexedNext).toEqual(legacyNext);
    expect(indexedRng.nextFloat(0, 1)).toBe(legacyRng.nextFloat(0, 1));

    const datedNext = withDate(indexedNext, 1);
    upsertObservationEvidence(index, datedNext);
    const legacyFollowUpRng = new RNG("indexed-equivalence-follow-up");
    const indexedFollowUpRng = new RNG("indexed-equivalence-follow-up");
    const legacyFollowUp = observePlayerLight(
      legacyFollowUpRng,
      player,
      scout,
      "followUpSession",
      [...history, datedNext],
    );
    const indexedFollowUp = observePlayerLight(
      indexedFollowUpRng,
      player,
      scout,
      "followUpSession",
      getPlayerObservationEvidence(index, player.id),
    );

    expect(indexedFollowUp).toEqual(legacyFollowUp);
    expect(indexedFollowUpRng.nextFloat(0, 1)).toBe(
      legacyFollowUpRng.nextFloat(0, 1),
    );
  });

  it("upserts observation evidence without duplicating an existing record", () => {
    const player = makePlayer();
    const scout = makeScout();
    const original = withDate(observePlayerLight(
      new RNG("indexed-upsert"),
      player,
      scout,
      "academyVisit",
      [],
    ), 0);
    const index = createObservationEvidenceIndex([original]);
    const replacement = { ...original, notes: ["replacement"] };

    upsertObservationEvidence(index, replacement);

    expect(getPlayerObservationEvidence(index, player.id)).toEqual([replacement]);
  });

  it("increments light-observation depth linearly from distinct records", () => {
    const player = makePlayer();
    const scout = makeScout();
    const history: Observation[] = [];
    const passingCounts: number[] = [];

    for (let index = 0; index < 4; index++) {
      const observation = withDate(observePlayerLight(
        new RNG(`light-observation-${index}`),
        player,
        scout,
        "statsBriefing",
        history,
      ), index);
      history.push(observation);
      passingCounts.push(
        observation.attributeReadings.find((reading) => reading.attribute === "passing")!
          .observationCount,
      );
    }

    expect(passingCounts).toEqual([1, 2, 3, 4]);

    const next = observePlayerLight(
      new RNG("light-observation-deduplicated"),
      player,
      scout,
      "statsBriefing",
      [...history, history[0]],
    );
    expect(
      next.attributeReadings.find((reading) => reading.attribute === "passing")!
        .observationCount,
    ).toBe(5);
  });

  it("counts a multi-phase live match as one longitudinal observation", () => {
    const player = makePlayer();
    const scout = makeScout();
    const phase: MatchPhase = {
      minute: 10,
      type: "possession",
      description: "Controlled possession",
      involvedPlayerIds: [player.id],
      events: [],
      observableAttributes: ["passing"],
    };
    const history: Observation[] = [];

    const first = withDate(observePlayer(
      new RNG("live-observation-1"),
      player,
      scout,
      [phase, { ...phase, minute: 25 }, { ...phase, minute: 40 }],
      [0, 1, 2],
      "liveMatch",
      history,
    ), 0);
    history.push(first);

    const second = observePlayer(
      new RNG("live-observation-2"),
      player,
      scout,
      [phase, { ...phase, minute: 30 }],
      [0, 1],
      "liveMatch",
      history,
    );

    expect(
      first.attributeReadings.find((reading) => reading.attribute === "passing")!
        .observationCount,
    ).toBe(1);
    expect(
      second.attributeReadings.find((reading) => reading.attribute === "passing")!
        .observationCount,
    ).toBe(2);
  });

  it("does not trust inflated legacy reading counts when drafting reports", () => {
    const player = makePlayer();
    const scout = makeScout();
    const observation = observePlayerLight(
      new RNG("legacy-report-observation"),
      player,
      scout,
      "statsBriefing",
      [],
    );
    const inflatedObservation: Observation = {
      ...observation,
      attributeReadings: observation.attributeReadings.map((reading) => ({
        ...reading,
        observationCount: 1_024,
      })),
    };

    expect(generateReportContent(player, [inflatedObservation], scout).attributeAssessments)
      .toEqual(generateReportContent(player, [observation], scout).attributeAssessments);
  });
});

describe("report submission invariants", () => {
  it("persists the same craft score prepared for preview and applies side effects once", () => {
    const player = makePlayer();
    const scout = makeScout();
    const observation = withDate(observePlayerLight(
      new RNG("report-observation"),
      player,
      scout,
      "statsBriefing",
      [],
    ), 0);
    const draft = generateReportContent(player, [observation], scout);
    const strengths = draft.suggestedStrengths.slice(0, 3);
    const weaknesses = draft.suggestedWeaknesses.slice(0, 2);
    const summary = "A repeatable, evidence-backed report submission.";
    const expected = prepareReportSubmission({
      draft,
      conviction: "recommend",
      summary,
      strengths,
      weaknesses,
      scout,
      week: 1,
      season: 1,
      playerId: player.id,
      observations: [observation],
      playerContext: player,
      reportQualityBonus: 0.15,
    });

    const gameState = {
      seed: NEW_GAME_CONFIG.worldSeed,
      currentWeek: 1,
      currentSeason: 1,
      difficulty: "normal",
      scout,
      players: { [player.id]: player },
      unsignedYouth: {},
      retiredPlayers: {},
      observations: { [observation.id]: observation },
      reports: {},
      discoveryRecords: [],
      clubResponses: [],
      systemFitCache: {},
      predictions: [],
      inbox: [],
      scoutingInfrastructure: {
        dataSubscription: "none",
        travelBudget: "economy",
        officeEquipment: "professional",
        investmentCosts: { weekly: 0, oneTime: 0 },
      },
    } as unknown as GameState;

    let store = {
      gameState,
      selectedPlayerId: player.id,
      currentScreen: "reportWriter",
      pendingListingReportId: null,
    } as unknown as GameStoreState;
    const get = (() => store) as GetState;
    const set = ((partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    }) as SetState;
    const actions = createReportActions(get, set);

    actions.submitReport("recommend", summary, strengths, weaknesses);
    const afterFirst = store.gameState!;
    const storedReport = Object.values(afterFirst.reports)[0];

    expect(storedReport.qualityScore).toBe(expected.quality.score);
    expect(storedReport.craftBreakdown).toEqual(expected.quality.breakdown);
    expect(storedReport.evidenceObservationIds).toEqual([observation.id]);
    expect(storedReport.revision).toBe(1);
    expect(Object.keys(afterFirst.reports)).toEqual([expected.report.id]);
    expect(afterFirst.scout.reportsSubmitted).toBe(scout.reportsSubmitted + 1);
    expect(afterFirst.discoveryRecords).toHaveLength(1);
    expect(Object.keys(afterFirst.scoutingCases)).toHaveLength(1);
    expect(storedReport.caseId).toBeDefined();
    expect(afterFirst.scoutingCases[storedReport.caseId!].reportIds).toEqual([storedReport.id]);

    const reputationAfterFirst = afterFirst.scout.reputation;
    actions.submitReport("recommend", summary, strengths, weaknesses);
    const afterRetry = store.gameState!;

    expect(Object.keys(afterRetry.reports)).toEqual([expected.report.id]);
    expect(afterRetry.scout.reportsSubmitted).toBe(scout.reportsSubmitted + 1);
    expect(afterRetry.scout.reputation).toBe(reputationAfterFirst);
    expect(afterRetry.discoveryRecords).toHaveLength(1);
    expect(Object.keys(afterRetry.scoutingCases)).toHaveLength(1);
    expect(afterRetry.scoutingCases[storedReport.caseId!].reportIds).toEqual([storedReport.id]);

    const listingId = `listing_${storedReport.id}_1_1`;
    const bidId = "bid-first-report";
    const finances = initializeFinances(scout, "independent", "normal");
    store = {
      ...store,
      gameState: {
        ...afterRetry,
        clubs: {
          "club-buyer": {
            id: "club-buyer",
            name: "Buyer United",
            shortName: "BUY",
            leagueId: "league-buyer",
            reputation: 55,
            budget: 1_000_000,
            scoutingBudget: 25_000,
            scoutingPhilosophy: "academyFirst",
            managerId: "manager-buyer",
            playerIds: [],
            academyPlayerIds: [],
            youthAcademyRating: 12,
            loanedOutPlayerIds: [],
            loanedInPlayerIds: [],
          },
        },
        finances: {
          ...finances,
          reportListings: [{
            id: listingId,
            reportId: storedReport.id,
            caseId: storedReport.caseId,
            price: 500,
            isExclusive: false,
            status: "active",
            listedWeek: 1,
            listedSeason: 1,
            bids: [{
              id: bidId,
              listingId,
              clubId: "club-buyer",
              amount: 650,
              placedWeek: 1,
              placedSeason: 1,
              expiryWeek: 3,
              expirySeason: 1,
              status: "pending",
              needMatchScore: 80,
            }],
            biddingEndsWeek: 3,
            biddingEndsSeason: 1,
          }],
        },
        reportDeliveries: {},
        clubDecisions: {},
      },
    };
    const playersBeforeSale = store.gameState!.players;
    const financeActions = createFinanceActions(get, set);
    financeActions.acceptMarketplaceBid(bidId);

    const afterSale = store.gameState!;
    const delivery = Object.values(afterSale.reportDeliveries)[0];
    expect(delivery).toMatchObject({
      caseId: storedReport.caseId,
      reportId: storedReport.id,
      clubId: "club-buyer",
      channel: "marketplaceSale",
      status: "delivered",
      price: 650,
    });
    expect(afterSale.players).toBe(playersBeforeSale);
    expect(afterSale.playerMovementHistory).toBe(afterRetry.playerMovementHistory);
    expect(afterSale.scoutingCases[storedReport.caseId!].deliveryIds).toEqual([delivery.id]);
  });

  it("requires new evidence for revisions and never turns revisions into report-volume rewards", () => {
    const player = makePlayer();
    const scout = makeScout();
    const firstObservation = withDate(observePlayerLight(
      new RNG("accountable-report-observation-1"),
      player,
      scout,
      "statsBriefing",
      [],
    ), 0);
    const firstDraft = generateReportContent(player, [firstObservation], scout);
    const summary = "An accountable judgment that changes only when the evidence changes.";

    let store = {
      gameState: {
        seed: NEW_GAME_CONFIG.worldSeed,
        currentWeek: 1,
        currentSeason: 1,
        difficulty: "normal",
        scout,
        players: { [player.id]: player },
        unsignedYouth: {},
        retiredPlayers: {},
        observations: { [firstObservation.id]: firstObservation },
        reports: {},
        scoutingCases: {},
        discoveryRecords: [],
        clubResponses: [],
        systemFitCache: {},
        predictions: [],
        inbox: [],
        scoutingInfrastructure: {
          dataSubscription: "none",
          travelBudget: "economy",
          officeEquipment: "basic",
          investmentCosts: { weekly: 0, oneTime: 0 },
        },
      } as unknown as GameState,
      selectedPlayerId: player.id,
      currentScreen: "reportWriter",
      pendingListingReportId: null,
    } as unknown as GameStoreState;
    const get = (() => store) as GetState;
    const set = ((partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    }) as SetState;
    const actions = createReportActions(get, set);

    actions.submitReport(
      "recommend",
      summary,
      firstDraft.suggestedStrengths.slice(0, 3),
      firstDraft.suggestedWeaknesses.slice(0, 2),
    );
    const afterInitial = store.gameState!;
    const initialReport = Object.values(afterInitial.reports)[0];
    const initialReputation = afterInitial.scout.reputation;
    const initialVolume = afterInitial.scout.reportsSubmitted;

    store = {
      ...store,
      currentScreen: "reportWriter",
      gameState: { ...afterInitial, currentWeek: 2 },
    };
    actions.submitReport(
      "recommend",
      summary,
      firstDraft.suggestedStrengths.slice(0, 3),
      firstDraft.suggestedWeaknesses.slice(0, 2),
    );
    expect(Object.values(store.gameState!.reports)).toHaveLength(1);
    expect(store.gameState!.scout.reputation).toBe(initialReputation);
    expect(store.gameState!.scout.reportsSubmitted).toBe(initialVolume);
    expect(store.gameState!.inbox.at(-1)?.title).toBe("Report revision needs new evidence");

    const secondObservation = withDate(observePlayerLight(
      new RNG("accountable-report-observation-2"),
      player,
      scout,
      "liveMatch",
      [firstObservation],
    ), 1);
    const secondDraft = generateReportContent(player, [firstObservation, secondObservation], scout);
    store = {
      ...store,
      currentScreen: "reportWriter",
      gameState: {
        ...store.gameState!,
        observations: {
          ...store.gameState!.observations,
          [secondObservation.id]: secondObservation,
        },
      },
    };
    actions.submitReport(
      "strongRecommend",
      `${summary} A different context strengthened the opinion.`,
      secondDraft.suggestedStrengths.slice(0, 3),
      secondDraft.suggestedWeaknesses.slice(0, 2),
    );

    const afterRevision = store.gameState!;
    const revisions = Object.values(afterRevision.reports)
      .sort((left, right) => (left.revision ?? 1) - (right.revision ?? 1));
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      revision: 2,
      supersedesReportId: initialReport.id,
      caseId: initialReport.caseId,
      reputationDelta: 0,
    });
    expect(revisions[1].evidenceObservationIds).toEqual(
      [firstObservation.id, secondObservation.id].sort(),
    );
    expect(afterRevision.scout.reputation).toBe(initialReputation);
    expect(afterRevision.scout.reportsSubmitted).toBe(initialVolume);
    expect(afterRevision.scoutingCases[initialReport.caseId!].reportIds).toEqual(
      revisions.map((report) => report.id),
    );

    const review = calculatePerformanceReview(afterRevision.scout, revisions, 1);
    expect(review.reportsSubmitted).toBe(1);
  });
});
