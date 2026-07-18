import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import type {
  Club,
  Observation,
  Player,
  Scout,
  ScoutReport,
  StructuredReportInput,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  advanceYouthRecruitmentBriefs,
  deriveYouthRecruitmentBriefCapacity,
  scoreAcademyClubDecision,
} from "@/engine/youth/academyPlacementCase";
import {
  applyStructuredReportInput,
  isStructuredYouthReport,
  validateStructuredReportInput,
} from "@/engine/reports/structuredYouthReport";

function club(): Club {
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
    youthAcademyRating: 14,
  };
}

function brief(overrides: Partial<YouthRecruitmentBrief> = {}): YouthRecruitmentBrief {
  return {
    id: "brief-1",
    clubId: "club-academy",
    type: "academyPlacement",
    createdWeek: 1,
    createdSeason: 1,
    expiresWeek: 8,
    expiresSeason: 1,
    requiredPositions: ["CM"],
    preferredRole: "boxToBox",
    developmentPriority: "highCeiling",
    maxAge: 17,
    riskTolerance: "low",
    weeklyWageBudget: 1_000,
    competitionPressure: 40,
    status: "open",
    ...overrides,
  };
}

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-base",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 2,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Intelligent movement"],
    weaknesses: ["Physical adaptation"],
    conviction: "recommend",
    summary: "A considered academy recommendation.",
    estimatedValue: 0,
    qualityScore: 70,
    ...overrides,
  };
}

function verdict(
  confidence: "low" | "medium" | "high",
  hypothesisId: string,
  acknowledgedUncertainty = "Some uncertainty remains.",
) {
  return {
    verdict: "A material professional judgment.",
    confidence,
    hypothesisIds: [hypothesisId],
    acknowledgedUncertainty,
  };
}

function structuredInput(
  overrides: Partial<StructuredReportInput> = {},
): StructuredReportInput {
  return {
    briefId: "brief-1",
    intendedClubId: "club-academy",
    intendedAudience: "academyDirector",
    recruitmentNeed: "Add a credible central-midfield pathway option.",
    projectedRole: "boxToBox",
    recommendedAction: "offerAcademyPlace",
    riskFactors: ["Physical adaptation"],
    estimatedWeeklyWage: 650,
    decisionDeadlineWeek: 7,
    decisionDeadlineSeason: 1,
    categoryVerdicts: {
      potential: verdict("high", "hyp-potential"),
      roleFit: verdict("high", "hyp-role"),
      characterRisk: verdict("high", "hyp-character"),
    },
    alternativePlayerIds: ["player-alt"],
    ...overrides,
  };
}

function observations(): Observation[] {
  return (["schoolMatch", "trainingGround", "parentCoachMeeting"] as const).map(
    (context, index) => ({
      id: `observation-${index}`,
      playerId: "player-1",
      scoutId: "scout-1",
      week: index + 1,
      season: 1,
      context,
      attributeReadings: [],
      notes: [],
      flaggedMoments: [],
    }),
  );
}

const decisionScout = { id: "scout-1", reputation: 20 } as Scout;
const visiblePlayer = {
  id: "player-1",
  age: 16,
  position: "CM" as const,
  secondaryPositions: [],
};

