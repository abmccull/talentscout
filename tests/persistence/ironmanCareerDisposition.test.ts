import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { assertCareerCanResume, persistCareerEnd } from "@/lib/careerDisposition";

function state(runId="ended-run"): GameState { return {difficulty:"ironman",runManifest:{runId},scout:{id:"scout"},currentSeason:2,currentWeek:1,careerEnd:{reason:"ironman-fired",season:1,week:38}} as GameState; }
let values: Map<string,string>;
beforeEach(() => { values = new Map(); vi.stubGlobal("localStorage", {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}); });
afterEach(() => vi.unstubAllGlobals());
describe("durable Ironman career disposition", () => {
  it("blocks older manual/recovery imports after recording dismissal and preserves their snapshots", () => {
    const ended = state(); const older = {...ended,careerEnd:undefined,currentSeason:1,currentWeek:30}; const copy = structuredClone(older);
    persistCareerEnd(ended);
    expect(() => assertCareerCanResume(older)).toThrow(/ended|dismissal/i);
    expect(older).toEqual(copy);
    expect(() => assertCareerCanResume({...older,runManifest:{...older.runManifest,runId:"different-run"}})).not.toThrow();
  });
  it("refuses a portable ended snapshot even on a fresh installation", () => {expect(() => assertCareerCanResume(state())).toThrow(/ended|dismissal/i);});
  it("does not claim durability when storage rejects the write", () => {
    vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{throw new Error("quota exceeded");}});
    expect(() => persistCareerEnd(state())).toThrow(/record|storage|quota/i);
  });
  it("fails closed when the disposition record is corrupt", () => {
    persistCareerEnd(state()); for (const key of values.keys()) values.set(key,"{broken");
    expect(() => assertCareerCanResume({...state(),careerEnd:undefined})).toThrow(/record|storage|read/i);
  });
});
