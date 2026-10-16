// Candidate-only installed-consumer regression. Original catalogs predate policy code.
// Expected installed payload and archive bytes are verified before consumer loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';

const SELF=fileURLToPath(import.meta.url);
const source=path.resolve(path.dirname(SELF),'../..');
const fixtureDirectory=path.join(path.dirname(SELF),'fixtures/http-cache-policy');
const generated=path.join(source,'artifacts/release/generated');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
const same = (a, b) => canonical(path.resolve(a)) === canonical(path.resolve(b));
const inside = (root, file) => { const r = path.relative(root, file); return r !== '' && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
function need(value, message) { if (!value) throw new Error(message); }
function abs(value) { need(typeof value === 'string' && path.isAbsolute(value) && !/[\r\n\0]/.test(value), 'Absolute path required'); return path.resolve(value); }
function physical(value) {
  const full = abs(value), st = fs.lstatSync(full);
  need(st.isDirectory() && !st.isSymbolicLink() && same(fs.realpathSync.native(full), full), 'Physical directory required');
  return full;
}
const identity = st => Object.fromEntries(['dev','ino','mode','nlink','size','mtimeNs','ctimeNs','birthtimeNs'].map(key => { need(typeof st[key] === 'bigint', 'Missing identity field'); return [key, st[key].toString()]; }));
const equalIdentity = (a, b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b));
// Node22 Windows path stat may expose dev=0 while fd stat exposes the volume serial.
// Full identities still must stay stable within each observation family.
function pathDescriptorEqual(pathStat, descriptorStat) {
  if (equalIdentity(pathStat, descriptorStat)) return true;
  if (process.platform !== 'win32' || pathStat.dev !== 0n || descriptorStat.dev === 0n) return false;
  const pathname = identity(pathStat), descriptor = identity(descriptorStat);
  pathname.dev = descriptor.dev;
  return JSON.stringify(pathname) === JSON.stringify(descriptor);
}
function readOrdinary(value, owner, limit = 16777216) {
  const full = abs(value);
  if (owner) need(inside(physical(owner), full), 'Read outside admitted owner');
  const before = fs.lstatSync(full, { bigint: true });
  need(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(limit) && same(fs.realpathSync.native(full), full), 'Ordinary single-link bounded file required');
  const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let answer;
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    need(pathDescriptorEqual(before, opened), 'File changed before open');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); need(n > 0, 'Premature EOF'); offset += n; }
    need(fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) === 0, 'File grew during read');
    const ended = fs.fstatSync(fd, { bigint: true }), final = fs.lstatSync(full, { bigint: true });
    need(equalIdentity(opened, ended) && equalIdentity(before, final) && pathDescriptorEqual(final, ended) && final.isFile() && !final.isSymbolicLink() && same(fs.realpathSync.native(full), full), 'File/path changed around read');
    answer = { path: full, bytes, sha256: sha(bytes), identity: identity(ended) };
  } finally { fs.closeSync(fd); }
  return answer;
}
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function writeNew(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); }

function blob(value) { need(Buffer.isBuffer(value),'Actual buffer body required'); return {bytes:value.length,base64:value.toString('base64'),sha256:hash(value)}; }
function responseView(response) {
  if (!response) return null;
  return {statusCode:response.statusCode,headers:response.headers,body:blob(response.body),isFromCache:response.isFromCache,retryCount:response.retryCount,redirectUrls:response.redirectUrls,url:response.url};
}
function errorView(error) {
  const chain=[],seen=new Set(); let current=error;
  while(current && chain.length<5 && !seen.has(current)) { seen.add(current); chain.push({name:String(current.name??''),code:typeof current.code==='string'?current.code:null,message:String(current.message??current),stack:typeof current.stack==='string'?current.stack:null,statusCode:current.response?.statusCode??null}); current=current.cause; }
  return chain;
}

