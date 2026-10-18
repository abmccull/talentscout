import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import Dexie from "dexie";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, migrateSaveRecord, migrateSaveState, saveGame, listSaveArchives } from "@/lib/db";
import { createSaveEnvelope } from "@/lib/saveEnvelope";
import { subscribePlayerExperience } from "@/lib/playerExperience";

const steam = vi.hoisted(()=>({ get:vi.fn(), put:vi.fn(), available:false }));
vi.mock("@/lib/steam/steamInterface",()=>({getSteam:()=>({isAvailable:()=>steam.available,getCloudSave:steam.get,setCloudSave:steam.put}),isSteamRuntimeConfigured:()=>steam.available}));
import { createSaveProvider } from "@/lib/saveProvider";
const raw=JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json",import.meta.url),"utf8")).state;
function state(week:number){return migrateSaveState({...raw,currentWeek:week});}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
function remote(week:number,stamp:number){const s=state(week);return migrateSaveRecord({...createSaveEnvelope(s,stamp),slot:1,name:"Remote",season:s.currentSeason,week,scoutName:"Remote Scout",specialization:"youth",reputation:20});}

describe.sequential("real provider replacement ownership",()=>{
 beforeAll(async()=>{await Dexie.delete("TalentScoutDB");});
 beforeEach(async()=>{steam.available=false;steam.get.mockReset();steam.put.mockReset();await db.saves.clear();await db.saveArchives.clear();await db.saveSyncQueue.clear();});
 afterEach(()=>vi.restoreAllMocks());
 afterAll(()=>db.close());
 it("conflict inspection never publishes local tutorial experience",async()=>{
  const row=await saveGame(1,"Local",state(2));await db.saves.put({...row,playerExperience:{version:2,tutorial:{completed:true,dismissed:true},recentVeteranPrologueTemplateIds:[],updatedAt:100}});
  const listener=vi.fn();const stop=subscribePlayerExperience(listener);
  try{await createSaveProvider({includeSteam:false}).checkConflict("slot_1");expect(listener).not.toHaveBeenCalled();}finally{stop();}
 });
 it("a cancelled cross-backend load cannot publish profile experience",async()=>{
  const row=await saveGame(1,"Local",state(2));await db.saves.put({...row,playerExperience:{version:2,tutorial:{completed:true,dismissed:true},recentVeteranPrologueTemplateIds:[],updatedAt:100}});
  const read=deferred<string|null>();steam.available=true;steam.get.mockReturnValue(read.promise);
  const listener=vi.fn();const stop=subscribePlayerExperience(listener);let owned=true;
  try{const pending=createSaveProvider({includeSteam:true}).load("slot_1",{canCommit:()=>owned}).catch(e=>e);
   await vi.waitFor(()=>expect(steam.get).toHaveBeenCalled());owned=false;read.resolve(null);await pending;expect(listener).not.toHaveBeenCalled();
  }finally{stop();}
 });
 it("cancelled recovery transaction preserves head and archive and queues no mirror",async()=>{
  await saveGame(1,"First",state(2));await saveGame(1,"Second",state(3));const archive=(await listSaveArchives(1))[0];const before=await db.saves.get(1);const copies=await db.saveArchives.toArray();
  const read=deferred<void>();const original=db.saveArchives.get.bind(db.saveArchives);let reading=false;
  vi.spyOn(db.saveArchives,"get").mockImplementationOnce((async(key: string)=>{const row=await original(key);reading=true;await Dexie.waitFor(read.promise);return row;}) as typeof db.saveArchives.get);
  let owned=true;steam.available=true;steam.get.mockResolvedValue(null);
  const pending=createSaveProvider({includeSteam:true}).restoreRecoveryCopy(archive.id,{canCommit:()=>owned}).catch(e=>e);
  await vi.waitFor(()=>expect(reading).toBe(true));owned=false;read.resolve();await pending;
  expect(await db.saves.get(1)).toEqual(before);expect(await db.saveArchives.toArray()).toEqual(copies);expect(await db.saveSyncQueue.count()).toBe(0);expect(steam.put).not.toHaveBeenCalled();
 });
 it("cancelled conflict resolution preserves local head and remote branch",async()=>{
  const before=await saveGame(1,"Local",state(2));const cloud=JSON.stringify(remote(9,before.savedAt+10000));const read=deferred<string>();steam.available=true;
  steam.get.mockResolvedValueOnce(cloud).mockReturnValueOnce(read.promise);let owned=true;
  const pending=createSaveProvider({includeSteam:true}).resolveConflict("slot_1","steam",{canCommit:()=>owned}).catch(e=>e);
  await vi.waitFor(()=>expect(steam.get).toHaveBeenCalledTimes(2));owned=false;read.resolve(cloud);await pending;
  expect(await db.saves.get(1)).toEqual(before);expect(await db.saveArchives.count()).toBe(0);expect(await db.saveSyncQueue.count()).toBe(0);expect(steam.put).not.toHaveBeenCalled();
 });
});
