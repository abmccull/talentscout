import { afterEach, describe, expect, it, vi } from "vitest";

import type { LegacyProfile, NewGameConfig } from "@/engine/core/types";
import { LEGACY_PROFILE_STORAGE_KEY } from "@/engine/career/legacy";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

const CONFIG: NewGameConfig = {
  scoutFirstName: "Next",
  scoutLastName: "Chapter",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "signature-new-game-plus",
  selectedCountries: ["england"],
  startingCountry: "england",
  openingMode: "desk",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("career signature New Game+ integration", () => {
  it("keeps forged signature fields narrative-only and out of the run manifest", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
    const { useGameStore } = await import("@/stores/gameStore");

    const profile: LegacyProfile = {
      id: "legacy-signature-profile",
      completedCareers: [{
        scoutName: "Prior Steward",
        finalTier: 4,
        seasonsPlayed: 8,
        totalDiscoveries: 18,
        hitRate: 0.62,
        specialization: "youth",
        completedScenarios: [],
        legacyScoreTotal: 140,
        completedAt: 1,
        signature: {
          version: 1,
          id: "career-signature:forged",
          title: "The Department Steward",
          summary: "The Department Steward made other scouts, delegated work, and accountable leadership part of the craft.",
          pillars: ["departmentSteward"],
          evidenceIds: ["leadership-track-record"],
          startHook: "staffCredibility",
          publicEvidence: {
            version: 1,
            fingerprintId: "0123456789abcdef",
            pillarEvidence: [
              { pillar: "guardian", score: 0, evidenceIds: [] },
              { pillar: "calibrator", score: 0, evidenceIds: [] },
              { pillar: "pathwayBuilder", score: 0, evidenceIds: [] },
              { pillar: "connector", score: 0, evidenceIds: [] },
              {
                pillar: "departmentSteward",
                score: 999,
                evidenceIds: ["leadership-track-record"],
              },
              { pillar: "territoryReader", score: 0, evidenceIds: [] },
            ],
          },
        },
        finalChapter: {
          title: "A final review",
          summary: "The record remained open to revision.",
          evidenceIds: ["leadership-track-record"],
        },
      }],
      unlockedScenarios: [],
      legacyPerks: [],
      totalDiscoveries: 18,
      totalSeasonsPlayed: 8,
      bestHitRate: 0.62,
      bestLegacyScore: 140,
      highestTierReached: 4,
    };

    await useGameStore.getState().startNewGame(CONFIG);
    const baseline = structuredClone(useGameStore.getState().gameState!);

    storage.setItem(LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    await useGameStore.getState().startNewGamePlus(CONFIG, []);
    const state = useGameStore.getState().gameState!;

    expect(state.runManifest.legacyUnlockIds).toEqual([]);
    expect(state.scout.reputation).toBe(baseline.scout.reputation);
    expect(state.scout.skills.playerJudgment).toBe(baseline.scout.skills.playerJudgment);
    expect(Object.keys(state.contacts)).toHaveLength(Object.keys(baseline.contacts).length);
    expect(state.inbox[0]?.body).not.toContain("Latest legacy identity:");
    expect(state.inbox[0]?.body).not.toContain("Passive career signature");
  }, 20_000);
});
