import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const proposal=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const helper=join(proposal,'scripts/stage-accepted-soak-evidence.mjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const profileHash='193f139435344eb680c868385483a62dca0fca27732e206ae93ed50ef94f47e5';
const heap=1536*1024*1024;
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const calendar={kind:'fresh-builtin-england-v1',leagueClubCounts:[20,24,24,24],weeksPerSeason:46,maxCanonicalTicks:1380};

async function fixture({ artifactCreatedAt = '2026-10-18T20:30:00Z' } = {}) {
  const base=await mkdtemp(join(tmpdir(),'ts-canonical-stage-'));
  const candidate=join(base,'candidate'),records=join(base,'records');
  await mkdir(candidate);await mkdir(records);
  await writeFile(join(candidate,'.gitignore'),'artifacts/\n');await writeFile(join(candidate,'source.txt'),'synthetic adapter fixture\n');
  git(candidate,'init','--quiet');git(candidate,'config','user.name','Fixture Tester');git(candidate,'config','user.email','fixture@example.invalid');
  git(candidate,'add','.');git(candidate,'commit','--quiet','-m','synthetic fixture');
  const commit=git(candidate,'rev-parse','HEAD'),tree=git(candidate,'rev-parse','HEAD^{tree}');
  const identity={protocolVersion:1,candidateCommitSha:commit,candidateTreeSha:tree,seedCount:20,seedStart:1,seasonCount:30,concurrency:3,maxSerializedBytes:83886080,maxOutputBytes:67108864,artifactProfileId:'canonical-career-artifact-io-v1',artifactProfileSha256:profileHash,artifactProfilePurpose:'canonical',profileKind:'full-canonical-weekly-career',processIsolation:'one-seeded-career-per-process',workerNodeArguments:['--max-old-space-size=1440','--max-semi-space-size=32','--expose-gc'],workerHeapLimitBytes:heap,nodeVersion:'v22.14.0',nodeOptions:'',platform:'linux',architecture:'x64',availableParallelism:8,totalMemoryBytes:16*1024**3,cpuModel:'Synthetic fixture CPU'};
  const runs=Array.from({length:20},(_,index)=>({seed:`release-soak-${String(index+1).padStart(2,'0')}`,reachedSeason:31,reachedWeek:1,calendarAdmission:calendar,canonicalTicks:1380,calendarWeeksSpanned:1380,digest:digest(`seed-${index+1}`),peakBytes:1000000,finalToInitialRatio:2,memory:{peakRuntimeHeapUsedBytes:100000000,peakHeapUsedBytes:80000000,peakRssBytes:200000000},seasonGrowth:[{growthBytes:1000}],compaction:{totalRemovedBytes:100,collectionDeltas:{reports:100}},weeklyLatencyMs:{p50:100,p95:200,max:300}}));
  const campaign={schemaVersion:3,evidenceKind:'long-career-release-soak',generatedAt:'2026-10-18T20:00:00.000Z',candidateCommitSha:commit,candidateTreeSha:tree,candidateBound:true,sourceTreeClean:true,status:'Passed',checkpoint:{protocolVersion:1,executionIdentity:identity,executionIdentityHash:digest(JSON.stringify(identity)),resumeEnabled:false,reusedSeedCount:0,executedSeedCount:20,determinismReplayExecuted:true},profile:{kind:'full-canonical-weekly-career',skippedOrdinaryWeeks:false,seedCount:20,seasonCount:30,concurrency:3,processIsolation:'one-seeded-career-per-process',explicitGcAtSeasonBoundaries:true,deterministicReplaySeed:'release-soak-01',chooserProfilesExercised:['commercial'],maxSerializedBytes:83886080,maxGrowthMultiplier:64,maxHeapUsedBytes:heap,v8HeapLimitBytes:heap,maxRssBytes:2147483648,maxPostGcHeapGrowthBytes:1073741824,collectionByteBudgets:{reports:8388608}},aggregate:{totalCanonicalTicks:27600,totalCalendarWeeksSpanned:27600,largestSaveBytes:1000000,largestFinalToInitialRatio:2,peakRuntimeHeapUsedBytes:100000000,peakHeapUsedBytes:80000000,peakRssBytes:200000000},runs,persistenceReplay:structuredClone(runs[0]),artifactIo:{schemaVersion:1,profileId:'canonical-career-artifact-io-v1',profileSha256:profileHash,purpose:'canonical',expectedExecutionIdentityHash:digest(JSON.stringify(identity)),expectedCandidateCommitSha:commit,expectedCandidateTreeSha:tree,failureReceiptPath:'artifacts/release/generated/long-career-artifact-failure.json'}};
  const run={id:12345,head_sha:commit,run_attempt:1,path:'.github/workflows/canonical-release-soak.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',run_started_at:'2026-10-18T00:00:00Z',updated_at:'2026-10-18T21:00:00Z',repository:{full_name:'abmccull/talentscout',id:77},head_repository:{full_name:'abmccull/talentscout',id:77}};
  const jobs={total_count:1,jobs:[{id:9988,name:'Canonical fresh 20x30/c3 with seed-one replay',run_id:12345,head_sha:commit,run_attempt:1,status:'completed',conclusion:'success',runner_id:12,runner_name:'fixture-only',labels:['self-hosted','linux','x64','talentscout-release-soak']}]};
  const paths={run:join(records,'source-workflow-run.json'),jobs:join(records,'source-workflow-jobs.json'),campaign:join(records,'long-career-release-summary.json'),output:join(base,'bundle/artifacts/release/generated/long-career-release-summary.json')};
  const write=async()=>{await json(paths.run,run);await json(paths.jobs,jobs);await json(paths.campaign,campaign);};await write();
  const invoke=(extra=[])=>spawnSync(process.execPath,[helper,`--candidate-dir=${candidate}`,`--run=${paths.run}`,`--jobs=${paths.jobs}`,`--campaign=${paths.campaign}`,`--out=${paths.output}`,'--source-run-id=12345','--source-artifact-id=67890',`--source-artifact-digest=sha256:${'d'.repeat(64)}`,`--source-campaign-sha256=${digest(JSON.stringify(campaign,null,2)+'\n')}`,`--source-artifact-created-at=${artifactCreatedAt}`,...extra],{cwd:candidate,encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'abmccull/talentscout'}});
  const clean=async()=>{assert(base.startsWith(resolve(tmpdir())+sep)&&base.includes('ts-canonical-stage-'));await rm(base,{recursive:true,force:true});};
  return {base,candidate,commit,tree,identity,campaign,run,jobs,paths,write,invoke,clean};
}
test('stages actual canonical c3 shape and preserves every source receipt',async()=>{
  const f=await fixture();try{const before=await Promise.all([f.paths.run,f.paths.jobs,f.paths.campaign].map(async p=>[p,digest(await readFile(p))]));const r=f.invoke();assert.equal(r.status,0,r.stderr);const result=JSON.parse(await readFile(f.paths.output,'utf8'));assert.deepEqual(result.runs,f.campaign.runs);assert.deepEqual(result.persistenceReplay,f.campaign.persistenceReplay);assert.deepEqual(result.checkpoint,f.campaign.checkpoint);assert.equal(result.acceptedSourceWorkflow.inputMode,'canonical-campaign');assert.equal(result.acceptedSourceWorkflow.campaignReceiptSha256,digest(await readFile(f.paths.campaign)));for(const [p,hash]of before)assert.equal(digest(await readFile(p)),hash);assert.equal(git(f.candidate,'status','--porcelain'),'');}finally{await f.clean();}
});
const cases=[
 ['foreign repository',f=>f.run.repository.full_name='foreign/repo'],['fork source',f=>f.run.head_repository.id=88],['wrong run id',f=>f.run.id=5],['stale run SHA',f=>f.run.head_sha='a'.repeat(40)],['failed run',f=>f.run.conclusion='failure'],['wrong workflow',f=>f.run.path='.github/workflows/build.yml'],['automatic run',f=>f.run.event='push'],['wrong job attempt',f=>f.jobs.jobs[0].run_attempt=2],['wrong job SHA',f=>f.jobs.jobs[0].head_sha='b'.repeat(40)],['wrong job run',f=>f.jobs.jobs[0].run_id=6],['failed job',f=>f.jobs.jobs[0].conclusion='failure'],['hosted job',f=>f.jobs.jobs[0].labels=['ubuntu-latest']],['truncated jobs',f=>f.jobs.total_count=2],['duplicate job',f=>{f.jobs.jobs.push(structuredClone(f.jobs.jobs[0]));f.jobs.total_count=2;}],
 ['wrong tree',f=>f.campaign.candidateTreeSha='a'.repeat(40)],['unbound',f=>f.campaign.candidateBound=false],['dirty receipt',f=>f.campaign.sourceTreeClean=false],['failed campaign',f=>f.campaign.status='Failed'],['c1 campaign',f=>{f.identity.concurrency=1;f.campaign.profile.concurrency=1;}],['c20 aggregate',f=>{f.identity.concurrency=20;f.campaign.profile.concurrency=20;}],['resume',f=>f.campaign.checkpoint.resumeEnabled=true],['reuse',f=>{f.campaign.checkpoint.reusedSeedCount=1;f.campaign.checkpoint.executedSeedCount=19;}],['skip replay',f=>f.campaign.checkpoint.determinismReplayExecuted=false],['missing replay',f=>delete f.campaign.persistenceReplay],['wrong replay digest',f=>f.campaign.persistenceReplay.digest='a'.repeat(64)],['bad replay calendar',f=>f.campaign.persistenceReplay.reachedWeek=2],['nineteen seeds',f=>f.campaign.runs.pop()],['reordered seeds',f=>f.campaign.runs.reverse()],['duplicate seed',f=>f.campaign.runs[19]=structuredClone(f.campaign.runs[0])],['bad calendar',f=>f.campaign.runs[9].canonicalTicks=1379],['raised save budget',f=>{f.identity.maxSerializedBytes=90000000;f.campaign.profile.maxSerializedBytes=90000000;}],['raised heap budget',f=>f.identity.workerHeapLimitBytes=2*1024**3],['missing profile',f=>delete f.campaign.artifactIo],['wrong profile hash',f=>f.campaign.artifactIo.profileSha256='a'.repeat(64)],['forged identity hash',f=>f.campaign.checkpoint.executionIdentityHash='a'.repeat(64)],['existing acceptance',f=>f.campaign.acceptedSourceWorkflow={runId:'12345'}],['stale generation',f=>f.campaign.generatedAt='2026-10-17T20:00:00Z'],['bad tick total',f=>f.campaign.aggregate.totalCanonicalTicks=1],['save exceeded',f=>f.campaign.runs[9].peakBytes=90000000],['RSS exceeded',f=>f.campaign.runs[9].memory.peakRssBytes=3*1024**3],['empty output grant',f=>f.identity.maxOutputBytes=0],
];
for(const [name,mutate]of cases)test(`rejects ${name} before replacing prior evidence`,async()=>{const f=await fixture();try{mutate(f);if(name!=='forged identity hash'){f.campaign.checkpoint.executionIdentityHash=digest(JSON.stringify(f.identity));if(f.campaign.artifactIo)f.campaign.artifactIo.expectedExecutionIdentityHash=f.campaign.checkpoint.executionIdentityHash;}await f.write();await mkdir(dirname(f.paths.output),{recursive:true});await writeFile(f.paths.output,'previous accepted evidence\n');const r=f.invoke();assert.notEqual(r.status,0,r.stdout);assert.equal(await readFile(f.paths.output,'utf8'),'previous accepted evidence\n');}finally{await f.clean();}});
test('rejects dirty real candidate',async()=>{const f=await fixture();try{await writeFile(join(f.candidate,'source.txt'),'dirty');assert.notEqual(f.invoke().status,0);}finally{await f.clean();}});
test('rejects campaign alias output without changing input',async()=>{const f=await fixture();try{f.paths.output=f.paths.campaign;const before=digest(await readFile(f.paths.campaign));assert.notEqual(f.invoke().status,0);assert.equal(digest(await readFile(f.paths.campaign)),before);}finally{await f.clean();}});

