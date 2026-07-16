import { describe, expect, it } from "vitest";
import type {
  Club,
  GameState,
  JobOffer,
  NewGameConfig,
  PerformanceReview,
} from "@/engine/core/types";
import {
  acceptJobOffer,
  endClubEmployment,
  generateContractRenewalOffer,
} from "@/engine/career/progression";
import { applyClubEmploymentTransition } from "@/engine/career/transitions";
import { initializeFinances } from "@/engine/finance/expenses";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Career",
  scoutLastName: "Ledger",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "career-employment",
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

describe("career employment integrity", () => {
  it("preserves lifetime history across hiring, firing, and rehiring", () => {
    const created = createScout(CONFIG, new RNG("career-employment-scout"));
    const independent = {
      ...created,
      careerPath: "independent" as const,
      independentTier: 3 as const,
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
    };
    const offer: JobOffer = {
      id: "offer-club-a",
      clubId: "club-a",
      tier: 3,
      role: "Senior Youth Scout",
      salary: 1_500,
      contractLength: 2,
      objectives: {
        reportsPerSeason: 18,
        minimumAverageQuality: 68,
        successfulRecommendations: 2,
      },
      signingBonus: 2_000,
      performanceBonusRate: 0.11,
      severanceWeeks: 8,
      educationBudget: 2_500,
      expiresWeek: 38,
    };

    const hired = acceptJobOffer(independent, offer, 2);
    expect(hired).toMatchObject({
      careerPath: "club",
      independentTier: undefined,
      currentClubId: "club-a",
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
      employmentContract: {
        id: "scout-contract:offer-club-a",
        weeklySalary: 1_500,
        endSeason: 4,
        performanceBonusRate: 0.11,
        severanceWeeks: 8,
        educationBudget: 2_500,
        objectives: offer.objectives,
      },
    });

    const fired = endClubEmployment({
      ...hired,
      clubTrust: 14,
      boardDirectives: [{ id: "directive-a" }] as typeof hired.boardDirectives,
    });
    expect(fired).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      salary: 0,
      clubTrust: 0,
      reportsSubmitted: 27,
      successfulFinds: 9,
      discoveryCredits: ["prospect-a", "prospect-b"],
      reputation: 63,
      specializationXp: 480,
    });
    expect(fired.currentClubId).toBeUndefined();
    expect(fired.contractEndSeason).toBeUndefined();
    expect(fired.employmentContract?.status).toBe("terminated");
    expect(fired.managerRelationship).toBeUndefined();
    expect(fired.boardDirectives).toEqual([]);

    const rehired = acceptJobOffer(
      fired,
      { ...offer, id: "offer-club-b", clubId: "club-b", tier: 4 },
      3,
    );
    expect(rehired.reportsSubmitted).toBe(27);
    expect(rehired.successfulFinds).toBe(9);
    expect(rehired.discoveryCredits).toEqual(["prospect-a", "prospect-b"]);
  });

  it("renews the current employer without erasing leadership state", () => {
    const created = createScout(CONFIG, new RNG("career-renewal-scout"));
    const initialOffer: JobOffer = {
      id: "initial-club-a",
      clubId: "club-a",
      tier: 4,
      role: "Head of Youth Recruitment",
      salary: 2_500,
      contractLength: 1,
      objectives: {
        reportsPerSeason: 20,
        minimumAverageQuality: 72,
        successfulRecommendations: 3,
      },
      performanceBonusRate: 0.12,
      severanceWeeks: 10,
      educationBudget: 4_000,
      expiresWeek: 38,
    };
    const employed = acceptJobOffer(created, initialOffer, 2);
    const club = {
      id: "club-a",
      name: "Renewal Athletic",
      reputation: 80,
    } as unknown as Club;
    const review: PerformanceReview = {
      season: 3,
      reportsSubmitted: 22,
      averageQuality: 78,
      successfulRecommendations: 4,
      tablePoundsUsed: 1,
      tablePoundsSuccessful: 1,
      reputationChange: 5,
      outcome: "retained",
    };
    const renewal = generateContractRenewalOffer(
      new RNG("career-renewal-offer"),
      employed,
      club,
      review,
      3,
      38,
    );
    expect(renewal).not.toBeNull();
    if (!renewal) return;

    const state = {
      scout: employed,
      finances: initializeFinances(employed, "club", "normal"),
      currentWeek: 1,
      currentSeason: 3,
      countries: ["england"],
      clubs: { [club.id]: club },
      jobOffers: [renewal, { ...initialOffer, id: "rival", clubId: "club-b" }],
      inbox: [],
      assistantScouts: [],
      npcScouts: { staff: { id: "staff" } },
      npcReports: { report: { id: "report" } },
      npcDelegations: { staff: { scoutId: "staff" } },
      leadershipPortfolio: { season: 3 },
      territories: {},
      managerDirectives: [],
      systemFitCache: {},
    } as unknown as GameState;

    const renewed = applyClubEmploymentTransition(state, renewal);
    expect(renewed.jobOffers).toEqual([]);
    expect(renewed.npcScouts).toEqual(state.npcScouts);
    expect(renewed.npcReports).toEqual(state.npcReports);
    expect(renewed.leadershipPortfolio).toEqual(state.leadershipPortfolio);
    expect(renewed.scout.employmentContract).toMatchObject({
      id: employed.employmentContract?.id,
      clubId: club.id,
      status: "active",
      weeklySalary: renewal.salary,
      objectives: renewal.objectives,
    });
  });
});
