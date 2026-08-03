import { describe, expect, it } from "vitest";

import type {
  AlumniRecord,
  GameState,
  LegacyProfile,
  NewGameConfig,
  RecommendationReview,
} from "@/engine/core/types";
import { generateCompletedCareer, generateLegacyProfile } from "@/engine/career/legacy";
import {
  deriveCareerSignature,
  getLatestCareerSignatureSummary,
} from "@/engine/career/legacySignature";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Legacy",
  scoutLastName: "Reader",
  scoutAge: 31,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "legacy-signature-proof",
  selectedCountries: ["england"],
  startingCountry: "england",
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

function baseState(): GameState {
  const scout = createScout(CONFIG, new RNG("legacy-signature-scout"));
  scout.countryReputations = {};
  return {
    seed: CONFIG.worldSeed,
    currentWeek: 12,
    currentSeason: 4,
    scout,
    reports: {},
    placementReports: {},
    recommendationReviews: {},
    alumniRecords: [],
    discoveryRecords: [],
    completedScenarioIds: [],
    careerMoments: { version: 1, pending: [], history: [] },
    legacyScore: {
      youthFound: 0,
      firstTeamBreakthroughs: 0,
      internationalCapsFromFinds: 0,
      totalScore: 80,
      clubsWorkedAt: 1,
      countriesScouted: 1,
      careerHighTier: 2,
      totalSeasons: 3,
      bestDiscoveryName: "",
      bestDiscoveryPA: 0,
      scenariosCompleted: 0,
    },
  } as unknown as GameState;
}

function calibrationReview(): RecommendationReview {
  return {
    id: "review-calibration",
    caseId: "case-1",
    reportId: "report-1",
    playerId: "player-1",
    clubId: "club-1",
    checkpoint: "oneSeason",
    dueWeek: 1,
    dueSeason: 3,
    status: "complete",
    completedWeek: 1,
    completedSeason: 3,
    confidenceCalibration: 88,
    overallScore: 76,
    playerFacingDimensions: [{
      key: "revisionQuality",
      label: "Revision quality",
      status: "positive",
      evidenceLevel: "full",
      score: 82,
      summary: "The later review changed the original recommendation responsibly.",
    }],
  };
}

function pathwayAlumni(): AlumniRecord {
  return {
    id: "alumni-pathway",
    caseId: "case-2",
    placementReportId: "placement-2",
    playerId: "player-2",
    placedClubId: "club-2",
    currentClubId: "club-2",
    milestones: [
      { type: "firstTeamDebut", week: 4, season: 2, description: "Debut", notified: true },
      { type: "firstGoal", week: 8, season: 2, description: "First goal", notified: true },
      { type: "internationalCallUp", week: 3, season: 3, description: "Call-up", notified: true },
    ],
    careerSnapshots: [],
    placedWeek: 2,
    placedSeason: 1,
    careerUpdates: [],
    currentStatus: "firstTeam",
    seasonStats: [],
    becameContact: false,
  };
}

