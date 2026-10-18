import { describe, expect, it } from "vitest";
import type { Player, Scout, ScoutCueReading } from "@/engine/core/types";
import type { PlayerMoment } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { observePlayerLight, type LightObservationEvidenceOptions } from "@/engine/scout/perception";
import { generateAbilityReading } from "@/engine/scout/starRating";
const scout = { id: "scout", primarySpecialization: "youth", fatigue: 0,
 skills: { technicalEye: 15, physicalAssessment: 15, psychologicalRead: 15,
 tacticalUnderstanding: 15, playerJudgment: 15, potentialAssessment: 15, dataLiteracy: 15 } } as Scout;
const subject = () => generatePlayer(createRNG("earned-player"), {
 position: "CM", ageRange: [16,16], abilityRange: [55,55], nationality: "English", clubId: "" });
function options(player: Player, clarity: ScoutCueReading["clarity"] = "strong"): LightObservationEvidenceOptions {
 const moment = { id:"moment", playerId:player.id,quality:3,momentType:"technicalAction",
 attributesHinted:["passing"],description:"A misplaced passing action.",vagueDescription:"An obscured action.",pressureContext:false,isStandout:false } as PlayerMoment;
 const cue = { id:"cue",sessionId:"session",momentId:moment.id,playerId:player.id,phaseIndex:0,
 confidence:0.7,clarity,attributesHinted:["passing"],direction:"negative" } as ScoutCueReading;
 return { sourceSessionId:"session",observedCues:[{cue,moment}],evidenceAttributes:["passing"],evidenceOnly:true };
}
describe("public scouting knowledge boundary before reconciliation",()=>{
 it("keeps the exact watched cue independent of unobserved player truth",()=>{
  const player=subject();const altered={...player,currentAbility:190,potentialAbility:200,
   attributes:Object.fromEntries(Object.keys(player.attributes).map(key=>[key,20])) as Player["attributes"]};
  const first=observePlayerLight(createRNG("fixed"),player,scout,"schoolMatch",[],undefined,options(player));
  const second=observePlayerLight(createRNG("fixed"),altered,scout,"schoolMatch",[],undefined,options(player));
  expect(second).toEqual(first);
 });
 it("retains an inconclusive glimpse without inventing numerical readings",()=>{
  const player=subject();const observed=observePlayerLight(createRNG("glimpse"),player,scout,"schoolMatch",[],undefined,options(player,"glimpse"));
  expect(observed.attributeReadings).toEqual([]);expect(observed.abilityReading).toBeUndefined();
 });
 it("keeps an evidence forecast independent of hidden potential",()=>{
  const player=subject();const history=Array.from({length:6},(_,i)=>({id:`o${i}`,sourceSessionId:`s${i}`,playerId:player.id,
   scoutId:scout.id,week:i+1,season:1,context:"schoolMatch" as const,attributeReadings:[{attribute:"passing" as const,perceivedValue:10,confidence:.7,observationCount:i+1}],notes:[],flaggedMoments:[]}));
  const lowPotential: Player = {...player,potentialAbility:70};
  const highPotential: Player = {...player,potentialAbility:200};
  const low=generateAbilityReading(createRNG("forecast"),lowPotential,scout,history,"schoolMatch");
  const high=generateAbilityReading(createRNG("forecast"),highPotential,scout,history,"schoolMatch");
  expect(high).toEqual(low);
 });
});
