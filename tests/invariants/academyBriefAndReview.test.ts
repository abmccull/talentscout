import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import type {
  Club,
  ClubDecision,
  Injury,
  PlacementReport,
  Player,
  PlayerMovementEvent,
  ScoutReport,
  ScoutingCase,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  expireAcademyRecruitmentBriefs,
  fulfillAcademyRecruitmentBrief,
  generateAcademyRecruitmentBriefs,
  normalizeAcademyRecruitmentBrief,
  type AcademyRecruitmentBrief,
} from "@/engine/youth/recruitmentBriefs";
import {
  completeAcademyRecommendationReview,
  completeDueAcademyRecommendationReviews,
  scheduleAcademyRecommendationReviews,
} from "@/engine/youth/recommendationReviews";

function club(overrides: Partial<Club> = {}): Club {
  return {
    id: "club-academy",
    name: "Academy FC",
    shortName: "AFC",
    leagueId: "league-1",
    reputation: 55,
    budget: 2_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: "manager-1",
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    ...overrides,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    firstName: "Ari",
    lastName: "Prospect",
    age: 16,
    dateOfBirth: { day: 1, month: 1, year: 2009 },
    nationality: "England",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "club-academy",
    contractClubId: "club-academy",
    contractExpiry: 4,
    wage: 500,
    marketValue: 50_000,
    attributes: {} as Player["attributes"],
    currentAbility: 80,
    potentialAbility: 150,
    developmentProfile: "normal",
    wonderkidTier: "qualityPro",
    form: 0,
    morale: 7,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  } as Player;
}

function brief(overrides: Partial<AcademyRecruitmentBrief> = {}): AcademyRecruitmentBrief {
  return {
    id: "academy-brief-1",
    clubId: "club-academy",
    type: "academyPlacement",
    createdWeek: 1,
    createdSeason: 1,
    expiresWeek: 10,
    expiresSeason: 1,
    requiredPositions: ["CM"],
    developmentPriority: "highCeiling",
    maxAge: 16,
    riskTolerance: "high",
    weeklyWageBudget: 1_000,
    competitionPressure: 45,
    status: "open",
    targetPosition: "CM",
    priority: "critical",
    reason: "vacancy",
    rationale: "The academy needs a central midfielder.",
    ageRange: [14, 16],
    minimumReportQuality: 60,
    minimumConviction: "recommend",
    issuedWeek: 1,
    issuedSeason: 1,
    ...overrides,
  };
}

function causalPlacement() {
  const report: ScoutReport = {
    id: "report-1",
    caseId: "case-1",
    briefId: "academy-brief-1",
    revision: 1,
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 3,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Movement between the lines"],
    weaknesses: ["Recurring fitness concern"],
    conviction: "strongRecommend",
    summary: "A high-upside academy placement with a known availability risk.",
    estimatedValue: 0,
    qualityScore: 82,
    intendedClubId: "club-academy",
    intendedAudience: "academyDirector",
    recruitmentNeed: "Central midfield pathway depth",
    projectedRole: "boxToBox",
    recommendedAction: "offerAcademyPlace",
    riskFactors: ["Fitness and availability require monitoring"],
    estimatedWeeklyWage: 600,
    categoryVerdicts: {
      potential: {
        verdict: "Can become a senior contributor",
        confidence: "high",
        hypothesisIds: ["hyp-potential"],
        acknowledgedUncertainty: "Senior adaptation remains untested.",
      },
    },
  };
  const scoutingCase: ScoutingCase = {
    id: "case-1",
    playerId: "player-1",
    scoutId: "scout-1",
    openedWeek: 1,
    openedSeason: 1,
    lastUpdatedWeek: 5,
    lastUpdatedSeason: 1,
    status: "placed",
    reportIds: ["report-1", "report-2"],
    listingIds: [],
    deliveryIds: ["delivery-1"],
    decisionIds: ["decision-1"],
    placementReportIds: ["placement-1"],
  };
  const placementReport: PlacementReport = {
    id: "placement-1",
    reportId: report.id,
    caseId: scoutingCase.id,
    deliveryId: "delivery-1",
    decisionId: "decision-1",
    unsignedYouthId: "youth-1",
    targetClubId: "club-academy",
    scoutId: "scout-1",
    conviction: "strongRecommend",
    clubResponse: "accepted",
    placementType: "academyIntake",
    qualityScore: 82,
    week: 3,
    season: 1,
  };
  const clubDecision: ClubDecision = {
    id: "decision-1",
    caseId: scoutingCase.id,
    deliveryId: "delivery-1",
    reportId: report.id,
    clubId: "club-academy",
    outcome: "accepted",
    decidedWeek: 5,
    decidedSeason: 1,
    placementReportId: placementReport.id,
  };
  const placementMovement: PlayerMovementEvent = {
    id: "move-youth-signing",
    playerId: "player-1",
    type: "youthSigning",
    week: 5,
    season: 1,
    toClubId: "club-academy",
    contractClubId: "club-academy",
  };
  return { report, scoutingCase, placementReport, clubDecision, placementMovement };
}

