// Existing disposable fake IndexedDB/public APIs. No provider connector or test-side codec.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Club, GameState } from "@/engine/core/types";
import { deleteSave, loadGameWithRecovery, migrateSaveRecord, migrateSaveState, saveGameWithResult, type SaveRecord } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError, createSaveEnvelope, migrateSaveEnvelope } from "@/lib/saveEnvelope";
import { expandLoanDeal, expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
const SLOT=5, PLAYER="player___constructor_雪_long_exact_identity", LOAN_ID=`opening-loan:25:1:club:${PLAYER}`;
function club(id:string):Club {return {id,name:id,shortName:id,leagueId:"saved-league",reputation:55,budget:50000,
  scoutingPhilosophy:"academyFirst",managerId:"saved-manager",playerIds:[],academyPlayerIds:[],youthAcademyRating:13,
  loanedInPlayerIds:[],loanedOutPlayerIds:[],financialObligations:[]};}
function loan():unknown[] {return [42,["opening-loan:25:1:club:",""],PLAYER,"parent","host",0,25,12,25,0,0,false,0,127,{}];}
function debt() {return {id:["obligation_addon_","_appearanceBonus_25_0_0"],obligationArchiveV32:[8388607,8387708,1,PLAYER,0,25,0]};}
function career():GameState {
  const fixture=JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json",import.meta.url),"utf8")) as {state:unknown};
  const state=migrateSaveState(fixture.state);state.currentSeason=25;state.currentWeek=14;state.clubs={parent:club("parent"),host:club("host")};
  state.loanHistory=[loan(),loan()] as unknown as GameState["loanHistory"];
  state.clubs.host.financialObligations=[debt(),debt()] as unknown as Club["financialObligations"];return state;
}
function logical(state:GameState) {return {loans:state.loanHistory?.map(row=>expandLoanDeal(row)),
  obligations:state.clubs.host.financialObligations?.map(row=>expandClubFinancialObligation(row)),finances:state.finances};}
async function head():Promise<SaveRecord> {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open("TalentScoutDB");request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
  try {expect(db.version).toBe(50);return await new Promise<SaveRecord>((resolve,reject)=>{const request=db.transaction("saves","readonly").objectStore("saves").get(SLOT);request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result as SaveRecord);});}
  finally {db.close();}
}
beforeEach(async()=>{await deleteSave(SLOT);});afterAll(async()=>{await deleteSave(SLOT);});
describe.sequential("stable terminal financial identities through actual persistence",()=>{
  it("keeps arrays, duplicate/order/full optional ownership and ordinary audit through head/JSON/recovery",async()=>{
    const source=career(),before=JSON.stringify(source),canonical=migrateSaveState(source),expected=logical(canonical);
    expect(expected.loans?.[0].id).toBe(LOAN_ID);expect(Object.hasOwn(expected.loans![0],"buyOptionFee")).toBe(true);
    const commit=await saveGameWithResult(SLOT,"Stable leaf identities",source);expect(commit.wrote).toBe(true);
    const stored=await head();expect(stored.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(Array.isArray(stored.state.loanHistory)).toBe(true);expect(Array.isArray(stored.state.clubs.host.financialObligations)).toBe(true);
    expect(logical(stored.state)).toStrictEqual(expected);expect(stored.state.loanHistory).toHaveLength(2);
    expect(stored.state.loanHistory?.[0]).toEqual(stored.state.loanHistory?.[1]);expect(stored.state.clubs.host.financialObligations).toHaveLength(2);
    const portable=migrateSaveRecord(JSON.parse(JSON.stringify(stored)));expect(logical(portable.state)).toStrictEqual(expected);
    const recovered=await loadGameWithRecovery(SLOT);expect(recovered).toBeTruthy();
    expect(logical(recovered!.state)).toStrictEqual(expected);expect(JSON.stringify(source)).toBe(before);
    expect(commit.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(stored)).byteLength);
  });
  it.each([6,7,8])("migrates schema%i additively with unchanged rules/metadata and coded facts",schemaVersion=>{
    const source=career(),envelope={...createSaveEnvelope(source,42000),schemaVersion,rulesVersion:"pinned-rules",buildVersion:"pinned-build",customEnvelopeMetadata:{externalId:"original-reference"}};
    const before=JSON.stringify(envelope),actual=migrateSaveEnvelope(envelope);expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(10);
    expect(actual.schemaVersion).toBe(10);expect(actual.rulesVersion).toBe("pinned-rules");expect(actual.buildVersion).toBe("pinned-build");
    expect(actual.savedAt).toBe(42000);expect(actual.customEnvelopeMetadata).toEqual(envelope.customEnvelopeMetadata);
    expect(logical(actual.state as GameState)).toStrictEqual(logical(source));expect(JSON.stringify(envelope)).toBe(before);
  });
  it("refuses malformed encoded descriptors before clone without invoking their getters",()=>{
    const source=career();let calls=0;const bad=loan();Object.defineProperty(bad,"0",{get(){calls++;return 42;},enumerable:true,configurable:true});
    source.loanHistory=[bad] as unknown as GameState["loanHistory"];
    expect(()=>migrateSaveState(source)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({code:"CORRUPT_SAVE"}));expect(calls).toBe(0);
    const locked=career(),row=debt();Object.defineProperty(row.obligationArchiveV32,"length",{writable:false});
    locked.clubs.host.financialObligations=[row] as unknown as Club["financialObligations"];
    expect(()=>migrateSaveState(locked)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({code:"CORRUPT_SAVE"}));
  });
  it("does not overwrite a good head with a malformed/future financial leaf",async()=>{
    await saveGameWithResult(SLOT,"Previous valid stable leaf",career());const before=JSON.stringify(await head()),source=career();
    source.clubs.host.financialObligations=[{id:"x",obligationArchiveV33:[899,1,PLAYER,0,25,0]}] as unknown as Club["financialObligations"];
    await expect(saveGameWithResult(SLOT,"Rejected future financial leaf",source)).rejects.toMatchObject({code:"CORRUPT_SAVE"});expect(JSON.stringify(await head())).toBe(before);
  });
});
