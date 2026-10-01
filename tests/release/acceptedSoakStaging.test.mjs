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
      seedCount:1,seedStart:index,seasonCount:30,concurrency:1,maxSerializedBytes:80*1024*1024,
      profileKind:'full-canonical-weekly-career',processIsolation:'one-seeded-career-per-process',
      workerNodeArguments:nodeArgs,workerHeapLimitBytes:heap};
    const runResult={seed,reachedSeason:31,canonicalTicks:1560,calendarWeeksSpanned:1560,
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
      ...(index===1?{persistenceReplay:{seed,digest:runResult.digest}}:{})};
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
    assert.equal(result.checkpoint.determinismReplayExecuted,true);assert.equal(result.runs.length,20);
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