describe("academy placement decisions", () => {
  it("lets authored report fields materially change score and outcome under a fixed seed", () => {
    const strongReport = report({
      conviction: "tablePound",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 650,
      riskFactors: ["Physical adaptation"],
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const weakReport = report({
      conviction: "note",
      projectedRole: "advancedPlaymaker",
      recommendedAction: "monitor",
      estimatedWeeklyWage: 100_000,
      riskFactors: [
        "Physical adaptation",
        "Availability",
        "Tactical uncertainty",
        "Character uncertainty",
        "Family relocation",
        "Education disruption",
      ],
      categoryVerdicts: {
        potential: verdict("low", "hyp-shared", "Major uncertainty remains unresolved."),
        roleFit: verdict("low", "hyp-shared", "Major uncertainty remains unresolved."),
        characterRisk: verdict("low", "hyp-shared", "Major uncertainty remains unresolved."),
      },
    });
    const shared = {
      brief: brief({ competitionPressure: 80 }),
      player: visiblePlayer,
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 20,
    };

    const strong = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("fixed-academy-decision"),
      report: strongReport,
    });
    const weak = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("fixed-academy-decision"),
      report: weakReport,
    });

    expect(strong.outcome).toBe("accepted");
    expect(weak.outcome).toBe("rejected");
    expect(strong.breakdown.total).toBeGreaterThan(weak.breakdown.total + 35);
    expect(strong.breakdown).toMatchObject({
      briefFit: 100,
      affordability: 88,
      conviction: 82,
      calibration: 70,
    });
    expect(strong.breakdown.evidence).toBeGreaterThan(weak.breakdown.evidence);
    expect(strong.breakdown.competition).toBeGreaterThan(weak.breakdown.competition);
    expect(strong.reasons.join(" ")).toContain("Declared confidence outruns");
  });

  it("caps unsupported confidence and penalizes certainty that outruns evidence", () => {
    const oneContext = observations().slice(0, 1);
    const medium = report({
      conviction: "tablePound",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 650,
      riskFactors: ["Physical adaptation", "Character uncertainty"],
      categoryVerdicts: {
        potential: verdict("medium", "hyp-shared"),
        roleFit: verdict("medium", "hyp-shared"),
        characterRisk: verdict("medium", "hyp-shared"),
      },
    });
    const high = report({
      ...medium,
      categoryVerdicts: {
        potential: verdict("high", "hyp-shared"),
        roleFit: verdict("high", "hyp-shared"),
        characterRisk: verdict("high", "hyp-shared"),
      },
    });
    const shared = {
      brief: brief(),
      player: visiblePlayer,
      observations: oneContext,
      scout: decisionScout,
      club: club(),
      relationshipScore: 35,
    };
    const mediumDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("confidence-calibration"),
      report: medium,
    });
    const highDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("confidence-calibration"),
      report: high,
    });

    expect(highDecision.breakdown.evidence).toBe(mediumDecision.breakdown.evidence);
    expect(highDecision.breakdown.calibration).toBeLessThan(
      mediumDecision.breakdown.calibration ?? 0,
    );
    expect(highDecision.breakdown.conviction).toBeLessThan(
      mediumDecision.breakdown.conviction,
    );
    expect(highDecision.breakdown.total).toBeLessThan(mediumDecision.breakdown.total);
  });

  it("treats impossible wage estimates as uncertainty rather than free affordability", () => {
    const shared = {
      brief: brief(),
      player: visiblePlayer,
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 50,
    };
    const zeroWage = report({
      estimatedWeeklyWage: 0,
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const credibleWage = { ...zeroWage, estimatedWeeklyWage: 650 };
    const zeroDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("wage-credibility"),
      report: zeroWage,
    });
    const credibleDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("wage-credibility"),
      report: credibleWage,
    });

    expect(zeroDecision.breakdown.affordability).toBe(0);
    expect(credibleDecision.breakdown.affordability).toBeGreaterThan(80);
    expect(validateStructuredReportInput(
      structuredInput({ estimatedWeeklyWage: 0 }),
      brief(),
    ).valid).toBe(false);
  });

  it("rewards honest, distinct risk disclosure instead of report-polishing omissions", () => {
    const oneRisk = report({
      estimatedWeeklyWage: 650,
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      riskFactors: ["Physical adaptation"],
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const threeRisks = {
      ...oneRisk,
      riskFactors: [
        "Physical adaptation",
        "Family relocation",
        "Education disruption",
      ],
    };
    const shared = {
      brief: brief(),
      player: visiblePlayer,
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 50,
    };
    const oneRiskDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("risk-disclosure"),
      report: oneRisk,
    });
    const threeRiskDecision = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("risk-disclosure"),
      report: threeRisks,
    });

    expect(threeRiskDecision.breakdown.risk).toBeGreaterThan(
      oneRiskDecision.breakdown.risk,
    );
  });

  it("is invariant to hidden current and potential ability values", () => {
    const authored = report({
      conviction: "strongRecommend",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 700,
      riskFactors: ["Adaptation"],
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const shared = {
      report: authored,
      brief: brief(),
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 50,
    };
    const lowTruth = {
      ...visiblePlayer,
      currentAbility: 1,
      potentialAbility: 1,
    } as unknown as Parameters<typeof scoreAcademyClubDecision>[0]["player"];
    const highTruth = {
      ...visiblePlayer,
      currentAbility: 200,
      potentialAbility: 200,
    } as unknown as Parameters<typeof scoreAcademyClubDecision>[0]["player"];

    const low = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("truth-firewall"),
      player: lowTruth,
    });
    const high = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("truth-firewall"),
      player: highTruth,
    });
    expect(high).toEqual(low);

    const accessTrap = {
      ...visiblePlayer,
      get currentAbility(): never {
        throw new Error("currentAbility must not be read");
      },
      get potentialAbility(): never {
        throw new Error("potentialAbility must not be read");
      },
    } as unknown as Parameters<typeof scoreAcademyClubDecision>[0]["player"];
    expect(() => scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("truth-firewall"),
      player: accessTrap,
    })).not.toThrow();
  });

  it("applies a small deterministic and explainable presentation modifier", () => {
    const base = report({
      conviction: "strongRecommend",
      intendedAudience: "headOfRecruitment",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 700,
      riskFactors: ["Physical adaptation", "Family relocation"],
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const shared = {
      brief: brief({ developmentPriority: "highCeiling", riskTolerance: "low" }),
      player: visiblePlayer,
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 50,
    };
    const evidenceLed = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("presentation-fixed"),
      report: { ...base, presentationApproach: "evidenceLed" },
    });
    const fitLed = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("presentation-fixed"),
      report: { ...base, presentationApproach: "fitLed" },
    });
    const repeated = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("presentation-fixed"),
      report: { ...base, presentationApproach: "evidenceLed" },
    });

    expect(repeated).toEqual(evidenceLed);
    expect(evidenceLed.breakdown.presentation).toBe(80);
    expect(fitLed.breakdown.presentation).toBe(60);
    expect(evidenceLed.breakdown.evidence).toBe(fitLed.breakdown.evidence + 5);
    expect(fitLed.breakdown.briefFit).toBeGreaterThan(evidenceLed.breakdown.briefFit);
    expect(Math.abs(evidenceLed.breakdown.total - fitLed.breakdown.total)).toBeLessThanOrEqual(6);
    expect(evidenceLed.reasons.some((reason) =>
      reason.includes("Evidence-led presentation: evidence +4"),
    )).toBe(true);
  });

  it("makes the selected placement pitch and support promise matter without overpowering evidence", () => {
    const authored = report({
      conviction: "recommend",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 700,
      riskFactors: ["Family relocation", "Education transition"],
      categoryVerdicts: structuredInput().categoryVerdicts,
    });
    const mobilityAssessment = {
      status: "conditional",
      clubDecisionAdjustment: { score: -2, summary: "The move needs a support plan." },
      visibleReasons: ["Family and education arrangements remain open."],
      suggestedMitigationActions: ["Agree a family support plan."],
      dimensions: {
        registration: { riskScore: 10 },
        adaptation: { riskScore: 48 },
        familyEducation: { riskScore: 62 },
        pathwaySupport: { riskScore: 20 },
      },
    } as unknown as NonNullable<
      Parameters<typeof scoreAcademyClubDecision>[0]["mobilityAssessment"]
    >;
    const shared = {
      report: authored,
      brief: brief(),
      player: visiblePlayer,
      observations: observations(),
      scout: decisionScout,
      club: club(),
      relationshipScore: 20,
      mobilityAssessment,
    };

    const aligned = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("placement-strategy"),
      placementStrategy: {
        pitchPosture: "evidenceLed",
        supportCondition: "familySupport",
      },
    });
    const misaligned = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("placement-strategy"),
      placementStrategy: {
        pitchPosture: "relationshipLed",
        supportCondition: "none",
      },
    });

    expect(aligned.breakdown.total).toBe(misaligned.breakdown.total + 6);
    expect(aligned.reasons.join(" ")).toContain("evidence trail");
    expect(aligned.reasons.join(" ")).toContain("family and settlement support");
    expect(misaligned.reasons.join(" ")).toContain("secure a fair hearing");
  });

  it("lets the seasonal recruitment climate materially change club evaluation", () => {
    const borderline = report({
      conviction: "recommend",
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      estimatedWeeklyWage: 900,
      riskFactors: ["Physical adaptation", "Education transition"],
      categoryVerdicts: {
        potential: verdict("medium", "hyp-potential"),
        roleFit: verdict("medium", "hyp-role"),
        characterRisk: verdict("low", "hyp-character", "Character evidence remains limited."),
      },
    });
    const shared = {
      report: borderline,
      brief: brief({ riskTolerance: "low", competitionPressure: 50 }),
      player: visiblePlayer,
      observations: observations().slice(0, 2),
      scout: decisionScout,
      club: club(),
      relationshipScore: 35,
    };
    const openMarket = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("seasonal-recruitment"),
      worldConditionContext: {
        scoreAdjustment: 10,
        label: "Open Transfer Market",
      },
    });
    const creditSqueeze = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("seasonal-recruitment"),
      worldConditionContext: {
        scoreAdjustment: -10,
        label: "Credit Squeeze",
      },
    });

    expect(openMarket.breakdown.total).toBeGreaterThan(
      creditSqueeze.breakdown.total,
    );
    expect(openMarket.breakdown.total - creditSqueeze.breakdown.total)
      .toBeGreaterThanOrEqual(18);
    expect(openMarket.reasons.join(" ")).toContain("Open Transfer Market increases");
    expect(creditSqueeze.reasons.join(" ")).toContain("Credit Squeeze reduces");
  });
});