const hash=sha;
const ENCODING=Object.freeze({
  namespace:'cacheable-request',keyPrefix:'cacheable-request:',valueProperty:'value',
  expiryProperty:'expires',missingExpiryMeansNoExpiry:true,nullExpiryMeansNoExpiry:true,
  keyvEntrySha256:'4987708b4b13159c654c09d239bd0c439533b0b792a6fd4e8769d8a509ad4da6',
  jsonBufferEntrySha256:'d7596e0f7c808f2800aa6fa9dfa723c5547ab964aba7dcd9014cebf292f667d1'
});
const CATALOGS={
  http8:{schema:'http-cache-integration-cases-v1',count:8,sha256:'290d085d2c18ebb9eed7c647c544b2e7379fcd88a05298524945171683b4cc29',ids:['HC01','HC02','HC03','HC04','HC05','HC06','HC07','HC08']},
  sie6:{schema:'http-cache-sie-integration-cases-v1',count:6,sha256:'14d013f7c1c68890b988241cbfaecb055d8920b84bfa5229bff17c22e82cb100',ids:['SIE01','SIE02','SIE03','SIE04','SIE05','SIE06']},
  vary2:{schema:'http-cache-vary-sie-integration-cases-v1',count:2,sha256:'3081193675c6f7d845021fdf6d6aeec1ea8afa3edd358d62e22cc68a2e86a033',ids:['VS01','VS02']}
};
function filePin(file,owner) {
  const r=readOrdinary(file,owner);
  return {path:r.path,bytes:r.bytes.length,sha256:r.sha256};
}
function pinned(binding,owner) {
  need(binding && typeof binding.path==='string' && /^[a-f0-9]{64}$/.test(binding.sha256??''),'Exact file binding required');
  const r=readOrdinary(binding.path,owner);
  need(r.sha256===binding.sha256,'Pinned input changed');
  return r;
}
function catalog() {
  const groups={};
  for(const [group,expected] of Object.entries(CATALOGS)) {
    const file=path.join(fixtureDirectory,group+'.json'),r=readOrdinary(file,fixtureDirectory),value=decode(r.bytes);
    need(r.sha256===expected.sha256 && value.schema===expected.schema && value.status==='frozen-before-policy-fix','Frozen original catalog changed: '+group);
    need(value.entryWriteWaitMs===2000 && value.childWholeDeadlineMs===10000,'Frozen observation/deadline changed');
    assert.deepEqual(value.cases.map(item=>item.id),expected.ids,'Frozen case IDs/count/order changed');
    need(value.cases.length===expected.count && value.cases.every(item=>typeof item.expect.candidate==='string'),'Missing frozen candidate oracle');
    assert.deepEqual(value.diagnosticOptions,{retry:{limit:0},followRedirect:false,maxRedirects:0,responseType:'buffer',throwHttpErrors:true,cacheOptionsStrictTtlOrMaxTtlOverride:false},'Frozen request controls changed');
    groups[group]={value,pin:{path:file,bytes:r.bytes.length,sha256:r.sha256}};
  }
  const preservationFile=path.join(fixtureDirectory,'preservation-oracles.json'),preservationRead=readOrdinary(preservationFile,fixtureDirectory),preservation=decode(preservationRead.bytes);
  need(preservationRead.sha256==='8d419d07418bdb7f596751fc61d0957a656099889ecee2e2b4f194adf3c67862' && preservation.schema==='http-cache-policy-precode-preservation-oracles-v1','Frozen direct API preservation oracles changed');
  assert.deepEqual(preservation.cases.map(item=>item.id),['FRESH-SHARED-SMAXAGE-EVALUATE','FRESH-SHARED-SMAXAGE-SIE']);
  const file=path.join(fixtureDirectory,'installed-identity.json'),r=readOrdinary(file,fixtureDirectory),identity=decode(r.bytes);
  need(identity.schema==='installed-http-cache-policy-identity-v1' && identity.status==='frozen'
    && Array.isArray(identity.pending) && identity.pending.length===0,'Policy identity remains DRAFT/unready; reviewed final package/archive bindings required');
  return {groups,identity,identityPin:{path:file,bytes:r.bytes.length,sha256:r.sha256},
    preservation:{value:preservation,pin:{path:preservationFile,bytes:preservationRead.bytes.length,sha256:preservationRead.sha256}}};
}
function installed(identityData) {
  const modules=physical(path.join(source,'node_modules')),req=createRequire(path.join(source,'package.json'));
  const expected={got:['got','11.8.6'],cacheableRequest:['cacheable-request','7.0.4'],
    policy:['@talentscout/http-cache-policy','4.3.0-ts.1'],keyv:['keyv','4.5.4'],jsonBuffer:['json-buffer','3.0.1']};
  const checked={},entries={},roots={};
  for(const [key,[name,version]] of Object.entries(expected)) {
    const expectedPin=key==='policy'?identityData.policy:identityData.consumers?.[key];
    need(expectedPin?.name===name && expectedPin.version===version,'Frozen installed package identity differs: '+key);
    const specifier=key==='policy'?'http-cache-semantics':key==='cacheableRequest'?'cacheable-request':key==='jsonBuffer'?'json-buffer':key;
    need(expectedPin.specifier===specifier,'Consumer specifier differs');
    const entry=req.resolve(specifier);need(inside(modules,entry),'Installed consumer escaped Source node_modules');
    let directory=path.dirname(entry),manifestPath;
    for(;;) {
      need(inside(modules,directory),'No owning installed package manifest');
      const candidate=path.join(directory,'package.json');
      if(fs.existsSync(candidate)) {manifestPath=candidate;break;}
      directory=path.dirname(directory);
    }
    roots[key]=physical(directory);
    const manifestRead=readOrdinary(manifestPath,modules),manifest={path:manifestRead.path,bytes:manifestRead.bytes.length,sha256:manifestRead.sha256};
    const entryPin=filePin(entry,modules),pkg=decode(manifestRead.bytes);
    need(pkg.name===name && pkg.version===version && inside(directory,entry),'Installed manifest/entry owner differs: '+key);
    if(key==='policy') need(pkg.private===true && expectedPin.private===true,'Private policy identity required');
    else need(manifest.sha256===expectedPin.manifestSha256 && entryPin.sha256===expectedPin.entrySha256,'Inspected installed consumer bytes changed: '+key);
    entries[key]=entry;
    checked[key]={name:pkg.name,version:pkg.version,manifest,entry:entryPin};
  }
  const policy=identityData.policy;
  need(Array.isArray(policy.files) && policy.files.length===4,'Complete reviewed policy file set required');
  const expectedNames=['LICENSE','README.md','index.js','package.json'];
  assert.deepEqual(policy.files.map(row=>row.path).sort(),expectedNames,'Reviewed policy membership changed');
  assert.deepEqual(fs.readdirSync(roots.policy).sort(),expectedNames,'Installed policy package membership changed');
  const files=policy.files.map(expected=>{
    const actual=filePin(path.join(roots.policy,expected.path),roots.policy);
    need(Number.isSafeInteger(expected.bytes) && expected.bytes>0 && actual.bytes===expected.bytes && actual.sha256===expected.sha256,'Installed reviewed policy bytes differ: '+expected.path);
    return {relativePath:expected.path,...actual};
  });
  need(files.find(row=>row.relativePath==='index.js').sha256===checked.policy.entry.sha256
    && files.find(row=>row.relativePath==='package.json').sha256===checked.policy.manifest.sha256,'Policy entry/manifest bindings disagree');
  const archiveBinding=policy.archive;
  need(archiveBinding && typeof archiveBinding.path==='string' && archiveBinding.path.startsWith('vendor/')
    && archiveBinding.path.endsWith('.tgz') && !archiveBinding.path.includes('\\') && !archiveBinding.path.split('/').some(part=>!part||part==='.'||part==='..'),'Final Source vendor archive binding pending/invalid');
  const archive=filePin(path.join(source,archiveBinding.path),source);
  need(Number.isSafeInteger(archiveBinding.bytes) && archive.bytes===archiveBinding.bytes
    && archive.sha256===archiveBinding.sha256,'Vendored reviewed policy archive differs');
  const resolutions=[];
  for(const [consumer,dependency,target] of [
    ['got','cacheable-request','cacheableRequest'],['cacheableRequest','http-cache-semantics','policy'],
    ['cacheableRequest','keyv','keyv'],['keyv','json-buffer','jsonBuffer']
  ]) {
    const actual=createRequire(entries[consumer]).resolve(dependency);
    need(same(actual,entries[target]),'Actual installed consumer edge differs: '+consumer+' -> '+dependency);
    resolutions.push({consumer,dependency,actual,expected:entries[target]});
  }
  need(checked.keyv.entry.sha256===ENCODING.keyvEntrySha256
    && checked.jsonBuffer.entry.sha256===ENCODING.jsonBufferEntrySha256,'Actual Keyv/decoder source differs from encoding contract');
  return {checked,entries,files,archive,resolutions};
}
function fingerprint(value) {return hash(Buffer.from(JSON.stringify(value)));}

