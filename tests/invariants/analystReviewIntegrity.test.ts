import { describe, expect, it } from "vitest";
import type {
  AgencyEmployee,
  AnalystReviewArtifact,
  FinancialRecord,
  GameState,
  NewGameConfig,
  ScoutReport,
} from "@/engine/core/types";
import {
  MAX_ANALYST_CRAFT_BONUS,
  MAX_ANALYST_REVIEW_HISTORY,
  MAX_AVAILABLE_ANALYST_REVIEWS,
  calculateInfrastructureEffects,
  consumeAnalystReview,
  createAnalystReviewArtifact,
  getActiveEquipmentBonuses,
  getApplicableAnalystReview,
  initializeFinances,
  migrateFinancialRecord,
  normalizeAnalystReviewHistory,
  processEmployeeWork,
} from "@/engine/finance";
import { createScout } from "@/engine/scout/creation";
import { generatePlayer } from "@/engine/players/generation";
import { generateReportContent, prepareReportSubmission } from "@/engine/reports";
import { observePlayerLight } from "@/engine/scout/perception";
import { RNG } from "@/engine/rng";
import { createReportActions } from "@/stores/actions/reportActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Review",
  scoutLastName: "Tester",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "analyst-review-integrity",
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

function analyst(id = "analyst-1"): AgencyEmployee {
  return {
    id,
    name: "Morgan Vale",
    role: "analyst",
    quality: 16,
    salary: 1_200,
    paySatisfaction: 70,
    morale: 90,
    fatigue: 5,
    hiredWeek: 1,
    hiredSeason: 1,
    reportsGenerated: [],
    currentAssignment: {
      type: "analyzeReports",
      assignedWeek: 1,
      assignedSeason: 1,
    },
    experience: 0,
    weeklyLog: [],
    regionFocusWeeks: 0,
    skills: {
      skill1: 16,
      skill2: 14,
      skill3: 12,
      xp1: 0,
      xp2: 0,
      xp3: 0,
    },
  };
}

function filedReport(scoutId: string): ScoutReport {
  return {
    id: "report-source",
    caseId: "case-source",
    revision: 1,
    playerId: "player-source",
    scoutId,
    submittedWeek: 1,
    submittedSeason: 1,
    attributeAssessments: [{
      attribute: "passing",
      estimatedValue: 13,
      confidenceRange: [10, 16],
      domain: "technical",
    }],
    strengths: ["Progressive passer"],
    weaknesses: [],
    conviction: "recommend",
    summary: "A promising player, subject to more evidence.",
    estimatedValue: 150_000,
    qualityScore: 55,
  };
}

function reviewFixture(
  id: string,
  status: AnalystReviewArtifact["status"] = "available",
): AnalystReviewArtifact {
  return {
    id,
    analystEmployeeId: "analyst-1",
    analystName: "Morgan Vale",
    createdWeek: Number(id.replace(/\D/g, "")) || 1,
    createdSeason: 1,
    status,
    scope: "nextEligibleReport",
    evidenceCategory: "riskFraming",
    bias: "skeptical",
    biasDisclosure: "Presses uncertainty before accepting upside.",
    critique: "State the most material downside and the evidence behind it.",
    craftQualityBonus: 4,
    ...(status === "consumed"
      ? { consumedByReportId: `report-${id}`, consumedWeek: 2, consumedSeason: 1 }
      : {}),
  };
}