describe("academy recruitment briefs", () => {
  it("generates seeded, canonical briefs from roster gaps without reading hidden ability", () => {
    const academyClub = club();
    const lowTruth = player({
      id: "existing-player",
      clubId: "club-academy",
      position: "GK",
      currentAbility: 20,
      potentialAbility: 40,
    });
    const highTruth = { ...lowTruth, currentAbility: 190, potentialAbility: 200 };
    academyClub.academyPlayerIds = [lowTruth.id];

    const lowResult = generateAcademyRecruitmentBriefs(
      new RNG("academy-brief-seed"),
      academyClub,
      { [lowTruth.id]: lowTruth },
      35,
      1,
    );
    const repeated = generateAcademyRecruitmentBriefs(
      new RNG("academy-brief-seed"),
      academyClub,
      { [highTruth.id]: highTruth },
      35,
      1,
    );

    expect(repeated).toEqual(lowResult);
    expect(lowResult).toHaveLength(2);
    expect(new Set(lowResult.map((candidate) => candidate.id)).size).toBe(2);
    for (const candidate of lowResult) {
      expect(candidate).toMatchObject({
        clubId: academyClub.id,
        type: "academyPlacement",
        createdWeek: 35,
        createdSeason: 1,
        status: "open",
        developmentPriority: "highCeiling",
      });
      expect(candidate.requiredPositions).toEqual([candidate.targetPosition]);
      expect(candidate.expiresSeason).toBe(2);
      expect(candidate.expiresWeek).toBe(5);
    }
  });

  it("does not duplicate an active positional brief and expires exactly once", () => {
    const existing = brief({ targetPosition: "CM", requiredPositions: ["CM"] });
    const generated = generateAcademyRecruitmentBriefs(
      new RNG("academy-no-duplicate"),
      club(),
      {},
      1,
      1,
      { existingBriefs: [existing], maxActiveBriefs: 2 },
    );
    expect(generated).toHaveLength(1);
    expect(generated[0].targetPosition).not.toBe("CM");

    const before = expireAcademyRecruitmentBriefs([existing], 9, 1);
    expect(before.expiredIds).toEqual([]);
    expect(before.briefs[0].status).toBe("open");

    const due = expireAcademyRecruitmentBriefs(before.briefs, 10, 1);
    expect(due.expiredIds).toEqual([existing.id]);
    expect(due.briefs[0]).toMatchObject({
      status: "expired",
      expiredWeek: 10,
      expiredSeason: 1,
    });

    const replay = expireAcademyRecruitmentBriefs(due.briefs, 11, 1);
    expect(replay.expiredIds).toEqual([]);
    expect(replay.briefs).toEqual(due.briefs);
  });

  it("requires the complete accepted case and canonical signing before fulfillment", () => {
    const causal = causalPlacement();
    const prospect = player({ clubId: "club-academy" });
    const missingMovement = fulfillAcademyRecruitmentBrief({
      brief: brief(),
      player: prospect,
      playerAgeAtPlacement: 16,
      ...causal,
      movementHistory: [],
      currentWeek: 5,
      currentSeason: 1,
    });
    expect(missingMovement.fulfilled).toBe(false);
    expect(missingMovement.failures).toContain("missingCanonicalYouthSigning");

    const fulfilled = fulfillAcademyRecruitmentBrief({
      brief: brief(),
      player: prospect,
      playerAgeAtPlacement: 16,
      ...causal,
      movementHistory: [causal.placementMovement],
      currentWeek: 5,
      currentSeason: 1,
    });
    expect(fulfilled.fulfilled).toBe(true);
    expect(fulfilled.brief).toMatchObject({
      status: "fulfilled",
      assignedCaseId: causal.scoutingCase.id,
      fulfilledByPlayerId: prospect.id,
      fulfilledReportId: causal.report.id,
      fulfilledMovementId: causal.placementMovement.id,
    });

    const replay = fulfillAcademyRecruitmentBrief({
      brief: fulfilled.brief,
      player: prospect,
      ...causal,
      movementHistory: [causal.placementMovement],
      currentWeek: 6,
      currentSeason: 1,
    });
    expect(replay.fulfilled).toBe(true);
    expect(replay.brief).toEqual(fulfilled.brief);
  });

  it("upgrades legacy broad briefs before strict causal fulfillment", () => {
    const causal = causalPlacement();
    const prospect = player();
    const legacyBrief: YouthRecruitmentBrief = {
      id: "academy-brief-1",
      clubId: "club-academy",
      type: "academyPlacement",
      createdWeek: 1,
      createdSeason: 1,
      expiresWeek: 10,
      expiresSeason: 1,
      requiredPositions: ["CM"],
      preferredRole: "boxToBox",
      developmentPriority: "highCeiling",
      maxAge: 16,
      riskTolerance: "high",
      weeklyWageBudget: 1_000,
      competitionPressure: 45,
      status: "open",
    };

    const normalized = normalizeAcademyRecruitmentBrief(legacyBrief, prospect);
    expect(normalized).toMatchObject({
      targetPosition: "CM",
      ageRange: [14, 16],
      issuedWeek: 1,
      issuedSeason: 1,
      minimumConviction: "note",
      minimumReportQuality: 0,
    });

    const fulfilled = fulfillAcademyRecruitmentBrief({
      brief: legacyBrief as AcademyRecruitmentBrief,
      player: prospect,
      ...causal,
      movementHistory: [causal.placementMovement],
      currentWeek: 5,
      currentSeason: 1,
    });
    expect(fulfilled.fulfilled).toBe(true);
    expect(fulfilled.brief.status).toBe("fulfilled");
  });

  it("does not fulfill from a signing that occurs on the exclusive expiry date", () => {
    const causal = causalPlacement();
    const lateMovement = { ...causal.placementMovement, week: 10 };
    const result = fulfillAcademyRecruitmentBrief({
      brief: brief(),
      player: player(),
      ...causal,
      movementHistory: [lateMovement],
      currentWeek: 10,
      currentSeason: 1,
    });
    expect(result.fulfilled).toBe(false);
    expect(result.failures).toContain("briefExpired");
  });

  it("does not apply a second quality veto after the club accepted the case", () => {
    const causal = causalPlacement();
    const result = fulfillAcademyRecruitmentBrief({
      brief: brief({ minimumReportQuality: 95, minimumConviction: "tablePound" }),
      player: player(),
      ...causal,
      movementHistory: [causal.placementMovement],
      currentWeek: 5,
      currentSeason: 1,
    });

    expect(causal.report.qualityScore).toBeLessThan(95);
    expect(causal.report.conviction).toBe("strongRecommend");
    expect(result.fulfilled).toBe(true);
  });
});

