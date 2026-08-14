import { describe, expect, it } from "vitest";
import type {
  Club,
  NewGameConfig,
  Player,
  RetainerContract,
} from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  acceptRetainer,
  generateRetainerOffers,
  recordRetainerDelivery,
} from "@/engine/finance/retainers";
import {
  buildYouthRetainerBrief,
  ensureYouthRetainerBrief,
  isValidYouthRetainerBrief,
  normalizeYouthRetainerContracts,
} from "@/engine/finance/retainerBriefs";
import { pitchToClub } from "@/engine/finance/clientRelationships";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Youth",
  scoutLastName: "Retainer",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "youth-retainer-scope",
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

const player = {
  id: "player-youth-cm",
  position: "CM",
  age: 17,
} as Player;

function club(
  id: string,
  scoutingPhilosophy: Club["scoutingPhilosophy"],
): Club {
  return {
    id,
    name: `Club ${id}`,
    reputation: 60,
    scoutingPhilosophy,
    playerIds: [player.id],
  } as Club;
}

function independentScout() {
  return {
    ...createScout(CONFIG, new RNG("youth-retainer-scout")),
    careerPath: "independent" as const,
    independentTier: 3 as const,
    reputation: 100,
  };
}

function contract(overrides: Partial<RetainerContract> = {}): RetainerContract {
  return {
    id: "retainer-youth",
    clubId: "academy",
    tier: 2,
    monthlyFee: 2_000,
    requiredReportsPerMonth: 3,
    reportsDeliveredThisMonth: 0,
    status: "active",
    deliveredReportIds: [],
    ...overrides,
  };
}

describe("Youth Early Access retainer scope", () => {
  it("builds academy-only briefs regardless of club philosophy", () => {
    for (const philosophy of [
      "academyFirst",
      "winNow",
      "marketSmart",
      "globalRecruiter",
    ] as const) {
      const brief = buildYouthRetainerBrief(club(philosophy, philosophy), { [player.id]: player }, 2);
      expect(brief).toMatchObject({
        focus: "academy",
        ageRange: [15, 20],
        targetPositions: expect.any(Array),
      });
      expect(brief.targetPositions).toHaveLength(1);
    }
  });

  it("keeps generated and pitched offers academy-scoped with a mandatory brief", () => {
    const scout = independentScout();
    const finances = initializeFinances(scout, "independent", "normal");
    const clubs = {
      academy: club("academy", "academyFirst"),
      global: club("global", "globalRecruiter"),
      market: club("market", "marketSmart"),
    };
    const players = { [player.id]: player };
    const generated = generateRetainerOffers(
      new RNG("youth-retainer-offers"),
      scout,
      finances,
      clubs,
      1,
      1,
      38,
      players,
    );
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((offer) => offer.brief?.focus === "academy")).toBe(true);

    const alwaysSuccessfulRng = {
      chance: () => true,
      nextInt: (minimum: number) => minimum,
    } as unknown as RNG;
    const pitched = pitchToClub(
      alwaysSuccessfulRng,
      scout,
      finances,
      clubs.global,
      "referral",
      1,
      players,
    );
    expect(pitched.offeredContract?.brief).toMatchObject({
      focus: "academy",
      ageRange: [15, 20],
    });
  });

  it("treats academy briefs missing required fields as invalid instead of throwing", () => {
    expect(
      isValidYouthRetainerBrief({
        focus: "academy",
      } as never),
    ).toBe(false);
    expect(
      isValidYouthRetainerBrief({
        focus: "academy",
        targetPositions: ["ST"],
      } as never),
    ).toBe(false);

    const academy = club("academy", "academyFirst");
    const repaired = ensureYouthRetainerBrief(
      contract({
        brief: { focus: "academy" } as never,
      }),
      academy,
      { [player.id]: player },
    );
    expect(isValidYouthRetainerBrief(repaired.brief)).toBe(true);
  });

  it("repairs legacy offers with club context and rejects invalid direct acceptance", () => {
    const scout = independentScout();
    const finances = initializeFinances(scout, "independent", "normal");
    const academy = club("academy", "globalRecruiter");
    const legacy = contract();

    expect(acceptRetainer(finances, legacy, scout, 38)).toBeNull();

    const repaired = ensureYouthRetainerBrief(legacy, academy, { [player.id]: player });
    expect(acceptRetainer(finances, repaired, scout, 38)).not.toBeNull();

    const migrated = normalizeYouthRetainerContracts(
      { ...finances, pendingRetainerOffers: [legacy] },
      { academy },
      { [player.id]: player },
    );
    expect(migrated.pendingRetainerOffers[0].brief?.focus).toBe("academy");
  });

  it("fails closed for missing or out-of-scope briefs and credits one matching report", () => {
    const scout = independentScout();
    const finances = initializeFinances(scout, "independent", "normal");
    const academy = club("academy", "academyFirst");
    const report = { id: "report-youth", qualityScore: 90 };
    const invalidContracts = [
      contract(),
      contract({
        id: "retainer-first-team",
        brief: {
          focus: "firstTeam",
          targetPositions: ["CM"],
          ageRange: [18, 27],
          minimumReportQuality: 50,
          description: "First-team work is outside this build.",
        },
      }),
    ];

    for (const invalid of invalidContracts) {
      const result = recordRetainerDelivery(
        { ...finances, retainerContracts: [invalid] },
        invalid.clubId,
        report,
        player,
      );
      expect(result.retainerContracts[0].reportsDeliveredThisMonth).toBe(0);
    }

    const valid = ensureYouthRetainerBrief(contract(), academy, { [player.id]: player });
    const matchingPlayer = {
      ...player,
      position: valid.brief!.targetPositions[0],
    };
    const delivered = recordRetainerDelivery(
      { ...finances, retainerContracts: [valid] },
      valid.clubId,
      report,
      matchingPlayer,
    );
    expect(delivered.retainerContracts[0].reportsDeliveredThisMonth).toBe(1);
    expect(delivered.retainerContracts[0].deliveredReportIds).toEqual([report.id]);
  });
});
