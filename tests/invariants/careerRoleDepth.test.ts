import { describe, expect, it } from "vitest";

import type {
  AgencyEmployee,
  Club,
  FinancialRecord,
  NewGameConfig,
  RetainerContract,
  Scout,
  ScoutEmploymentContract,
} from "@/engine/core/types";
import {
  attemptCareerTierAdvancement,
  calculateClubRolePressurePenalty,
  deriveCareerRoleProfile,
  deriveContractObjectivesForRole,
  generateJobOffersForTier,
} from "@/engine/career";
import { initializeFinances } from "@/engine/finance/expenses";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Career",
  scoutLastName: "Roles",
  scoutAge: 33,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "career-role-depth",
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

const ACADEMY_CLUB: Club = {
  id: "academy-club",
  name: "Academy Club",
  shortName: "ACA",
  leagueId: "league-one",
  reputation: 50,
  budget: 12_000_000,
  scoutingBudget: 250_000,
  scoutingPhilosophy: "academyFirst",
  managerId: "manager-a",
  playerIds: [],
  youthAcademyRating: 18,
};

const WIN_NOW_CLUB: Club = {
  ...ACADEMY_CLUB,
  id: "win-now-club",
  name: "Win Now Club",
  shortName: "WIN",
  scoutingPhilosophy: "winNow",
  youthAcademyRating: 10,
};

function createdScout(seed = "career-role-scout"): Scout {
  return createScout(CONFIG, new RNG(seed));
}

function contract(
  clubTrustRole: ScoutEmploymentContract["role"] = "Senior Youth Scout",
): ScoutEmploymentContract {
  return {
    id: "contract-a",
    clubId: ACADEMY_CLUB.id,
    role: clubTrustRole,
    tier: 3,
    weeklySalary: 2_000,
    startSeason: 2,
    endSeason: 4,
    status: "active",
    objectives: {
      reportsPerSeason: 20,
      minimumAverageQuality: 68,
      successfulRecommendations: 2,
    },
    signingBonus: 2_000,
    performanceBonusRate: 0.1,
    severanceWeeks: 6,
    educationBudget: 2_000,
  };
}

function retainer(
  id: string,
  clubId: string,
  requiredReportsPerMonth = 2,
): RetainerContract {
  return {
    id,
    clubId,
    tier: 3,
    monthlyFee: 1_500,
    requiredReportsPerMonth,
    reportsDeliveredThisMonth: 0,
    status: "active",
  };
}

function agencyEmployee(): AgencyEmployee {
  return {
    id: "agency-employee",
    name: "Morgan Review",
    role: "analyst",
    quality: 70,
    salary: 850,
    paySatisfaction: 72,
    morale: 75,
    fatigue: 10,
    hiredWeek: 1,
    hiredSeason: 2,
    workProductsGenerated: [],
    experience: 50,
    weeklyLog: [],
    regionFocusWeeks: 0,
  };
}

function independentFinances(scout: Scout): FinancialRecord {
  return {
    ...initializeFinances(scout, "independent", "normal"),
    careerPath: "independent",
    independentTier: 3,
    balance: 50_000,
    completedCourses: ["fa_level_3"],
    office: {
      tier: "small",
      monthlyCost: 500,
      qualityBonus: 0.1,
      maxEmployees: 3,
    },
  };
}

