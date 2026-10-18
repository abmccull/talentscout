// Proposed behavioral contract. Write/copy this test before the adapter source.
// Run from candidate source: node --test ../proposals/release/accepted-soak-staging.contract.test.mjs
// Failure modes: stale/wrong run identity, failed/incomplete source run/jobs,
// missing/duplicate/failed/wrong-tree shards, missing fresh replay, dirty source,
// output replacing existing evidence on failure, raw receipt mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = resolve(process.env.TALENTSCOUT_RELEASE_SOURCE ?? process.cwd());
const helper = join(source, 'scripts/stage-accepted-soak-evidence.mjs');
const heap = 1536 * 1024 * 1024;
const nodeArgs = ['--max-old-space-size=1440', '--max-semi-space-size=32', '--expose-gc'];
const sha = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, {cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const json = (path,value) => writeFile(path,JSON.stringify(value,null,2)+'\n');

// Literal fixture oracles, frozen before the release-calendar consumer guard.
const calendarReceipt = () => ({kind:'fresh-builtin-england-v1',
  leagueClubCounts:[20,24,24,24],weeksPerSeason:46,maxCanonicalTicks:1380});
const malformedCalendarResults = [
  ['missing receipt',{calendarAdmission:undefined}],
  ['null receipt',{calendarAdmission:null}],
  ['false receipt',{calendarAdmission:false}],
  ['zero receipt',{calendarAdmission:0}],
  ['empty receipt',{calendarAdmission:''}],
  ['array receipt',{calendarAdmission:[]}],
  ['missing kind',{calendarAdmission:{...calendarReceipt(),kind:undefined}}],
  ['wrong kind',{calendarAdmission:{...calendarReceipt(),kind:'modded-england'}}],
  ['missing club counts',{calendarAdmission:{...calendarReceipt(),leagueClubCounts:undefined}}],
  ['short club counts',{calendarAdmission:{...calendarReceipt(),leagueClubCounts:[20,24,24]}}],
  ['reordered club counts',{calendarAdmission:{...calendarReceipt(),leagueClubCounts:[24,20,24,24]}}],
  ['string club count',{calendarAdmission:{...calendarReceipt(),leagueClubCounts:['20',24,24,24]}}],
  ['fractional club count',{calendarAdmission:{...calendarReceipt(),leagueClubCounts:[20.5,24,24,24]}}],
  ['missing season length',{calendarAdmission:{...calendarReceipt(),weeksPerSeason:undefined}}],
  ['wrong season length',{calendarAdmission:{...calendarReceipt(),weeksPerSeason:45}}],
  ['string season length',{calendarAdmission:{...calendarReceipt(),weeksPerSeason:'46'}}],
  ['missing maximum',{calendarAdmission:{...calendarReceipt(),maxCanonicalTicks:undefined}}],
  ['wrong maximum',{calendarAdmission:{...calendarReceipt(),maxCanonicalTicks:1379}}],
  ['unsafe maximum',{calendarAdmission:{...calendarReceipt(),maxCanonicalTicks:Number.MAX_SAFE_INTEGER+1}}],
  ['string maximum',{calendarAdmission:{...calendarReceipt(),maxCanonicalTicks:'1380'}}],
  ['early ticks',{canonicalTicks:1379}],
  ['extra tick',{canonicalTicks:1381}],
  ['matched early counters',{canonicalTicks:1379,calendarWeeksSpanned:1379}],
  ['matched extra counters',{canonicalTicks:1381,calendarWeeksSpanned:1381}],
  ['string ticks',{canonicalTicks:'1380'}],
  ['fractional ticks',{canonicalTicks:1380.5}],
  ['short calendar span',{calendarWeeksSpanned:1379}],
  ['long calendar span',{calendarWeeksSpanned:1381}],
  ['string calendar span',{calendarWeeksSpanned:'1380'}],
  ['missing final week',{reachedWeek:undefined}],
  ['wrong final week',{reachedWeek:2}],
  ['string final week',{reachedWeek:'1'}],
  ['extra season',{reachedSeason:32}],
  ['string final season',{reachedSeason:'31'}],
];

async function fixture() {
  const base = await mkdtemp(join(tmpdir(),'talentscout-release-stage-'));
  const candidate = join(base,'candidate'), records=join(base,'records');
  await mkdir(candidate); await mkdir(records);
  await writeFile(join(candidate,'.gitignore'),'artifacts/\n');
  await writeFile(join(candidate,'source-marker.txt'),'synthetic fixture only\n');
  await mkdir(join(candidate,'scripts'));
  // Reuse real aggregator; it is committed in the fixture to keep checkout clean.
  await writeFile(join(candidate,'scripts/aggregate-release-soak-shards.mjs'),
    await readFile(process.env.TALENTSCOUT_SOAK_AGGREGATOR ?? join(source,'scripts/aggregate-release-soak-shards.mjs')));
  await writeFile(join(candidate,'scripts/release-calendar-receipt.mjs'),
    await readFile(process.env.TALENTSCOUT_SOAK_CALENDAR_RECEIPT ?? join(source,'scripts/release-calendar-receipt.mjs')));
  for (const name of ['release-artifact-io.mjs', 'release-artifact-io-profile.json']) {
    await writeFile(join(candidate, 'scripts', name), await readFile(join(source, 'scripts', name)));
  }
  git(candidate,'init','--quiet');
  git(candidate,'config','user.name','Fixture Tester');
  git(candidate,'config','user.email','fixture@example.invalid');
  git(candidate,'add','.'); git(candidate,'commit','--quiet','-m','fixture');
  const commit=git(candidate,'rev-parse','HEAD'), tree=git(candidate,'rev-parse','HEAD^{tree}');
  const run=join(records,'source-workflow-run.json'), jobs=join(records,'source-workflow-jobs.json');
  const shards=join(records,'source-long-career-shards'); await mkdir(shards);
  const output=join(base,'bundle/artifacts/release/generated/long-career-release-summary.json');
  const runDocument={id:12345,head_sha:commit,status:'completed',conclusion:'success',repository:{full_name:'abmccull/talentscout'}};
  const jobsDocument={total_count:22,jobs:[
    {name:'Release quality gate',status:'completed',conclusion:'success'},
    ...Array.from({length:20},(_,i)=>({name:`Exact candidate seed ${i+1} x 30 seasons`,status:'completed',conclusion:'success'})),
    {name:'Aggregate exact candidate 20x30 soak',status:'completed',conclusion:'success'},
  ]};
  jobsDocument.jobs = jobsDocument.jobs.map(job => ({...job, run_id:12345, head_sha:commit}));
  await json(run,runDocument); await json(jobs,jobsDocument);
  for(let index=1;index<=20;index++) {
    const seed=`release-soak-${String(index).padStart(2,'0')}`;
    const identity={protocolVersion:1,candidateCommitSha:commit,candidateTreeSha:tree,
      seedCount:1,seedStart:index,seasonCount:30,concurrency:1,maxSerializedBytes:80*1024*1024,maxOutputBytes:67108864,
      profileKind:'full-canonical-weekly-career',processIsolation:'one-seeded-career-per-process',
      workerNodeArguments:nodeArgs,workerHeapLimitBytes:heap};
    const runResult={seed,reachedSeason:31,reachedWeek:1,calendarAdmission:calendarReceipt(),
      canonicalTicks:1380,calendarWeeksSpanned:1380,
      digest:sha(seed),peakBytes:500000,finalToInitialRatio:1.3,
      memory:{peakRuntimeHeapUsedBytes:400000000,peakHeapUsedBytes:500000000,peakRssBytes:600000000},
      seasonGrowth:[{growthBytes:1000}],compaction:{totalRemovedBytes:100,collectionDeltas:{reports:100}},
      weeklyLatencyMs:{p50:100,p95:200,max:300}};
    const document={schemaVersion:3,evidenceKind:'long-career-release-soak',status:'Passed',
      candidateBound:true,sourceTreeClean:true,candidateCommitSha:commit,candidateTreeSha:tree,
      profile:{seedCount:1,seasonCount:30,processIsolation:'one-seeded-career-per-process',
        v8HeapLimitBytes:heap,maxSerializedBytes:80*1024*1024,collectionByteBudgets:{reports:8*1024*1024}},
      checkpoint:{protocolVersion:1,resumeEnabled:true,reusedSeedCount:0,executedSeedCount:1,executionIdentity:identity,executionIdentityHash:sha(JSON.stringify(identity)),
        determinismReplayExecuted:index===1},runs:[runResult],
      ...(index===1?{persistenceReplay:structuredClone(runResult)}:{})};
    await json(join(shards,`long-career-release-summary-seed-${index}.json`),document);
  }
  const invoke=()=>spawnSync(process.execPath,[helper,`--candidate-dir=${candidate}`,`--run=${run}`,
    `--jobs=${jobs}`,`--shards=${shards}`,`--out=${output}`,'--source-run-id=12345'],
    {cwd:source,encoding:'utf8',timeout:30000});
  const mutateShard=async(index,mutate)=>{const path=join(shards,`long-career-release-summary-seed-${index}.json`);
    const document=JSON.parse(await readFile(path,'utf8'));mutate(document);await json(path,document);};
  const clean=async()=>{const target=resolve(base),parent=resolve(tmpdir());
    assert(target.startsWith(parent+sep) && target.includes('talentscout-release-stage-'));
    await rm(target,{recursive:true,force:true});};
  return {base,candidate,run,jobs,shards,output,commit,tree,runDocument,jobsDocument,invoke,mutateShard,clean};
}

test('stages fresh successful 20x30 aggregate from original candidate-bound shards without altering receipts',async()=>{
  const f=await fixture();try{
    const original=new Map();for(const path of [f.run,f.jobs,...(await readdir(f.shards)).map(name=>join(f.shards,name))])
      original.set(path,sha(await readFile(path)));
    const r=f.invoke();assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(await readFile(f.output,'utf8'));
    assert.equal(result.candidateCommitSha,f.commit);assert.equal(result.candidateTreeSha,f.tree);
    assert.equal(result.profile.seedCount,20);assert.equal(result.profile.seasonCount,30);
    assert.equal(result.profile.v8HeapLimitBytes,heap);assert.equal(result.status,'Passed');
    assert.equal(result.checkpoint.executionIdentity.maxOutputBytes,67108864);
    assert.equal(result.checkpoint.executionIdentityHash,sha(JSON.stringify(result.checkpoint.executionIdentity)));
    assert.equal(result.checkpoint.determinismReplayExecuted,true);assert.equal(result.runs.length,20);
    for(const run of result.runs) {
      assert.equal(run.reachedSeason,31);assert.equal(run.reachedWeek,1);
      assert.equal(run.canonicalTicks,1380);assert.equal(run.calendarWeeksSpanned,1380);
      assert.deepEqual(run.calendarAdmission,calendarReceipt());
    }
    assert.deepEqual(result.persistenceReplay,result.runs[0]);
    for(const [path,hash] of original) assert.equal(sha(await readFile(path)),hash,path);
    assert.equal(git(f.candidate,'status','--porcelain'),'');
  }finally{await f.clean();}
});

for(const [name,mutate,error] of [
  ['wrong source repository',async f=>{f.runDocument.repository.full_name='foreign/project';await json(f.run,f.runDocument);},/repository/i],
  ['foreign job run',async f=>{f.jobsDocument.jobs[5].run_id=99999;await json(f.jobs,f.jobsDocument);},/(?:job|run).*(?:identity|match|id)/i],
  ['stale job candidate',async f=>{f.jobsDocument.jobs[5].head_sha='a'.repeat(40);await json(f.jobs,f.jobsDocument);},/(?:job|candidate|sha|head)/i],
  ['incomplete source run',async f=>{f.runDocument.status='in_progress';await json(f.run,f.runDocument);},/(?:source|run).*(?:completed|status)/i],
  ['wrong source run id',async f=>{f.runDocument.id=99999;await json(f.run,f.runDocument);},/run.*(?:id|identity|match)/i],
  ['stale source candidate',async f=>{f.runDocument.head_sha='a'.repeat(40);await json(f.run,f.runDocument);},/(?:candidate|sha|head)/i],
  ['failed source run',async f=>{f.runDocument.conclusion='failure';await json(f.run,f.runDocument);},/(?:source|run).*(?:success|passed|fail)/i],
  ['failed source seed job',async f=>{f.jobsDocument.jobs[10].conclusion='failure';await json(f.jobs,f.jobsDocument);},/(?:job|seed).*(?:success|passed|fail)/i],
  ['missing source seed job',async f=>{f.jobsDocument.jobs.splice(10,1);f.jobsDocument.total_count--;await json(f.jobs,f.jobsDocument);},/(?:missing|job|seed)/i],
  ['nineteen seeds',async f=>rm(join(f.shards,'long-career-release-summary-seed-20.json')),/(?:missing|20|shard)/i],
  ['duplicate seed shard',async f=>writeFile(join(f.shards,'duplicate.json'),await readFile(join(f.shards,'long-career-release-summary-seed-9.json'))),/(?:duplicate|seed|shard)/i],
  ['wrong shard tree',async f=>f.mutateShard(7,d=>{d.candidateTreeSha='b'.repeat(40);}),/(?:invalid|tree|candidate|shard)/i],
  ['missing fresh replay',async f=>f.mutateShard(1,d=>{d.checkpoint.determinismReplayExecuted=false;}),/(?:replay|determin)/i],
  ['failed shard',async f=>f.mutateShard(13,d=>{d.status='Failed';}),/(?:invalid|shard|passed|fail)/i],
  ['dirty candidate',async f=>writeFile(join(f.candidate,'source-marker.txt'),'uncommitted'),/(?:dirty|clean)/i],
]) test(`rejects ${name} and preserves canonical evidence already present`,async()=>{
  const f=await fixture();try{
    await mkdir(resolve(f.output,'..'),{recursive:true});
    const sentinel='existing exact-candidate evidence\n';await writeFile(f.output,sentinel);
    await mutate(f);const r=f.invoke();assert.notEqual(r.status,0);
    assert.match(r.stderr+r.stdout,error);assert.equal(await readFile(f.output,'utf8'),sentinel);
  }finally{await f.clean();}
});

test('preserves legitimate same-candidate checkpoint reuse and still proves fresh replay',async()=>{
  const f=await fixture();try{
    await f.mutateShard(8,d=>{d.checkpoint.reusedSeedCount=1;d.checkpoint.executedSeedCount=0;});
    const r=f.invoke();assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(await readFile(f.output,'utf8'));
    assert.equal(result.checkpoint.reusedSeedCount,1);
    assert.equal(result.checkpoint.executedSeedCount,19);
    assert.equal(result.checkpoint.determinismReplayExecuted,true);
    assert.equal(result.runs.length,20);
  }finally{await f.clean();}
});

test('represents missing legacy accounting as unknown without fabricating executed seeds',async()=>{
  const f=await fixture();try{
    await f.mutateShard(8,d=>{delete d.checkpoint.reusedSeedCount;delete d.checkpoint.executedSeedCount;});
    const r=f.invoke();assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(await readFile(f.output,'utf8'));
    assert.equal(result.checkpoint.accountingKnown,false);
    assert.equal(result.checkpoint.reusedSeedCount,null);
    assert.equal(result.checkpoint.executedSeedCount,null);
    assert.equal(result.checkpoint.shardAccounting[7].seed,'release-soak-08');
    assert.equal(result.checkpoint.shardAccounting[7].accountingKnown,false);
    assert.equal(result.checkpoint.determinismReplayExecuted,true);
  }finally{await f.clean();}
});

for(const [name,mutate] of [
  ['negative reported accounting',d=>{d.checkpoint.reusedSeedCount=-1;d.checkpoint.executedSeedCount=2;}],
  ['impossible reported accounting',d=>{d.checkpoint.reusedSeedCount=1;d.checkpoint.executedSeedCount=1;}],
  ['string reported accounting',d=>{d.checkpoint.reusedSeedCount='0';}],
]) test(`rejects ${name} before replacing canonical evidence`,async()=>{
  const f=await fixture();try{
    await mkdir(resolve(f.output,'..'),{recursive:true});
    const sentinel='existing canonical evidence\n';await writeFile(f.output,sentinel);
    await f.mutateShard(8,mutate);const r=f.invoke();assert.notEqual(r.status,0);
    assert.match(r.stderr+r.stdout,/accounting/i);
    assert.equal(await readFile(f.output,'utf8'),sentinel);
  }finally{await f.clean();}
});

test('rejects impossible individual accounting when paired legacy counter is absent',async()=>{
  const f=await fixture();try{
    await mkdir(resolve(f.output,'..'),{recursive:true});
    const sentinel='existing canonical evidence\n';await writeFile(f.output,sentinel);
    await f.mutateShard(8,d=>{d.checkpoint.reusedSeedCount=2;delete d.checkpoint.executedSeedCount;});
    const r=f.invoke();assert.notEqual(r.status,0);
    assert.match(r.stderr+r.stdout,/accounting/i);
    assert.equal(await readFile(f.output,'utf8'),sentinel);
  }finally{await f.clean();}
});

// Tests-first output grant additions: real unchanged stager and aggregator.
test('propagates a common nondefault per-runner grant without rewriting raw shards',async()=>{
  const f=await fixture();try{
    for(let index=1;index<=20;index++) await f.mutateShard(index,d=>{
      d.checkpoint.executionIdentity.maxOutputBytes=67108865;
      d.checkpoint.executionIdentityHash=sha(JSON.stringify(d.checkpoint.executionIdentity));
    });
    const paths=[f.run,f.jobs,...(await readdir(f.shards)).map(name=>join(f.shards,name))];
    const before=new Map();for(const path of paths)before.set(path,sha(await readFile(path)));
    const r=f.invoke();assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(await readFile(f.output,'utf8'));
    assert.equal(result.checkpoint.executionIdentity.maxOutputBytes,67108865);
    assert.equal(result.checkpoint.executionIdentityHash,sha(JSON.stringify(result.checkpoint.executionIdentity)));
    assert.equal(result.checkpoint.executionIdentity.executionMode,'github-matrix-shards');
    for(const [path,hash]of before)assert.equal(sha(await readFile(path)),hash,path);
  }finally{await f.clean();}
});
for(const [name,value]of [['missing',undefined],['zero',0],['fractional',0.5],
  ['unsafe',Number.MAX_SAFE_INTEGER+1],['mixed',67108865]]){
  test(`rejects ${name} source output grant after rehash without replacing evidence or raw receipts`,async()=>{
    const f=await fixture();try{
      await f.mutateShard(9,d=>{
        if(value===undefined)delete d.checkpoint.executionIdentity.maxOutputBytes;
        else d.checkpoint.executionIdentity.maxOutputBytes=value;
        d.checkpoint.executionIdentityHash=sha(JSON.stringify(d.checkpoint.executionIdentity));
      });
      const paths=[f.run,f.jobs,...(await readdir(f.shards)).map(file=>join(f.shards,file))];
      const before=new Map();for(const path of paths)before.set(path,sha(await readFile(path)));
      await mkdir(resolve(f.output,'..'),{recursive:true});
      const sentinel='existing canonical evidence remains unchanged\n';await writeFile(f.output,sentinel);
      const r=f.invoke();assert.notEqual(r.status,0);assert.equal(r.signal,null);
      assert.match(r.stderr+r.stdout,/maxOutputBytes/);
      assert.equal(await readFile(f.output,'utf8'),sentinel);
      for(const [path,hash]of before)assert.equal(sha(await readFile(path)),hash,path);
    }finally{await f.clean();}
  });
}

// Keep the other nineteen calendars valid: each case corrupts exactly one
// successful source run, or only the actually executed seed-01 replay result.
for(const target of ['source run','fresh replay']) {
  for(const [name,mutation]of malformedCalendarResults) {
    test(`rejects calendar admission ${target}: ${name} without replacing evidence or raw receipts`,async()=>{
      const f=await fixture();try{
        await f.mutateShard(target==='source run'?9:1,d=>{
          Object.assign(target==='source run'?d.runs[0]:d.persistenceReplay,mutation);
        });
        const paths=[f.run,f.jobs,...(await readdir(f.shards)).map(file=>join(f.shards,file))];
        const before=new Map();for(const path of paths)before.set(path,sha(await readFile(path)));
        await mkdir(resolve(f.output,'..'),{recursive:true});
        const sentinel='existing canonical evidence remains unchanged\n';await writeFile(f.output,sentinel);
        const r=f.invoke();assert.notEqual(r.status,0);assert.equal(r.signal,null);
        assert.match(r.stderr+r.stdout,/calendar admission/i);
        assert.equal(await readFile(f.output,'utf8'),sentinel);
        for(const [path,hash]of before)assert.equal(sha(await readFile(path)),hash,path);
      }finally{await f.clean();}
    });
  }
}

// Real-aggregator shape controls, frozen before the exact-one-run correction.
for (const extraKind of ['duplicate', 'malformed']) {
  test(`rejects calendar admission extra ${extraKind} source run without replacing evidence or raw receipts`, async () => {
    const f = await fixture();
    try {
      await f.mutateShard(9, document => {
        document.runs.push(extraKind === 'duplicate'
          ? structuredClone(document.runs[0])
          : { seed: 'ignored-malformed-run', calendarAdmission: null });
      });
      const paths = [f.run, f.jobs, ...(await readdir(f.shards)).map(file => join(f.shards, file))];
      const before = new Map();
      for (const file of paths) before.set(file, sha(await readFile(file)));
      await mkdir(resolve(f.output, '..'), { recursive: true });
      const sentinel = 'existing canonical evidence remains unchanged\n';
      await writeFile(f.output, sentinel);
      const result = f.invoke();
      assert.notEqual(result.status, 0);
      assert.equal(result.signal, null);
      assert.match(result.stderr + result.stdout, /calendar admission/i);
      assert.equal(await readFile(f.output, 'utf8'), sentinel);
      for (const [file, hash] of before) assert.equal(sha(await readFile(file)), hash, file);
    } finally {
      await f.clean();
    }
  });
}