test('provider archive transport through canonical staging preserves original campaign bytes and identity', async()=>{
  const f=await fixture();
  try {
    const archive=join(f.base,'canonical.zip'), artifacts=join(f.base,'source-artifacts.json');
    const destination=join(f.base,'source-long-career-shards/canonical'),receipt=join(f.base,'source-long-career-shards/canonical-artifact.json');
    await mkdir(dirname(destination));
    const zipScript=`import sys,zipfile\nfrom pathlib import Path\nwith zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:\n z.write(sys.argv[2],'long-career-release-summary.json')\n z.writestr('canonical-soak-runner-profile.json','{}')\n z.writestr('long-career-workers/checkpoint.json','{}')\n for i in range(1,22):\n  stem='long-career-workers/seed-%02d-%s.json'%((i if i<21 else 1),('run' if i<21 else 'determinism-replay'))\n  z.writestr(stem,'{}')\n  z.writestr(stem+'.progress-00000000-0000-4000-8000-%012d.jsonl'%i,'{}\\n')\n`;
    const zip=spawnSync(python,['-c',zipScript,archive,f.paths.campaign],{encoding:'utf8'});assert.equal(zip.status,0,zip.stderr);
    const zipBytes=await readFile(archive);
    await json(artifacts,{total_count:1,artifacts:[{id:67890,name:'canonical-release-soak-evidence',expired:false,created_at:'2026-10-18T20:30:00Z',size_in_bytes:zipBytes.length,digest:'sha256:'+digest(zipBytes),workflow_run:{id:12345,head_sha:f.commit,repository_id:77,head_repository_id:77}}]});
    const transport=spawnSync(python,[join(proposal,'scripts/prepare-canonical-soak-artifact.py'),`--run=${f.paths.run}`,`--artifacts=${artifacts}`,`--candidate-sha=${f.commit}`,'--source-run-id=12345','--repository=abmccull/talentscout',`--archive=${archive}`,`--destination=${destination}`,`--receipt=${receipt}`],{encoding:'utf8'});
    assert.equal(transport.status,0,transport.stderr);const binding=JSON.parse(transport.stdout);
    const campaignPath=join(destination,'long-career-release-summary.json');
    const stage=spawnSync(process.execPath,[helper,`--candidate-dir=${f.candidate}`,`--run=${f.paths.run}`,`--jobs=${f.paths.jobs}`,`--campaign=${campaignPath}`,`--out=${f.paths.output}`,'--source-run-id=12345',`--source-artifact-id=${binding.artifact_id}`,`--source-artifact-digest=${binding.artifact_digest}`,`--source-campaign-sha256=${binding.source_campaign_sha256}`,`--source-artifact-created-at=${binding.artifact_created_at}`],{cwd:f.candidate,encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'abmccull/talentscout'}});
    assert.equal(stage.status,0,stage.stderr);const accepted=JSON.parse(await readFile(f.paths.output,'utf8'));
    assert.deepEqual(accepted.checkpoint,f.campaign.checkpoint);assert.deepEqual(accepted.runs,f.campaign.runs);
    assert.equal(accepted.acceptedSourceWorkflow.sourceArtifact.digest,'sha256:'+digest(zipBytes));
    assert.equal(accepted.acceptedSourceWorkflow.campaignReceiptSha256,digest(await readFile(f.paths.campaign)));
    assert.equal(digest(await readFile(campaignPath)),digest(await readFile(f.paths.campaign)));
    assert.equal(JSON.parse(await readFile(receipt,'utf8')).gameCampaignCertified,false);
  } finally {await f.clean();}
});

