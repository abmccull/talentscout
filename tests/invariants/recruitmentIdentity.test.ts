import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import { RECRUITMENT_DOCTRINE_CONTENT_PACK } from "@/engine/content/registry";
import type {
  Club,
  GameState,
  Player,
  ScoutReport,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  captureRecruitmentDoctrineSnapshot,
  deriveBriefRecruitmentIdentity,
  deriveClubRecruitmentDoctrine,
  deriveClubRecruitmentIdentity,
  deriveRegionRecruitmentIdentity,
  evaluateRecruitmentIdentityFit,
  listClubRecruitmentExpressions,
  migrateHistoricalRecruitmentSnapshots,
} from "@/engine/world/recruitmentIdentity";
import { generateYouthRecruitmentBriefs } from "@/engine/youth/academyPlacementCase";
import { generateAcademyRecruitmentBriefs } from "@/engine/youth/recruitmentBriefs";

function club(
  id: string,
  philosophy: Club["scoutingPhilosophy"],
  overrides: Partial<Club> = {},
): Club {
  return {
    id,
    name: `${id} FC`,
    shortName: id.slice(0, 4).toUpperCase(),
    leagueId: "league-one",
    reputation: 50,
    budget: 2_000_000,
    scoutingPhilosophy: philosophy,
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 10,
    ...overrides,
  };
}

function rosterPlayer(id: string, clubId: string, age: number): Player {
  return {
    id,
    age,
    clubId,
    contractClubId: clubId,
    position: "CM",
    secondaryPositions: [],
  } as unknown as Player;
}

function brief(
  clubId: string,
  overrides: Partial<YouthRecruitmentBrief> = {},
): YouthRecruitmentBrief {
  return {
    id: `brief-${clubId}`,
    clubId,
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
    weeklyWageBudget: 1_000,
    competitionPressure: 40,
    status: "open",
    ...overrides,
  };
}

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-one",
    playerId: "candidate-one",
    scoutId: "scout-one",
    submittedWeek: 2,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: "recommend",
    summary: "Evidence-led academy assessment.",
    estimatedValue: 100_000,
    qualityScore: 72,
    projectedRole: "boxToBox",
    recommendedAction: "offerAcademyPlace",
    estimatedWeeklyWage: 700,
    riskFactors: ["Relocation"],
    alternativePlayerIds: ["alternative-one"],
    categoryVerdicts: {
      potential: {
        verdict: "Promising ceiling.",
        confidence: "medium",
        hypothesisIds: ["potential-one"],
        acknowledgedUncertainty: "Senior physical development remains uncertain.",
      },
      roleFit: {
        verdict: "Role evidence is credible.",
        confidence: "medium",
        hypothesisIds: ["role-one"],
        acknowledgedUncertainty: "A different match state is still needed.",
      },
      characterRisk: {
        verdict: "Character risk is bounded.",
        confidence: "medium",
        hypothesisIds: ["character-one"],
        acknowledgedUncertainty: "Relocation has not yet been tested.",
      },
    },
    ...overrides,
  };
}

const candidate = {
  id: "candidate-one",
  age: 16,
  position: "CM" as const,
  secondaryPositions: [],
};

const LEGACY_RECRUITMENT_LEDGER: Pick<GameState["runManifest"], "manifestVersion" | "contentDefinitionIds"> = {
  manifestVersion: 2,
  contentDefinitionIds: [
    "career-era:proveJudgment@career-eras.1",
    "football-culture-playbook:england@football-culture-playbooks.1",
  ],
};

const PRE_LEDGER_RECRUITMENT_MANIFEST: Pick<GameState["runManifest"], "manifestVersion" | "contentDefinitionIds"> = {
  manifestVersion: 1,
};

const EXPANDED_RECRUITMENT_LEDGER: Pick<GameState["runManifest"], "manifestVersion" | "contentDefinitionIds"> = {
  manifestVersion: 3,
  contentDefinitionIds: [
    "recruitment-doctrine:academyFirst@recruitment-doctrines.1",
    "recruitment-doctrine:winNow@recruitment-doctrines.1",
    "recruitment-doctrine:marketSmart@recruitment-doctrines.1",
    "recruitment-doctrine:globalRecruiter@recruitment-doctrines.1",
  ],
};