function sameDirectives(actual,expected) {
  return actual && JSON.stringify(Object.entries(actual).sort(([a],[b])=>a.localeCompare(b)))===JSON.stringify(Object.entries(expected).sort(([a],[b])=>a.localeCompare(b)));
}
function cacheSnapshot(cache,parse,url,encoding) {
  need(cache.constructor===Map && cache.size<=1,'Expected one unmodified plain Map entry at most');
  const rows=[];
  for(const [key,raw] of cache.entries()) {
    need(typeof key==='string' && key.length<4096 && typeof raw==='string' && Buffer.byteLength(raw)<=1048576,'Unexpected or oversized actual Map representation');
    const decoded=parse(raw);
    need(decoded && typeof decoded==='object' && Object.hasOwn(decoded,encoding.valueProperty) && Object.hasOwn(decoded,encoding.expiryProperty) && decoded[encoding.expiryProperty]===null && decoded[encoding.valueProperty] && typeof decoded[encoding.valueProperty]==='object','Actual no-TTL Keyv own value/expires:null wrapper not observed');
    const value=decoded[encoding.valueProperty],expiresPresent=Object.hasOwn(decoded,encoding.expiryProperty),expires=decoded[encoding.expiryProperty];
    const indefinite=(!expiresPresent && encoding.missingExpiryMeansNoExpiry===true)||(expiresPresent && expires===null && encoding.nullExpiryMeansNoExpiry===true);
    rows.push({key,expectedKey:encoding.keyPrefix+'GET:'+url,keyMatches:key===encoding.keyPrefix+'GET:'+url,raw,rawSha256:hash(Buffer.from(raw)),expiresPresent,expires:expires??null,indefinite,statusCode:value.statusCode,body:blob(value.body),cachePolicy:value.cachePolicy,storedUrl:value.url??null});
  }
  return {observedAtUtc:new Date().toISOString(),observedWallMs:Date.now(),observedAtMs:performance.now(),size:cache.size,rows,rawMapReadOnly:true};
}
function entryMatches(snapshot,spec,url,body,revision,firstCall,group) {
  const row=snapshot.rows[0],p=row?.cachePolicy;
  if(snapshot.size!==1 || !row?.keyMatches || row.indefinite!==true || row.statusCode!==200 || row.body.base64!==Buffer.from(body).toString('base64') || p?.v!==1 || p.sh!==spec.shared || p.m!=='GET' || !sameDirectives(p.rescc,spec.directives) || p.resh?.['cache-control']!==spec.first.headers['cache-control']) return false;
  if(group!=='http8' && p.resh?.etag!==spec.first.headers.etag) return false;
  if(group==='vary2' && (p.resh?.vary!==spec.first.headers.vary || p.reqh?.['accept-language']!==spec.firstRequest['accept-language'])) return false;
  if(p.h!==undefined && p.h!==new URL(url).host) return false;
  if(p.u!==undefined && p.u!==url) return false;
  if(!Number.isFinite(p.t) || p.t>snapshot.observedWallMs) return false;
  if(firstCall && (p.t<firstCall.startedWallMs || p.t>firstCall.settledWallMs || p.resh.age!==spec.first.headers.age)) return false;
  if(revision!==null && p.resh['x-fixture-revision']!==revision) return false;
  return true;
}
async function waitForEntry(result,name,cache,parse,url,encoding,predicate,windowMs,retainThroughout=false) {
  const record={startedAtMs:performance.now(),windowMs,sampledThroughoutWindow:retainThroughout,observations:0,matched:false,lastSnapshot:null};
  record.deadlineAtMs=record.startedAtMs+windowMs;
  result.cacheObservations[name]=record;
  for(;;) {
    if(retainThroughout && performance.now()>=record.deadlineAtMs) { need(record.observations>1,'Retained entry sampling incomplete');record.matched=true;record.finishedAtMs=performance.now();return record.lastSnapshot; }
    record.lastSnapshot=cacheSnapshot(cache,parse,url,encoding); record.observations++;
    if(!retainThroughout && performance.now()-record.startedAtMs>=windowMs) { record.finishedAtMs=performance.now(); throw new Error('Actual cache observation exceeded frozen write window: '+name); }
    const matches=predicate(record.lastSnapshot);
    if(retainThroughout) {if(!matches) {record.finishedAtMs=performance.now();throw new Error('Retained cache entry/policy changed during frozen observation window: '+name);}}
    else if(matches) { record.matched=true; record.finishedAtMs=performance.now(); return record.lastSnapshot; }
    if(retainThroughout) { await new Promise(resolve=>setTimeout(resolve,Math.min(10,Math.max(1,record.deadlineAtMs-performance.now()))));continue; }
    if(performance.now()-record.startedAtMs>=windowMs) { record.finishedAtMs=performance.now(); throw new Error('Actual cache disposition was not established within frozen write window: '+name); }
    await new Promise(resolve=>setTimeout(resolve,10));
  }
}

