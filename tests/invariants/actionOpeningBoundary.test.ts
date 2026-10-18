import { describe, expect, it } from "vitest";
import type { Scout, UnsignedYouth } from "@/engine/core/types";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { createSession } from "@/engine/observation/session";
import { resolveSessionCueReadings } from "@/engine/scout/evidenceModel";
import { createOpeningCase } from "@/engine/youth/openingCase";
const scout={id:"scout",fatigue:0,skills:{technicalEye:20,physicalAssessment:20,psychologicalRead:20,tacticalUnderstanding:20,playerJudgment:20,potentialAssessment:20,dataLiteracy:20},attributes:{intuition:20,endurance:20,adaptability:20,networking:20,persuasion:20,memory:20}} as Scout;
function session(quality:number):ObservationSession{
 const base=createSession({activityType:"schoolMatch",specialization:"youth",playerPool:[{playerId:"p",name:"Ari",position:"CM"}],seed:"action-scenario",week:2,season:1},createRNG("action-scenario"));
 const moment={id:"m",actionId:"chase",playerId:"p",momentType:"physicalTest",attributesHinted:["pace"],quality,pressureContext:false,isStandout:quality>=8,description:"A chase for the loose ball.",vagueDescription:"A chase was hard to follow."} as PlayerMoment;
 return {...base,state:"reflection",venueAtmosphere:undefined,phases:[{...base.phases[0],index:0,minute:12,moments:[moment]}],players:[{...base.players[0],isFocused:true,focusedPhases:[0],focusHistory:[{phaseIndex:0,lens:"physical"}],currentLens:"physical"}]};
}
describe("action and opening boundary before reconciliation",()=>{
 it("does not turn one sprint into repeatability or a pre-receive decision",()=>{
 const cue=resolveSessionCueReadings({session:session(9),scout,questionId:"repeatability",regionalKnowledgeLevel:100})[0];
 expect(cue.suggestedClassifications).not.toContain("physicalRepeatability");
 expect(cue.suggestedClassifications).not.toContain("preReceiveDecision");
 expect(cue.suggestedClassifications).toContain("noConclusion");
 });
 it("allows an error to be as visible as successful execution",()=>{
 const resolve=(quality:number)=>resolveSessionCueReadings({session:session(quality),scout,questionId:"repeatability",regionalKnowledgeLevel:100})[0];
 expect(resolve(3).score).toBe(resolve(9).score);
 });
 it("keeps a public tip unchanged when hidden potential is reordered",()=>{
 const pool=Object.fromEntries(Array.from({length:30},(_,i)=>[`y${i}`,{id:`y${i}`,country:"england",regionId:"r",buzzLevel:20,visibility:10,placed:false,retired:false,player:{id:`p${i}`,age:16,potentialAbility:i+50}}])) as unknown as Record<string,UnsignedYouth>;
 const changed=Object.fromEntries(Object.entries(pool).map(([id,y])=>[id,{...y,player:{...y.player,potentialAbility:200-y.player.potentialAbility}}]));
 const create=(unsignedYouth:Record<string,UnsignedYouth>)=>createOpeningCase({seed:"same-public-tip",scout,unsignedYouth,contacts:{},youthRecruitmentBriefs:{},week:1,season:1});
 expect(create(changed)?.playerId).toBe(create(pool)?.playerId);
 });
});
