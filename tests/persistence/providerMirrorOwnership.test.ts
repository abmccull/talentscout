import "fake-indexeddb/auto";
import {readFileSync} from "node:fs";
import Dexie from "dexie";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {db,migrateSaveState,saveGame,listSaveArchives} from "@/lib/db";
const steam=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock("@/lib/steam/steamInterface",()=>({getSteam:()=>({isAvailable:()=>true,getCloudSave:steam.get,setCloudSave:steam.put}),isSteamRuntimeConfigured:()=>true}));
import {createSaveProvider} from "@/lib/saveProvider";
const raw=JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json",import.meta.url),"utf8")).state;
beforeAll(async()=>{await Dexie.delete("TalentScoutDB");});afterAll(()=>db.close());
it("cancellation during actual remote preflight cannot upload the old selected revision",async()=>{
 await saveGame(1,"First",migrateSaveState({...raw,currentWeek:2}));await saveGame(1,"Second",migrateSaveState({...raw,currentWeek:3}));
 const archive=(await listSaveArchives(1))[0];let resolve!:(value:null)=>void;
 steam.get.mockReturnValue(new Promise<null>(done=>{resolve=done;}));let owned=true;
 const log=vi.spyOn(console,"warn").mockImplementation(()=>undefined);
 try{
  await createSaveProvider({includeSteam:true}).restoreRecoveryCopy(archive.id,{canCommit:()=>owned});
  await vi.waitFor(()=>expect(steam.get).toHaveBeenCalled());
  owned=false;await saveGame(1,"Newer career",migrateSaveState({...raw,currentWeek:12}));resolve(null);
  await vi.waitFor(async()=>{const tasks=await db.saveSyncQueue.toArray();expect(steam.put.mock.calls.length>0||tasks.some(t=>t.attempts>0)).toBe(true);});
  expect(steam.put).not.toHaveBeenCalled();expect((await db.saves.get(1))?.state.currentWeek).toBe(12);
 }finally{log.mockRestore();}
});
