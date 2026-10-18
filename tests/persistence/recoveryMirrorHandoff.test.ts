import {readFileSync} from "node:fs";
import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({guard:undefined as undefined|(()=>boolean),snapshot:undefined as unknown}));
vi.mock("@/lib/activeSaveProvider",()=>({getActiveSaveProvider:async()=>({restoreRecoveryCopy:async(_id:string,owner:{canCommit:()=>boolean;canMirror?:()=>boolean})=>{mocks.guard=owner.canMirror??owner.canCommit;return{state:mocks.snapshot,data:""};},listSaves:async()=>[],listRecoveryCopies:async()=>[],getSyncStatus:async()=>({pendingCount:0,failedCount:0,lastError:null,oldestQueuedAt:null})})}));
vi.mock("@/lib/weeklySimulationWorkerClient",()=>({terminateWeeklySimulationWorker:vi.fn(),warmWeeklySimulationWorker:vi.fn(),getWeeklySimulationGeneration:()=>0}));
vi.mock("@/stores/actions/persistGameplayAutosave",()=>({resetGameplayAutosaveWatermark:()=>false,queueGameplayAutosave:vi.fn(),queueWeeklyAutosave:vi.fn(),flushGameplayAutosave:vi.fn(),snapshotPersistedGameState:(s:unknown)=>s}));
import {useGameStore} from "@/stores/gameStore";
it("hands legitimate background mirror ownership to the exact successfully restored career",async()=>{
 const raw=JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json",import.meta.url),"utf8")).state;
 useGameStore.getState().loadGame(raw);mocks.snapshot={...useGameStore.getState().gameState,currentWeek:9};
 await useGameStore.getState().restoreSaveRecoveryCopy("restored");
 expect(mocks.guard?.()).toBe(true);
 useGameStore.getState().loadGame({...raw,currentWeek:12});
 expect(mocks.guard?.()).toBe(false);
});
