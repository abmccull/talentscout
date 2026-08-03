import { afterEach, describe, expect, it, vi } from "vitest";

import type { LegacyProfile, NewGameConfig } from "@/engine/core/types";
import {
  applyLegacyPerks,
  LEGACY_PERK_DEFINITIONS,
  LEGACY_PROFILE_STORAGE_KEY,
  readLegacyProfile,
} from "@/engine/career/legacy";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Next",
  scoutLastName: "Scout",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "legacy-profile-integrity",
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

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
}

function validCareer() {
  return {
    scoutName: "Archived Scout",
    finalTier: 4,
    seasonsPlayed: 2,
    totalDiscoveries: 7,
    hitRate: 0.5,
    specialization: "youth",
    completedScenarios: [],
    legacyScoreTotal: 61,
    completedAt: 1,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("legacy profile persistence integrity", () => {
  it("sanitizes storage and rehydrates perks from canonical definitions", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify({
      id: "legacy-untrusted",
      completedCareers: [
        {
          ...validCareer(),
          signature: {
            version: 1,
            id: "career-signature:forged",
            title: "The Department Steward",
            summary: "Forged",
            pillars: ["departmentSteward"],
            evidenceIds: ["leadership-track-record"],
            startHook: "staffCredibility",
          },
        },
        { malformed: true },
      ],
      unlockedScenarios: ["not_a_real_scenario", "rivalry"],
      legacyPerks: [
        {
          id: "financial_cushion",
          name: "Forged reputation",
          description: "Stored values must not be authoritative.",
          type: "reputationBoost",
          value: 999_999,
          unlockedBy: "anything",
        },
        {
          id: "talent_magnet",
          name: "Forged unlock",
          description: "A known ID is not proof of entitlement.",
          type: "reputationBoost",
          value: 20,
          unlockedBy: "anything",
        },
      ],
      totalDiscoveries: 999_999,
      totalSeasonsPlayed: 999_999,
      bestHitRate: 999,
      bestLegacyScore: 999_999,
      highestTierReached: 999,
    }));

    const profile = readLegacyProfile();

    expect(profile).toMatchObject({
      totalDiscoveries: 7,
      totalSeasonsPlayed: 2,
      bestHitRate: 0.5,
      bestLegacyScore: 61,
      highestTierReached: 4,
      unlockedScenarios: [
        "the_rebuild",
        "moneyball",
        "the_last_season",
        "zero_to_hero",
      ],
    });
    expect(profile?.completedCareers).toHaveLength(1);
    expect(profile?.completedCareers[0].signature).toBeUndefined();
    expect(profile?.legacyPerks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "financial_cushion",
        type: "budgetBonus",
        value: 20,
        unlockedBy: "tier_4_reached",
      }),
    ]));
    expect(profile?.legacyPerks.some((perk) => perk.id === "talent_magnet")).toBe(false);

    const applied = applyLegacyPerks(
      CONFIG,
      profile!,
      ["financial_cushion", "talent_magnet"],
    );
    expect(applied.budgetBonusPercent).toBe(20);
    expect(applied.reputationBonus).toBe(0);
  });

  it("does not accept a known perk ID when completed-career evidence has not earned it", () => {
    const forgedProfile = {
      id: "legacy-forged-perk",
      completedCareers: [validCareer()],
      unlockedScenarios: [],
      legacyPerks: [{
        id: "talent_magnet",
        name: "Unlimited contacts",
        description: "Forged",
        type: "startingContact",
        value: Number.MAX_SAFE_INTEGER,
        unlockedBy: "forged",
      }],
      totalDiscoveries: 7,
      totalSeasonsPlayed: 2,
      bestHitRate: 0.5,
      bestLegacyScore: 61,
      highestTierReached: 4,
    } as unknown as LegacyProfile;

    const applied = applyLegacyPerks(CONFIG, forgedProfile, ["talent_magnet"]);

    expect(applied.reputationBonus).toBe(0);
    expect(applied.extraContacts).toBe(0);
  });

  it("uses bounded country evidence and a truthful old-scenario fallback", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const storeProfile = (career: Record<string, unknown>) => storage.setItem(
      LEGACY_PROFILE_STORAGE_KEY,
      JSON.stringify({
        id: "legacy-country-evidence",
        completedCareers: [career],
        unlockedScenarios: [],
        legacyPerks: [{ id: "regional_memory" }],
        totalDiscoveries: 7,
        totalSeasonsPlayed: 2,
        bestHitRate: 0.5,
        bestLegacyScore: 61,
        highestTierReached: 4,
      }),
    );

    storeProfile(validCareer());
    expect(readLegacyProfile()?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(false);

    storeProfile({
      ...validCareer(),
      legacyEvidence: {
        version: 1,
        scoutedCountryIds: ["england", "france", "spain"],
      },
    });
    expect(readLegacyProfile()?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(true);

    storeProfile({
      ...validCareer(),
      completedScenarios: ["international_assignment"],
    });
    expect(readLegacyProfile()?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(true);
  });

  it("migrates only the exact pre-evidence Regional Memory entitlement once", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const regionalMemory = LEGACY_PERK_DEFINITIONS.find(
      (perk) => perk.id === "regional_memory",
    );
    expect(regionalMemory).toBeDefined();
    const baseProfile = {
      id: "legacy-regional-memory-migration",
      completedCareers: [validCareer()],
      unlockedScenarios: [],
      legacyPerks: [{ ...regionalMemory! }],
      totalDiscoveries: 7,
      totalSeasonsPlayed: 2,
      bestHitRate: 0.5,
      bestLegacyScore: 61,
      highestTierReached: 4,
    };

    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(baseProfile));
    const migrated = readLegacyProfile();
    expect(migrated?.entitlementSchemaVersion).toBe(1);
    expect(migrated?.entitlementMigrationEvidence).toMatchObject({
      version: 1,
      grandfatheredPerkIds: ["regional_memory"],
      migratedCareerCount: 1,
    });
    expect(migrated?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(true);

    const persistedAfterMigration = storage.getItem(LEGACY_PROFILE_STORAGE_KEY);
    expect(persistedAfterMigration).toContain('"entitlementSchemaVersion":1');
    expect(readLegacyProfile()).toEqual(migrated);
    expect(storage.getItem(LEGACY_PROFILE_STORAGE_KEY)).toBe(persistedAfterMigration);

    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify({
      ...baseProfile,
      entitlementSchemaVersion: 1,
    }));
    expect(readLegacyProfile()?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(false);

    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify({
      ...baseProfile,
      entitlementSchemaVersion: 1,
      entitlementMigrationEvidence: {
        version: 1,
        grandfatheredPerkIds: ["regional_memory"],
        migratedCareerCount: 1,
        careerFingerprint: "0000000000000000",
      },
    }));
    expect(readLegacyProfile()?.legacyPerks.some((perk) => perk.id === "regional_memory"))
      .toBe(false);
  });

  it("fails closed for malformed or oversized root data without throwing", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify({
      id: "legacy-malformed",
      completedCareers: "not-an-array",
      unlockedScenarios: [],
      legacyPerks: [],
    }));
    expect(() => readLegacyProfile()).not.toThrow();
    expect(readLegacyProfile()).toBeUndefined();

    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, "x".repeat(1_000_001));
    expect(readLegacyProfile()).toBeUndefined();
  });
});