describe("recruitment identity invariants", () => {
  it("gives every philosophy a recognizable doctrine without a second mutable state path", () => {
    const doctrines = {
      academy: deriveClubRecruitmentDoctrine({
        club: club("academy-doctrine", "academyFirst"),
        seed: "doctrine-world",
        season: 4,
      }),
      urgent: deriveClubRecruitmentDoctrine({
        club: club("urgent-doctrine", "winNow"),
        seed: "doctrine-world",
        season: 4,
      }),
      market: deriveClubRecruitmentDoctrine({
        club: club("market-doctrine", "marketSmart"),
        seed: "doctrine-world",
        season: 4,
      }),
      global: deriveClubRecruitmentDoctrine({
        club: club("global-doctrine", "globalRecruiter"),
        seed: "doctrine-world",
        season: 4,
      }),
    };

    expect(doctrines.academy.pathwayPatience).toBeGreaterThan(doctrines.urgent.pathwayPatience);
    expect(doctrines.market.sellingPressure).toBeGreaterThan(doctrines.academy.sellingPressure);
    expect(doctrines.global.geographicReach).toBe("global");
    expect(["balanced", "data"]).toContain(doctrines.market.evidencePreference);
    expect(doctrines).toEqual({
      academy: deriveClubRecruitmentDoctrine({
        club: club("academy-doctrine", "academyFirst"),
        seed: "doctrine-world",
        season: 4,
      }),
      urgent: deriveClubRecruitmentDoctrine({
        club: club("urgent-doctrine", "winNow"),
        seed: "doctrine-world",
        season: 4,
      }),
      market: deriveClubRecruitmentDoctrine({
        club: club("market-doctrine", "marketSmart"),
        seed: "doctrine-world",
        season: 4,
      }),
      global: deriveClubRecruitmentDoctrine({
        club: club("global-doctrine", "globalRecruiter"),
        seed: "doctrine-world",
        season: 4,
      }),
    });
  });

  it("ships twenty authored expressions with five mechanically distinct variants per philosophy", () => {
    const expressions = listClubRecruitmentExpressions();
    const countsByFamily = expressions.reduce<Record<Club["scoutingPhilosophy"], number>>(
      (counts, expression) => {
        counts[expression.family] = (counts[expression.family] ?? 0) + 1;
        return counts;
      },
      {
        academyFirst: 0,
        winNow: 0,
        marketSmart: 0,
        globalRecruiter: 0,
      },
    );

    expect(expressions).toHaveLength(20);
    expect(new Set(expressions.map((expression) => expression.id)).size).toBe(20);
    expect(countsByFamily).toEqual({
      academyFirst: 5,
      winNow: 5,
      marketSmart: 5,
      globalRecruiter: 5,
    });

    const focusOrder = ["highCeiling", "earlyReadiness", "resale", "character"] as const;
    for (const family of RECRUITMENT_DOCTRINE_CONTENT_PACK.entries) {
      const mechanicalVectors = family.expressions.map((expression) =>
        JSON.stringify({
          preferredSeniorAgeRange:
            expression.overrides.preferredSeniorAgeRange ?? family.base.preferredSeniorAgeRange,
          academyIntakeAgeRange:
            expression.overrides.academyIntakeAgeRange ?? family.base.academyIntakeAgeRange,
          evidencePreference:
            expression.overrides.evidencePreference ?? family.base.evidencePreference,
          riskTolerance: expression.overrides.riskTolerance ?? family.base.riskTolerance,
          geographicReach: expression.overrides.geographicReach ?? family.base.geographicReach,
          adaptationTolerance:
            expression.overrides.adaptationTolerance ?? family.base.adaptationTolerance,
          pathwayPatience:
            expression.overrides.pathwayPatience ?? family.base.pathwayPatience,
          tacticalRoleRigidity:
            expression.overrides.tacticalRoleRigidity ?? family.base.tacticalRoleRigidity,
          sellingPressure: expression.overrides.sellingPressure ?? family.base.sellingPressure,
          managerInfluence:
            expression.overrides.managerInfluence ?? family.base.managerInfluence,
          specializationAffinity:
            expression.overrides.specializationAffinity ?? family.base.specializationAffinity,
          objectiveWeights: focusOrder.map((focus) => expression.objectiveWeights?.[focus] ?? 0),
        })
      );
      expect(family.expressions).toHaveLength(5);
      expect(new Set(mechanicalVectors).size).toBe(5);
    }
  });

  it("selects all five deterministic expressions within each doctrine family", () => {
    const families: Club["scoutingPhilosophy"][] = [
      "academyFirst",
      "winNow",
      "marketSmart",
      "globalRecruiter",
    ];

    for (const family of families) {
      const expressions = new Set(
        Array.from({ length: 160 }, (_, index) =>
          deriveClubRecruitmentDoctrine({
            club: club(`${family}-${index}`, family),
            seed: `expression-world-${index}`,
            season: 5,
          }).expressionId
        ),
      );
      expect(expressions.size).toBe(5);
    }
  });

  it("keeps representative saved-world doctrine ids on the legacy three-slot pool", () => {
    const cases = [
      {
        family: "academyFirst" as const,
        clubId: "academyFirst-4",
        seed: "world-0",
        season: 5,
        legacyExpressionId: "academyMentorLadder",
        expandedExpressionId: "academyCommunityAnchor",
      },
      {
        family: "winNow" as const,
        clubId: "winNow-4",
        seed: "world-0",
        season: 5,
        legacyExpressionId: "winNowTacticalLock",
        expandedExpressionId: "winNowLoanStrike",
      },
      {
        family: "marketSmart" as const,
        clubId: "marketSmart-6",
        seed: "world-0",
        season: 7,
        legacyExpressionId: "marketSmartContractExpiryHunt",
        expandedExpressionId: "marketSmartMinutesMarketplace",
      },
      {
        family: "globalRecruiter" as const,
        clubId: "globalRecruiter-3",
        seed: "world-0",
        season: 4,
        legacyExpressionId: "globalPassportPortfolio",
        expandedExpressionId: "globalPermitChessboard",
      },
    ];

    for (const testCase of cases) {
      const savedWorldDoctrine = deriveClubRecruitmentDoctrine({
        club: club(testCase.clubId, testCase.family),
        seed: testCase.seed,
        season: testCase.season,
        runManifest: LEGACY_RECRUITMENT_LEDGER,
      });
      const preLedgerDoctrine = deriveClubRecruitmentDoctrine({
        club: club(testCase.clubId, testCase.family),
        seed: testCase.seed,
        season: testCase.season,
        runManifest: PRE_LEDGER_RECRUITMENT_MANIFEST,
      });
      const expandedDoctrine = deriveClubRecruitmentDoctrine({
        club: club(testCase.clubId, testCase.family),
        seed: testCase.seed,
        season: testCase.season,
        runManifest: EXPANDED_RECRUITMENT_LEDGER,
      });

      expect(savedWorldDoctrine.expressionId).toBe(testCase.legacyExpressionId);
      expect(preLedgerDoctrine.expressionId).toBe(testCase.legacyExpressionId);
      expect(expandedDoctrine.expressionId).toBe(testCase.expandedExpressionId);
    }
  });

  it("keeps legacy careers on three expressions per family while expanded runs can reach all five", () => {
    const families: Club["scoutingPhilosophy"][] = [
      "academyFirst",
      "winNow",
      "marketSmart",
      "globalRecruiter",
    ];

    for (const family of families) {
      const legacyExpressions = new Set(
        Array.from({ length: 160 }, (_, index) =>
          deriveClubRecruitmentDoctrine({
            club: club(`${family}-legacy-${index}`, family),
            seed: `legacy-expression-world-${index}`,
            season: 5,
            runManifest: LEGACY_RECRUITMENT_LEDGER,
          }).expressionId
        ),
      );
      const expandedExpressions = new Set(
        Array.from({ length: 160 }, (_, index) =>
          deriveClubRecruitmentDoctrine({
            club: club(`${family}-expanded-${index}`, family),
            seed: `expanded-expression-world-${index}`,
            season: 5,
            runManifest: EXPANDED_RECRUITMENT_LEDGER,
          }).expressionId
        ),
      );

      expect(legacyExpressions.size).toBe(3);
      expect(expandedExpressions.size).toBe(5);
      expect([...expandedExpressions].some((expressionId) => !legacyExpressions.has(expressionId)))
        .toBe(true);
    }
  });

  it("derives regional identity deterministically and independently of club order", () => {
    const clubs = [
      club("academy-a", "academyFirst", { youthAcademyRating: 18 }),
      club("academy-b", "academyFirst", { youthAcademyRating: 17 }),
      club("market-a", "marketSmart", { youthAcademyRating: 12 }),
    ];
    const players = Object.fromEntries([
      rosterPlayer("p1", "academy-a", 18),
      rosterPlayer("p2", "academy-b", 19),
      rosterPlayer("p3", "market-a", 21),
      rosterPlayer("p4", "market-a", 24),
    ].map((player) => [player.id, player]));
    const input = {
      regionId: "league-one",
      clubs,
      players,
      seed: "identity-seed",
      season: 3,
    };

    const first = deriveRegionRecruitmentIdentity(input);
    const repeated = deriveRegionRecruitmentIdentity(input);
    const reordered = deriveRegionRecruitmentIdentity({
      ...input,
      clubs: [...clubs].reverse(),
    });

    expect(repeated).toEqual(first);
    expect(reordered).toEqual(first);
    expect(first.archetype).toBe("developmentCorridor");
    expect(first.reasons.join(" ")).toContain("academy investment");
  });

  it("uses the run seed for bounded seasonal variation without rewriting regional facts", () => {
    const clubs = [
      club("mixed-a", "academyFirst"),
      club("mixed-b", "winNow"),
      club("mixed-c", "marketSmart"),
      club("mixed-d", "globalRecruiter"),
    ];
    const players = Object.fromEntries(clubs.flatMap((entry, clubIndex) => [
      rosterPlayer(`young-${clubIndex}`, entry.id, 20),
      rosterPlayer(`senior-${clubIndex}`, entry.id, 27),
    ]).map((player) => [player.id, player]));
    const identities = Array.from({ length: 32 }, (_, index) =>
      deriveRegionRecruitmentIdentity({
        regionId: "league-one",
        clubs,
        players,
        seed: `world-${index}`,
        season: 2,
      })
    );

    expect(new Set(identities.map((identity) => identity.seasonalFocus)).size)
      .toBeGreaterThan(1);
    expect(new Set(identities.map((identity) => identity.indicators.averageAcademyRating)))
      .toEqual(new Set([10]));
    expect(identities.every((identity) =>
      identity.competitionIntensity >= 0 && identity.competitionIntensity <= 100
    )).toBe(true);
  });

  it("turns observable youth depth and succession pressure into opportunity priority", () => {
    const targetClub = club("target", "academyFirst", { youthAcademyRating: 16 });
    const shallowPlayers = Object.fromEntries([
      rosterPlayer("senior-a", targetClub.id, 29),
      rosterPlayer("senior-b", targetClub.id, 31),
    ].map((player) => [player.id, player]));
    const deepPlayers = Object.fromEntries([
      ...Object.values(shallowPlayers),
      ...Array.from({ length: 8 }, (_, index) =>
        rosterPlayer(`youth-${index}`, targetClub.id, 17 + index % 3)
      ),
    ].map((player) => [player.id, player]));

    const shallow = deriveClubRecruitmentIdentity({
      club: targetClub,
      players: shallowPlayers,
      seed: "same-world",
      season: 1,
    });
    const deep = deriveClubRecruitmentIdentity({
      club: targetClub,
      players: deepPlayers,
      seed: "same-world",
      season: 1,
    });

    expect(shallow.opportunityScore).toBeGreaterThan(deep.opportunityScore);
    expect(shallow.label).toContain("Academy builder");
    expect(shallow.label).toContain(shallow.doctrine.expressionLabel);
    expect(shallow.reasons.join(" ")).toContain("0 registered players aged 20 or younger");
    expect(deep.reasons.join(" ")).toContain("8 registered players aged 20 or younger");
  });

  it("uses identity priority and regional pressure in generated opportunities", () => {
    const shallowIds = ["old-a", "old-b"];
    const deepIds = Array.from({ length: 8 }, (_, index) => `deep-${index}`);
    const shallowClub = club("shallow", "academyFirst", {
      youthAcademyRating: 16,
      playerIds: shallowIds,
    });
    const deepClub = club("deep", "academyFirst", {
      youthAcademyRating: 16,
      playerIds: deepIds,
    });
    const players = Object.fromEntries([
      rosterPlayer(shallowIds[0], shallowClub.id, 29),
      rosterPlayer(shallowIds[1], shallowClub.id, 31),
      ...deepIds.map((id, index) => rosterPlayer(id, deepClub.id, 17 + index % 3)),
    ].map((player) => [player.id, player]));

    const generated = generateYouthRecruitmentBriefs(
      new RNG("opportunity-order"),
      [deepClub, shallowClub],
      players,
      1,
      1,
      {},
      1,
      38,
      "world-identity",
    );

    expect(generated).toHaveLength(1);
    expect(generated[0].clubId).toBe(shallowClub.id);
    expect(generated[0].competitionPressure).toBeGreaterThan(0);
    expect(["highCeiling", "earlyReadiness", "resale", "character"])
      .toContain(generated[0].developmentPriority);
    expect(generated[0].recruitmentSnapshot?.seasonalObjective)
      .toBe(generated[0].developmentPriority);
    expect(generated[0].recruitmentSnapshot?.riskTolerance)
      .toBe(generated[0].riskTolerance);
  });

  it("creates candidate tradeoffs instead of a universal best profile", () => {
    const academyClub = club("academy", "academyFirst");
    const urgentClub = club("urgent", "winNow");
    const prospectReport = report({
      projectedRole: "advancedPlaymaker",
      recommendedAction: "monitor",
      categoryVerdicts: {
        ...report().categoryVerdicts,
        potential: {
          ...report().categoryVerdicts!.potential!,
          confidence: "high",
        },
        roleFit: {
          ...report().categoryVerdicts!.roleFit!,
          confidence: "low",
        },
      },
    });
    const readyReport = report({
      projectedRole: "boxToBox",
      recommendedAction: "offerAcademyPlace",
      categoryVerdicts: {
        ...report().categoryVerdicts,
        potential: {
          ...report().categoryVerdicts!.potential!,
          confidence: "low",
        },
        roleFit: {
          ...report().categoryVerdicts!.roleFit!,
          confidence: "high",
        },
      },
    });
    const academyBrief = brief(academyClub.id, { developmentPriority: "highCeiling" });
    const urgentBrief = brief(urgentClub.id, { developmentPriority: "earlyReadiness" });
    const academyIdentity = deriveBriefRecruitmentIdentity(academyClub, academyBrief);
    const urgentIdentity = deriveBriefRecruitmentIdentity(urgentClub, urgentBrief);
    const evaluate = (
      identity: ReturnType<typeof deriveBriefRecruitmentIdentity>,
      activeBrief: YouthRecruitmentBrief,
      authoredReport: ScoutReport,
    ) => evaluateRecruitmentIdentityFit({
      identity,
      candidate,
      report: authoredReport,
      brief: activeBrief,
      observationContextCount: 3,
    });

    const prospectForAcademy = evaluate(academyIdentity, academyBrief, prospectReport);
    const prospectForUrgent = evaluate(urgentIdentity, urgentBrief, prospectReport);
    const readyForAcademy = evaluate(academyIdentity, academyBrief, readyReport);
    const readyForUrgent = evaluate(urgentIdentity, urgentBrief, readyReport);

    expect(prospectForAcademy.score).toBeGreaterThan(prospectForUrgent.score);
    expect(readyForUrgent.score).toBeGreaterThan(readyForAcademy.score);
    expect(prospectForAcademy.reasons[0]).toContain("Academy builder");
    expect(prospectForAcademy.reasons[0]).toContain(academyIdentity.doctrine.expressionLabel);
    expect(readyForUrgent.reasons[0]).toContain("Immediate-impact recruiter");
    expect(readyForUrgent.reasons[0]).toContain(urgentIdentity.doctrine.expressionLabel);
  });

  it("keeps a brief's historical doctrine snapshot stable after club philosophy changes", () => {
    const originalClub = club("historical-brief", "academyFirst");
    const doctrine = deriveClubRecruitmentDoctrine({
      club: originalClub,
      seed: "historical-brief-seed",
      season: 6,
    });
    const preservedBrief = brief(originalClub.id, {
      developmentPriority: doctrine.seasonalObjective,
      recruitmentSnapshot: captureRecruitmentDoctrineSnapshot({
        doctrine,
        capturedWeek: 8,
        capturedSeason: 6,
      }),
    });

    const changedClub = {
      ...originalClub,
      scoutingPhilosophy: "winNow" as const,
    };
    const reconstructed = deriveBriefRecruitmentIdentity(changedClub, preservedBrief);

    expect(reconstructed.doctrine.family).toBe("academyFirst");
    expect(reconstructed.doctrine.expressionId).toBe(doctrine.expressionId);
    expect(reconstructed.label).toContain(doctrine.expressionLabel);
    expect(reconstructed.primaryFocus).toBe("highCeiling");
    expect(reconstructed.seasonalFocus).toBe(doctrine.seasonalObjective);
  });

  it("preserves legacy expression ids when reconstructing authored snapshots from saves", () => {
    const preservedBrief = brief("legacy-expression-club", {
      developmentPriority: "character",
      recruitmentSnapshot: {
        snapshotVersion: 1,
        capturedWeek: 4,
        capturedSeason: 2,
        primaryFocus: "highCeiling",
        version: 1,
        clubId: "legacy-expression-club",
        family: "academyFirst",
        archetype: "academyBuilder",
        expressionId: "academyLocalRoots",
        expressionLabel: "Local roots network",
        preferredSeniorAgeRange: [17, 22],
        academyIntakeAgeRange: [14, 15],
        evidencePreference: "live",
        riskTolerance: "high",
        geographicReach: "local",
        adaptationTolerance: 54,
        pathwayPatience: 90,
        tacticalRoleRigidity: 34,
        sellingPressure: 28,
        managerInfluence: 40,
        directorInfluence: 60,
        minimumEvidenceQuality: 61,
        seasonalObjective: "character",
        specializationAffinity: ["youth", "regional"],
        reasons: ["Legacy snapshot preserved this doctrine before the catalog extraction."],
      },
    });

    const reconstructed = deriveBriefRecruitmentIdentity(
      club("legacy-expression-club", "winNow"),
      preservedBrief,
    );

    expect(reconstructed.doctrine.expressionId).toBe("academyLocalRoots");
    expect(reconstructed.doctrine.expressionLabel).toBe("Local roots network");
    expect(reconstructed.doctrine.family).toBe("academyFirst");
    expect(reconstructed.primaryFocus).toBe("highCeiling");
  });

  it("golden-migrates a legacy brief to the exact snapshot produced by live creation", () => {
    const targetClub = club("golden-migration", "globalRecruiter", {
      reputation: 67,
      youthAcademyRating: 16,
    });
    const [liveBrief] = generateAcademyRecruitmentBriefs(
      new RNG("golden-migration-brief"),
      targetClub,
      {},
      11,
      5,
      { maxActiveBriefs: 1 },
    );
    expect(liveBrief?.recruitmentSnapshot).toBeDefined();
    const liveSnapshot = structuredClone(liveBrief.recruitmentSnapshot!);
    const legacyBrief = structuredClone(liveBrief);
    delete legacyBrief.recruitmentSnapshot;

    const state = {
      seed: "golden-migration-state",
      currentSeason: 5,
      clubs: { [targetClub.id]: targetClub },
      youthRecruitmentBriefs: { [legacyBrief.id]: legacyBrief },
      placementReports: {
        "golden-placement": {
          id: "golden-placement",
          reportId: "golden-report",
          caseId: "golden-case",
          briefId: legacyBrief.id,
          unsignedYouthId: "golden-youth",
          targetClubId: targetClub.id,
          scoutId: "golden-scout",
          conviction: "recommend",
          qualityScore: 75,
          week: 12,
          season: 5,
        },
      },
      clubDecisions: {
        "golden-decision": {
          id: "golden-decision",
          caseId: "golden-case",
          deliveryId: "golden-delivery",
          reportId: "golden-report",
          clubId: targetClub.id,
          outcome: "accepted",
          decidedWeek: 13,
          decidedSeason: 5,
          placementReportId: "golden-placement",
        },
      },
      recommendationReviews: {
        "golden-review": {
          id: "golden-review",
          caseId: "golden-case",
          reportId: "golden-report",
          playerId: "golden-player",
          clubId: targetClub.id,
          checkpoint: "oneSeason",
          dueWeek: 12,
          dueSeason: 6,
          status: "scheduled",
        },
      },
    } as unknown as GameState;

    migrateHistoricalRecruitmentSnapshots(state);

    expect(state.youthRecruitmentBriefs[legacyBrief.id].recruitmentSnapshot)
      .toEqual(liveSnapshot);
    expect(state.placementReports["golden-placement"].recruitmentSnapshot)
      .toEqual(liveSnapshot);
    expect(state.clubDecisions["golden-decision"].recruitmentSnapshot)
      .toEqual(liveSnapshot);
    expect(state.recommendationReviews["golden-review"].recruitmentSnapshot)
      .toEqual(liveSnapshot);
  });

  it("preserves cross-season doctrine lineage through philosophy transitions and repeated migration", () => {
    const buildLegacyState = (
      currentPhilosophy: Club["scoutingPhilosophy"],
    ): GameState => {
      const targetClub = club("transition-history", currentPhilosophy);
      const legacyBrief = brief(targetClub.id, {
        id: "transition-brief",
        createdWeek: 6,
        createdSeason: 5,
        developmentPriority: "earlyReadiness",
      });
      return {
        seed: "transition-history-seed",
        currentSeason: 8,
        clubs: { [targetClub.id]: targetClub },
        youthRecruitmentBriefs: { [legacyBrief.id]: legacyBrief },
        placementReports: {
          "transition-placement": {
            id: "transition-placement",
            reportId: "transition-report",
            caseId: "transition-case",
            briefId: legacyBrief.id,
            unsignedYouthId: "transition-youth",
            targetClubId: targetClub.id,
            scoutId: "transition-scout",
            conviction: "recommend",
            qualityScore: 74,
            week: 8,
            season: 5,
          },
        },
        clubDecisions: {
          "transition-decision": {
            id: "transition-decision",
            caseId: "transition-case",
            deliveryId: "transition-delivery",
            reportId: "transition-report",
            clubId: targetClub.id,
            outcome: "accepted",
            decidedWeek: 9,
            decidedSeason: 5,
            placementReportId: "transition-placement",
          },
        },
        recommendationReviews: {
          "transition-review": {
            id: "transition-review",
            caseId: "transition-case",
            reportId: "transition-report",
            playerId: "transition-player",
            clubId: targetClub.id,
            checkpoint: "oneSeason",
            dueWeek: 8,
            dueSeason: 6,
            status: "scheduled",
          },
        },
        clubPhilosophyTransitionState: {
          version: 1,
          activeSeason: 8,
          history: [
            {
              id: "club-philosophy:s4:transition-history",
              clubId: targetClub.id,
              season: 4,
              leagueId: targetClub.leagueId,
              fromPhilosophy: "academyFirst",
              toPhilosophy: "winNow",
              worldConditionNames: [],
              reasonCodes: [],
              reasons: [],
            },
            {
              id: "club-philosophy:s7:transition-history",
              clubId: targetClub.id,
              season: 7,
              leagueId: targetClub.leagueId,
              fromPhilosophy: "winNow",
              toPhilosophy: "marketSmart",
              worldConditionNames: [],
              reasonCodes: [],
              reasons: [],
            },
          ],
        },
      } as unknown as GameState;
    };

    const marketSmartNow = buildLegacyState("marketSmart");
    const globalRecruiterNow = buildLegacyState("globalRecruiter");

    migrateHistoricalRecruitmentSnapshots(marketSmartNow);
    migrateHistoricalRecruitmentSnapshots(globalRecruiterNow);

    const migratedSnapshot = marketSmartNow.youthRecruitmentBriefs["transition-brief"]
      .recruitmentSnapshot;
    expect(migratedSnapshot?.family).toBe("winNow");
    expect(migratedSnapshot?.capturedSeason).toBe(5);
    expect(globalRecruiterNow.youthRecruitmentBriefs["transition-brief"].recruitmentSnapshot)
      .toEqual(migratedSnapshot);
    expect(marketSmartNow.placementReports["transition-placement"].recruitmentSnapshot)
      .toEqual(migratedSnapshot);
    expect(marketSmartNow.clubDecisions["transition-decision"].recruitmentSnapshot)
      .toEqual(migratedSnapshot);
    expect(marketSmartNow.recommendationReviews["transition-review"].recruitmentSnapshot)
      .toEqual(migratedSnapshot);

    const afterFirstMigration = structuredClone(marketSmartNow);
    marketSmartNow.clubs["transition-history"].scoutingPhilosophy = "globalRecruiter";
    const afterCurrentPhilosophyChange = structuredClone(marketSmartNow);
    migrateHistoricalRecruitmentSnapshots(marketSmartNow);
    expect(marketSmartNow).toEqual(afterCurrentPhilosophyChange);

    afterFirstMigration.clubs["transition-history"].scoutingPhilosophy = "globalRecruiter";
    expect(marketSmartNow).toEqual(afterFirstMigration);
  });

  it("uses a stable legacy family when no dated philosophy evidence survives", () => {
    const buildOrphan = (currentPhilosophy: Club["scoutingPhilosophy"]): GameState => {
      const targetClub = club("stable-fallback", currentPhilosophy);
      return {
        seed: "stable-fallback-seed",
        currentSeason: 9,
        clubs: { [targetClub.id]: targetClub },
        youthRecruitmentBriefs: {},
        placementReports: {
          orphan: {
            id: "orphan",
            unsignedYouthId: "orphan-youth",
            targetClubId: targetClub.id,
            scoutId: "orphan-scout",
            conviction: "recommend",
            qualityScore: 68,
            week: 11,
            season: 3,
          },
        },
        clubDecisions: {},
        recommendationReviews: {},
      } as unknown as GameState;
    };
    const academyNow = buildOrphan("academyFirst");
    const winNow = buildOrphan("winNow");

    migrateHistoricalRecruitmentSnapshots(academyNow);
    migrateHistoricalRecruitmentSnapshots(winNow);

    expect(academyNow.placementReports.orphan.recruitmentSnapshot)
      .toEqual(winNow.placementReports.orphan.recruitmentSnapshot);
  });

  it("never lets downstream record ids invent different legacy doctrines", () => {
    const targetClub = club("orphan-migration", "marketSmart");
    const placement = (id: string) => ({
      id,
      unsignedYouthId: `youth-${id}`,
      targetClubId: targetClub.id,
      scoutId: "legacy-scout",
      conviction: "recommend" as const,
      qualityScore: 70,
      week: 8,
      season: 3,
    });
    const decision = (id: string) => ({
      id,
      caseId: `case-${id}`,
      deliveryId: `delivery-${id}`,
      clubId: targetClub.id,
      outcome: "rejected" as const,
      decidedWeek: 9,
      decidedSeason: 3,
    });
    const review = (id: string) => ({
      id,
      caseId: `review-case-${id}`,
      reportId: `review-report-${id}`,
      playerId: `player-${id}`,
      clubId: targetClub.id,
      checkpoint: "oneSeason" as const,
      dueWeek: 8,
      dueSeason: 4,
      status: "scheduled" as const,
    });
    const state = {
      clubs: { [targetClub.id]: targetClub },
      youthRecruitmentBriefs: {},
      placementReports: {
        "placement-a": placement("placement-a"),
        "placement-b": placement("placement-b"),
      },
      clubDecisions: {
        "decision-a": decision("decision-a"),
        "decision-b": decision("decision-b"),
      },
      recommendationReviews: {
        "review-a": review("review-a"),
        "review-b": review("review-b"),
      },
    } as unknown as GameState;

    migrateHistoricalRecruitmentSnapshots(state);

    expect(state.placementReports["placement-a"].recruitmentSnapshot)
      .toEqual(state.placementReports["placement-b"].recruitmentSnapshot);
    expect(state.clubDecisions["decision-a"].recruitmentSnapshot)
      .toEqual(state.clubDecisions["decision-b"].recruitmentSnapshot);
    expect(state.recommendationReviews["review-a"].recruitmentSnapshot)
      .toEqual(state.recommendationReviews["review-b"].recruitmentSnapshot);
  });

  it("bounds identity influence and cannot read hidden ability truth", () => {
    const targetClub = club("truth-firewall", "marketSmart");
    const activeBrief = brief(targetClub.id, { developmentPriority: "resale" });
    const identity = deriveBriefRecruitmentIdentity(targetClub, activeBrief);
    const truthTrap = {
      ...candidate,
      get currentAbility(): never {
        throw new Error("currentAbility must not be read");
      },
      get potentialAbility(): never {
        throw new Error("potentialAbility must not be read");
      },
    } as unknown as Player;

    const result = evaluateRecruitmentIdentityFit({
      identity,
      candidate: truthTrap,
      report: report(),
      brief: activeBrief,
      observationContextCount: 2,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.adjustment).toBeGreaterThanOrEqual(-16);
    expect(result.adjustment).toBeLessThanOrEqual(16);
    expect(result.reasons[0]).toMatch(/[-+]\d+ brief fit/);
  });
});
