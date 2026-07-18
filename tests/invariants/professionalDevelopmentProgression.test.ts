import { describe, expect, it, vi } from "vitest";
import { createWeekSchedule } from "@/engine/core/calendar";
import { processWeeklyTick } from "@/engine/core/gameLoop";
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

describe("professional development progression", () => {
  it("does not treat enrollment alone as professional development, but respects a completed qualification", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Learning",
      scoutLastName: "Invariant",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "professional-development-idle-authority",
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
    const base = {
      ...generated,
      currentWeek: 2,
      schedule: createWeekSchedule(2, generated.currentSeason),
      reports: {},
      clubResponses: [],
    };
    const idle = processWeeklyTick(
      base,
      createRNG("professional-development-idle"),
    );
    const studying = processWeeklyTick(
      {
        ...base,
        finances: {
          ...base.finances!,
          activeEnrollment: {
            courseId: "fa_level_1",
            startWeek: 1,
            startSeason: 1,
            completionWeek: 5,
            completionSeason: 1,
            studyWeeksCompleted: 1,
            requiredStudyWeeks: 4,
          },
        },
      },
      createRNG("professional-development-idle"),
    );
    const completed = processWeeklyTick(
      {
        ...base,
        inbox: [{
          id: "course-complete-proof",
          week: 2,
          season: 1,
          type: "event",
          title: "Course Completed",
          body: "Qualification earned.",
          read: false,
          actionRequired: false,
        }],
      },
      createRNG("professional-development-idle"),
    );

    expect(idle.reputationChange).toBe(-1);
    expect(studying.reputationChange).toBe(-1);
    expect(completed.reputationChange).toBe(0);
    expect(studying.satisfactionDeltas).toContainEqual(
      expect.objectContaining({ reason: "Idle week (no scouting activity)" }),
    );
  }, 60_000);
});