function validOriginRequest(incoming,ordinal,spec,url,group) {
  if(group==='vary2') {
    const expectedRequest=ordinal===1?spec.firstRequest:spec.secondRequest;
    const validators=ordinal===1?{}:spec.secondValidators;
    return incoming.method==='GET' && incoming.url==='/'+spec.id && incoming.headers.host===new URL(url).host && ordinal<=2 && incoming.headers['accept-language']===expectedRequest['accept-language'] && incoming.headers['cache-control']===undefined && incoming.headers['if-none-match']===(validators['if-none-match']??undefined) && incoming.headers['if-modified-since']===(validators['if-modified-since']??undefined);
  }
  return incoming.method==='GET' && incoming.url==='/'+spec.id && incoming.headers.host===new URL(url).host && ordinal<=2 && (ordinal===1?incoming.headers['cache-control']===undefined:incoming.headers['cache-control']===spec.secondRequest['cache-control']) && (ordinal!==2 || !spec.first.headers.etag || incoming.headers['if-none-match']===spec.first.headers.etag);
}
function disposition(snapshot,spec,url,group,before,mode) {
  if(mode==='http-error-503') return snapshot.size===0;
  const body=mode==='validated-B'?'B':'A';
  const revision=group==='http8' && spec.id==='HC08'?(mode==='validated-304-A'?'2':'1'):null;
  return entryMatches(snapshot,spec,url,body,revision,null,group)
    && (group==='http8' || isDeepStrictEqual(snapshot.rows[0].cachePolicy,before.rows[0].cachePolicy));
}
async function childMain() {
  const [, , , requestPath,requestSha]=process.argv;
  const owner=physical(path.dirname(abs(requestPath)));
  const request=decode(pinned({path:requestPath,sha256:requestSha},owner).bytes);
  need(same(request.owner,owner) && request.label==='candidate','Child owner/role differs');
  const all=catalog(),selected=all.groups[request.group];
  need(selected && selected.pin.sha256===request.catalogSha && all.identityPin.sha256===request.identitySha,'Child frozen inputs changed');
  need(pinned(request.self,path.dirname(SELF)).sha256===filePin(SELF,path.dirname(SELF)).sha256 && same(request.self.path,SELF),'Child script changed');
  const spec=selected.value.cases.find(item=>item.id===request.caseId),group=request.group,fixture=selected.value,encoding=ENCODING;
  need(spec && path.basename(owner)===spec.id && process.execArgv.length===0,'Child case/flags differ');
  const result={caseId:spec.id,label:request.label,stage:'setup',origin:[],socketHistory:[],cacheObservations:{},calls:[],fixtureErrors:[]};
  let server=null,agent=null,listened=false,closing=false,cache=null,parse=null,url=null;
  const sockets=new Map();
  function trackSocket(socket,role) {
    if(sockets.has(socket)) return;
    const row={id:'socket-'+result.socketHistory.length,role,openedAtMs:performance.now(),closedAtMs:null,cleanupRequestedAtMs:null};
    result.socketHistory.push(row); sockets.set(socket,row);
    socket.once('close',hadError=>{row.closedAtMs=performance.now();row.hadError=hadError;sockets.delete(socket);});
    if(closing) { row.cleanupRequestedAtMs=performance.now(); socket.destroy(); }
  }
  try {
    const admitted=installed(all.identity);
    result.installationFingerprint=fingerprint(admitted);
    need(result.installationFingerprint===request.installationFingerprint,'Installed bytes/resolutions changed before child load');
    result.bindings=admitted.checked;
    need(encoding.keyvEntrySha256===admitted.checked.keyv.entry.sha256 && encoding.jsonBufferEntrySha256===admitted.checked.jsonBuffer.entry.sha256,'Actual Map/decoder entries differ from the source-backed encoding contract');
    result.mapEncoding=encoding;
    result.stage='load-consumer';
    const req=createRequire(admitted.checked.got.entry.path),got=req(admitted.checked.got.entry.path);
    const jsonBuffer=req(admitted.checked.jsonBuffer.entry.path);
    need(typeof got==='function' && typeof jsonBuffer.parse==='function','Actual consumer/decoder API missing');
    cache=new Map();parse=jsonBuffer.parse;
    result.realMap={constructor:'Map',initialSize:cache.size,methodsReplacedByHarness:false,entriesSeededByHarness:false};
    agent=new http.Agent({keepAlive:false});
    server=http.createServer((incoming,response)=>{
      const ordinal=result.origin.length+1;
      const event={ordinal,receivedAtMs:performance.now(),receivedAtUtc:new Date().toISOString(),method:incoming.method,path:incoming.url,headers:incoming.headers,rawHeaders:incoming.rawHeaders,response:null,responseCompleted:false};
      result.origin.push(event);
      const valid=validOriginRequest(incoming,ordinal,spec,url,group);
      if(!valid) result.fixtureErrors.push({stage:'origin-request',ordinal,message:'Unexpected method/path/host/order/cache-control/conditional validator'});
      const planned=valid?(ordinal===1?spec.first:spec.secondOrigin):{status:500,body:'unexpected-fixture-request',headers:{'cache-control':'no-store'}};
      const body=Buffer.from(planned.body),headers={...planned.headers,date:new Date().toUTCString()};
      if(planned.status!==304) headers['content-length']=String(body.length);
      event.response={statusCode:planned.status,headers,body:blob(body),sentAtMs:performance.now()};
      response.writeHead(planned.status,headers);
      response.end(body,()=>{event.responseCompleted=true;event.responseCompletedAtMs=performance.now();});
    });
    server.on('connection',socket=>trackSocket(socket,'origin'));
    server.on('error',error=>result.fixtureErrors.push({stage:'server',error:errorView(error)}));
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{server.off('error',reject);resolve();});});
    listened=true; result.originAddress=server.address();
    need(result.originAddress.address==='127.0.0.1','Origin is not exact owned IPv4 loopback');
    url='http://127.0.0.1:'+result.originAddress.port+'/'+spec.id;
    result.url=url;
    const options={cache,cacheOptions:{shared:spec.shared},retry:{limit:0},followRedirect:false,maxRedirects:0,responseType:'buffer',throwHttpErrors:true,agent:{http:agent}};
    result.fixtureOptions={cache:'actual fresh plain Map',cacheOptions:options.cacheOptions,retry:options.retry,followRedirect:false,maxRedirects:0,responseType:'buffer',throwHttpErrors:true,ownedAgentKeepAlive:false,strictTtlOverrideSupplied:false,maxTtlOverrideSupplied:false,fakeClock:false};
    async function invoke(phase,headers) {
      const call={phase,startedAtMs:performance.now(),startedWallMs:Date.now(),requestHeaders:headers};
      result.calls.push(call);
      let value,rejected;
      try {
        const pending=got(url,{...options,headers});
        pending.on('request',native=>{if(native.socket) trackSocket(native.socket,'client'); else native.once('socket',socket=>trackSocket(socket,'client'));});
        value=await pending;
      } catch(error) { rejected=error; }
      call.settledAtMs=performance.now();call.settledWallMs=Date.now();call.elapsedMs=call.settledAtMs-call.startedAtMs;
      if(rejected) { call.outcome='error';call.error=errorView(rejected);call.response=responseView(rejected.response); }
      else {call.outcome='value';call.response=responseView(value);}
      return call;
    }
    result.stage='prime-consumer';
    const first=await invoke('prime',group==='vary2'?spec.firstRequest:{});
    need(first.outcome==='value' && first.response.statusCode===200 && first.response.body.base64===Buffer.from('A').toString('base64') && first.response.isFromCache===false,'Initial real origin200 did not return A');
    const before=await waitForEntry(result,'beforeSecond',cache,jsonBuffer.parse,url,encoding,snapshot=>entryMatches(snapshot,spec,url,'A',group==='http8' && spec.id==='HC08'?'1':null,first,group),fixture.entryWriteWaitMs);
    result.beforeSecond=before;
    result.stage='second-consumer';
    const second=await invoke('second',spec.secondRequest);
    const mode=spec.expect[request.label];
    result.stage='post-consumer-observation';
    need((group==='http8'?['hit-A','validated-B','validated-304-A','http-error-503']:['stale-if-error-A','http-error-503']).includes(mode),'Unknown frozen candidate outcome');
    result.afterSecond=await waitForEntry(result,'afterSecond',cache,parse,url,encoding,snapshot=>disposition(snapshot,spec,url,group,before,mode),fixture.entryWriteWaitMs,mode==='stale-if-error-A');
    result.stage='observed';
  } catch(error) { result.harnessError={stage:result.stage,error:errorView(error)}; }
  finally {
    closing=true;const cleanupStartedAtMs=performance.now(),socketClosures=[];
    for(const [socket,row] of sockets) socketClosures.push(new Promise(resolve=>{socket.once('close',resolve);row.cleanupRequestedAtMs=performance.now();socket.destroy();}));
    let serverClosed=!listened,serverCloseError=null,agentDestroyReturned=false;
    const serverClosure=listened?new Promise(resolve=>server.close(error=>{serverCloseError=error?errorView(error):null;serverClosed=!error;resolve();})):Promise.resolve();
    if(agent) { try {agent.destroy();agentDestroyReturned=true;} catch(error) {result.fixtureErrors.push({stage:'agent-destroy',error:errorView(error)});} }
    await Promise.all([...socketClosures,serverClosure]);
    result.closure={cleanupStartedAtMs,finishedAtMs:performance.now(),serverClosed,serverCloseError,agentDestroyReturned,socketsRemaining:sockets.size,allObservedSocketsClosed:result.socketHistory.every(row=>Number.isFinite(row.closedAtMs)),complete:serverClosed&&!serverCloseError&&sockets.size===0&&result.socketHistory.every(row=>Number.isFinite(row.closedAtMs))};
    if(result.stage==='observed') {
      try {
        result.terminalCacheSnapshot=cacheSnapshot(cache,parse,url,encoding);
        const mode=spec.expect[request.label],snapshot=result.terminalCacheSnapshot;
        need(disposition(snapshot,spec,url,group,result.beforeSecond,mode),'Terminal Map disposition changed after awaited cleanup');
        result.terminalCacheDispositionEstablished=true;
      } catch(error) { result.terminalCacheDispositionEstablished=false;result.fixtureErrors.push({stage:'terminal-cache-disposition',error:errorView(error)}); }
    }
    writeNew(path.join(owner,'child-result.json'),result);
    if(result.harnessError || result.stage!=='observed' || !result.closure.complete || result.fixtureErrors.length>0 || result.terminalCacheDispositionEstablished!==true) process.exitCode=2;
  }
}
function cleanEnvironment(owner) {
  const env={};
  for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT']) {const found=Object.entries(process.env).find(([name])=>name.toLowerCase()===key.toLowerCase());if(found)env[key]=found[1];}
  for(const name of ['tmp','home']) fs.mkdirSync(path.join(owner,name));
  return {...env,TEMP:path.join(owner,'tmp'),TMP:path.join(owner,'tmp'),TMPDIR:path.join(owner,'tmp'),HOME:path.join(owner,'home'),USERPROFILE:path.join(owner,'home')};
}