describe("analyst review integrity", () => {
  it("persists bounded, idempotent weekly analyst work based only on visible report evidence", () => {
    const scout = createScout(CONFIG, new RNG("analyst-review-scout"));
    const source = filedReport(scout.id);
    let finances: FinancialRecord = {
      ...initializeFinances(scout, "independent", "normal"),
      office: { tier: "small", monthlyCost: 500, qualityBonus: 0.05, maxEmployees: 3 },
      employees: [analyst()],
    };

    const first = processEmployeeWork(
      new RNG("analyst-work-1"),
      finances,
      {},
      {},
      scout,
      { [source.id]: source },
      1,
      1,
    );
    finances = first.finances;

    expect(finances.analystReviews).toHaveLength(1);
    expect(finances.analystReviews[0]).toMatchObject({
      sourceReportId: source.id,
      targetPlayerId: source.playerId,
      targetCaseId: source.caseId,
      scope: "reportRevision",
      status: "available",
    });
    expect(finances.analystReviews[0].critique.length).toBeGreaterThan(40);
    expect(finances.analystReviews[0].biasDisclosure.length).toBeGreaterThan(20);
    expect(finances.analystReviews[0].craftQualityBonus).toBeGreaterThanOrEqual(1);
    expect(finances.analystReviews[0].craftQualityBonus).toBeLessThanOrEqual(MAX_ANALYST_CRAFT_BONUS);
    expect(first.inboxMessages[0].body).toContain("Method bias");

    const replay = processEmployeeWork(
      new RNG("analyst-work-replay"),
      finances,
      {},
      {},
      scout,
      { [source.id]: source },
      1,
      1,
    );
    expect(replay.finances.analystReviews).toEqual(finances.analystReviews);

    for (let week = 2; week <= 8; week += 1) {
      finances = processEmployeeWork(
        new RNG(`analyst-work-${week}`),
        finances,
        {},
        {},
        scout,
        { [source.id]: source },
        week,
        1,
      ).finances;
    }
    expect(finances.analystReviews.filter((review) => review.status === "available"))
      .toHaveLength(MAX_AVAILABLE_ANALYST_REVIEWS);
  });

  it("prefers a matching revision review and consumes an artifact exactly once", () => {
    const scout = createScout(CONFIG, new RNG("analyst-selection-scout"));
    const source = filedReport(scout.id);
    const general = reviewFixture("general-1");
    const targeted: AnalystReviewArtifact = {
      ...reviewFixture("targeted-2"),
      scope: "reportRevision",
      sourceReportId: source.id,
      targetPlayerId: source.playerId,
      targetCaseId: source.caseId,
    };
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      analystReviews: [general, targeted],
    };

    expect(getApplicableAnalystReview(
      finances.analystReviews,
      source.playerId,
      source,
    )?.id).toBe(targeted.id);

    const consumed = consumeAnalystReview(finances, targeted.id, "report-revision-2", 3, 1);
    const replay = consumeAnalystReview(consumed, targeted.id, "wrong-report", 4, 1);
    expect(replay).toBe(consumed);
    expect(consumed.analystReviews.find((review) => review.id === targeted.id)).toMatchObject({
      status: "consumed",
      consumedByReportId: "report-revision-2",
      consumedWeek: 3,
      consumedSeason: 1,
    });
    expect(getApplicableAnalystReview(
      consumed.analystReviews,
      "another-player",
    )?.id).toBe(general.id);
  });

  it("initializes and migrates a bounded review ledger", () => {
    const scout = createScout(CONFIG, new RNG("analyst-migration-scout"));
    const initial = initializeFinances(scout, "independent", "normal");
    expect(initial.analystReviews).toEqual([]);

    const legacy = { ...initial } as Partial<FinancialRecord>;
    delete legacy.analystReviews;
    expect(migrateFinancialRecord(legacy as FinancialRecord, scout).analystReviews).toEqual([]);

    const oversized = [
      ...Array.from({ length: 30 }, (_, index) => reviewFixture(`consumed-${index + 1}`, "consumed")),
      ...Array.from({ length: 7 }, (_, index) => reviewFixture(`available-${index + 1}`)),
    ];
    const normalized = normalizeAnalystReviewHistory(oversized);
    expect(normalized).toHaveLength(MAX_ANALYST_REVIEW_HISTORY);
    expect(normalized.filter((review) => review.status === "available"))
      .toHaveLength(MAX_AVAILABLE_ANALYST_REVIEWS);
  });

  it("applies one visible craft bonus during submission without consuming the next token on retry", () => {
    const scout = createScout(CONFIG, new RNG("analyst-submit-scout"));
    const player = generatePlayer(new RNG("analyst-submit-player"), {
      position: "CM",
      ageRange: [17, 17],
      abilityRange: [90, 90],
      nationality: "English",
      clubId: "",
      firstName: "Ada",
      lastName: "Evidence",
    });
    const observation = {
      ...observePlayerLight(
        new RNG("analyst-submit-observation"),
        player,
        scout,
        "academyVisit",
        [],
      ),
      week: 1,
      season: 1,
    };
    const draft = generateReportContent(player, [observation], scout);
    const strengths = draft.suggestedStrengths.slice(0, 3);
    const weaknesses = draft.suggestedWeaknesses.slice(0, 2);
    const summary = "The available evidence supports a monitored academy opportunity.";
    const firstReview = createAnalystReviewArtifact({
      employee: analyst("analyst-submit-1"),
      efficiency: 1,
      reports: {},
      scoutId: scout.id,
      existingReviews: [],
      week: 1,
      season: 1,
    })!;
    const secondReview: AnalystReviewArtifact = {
      ...firstReview,
      id: "analyst-review:analyst-submit-2:s1w1",
      analystEmployeeId: "analyst-submit-2",
      analystName: "Riley Check",
      createdWeek: 2,
    };
    const finances = {
      ...initializeFinances(scout, "independent", "normal"),
      analystReviews: [firstReview, secondReview],
    };
    const infrastructure = {
      dataSubscription: "none" as const,
      travelBudget: "economy" as const,
      officeEquipment: "basic" as const,
      investmentCosts: { weekly: 0, oneTime: 0 },
    };
    const totalEquipmentBonus = calculateInfrastructureEffects(infrastructure).reportQualityBonus
      + getActiveEquipmentBonuses(finances.equipment!.loadout).reportQuality;
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
      reportQualityBonus: totalEquipmentBonus,
      analystReviewBonus: firstReview.craftQualityBonus,
    });

    let store = {
      gameState: {
        seed: CONFIG.worldSeed,
        currentWeek: 1,
        currentSeason: 1,
        difficulty: "normal",
        scout,
        players: { [player.id]: player },
        unsignedYouth: {},
        retiredPlayers: {},
        observations: { [observation.id]: observation },
        reports: {},
        scoutingCases: {},
        discoveryRecords: [],
        clubResponses: [],
        systemFitCache: {},
        predictions: [],
        inbox: [],
        finances,
        scoutingInfrastructure: infrastructure,
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

    actions.submitReport("recommend", summary, strengths, weaknesses);
    const storedReport = Object.values(store.gameState!.reports)[0];
    expect(storedReport.qualityScore).toBe(expected.quality.score);
    expect(storedReport.craftBreakdown?.analystReviewBonus)
      .toBe(firstReview.craftQualityBonus);
    expect(storedReport.analystReview).toMatchObject({
      artifactId: firstReview.id,
      critique: firstReview.critique,
      evidenceCategory: firstReview.evidenceCategory,
      bias: firstReview.bias,
    });
    expect(store.gameState!.finances!.analystReviews.find(
      (review) => review.id === firstReview.id,
    )).toMatchObject({
      status: "consumed",
      consumedByReportId: storedReport.id,
    });

    actions.submitReport("recommend", summary, strengths, weaknesses);
    expect(store.gameState!.finances!.analystReviews.find(
      (review) => review.id === secondReview.id,
    )?.status).toBe("available");
    expect(Object.values(store.gameState!.reports)).toHaveLength(1);
  });
});