describe("academy brief lifecycle invariants", () => {
  it("uses one bounded capacity rule across changing opportunity markets", () => {
    expect(deriveYouthRecruitmentBriefCapacity(1)).toBe(12);
    expect(deriveYouthRecruitmentBriefCapacity(0.92)).toBe(11);
    expect(deriveYouthRecruitmentBriefCapacity(0)).toBe(7);
    expect(deriveYouthRecruitmentBriefCapacity(Number.NaN)).toBe(12);
  });

  it("closes the lowest-pressure overflow when market capacity contracts", () => {
    const high = brief({ id: "brief-high", competitionPressure: 80 });
    const medium = brief({ id: "brief-medium", competitionPressure: 55 });
    const low = brief({ id: "brief-low", competitionPressure: 25 });
    const contracted = advanceYouthRecruitmentBriefs(
      { [high.id]: high, [medium.id]: medium, [low.id]: low },
      2,
      1,
      38,
      2,
    );

    expect(contracted.briefs[high.id].status).toBe("open");
    expect(contracted.briefs[medium.id].status).toBe("open");
    expect(contracted.briefs[low.id].status).toBe("expired");
    expect(contracted.expiredIds).toEqual([low.id]);
    expect(advanceYouthRecruitmentBriefs(
      contracted.briefs,
      2,
      1,
      38,
      2,
    ).expiredIds).toEqual([]);
  });

  it("derives weekly pressure deterministically and expires a brief exactly once", () => {
    const original = brief({ competitionPressure: 40 });
    const atCreation = advanceYouthRecruitmentBriefs({ [original.id]: original }, 1, 1);
    expect(atCreation.briefs[original.id].competitionPressure).toBe(40);

    const weekTwo = advanceYouthRecruitmentBriefs({ [original.id]: original }, 2, 1);
    expect(weekTwo.briefs[original.id].competitionPressure).toBe(43);
    const repeatedWeekTwo = advanceYouthRecruitmentBriefs(weekTwo.briefs, 2, 1);
    expect(repeatedWeekTwo).toEqual(weekTwo);

    const skippedToWeekFour = advanceYouthRecruitmentBriefs({ [original.id]: original }, 4, 1);
    expect(skippedToWeekFour.briefs[original.id].competitionPressure).toBe(49);

    const expired = advanceYouthRecruitmentBriefs({ [original.id]: original }, 8, 1);
    expect(expired.expiredIds).toEqual([original.id]);
    expect(expired.briefs[original.id].status).toBe("expired");
    const expiredReplay = advanceYouthRecruitmentBriefs(expired.briefs, 8, 1);
    expect(expiredReplay.expiredIds).toEqual([]);
    expect(expiredReplay.briefs).toEqual(expired.briefs);
  });
});

