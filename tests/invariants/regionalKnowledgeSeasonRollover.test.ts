import { describe, expect, it, vi } from "vitest";
import { addActivity, createWeekSchedule } from "@/engine/core/calendar";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { getSeasonLength } from "@/engine/core/gameDate";
import { createRNG } from "@/engine/rng";
import { observeSaveRetentionCompaction } from "@/engine/world/saveRetention";
import { finalizeWeeklyState } from "@/stores/actions/weeklyFinalizeState";
import { processWeeklySeasonRollover } from "@/stores/actions/weeklySeasonRollover";
import { reapproveAnnualClubEconomics } from "@/engine/finance/clubEconomics";

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

    const compactionPhases: string[] = [];
    const stopObserving = observeSaveRetentionCompaction((sample) => {
      compactionPhases.push(sample.phase);
    });
    let finalized: ReturnType<typeof finalizeWeeklyState>;
    try {
      const advanced = advanceWeek(state, tick);
      finalized = finalizeWeeklyState(state, advanced);
    } finally {
      stopObserving();
    }

    expect(compactionPhases).toEqual(["fixtureRetention", "archiveCompaction"]);
    expect(finalized.currentSeason).toBe(state.currentSeason + 1);
    expect(finalized.currentWeek).toBe(1);
    expect(finalized.regionalKnowledge.england.localContacts).toContain(earned!.contactId);
    expect(finalized.contacts[earned!.contactId]).toEqual(earned!.contact);

    const rolled = processWeeklySeasonRollover({
      state: finalized, beforeTick: state, sourceState: state,
      endOfSeasonTriggered: true, predictionAccuracyBonus: 0,
    }).state;
    expect(rolled.currentSeason).toBe(2);
    for (const candidate of Object.values(rolled.clubs)) {
      expect(candidate.recruitmentAllocation?.season).toBe(2);
      expect(candidate.recruitmentAllocation!.amount).toBeGreaterThan(0);
      // Annual funding is recorded before opening recruitment. Reconcile the
      // actual loan fees rather than treating an agreed move as lost funding.
      const openingLoanNet = (rolled.activeLoans ?? [])
        .filter(deal => deal.id.startsWith("opening-loan:") && deal.startSeason === 2 && deal.startWeek === 1)
        .reduce((net, deal) => net + (deal.parentClubId === candidate.id ? deal.loanFee : 0)
          - (deal.loanClubId === candidate.id ? deal.loanFee : 0), 0);
      expect(candidate.budget).toBe(candidate.recruitmentAllocation!.budgetAfter + openingLoanNet);
      expect(candidate.recruitmentAllocation!.budgetAfter).toBe(
        candidate.recruitmentAllocation!.budgetBefore + candidate.recruitmentAllocation!.amount,
      );
    }
    const saved = JSON.parse(JSON.stringify(rolled));
    expect(reapproveAnnualClubEconomics(saved.clubs, saved.players, saved.currentSeason)).toEqual(saved.clubs);
    const ordinaryWeek = processWeeklySeasonRollover({
      state: saved, beforeTick: saved, sourceState: saved,
      endOfSeasonTriggered: false, predictionAccuracyBonus: 0,
    }).state;
    expect(ordinaryWeek.clubs).toEqual(saved.clubs);
  }, 60_000);
});