// GitHub's whole-second created_at denotes [t, t+1000ms); fractional values stay exact.
for (const { name, artifactCreatedAt, generatedAt, passes, error } of [
  { name: 'whole-second first millisecond', artifactCreatedAt: '2026-10-18T20:30:00Z', generatedAt: '2026-10-18T20:30:00.000Z', passes: true },
  { name: 'whole-second last millisecond', artifactCreatedAt: '2026-10-18T20:30:00Z', generatedAt: '2026-10-18T20:30:00.999Z', passes: true },
  { name: 'whole-second next-second boundary', artifactCreatedAt: '2026-10-18T20:30:00Z', generatedAt: '2026-10-18T20:30:01.000Z', passes: false, error: /campaign generation falls outside/ },
  { name: 'fractional exact timestamp', artifactCreatedAt: '2026-10-18T20:30:00.500Z', generatedAt: '2026-10-18T20:30:00.500Z', passes: true },
  { name: 'fractional one millisecond late', artifactCreatedAt: '2026-10-18T20:30:00.500Z', generatedAt: '2026-10-18T20:30:00.501Z', passes: false, error: /campaign generation falls outside/ },
  { name: 'explicit fractional zero stays exact', artifactCreatedAt: '2026-10-18T20:30:00.000Z', generatedAt: '2026-10-18T20:30:00.001Z', passes: false, error: /campaign generation falls outside/ },
  { name: 'pre-run generation stays rejected', artifactCreatedAt: '2026-10-18T20:30:00Z', generatedAt: '2026-10-17T23:59:59.999Z', passes: false, error: /campaign generation falls outside/ },
  { name: 'stale attempt artifact stays rejected', artifactCreatedAt: '2026-10-17T23:59:59Z', generatedAt: '2026-10-18T00:00:00.000Z', passes: false, error: /source artifact does not belong/ },
]) test(`provider timestamp precision: ${name}`, async () => {
  const f = await fixture({ artifactCreatedAt });
  try {
    f.campaign.generatedAt = generatedAt;
    await f.write();
    await mkdir(dirname(f.paths.output), { recursive: true });
    await writeFile(f.paths.output, 'previous accepted evidence\n');
    const result = f.invoke();
    if (passes) {
      assert.equal(result.status, 0, result.stderr);
      const accepted = JSON.parse(await readFile(f.paths.output, 'utf8'));
      assert.equal(accepted.generatedAt, generatedAt);
      assert.equal(accepted.acceptedSourceWorkflow.sourceArtifact.createdAt, artifactCreatedAt);
    } else {
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, error);
      assert.equal(await readFile(f.paths.output, 'utf8'), 'previous accepted evidence\n');
    }
  } finally { await f.clean(); }
});
