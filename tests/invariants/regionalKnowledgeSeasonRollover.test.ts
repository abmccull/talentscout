import { describe, expect, it, vi } from "vitest";
import { addActivity, createWeekSchedule } from "@/engine/core/calendar";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { getSeasonLength } from "@/engine/core/gameDate";
import { createRNG } from "@/engine/rng";

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

describe("regional knowledge at the season boundary", () => {
  it("materializes a contact earned during the final week before returning the new season", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Boundary",
      scoutLastName: "Scout",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "regional-contact-final-week",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const finalWeek = getSeasonLength(generated.fixtures, generated.currentSeason);
    const countryMetrics = generated.scout.countryReputations.england;
    const schedule = addActivity(
      createWeekSchedule(finalWeek, generated.currentSeason),
      {
        type: "grassrootsTournament",
        slots: 1,
        description: "Work the final grassroots tournament of the season",
      },
      0,
    );
    const state = {
      ...generated,
      currentWeek: finalWeek,
      schedule,
      regionalKnowledge: {
        ...generated.regionalKnowledge,
        england: {
          ...generated.regionalKnowledge.england,
          knowledgeLevel: 14,
          scoutingEfficiency: 1,
          localContacts: [],
          knowledgeLedger: [],
          processedMetrics: {
            reportsSubmitted: countryMetrics?.reportsSubmitted ?? 0,
            successfulFinds: countryMetrics?.successfulFinds ?? 0,
            contactCount: countryMetrics?.contactCount ?? 0,
          },
        },
      },
    };

    const tick = processWeeklyTick(
      state,
      createRNG(`${state.seed}:regional-contact-final-week`),
    );
    const earned = tick.regionalKnowledgeResult?.newContacts[0];
    expect(tick.endOfSeasonTriggered).toBe(true);
    expect(earned).toBeDefined();

    const advanced = advanceWeek(state, tick);

    expect(advanced.currentSeason).toBe(state.currentSeason + 1);
    expect(advanced.currentWeek).toBe(1);
    expect(advanced.regionalKnowledge.england.localContacts).toContain(earned!.contactId);
    expect(advanced.contacts[earned!.contactId]).toEqual(earned!.contact);
  }, 60_000);
});