async function runOne(group,catalog,spec,all,installation,runOwner,selfPin) {
  const owner=path.join(runOwner,spec.id);fs.mkdirSync(owner);
  const requestPath=path.join(owner,'request.json');
  writeNew(requestPath,{caseId:spec.id,group,label:'candidate',owner,catalogSha:catalog.pin.sha256,
    identitySha:all.identityPin.sha256,installationFingerprint:fingerprint(installation),self:selfPin});
  const requestSha=filePin(requestPath,owner).sha256,env=cleanEnvironment(owner);
  const argv=[SELF,group==='preservation'?'--http-preservation-child':'--http-cache-child',requestPath,requestSha];
  const deadlineMs=group==='preservation'?10000:catalog.value.childWholeDeadlineMs;
  const result={caseId:spec.id,group,label:'candidate',owner,
    command:{executable:process.execPath,argv,cwd:owner,environment:env,deadlineMs},
    startedAtUtc:new Date().toISOString(),descriptorClosure:{complete:false,rows:[]}};
  let out=null,err=null;
  try {
    out=fs.openSync(path.join(owner,'stdout.bin'),'wx');err=fs.openSync(path.join(owner,'stderr.bin'),'wx');
    const childStartedAtMs=performance.now();
    const child=spawn(process.execPath,argv,{cwd:owner,env,shell:false,windowsHide:true,stdio:['ignore',out,err]});
    result.pid=child.pid??null;
    let watchdog=false,killRequested=false,killReturned=null,processError=null;
    child.once('error',error=>{processError=errorView(error);});
    const timer=setTimeout(()=>{watchdog=true;killRequested=true;try{killReturned=child.kill();}catch(error){processError=errorView(error);}},
      Math.max(0,deadlineMs-(performance.now()-childStartedAtMs)));
    result.process=await new Promise(resolve=>child.once('close',(code,signal)=>{
      clearTimeout(timer);resolve({code,signal,watchdog,killRequested,killReturned,processError,actualCloseObserved:true});
    }));
    result.actualChildClosedAtUtc=new Date().toISOString();
  } catch(error) {result.setupError=errorView(error);}
  finally {
    for(const [stream,fd] of [['stdout',out],['stderr',err]]) if(fd!==null) {
      const row={stream,fd,closeAttempted:true,closeReturned:false};result.descriptorClosure.rows.push(row);
      try{fs.closeSync(fd);row.closeReturned=true;}catch(error){row.error=errorView(error);}
    }
    result.descriptorClosure.complete=result.descriptorClosure.rows.every(row=>row.closeReturned);
  }
  if(result.process?.actualCloseObserved && result.descriptorClosure.complete) {
    result.outputs={};
    for(const name of ['request.json','stdout.bin','stderr.bin','child-result.json']) {
      try {
        const r=readOrdinary(path.join(owner,name),owner);
        result.outputs[name]={path:r.path,bytes:r.bytes.length,sha256:r.sha256,identity:r.identity};
        if(name==='child-result.json'){result.child=decode(r.bytes);result.outputs[name].parsedAndHashedSameBuffer=true;}
      } catch(error) {result.outputError=errorView(error);}
    }
  }
  writeNew(path.join(owner,'run-result.json'),result);
  return result;
}
function judgeHttp8(spec,run) {
  const failures=[],requireCase=(value,message)=>{if(!value)failures.push(message);};
  const child=run.child,mode=spec.expect[run.label],first=child?.calls?.[0],second=child?.calls?.[1],events=child?.origin??[];
  requireCase(run.process?.actualCloseObserved===true && !run.process.watchdog && !run.process.signal && !run.process.processError && run.process.code===0 && !run.setupError && !run.outputError && run.descriptorClosure.complete,'Actual normal child/descriptor closure or raw output evidence missing');
  requireCase(child?.caseId===spec.id && child.label===run.label && child.stage==='observed' && !child.harnessError && child.closure?.complete===true && child.fixtureErrors?.length===0,'Setup, observation, actual consumer or fixture closure incomplete');
  requireCase(child?.cacheObservations?.beforeSecond?.matched===true && child?.cacheObservations?.afterSecond?.matched===true && child?.beforeSecond?.size===1,'Actual retained entry/update/deletion proof missing; cache misses are not repaired policy');
  requireCase(child?.calls?.length===2 && first?.outcome==='value' && first.response?.statusCode===200 && first.response?.body?.base64===Buffer.from('A').toString('base64') && first.response.isFromCache===false,'Prime did not establish real A/200');
  const needsNetwork=mode!=='hit-A';
  requireCase(events.length===(needsNetwork?2:1) && events.every((event,index)=>event.ordinal===index+1 && event.method==='GET' && event.path==='/'+spec.id && event.responseCompleted),'Exact real origin request/response count/order/completion missing');
  requireCase(events[0]?.response?.statusCode===200 && events[0]?.response?.body?.base64===Buffer.from('A').toString('base64'),'Origin prime body/status differs');
  if(needsNetwork) requireCase(events[1]?.headers?.['if-none-match']==='"A"' && events[1]?.headers?.['cache-control']==='max-stale=300' && events[1]?.response?.statusCode===spec.secondOrigin.status && events[1]?.response?.body?.base64===Buffer.from(spec.secondOrigin.body).toString('base64'),'Required actual conditional second response not observed');
  if(mode==='http-error-503') requireCase(second?.outcome==='error' && second.error?.[0]?.name==='HTTPError' && second.error[0].code==='ERR_NON_2XX_3XX_RESPONSE' && second.error[0].statusCode===503 && second.response?.statusCode===503 && second.response?.isFromCache===false && second.response?.body?.base64===Buffer.from('origin-unavailable').toString('base64') && child?.afterSecond?.size===0,'Actual HTTPError503/deletion control not established; unrelated error cannot satisfy');
  else requireCase(second?.outcome==='value' && second.response?.statusCode===200 && second.response?.body?.base64===Buffer.from(mode==='validated-B'?'B':'A').toString('base64') && second.response?.isFromCache===(mode!=='validated-B'),'Second representation/status/actual cache flag differs');
  if(spec.id==='HC01') requireCase(second?.response?.headers?.['set-cookie']?.includes('fixture=A'),'Cookie premise control lost actual cached cookie');
  if(spec.id==='HC08') requireCase(second?.response?.headers?.['x-fixture-revision']===(mode==='validated-304-A'?'2':'1'),'304 merged revision or baseline bypass revision differs');
  requireCase([first,second].every(call=>call?.response?.retryCount===0 && call?.response?.redirectUrls?.length===0),'Diagnostic retry/redirect policy differs');
  return {caseId:spec.id,label:run.label,expectedMode:mode,passed:failures.length===0,failures,baselineViolationReproduced:run.label==='base'&&spec.requiredReproduction&&failures.length===0,policyCorrectnessCertified:false};
}

