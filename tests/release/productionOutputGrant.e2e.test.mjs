// Tests first. Real full runner/relay, processes, raw files and disposable Git.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, realpath, lstat } from 'node:fs/promises';
import { dirname, basename, join, resolve, relative, isAbsolute, sep, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
if (process.env.TALENTSCOUT_OUTPUT_GRANT_SOURCE !== undefined) {
  assert(isAbsolute(process.env.TALENTSCOUT_OUTPUT_GRANT_SOURCE)
    && resolve(process.env.TALENTSCOUT_OUTPUT_GRANT_SOURCE) === process.env.TALENTSCOUT_OUTPUT_GRANT_SOURCE,
  'Explicit Source must be canonical and absolute');
}
const source = resolve(process.env.TALENTSCOUT_OUTPUT_GRANT_SOURCE ?? fileURLToPath(new URL('../../', import.meta.url)));
const mode = process.env.TALENTSCOUT_OUTPUT_GRANT_MODE ?? 'candidate';
assert(['baseline', 'candidate'].includes(mode));
const runner = join(source, 'scripts/run-long-career-release-soak.mjs');
const relay = join(source, 'scripts/relay-child-output.mjs');
const gitExecutable = process.env.TALENTSCOUT_OUTPUT_GRANT_GIT ?? (process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git');
assert(isAbsolute(gitExecutable), 'Use the actual absolute Git executable');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => { const r = relative(root, file); return r === '' || (!r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r)); };
let owner, fixtureParent, cases, inputs;
const results = [];
const inputPaths = [fileURLToPath(import.meta.url), join(here, 'fixtures/production-output-grant-cases.json'), runner, relay, join(dirname(runner), 'release-calendar-receipt.mjs'),
  ...(mode === 'candidate' ? [join(dirname(runner), 'release-artifact-io.mjs'),
    join(dirname(runner), 'release-artifact-io-profile.json')] : [])];
async function inputPins() {
  return Promise.all(inputPaths.map(async path => { const bytes = await readFile(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; }));
}
async function absent(path) { try { await lstat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } }
async function json(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
before(async () => {
  cases = JSON.parse(await readFile(join(here, 'fixtures/production-output-grant-cases.json'), 'utf8'));
  assert.equal(cases.schemaVersion, 1);
  assert.deepEqual(cases.modes, ['baseline', 'candidate']);
  assert.equal(cases.invalidText.length, 14);
  const configured = process.env.TALENTSCOUT_OUTPUT_GRANT_EVIDENCE;
  assert(configured && isAbsolute(configured) && resolve(configured) === configured, 'Root must supply a fresh canonical retained evidence owner');
  const parent = await realpath(dirname(configured));
  owner = join(parent, basename(configured));
  const actualSource = await realpath(source), actualHere = await realpath(here);
  assert(!inside(actualSource, owner) && !inside(actualHere, owner), 'Evidence must be outside Source and frozen tests');
  fixtureParent = await realpath(resolve(process.env.TALENTSCOUT_OUTPUT_GRANT_FIXTURE_ROOT ?? tmpdir()));
  assert(!inside(actualSource, fixtureParent) && !inside(actualHere, fixtureParent), 'Disposable Git fixtures must be outside Source/frozen inputs');
  if (process.platform === 'win32') assert(fixtureParent.length <= 80, 'Root must supply short C:/ TEMP/fixture root');
  await mkdir(owner); // Exclusive; retain all previous attempts.
  inputs = await inputPins();
  await json(join(owner, 'inputs.json'), { mode, source, runner, relay, gitExecutable, fixtureParent, inputs });
  console.info('TALENTSCOUT_OUTPUT_GRANT_EVIDENCE ' + owner);
});
after(async () => {
  if (!owner) return;
  const finalInputs = await inputPins();
  assert.deepEqual(finalInputs, inputs, 'Actual full test/runner/relay inputs changed');
  const files = [];
  async function inventory(dir, prefix = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name), name = prefix ? prefix + '/' + item.name : item.name;
      const stat = await lstat(path); assert(!stat.isSymbolicLink());
      if (stat.isDirectory()) await inventory(path, name);
      else { assert(stat.isFile()); const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) }); }
    }
  }
  await inventory(owner);
  await json(join(owner, 'manifest.json'), { mode, source, inputs, cases: results, files,
    nativeAcceptance: false, capacityAccepted: false, fullCareerAccepted: false, releaseAccepted: false });
});
function environment(context) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, PATH: [dirname(process.execPath), dirname(gitExecutable)].join(delimiter),
    HOME: context.home, USERPROFILE: context.home, TEMP: context.home, TMP: context.home,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: context.gitConfig,
    GIT_CONFIG_SYSTEM: context.gitConfig, GIT_TERMINAL_PROMPT: '0',
    GIT_CEILING_DIRECTORIES: context.fixture, GIT_DISCOVERY_ACROSS_FILESYSTEM: '0' };
}
function git(context, cwd, ...args) {
  const stdout = execFileSync(gitExecutable, args, { cwd, env: environment(context), encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], timeout: cases.diagnosticChildTimeoutMs });
  context.git.push({ cwd, argv: args, stdout });
  return stdout.trim();
}
async function realGit(context) {
  const cwd = join(context.fixture, 'repo'); await mkdir(cwd);
  await writeFile(join(cwd, 'source-marker.txt'), 'Real disposable runner plan fixture only.\n', { flag: 'wx' });
  git(context, cwd, 'init', '--quiet', '--template=' + context.emptyTemplate);
  git(context, cwd, 'config', '--local', 'user.name', 'Output Grant Fixture');
  git(context, cwd, 'config', '--local', 'user.email', 'output-grant@example.invalid');
  git(context, cwd, 'add', 'source-marker.txt'); git(context, cwd, 'commit', '--quiet', '-m', 'fixture');
  const commit = git(context, cwd, 'rev-parse', 'HEAD'), tree = git(context, cwd, 'rev-parse', 'HEAD^{tree}');
  assert.match(commit, /^[a-f0-9]{40,64}$/); assert.match(tree, /^[a-f0-9]{40,64}$/);
  assert.equal(git(context, cwd, 'status', '--porcelain', '--untracked-files=all'), '');
  context.repo = { cwd, commit, tree }; return context.repo;
}
async function invoke(context, name, cwd, grant) {
  const env = { ...environment(context), SOAK_SEEDS: '20', SOAK_SEASONS: '30', SOAK_CONCURRENCY: '3',
    SOAK_PLAN_ONLY: 'true', SOAK_RESUME: 'false',
    SOAK_OUTPUT: context.output, SOAK_WORKER_DIRECTORY: context.workers };
  if (grant !== undefined) env.SOAK_MAX_OUTPUT_BYTES = grant;
  const stdout = [], stderr = [];
  const facts = { name, cwd, executable: process.execPath, argv: [runner], environment: env,
    close: null, error: null, streamError: null, timeout: false, overflow: false, killRequests: [] };
  const child = spawn(process.execPath, [runner], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  facts.pid = child.pid ?? null; facts.spawnSeen = false;
  child.once('spawn', () => { facts.spawnSeen = true; });
  const stop = reason => { try { facts.killRequests.push({ reason, returned: child.kill() }); } catch (error) { facts.killRequests.push({ reason, error: error.message }); } };
  const closed = new Promise(resolveClose => child.once('close', (code, signal) => { facts.close = { code, signal }; resolveClose(); }));
  child.on('error', error => { facts.error = { code: error.code, message: error.message }; });
  for (const [channel, target] of [['stdout', stdout], ['stderr', stderr]]) {
    let count = 0;
    child[channel]?.on('data', bytes => {
      count += bytes.length; facts[channel + 'ObservedBytes'] = count;
      if (count <= cases.rawBytesPerStream) target.push(Buffer.from(bytes));
      else { facts.overflow = true; stop('raw-output-bound'); }
    });
    child[channel]?.on('error', error => { facts.streamError = error.message; stop('pipe-error'); });
  }
  const timer = setTimeout(() => { facts.timeout = true; stop('diagnostic-deadline'); }, cases.diagnosticChildTimeoutMs);
  await closed; clearTimeout(timer); // Never substitute a kill request for actual close.
  const out = Buffer.concat(stdout), err = Buffer.concat(stderr);
  await writeFile(join(context.directory, name + '.stdout.raw'), out, { flag: 'wx' });
  await writeFile(join(context.directory, name + '.stderr.raw'), err, { flag: 'wx' });
  facts.stdout = { bytes: out.length, sha256: sha(out) }; facts.stderr = { bytes: err.length, sha256: sha(err) };
  context.invocations.push(facts);
  assert(facts.close && !facts.error && !facts.streamError && !facts.timeout && !facts.overflow, 'Transport/timeout is never an expected grant result');
  assert(facts.spawnSeen && Number.isSafeInteger(facts.pid) && facts.pid > 0, 'Actual runner spawn identity required');
  assert.equal(facts.close.signal, null);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return { facts, out, err, stdout: decoder.decode(out), stderr: decoder.decode(err) };
}
async function noPublication(context) {
  assert(await absent(context.output), 'Plan-only must not publish a summary');
  assert(await absent(context.workers), 'Plan-only must not launch/publish worker/checkpoint state');
  if (context.repo) assert.equal(git(context, context.repo.cwd, 'status', '--porcelain', '--untracked-files=all'), '');
}
function plan(result, repo) {
  assert.equal(result.facts.close.code, 0, result.stderr); assert.equal(result.err.length, 0);
  const lines = result.stdout.split('\n'); assert.equal(lines.length, 2); assert.equal(lines[1], '');
  assert(lines[0].startsWith('SOAK_RELEASE_PLAN '));
  const value = JSON.parse(lines[0].slice('SOAK_RELEASE_PLAN '.length));
  assert.equal(value.evidenceKind, 'long-career-release-soak-plan');
  assert.equal(value.sourceTreeClean, true); assert.equal(value.resumeEnabled, false);
  assert.equal(value.executionIdentity.candidateCommitSha, repo.commit);
  assert.equal(value.executionIdentity.candidateTreeSha, repo.tree);
  assert.equal(value.executionIdentity.seedCount, 20); assert.equal(value.executionIdentity.seasonCount, 30);
  assert.equal(value.executionIdentity.concurrency, 3);
  assert.equal(value.executionIdentity.maxSerializedBytes, 80 * 1024 * 1024);
  assert.equal(value.executionIdentity.workerHeapLimitBytes, 1536 * 1024 * 1024);
  assert.deepEqual(value.executionIdentity.workerNodeArguments,
    ['--max-old-space-size=1440', '--max-semi-space-size=32', '--expose-gc']);
  assert.equal(value.determinismReplayRequired, true);
  assert.deepEqual(value.reusableSeedIndices, []);
  assert.deepEqual(value.pendingSeedIndices, Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(value.executionIdentityHash, sha(JSON.stringify(value.executionIdentity)));
  return value;
}
function e2e(name, exercise) {
  test(name, { timeout: 30000, concurrency: false }, async t => {
    const directory = join(owner, name.split(' ')[0]); await mkdir(directory);
    const fixture = join(fixtureParent, 'og-' + randomUUID().slice(0, 8)); await mkdir(fixture);
    const context = { directory, fixture, home: join(fixture, 'home'), gitConfig: join(fixture, 'empty-gitconfig'), emptyTemplate: join(fixture, 'empty-template'),
      output: join(fixture, 'summary.json'), workers: join(fixture, 'workers'), invocations: [], git: [] };
    await mkdir(context.home); await mkdir(context.emptyTemplate); await writeFile(context.gitConfig, '', { flag: 'wx' });
    let failure;
    t.after(async () => {
      if (t.signal.aborted) failure ??= new Error('Diagnostic test timeout');
      const result = { case: name, status: failure ? 'FAILED' : 'PASSED', fixture,
        error: failure ? { message: failure.message } : null, repo: context.repo ?? null,
        invocations: context.invocations, git: context.git,
        workerDirectoryAbsent: await absent(context.workers), summaryAbsent: await absent(context.output),
        nativeAcceptance: false, capacityAccepted: false, fullCareerAccepted: false, releaseAccepted: false };
      await json(join(directory, 'result.json'), result); results.push({ case: name, status: result.status });
    });
    try { await exercise(context); } catch (error) { failure = error; throw error; }
  });
}
if (mode === 'baseline') {
  e2e('B0-ignored actual plan bytes exceed requested one-byte grant', async context => {
    const repo = await realGit(context), result = await invoke(context, 'ignored-one', repo.cwd, '1');
    const actualPlan = plan(result, repo); assert(result.out.length > 1);
    await noPublication(context);
    await json(join(context.directory, 'baseline-observation.json'), { expectedDefectObserved: true,
      requestedGrant: 1, actualStdoutBytes: result.out.length, actualPlan,
      productionGrantAccepted: false, capacityAccepted: false, fullCareerAccepted: false });
  });
} else {
  e2e('C01-identity default equal different and safe-ceiling grants', async context => {
    const repo = await realGit(context), observed = [];
    const selections = [undefined, String(cases.defaultMaxOutputBytes), String(cases.differentMaxOutputBytes), cases.safeCeilingText];
    for (let index = 0; index < selections.length; index += 1) {
      const result = await invoke(context, 'identity-' + index, repo.cwd, selections[index]);
      const actual = plan(result, repo), expected = index < 2 ? cases.defaultMaxOutputBytes : index === 2 ? cases.differentMaxOutputBytes : Number.MAX_SAFE_INTEGER;
      assert.equal(actual.executionIdentity.maxOutputBytes, expected); assert(result.out.length <= expected);
      observed.push(actual); await noPublication(context);
    }
    assert.deepEqual(observed[0].executionIdentity, observed[1].executionIdentity);
    assert.equal(observed[0].executionIdentityHash, observed[1].executionIdentityHash);
    const withoutGrant = value => { const result = { ...value }; delete result.maxOutputBytes; return result; };
    for (const actual of observed.slice(2)) {
      assert.deepEqual(withoutGrant(actual.executionIdentity), withoutGrant(observed[0].executionIdentity));
      assert.notEqual(actual.executionIdentityHash, observed[0].executionIdentityHash);
    }
  });
  e2e('C02-invalid canonical text refuses before Git or publication', async context => {
    const cwd = join(context.fixture, 'nongit'); await mkdir(cwd); assert(await absent(join(cwd, '.git')));
    for (const [name, value] of cases.invalidText) {
      const result = await invoke(context, 'invalid-' + name, cwd, value);
      assert.equal(result.facts.close.code, 1); assert.equal(result.out.length, 0);
      assert.match(result.stderr, /SOAK_MAX_OUTPUT_BYTES/);
      assert.doesNotMatch(result.stderr, /not a git repository|Command failed:.*git|ERR_MODULE_NOT_FOUND|SyntaxError/);
      await noPublication(context);
    }
  });
  e2e('C03-one-byte actual relay refuses whole plan before publication', async context => {
    const repo = await realGit(context), result = await invoke(context, 'refused-one', repo.cwd, '1');
    assert.equal(result.facts.close.code, 1); assert.equal(result.out.length, 0);
    assert.match(result.stderr, /ERR_WORKER_OUTPUT_QUOTA/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|not a git repository/);
    await noPublication(context);
  });
}
