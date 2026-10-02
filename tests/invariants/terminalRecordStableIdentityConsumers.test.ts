// Existing constructors, settlement/feedback APIs and RNG; no test-side codec.
import { describe, expect, it } from "vitest";
import type { Club, GameState, LoanDeal, LoanRecommendation, Player, PlayerMovementEvent, StoredLoanDeal } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { buildLoanWageContributionObligation, normalizeClubEconomics, settleWeeklyClubObligations } from "@/engine/finance/clubEconomics";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { projectAppliedLoanClosures } from "@/engine/core/weekly/loanClosureFeedback";
import { buildPlayerMovementPresentation } from "@/engine/transfers/presentation";

const PLAYER="player___constructor_雪_long_exact_identity", LOAN_ID=`opening-loan:2:1:host:${PLAYER}`;
function club(id:string):Club {
  return {id,name:id,shortName:id,leagueId:"league",reputation:55,budget:5000,scoutingPhilosophy:"academyFirst",
    managerId:"manager",playerIds:[],academyPlayerIds:[],youthAcademyRating:13,loanedInPlayerIds:[],loanedOutPlayerIds:[],financialObligations:[]};
}
function domainLoan():LoanDeal {
  return {id:LOAN_ID,playerId:PLAYER,parentClubId:"parent",loanClubId:"host",startWeek:1,startSeason:2,endWeek:12,endSeason:2,
    loanFee:50000,wageContribution:40,recallClause:true,status:"completed",buyOptionFee:100000,outcome:"successful",
    agreedPlayingTime:"regular",startCurrentAbility:80,monitoringWeeks:["2:4","2:4"],scoutId:"scout",
    performanceRecord:{appearances:26,goals:5,assists:7,avgRating:7.125,developmentDelta:7,parentClubSatisfaction:86,loanClubSatisfaction:82}};
}
function codedLoan():StoredLoanDeal {
  return [41,["opening-loan:2:1:host:",""],PLAYER,"parent","host",1,2,12,2,50000,40,true,0,
    {buyOptionFee:100000,outcome:0,agreedPlayingTime:1,startCurrentAbility:80,monitoringWeeks:["2:4","2:4"],scoutId:"scout",
      performanceRecord:[26,5,7,7.125,7,86,82]}] as unknown as StoredLoanDeal;
}
function input(deal:StoredLoanDeal,previous:StoredLoanDeal[]=[],alreadyApplied=false) {
  const movement:PlayerMovementEvent={id:"returned-player",type:"loanReturn",playerId:PLAYER,loanDealId:LOAN_ID,
    week:12,season:2,fromClubId:"host",toClubId:"parent"};
  return {scout:{id:"scout",primarySpecialization:"youth"} as GameState["scout"],previousLoanHistory:previous,
    loanHistory:[deal,deal],movements:[movement,movement],recommendations:[{id:"rec1",playerId:PLAYER,targetClubId:"host",
      scoutId:"scout",week:1,season:2,rationale:"development",suggestedDuration:12,suggestedWageContribution:40,
      status:"accepted",reputationApplied:alreadyApplied,loanDealId:LOAN_ID}] as LoanRecommendation[],
    players:{[PLAYER]:{id:PLAYER,firstName:"Ari",lastName:"Scout",currentAbility:87} as Player},
    clubs:{parent:club("parent"),host:club("host")},week:12,season:2};
}
describe("stable financial leaf consumer contracts",() => {
  it("closes a genuine ordinary loan-wage constructor with identical cash, periods and exact ID",() => {
    const active=buildLoanWageContributionObligation({playerId:PLAYER,creditorClubId:"parent",weeklyAmount:200,remainingWeeks:3,currentWeek:1,currentSeason:1});
    expect(active.status).toBe("active");expect(active.amount).toBe(600);
    let clubs:Record<string,Club>={parent:club("parent"),host:{...club("host"),financialObligations:[active]}};
    for(const week of [2,3,4]) {
      const result=settleWeeklyClubObligations(clubs,week,1);expect(result.processedObligationIds).toEqual([active.id]);
      const replay=settleWeeklyClubObligations(result.clubs,week,1);expect(replay.processedObligationIds).toEqual([]);expect(replay.clubs).toEqual(result.clubs);
      clubs=result.clubs;
    }
    expect(clubs.host.budget).toBe(4400);expect(clubs.parent.budget).toBe(5600);
    const stored=clubs.host.financialObligations![0];expect(Object.keys(stored).some(k=>k==="obligationArchiveV31"||k==="obligationArchiveV32")).toBe(true);
    const terminal=expandClubFinancialObligation(stored);expect(terminal).toMatchObject({id:active.id,playerId:PLAYER,
      amount:0,remainingWeeks:0,status:"settled",lastProcessedWeek:4,lastProcessedSeason:1});
    const normalized=normalizeClubEconomics(clubs.host,{}, {currentWeek:5,currentSeason:1});expect(normalized.financialObligations?.[0]).toBe(stored);
    const again=settleWeeklyClubObligations(clubs,5,1);expect(again.processedObligationIds).toEqual([]);expect(again.clubs.host.budget).toBe(4400);
  });
  it("preserves literal movement/closure joins, complete rewards, duplicate suppression and next RNG",() => {
    const oldRng=createRNG("stable-leaf-feedback"),codedRng=createRNG("stable-leaf-feedback");
    const expected=projectAppliedLoanClosures(input(domainLoan()),oldRng), source=input(codedLoan()),before=JSON.stringify(source);
    const actual=projectAppliedLoanClosures(source,codedRng);expect(actual).toEqual(expected);expect(expected.reputationDelta).toBeGreaterThan(0);
    expect(expected.xpAward).toBeGreaterThan(0);expect(codedRng.next()).toBe(oldRng.next());expect(JSON.stringify(source)).toBe(before);
    const movement=source.movements[0];expect(buildPlayerMovementPresentation({movement,loanDeal:codedLoan()})).toEqual(buildPlayerMovementPresentation({movement,loanDeal:domainLoan()}));
  });
  it("uses exact previous coded IDs and already rewarded references without repeat rewards/RNG",() => {
    for(const alreadyApplied of [false,true]) {
      const oldRng=createRNG("stable-leaf-repeat"),codedRng=createRNG("stable-leaf-repeat");
      const expected=projectAppliedLoanClosures(input(domainLoan(),alreadyApplied?[]:[domainLoan()],alreadyApplied),oldRng);
      const actual=projectAppliedLoanClosures(input(codedLoan(),alreadyApplied?[]:[codedLoan()],alreadyApplied),codedRng);
      expect(actual).toEqual(expected);expect(actual.reputationDelta).toBe(0);expect(actual.xpAward).toBe(0);expect(codedRng.next()).toBe(oldRng.next());
    }
  });
});