describe("academy recommendation reviews", () => {
  function reviewPlayer(overrides: Partial<Player> = {}): Player {
    const injuries: Injury[] = [
      {
        id: "injury-s1",
        playerId: "player-1",
        type: "muscle",
        severity: "minor",
        recoveryWeeks: 4,
        weeksRemaining: 0,
        reinjuryRisk: 0.1,
        occurredWeek: 10,
        occurredSeason: 1,
      },
      {
        id: "injury-s2",
        playerId: "player-1",
        type: "ligament",
        severity: "moderate",
        recoveryWeeks: 8,
        weeksRemaining: 0,
        reinjuryRisk: 0.2,
        occurredWeek: 20,
        occurredSeason: 2,
      },
      {
        id: "injury-future",
        playerId: "player-1",
        type: "fracture",
        severity: "serious",
        recoveryWeeks: 30,
        weeksRemaining: 0,
        reinjuryRisk: 0.3,
        occurredWeek: 10,
        occurredSeason: 3,
      },
    ];
    return player({
      age: 19,
      seasonRatings: [
        { season: 1, avgRating: 7.2, appearances: 12, goals: 2, assists: 4, cleanSheets: 0 },
        { season: 2, avgRating: 7.0, appearances: 20, goals: 3, assists: 6, cleanSheets: 0 },
        { season: 3, avgRating: 9.9, appearances: 38, goals: 40, assists: 40, cleanSheets: 0 },
      ],
      injuryHistory: {
        playerId: "player-1",
        injuries,
        totalWeeksMissed: 42,
        injuryProneness: 0.4,
        reinjuryWindowWeeksLeft: 0,
      },
      ...overrides,
    });
  }

  function movementHistory(initial: PlayerMovementEvent): PlayerMovementEvent[] {
    return [
      initial,
      {
        id: "move-loan-start",
        playerId: "player-1",
        type: "loanStart",
        week: 2,
        season: 2,
        fromClubId: "club-academy",
        toClubId: "club-loan",
        contractClubId: "club-academy",
      },
      {
        id: "move-loan-return",
        playerId: "player-1",
        type: "loanReturn",
        week: 30,
        season: 2,
        fromClubId: "club-loan",
        toClubId: "club-academy",
        contractClubId: "club-academy",
      },
      {
        id: "move-after-two-season-cutoff",
        playerId: "player-1",
        type: "permanentTransfer",
        week: 6,
        season: 3,
        fromClubId: "club-academy",
        toClubId: "club-future",
        contractClubId: "club-future",
        fee: 2_000_000,
      },
    ];
  }

  it("schedules stable one- and two-season checkpoints only from a canonical placement", () => {
    const causal = causalPlacement();
    const scheduled = scheduleAcademyRecommendationReviews({
      ...causal,
      movementHistory: [causal.placementMovement],
    });
    expect(scheduled.failures).toEqual([]);
    expect(scheduled.created).toHaveLength(2);
    expect(scheduled.reviews.map((review) => ({
      checkpoint: review.checkpoint,
      dueWeek: review.dueWeek,
      dueSeason: review.dueSeason,
      status: review.status,
    }))).toEqual([
      { checkpoint: "oneSeason", dueWeek: 5, dueSeason: 2, status: "scheduled" },
      { checkpoint: "twoSeasons", dueWeek: 5, dueSeason: 3, status: "scheduled" },
    ]);

    const replay = scheduleAcademyRecommendationReviews({
      ...causal,
      movementHistory: [causal.placementMovement],
      existingReviews: scheduled.reviews,
    });
    expect(replay.created).toEqual([]);
    expect(replay.reviews).toEqual(scheduled.reviews);

    const invalid = scheduleAcademyRecommendationReviews({
      ...causal,
      movementHistory: [],
    });
    expect(invalid.reviews).toEqual([]);
    expect(invalid.failures).toContain("missingCanonicalYouthSigning");
  });

  it("completes each checkpoint from bounded canonical evidence and ignores future data", () => {
    const causal = causalPlacement();
    const movements = movementHistory(causal.placementMovement);
    const scheduled = scheduleAcademyRecommendationReviews({ ...causal, movementHistory: movements });
    const prospect = reviewPlayer();

    const early = completeAcademyRecommendationReview({
      review: scheduled.reviews[0],
      ...causal,
      player: prospect,
      movementHistory: movements,
      currentWeek: 4,
      currentSeason: 2,
      brief: brief({
        status: "fulfilled",
        fulfilledPlayerAge: 16,
        fulfilledByPlayerId: prospect.id,
      }),
    });
    expect(early.status).toBe("notDue");

    const oneSeason = completeAcademyRecommendationReview({
      review: scheduled.reviews[0],
      ...causal,
      player: prospect,
      movementHistory: movements,
      currentWeek: 5,
      currentSeason: 2,
      brief: brief({ status: "fulfilled", fulfilledPlayerAge: 16 }),
    });
    expect(oneSeason.status).toBe("completed");
    expect(oneSeason.review).toMatchObject({
      completedWeek: 5,
      completedSeason: 2,
      status: "complete",
      horizonSeasons: 1,
      injuryRiskAssessment: "notRealized",
    });
    expect(oneSeason.review.outcomeEvidence).toMatchObject({
      seasonsReviewed: [1],
      movementIds: ["move-youth-signing", "move-loan-start"],
      injuryIds: ["injury-s1"],
      appearances: 12,
      avgRating: 7.2,
      weeksMissed: 4,
      pathwayStatus: "loan",
      ageAtReview: 17,
    });

    const revisedReport: ScoutReport = {
      ...causal.report,
      id: "report-2",
      supersedesReportId: causal.report.id,
      revision: 2,
      submittedWeek: 4,
      conviction: "tablePound",
    };
    const twoSeason = completeAcademyRecommendationReview({
      review: scheduled.reviews[1],
      ...causal,
      caseReports: [causal.report, revisedReport],
      player: prospect,
      movementHistory: movements,
      currentWeek: 20,
      currentSeason: 4,
      brief: brief({ status: "fulfilled", fulfilledPlayerAge: 16 }),
    });
    expect(twoSeason.status).toBe("completed");
    expect(twoSeason.review).toMatchObject({
      completedWeek: 5,
      completedSeason: 3,
      horizonSeasons: 2,
      reportRevisionCount: 2,
      opinionRevised: true,
      injuryRiskAssessment: "correctlyFlagged",
    });
    expect(twoSeason.review.outcomeEvidence).toMatchObject({
      seasonsReviewed: [1, 2],
      movementIds: ["move-youth-signing", "move-loan-start", "move-loan-return"],
      injuryIds: ["injury-s1", "injury-s2"],
      appearances: 32,
      avgRating: 7.1,
      weeksMissed: 12,
      pathwayStatus: "firstTeam",
      clubIdAtReview: "club-academy",
      ageAtReview: 18,
    });
    expect(twoSeason.review.outcomeEvidence?.movementIds).not.toContain("move-after-two-season-cutoff");
    expect(twoSeason.review.outcomeEvidence?.injuryIds).not.toContain("injury-future");
    expect(twoSeason.review.outcomeEvidence?.seasonsReviewed).not.toContain(3);
    expect(twoSeason.review.categoryScores?.characterRisk).toBeUndefined();
  });

  it("produces the same review when hidden CA and PA are changed", () => {
    const causal = causalPlacement();
    const movements = movementHistory(causal.placementMovement);
    const scheduled = scheduleAcademyRecommendationReviews({ ...causal, movementHistory: movements });
    const lowTruth = reviewPlayer({ currentAbility: 20, potentialAbility: 30 });
    const highTruth = reviewPlayer({ currentAbility: 195, potentialAbility: 200 });
    const shared = {
      review: scheduled.reviews[1],
      ...causal,
      movementHistory: movements,
      currentWeek: 5,
      currentSeason: 3,
      brief: brief({ status: "fulfilled", fulfilledPlayerAge: 16 }),
    };
    const lowReview = completeAcademyRecommendationReview({ ...shared, player: lowTruth });
    const highReview = completeAcademyRecommendationReview({ ...shared, player: highTruth });
    expect(highReview).toEqual(lowReview);
  });

  it("batch completion resolves only due checkpoints and remains idempotent", () => {
    const causal = causalPlacement();
    const movements = movementHistory(causal.placementMovement);
    const scheduled = scheduleAcademyRecommendationReviews({ ...causal, movementHistory: movements });
    const firstPass = completeDueAcademyRecommendationReviews({
      reviews: scheduled.reviews,
      ...causal,
      player: reviewPlayer(),
      movementHistory: movements,
      currentWeek: 5,
      currentSeason: 2,
      brief: brief({ status: "fulfilled", fulfilledPlayerAge: 16 }),
    });
    expect(firstPass.completedIds).toEqual([scheduled.reviews[0].id]);
    expect(firstPass.reviews.map((review) => review.status)).toEqual(["complete", "scheduled"]);

    const replay = completeDueAcademyRecommendationReviews({
      reviews: firstPass.reviews,
      ...causal,
      player: reviewPlayer(),
      movementHistory: movements,
      currentWeek: 5,
      currentSeason: 2,
      brief: brief({ status: "fulfilled", fulfilledPlayerAge: 16 }),
    });
    expect(replay.completedIds).toEqual([]);
    expect(replay.reviews).toEqual(firstPass.reviews);
  });
});