describe("structured youth report revisions", () => {
  it("preserves immutable predecessors and every required professional field", () => {
    const firstInput = structuredInput({
      riskFactors: ["  Physical adaptation  ", "Physical adaptation"],
      alternativePlayerIds: ["player-alt", "player-alt", "player-1"],
      categoryVerdicts: {
        potential: {
          ...verdict("high", "hyp-potential"),
          hypothesisIds: ["hyp-potential", "hyp-potential"],
        },
        roleFit: verdict("medium", "hyp-role"),
        characterRisk: verdict("low", "hyp-character"),
      },
      estimatedWeeklyWage: 650.7,
    });
    expect(validateStructuredReportInput(firstInput, brief())).toEqual({
      valid: true,
      errors: [],
    });

    const first = applyStructuredReportInput(report({ id: "generated-1" }), firstInput);
    const predecessorSnapshot = structuredClone(first);
    const secondInput = structuredInput({
      recruitmentNeed: "Re-evaluate the pathway need after a second context.",
      projectedRole: "mezzala",
      recommendedAction: "inviteForTrial",
    });
    const second = applyStructuredReportInput(
      report({ id: "generated-2", submittedWeek: 4 }),
      secondInput,
      first,
    );

    expect(first).toEqual(predecessorSnapshot);
    expect(first).toMatchObject({
      id: "generated-1_r1",
      revision: 1,
      supersedesReportId: undefined,
      briefId: firstInput.briefId,
      intendedClubId: firstInput.intendedClubId,
      intendedAudience: firstInput.intendedAudience,
      presentationApproach: "evidenceLed",
      recruitmentNeed: firstInput.recruitmentNeed,
      projectedRole: firstInput.projectedRole,
      recommendedAction: firstInput.recommendedAction,
      estimatedWeeklyWage: 651,
      decisionDeadlineWeek: firstInput.decisionDeadlineWeek,
      decisionDeadlineSeason: firstInput.decisionDeadlineSeason,
    });
    expect(first.riskFactors).toEqual(["Physical adaptation", "Physical adaptation"]);
    expect(first.alternativePlayerIds).toEqual(["player-alt"]);
    expect(first.categoryVerdicts?.potential?.hypothesisIds).toEqual(["hyp-potential"]);
    expect(Object.keys(first.categoryVerdicts ?? {}).sort()).toEqual([
      "characterRisk",
      "potential",
      "roleFit",
    ]);
    expect(isStructuredYouthReport(first)).toBe(true);

    expect(second).toMatchObject({
      id: "generated-2_r2",
      revision: 2,
      supersedesReportId: first.id,
      recruitmentNeed: secondInput.recruitmentNeed,
      projectedRole: "mezzala",
      recommendedAction: "inviteForTrial",
      presentationApproach: "evidenceLed",
    });
    expect(second.id).not.toBe(first.id);
    expect(isStructuredYouthReport(second)).toBe(true);

    const persisted = { [first.id]: first, [second.id]: second };
    expect(Object.keys(persisted)).toEqual([first.id, second.id]);
    expect(persisted[second.id].supersedesReportId).toBe(first.id);
  });

  it("rejects incomplete structured artifacts and closed or mismatched briefs", () => {
    const incomplete = structuredInput({
      categoryVerdicts: {
        potential: verdict("high", "hyp-potential"),
        roleFit: verdict("medium", "hyp-role"),
      } as StructuredReportInput["categoryVerdicts"],
      riskFactors: [],
    });
    const incompleteResult = validateStructuredReportInput(incomplete, brief());
    expect(incompleteResult.valid).toBe(false);
    expect(incompleteResult.errors).toContain("Record at least one material risk.");
    expect(incompleteResult.errors).toContain("Write a character and adaptation risk verdict.");

    const closedResult = validateStructuredReportInput(
      structuredInput(),
      brief({ status: "expired" }),
    );
    expect(closedResult.valid).toBe(false);
    expect(closedResult.errors).toContain("Select an open academy recruitment brief.");

    const mismatchedClub = validateStructuredReportInput(
      structuredInput({ intendedClubId: "different-club" }),
      brief(),
    );
    expect(mismatchedClub.valid).toBe(false);
    expect(mismatchedClub.errors).toContain("The report audience must match the recruitment brief.");

    const invalidPresentation = structuredInput({
      presentationApproach: "showmanship" as StructuredReportInput["presentationApproach"],
    });
    expect(validateStructuredReportInput(invalidPresentation, brief()).errors)
      .toContain("Choose a valid presentation approach.");
  });
});
