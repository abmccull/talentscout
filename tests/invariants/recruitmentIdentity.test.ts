import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import type {
  Club,
  Player,
  ScoutReport,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  deriveBriefRecruitmentIdentity,
  deriveClubRecruitmentIdentity,
  deriveRegionRecruitmentIdentity,
  evaluateRecruitmentIdentityFit,
} from "@/engine/world/recruitmentIdentity";
import { generateYouthRecruitmentBriefs } from "@/engine/youth/academyPlacementCase";

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

describe("recruitment identity invariants", () => {
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
    expect(prospectForAcademy.reasons[0]).toContain("Academy builder fit");
    expect(readyForUrgent.reasons[0]).toContain("Immediate-impact recruiter fit");
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
