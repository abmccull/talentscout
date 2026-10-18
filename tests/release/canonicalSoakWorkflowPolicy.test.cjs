const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const yaml = createRequire(path.join(process.env.TALENTSCOUT_RELEASE_TOOLCHAIN || root, 'package.json'))('js-yaml');
const read = name => yaml.load(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

function producerPolicy(doc) {
  assert.deepEqual(Object.keys(doc.on), ['workflow_dispatch']);
  assert.equal(doc.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(doc.jobs), ['canonical']);
  const job = doc.jobs.canonical;
  assert.deepEqual(job['runs-on'], ['self-hosted', 'linux', 'x64', 'talentscout-release-soak']);
  assert.equal(job.environment, 'release-certification');
  assert.equal(job['timeout-minutes'], 1380);
  assert.equal(job.strategy, undefined);
  const run = job.steps.find(s => s.name === 'Run unchanged fresh canonical 20x30/c3 campaign');
  assert.equal(run.run, 'node scripts/run-long-career-release-soak.mjs');
  assert.equal(run['timeout-minutes'], 1320);
  for (const [key,value] of Object.entries({SOAK_SEEDS:'20',SOAK_SEED_START:'1',SOAK_SEASONS:'30',SOAK_CONCURRENCY:'3',SOAK_RESUME:'false',SOAK_SKIP_DETERMINISM_REPLAY:'false',SOAK_REQUIRE_CLEAN_CANDIDATE:'true',SOAK_MAX_SERIALIZED_BYTES:'83886080',SOAK_MAX_SINGLE_BATCH_CPU_MS:'45000',SOAK_MAX_SINGLE_BATCH_WALL_MS:'60000',SOAK_TEST_TIMEOUT_MS:'18000000',SOAK_MAX_OUTPUT_BYTES:'67108864',SOAK_PLAN_ONLY:'false'})) assert.equal(run.env[key],value,key);
  const fresh = job.steps.find(s => s.name === 'Require fresh canonical output locations');
  assert.match(fresh.run, /lstatSync/);
  assert.match(fresh.run, /Refusing pre-existing canonical evidence/);
  assert.ok(job.steps.indexOf(fresh) < job.steps.indexOf(run));
  const upload = job.steps.find(s => s.name === 'Preserve actual canonical campaign evidence');
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with.name, 'canonical-release-soak-evidence');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.doesNotMatch(JSON.stringify(doc), /steamcmd \+login|gh release create|git push|action-gh-release|electron:dist/);
}

function consumerPolicy(doc) {
  assert.deepEqual(Object.keys(doc.on), ['workflow_dispatch']);
  assert.equal(doc.env.CANONICAL_CONTROL_BRANCH, 'release/youth-ea-rc2');
  const steps = doc.jobs['candidate-bundle'].steps;
  const raw = steps.find(s => s.name === 'Retain exact canonical source workflow and artifact receipts');
  const select = steps.find(s => s.id === 'canonical_source');
  const transport = steps.find(s => s.id === 'canonical_transport');
  const stage = steps.find(s => s.name === 'Stage genuine fresh canonical 20x30/c3 source campaign');
  for (const step of [raw,select,transport,stage]) assert.match(step.run, /set -euo pipefail/);
  assert.match(raw.run, /actions\/runs\/\$\{SOURCE_WORKFLOW_RUN_ID\}\/artifacts\?per_page=100/);
  assert.match(raw.run, /source-long-career-shards\/source-artifacts.json/);
  assert.match(select.run, /prepare-canonical-soak-artifact.py --select-only/);
  assert.match(transport.run, /prepare-canonical-soak-artifact.py --archive-stdin/);
  assert.match(transport.run, /--receipt="\$evidence\/source-long-career-shards\/canonical-artifact.json"/);
  assert.equal(transport.env.CANONICAL_ARTIFACT_ID, '${{ steps.canonical_source.outputs.artifact_id }}');
  assert.equal(stage['working-directory'], 'candidate');
  assert.match(stage.run, /node \.\.\/scripts\/stage-accepted-soak-evidence.mjs/);
  assert.match(stage.run, /--campaign="\$evidence\/source-long-career-shards\/canonical\/long-career-release-summary.json"/);
  assert.doesNotMatch(stage.run, /--shards=/);
  for (const [key,output] of Object.entries({SOURCE_ARTIFACT_ID:'artifact_id',SOURCE_ARTIFACT_DIGEST:'artifact_digest',SOURCE_ARTIFACT_CREATED_AT:'artifact_created_at',SOURCE_CAMPAIGN_SHA256:'source_campaign_sha256'})) assert.equal(stage.env[key], '${{ steps.canonical_transport.outputs.'+output+' }}');
  assert.ok(steps.indexOf(raw)<steps.indexOf(select) && steps.indexOf(select)<steps.indexOf(transport) && steps.indexOf(transport)<steps.indexOf(stage));
  assert.doesNotMatch(JSON.stringify(doc), /unzip -jo|release-soak-shard-|steamcmd \+login|gh release create|action-gh-release/);
}

const producer=read('canonical-release-soak.yml'), consumer=read('package-accepted-candidate.yml');
test('canonical producer and consumer preserve the complete strict path',()=>{producerPolicy(producer);consumerPolicy(consumer);});
const run=doc=>doc.jobs.canonical.steps.find(s=>s.env?.SOAK_CONCURRENCY);
for(const [name,mutate] of [
  ['c1',d=>run(d).env.SOAK_CONCURRENCY='1'],['resume',d=>run(d).env.SOAK_RESUME='true'],
  ['skip-replay',d=>run(d).env.SOAK_SKIP_DETERMINISM_REPLAY='true'],['higher-output-cap',d=>run(d).env.SOAK_MAX_OUTPUT_BYTES='99999999'],
  ['higher-CPU-budget',d=>run(d).env.SOAK_MAX_SINGLE_BATCH_CPU_MS='60000'],['hosted',d=>d.jobs.canonical['runs-on']='ubuntu-latest'],
  ['six-hour-lease',d=>d.jobs.canonical['timeout-minutes']=360],['publishing',d=>d.jobs.canonical.steps.push({run:'gh release create v1.0.0'})],
]) test('producer rejects '+name,()=>{const mutant=structuredClone(producer);mutate(mutant);assert.throws(()=>producerPolicy(mutant));});
for(const [name,mutate] of [
  ['unverified-extract',d=>d.jobs['candidate-bundle'].steps.find(s=>s.id==='canonical_transport').run='unzip -jo source.zip'],
  ['foreign-output-binding',d=>d.jobs['candidate-bundle'].steps.find(s=>s.name?.startsWith('Stage genuine')).env.SOURCE_CAMPAIGN_SHA256='input'],
  ['shard-substitution',d=>d.jobs['candidate-bundle'].steps.find(s=>s.name?.startsWith('Stage genuine')).run+='\n--shards=legacy'],
  ['relaxed-control-branch',d=>d.env.CANONICAL_CONTROL_BRANCH='main'],
]) test('consumer rejects '+name,()=>{const mutant=structuredClone(consumer);mutate(mutant);assert.throws(()=>consumerPolicy(mutant));});
test('hosted shard flow is diagnostic only',()=>{
  const legacy=read('build.yml');
  assert.match(legacy.jobs['release-soak'].name,/^Diagnostic/);
  assert.equal(legacy.jobs['release-soak'].steps.find(s=>s.env?.SOAK_RESUME).env.SOAK_RESUME,'false');
  assert.match(legacy.jobs['release-soak-aggregate'].name,/not canonical c3/);
});
