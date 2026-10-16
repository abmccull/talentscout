// Permanent entry for the frozen actual-worker five-case calendar regression.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { dirname, basename, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const inside = (root, path) => {
  const value = relative(root, path);
  return value === '' || (!value.startsWith('..' + sep) && value !== '..' && !isAbsolute(value));
};
const canonical = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value;
const errorFact = error => ({ name: error.name, code: error.code ?? null,
  message: error.message, stack: error.stack ?? null });
async function json(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function absent(path) {
  try { await lstat(path); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
async function summaryIfPresent(path) {
  if (await absent(path)) return null;
  const stat = await lstat(path); assert(stat.isFile() && !stat.isSymbolicLink());
  assert(stat.size <= 8 * 1024 * 1024, 'Observer summary exceeds original diagnostic read bound');
  const raw = await readFile(path); assert.equal(raw.length, stat.size);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
}

async function main() {
  assert.equal(process.argv.length, 2, 'Use environment inputs; this entry takes no arguments');
  const requested = process.env.TALENTSCOUT_CALENDAR_GUARD_SOURCE
    ?? resolve(fileURLToPath(new URL('../', import.meta.url)));
  const configured = process.env.TALENTSCOUT_CALENDAR_GUARD_EVIDENCE;
  const fixtureRequested = process.env.TALENTSCOUT_CALENDAR_GUARD_FIXTURE_ROOT;
  const mode = process.env.TALENTSCOUT_CALENDAR_GUARD_MODE ?? 'candidate';
  assert(['baseline', 'candidate'].includes(mode), 'Unknown calendar regression mode');
  for (const value of [requested, configured, fixtureRequested]) assert(canonical(value),
    'Supply canonical absolute Source, fresh external evidence owner and short fixture root');
  const source = await realpath(requested), fixtureRoot = await realpath(fixtureRequested);
  assert.equal(source, requested); assert.equal(fixtureRoot, fixtureRequested);
  const packet = resolve(join(dirname(fileURLToPath(import.meta.url)), '../tests/release/fixtures/calendar-worker-guard'));
  const parent = await realpath(dirname(configured)); assert.equal(parent, dirname(configured));
  const owner = join(parent, basename(configured)); assert.equal(owner, configured);
  for (const path of [owner, fixtureRoot]) assert(!inside(source, path) && !inside(packet, path),
    'Keep all evidence and disposable worker directories outside Source/runtime inputs');
  assert((await lstat(fixtureRoot)).isDirectory());
  if (process.platform === 'win32') assert(fixtureRoot.length <= 65, 'Use short C:/ TEMP/fixture parent');
  assert(await absent(owner), 'Fresh retained evidence owner required');
  await mkdir(owner); // Exclusive outer ownership also retains bootstrap failures.
  const workerOwner = join(owner, 'worker'), inputPath = join(owner, 'ready-input.json');
  const attempt = { schemaVersion: 1, source, fixtureRoot, owner, workerOwner, mode,
    runtime: { path: process.execPath, version: process.version },
    entry: fileURLToPath(import.meta.url), productFaultFlagsAdded: false,
    nativeAcceptance: false, capacityAccepted: false, fullCareerAccepted: false, releaseAccepted: false };
  console.info('TALENTSCOUT_CALENDAR_GUARD_EVIDENCE ' + owner);
  let before, after, summary, failure, readCalendarWorkerSourcePins, runCalendarWorkerGuard;
  try {
    await json(join(owner, 'wiring-attempt.json'), attempt);
    assert.equal(await realpath(fileURLToPath(import.meta.url)), join(source, 'scripts/run-calendar-worker-guard-e2e.mjs'),
      'Actual executing wrapper must belong to the bound Source');
    assert.equal(await realpath(packet), packet);
    ({ readCalendarWorkerSourcePins, runCalendarWorkerGuard } = await import(
      '../tests/release/fixtures/calendar-worker-guard/observe-calendar-worker.mjs'));
    before = await readCalendarWorkerSourcePins(source);
    const input = { schemaVersion: 1, ready: true, mode, source, fixtureRoot,
      evidenceOwner: workerOwner, sourceInputs: before };
    await json(inputPath, input);
    await runCalendarWorkerGuard(inputPath); // Original coordinator, same PID, no extra child wrapper.
    summary = await summaryIfPresent(join(workerOwner, 'summary.json'));
    assert(summary, 'Original observer did not publish its actual summary');
    assert.equal(summary.status, 'PASSED'); assert.equal(summary.mode, mode);
    assert.deepEqual(summary.cases.map(row => [row.case, row.status]),
      ['C00', 'D01', 'F01', 'A01', 'A02'].map(id => [id, 'PASSED']));
  } catch (error) { failure = error; }
  try { summary ??= await summaryIfPresent(join(workerOwner, 'summary.json')); }
  catch (error) { failure ??= error; }
  try {
    if (readCalendarWorkerSourcePins) {
      after = await readCalendarWorkerSourcePins(source);
      if (before) assert.deepEqual(after, before, 'Actual Source/wrapper/calendar guard inputs changed');
    }
  } catch (error) { failure ??= error; }
  await json(join(owner, 'wiring-result.json'), { ...attempt,
    status: failure ? 'FAILED' : 'PASSED', error: failure ? errorFact(failure) : null,
    sourceBefore: before ?? null, sourceAfter: after ?? null,
    observerSummary: summary ? join(workerOwner, 'summary.json') : null,
    actualCases: summary?.cases?.map(row => [row.case, row.status]) ?? null,
    retainedWorkerArtifacts: summary?.cases?.map(row => ({ case: row.case, retained: row.retained })) ?? null });
  if (failure) throw failure;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