describe("career role depth", () => {
  it("derives materially different club, independent, and agency jobs from existing state", () => {
    const base = createdScout();
    const club = deriveCareerRoleProfile({
      scout: {
        ...base,
        careerPath: "club",
        careerTier: 2,
        currentClubId: ACADEMY_CLUB.id,
      },
      club: ACADEMY_CLUB,
    });
    const independent = deriveCareerRoleProfile({
      scout: {
        ...base,
        careerPath: "independent",
        careerTier: 2,
        independentTier: 2,
      },
    });
    const agency = deriveCareerRoleProfile({
      scout: {
        ...base,
        careerPath: "independent",
        careerTier: 3,
        independentTier: 3,
      },
    });

    expect(club).toMatchObject({
      operatingModel: "club",
      title: "Youth Scout",
      authorityLevel: "advisory",
    });
    expect(club.responsibilities.join(" ")).toContain("assigned briefs");
    expect(club.failureModes.map((mode) => mode.id)).toContain("trustFailure");

    expect(independent).toMatchObject({
      operatingModel: "independent",
      title: "Independent Youth Specialist",
      authorityLevel: "owner",
    });
    expect(independent.authorities.join(" ")).toContain("Choose clients");
    expect(independent.failureModes.map((mode) => mode.id)).toContain("cashFailure");

    expect(agency).toMatchObject({
      operatingModel: "agency",
      title: "Boutique Youth Agency Principal",
      authorityLevel: "owner",
    });
    expect(agency.authorities.join(" ")).toContain("operating posture");
    expect(agency.failureModes.map((mode) => mode.id)).toEqual(
      expect.arrayContaining(["clientConcentration", "qualityDebt"]),
    );
    expect(new Set([
      club.responsibilities[0],
      independent.responsibilities[0],
      agency.responsibilities[0],
    ]).size).toBe(3);
  });

  it("turns club philosophy and specialization into different contract expectations", () => {
    const academyObjectives = deriveContractObjectivesForRole({
      specialization: "youth",
      tier: 3,
      club: ACADEMY_CLUB,
    });
    const winNowObjectives = deriveContractObjectivesForRole({
      specialization: "youth",
      tier: 3,
      club: WIN_NOW_CLUB,
    });

    expect(academyObjectives.minimumAverageQuality).toBeGreaterThan(
      winNowObjectives.minimumAverageQuality,
    );
    expect(winNowObjectives.successfulRecommendations).toBeGreaterThan(
      academyObjectives.successfulRecommendations,
    );
    expect(academyObjectives.reportsPerSeason).toBeLessThan(
      winNowObjectives.reportsPerSeason,
    );

    const scout = {
      ...createdScout("career-role-offer"),
      careerPath: "independent" as const,
      careerPathChosen: true,
      careerTier: 3 as const,
      independentTier: 3 as const,
      reputation: 65,
    };
    const offer = generateJobOffersForTier(
      new RNG("career-role-offer-market"),
      scout,
      { [ACADEMY_CLUB.id]: ACADEMY_CLUB },
      3,
      3,
    )[0];

    expect(offer).toBeDefined();
    expect(offer.role).toBe("Senior Youth Scout");
    expect(offer.objectives).toEqual(academyObjectives);
  });

  it("makes club trust a real senior-role pressure and promotion gate", () => {
    const base = createdScout("career-role-trust");
    const lowTrust = {
      ...base,
      careerPath: "club" as const,
      careerPathChosen: true,
      careerTier: 3 as const,
      currentClubId: ACADEMY_CLUB.id,
      clubTrust: 20,
      employmentContract: contract(),
    };
    const finances = {
      ...initializeFinances(lowTrust, "club", "normal"),
      completedCourses: ["fa_level_3"],
    };

    expect(calculateClubRolePressurePenalty(lowTrust)).toBeLessThan(0);
    const blocked = attemptCareerTierAdvancement(
      lowTrust,
      finances,
      "performanceReview",
    );
    expect(blocked.decision.blockers).toContain("rolePressure");
    expect(blocked.decision.targetRole).toMatchObject({
      title: "Head of Youth Scouting",
      authorityLevel: "department",
    });

    const trusted = { ...lowTrust, clubTrust: 75 };
    expect(calculateClubRolePressurePenalty(trusted)).toBe(0);
    const promoted = attemptCareerTierAdvancement(
      trusted,
      finances,
      "performanceReview",
    );
    expect(promoted.decision.eligible).toBe(true);
    expect(promoted.scout.careerTier).toBe(4);
  });

  it("blocks agency scale when generic milestones hide concentration and delivery fragility", () => {
    const scout = {
      ...createdScout("career-role-agency"),
      careerPath: "independent" as const,
      careerPathChosen: true,
      careerTier: 3 as const,
      independentTier: 3 as const,
      reputation: 80,
      reportsSubmitted: 100,
    };
    const fragile = {
      ...independentFinances(scout),
      retainerContracts: [
        retainer("fragile-a", "dominant", 12),
        retainer("fragile-b", "dominant", 12),
        retainer("fragile-c", "dominant", 12),
      ],
      employees: [agencyEmployee()],
    };
    const blocked = attemptCareerTierAdvancement(
      scout,
      fragile,
      "independentMilestone",
    );

    expect(blocked.decision.blockers).toContain("agencyHealth");
    expect(blocked.decision.agencyHealth).toMatchObject({
      seniorAgencyReady: false,
    });
    expect(blocked.scout.careerTier).toBe(3);

    const stable = {
      ...independentFinances(scout),
      retainerContracts: [
        retainer("stable-a", "client-a"),
        retainer("stable-b", "client-b"),
        retainer("stable-c", "client-c"),
      ],
      employees: [agencyEmployee()],
    };
    const promoted = attemptCareerTierAdvancement(
      scout,
      stable,
      "independentMilestone",
    );

    expect(promoted.decision.eligible).toBe(true);
    expect(promoted.decision.currentRole?.operatingModel).toBe("agency");
    expect(promoted.decision.targetRole?.title).toBe("Youth Scouting Agency Director");
    expect(promoted.scout).toMatchObject({
      careerTier: 4,
      independentTier: 4,
    });
  });
});
