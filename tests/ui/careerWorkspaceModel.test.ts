import { describe, expect, it } from "vitest";
import type { Scout } from "@/engine/core/types";
import type { CareerRoleProfile } from "@/engine/career/roleProfile";
import { buildCareerWorkspaceViewModel } from "@/components/game/career/careerWorkspaceModel";

const ROLE_PROFILE: CareerRoleProfile = {
  operatingModel: "club",
  tier: 3,
  title: "Senior Youth Scout",
  authorityLevel: "portfolio",
  responsibilities: [],
  authorities: [],
  failureModes: [],
  employerNeeds: [],
  minimumTrustForRole: 35,
  promotion: {
    nextRole: "Head of Youth Scouting",
    requirements: ["Turn trusted judgments into remembered outcomes."],
    changes: [],
  },
};

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Jamie",
    lastName: "Vale",
    careerPath: "club",
    careerTier: 3,
    clubTrust: 32,
    currentClubId: "club-1",
    contractEndSeason: 3,
    specializationLevel: 12,
    ...overrides,
  } as Scout;
}

describe("career workspace model", () => {
  it("builds a command bridge with security, recurring cast, and historical callback context", () => {
    const viewModel = buildCareerWorkspaceViewModel({
      scout: scout(),
      finances: {
        balance: 12_000,
        retainerContracts: [],
      } as never,
      currentSeason: 2,
      currentWeek: 6,
      roleProfile: ROLE_PROFILE,
      roleBase: "Northbridge FC",
      monthlyIncome: 2_500,
      monthlyExpenses: 3_400,
      latestReview: {
        season: 1,
        outcome: "warning",
        reportsSubmitted: 14,
        averageQuality: 71,
        successfulRecommendations: 4,
      } as never,
      showPathChoice: false,
      jobOffers: [],
      timelinePreview: [{
        id: "timeline-1",
        label: "Placement",
        title: "Milo Hart",
        description: "Placed into a better academy environment.",
        when: "S2 W4",
      }],
      managerProfile: {
        clubId: "club-1",
        managerName: "R. Ortega",
        preference: "evidenceLed",
      } as never,
      boardProfile: {
        satisfactionLevel: 58,
        personality: "demanding",
      } as never,
      latestTrackedPlayerTitle: "Milo Hart",
    });

    expect(viewModel.pathLabel).toBe("Club command bridge");
    expect(viewModel.signals[0]).toMatchObject({
      label: "Security",
      value: "At risk",
      tone: "red",
    });
    expect(viewModel.signals[2].value).toBe("Earn the next contract");
    expect(viewModel.recurringCast.map((item) => item.title)).toContain("R. Ortega");
    expect(viewModel.highlights[2]).toMatchObject({
      label: "Historical callback",
      title: "Milo Hart",
    });
    expect(viewModel.timelinePreview).toHaveLength(1);
  });
});