function judgeSie6(spec,run) {
  const failures=[],requireCase=(value,message)=>{if(!value)failures.push(message);};
  const child=run.child,mode=spec.expect[run.label],first=child?.calls?.[0],second=child?.calls?.[1],events=child?.origin??[];
  requireCase(run.process?.actualCloseObserved===true && !run.process.watchdog && !run.process.signal && !run.process.processError && run.process.code===0 && !run.setupError && !run.outputError && run.descriptorClosure.complete,'Actual normal child/descriptor closure or raw output evidence missing');
  requireCase(child?.caseId===spec.id && child.label===run.label && child.stage==='observed' && !child.harnessError && child.closure?.complete===true && child.fixtureErrors?.length===0,'Setup, observation, actual consumer or fixture closure incomplete');
  requireCase(child?.cacheObservations?.beforeSecond?.matched===true && child?.cacheObservations?.afterSecond?.matched===true && child?.beforeSecond?.size===1,'Actual retained entry/update/deletion proof missing; cache misses are not repaired policy');
  requireCase(child?.terminalCacheDispositionEstablished===true,'Actual terminal Map disposition after awaited cleanup missing');
  if(mode==='stale-if-error-A') requireCase(child?.cacheObservations?.afterSecond?.sampledThroughoutWindow===true && child.cacheObservations.afterSecond.observations>1 && child.cacheObservations.afterSecond.finishedAtMs>=child.cacheObservations.afterSecond.deadlineAtMs && isDeepStrictEqual(child?.terminalCacheSnapshot?.rows?.[0]?.cachePolicy,child?.beforeSecond?.rows?.[0]?.cachePolicy),'Full-window sampled and terminal retained policy preservation missing');
  requireCase(child?.calls?.length===2 && first?.outcome==='value' && first.response?.statusCode===200 && first.response?.body?.base64===Buffer.from('A').toString('base64') && first.response.isFromCache===false,'Prime did not establish real A/200');
  requireCase(events.length===2 && events.every((event,index)=>event.ordinal===index+1 && event.method==='GET' && event.path==='/'+spec.id && event.responseCompleted),'Exact two real origin requests/responses in order/completed are required');
  requireCase(events[0]?.response?.statusCode===200 && events[0]?.response?.body?.base64===Buffer.from('A').toString('base64') && events[0]?.headers?.['cache-control']===undefined && events[0]?.headers?.['if-none-match']===undefined,'Origin prime body/status/headers differ');
  requireCase(events[1]?.headers?.['if-none-match']==='"A"' && events[1]?.headers?.['cache-control']===undefined && events[1]?.response?.statusCode===503 && events[1]?.response?.body?.base64===Buffer.from('origin-unavailable').toString('base64') && events[1]?.response?.headers?.['cache-control']==='no-store','Actual conditional origin503/no-store missing; no request max-stale is allowed');
  if(mode==='http-error-503') requireCase(second?.outcome==='error' && second.error?.[0]?.name==='HTTPError' && second.error[0].code==='ERR_NON_2XX_3XX_RESPONSE' && second.error[0].statusCode===503 && second.response?.statusCode===503 && second.response?.isFromCache===false && second.response?.body?.base64===Buffer.from('origin-unavailable').toString('base64') && child?.afterSecond?.size===0,'Actual HTTPError503/deletion not established; unrelated error cannot satisfy');
  else requireCase(mode==='stale-if-error-A' && second?.outcome==='value' && second.response?.statusCode===200 && second.response?.body?.base64===Buffer.from('A').toString('base64') && second.response?.isFromCache===true && child?.afterSecond?.size===1,'Required stale-if-error A/200 after actual503 differs');
  requireCase([first,second].every(call=>call?.response?.retryCount===0 && call?.response?.redirectUrls?.length===0),'Diagnostic retry/redirect policy differs');
  return {caseId:spec.id,label:run.label,expectedMode:mode,passed:failures.length===0,failures,baselineViolationReproduced:run.label==='base'&&spec.requiredReproduction&&failures.length===0,policyCorrectnessCertified:false};
}

