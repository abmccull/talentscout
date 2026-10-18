import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { dirname, basename, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => { const value = relative(root, path); return value === '' || (!value.startsWith('..' + sep) && value !== '..' && !isAbsolute(value)); };
const canonical = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value;
const sourceNames = ['tests/release/longCareerReleaseGate.soak.ts',
  'tests/release/autonomousYouthCareerDriver.ts', 'vitest.release-soak.config.ts',
  'src/stores/gameStore.ts', 'src/engine/core/gameDate.ts', 'scripts/relay-child-output.mjs', 'package.json',
  'node_modules/vitest/dist/index.js', 'node_modules/vitest/vitest.mjs', 'node_modules/vitest/package.json',
  'tests/release/releaseCareerCalendar.ts', 'scripts/run-calendar-worker-guard-e2e.mjs'];
const candidateSourceNames = [...sourceNames, 'scripts/release-artifact-io.mjs', 'scripts/release-artifact-io-profile.json'];
const sourceInputNames = mode => mode === 'candidate' ? candidateSourceNames : sourceNames;
const packetNames = ['cases.json', 'calendarFault.setup.ts', 'calendarErrorWitness.reporter.mjs',
  'calendar-worker.config.mts', 'observe-calendar-worker.mjs'];
function keys(value, names) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...names].sort());
}
async function bytes(path, bound = 8 * 1024 * 1024) {
  const stat = await lstat(path); assert(stat.isFile() && !stat.isSymbolicLink());
  assert(stat.size <= bound, 'Input/artifact exceeds its diagnostic read bound');
  const raw = await readFile(path); assert.equal(raw.length, stat.size); return raw;
}
async function json(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
async function absent(path) { try { await lstat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } }
function decode(raw) { return new TextDecoder('utf-8', { fatal: true }).decode(raw); }
async function readJson(path) { return JSON.parse(decode(await bytes(path))); }
async function pins(root, names) {
  return Promise.all(names.map(async name => { const raw = await bytes(join(root, name)); return { path: name, bytes: raw.length, sha256: sha(raw) }; }));
}
export async function readCalendarWorkerSourcePins(source, mode = process.env.TALENTSCOUT_CALENDAR_GUARD_MODE ?? 'candidate') { return pins(source, sourceInputNames(mode)); }
const errorFact = error => ({ name: error.name, code: error.code ?? null, message: error.message, stack: error.stack ?? null });

async function runChild(source, directory, spec, catalog, createRelay) {
  const runId = randomUUID();
  const canonicalOutput = join(directory, 'seed-01-run.json');
  const progressPath = canonicalOutput + '.progress-' + runId + '.jsonl';
  const temporaryOutput = canonicalOutput + '.partial-' + process.pid + '-' + runId + '.json';
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, { PATH: dirname(process.execPath), HOME: join(directory, 'home'),
    USERPROFILE: join(directory, 'home'), TEMP: join(directory, 'temp'), TMP: join(directory, 'temp'),
    NO_COLOR: '1', CALENDAR_E2E_SOURCE: source, CALENDAR_E2E_DIRECTORY: directory, CALENDAR_E2E_CASE: spec.id,
    SOAK_SEEDS: '1', SOAK_SEED_START: '1', SOAK_SEASONS: '30', SOAK_WORKER_MODE: 'true',
    SOAK_DIAGNOSTIC_ONLY: 'false', SOAK_OUTPUT: temporaryOutput,
    SOAK_WORKER_PROGRESS_RUN_ID: runId, SOAK_WORKER_PROGRESS_PHASE: 'run',
    SOAK_WORKER_PROGRESS_OUTPUT: canonicalOutput, SOAK_WORKER_PROGRESS_PATH: progressPath,
    SOAK_WORKER_PROGRESS_DRIVER_PID: String(process.pid) });
  const argv = [...catalog.workerNodeArguments, join(source, 'node_modules/vitest/vitest.mjs'),
    'run', join(source, 'tests/release/longCareerReleaseGate.soak.ts'),
    '--config', join(here, 'calendar-worker.config.mts'), '--configLoader', 'runner'];
  const facts = { case: spec.id, executable: process.execPath, argv, cwd: directory, environment: env,
    runId, canonicalOutput, temporaryOutput, progressPath, spawnSeen: false, pid: null,
    exit: null, close: null, timeout: false, killRequests: [], errors: [] };
  const stdout = createWriteStream(join(directory, 'stdout.raw'), { flags: 'wx' });
  const stderr = createWriteStream(join(directory, 'stderr.raw'), { flags: 'wx' });
  const sinkErrors = [];
  for (const sink of [stdout, stderr]) sink.on('error', error => sinkErrors.push(errorFact(error)));
  const completedSinks = [finished(stdout).catch(error => sinkErrors.push(errorFact(error))),
    finished(stderr).catch(error => sinkErrors.push(errorFact(error)))];
  const relay = createRelay({ stdout, stderr, maxOutputBytes: catalog.rawOutputAllowanceBytes });
  let child;
  try { child = spawn(process.execPath, argv, { cwd: directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    stdout.end(); stderr.end(); await Promise.all(completedSinks); throw error;
  }
  facts.pid = child.pid ?? null;
  const stop = reason => {
    try { facts.killRequests.push({ reason, returned: child.kill() }); }
    catch (error) { facts.errors.push(errorFact(error)); }
  };
  const closed = new Promise(resolveClose => child.once('close', (code, signal) => { facts.close = { code, signal }; resolveClose(); }));
  child.once('spawn', () => { facts.spawnSeen = true; });
  child.once('exit', (code, signal) => { facts.exit = { code, signal }; });
  child.on('error', error => { facts.errors.push(errorFact(error)); stop('child-error'); });
  const timer = setTimeout(() => { facts.timeout = true; stop('diagnostic-deadline'); }, catalog.diagnosticCaseTimeoutMs);
  let outcome = null;
  try {
    // Immediate adoption; actual relay owns Buffer forwarding, not child lifetime.
    const ticket = relay.watch(child);
    try { outcome = await ticket.done; }
    catch (error) { facts.errors.push(errorFact(error)); outcome = error.outcome ?? null; }
  } catch (error) {
    facts.errors.push(errorFact(error)); stop('relay-adoption-error');
    child.stdout?.resume(); child.stderr?.resume();
  } finally {
    await closed; // A kill request/exit is never substituted for actual close.
    clearTimeout(timer);
    try { await relay.finish(); } catch (error) { facts.errors.push(errorFact(error)); }
    stdout.end(); stderr.end(); await Promise.all(completedSinks);
  }
  facts.outcome = outcome; facts.sinkErrors = sinkErrors;
  await json(join(directory, 'child-facts.json'), facts);
  try {
  assert(facts.spawnSeen && Number.isSafeInteger(facts.pid) && facts.pid > 0, 'Actual spawn required');
  assert(facts.close && facts.exit && !facts.timeout && facts.killRequests.length === 0);
  assert.equal(facts.errors.length, 0, JSON.stringify(facts.errors));
  assert.equal(sinkErrors.length, 0, JSON.stringify(sinkErrors));
  assert.equal(facts.close.code, 1, 'Original Vitest test must actually fail on sentinel/guard');
  assert.equal(facts.close.signal, null); assert.deepEqual(facts.exit, facts.close);
  assert(outcome && outcome.code === 1 && outcome.signal === null);
  for (const channel of ['stdout', 'stderr']) {
    const raw = await bytes(join(directory, channel + '.raw'));
    const stats = outcome.outputStats[channel];
    assert.equal(stats.observedBytes, raw.length); assert.equal(stats.handledBytes, raw.length);
    assert.equal(stats.observedSha256, sha(raw));
    assert.equal(stats.uncertainBytes, 0); assert.equal(stats.droppedBytes, 0);
  }
  } catch (error) { error.childFacts = facts; throw error; }
  return facts;
}

async function inspect(directory, spec, catalog, mode, facts) {
  const config = await readJson(join(directory, 'config-facts.json'));
  assert.equal(config.pid, facts.pid); assert.equal(config.configLoader, 'runner');
  assert.equal(config.source, facts.environment.CALENDAR_E2E_SOURCE); assert.equal(config.directory, directory);
  assert.deepEqual(config.originalInclude, ['tests/release/**/*.soak.ts']);
  assert.deepEqual(config.originalExecArgv, catalog.workerNodeArguments);
  assert.equal(config.originalMaxWorkers, 1); assert.equal(config.originalHookTimeout, 120000);
  assert.equal(config.originalTestTimeout, 5 * 60 * 60 * 1000);
  assert.equal(config.cacheDir, join(directory, 'vite-cache'));
  assert.equal(config.report, join(directory, 'vitest-report.json'));
  assert.equal(config.setup, join(here, 'calendarFault.setup.ts'));
  assert.equal(config.vitestEntry, join(facts.environment.CALENDAR_E2E_SOURCE, 'node_modules/vitest/dist/index.js'));
  assert.equal(config.driverEntry, join(facts.environment.CALENDAR_E2E_SOURCE, 'tests/release/autonomousYouthCareerDriver.ts'));
  assert.equal(config.errorReporter, join(here, 'calendarErrorWitness.reporter.mjs'));
  const journalRaw = decode(await bytes(join(directory, 'setup-driver.jsonl')));
  assert(journalRaw.endsWith('\n') && !journalRaw.includes('\r'));
  const journal = journalRaw.slice(0, -1).split('\n').map(row => JSON.parse(row));
  assert(journal.length > 0 && journal.length <= 32);
  const workerPid = journal[0].pid;
  assert(Number.isSafeInteger(workerPid) && workerPid > 0 && workerPid !== facts.pid);
  journal.forEach((row, index) => {
    assert.equal(row.schemaVersion, 1); assert.equal(row.case, spec.id); assert.equal(row.seq, index + 1);
    assert.equal(row.pid, workerPid); assert.equal(row.ppid, facts.pid);
  });
  const rows = event => journal.filter(row => row.event === event);
  assert.equal(rows('setup-ready').length, 1); assert.equal(journal[0].event, 'setup-ready');
  assert.equal(rows('setup-ready')[0].gcType, 'function');
  assert.equal(rows('setup-ready')[0].v8HeapLimitBytes, 1536 * 1024 * 1024);
  for (const flag of catalog.workerNodeArguments) assert.equal(rows('setup-ready')[0].execArgv.filter(value => value === flag).length, 1);
  const starts = rows('start-attempt'); assert.equal(starts.length, 1);
  assert.equal(starts[0].selectedScenarioId, null);
  assert.deepEqual(starts[0].config.selectedCountries, ['england']);
  assert.equal(starts[0].config.openingMode, 'desk'); assert.equal(starts[0].config.worldSeed, 'release-soak-01');
  const initialRows = rows('real-start-return'); assert.equal(initialRows.length, 1);
  const initial = initialRows[0].snapshot;
  for (const key of ['season', 'week', 'totalWeeksPlayed', 'seasonLength', 'leagueCount', 'clubCount']) assert.equal(initial[key], catalog.fresh[key], key);
  assert.deepEqual(initial.englandLeagues.map(row => [row.id, row.clubCount]), catalog.fresh.englandLeagues);
  assert(initial.englandLeagues.every(row => row.uniqueClubCount === row.clubCount));
  assert.equal(rows('start-wrapper-return').length, 1);
  const expected = spec[mode], guardExpected = mode === 'candidate' && spec.fault !== 'none';
  const attempts = rows('drive-attempt'), real = rows('real-drive-return');
  assert.equal(attempts.length, expected.attempts); assert.equal(real.length, spec.realDrives);
  assert.deepEqual(attempts.map(row => row.attempt), Array.from({ length: expected.attempts }, (_, index) => index + 1));
  real.forEach((row, index) => {
    assert.equal(row.realReturn, index + 1); assert.equal(row.snapshot.season, 1);
    assert.equal(row.snapshot.week, index + 2); assert.equal(row.snapshot.totalWeeksPlayed, index + 1);
    assert.equal(row.snapshot.seasonLength, 46);
    for (const key of ['stabilizationMs', 'schedulingMs', 'simulationMs', 'totalMs']) assert(Number.isFinite(row.timing[key]) && row.timing[key] >= 0);
  });
  assert.equal(rows('drive-wrapper-return').length, spec.realDrives);
  const mutations = rows('fault-applied'); assert.equal(mutations.length, spec.fault === 'none' ? 0 : 1);
  if (mutations.length) {
    const mutation = mutations[0]; assert.equal(mutation.fault, spec.fault); assert.equal(mutation.phase, spec.phase);
    if (spec.fault === 'backwards-week') {
      assert.deepEqual(mutation.target, { field: 'currentWeek', before: 3, after: 1 });
      assert.equal(mutation.before.week, 3); assert.equal(mutation.after.week, 1);
      assert.equal(mutation.after.totalWeeksPlayed, 2);
    } else if (spec.fault === 'fixture-week-47') {
      assert.equal(mutation.target.field, 'fixture.week'); assert.equal(mutation.target.before, 46);
      assert.equal(mutation.target.after, 47); assert.equal(mutation.target.season, 1);
      assert.equal(mutation.target.leagueId, 'league-championship'); assert.equal(mutation.target.played, false);
      assert.equal(typeof mutation.target.id, 'string'); assert(mutation.target.id.length > 0);
      assert.equal(mutation.before.seasonLength, 46); assert.equal(mutation.after.seasonLength, 47);
    } else {
      assert.equal(mutation.target.field, 'league.clubIds'); assert.equal(mutation.target.id, 'league-championship');
      assert.equal(mutation.target.before, 24); assert.equal(mutation.target.after, 25); assert.equal(mutation.target.uniqueAfter, 24);
      const changed = mutation.after.englandLeagues.find(row => row.id === 'league-championship');
      assert.equal(changed.clubCount, 25); assert.equal(changed.uniqueClubCount, 24);
    }
    const lastReturn = spec.phase === 'fresh' ? initialRows[0] : real.at(-1);
    const wrapperReturn = spec.phase === 'fresh' ? rows('start-wrapper-return')[0] : rows('drive-wrapper-return').at(-1);
    assert(lastReturn.seq < mutation.seq && mutation.seq < wrapperReturn.seq);
  }
  assert.equal(rows('bound-stop').length, guardExpected ? 0 : 1);
  if (!guardExpected) {
    assert.equal(rows('bound-stop')[0].attempt, expected.attempts);
    assert.equal(rows('bound-stop')[0].realReturns, spec.realDrives);
  }
  const sequence = ['setup-ready', 'start-attempt', 'real-start-return'];
  if (spec.phase === 'fresh') sequence.push('fault-applied');
  sequence.push('start-wrapper-return');
  for (let index = 0; index < spec.realDrives; index += 1) {
    sequence.push('drive-attempt', 'real-drive-return');
    if (spec.phase === 'post' && spec.fault !== 'none' && index === spec.realDrives - 1) sequence.push('fault-applied');
    sequence.push('drive-wrapper-return');
  }
  if (!guardExpected) sequence.push('drive-attempt', 'bound-stop');
  assert.deepEqual(journal.map(row => row.event), sequence);
  let progress = [];
  if (await absent(facts.progressPath)) assert.equal(expected.progress.length, 0, 'Missing required actual progress');
  else {
    const raw = decode(await bytes(facts.progressPath)); assert(raw.endsWith('\n') && !raw.includes('\r'));
    progress = raw.slice(0, -1).split('\n').map(row => JSON.parse(row));
  }
  assert.deepEqual(progress.map(row => [row.event, row.season, row.week, row.completedCanonicalTicks]), expected.progress);
  let started;
  for (const row of progress) {
    assert.equal(row.schemaVersion, 1); assert.equal(row.evidenceKind, 'long-career-release-worker-progress-v1');
    assert.equal(row.workerRunId, facts.runId); assert.equal(row.phase, 'run'); assert.equal(row.seedIndex, 1);
    assert.equal(row.seed, 'release-soak-01'); assert.equal(row.driverPid, process.pid);
    assert.equal(row.workerPid, workerPid); assert.equal(row.vitestPid, facts.pid);
    assert.equal(row.canonicalOutput, facts.canonicalOutput); assert.equal(row.temporaryOutput, facts.temporaryOutput);
    assert.equal(row.progressPath, facts.progressPath); assert.equal(row.calendarWeeksSpanned, row.completedCanonicalTicks);
    assert.equal(row.digest, null); assert.equal(new Date(row.recordedAtUtc).toISOString(), row.recordedAtUtc);
    started ??= row.workerStartedAtUtc; assert.equal(row.workerStartedAtUtc, started);
  }
  assert(await absent(facts.canonicalOutput)); assert(await absent(facts.temporaryOutput));
  const report = await readJson(join(directory, 'vitest-report.json'));
  assert.equal(report.testResults.length, 1);
  assert.equal(report.testResults[0].message, '', 'Unexpected file/hook error');
  assert.equal(resolve(report.testResults[0].name), join(facts.environment.CALENDAR_E2E_SOURCE, 'tests/release/longCareerReleaseGate.soak.ts'));
  const assertions = report.testResults.flatMap(suite => suite.assertionResults ?? []);
  const failed = assertions.filter(row => row.status === 'failed');
  assert.equal(report.success, false); assert.equal(report.numFailedTests, 1); assert.equal(failed.length, 1);
  assert.equal(assertions.length, 2); assert.equal(assertions.filter(row => row.status === 'skipped').length, 1);
  assert.equal(failed[0].fullName,
    'full canonical-week release soak keeps seeded careers coherent, bounded, serializable, and deterministic');
  assert(Array.isArray(failed[0].failureMessages) && failed[0].failureMessages.length > 0);
  const messages = failed[0].failureMessages.join('\n');
  assert(messages.includes(guardExpected ? catalog.guardMarker : catalog.boundMarker + spec.id));
  assert(!messages.includes(guardExpected ? catalog.boundMarker : catalog.guardMarker));
  assert(!messages.includes('TEST_CALENDAR_SETUP_ORACLE'));
  const witness = await readJson(join(directory, 'run-end-errors.json'));
  keys(witness, ['schemaVersion', 'event', 'case', 'pid', 'directory', 'reporter', 'reason', 'unhandledErrors', 'modules']);
  assert.equal(witness.schemaVersion, 1); assert.equal(witness.event, 'onTestRunEnd');
  assert.equal(witness.case, spec.id); assert.equal(witness.pid, facts.pid);
  assert.equal(witness.directory, directory); assert.equal(witness.reporter, config.errorReporter);
  assert.equal(witness.reason, 'failed'); assert.deepEqual(witness.unhandledErrors, []);
  assert(Array.isArray(witness.modules)); assert.equal(witness.modules.length, 1);
  const module = witness.modules[0];
  assert.equal(module.type, 'module'); assert.equal(resolve(module.moduleId), resolve(report.testResults[0].name));
  assert.deepEqual(module.errors, []); assert(Array.isArray(module.suites)); assert.equal(module.suites.length, 1);
  const suite = module.suites[0]; assert.equal(suite.type, 'suite');
  assert.equal(suite.name, 'full canonical-week release soak'); assert.equal(suite.fullName, suite.name);
  assert.deepEqual(suite.errors, []); assert(Array.isArray(module.tests)); assert.equal(module.tests.length, 2);
  const failedTests = module.tests.filter(row => row.state === 'failed');
  const skippedTests = module.tests.filter(row => row.state === 'skipped');
  assert.equal(failedTests.length, 1); assert.equal(skippedTests.length, 1);
  for (const test of module.tests) {
    assert.equal(test.type, 'test'); assert.equal(typeof test.errorsWereUndefined, 'boolean');
    assert.equal(test.fullName, suite.fullName + ' > ' + test.name); assert(Array.isArray(test.errors));
  }
  assert.equal(failedTests[0].name, failed[0].title);
  assert.equal(failedTests[0].errorsWereUndefined, false); assert.equal(failedTests[0].errors.length, 1);
  assert.deepEqual(skippedTests[0].errors, []);
  assert.equal(failed[0].failureMessages.length, 1);
  const actualError = failedTests[0].errors[0];
  assert(actualError && typeof actualError === 'object');
  const actualMessage = actualError.stack || actualError.message;
  assert.equal(actualMessage, failed[0].failureMessages[0]);
  assert.equal(typeof actualError.message, 'string');
  assert(actualError.message.includes(guardExpected ? catalog.guardMarker : catalog.boundMarker + spec.id));
  assert(!actualError.message.includes(guardExpected ? catalog.boundMarker : catalog.guardMarker));
  return { guardExpected, actualAttempts: attempts.length, actualRealReturns: real.length,
    progress: expected.progress, workerPid, assertionFailure: messages };
}

async function retain(directory, destination, facts) {
  const names = ['stdout.raw', 'stderr.raw', 'child-facts.json', 'config-facts.json',
    'setup-driver.jsonl', 'vitest-report.json', 'run-end-errors.json'];
  if (facts?.progressPath) names.push(basename(facts.progressPath));
  const retained = [];
  for (const name of names) {
    const path = join(directory, name); if (await absent(path)) { retained.push({ name, original: path, absent: true }); continue; }
    const raw = await bytes(path); await writeFile(join(destination, name), raw, { flag: 'wx' });
    retained.push({ name, original: path, bytes: raw.length, sha256: sha(raw) });
  }
  return retained;
}

export async function runCalendarWorkerGuard(inputPath) {
  assert(canonical(inputPath));
  const inputRaw = await bytes(inputPath, 128 * 1024), input = JSON.parse(decode(inputRaw));
  keys(input, ['schemaVersion', 'ready', 'mode', 'source', 'fixtureRoot', 'evidenceOwner', 'sourceInputs']);
  assert.equal(input.schemaVersion, 1); assert.equal(input.ready, true); assert(['baseline', 'candidate'].includes(input.mode));
  const sourceNames = sourceInputNames(input.mode);
  for (const path of [input.source, input.fixtureRoot, input.evidenceOwner]) assert(canonical(path));
  const source = await realpath(input.source), fixtureRoot = await realpath(input.fixtureRoot);
  assert.equal(source, input.source); assert.equal(fixtureRoot, input.fixtureRoot);
  const parent = await realpath(dirname(input.evidenceOwner)); assert.equal(parent, dirname(input.evidenceOwner));
  for (const path of [input.evidenceOwner, fixtureRoot]) assert(!inside(source, path) && !inside(here, path));
  if (process.platform === 'win32') assert(fixtureRoot.length <= 65, 'Use a short external fixture parent');
  assert(Array.isArray(input.sourceInputs));
  assert.deepEqual(input.sourceInputs.map(row => row.path), sourceNames);
  input.sourceInputs.forEach(row => { keys(row, ['path', 'bytes', 'sha256']);
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0); assert.match(row.sha256, /^[a-f0-9]{64}$/); });
  const sourceBefore = await pins(source, sourceNames); assert.deepEqual(sourceBefore, input.sourceInputs);
  const packetBefore = await pins(here, packetNames);
  const catalog = await readJson(join(here, 'cases.json'));
  assert.equal(catalog.schemaVersion, 1); assert.deepEqual(catalog.cases.map(row => row.id), ['C00', 'D01', 'F01', 'A01', 'A02']);
  const { createWorkerOutputRelay } = await import(pathToFileURL(join(source, 'scripts/relay-child-output.mjs')).href);
  await mkdir(input.evidenceOwner); // Positive exclusive owner acquisition before any retained writes.
  const owner = input.evidenceOwner, results = [];
  let failure;
  try {
    await writeFile(join(owner, 'request.json'), inputRaw, { flag: 'wx' });
    for (const spec of catalog.cases) {
      const directory = await mkdtemp(join(fixtureRoot, 'cw-' + spec.id + '-'));
      for (const child of ['home', 'temp']) await mkdir(join(directory, child));
      const destination = join(owner, spec.id); await mkdir(destination);
      let facts, observation, caseFailure;
      try {
        facts = await runChild(source, directory, spec, catalog, createWorkerOutputRelay);
        observation = await inspect(directory, spec, catalog, input.mode, facts);
      } catch (error) { facts ??= error.childFacts; caseFailure = error; }
      const retained = await retain(directory, destination, facts);
      const result = { case: spec.id, mode: input.mode, status: caseFailure ? 'FAILED' : 'PASSED',
        fixture: directory, error: caseFailure ? errorFact(caseFailure) : null,
        observation: observation ?? null, retained, nativeAcceptance: false,
        capacityAccepted: false, fullCareerAccepted: false, releaseAccepted: false };
      await json(join(destination, 'result.json'), result); results.push(result);
      if (caseFailure) throw caseFailure; // No restart or later launches after a failed diagnostic.
    }
  } catch (error) { failure = error; }
  let sourceAfter, packetAfter;
  try {
    sourceAfter = await pins(source, sourceNames); packetAfter = await pins(here, packetNames);
    assert.deepEqual(sourceAfter, sourceBefore); assert.deepEqual(packetAfter, packetBefore);
    assert.equal(sha(await bytes(inputPath, 128 * 1024)), sha(inputRaw), 'Ready input changed');
  } catch (error) { failure ??= error; }
  await json(join(owner, 'summary.json'), { schemaVersion: 1, mode: input.mode,
    status: failure ? 'FAILED' : 'PASSED', error: failure ? errorFact(failure) : null,
    input: { path: inputPath, bytes: inputRaw.length, sha256: sha(inputRaw) },
    sourceBefore, sourceAfter: sourceAfter ?? null, packetBefore, packetAfter: packetAfter ?? null,
    cases: results, sourceEdited: false, nativeAcceptance: false,
    capacityAccepted: false, fullCareerAccepted: false, releaseAccepted: false });
  if (failure) throw failure;
  console.info('CALENDAR_WORKER_GUARD_E2E ' + JSON.stringify({ owner, mode: input.mode, cases: results.length, acceptedCampaign: false }));
}
const requestedEntry = process.argv[1] ? await realpath(resolve(process.argv[1])) : null;
if (requestedEntry === await realpath(fileURLToPath(import.meta.url))) {
  assert.equal(process.argv.length, 3, 'Usage: node observe-calendar-worker.mjs <ready-input.json>');
  runCalendarWorkerGuard(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
