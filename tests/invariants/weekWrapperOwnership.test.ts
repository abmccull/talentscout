import { describe, expect, it, vi } from "vitest";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";
import { createWeekSimulationActions } from "@/stores/actions/weekSimulationActions";
const life = vi.hoisted(() => ({ generation: 0 }));
vi.mock("@/lib/weeklySimulationLifecycle", () => ({ getWeeklySimulationGeneration: () => life.generation }));

for (const action of ["fastForwardWeek", "advanceDay"] as const) describe(`${action} replacement ownership`, () => {
  it("retains a newly loaded pending recovery after a cancelled worker finishes", async () => {
    life.generation = 0;
    let done!: (value: "cancelled") => void;
    const pendingWorker = new Promise<"cancelled">(resolve => {done = resolve;});
    let store = { gameState: {currentSeason: 1,currentWeek: 1}, weekSimulation: {dayResults:[],currentDay:6,pendingWorldTick:false}, currentScreen:"weekSimulation", advanceWeekAsync: () => pendingWorker } as unknown as GameStoreState;
    const get: GetState = () => store; const set: SetState = p => {store = {...store,...(typeof p === "function" ? p(store) : p)};};
    const actions = createWeekSimulationActions(get,set,{isDayInteractionPending:()=>false} as unknown as Parameters<typeof createWeekSimulationActions>[2]);
    const pending = actions[action]();
    const recovery = {dayResults:[],currentDay:2,pendingWorldTick:false};
    life.generation++;
    set({gameState: {currentSeason: 5,currentWeek:8} as GameStoreState["gameState"], weekSimulation: recovery as GameStoreState["weekSimulation"],currentScreen:"weekSimulation"});
    done("cancelled"); await pending;
    expect(get().weekSimulation).toBe(recovery);
    expect(get().currentScreen).toBe("weekSimulation");
  });
});