describe("career signature and legacy carryover", () => {
  it("derives the same identity and hook from the same completed evidence", () => {
    const state = baseState();
    state.recommendationReviews = { "review-calibration": calibrationReview() };

    const first = deriveCareerSignature(state);
    const second = deriveCareerSignature(structuredClone(state));

    expect(second).toEqual(first);
    expect(first.signature).toMatchObject({
      title: "The Honest Calibrator",
      startHook: "reviewDiscipline",
      evidenceIds: ["review-calibration"],
    });
  });

  it("distinguishes equal-score careers by the public evidence that shaped them", () => {
    const calibratorState = baseState();
    calibratorState.recommendationReviews = { "review-calibration": calibrationReview() };

    const pathwayState = baseState();
    pathwayState.alumniRecords = [pathwayAlumni()];

    expect(calibratorState.legacyScore.totalScore).toBe(pathwayState.legacyScore.totalScore);
    const calibrator = deriveCareerSignature(calibratorState).signature;
    const pathway = deriveCareerSignature(pathwayState).signature;

    expect(calibrator.id).not.toBe(pathway.id);
    expect(calibrator.title).toBe("The Honest Calibrator");
    expect(pathway.title).toBe("The Pathway Builder");
    expect(pathway.startHook).toBe("alumniAccess");
  });

  it("cites only visible authority IDs and never exposes hidden ability truth", () => {
    const state = baseState();
    state.recommendationReviews = { "review-calibration": calibrationReview() };
    state.alumniRecords = [pathwayAlumni()];

    const result = deriveCareerSignature(state);
    const allowedEvidence = new Set(["review-calibration", "alumni-pathway"]);
    expect(result.signature.evidenceIds.every((id) =>
      allowedEvidence.has(id) || id.startsWith("fingerprint:"))).toBe(true);
    expect(`${result.signature.title} ${result.signature.summary} ${result.finalChapter.summary}`)
      .not.toMatch(/current ability|potential ability|hidden truth|\bCA\b|\bPA\b/i);
  });

  it("persists the ending and resolves the newest career's narrative summary", () => {
    const olderState = baseState();
    olderState.recommendationReviews = { "review-calibration": calibrationReview() };
    const older = generateCompletedCareer(olderState);

    const latestState = baseState();
    latestState.scout.firstName = "Latest";
    latestState.alumniRecords = [pathwayAlumni()];
    const latest = generateCompletedCareer(latestState);
    const profile: LegacyProfile = {
      id: "legacy-profile",
      completedCareers: [latest, older],
      unlockedScenarios: [],
      legacyPerks: [],
      totalDiscoveries: 0,
      totalSeasonsPlayed: 6,
      bestHitRate: 0,
      bestLegacyScore: 80,
      highestTierReached: 2,
    };

    expect(latest.signature).toBeDefined();
    expect(latest.finalChapter).toBeDefined();
    expect(getLatestCareerSignatureSummary(profile)).toMatchObject({
      sourceCareerName: "Latest Reader",
      signatureTitle: latest.signature?.title,
      signatureSummary: latest.signature?.summary,
      finalChapterTitle: latest.finalChapter?.title,
      finalChapterSummary: latest.finalChapter?.summary,
    });
  });

  it("rejects forged signature fields or evidence archives instead of trusting stored claims", () => {
    const state = baseState();
    state.recommendationReviews = { "review-calibration": calibrationReview() };
    const completed = generateCompletedCareer(state);
    const profile: LegacyProfile = {
      id: "verified-signature-profile",
      completedCareers: [completed],
      unlockedScenarios: [],
      legacyPerks: [],
      totalDiscoveries: completed.totalDiscoveries,
      totalSeasonsPlayed: completed.seasonsPlayed,
      bestHitRate: completed.hitRate,
      bestLegacyScore: completed.legacyScoreTotal,
      highestTierReached: completed.finalTier,
    };

    expect(getLatestCareerSignatureSummary(profile)?.signatureTitle).toBe("The Honest Calibrator");

    const forgedHook = structuredClone(profile);
    forgedHook.completedCareers[0].signature!.startHook = "staffCredibility";
    expect(getLatestCareerSignatureSummary(forgedHook)).toBeUndefined();

    const forgedEvidence = structuredClone(profile);
    forgedEvidence.completedCareers[0].signature!.publicEvidence!.pillarEvidence[0].score = 999;
    expect(getLatestCareerSignatureSummary(forgedEvidence)).toBeUndefined();
  });

  it("enriches an equivalent pre-signature legacy career without duplicating it", () => {
    const state = baseState();
    state.recommendationReviews = { "review-calibration": calibrationReview() };
    const completed = generateCompletedCareer(state);
    const legacyCareer = { ...completed };
    delete legacyCareer.signature;
    delete legacyCareer.finalChapter;
    delete legacyCareer.legacyEvidence;
    const existing: LegacyProfile = {
      id: "pre-signature-profile",
      completedCareers: [{ ...legacyCareer, completedAt: 42 }],
      unlockedScenarios: [],
      legacyPerks: [],
      totalDiscoveries: completed.totalDiscoveries,
      totalSeasonsPlayed: completed.seasonsPlayed,
      bestHitRate: completed.hitRate,
      bestLegacyScore: completed.legacyScoreTotal,
      highestTierReached: completed.finalTier,
    };

    const upgraded = generateLegacyProfile(state, existing);

    expect(upgraded.completedCareers).toHaveLength(1);
    expect(upgraded.completedCareers[0].completedAt).toBe(42);
    expect(upgraded.completedCareers[0].signature?.id).toBe(completed.signature?.id);
    expect(upgraded.completedCareers[0].finalChapter).toEqual(completed.finalChapter);
    expect(upgraded.completedCareers[0].legacyEvidence).toEqual(completed.legacyEvidence);
  });

  it("enriches a version-one signature that predates verifiable public evidence", () => {
    const state = baseState();
    state.recommendationReviews = { "review-calibration": calibrationReview() };
    const completed = generateCompletedCareer(state);
    const oldSignature = { ...completed.signature! };
    delete oldSignature.publicEvidence;
    const existing: LegacyProfile = {
      id: "pre-evidence-profile",
      completedCareers: [{ ...completed, signature: oldSignature, completedAt: 73 }],
      unlockedScenarios: [],
      legacyPerks: [],
      totalDiscoveries: completed.totalDiscoveries,
      totalSeasonsPlayed: completed.seasonsPlayed,
      bestHitRate: completed.hitRate,
      bestLegacyScore: completed.legacyScoreTotal,
      highestTierReached: completed.finalTier,
    };

    const upgraded = generateLegacyProfile(state, existing);

    expect(upgraded.completedCareers).toHaveLength(1);
    expect(upgraded.completedCareers[0].completedAt).toBe(73);
    expect(upgraded.completedCareers[0].signature?.publicEvidence).toBeDefined();
    expect(getLatestCareerSignatureSummary(upgraded)?.signatureTitle).toBe("The Honest Calibrator");
  });
});
