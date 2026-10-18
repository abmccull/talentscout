import {afterEach,expect,it,vi} from "vitest";
import type {GameState} from "@/engine/core/types";
import {assertCareerCanResume,persistCareerEnd} from "@/lib/careerDisposition";
afterEach(()=>vi.unstubAllGlobals());
it("legacy careers with identical deterministic identities are separated by creation time",()=>{
 const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});
 const ended={difficulty:"ironman",runManifest:{runId:"same-world"},scout:{id:"same-scout"},createdAt:100,careerEnd:{reason:"ironman-fired",season:1,week:38}} as GameState;
 persistCareerEnd(ended);
 expect(()=>assertCareerCanResume({...ended,careerEnd:undefined})).toThrow(/ended/i);
 expect(()=>assertCareerCanResume({...ended,careerEnd:undefined,createdAt:200})).not.toThrow();
});
