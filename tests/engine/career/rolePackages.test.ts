import { expect, test } from "vitest";

import { deriveCareerRolePackage } from "@/engine/career/rolePackages";
import { deriveCareerRoleProfile } from "@/engine/career/roleProfile";

test("club tier 4 package changes the job toward leadership and delegation", () => {
  const result = deriveCareerRolePackage({
    scout: {
      careerPath: "club",
      careerTier: 4,
      primarySpecialization: "youth",
      reputation: 74,
      clubTrust: 58,
      currentClubId: "club-1",
      employmentContract: {
        role: "Head of Youth Scouting",
      },
    },
    club: {
      id: "club-1",
      name: "Northbridge",
      scoutingPhilosophy: "academyFirst",
      reputation: 71,
    },
    leadershipPortfolio: {
      attentionCapacity: 2,
      attentionUsed: 1,
      responsibilities: {
        open: {
          id: "open",
          status: "open",
        },
      },
      trackRecord: {
        ownedSuccesses: 0,
        ownedFailures: 0,
        delegatedSuccesses: 0,
        delegatedFailures: 0,
        deferrals: 0,
        rejected: 0,
        expired: 0,
      },
    },
  } as never);
  const profile = deriveCareerRoleProfile({
    scout: {
      careerPath: "club",
      careerTier: 4,
      primarySpecialization: "youth",
      currentClubId: "club-1",
      reputation: 74,
      clubTrust: 58,
      employmentContract: {
        role: "Head of Youth Scouting",
      },
    } as never,
    club: {
      id: "club-1",
      name: "Northbridge",
      scoutingPhilosophy: "academyFirst",
      reputation: 71,
    } as never,
  });

  expect(result.stage).toBe("leader");
  expect(result.title).toBe(profile.title);
  expect(result.authorityUnlocked).toEqual(profile.authorities);
  expect(result.responsibilities.some((responsibility) => responsibility.track === "leadership")).toBe(true);
  expect(result.decisionThemes.join(" ")).toContain("delegate");
});

test("independent tier 4 package surfaces business and staff risk", () => {
  const result = deriveCareerRolePackage({
    scout: {
      careerPath: "independent",
      careerTier: 4,
      primarySpecialization: "regional",
      reputation: 63,
      clubTrust: 0,
      salary: 0,
    },
    finances: {
      balance: 2500,
      retainerContracts: [
        { status: "active" },
        { status: "suspended" },
      ],
      employees: [
        { morale: 38 },
      ],
      pendingEmployeeEvents: [],
      office: { maxEmployees: 3 },
      clientRelationships: [],
    },
  } as never);

  expect(result.stage).toBe("independentBuilder");
  expect(result.operatingModel).toBe("agency");
  expect(result.pressures.some((pressure) => pressure.id === "runway")).toBe(true);
  expect(result.responsibilities.some((responsibility) => responsibility.track === "staff")).toBe(true);
  expect(result.failureModes.join(" ")).toContain("client");
});

test("package honors finance-driven tier and canonical agency title before the scout tier catches up", () => {
  const result = deriveCareerRolePackage({
    scout: {
      careerPath: "independent",
      careerTier: 2,
      independentTier: 2,
      primarySpecialization: "regional",
      reputation: 55,
      clubTrust: 0,
      salary: 0,
    },
    finances: {
      balance: 8_500,
      independentTier: 3,
      retainerContracts: [],
      employees: [],
      pendingEmployeeEvents: [],
      office: { maxEmployees: 2 },
      clientRelationships: [],
    },
  } as never);

  expect(result.tier).toBe(3);
  expect(result.operatingModel).toBe("agency");
  expect(result.stage).toBe("independentBuilder");
  expect(result.title).toBe("Boutique Regional Agency Principal");
  expect(result.authorityUnlocked).toContain("Hire and assign a small team");
  expect(result.responsibilities.some((responsibility) => responsibility.track === "staff")).toBe(true);
});
