import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState, NewGameConfig } from "@/engine/core/types";
vi.mock("@/engine/career/legacy", async (original) => ({ ...await original<typeof import("@/engine/career/legacy")>(), readLegacyProfile: () => ({ completedCareers: [] }), applyLegacyPerks: (config: unknown) => ({config,reputationBonus:10,fatigueReduction:0,skillBonuses:{},budgetBonusPercent:0,knowledgeRetainPercent:0,extraContacts:0}) }));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({ terminateWeeklySimulationWorker: vi.fn(), warmWeeklySimulationWorker: vi.fn(), getWeeklySimulationGeneration:()=>0 }));
vi.mock("@/stores/actions/persistGameplayAutosave", () => ({ resetGameplayAutosaveWatermark: () => false, queueGameplayAutosave: vi.fn(), queueWeeklyAutosave: vi.fn(), flushGameplayAutosave: vi.fn(), snapshotPersistedGameState:(s:unknown)=>s }));
import { useGameStore } from "@/stores/gameStore";
const originalStart = useGameStore.getState().startNewGame;
afterEach(()=>useGameStore.setState({startNewGame:originalStart}));
describe("New Game+ ownership",()=>{
  it("never applies perks to a replacement loaded while generation completes",async()=>{
    const raw=JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json",import.meta.url),"utf8")).state;
    useGameStore.getState().loadGame(raw);
    const created=useGameStore.getState().gameState!;
    let done!: (state:GameState)=>void;
    const delayed=new Promise<GameState>(resolve=>{done=resolve;});
    useGameStore.setState({startNewGame: (()=>delayed) as typeof originalStart});
    const pending=useGameStore.getState().startNewGamePlus({worldSeed:"new-world"} as NewGameConfig,[]);
    useGameStore.getState().loadGame({...created,currentWeek:9});
    const replacement=useGameStore.getState().gameState;
    done(created); await pending;
    expect(useGameStore.getState().gameState).toBe(replacement);
  });
});
