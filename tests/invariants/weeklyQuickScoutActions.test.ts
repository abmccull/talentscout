import { describe, expect, it, vi } from "vitest";
import { createWeekSchedule } from "@/engine/core/calendar";
import type { GameState, QuickScoutPriorities } from "@/engine/core/types";
import {
  createWeeklyQuickScoutActions,
  isBatchAdvanceInProgress,
} from "@/stores/actions/weeklyQuickScoutActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

describe("weekly quick-scout actions", () => {
  it("uses the canonical store transaction while suppressing intermediate autosaves", async () => {
    const initialState = {
      currentWeek: 4,
      currentSeason: 2,
      scout: {
        fatigue: 20,
        skillXp: { technicalEye: 2 },
        attributeXp: { decisionMaking: 1 },
      },
      schedule: createWeekSchedule(4, 2),
      inbox: [],
      discoveryRecords: [],
      observations: {},
    } as unknown as GameState;
    const queueAutosave = vi.fn();
    const observedBatchGuards: boolean[] = [];
    const autoSchedule = vi.fn();
    let store = {
      gameState: initialState,
      weekSimulation: null,
      autoSchedule,
      startWeekSimulation: () => {
        store = {
          ...store,
          weekSimulation: {} as GameStoreState["weekSimulation"],
        };
      },
      fastForwardWeek: async () => {
        observedBatchGuards.push(isBatchAdvanceInProgress());
        const before = store.gameState!;
        store = {
          ...store,
          gameState: {
            ...before,
            currentWeek: before.currentWeek + 1,
            scout: {
              ...before.scout,
              fatigue: 26,
              skillXp: { ...before.scout.skillXp, technicalEye: 5 },
              attributeXp: { ...before.scout.attributeXp, decisionMaking: 4 },
            },
            inbox: [{ title: "A useful update" }],
            discoveryRecords: [{}],
            observations: { observation: {} },
          },
          weekSimulation: null,
        } as unknown as GameStoreState;
      },
    } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update } as GameStoreState;
    };
    const actions = createWeeklyQuickScoutActions(get, set, { queueAutosave });
    store = { ...store, ...actions, autoSchedule } as GameStoreState;

    await actions.batchAdvance(1, {} as QuickScoutPriorities);

    expect(observedBatchGuards).toEqual([true]);
    expect(isBatchAdvanceInProgress()).toBe(false);
    expect(autoSchedule).toHaveBeenCalledTimes(1);
    expect(queueAutosave).toHaveBeenCalledWith(store.gameState, set);
    expect(store.batchSummary).toMatchObject({
      weeksAdvanced: 1,
      startingFatigue: 20,
      endingFatigue: 26,
      totalSkillXp: { technicalEye: 3 },
      totalAttributeXp: { decisionMaking: 3 },
      totalNewMessages: 1,
      totalPlayersDiscovered: 1,
      totalObservationsGenerated: 1,
    });
  });
});
