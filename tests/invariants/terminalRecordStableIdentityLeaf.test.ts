// Preceding product contracts. Existing public imports; independent hand-written wire fixtures.
import { describe, expect, it } from "vitest";
import { compactLoanDeal, expandLoanDeal, compactClubFinancialObligation, expandClubFinancialObligation,
  InvalidTerminalRecordArchiveError, type StoredLoanDeal, type StoredClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

const PLAYER = "player___constructor_雪_long_exact_identity";
const LOAN_ID = `opening-loan:25:1:club:${PLAYER}`;
const DEBT_ID = `obligation_addon_${PLAYER}_appearanceBonus_25_0_0`;
const LOAN_FIELDS = ["buyOptionFee", "outcome", "agreedPlayingTime", "startCurrentAbility", "monitoringWeeks", "scoutId", "performanceRecord"] as const;
const DEBT_FIELDS = [["creditorClubId",2],["amount",3],["percentage",4],["weeklyAmount",5],["remainingWeeks",6],["trigger",10],
  ["triggeredWeek",11],["triggeredSeason",12],["lastProcessedWeek",13],["lastProcessedSeason",14],["appearanceThreshold",15],
  ["goalThreshold",16],["assistThreshold",17],["appearancesRecorded",18],["goalsRecorded",19],["assistsRecorded",20],
  ["lastTriggerEvaluationWeek",21],["lastTriggerEvaluationSeason",22]] as const;
const json = <T>(value:T):T => JSON.parse(JSON.stringify(value)) as T;
const bytes = (value:unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const asLoan = (value:unknown) => value as StoredLoanDeal;
const asDebt = (value:unknown) => value as StoredClubFinancialObligation;
function legacyLoan(version:1|2 = 1):unknown[] {
  const payload = { outcome:"successful", agreedPlayingTime:"regular", startCurrentAbility:0,
    monitoringWeeks:["25:1","25:1","25:2"], scoutId:"", performanceRecord:[0,1,2,3.125,-4,5,6] };
  return version === 1
    ? [1,LOAN_ID,PLAYER,"parent","host",0,25,12,25,0,-10,false,"completed",payload]
    : [2,LOAN_ID,PLAYER,"parent","host",0,25,12,25,0,-10,false,"completed",1,payload];
}
function codedLoan(version:1|2 = 1):unknown[] {
  const payload = { outcome:0, agreedPlayingTime:1, startCurrentAbility:0,
    monitoringWeeks:["25:1","25:1","25:2"], scoutId:"", performanceRecord:[0,1,2,3.125,-4,5,6] };
  return version === 1
    ? [41,["opening-loan:25:1:club:",""],PLAYER,"parent","host",0,25,12,25,0,-10,false,0,payload]
    : [42,["opening-loan:25:1:club:",""],PLAYER,"parent","host",0,25,12,25,0,-10,false,0,1,payload];
}
function legacyDebt(version:1|2 = 1) {
  return version === 1 ? { id:DEBT_ID, obligationArchiveV1:[899,"appearanceBonus",PLAYER,0,25,"settled"] }
    : { id:DEBT_ID, obligationArchiveV2:[1947,16,"appearanceBonus",PLAYER,null,0,25,"settled",null] };
}
function codedDebt(version:1|2 = 1) {
  return version === 1 ? { id:["obligation_addon_","_appearanceBonus_25_0_0"], obligationArchiveV31:[899,1,PLAYER,0,25,0] }
    : { id:["obligation_addon_","_appearanceBonus_25_0_0"], obligationArchiveV32:[1947,16,1,PLAYER,null,0,25,0,null] };
}
function ownUndefined(value:object,key:string) {
  expect(Object.getOwnPropertyDescriptor(value,key)).toStrictEqual({value:undefined,enumerable:true,writable:true,configurable:true});
}

describe("stable identity financial leaf formats, before product implementation",() => {
  it.each([1,2] as const)("reads exact hand-authored loan version %i, including aliases and all nested facts",version => {
    const wire = codedLoan(version), before = JSON.stringify(wire);
    const actual = expandLoanDeal(asLoan(json(wire))), expected = expandLoanDeal(asLoan(legacyLoan(version)));
    expect(actual).toStrictEqual(expected); expect(actual.id).toBe(LOAN_ID);
    expect(actual.monitoringWeeks).toEqual(["25:1","25:1","25:2"]);
    expect(actual.performanceRecord).toMatchObject({avgRating:3.125,developmentDelta:-4});
    if(version===2) ownUndefined(actual,"buyOptionFee");
    expect(JSON.stringify(wire)).toBe(before);
  });
  it.each([1,2] as const)("reads exact hand-authored obligation version %i, including optional null/undefined",version => {
    const actual = expandClubFinancialObligation(asDebt(json(codedDebt(version))));
    expect(actual).toStrictEqual(expandClubFinancialObligation(asDebt(legacyDebt(version)))); expect(actual.id).toBe(DEBT_ID);
    if(version===2) { ownUndefined(actual,"percentage"); expect(actual.amount).toBeNull(); expect(actual.trigger).toBeNull(); }
  });
  it.each(LOAN_FIELDS.map((field,index)=>({field,bit:2**index})))("restores only loan own undefined $field/$bit",({field,bit}) => {
    const wire=[42,["opening-loan:25:1:club:",""],PLAYER,"parent","host",0,25,12,25,0,0,false,0,bit,{}];
    const actual=expandLoanDeal(asLoan(json(wire))); ownUndefined(actual,field);
    for(const absent of LOAN_FIELDS.filter(key=>key!==field)) expect(Object.hasOwn(actual,absent)).toBe(false);
  });
  it.each(DEBT_FIELDS.map(([field,index])=>({field,bit:2**index})))("restores only obligation own undefined $field/$bit",({field,bit}) => {
    const wire={id:["obligation_addon_","_appearanceBonus_25_0_0"],obligationArchiveV32:[899+bit,bit,1,PLAYER,0,25,0]};
    const actual=expandClubFinancialObligation(asDebt(json(wire))); ownUndefined(actual,field);
    for(const [absent] of DEBT_FIELDS.filter(([key])=>key!==field)) expect(Object.hasOwn(actual,absent)).toBe(false);
  });
  it("upgrades old leaves once only when complete UTF8 is smaller, then preserves canonical identity",() => {
    for(const version of [1,2] as const) {
      const oldLoan=asLoan(legacyLoan(version)), oldDebt=asDebt(legacyDebt(version));
      const loan=compactLoanDeal(oldLoan), debt=compactClubFinancialObligation(oldDebt);
      expect(loan).toEqual(codedLoan(version)); expect(debt).toEqual(codedDebt(version));
      expect(bytes(loan)).toBeLessThan(bytes(oldLoan)); expect(bytes(debt)).toBeLessThan(bytes(oldDebt));
      expect(compactLoanDeal(loan)).toBe(loan); expect(compactClubFinancialObligation(debt)).toBe(debt);
      expect(expandLoanDeal(loan)).toStrictEqual(expandLoanDeal(oldLoan));
      expect(expandClubFinancialObligation(debt)).toStrictEqual(expandClubFinancialObligation(oldDebt));
    }
  });
  it("compacts complete ordinary facts without changing active identity",() => {
    const loan=expandLoanDeal(asLoan(legacyLoan(2))), debt=expandClubFinancialObligation(asDebt(legacyDebt(2)));
    const before=Object.getOwnPropertyDescriptors(loan); const stored=compactLoanDeal(loan);
    expect(expandLoanDeal(json(stored))).toStrictEqual(loan); expect(Object.getOwnPropertyDescriptors(loan)).toEqual(before);
    expect(expandClubFinancialObligation(json(compactClubFinancialObligation(debt)))).toStrictEqual(debt);
    const activeLoan={...loan,status:"active" as const}, activeDebt={...debt,status:"active" as const};
    expect(compactLoanDeal(activeLoan)).toBe(activeLoan); expect(compactClubFinancialObligation(activeDebt)).toBe(activeDebt);
  });
  it("keeps empty/unmatched IDs literal and preserves multiple exact player substrings",() => {
    for(const id of ["","random-id","__proto__:constructor:雪",`${PLAYER}::${PLAYER}`]) {
      const old=legacyLoan();old[1]=id; const stored=compactLoanDeal(asLoan(old));
      expect(expandLoanDeal(stored).id).toBe(id);
      if(!id.includes(PLAYER)) expect((stored as unknown as unknown[])[1]).toBe(id);
    }
    const emptyPlayer=legacyLoan();emptyPlayer[1]="ordinary-id";emptyPlayer[2]="";
    expect(expandLoanDeal(compactLoanDeal(asLoan(emptyPlayer))).id).toBe("ordinary-id");
  });
  it("preserves valid null-prototype legacy archives by reference and all nil overloads",() => {
    const loan=legacyLoan();loan[13]=Object.assign(Object.create(null),loan[13]);
    const debt=Object.assign(Object.create(null),legacyDebt());
    expect(compactLoanDeal(asLoan(loan))).toBe(loan); expect(compactClubFinancialObligation(asDebt(debt))).toBe(debt);
    expect(expandLoanDeal(null)).toBeNull(); expect(compactLoanDeal(undefined)).toBeUndefined();
    expect(expandClubFinancialObligation(undefined)).toBeUndefined(); expect(compactClubFinancialObligation(null)).toBeNull();
  });
  it("keeps ordinary authored extensions and descriptor/prototype/custom inputs as exact fallback",() => {
    const loan={...expandLoanDeal(asLoan(legacyLoan())),customAudit:{externalId:"authored"}};
    const debt={...expandClubFinancialObligation(asDebt(legacyDebt())),obligationArchiveV31:["authored"],customAudit:"full"};
    expect(compactLoanDeal(asLoan(loan))).toBe(loan); expect(compactClubFinancialObligation(asDebt(debt))).toBe(debt);
    expect(expandClubFinancialObligation(asDebt(debt))).toBe(debt);
  });
  it("binds every closed enum value to its exact versioned ordinal",() => {
    for(const [index,text] of ["completed","recalled","terminated"].entries()) {
      const row=codedLoan();row[12]=index;expect(expandLoanDeal(asLoan(row)).status).toBe(text);
    }
    for(const [index,text] of ["successful","neutral","unsuccessful","buy-option-exercised","recalled-early","terminated"].entries()) {
      const row=codedLoan();(row[13] as Record<string,unknown>).outcome=index;expect(expandLoanDeal(asLoan(row)).outcome).toBe(text);
    }
    for(const [index,text] of ["key","regular","rotation","prospect"].entries()) {
      const row=codedLoan();(row[13] as Record<string,unknown>).agreedPlayingTime=index;expect(expandLoanDeal(asLoan(row)).agreedPlayingTime).toBe(text);
    }
    for(const [index,text] of ["loanWageContribution","appearanceBonus","performanceBonus","relegationClause","sellOnClause"].entries()) {
      const row=codedDebt();row.obligationArchiveV31![1]=index;expect(expandClubFinancialObligation(asDebt(row)).type).toBe(text);
    }
    for(const [index,text] of ["settled","expired"].entries()) {
      const row=codedDebt();row.obligationArchiveV31![5]=index;expect(expandClubFinancialObligation(asDebt(row)).status).toBe(text);
    }
  });
  it("retains valid negative-zero legacy facts instead of selecting a lossy new serialization",() => {
    const loan=legacyLoan();loan[9]=-0;const debt=legacyDebt(2);debt.obligationArchiveV2![4]=-0;
    expect(compactLoanDeal(asLoan(loan))).toBe(loan);expect(compactClubFinancialObligation(asDebt(debt))).toBe(debt);
    expect(Object.is(expandLoanDeal(asLoan(loan)).loanFee,-0)).toBe(true);
    expect(Object.is(expandClubFinancialObligation(asDebt(debt)).amount,-0)).toBe(true);
  });
  it.each([-1,-0,3,0.5,"0",null,undefined])("rejects invalid loan status code %s",code => {
    const wire=codedLoan();wire[12]=code;
    expect(()=>expandLoanDeal(asLoan(wire))).toThrow(InvalidTerminalRecordArchiveError);
    expect(()=>compactLoanDeal(asLoan(wire))).toThrow(InvalidTerminalRecordArchiveError);
  });
  it.each([[],["prefix"],["prefix","suffix","extra"],["prefix",0]].map(parts=>({parts})))("rejects malformed ID pair $parts",({parts}) => {
    const wire=codedLoan();wire[1]=parts;
    expect(()=>expandLoanDeal(asLoan(wire))).toThrow(InvalidTerminalRecordArchiveError);
    expect(()=>expandClubFinancialObligation(asDebt({...codedDebt(),id:parts}))).toThrow(InvalidTerminalRecordArchiveError);
  });
  it("refuses unsupported/conflicting versions, undefined conflicts and extra payload",() => {
    const future=codedLoan();future[0]=43;const conflict=codedLoan(2);conflict[14]={buyOptionFee:0};
    for(const row of [future,conflict,[...codedLoan(),99]]) expect(()=>expandLoanDeal(asLoan(row))).toThrow(InvalidTerminalRecordArchiveError);
    const bads=[{id:"x",obligationArchiveV33:[899,1,PLAYER,0,25,0]},
      {...codedDebt(),obligationArchiveV32:[899,0,1,PLAYER,0,25,0]},
      {id:"x",obligationArchiveV32:[899,1,1,PLAYER,0,25,0]},
      {id:"x",obligationArchiveV31:[899,1,PLAYER,0,25,0,99]}];
    for(const row of bads) expect(()=>expandClubFinancialObligation(asDebt(row))).toThrow(InvalidTerminalRecordArchiveError);
  });
  it("checks dense descriptors before reading any encoded getter",() => {
    let calls=0;const wire=codedLoan();Object.defineProperty(wire,"0",{get(){calls++;return 41;},enumerable:true,configurable:true});
    expect(()=>expandLoanDeal(asLoan(wire))).toThrow(InvalidTerminalRecordArchiveError);expect(calls).toBe(0);
    const locked=codedLoan();Object.defineProperty(locked,"length",{writable:false});
    expect(()=>expandLoanDeal(asLoan(locked))).toThrow(InvalidTerminalRecordArchiveError);
    const sparse=codedLoan();delete sparse[4];expect(()=>compactLoanDeal(asLoan(sparse))).toThrow(InvalidTerminalRecordArchiveError);
  });
});