function judgeVary2(spec,run) {
  const failures=[],requireCase=(value,message)=>{if(!value)failures.push(message);};
  const child=run.child,mode=spec.expect[run.label],first=child?.calls?.[0],second=child?.calls?.[1],events=child?.origin??[];
  requireCase(run.process?.actualCloseObserved===true && !run.process.watchdog && !run.process.signal && !run.process.processError && run.process.code===0 && !run.setupError && !run.outputError && run.descriptorClosure.complete,'Actual normal child/descriptor closure or raw output evidence missing');
  requireCase(child?.caseId===spec.id && child.label===run.label && child.stage==='observed' && !child.harnessError && child.closure?.complete===true && child.fixtureErrors?.length===0,'Setup, observation, actual consumer or fixture closure incomplete');
  requireCase(child?.cacheObservations?.beforeSecond?.matched===true && child?.cacheObservations?.afterSecond?.matched===true && child?.beforeSecond?.size===1,'Actual retained entry/update/deletion proof missing; cache misses are not repaired policy');
  requireCase(child?.terminalCacheDispositionEstablished===true,'Actual terminal Map disposition after awaited cleanup missing');
  if(mode==='stale-if-error-A') requireCase(child?.cacheObservations?.afterSecond?.sampledThroughoutWindow===true && child.cacheObservations.afterSecond.observations>1 && child.cacheObservations.afterSecond.finishedAtMs>=child.cacheObservations.afterSecond.deadlineAtMs && isDeepStrictEqual(child?.terminalCacheSnapshot?.rows?.[0]?.cachePolicy,child?.beforeSecond?.rows?.[0]?.cachePolicy),'Full-window sampled and terminal retained policy preservation missing');
  requireCase(child?.calls?.length===2 && first?.outcome==='value' && first.response?.statusCode===200 && first.response?.body?.base64===Buffer.from('A').toString('base64') && first.response.isFromCache===false,'Prime did not establish real A/200');
  requireCase(events.length===2 && events.every((event,index)=>event.ordinal===index+1 && event.method==='GET' && event.path==='/'+spec.id && event.responseCompleted),'Exact two real origin requests/responses in order/completed are required');
  requireCase(events[0]?.response?.statusCode===200 && events[0]?.response?.body?.base64===Buffer.from('A').toString('base64') && events[0]?.headers?.['cache-control']===undefined && events[0]?.headers?.['if-none-match']===undefined && events[0]?.headers?.['if-modified-since']===undefined && events[0]?.headers?.['accept-language']===spec.firstRequest['accept-language'],'Origin prime variant/body/status/headers differ');
  requireCase(events[1]?.headers?.['if-none-match']===(spec.secondValidators['if-none-match']??undefined) && events[1]?.headers?.['if-modified-since']===(spec.secondValidators['if-modified-since']??undefined) && events[1]?.headers?.['accept-language']===spec.secondRequest['accept-language'] && events[1]?.headers?.['cache-control']===undefined && events[1]?.response?.statusCode===503 && events[1]?.response?.body?.base64===Buffer.from('origin-unavailable').toString('base64') && events[1]?.response?.headers?.['cache-control']==='no-store','Actual variant-specific origin503/no-store missing; no request max-stale is allowed');
  if(mode==='http-error-503') requireCase(second?.outcome==='error' && second.error?.[0]?.name==='HTTPError' && second.error[0].code==='ERR_NON_2XX_3XX_RESPONSE' && second.error[0].statusCode===503 && second.response?.statusCode===503 && second.response?.isFromCache===false && second.response?.body?.base64===Buffer.from('origin-unavailable').toString('base64') && child?.afterSecond?.size===0,'Actual HTTPError503/deletion not established; unrelated error cannot satisfy');
  else requireCase(mode==='stale-if-error-A' && second?.outcome==='value' && second.response?.statusCode===200 && second.response?.body?.base64===Buffer.from('A').toString('base64') && second.response?.isFromCache===true && child?.afterSecond?.size===1,'Required stale-if-error A/200 after actual503 differs');
  requireCase([first,second].every(call=>call?.response?.retryCount===0 && call?.response?.redirectUrls?.length===0),'Diagnostic retry/redirect policy differs');
  return {caseId:spec.id,label:run.label,expectedMode:mode,passed:failures.length===0,failures,baselineViolationReproduced:run.label==='base'&&spec.requiredReproduction&&failures.length===0,policyCorrectnessCertified:false};
}

async function preservationChildMain() {
  const [, , , requestPath,requestSha]=process.argv,owner=physical(path.dirname(abs(requestPath)));
  const request=decode(pinned({path:requestPath,sha256:requestSha},owner).bytes),all=catalog();
  need(same(request.owner,owner) && request.label==='candidate' && request.group==='preservation','Direct API owner/role differs');
  need(request.catalogSha===all.preservation.pin.sha256 && request.identitySha===all.identityPin.sha256
    && same(request.self.path,SELF) && pinned(request.self,path.dirname(SELF)).sha256===filePin(SELF,path.dirname(SELF)).sha256,'Direct API frozen inputs changed');
  const spec=all.preservation.value.cases.find(item=>item.id===request.caseId);
  need(spec && path.basename(owner)===spec.id && process.execArgv.length===0,'Direct API case/flags differ');
  const result={caseId:spec.id,label:'candidate',scope:'direct-public-API-preservation',pid:process.pid,stage:'setup'};
  try {
    const installation=installed(all.identity);result.installationFingerprint=fingerprint(installation);
    need(result.installationFingerprint===request.installationFingerprint,'Direct API installed inputs changed');
    result.bindings=installation.checked;result.stage='load-policy';
    const Policy=createRequire(installation.entries.policy)(installation.entries.policy);
    need(typeof Policy==='function','Actual installed policy constructor missing');
    result.inputs=structuredClone({originalRequest:spec.originalRequest,response:spec.response,options:spec.options,
      incomingRequest:spec.incomingRequest,...(spec.revalidationResponse?{revalidationResponse:spec.revalidationResponse}:{})});
    result.startedAtMs=performance.now();result.startedWallMs=Date.now();
    const policy=new Policy(structuredClone(spec.originalRequest),structuredClone(spec.response),structuredClone(spec.options));
    result.constructedAtMs=performance.now();result.stage='direct-api';
    if(spec.method==='evaluateRequest') {
      const returned=policy.evaluateRequest(structuredClone(spec.incomingRequest));
      result.actual={responsePresent:returned.response!==undefined,responseStatus:returned.response?.status??null,revalidationPresent:returned.revalidation!==undefined};
      result.response=returned.response??null;result.revalidation=returned.revalidation??null;
    } else {
      need(spec.method==='revalidatedPolicy','Unknown frozen direct method');
      const returned=policy.revalidatedPolicy(structuredClone(spec.incomingRequest),structuredClone(spec.revalidationResponse));
      result.actual={samePolicyIdentity:returned.policy===policy,modified:returned.modified,matches:returned.matches};
    }
    result.finishedAtMs=performance.now();result.finishedWallMs=Date.now();
    result.elapsedMs=result.finishedAtMs-result.startedAtMs;
    need(result.elapsedMs<=5000,'Direct API exceeded frozen five-second freshness observation');
    assert.deepEqual(result.actual,spec.expected,'Frozen direct public API literal outcome changed');
    result.stage='observed';
  } catch(error) {result.harnessError={stage:result.stage,error:errorView(error)};}
  writeNew(path.join(owner,'child-result.json'),result);
  if(result.harnessError || result.stage!=='observed') process.exitCode=2;
}
function judgePreservation(spec,run,expectedFingerprint) {
  const failures=[],requireCase=(value,message)=>{if(!value)failures.push(message);},child=run.child;
  requireCase(run.process?.actualCloseObserved===true && !run.process.watchdog && !run.process.signal
    && !run.process.processError && run.process.code===0 && !run.setupError && !run.outputError
    && run.descriptorClosure.complete,'Actual normal direct API child/output/descriptor closure missing');
  requireCase(child?.scope==='direct-public-API-preservation' && child.caseId===spec.id && child.label==='candidate'
    && child.stage==='observed' && !child.harnessError && child.installationFingerprint===expectedFingerprint,'Direct API setup/payload/provenance incomplete');
  requireCase(Number.isFinite(child?.startedAtMs) && Number.isFinite(child?.constructedAtMs)
    && Number.isFinite(child?.finishedAtMs) && child.startedAtMs<=child.constructedAtMs
    && child.constructedAtMs<=child.finishedAtMs && child.elapsedMs===child.finishedAtMs-child.startedAtMs
    && child.elapsedMs<=5000,'Direct API real-time freshness bound missing');
  requireCase(isDeepStrictEqual(child?.actual,spec.expected),'Frozen direct literal public API result differs');
  return {caseId:spec.id,scope:'direct-public-API-preservation',passed:failures.length===0,failures};
}

function makeOwner() {
  const explicit=process.env.TALENTSCOUT_HTTP_CACHE_EVIDENCE;
  if(explicit!==undefined) {
    const owner=abs(explicit);physical(path.dirname(owner));fs.mkdirSync(owner);return physical(owner);
  }
  fs.mkdirSync(generated,{recursive:true});
  const owner=path.join(physical(generated),'http-cache-policy-e2e-'+crypto.randomUUID());
  fs.mkdirSync(owner);return physical(owner);
}
if(process.argv[2]==='--http-cache-child') {
  await childMain();
} else if(process.argv[2]==='--http-preservation-child') {
  await preservationChildMain();
} else {
  test('installed reviewed HTTP cache policy preserves sixteen real Got cases and two direct API controls',async t=>{
    const owner=makeOwner();
    const report={schemaVersion:1,scope:'Installed candidate-only actual Got/cacheable-request HTTP cache E2E',
      source,owner,status:'Failed',runs:[],directApiRuns:[],failures:[],fullPairedMatrixEquivalent:false,
      fullCareerAccepted:false,dependencyAdoptionAccepted:false,releaseAccepted:false,productionCertified:false};
    try {
      need(Number(process.versions.node.split('.')[0])>=22,'Node22 or later required');
      const all=catalog();report.fixtures=Object.fromEntries(Object.entries(all.groups).map(([k,v])=>[k,v.pin]));
      report.installedIdentity=all.identityPin;report.preservationOracles=all.preservation.pin;report.script=filePin(SELF,path.dirname(SELF));
      report.runtime={executable:process.execPath,version:process.version};
      report.before=installed(all.identity);
      for(const [group,catalogValue] of Object.entries(all.groups)) for(const spec of catalogValue.value.cases) {
        const run=await runOne(group,catalogValue,spec,all,report.before,owner,report.script);
        const judgment=({http8:judgeHttp8,sie6:judgeSie6,vary2:judgeVary2})[group](spec,run);
        run.judgment=judgment;
        if(run.child?.installationFingerprint!==fingerprint(report.before)) judgment.failures.push('Child installed bytes/resolution fingerprint differs');
        if(run.child?.terminalCacheDispositionEstablished!==true) judgment.failures.push('Terminal actual Map disposition missing');
        judgment.passed=judgment.failures.length===0;
        report.runs.push(run);report.failures.push(...judgment.failures.map(message=>spec.id+': '+message));
      }
      for(const spec of all.preservation.value.cases) {
        const run=await runOne('preservation',all.preservation,spec,all,report.before,owner,report.script);
        run.judgment=judgePreservation(spec,run,fingerprint(report.before));
        report.directApiRuns.push(run);report.failures.push(...run.judgment.failures.map(message=>spec.id+': '+message));
      }
      report.after=installed(all.identity);
      assert.deepEqual(report.after,report.before,'Installed payload/resolutions changed during E2E');
      const finalCatalog=catalog();
      assert.deepEqual(Object.fromEntries(Object.entries(finalCatalog.groups).map(([k,v])=>[k,v.pin])),report.fixtures,'Frozen catalogs changed during E2E');
      assert.deepEqual(finalCatalog.identityPin,report.installedIdentity,'Installed identity changed during E2E');
      assert.deepEqual(finalCatalog.preservation.pin,report.preservationOracles,'Direct API oracle fixture changed during E2E');
      need(filePin(SELF,path.dirname(SELF)).sha256===report.script.sha256,'E2E shell changed during run');
      if(report.runs.length===16 && report.directApiRuns.length===2 && report.failures.length===0) report.status='Passed';
    } catch(error) {report.failures.push({stage:'parent',error:errorView(error)});}
    finally {
      const artifact=path.join(owner,'summary.json');writeNew(artifact,report);
      const artifactPin=filePin(artifact,owner);
      t.diagnostic('HTTP cache policy evidence: '+artifact+' sha256='+artifactPin.sha256);
    }
    assert.equal(report.status,'Passed',JSON.stringify(report.failures));
  });
}

