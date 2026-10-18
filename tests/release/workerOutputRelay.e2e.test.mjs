// Tests-first real-child/real-file contract; authored before the relay.
// Root contract: ROOT-WORKER-OUTPUT-IMPLEMENTATION-CONTRACT-v1.md.
// No game, network, Git, package lifecycle, deletion or unknown-owner kill.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, basename, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requestedSource = process.env.TALENTSCOUT_WORKER_OUTPUT_SOURCE;
if (requestedSource !== undefined) assert(requestedSource && resolve(requestedSource) === requestedSource,
  'Explicit test Source must be an absolute canonical path');
const source = requestedSource ?? resolve(fileURLToPath(new URL('../../', import.meta.url)));
const quotaMode = process.env.TALENTSCOUT_WORKER_OUTPUT_QUOTA_MODE ?? 'candidate';
assert(['baseline', 'candidate'].includes(quotaMode), 'Explicit baseline/candidate quota mode required');
const quotaDataPath = fileURLToPath(new URL('./fixtures/worker-output-quota-cases.json', import.meta.url));
let quotaCases;
const fixturePath = fileURLToPath(new URL('./fixtures/worker-output-child.mjs', import.meta.url));
const relayURL = pathToFileURL(join(source, 'scripts/relay-child-output.mjs'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let owner, createWorkerOutputRelay, importFailure;
const caseResults = [];
const text = value => Buffer.from(value, 'utf8');
const within = (child, parent) => child.toLowerCase() === parent.toLowerCase()
  || child.toLowerCase().startsWith(parent.toLowerCase() + sep);
const deferred = () => {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue; rejectPromise = rejectValue;
  });
  promise.catch(() => {});
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

before(async () => {
  quotaCases = JSON.parse(await readFile(quotaDataPath, 'utf8'));
  assert.equal(quotaCases.schemaVersion, 1);
  assert.deepEqual(quotaCases.modes, ['baseline', 'candidate']);
  assert.equal(quotaCases.diagnosticControls.caseTimeoutMs, 30000);
  assert.equal(quotaCases.diagnosticControls.maxNewConcurrentChildren, 3);
  assert.equal(quotaCases.diagnosticControls.maxNewRecipeBytesPerChannel, 64);
  assert.equal(text(quotaCases.marker.text + '\n').toString('hex'), quotaCases.marker.utf8WithLfHex);
  assert.equal(text(quotaCases.marker.text + '\n').length, quotaCases.marker.bytes);
  const configured = process.env.TALENTSCOUT_WORKER_OUTPUT_EVIDENCE;
  if (configured !== undefined) {
    assert(configured && resolve(configured) === configured, 'Explicit evidence owner must be absolute/canonical');
    const parent = await realpath(dirname(configured));
    const actualSource = await realpath(source);
    assert(!within(join(parent, basename(configured)), actualSource),
      'Explicit retained owner must be outside Source');
    owner = join(parent, basename(configured));
  } else {
    const parent = join(source, 'artifacts/release/generated');
    await mkdir(parent, { recursive: true });
    owner = join(parent, 'worker-output-relay-e2e-' + randomUUID());
  }
  await mkdir(owner); // Exclusive: preserve every prior owner.
  console.info('TALENTSCOUT_WORKER_OUTPUT_EVIDENCE ' + owner);
  const inputs = [];
  for (const path of [fileURLToPath(import.meta.url), fixturePath, quotaDataPath, fileURLToPath(relayURL)]) {
    try { const bytes = await readFile(path); inputs.push({ path, bytes: bytes.length, sha256: sha(bytes) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; inputs.push({ path, missing: true }); }
  }
  await writeFile(join(owner, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n', { flag: 'wx' });
  try { ({ createWorkerOutputRelay } = await import(relayURL.href)); }
  catch (error) { importFailure = error; }
});

after(async () => {
  if (!owner) return;
  const files = [];
  async function inventory(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const rel = relative ? relative + '/' + entry.name : entry.name;
      const path = join(directory, entry.name);
      const meta = await lstat(path);
      assert(!meta.isSymbolicLink(), 'No fixture artifact links');
      if (meta.isDirectory()) await inventory(path, rel);
      else {
        assert(meta.isFile(), 'Only ordinary fixture files');
        const bytes = await readFile(path);
        files.push({ path: rel, bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  await inventory(owner);
  await writeFile(join(owner, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, evidenceKind: 'real-worker-output-relay-e2e',
    owner, quotaMode, cases: caseResults, files: files.sort((a, b) => a.path.localeCompare(b.path)),
    nativeAcceptance: false, capacityAccepted: false, fullCareerAcceptance: false,
  }, null, 2) + '\n', { flag: 'wx' });
});

function send(child, command) {
  if (child.connected) child.send({ command }, () => {});
}
function childFixture(context, mode, index = 0, controlAddress = '') {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [fixturePath, mode, String(index), controlAddress], {
    cwd: source, windowsHide: true, env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exit = deferred(), close = deferred();
  const messages = [], waits = new Map();
  const record = { child, mode, exit, close, exited: false, closed: false, messages };
  child.on('error', error => { record.error = error; });
  child.once('exit', (code, signal) => {
    record.exited = true; record.exitCode = code; record.signal = signal;
    context.event('exit', { mode, code, signal });
    exit.resolve({ code, signal });
  });
  child.once('close', (code, signal) => {
    record.closed = true;
    context.event('close', { mode, code, signal });
    close.resolve({ code, signal });
    for (const [type, pending] of waits) {
      pending.reject(new Error('Fixture closed before message ' + type + ': ' + JSON.stringify(messages)));
    }
    waits.clear();
  });
  child.on('message', message => {
    const pending = waits.get(message?.type);
    if (pending) { waits.delete(message.type); pending.resolve(message); }
    else {
      assert(messages.length < 16, 'Finite fixture IPC message bound');
      messages.push(message);
    }
  });
  record.message = type => {
    const at = messages.findIndex(item => item?.type === type);
    if (at >= 0) return Promise.resolve(messages.splice(at, 1)[0]);
    if (record.closed) return Promise.reject(new Error('Fixture already closed before message ' + type));
    assert(!waits.has(type), 'One waiter per finite message');
    const pending = deferred(); waits.set(type, pending); return pending.promise;
  };
  context.children.push(record);
  return record;
}

async function actualFile(context, name, { cork = false, failFirstWrite = false } = {}) {
  const path = join(context.directory, name);
  const stream = createWriteStream(path, { flags: 'wx', highWaterMark: 1 });
  const opened = deferred(), firstWrite = deferred(), errorSeen = deferred();
  const counters = { calls: 0, callbackCalls: 0, handledBytes: 0, falseReturns: 0, errors: 0 };
  stream.once('open', () => opened.resolve());
  stream.on('error', error => { counters.errors += 1; errorSeen.resolve(error); opened.reject(error); });
  await opened.promise;
  if (cork) stream.cork();
  const realWrite = stream.write;
  const file = { stream, path, counters, firstWrite, errorSeen, onWrite: null,
    firstBuffer: null, firstError: null, failFirstWrite };
  // Observe/delegate the ACTUAL fs.WriteStream method once. No fake Writable,
  // fabricated callback, fabricated return value or direct child-pipe consumer.
  stream.write = function observeActualWrite(chunk, encoding, callback) {
    const bytes = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
    const originalCallback = typeof encoding === 'function' ? encoding : callback;
    counters.calls += 1;
    if (file.firstBuffer === null) file.firstBuffer = Buffer.from(bytes);
    if (file.onAttempt) file.onAttempt(bytes);
    if (file.failFirstWrite) { file.failFirstWrite = false; stream.end(); }
    const done = error => {
      counters.callbackCalls += 1;
      if (error) { file.firstError ??= error; errorSeen.resolve(error); }
      else counters.handledBytes += bytes.length;
      if (file.onCompletion) file.onCompletion(bytes, error);
      if (originalCallback) originalCallback(error);
    };
    const returned = typeof encoding === 'string'
      ? realWrite.call(this, chunk, encoding, done)
      : realWrite.call(this, chunk, done);
    if (!returned) counters.falseReturns += 1;
    firstWrite.resolve({ bytes: Buffer.from(bytes), returned });
    if (file.onWrite) file.onWrite(bytes, returned);
    return returned;
  };
  context.files.push(file);
  return file;
}
function watch(context, relay, fixture, options = {}) {
  const ticket = relay.watch(fixture.child, options);
  const settled = ticket.done.then(
    outcome => ({ ok: true, outcome }),
    error => ({ ok: false, error, outcome: error.outcome }),
  );
  const record = { ticket, settled, finished: false };
  settled.then(result => {
    record.finished = true;
    const value = result.outcome;
    context.outcomes.push({ pid: fixture.child.pid ?? null, ok: result.ok,
      errorCode: result.error?.code ?? null, code: value?.code ?? null, signal: value?.signal ?? null,
      outputStats: value?.outputStats ?? null,
      stdoutTailCodeUnits: value?.stdoutTail?.length ?? null, stderrTailCodeUnits: value?.stderrTail?.length ?? null,
      stdoutTailSha256: typeof value?.stdoutTail === 'string' ? sha(text(value.stdoutTail)) : null,
      stderrTailSha256: typeof value?.stderrTail === 'string' ? sha(text(value.stderrTail)) : null });
  });
  context.tickets.push(record);
  return record;
}
async function finishFile(file) {
  file.stream.uncork();
  if (file.stream.closed) return;
  const closed = deferred();
  file.stream.once('close', closed.resolve);
  if (!file.stream.destroyed && !file.stream.writableEnded) file.stream.end();
  if (file.stream.closed) return;
  await closed.promise;
}
function assertStats(channel, expected, { handled = expected.length, uncertain = 0, dropped = 0 } = {}) {
  assert.equal(channel.observedBytes, expected.length);
  assert.equal(channel.observedSha256, sha(expected));
  assert.equal(channel.handledBytes, handled);
  assert.equal(channel.uncertainBytes, uncertain);
  assert.equal(channel.droppedBytes, dropped);
  assert.equal(channel.observedBytes, channel.handledBytes + channel.uncertainBytes + channel.droppedBytes);
}
async function successful(record, relay, out, err, expectedOut, expectedErr) {
  const result = await record.settled;
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(result.outcome.code, 0);
  assert.equal(result.outcome.signal, null);
  assertStats(result.outcome.outputStats.stdout, expectedOut);
  assertStats(result.outcome.outputStats.stderr, expectedErr);
  await relay.finish();
  await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), expectedOut);
  assert.deepEqual(await readFile(err.path), expectedErr);
  return result.outcome;
}

function e2e(name, exercise) {
  test(name, { timeout: 30000, concurrency: false }, async t => {
    const directory = join(owner, name.split(' ')[0]);
    await mkdir(directory);
    const context = { directory, children: [], files: [], tickets: [], outcomes: [], events: [], controls: [], servers: [] };
    context.event = (kind, facts = {}) => {
      assert(context.events.length < 32, 'Finite named-milestone bound');
      const row = { kind, ...facts };
      assert(Buffer.byteLength(JSON.stringify(row) + '\n') <= 256, 'Milestone width');
      context.events.push(row);
      appendFileSync(join(directory, 'events-live.jsonl'), JSON.stringify(row) + '\n');
    };
    let failure;
    t.after(async () => {
      context.cleaning = true;
      if (t.signal.aborted) failure ??= new Error('Fixture test aborted');
      // Uncork ONLY these owned real files so a failing assertion cannot strand
      // its finite child in writeSync. No deletion, abort signal or process kill.
      for (const file of context.files) file.stream.uncork();
      for (const control of context.controls) if (control.writable) control.end('GO\n');
      for (const item of context.children) {
        if (!item.closed) send(item.child, 'stop');
        if (item.child.stdio[4]?.writable) item.child.stdio[4].end('GO\n');
      }
      await Promise.all(context.children.map(item => item.close.promise));
      for (const server of context.servers) {
        if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
      }
      for (const file of context.files) await finishFile(file);
      await writeFile(join(directory, 'events.jsonl'),
        context.events.map(row => JSON.stringify(row) + '\n').join(''), { flag: 'wx' });
      const result = { case: name, status: failure ? 'FAILED' : 'PASSED',
        error: failure ? { name: failure.name, code: failure.code ?? null } : null,
        children: context.children.map(item => ({ pid: item.child.pid ?? null, mode: item.mode,
          actualClosed: item.closed, code: item.exitCode ?? null, signal: item.signal ?? null })),
        outcomes: context.outcomes, quotaFacts: context.quotaFacts ?? null,
        files: await Promise.all(context.files.map(async file => {
          const bytes = await readFile(file.path);
          return { name: basename(file.path), bytes: bytes.length, sha256: sha(bytes), ...file.counters };
        })) };
      await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      caseResults.push({ case: name, status: result.status });
    });
    try {
      if (importFailure) throw importFailure;
      assert.equal(typeof createWorkerOutputRelay, 'function');
      await exercise(context);
    } catch (error) { failure = error; throw error; }
  });
}


if (quotaMode === 'candidate') {
e2e('01-split raw split UTF8 reaches real files and streaming diagnostic tails', async context => {
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const child = childFixture(context, 'split');
  const record = watch(context, relay, child);
  const observed = { stdout: [], stderr: [] };
  for (const [channel, file] of [['stdout', out], ['stderr', err]]) {
    file.onWrite = bytes => {
      const piece = observed[channel].length;
      observed[channel].push(Buffer.from(bytes));
      context.event('actual-sink-piece', { channel, piece, hex: bytes.toString('hex') });
      send(child.child, 'ack-' + channel + '-' + piece);
    };
  }
  await child.message('ready'); send(child.child, 'start');
  const bytes = Buffer.from([0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0xb5]);
  const outcome = await successful(record, relay, out, err, bytes, bytes);
  for (const pieces of Object.values(observed)) {
    assert.equal(pieces.length, 7);
    pieces.forEach((piece, index) => assert.deepEqual(piece, bytes.subarray(index, index + 1)));
  }
  assert.equal(outcome.stdoutTail, '\u20ac\u{1f3b5}');
  assert.equal(outcome.stderrTail, '\u20ac\u{1f3b5}');
  await relay.finish();
});

e2e('02-bytes arbitrary raw bytes and bounded decoded tails', async context => {
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const child = childFixture(context, 'bytes-tail'), record = watch(context, relay, child);
  await child.message('ready'); send(child.child, 'start');
  const suffix = Buffer.from([0x00, 0xff, 0xc0, 0xaf, 0xe2, 0x82]);
  const expectedOut = Buffer.concat([Buffer.alloc(33000, 0x41), suffix]);
  const expectedErr = Buffer.concat([Buffer.alloc(33000, 0x53), suffix]);
  const outcome = await successful(record, relay, out, err, expectedOut, expectedErr);
  const diagnosticSuffix = '\u0000\ufffd\ufffd\ufffd\ufffd';
  assert.equal(outcome.stdoutTail, 'A'.repeat(32768 - diagnosticSuffix.length) + diagnosticSuffix);
  assert.equal(outcome.stderrTail, 'S'.repeat(32768 - diagnosticSuffix.length) + diagnosticSuffix);
  await relay.finish();
});

e2e('03-pressure direct exit cannot bypass an actual corked file or complete early', async context => {
  const out = await actualFile(context, 'stdout.bin', { cork: true });
  const err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const child = childFixture(context, 'pressure-exit'), record = watch(context, relay, child);
  await child.message('ready'); send(child.child, 'start');
  const first = await out.firstWrite.promise;
  assert.deepEqual(first.bytes, Buffer.from([0x61])); assert.equal(first.returned, false);
  context.event('actual-pressure', { bytesWritten: out.stream.bytesWritten });
  send(child.child, 'continue');
  await child.exit.promise;
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(out.stream.writableNeedDrain, true);
  assert.equal(out.counters.calls, 1, 'No further real sink write while false and corked, including after direct exit');
  assert.equal(out.counters.callbackCalls, 0);
  assert.equal(out.stream.bytesWritten, 0);
  assert.equal(record.finished, false);
  out.stream.uncork();
  await successful(record, relay, out, err, Buffer.concat([Buffer.from([0x61]), Buffer.alloc(63, 0x62)]),
    text('pressure-stderr\n'));
  await relay.finish();
});

e2e('04-c3 shared destination gate preserves three sources and separate replay', async context => {
  const out = await actualFile(context, 'stdout.bin', { cork: true });
  const err = await actualFile(context, 'stderr.bin', { cork: true });
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const workers = Array.from({ length: 3 }, (_, index) => {
    const child = childFixture(context, 'concurrent', index);
    return { child, record: watch(context, relay, child), index };
  });
  await Promise.all(workers.map(({ child }) => child.message('ready')));
  workers.forEach(({ child }) => send(child.child, 'start'));
  await Promise.all(workers.map(({ child }) => child.message('wrote')));
  await Promise.all([out.firstWrite.promise, err.firstWrite.promise]);
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  assert.equal(out.counters.calls, 1, 'c3 shares one stdout pressure gate');
  assert.equal(err.counters.calls, 1, 'c3 shares one stderr pressure gate');
  assert.equal(out.stream.bytesWritten, 0); assert.equal(err.stream.bytesWritten, 0);
  context.event('c3-pressure', { stdoutCalls: out.counters.calls, stderrCalls: err.counters.calls });
  out.stream.uncork(); err.stream.uncork();
  for (const { record, index } of workers) {
    const result = await record.settled; assert.equal(result.ok, true);
    const bytes = Buffer.from(Array.from({ length: 64 }, (_, n) => index * 64 + n));
    assertStats(result.outcome.outputStats.stdout, bytes);
    assertStats(result.outcome.outputStats.stderr, Buffer.from(bytes).reverse());
  }
  const replay = childFixture(context, 'empty'), replayTicket = watch(context, relay, replay);
  await replay.message('ready'); send(replay.child, 'start');
  const replayResult = await replayTicket.settled; assert.equal(replayResult.ok, true);
  assertStats(replayResult.outcome.outputStats.stdout, Buffer.alloc(0));
  await relay.finish(); await finishFile(out); await finishFile(err);
  for (const [file, reverse] of [[out, false], [err, true]]) {
    const all = await readFile(file.path); assert.equal(all.length, 192);
    for (let index = 0; index < 3; index += 1) {
      const selected = Buffer.from([...all].filter(byte => byte >= index * 64 && byte < (index + 1) * 64));
      const expected = Buffer.from(Array.from({ length: 64 }, (_, n) => index * 64 + n));
      assert.deepEqual(selected, reverse ? expected.reverse() : expected);
    }
  }
});

e2e('05-trailing inherited output after direct parent exit also waits for destination drain', async context => {
  const out = await actualFile(context, 'stdout.bin', { cork: true });
  const err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const address = process.platform === 'win32'
    ? '\\\\.\\pipe\\talentscout-relay-' + randomUUID()
    : join(tmpdir(), 'ts-relay-' + randomUUID().slice(0, 8) + '.sock');
  const ready = deferred(), report = deferred(); let control, reportSeen = false;
  const server = createServer(socket => {
    context.event('private-pipe-connected');
    if (control) { socket.destroy(); return; }
    control = socket; context.controls.push(socket);
    let input = '', readySeen = false;
    socket.on('data', bytes => {
      input += bytes.toString('ascii');
      if (input.length > 768) { ready.reject(new Error('Finite control-pipe bound')); return; }
      let split;
      while ((split = input.indexOf('\n')) >= 0) {
        const message = JSON.parse(input.slice(0, split)); input = input.slice(split + 1);
        context.event('grandchild-control', message);
        if (message.type === 'ready') { readySeen = true; ready.resolve(); }
        if (message.type === 'wrote' || message.type === 'error') { reportSeen = true; report.resolve(message); }
        if (message.type === 'error') ready.reject(new Error('Grandchild: ' + message.code));
      }
    });
    socket.once('error', ready.reject);
    socket.once('end', () => {
      if (!readySeen) ready.reject(new Error('Private pipe ended before READY'));
      if (!reportSeen) report.reject(new Error('Private pipe ended before output disposition'));
    });
    if (context.cleaning && socket.writable) socket.end('GO\n');
  });
  context.servers.push(server);
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen); server.listen(address, resolveListen);
  });
  const child = childFixture(context, 'trail-parent', 0, address), record = watch(context, relay, child);
  const directReady = await child.message('ready'); send(child.child, 'start');
  context.event('direct-child-ready', directReady);
  const descendant = await child.message('descendant');
  context.event('descendant-spawned', { pid: descendant.pid });
  assert(Number.isSafeInteger(descendant.pid) && descendant.pid > 0);
  await ready.promise;
  send(child.child, 'parent-exit');
  const directExit = await child.exit.promise;
  context.event('direct-exit-before-release', { descendantPid: descendant.pid });
  await new Promise(resolveTurn => setImmediate(resolveTurn));
  const closedBeforeRelease = child.closed, finishedBeforeRelease = record.finished;
  control.write('GO\n');
  const disposition = await report.promise;
  assert.equal(disposition.type, 'wrote', 'Actual descendant output disposition: ' + JSON.stringify(disposition));
  assert.equal(closedBeforeRelease, false, 'Fixture descendant must actually retain both output pipes before release');
  assert.equal(finishedBeforeRelease, false);
  const first = await out.firstWrite.promise; assert.equal(first.returned, false);
  assert.equal(out.stream.bytesWritten, 0); assert.equal(record.finished, false);
  context.event('trailing-pressure', { directExited: child.exited });
  out.stream.uncork();
  const result = await record.settled;
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(result.outcome.code, directExit.code);
  assert.equal(result.outcome.signal, directExit.signal);
  assert.equal(directExit.code, 0);
  assert.equal(directExit.signal, null);
  const expectedOut = text('grandchild-after-direct-exit:\u20ac\n');
  const expectedErr = text('grandchild-stderr-after-direct-exit\n');
  assertStats(result.outcome.outputStats.stdout, expectedOut);
  assertStats(result.outcome.outputStats.stderr, expectedErr);
  await relay.finish(); await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), expectedOut);
  assert.deepEqual(await readFile(err.path), expectedErr);
});

e2e('06-status actual failed spawn and normal nonzero outcome settle once after close', async context => {
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const missing = spawn(join(context.directory, 'deliberately-missing-executable'), [], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = deferred(); let closeCount = 0, errorCount = 0, exitCount = 0;
  missing.on('error', () => { errorCount += 1; });
  missing.once('exit', () => { exitCount += 1; });
  missing.once('close', () => { closeCount += 1; closed.resolve(); });
  const failed = relay.watch(missing, {}).done.then(outcome => ({ outcome }), error => ({ error, outcome: error.outcome }));
  const result = await failed; await closed.promise;
  assert(result.error); assert(result.outcome);
  assert.equal(closeCount, 1); assert.equal(errorCount, 1); assert.equal(exitCount, 0);
  assertStats(result.outcome.outputStats.stdout, Buffer.alloc(0));
  try { await relay.finish(); } catch {}
  const next = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const child = childFixture(context, 'nonzero'), record = watch(context, next, child);
  await child.message('ready'); send(child.child, 'start');
  const nonzero = await record.settled;
  assert.equal(nonzero.ok, true, 'Nonzero exit is a drained outcome, not a relay failure');
  assert.equal(nonzero.outcome.code, 7); assert.equal(nonzero.outcome.signal, null);
  assert.equal(nonzero.outcome.stderrTail, 'nonzero-stderr:\u20ac\n');
  assertStats(nonzero.outcome.outputStats.stdout, text('nonzero-stdout\n'));
  assertStats(nonzero.outcome.outputStats.stderr, text('nonzero-stderr:\u20ac\n'));
  assert.equal(child.closed, true);
  await next.finish();
  const late = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  assert.throws(() => late.watch(child.child), /before output was watched/);
  await assert.rejects(late.finish(), /before output was watched/);
  await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), text('nonzero-stdout\n'));
  assert.deepEqual(await readFile(err.path), text('nonzero-stderr:\u20ac\n'));
});

e2e('07-sink-error actual write-after-end fails then drains hashes and explicit dropped counts', async context => {
  const out = await actualFile(context, 'stdout.bin', { failFirstWrite: true });
  const err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream, tailCodeUnits: 32768 });
  const first = childFixture(context, 'sink-error'), firstTicket = watch(context, relay, first);
  // This second child is already spawned before failure, but still emits no
  // output. watch MUST attach/drain it even after assertHealthy starts refusing.
  const existing = childFixture(context, 'concurrent', 1);
  await Promise.all([first.message('ready'), existing.message('ready')]);
  send(first.child, 'start');
  const actualError = await out.errorSeen.promise;
  assert.equal(actualError.code, 'ERR_STREAM_WRITE_AFTER_END');
  assert(relay.failure);
  assert.throws(() => relay.assertHealthy());
  const launchCount = context.children.length;
  assert.throws(() => { relay.assertHealthy(); childFixture(context, 'empty'); });
  assert.equal(context.children.length, launchCount, 'Pre-spawn refusal launches nothing');
  const existingTicket = watch(context, relay, existing);
  send(first.child, 'after-failure'); send(existing.child, 'start');
  const firstResult = await firstTicket.settled, existingResult = await existingTicket.settled;
  assert.equal(firstResult.ok, false); assert(firstResult.error.outcome);
  assert.equal(existingResult.ok, false); assert(existingResult.error.outcome);
  assert.equal(first.closed, true); assert.equal(existing.closed, true);
  const initial = text('first-uncertain-buffer'), droppedOut = text('later-explicitly-dropped-stdout');
  const uncertain = out.firstBuffer.length;
  assert(uncertain > 0 && uncertain <= initial.length);
  assert.deepEqual(out.firstBuffer, initial.subarray(0, uncertain));
  assertStats(firstResult.outcome.outputStats.stdout, Buffer.concat([initial, droppedOut]),
    { handled: 0, uncertain, dropped: initial.length - uncertain + droppedOut.length });
  assertStats(firstResult.outcome.outputStats.stderr, text('later-explicitly-dropped-stderr'),
    { handled: 0, dropped: text('later-explicitly-dropped-stderr').length });
  const bytes = Buffer.from(Array.from({ length: 64 }, (_, n) => 64 + n));
  assertStats(existingResult.outcome.outputStats.stdout, bytes, { handled: 0, dropped: bytes.length });
  assertStats(existingResult.outcome.outputStats.stderr, Buffer.from(bytes).reverse(), { handled: 0, dropped: bytes.length });
  assert.equal(out.counters.calls, 1, 'Errored attempt is never retried');
  assert.equal(err.counters.calls, 0, 'Session failure stops writes to BOTH sinks');
  assert.equal(out.counters.handledBytes, 0);
  try { await relay.finish(); } catch {}
  assert(relay.failure); assert.throws(() => relay.assertHealthy());
  await finishFile(out); await finishFile(err);
  assert.equal((await readFile(out.path)).length, 0);
  assert.equal((await readFile(err.path)).length, 0);
  context.event('explicit-failed-drain', { uncertain,
    dropped: initial.length - uncertain + droppedOut.length + text('later-explicitly-dropped-stderr').length + 128 });
});

e2e('08-cleanup aliases and caller-owned destination survive sequential children and finish', async context => {
  const file = await actualFile(context, 'combined.bin');
  const baseline = Object.fromEntries(['error', 'close', 'drain', 'finish'].map(event => [event, file.stream.listenerCount(event)]));
  const relay = createWorkerOutputRelay({ stdout: file.stream, stderr: file.stream, tailCodeUnits: 32768 });
  const first = childFixture(context, 'empty'), firstTicket = watch(context, relay, first);
  await first.message('ready'); send(first.child, 'start');
  assert.equal((await firstTicket.settled).ok, true);
  const second = childFixture(context, 'concurrent', 0), secondTicket = watch(context, relay, second);
  await second.message('ready'); send(second.child, 'start');
  const result = await secondTicket.settled; assert.equal(result.ok, true); assert.equal(result.outcome.code, 0);
  const alphabet = Buffer.from(Array.from({ length: 64 }, (_, n) => n));
  assertStats(result.outcome.outputStats.stdout, alphabet);
  assertStats(result.outcome.outputStats.stderr, Buffer.from(alphabet).reverse());
  await relay.line('stdout', 'CALLER-MARKER');
  await relay.finish(); await relay.finish();
  assert.equal(file.stream.destroyed, false); assert.equal(file.stream.writableEnded, false);
  for (const [event, count] of Object.entries(baseline)) assert.equal(file.stream.listenerCount(event), count, event + ' listener leak');
  const sentinel = text('CALLER-AFTER-FINISH\n');
  await new Promise((resolveWrite, rejectWrite) => file.stream.write(sentinel,
    error => error ? rejectWrite(error) : resolveWrite()));
  await finishFile(file);
  const bytes = await readFile(file.path);
  const prefix = bytes.subarray(0, 128);
  assert.equal(prefix.length, 128);
  for (let byte = 0; byte < 64; byte += 1) assert.equal([...prefix].filter(value => value === byte).length, 2);
  assert.deepEqual(bytes.subarray(prefix.length), Buffer.concat([text('CALLER-MARKER\n'), sentinel]));
});

function budgetSnapshot(relay, limit, charged) {
  const snapshot = relay.outputBudget;
  assert(snapshot && typeof snapshot === 'object', 'Real relay exposes an outputBudget snapshot');
  assert.deepEqual(Object.keys(snapshot).sort(), quotaCases.mechanism.snapshotKeys);
  assert.equal(snapshot.limitBytes, limit);
  assert(Number.isSafeInteger(snapshot.chargedBytes) && snapshot.chargedBytes >= 0);
  assert(snapshot.chargedBytes <= snapshot.limitBytes, 'Admission never overspends the session allowance');
  if (charged !== undefined) assert.equal(snapshot.chargedBytes, charged);
  return snapshot;
}
function quotaAttemptEvidence(context, relay, files) {
  const attempts = [];
  for (const file of new Set(files)) {
    file.onAttempt = bytes => {
      assert(attempts.length < quotaCases.diagnosticControls.maxAttemptObservationsPerQuotaCase);
      const value = relay.outputBudget;
      assert(bytes.length <= quotaCases.diagnosticControls.maxNewRecipeBytesPerChannel);
      attempts.push({ file: basename(file.path), bytes: bytes.length, hex: bytes.toString('hex'),
        limitBytes: value?.limitBytes ?? null, chargedBytes: value?.chargedBytes ?? null });
    };
  }
  context.quotaFacts = { attempts };
  return attempts;
}
function assertAttemptCharges(attempts, limit) {
  let attempted = 0;
  for (const value of attempts) {
    attempted += value.bytes;
    assert.equal(value.limitBytes, limit);
    assert(Number.isSafeInteger(value.chargedBytes));
    assert(value.chargedBytes >= attempted, 'Complete byte charge precedes the actual underlying write attempt');
    assert(value.chargedBytes <= limit);
  }
  return attempted;
}
function handledPrefix(file, expected) {
  const ready = deferred(), parts = [];
  let count = 0;
  file.onCompletion = (bytes, error) => {
    if (error) { ready.reject(error); return; }
    parts.push(Buffer.from(bytes)); count += bytes.length;
    if (count >= expected.length) ready.resolve(Buffer.concat(parts));
  };
  return ready.promise;
}
async function expectQuotaFinish(relay, firstFailure) {
  assert.equal(relay.failure, firstFailure);
  assert.equal(firstFailure.code, quotaCases.mechanism.quotaErrorCode);
  assert.throws(() => relay.assertHealthy(), error => error === firstFailure);
  await assert.rejects(relay.finish(), error => error === firstFailure);
  assert.equal(relay.failure, firstFailure);
}

e2e('09-quota-exact aliases count UTF8 marker LF and both raw worker channels once', async context => {
  const q = quotaCases.Q09, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const file = await actualFile(context, 'combined.bin');
  const relay = createWorkerOutputRelay({ stdout: file.stream, stderr: file.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  const attempts = quotaAttemptEvidence(context, relay, [file]);
  budgetSnapshot(relay, q.limitBytes, 0);
  await relay.line('stdout', quotaCases.marker.text);
  budgetSnapshot(relay, q.limitBytes, marker.length);
  const child = childFixture(context, 'quota-exact'), record = watch(context, relay, child);
  await child.message('ready'); send(child.child, 'start');
  const result = await record.settled;
  assert.equal(result.ok, true, result.error?.message); assert.equal(child.closed, true);
  assert.equal(result.outcome.code, 0); assert.equal(result.outcome.signal, null);
  const out = Buffer.from(q.workerStdoutHex, 'hex'), err = Buffer.from(q.workerStderrHex, 'hex');
  assertStats(result.outcome.outputStats.stdout, out);
  assertStats(result.outcome.outputStats.stderr, err);
  const detached = budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  try { detached.chargedBytes = -1; } catch {}
  budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  assert.equal(assertAttemptCharges(attempts, q.limitBytes), q.limitBytes);
  await relay.finish(); await finishFile(file);
  const actual = await readFile(file.path);
  assert.equal(actual.length, q.limitBytes); assert.deepEqual(actual.subarray(0, marker.length), marker);
  const rest = actual.subarray(marker.length);
  assert.deepEqual(Buffer.from([...rest].filter(byte => out.includes(byte))), out);
  assert.deepEqual(Buffer.from([...rest].filter(byte => err.includes(byte))), err);
  context.quotaFacts.finalBudget = budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
});

e2e('10-quota-plus-one real over-limit byte is dropped and existing child remains watched', async context => {
  const q = quotaCases.Q10, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  const attempts = quotaAttemptEvidence(context, relay, [out, err]);
  await relay.line('stdout', quotaCases.marker.text);
  const approved = Buffer.from(q.approvedStdoutHex, 'hex');
  const approvedHandled = handledPrefix(out, approved);
  const child = childFixture(context, 'quota-plus-one'), record = watch(context, relay, child);
  const existing = childFixture(context, q.lateExistingRecipe, q.lateExistingIndex);
  await Promise.all([child.message('ready'), existing.message('ready')]);
  send(child.child, 'start');
  assert.deepEqual(await approvedHandled, approved);
  budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  send(child.child, 'extra');
  const result = await record.settled;
  assert.equal(result.ok, false); assert.equal(child.closed, true);
  assert.equal(result.outcome.code, 0); assert.equal(result.outcome.signal, null);
  const firstFailure = relay.failure;
  assert.equal(firstFailure.code, quotaCases.mechanism.quotaErrorCode);
  const overflow = Buffer.from(q.overflowStdoutHex, 'hex');
  assertStats(result.outcome.outputStats.stdout, Buffer.concat([approved, overflow]),
    { handled: approved.length, dropped: overflow.length });
  assertStats(result.outcome.outputStats.stderr, Buffer.alloc(0));
  const count = context.children.length;
  assert.throws(() => { relay.assertHealthy(); childFixture(context, 'empty'); }, error => error === firstFailure);
  assert.equal(context.children.length, count, 'Guarded admission creates no new child');
  const late = watch(context, relay, existing);
  send(existing.child, 'start');
  const lateResult = await late.settled;
  assert.equal(lateResult.ok, false); assert.equal(existing.closed, true);
  assert.equal(lateResult.outcome.code, 0); assert.equal(lateResult.outcome.signal, null);
  const bytes = Buffer.from(Array.from({ length: 64 }, (_, n) => q.lateExistingIndex * 64 + n));
  assertStats(lateResult.outcome.outputStats.stdout, bytes, { handled: 0, dropped: bytes.length });
  assertStats(lateResult.outcome.outputStats.stderr, Buffer.from(bytes).reverse(), { handled: 0, dropped: bytes.length });
  await assert.rejects(relay.line('stderr', 'after-failure'), error => error === firstFailure);
  await expectQuotaFinish(relay, firstFailure);
  budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  assert.equal(assertAttemptCharges(attempts, q.limitBytes), marker.length + approved.length);
  assert.equal(err.counters.calls, 0);
  await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), Buffer.from(q.expectedFileStdoutHex, 'hex'));
  assert.equal((await readFile(err.path)).length, 0);
  context.quotaFacts.finalBudget = budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
});

e2e('11-quota-markers exact UTF8 plus LF and whole oversized marker admission', async context => {
  const q = quotaCases.Q11, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  const attempts = quotaAttemptEvidence(context, relay, [out, err]);
  await relay.line('stdout', quotaCases.marker.text);
  budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  await assert.rejects(relay.line('stderr', q.nextMarkerText), error => error.code === quotaCases.mechanism.quotaErrorCode);
  const firstFailure = relay.failure;
  await assert.rejects(relay.line('stdout', 'later'), error => error === firstFailure);
  await expectQuotaFinish(relay, firstFailure);
  assert.equal(assertAttemptCharges(attempts, q.limitBytes), q.limitBytes);
  assert.equal(err.counters.calls, 0);
  await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), marker); assert.equal((await readFile(err.path)).length, 0);
  const overOut = await actualFile(context, 'oversized-stdout.bin');
  const overErr = await actualFile(context, 'oversized-stderr.bin');
  const over = createWorkerOutputRelay({ stdout: overOut.stream, stderr: overErr.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.oversizedSessionLimitBytes });
  await assert.rejects(over.line('stdout', quotaCases.marker.text), error => error.code === quotaCases.mechanism.quotaErrorCode);
  const overFailure = over.failure;
  await expectQuotaFinish(over, overFailure);
  budgetSnapshot(over, q.oversizedSessionLimitBytes, q.expectedOversizedSessionChargedBytes);
  assert.equal(overOut.counters.calls, 0); assert.equal(overErr.counters.calls, 0);
  await finishFile(overOut); await finishFile(overErr);
  assert.equal((await readFile(overOut.path)).length, 0); assert.equal((await readFile(overErr.path)).length, 0);
  context.quotaFacts.finalBudget = budgetSnapshot(relay, q.limitBytes, q.expectedChargedBytes);
  context.quotaFacts.oversizedBudget = budgetSnapshot(over, q.oversizedSessionLimitBytes, 0);
});

e2e('12-quota-c3 shared destinations cannot admit three late bytes into two remaining slots', async context => {
  const q = quotaCases.Q12, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  const attempts = quotaAttemptEvidence(context, relay, [out, err]);
  await relay.line('stdout', quotaCases.marker.text);
  const firstHandled = handledPrefix(out, Buffer.alloc(q.firstStdoutByteHex.length));
  const firstAttempt = deferred();
  out.onWrite = () => firstAttempt.resolve();
  out.stream.cork();
  const workers = Array.from({ length: 3 }, (_, index) => {
    const child = childFixture(context, 'quota-c3', index);
    return { child, record: watch(context, relay, child), index };
  });
  await Promise.all(workers.map(({ child }) => child.message('ready')));
  workers.forEach(({ child }) => send(child.child, 'start'));
  await Promise.all(workers.map(({ child }) => child.message('first-written')));
  await firstAttempt.promise;
  assert.equal(out.counters.calls, 2, 'Marker plus one real blocked write; c3 shares the actual gate');
  assert.equal(out.counters.callbackCalls, 1);
  assert.equal(out.stream.bytesWritten, marker.length);
  out.stream.uncork();
  const firstBytes = await firstHandled;
  assert.deepEqual([...firstBytes].sort((a, b) => a - b), q.firstStdoutByteHex.map(value => Number.parseInt(value, 16)));
  budgetSnapshot(relay, q.limitBytes, q.expectedChargeAfterFirstPhase);
  out.onWrite = null; out.onCompletion = null;
  err.stream.cork();
  workers.forEach(({ child }) => send(child.child, 'last-byte'));
  await Promise.all(workers.map(({ child }) => child.exit.promise));
  let checks = 0;
  while (checks < quotaCases.diagnosticControls.quotaFailurePollAttempts && !relay.failure) {
    checks += 1;
    await new Promise(resolveCheck => setTimeout(resolveCheck, quotaCases.diagnosticControls.quotaFailurePollIntervalMs));
  }
  context.quotaFacts.quotaObservationChecks = checks;
  const firstFailure = relay.failure;
  assert(firstFailure, 'Finite quota-failure observation allowance exhausted');
  assert.equal(firstFailure.code, quotaCases.mechanism.quotaErrorCode);
  budgetSnapshot(relay, q.limitBytes, q.expectedFinalChargedBytes);
  assert.equal(err.counters.calls, 1, 'Only the first already-issued actual stderr write precedes quota failure');
  assert.equal(err.counters.callbackCalls, 0); assert.equal(err.stream.bytesWritten, 0);
  assert(workers.some(({ record }) => !record.finished), 'Real blocked write still prevents completion');
  err.stream.uncork();
  const results = await Promise.all(workers.map(({ record }) => record.settled));
  await expectQuotaFinish(relay, firstFailure);
  await finishFile(out); await finishFile(err);
  const stdout = await readFile(out.path), stderr = await readFile(err.path);
  assert.deepEqual(stdout.subarray(0, marker.length), marker);
  assert.deepEqual([...stdout.subarray(marker.length)].sort((a, b) => a - b),
    q.firstStdoutByteHex.map(value => Number.parseInt(value, 16)));
  assert.equal(stderr.length, q.expectedHandledLateBytesWhileHeldUntilFailure);
  assert(q.lastStderrByteHex.some(value => Buffer.from(value, 'hex').equals(stderr)));
  for (let index = 0; index < workers.length; index += 1) {
    const result = results[index];
    assert.equal(result.ok, false); assert.equal(workers[index].child.closed, true);
    assert.equal(result.outcome.code, 0); assert.equal(result.outcome.signal, null);
    const a = Buffer.from(q.firstStdoutByteHex[index], 'hex'), b = Buffer.from(q.lastStderrByteHex[index], 'hex');
    assertStats(result.outcome.outputStats.stdout, a);
    const handled = stderr.includes(b[0]) ? 1 : 0;
    assertStats(result.outcome.outputStats.stderr, b, { handled, dropped: b.length - handled });
  }
  assert.equal(assertAttemptCharges(attempts, q.limitBytes), q.expectedFinalChargedBytes - 1,
    'One admitted queued byte remains charged after it is dropped without an attempt');
  context.quotaFacts.finalBudget = budgetSnapshot(relay, q.limitBytes, q.expectedFinalChargedBytes);
});

e2e('13-quota-uncertain actual failed write remains charged and session never retries', async context => {
  const q = quotaCases.Q13, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  const attempts = quotaAttemptEvidence(context, relay, [out, err]);
  await relay.line('stdout', quotaCases.marker.text);
  out.failFirstWrite = true;
  const child = childFixture(context, 'sink-error'), record = watch(context, relay, child);
  const existing = childFixture(context, q.lateExistingRecipe, q.lateExistingIndex);
  await Promise.all([child.message('ready'), existing.message('ready')]);
  send(child.child, 'start');
  const actualError = await out.errorSeen.promise;
  assert.equal(actualError.code, q.expectedActualErrorCode);
  const firstFailure = relay.failure;
  assert(firstFailure); assert.notEqual(firstFailure.code, quotaCases.mechanism.quotaErrorCode);
  const attempted = attempts[attempts.length - 1];
  assert.equal(attempts.length, 2, 'Handled marker plus exactly one actual uncertain write attempt');
  const first = text(q.firstText), droppedOut = text(q.laterStdoutText), droppedErr = text(q.laterStderrText);
  assert(attempted.bytes > 0 && attempted.bytes <= first.length);
  assert.deepEqual(Buffer.from(attempted.hex, 'hex'), first.subarray(0, attempted.bytes));
  const charged = marker.length + attempted.bytes;
  budgetSnapshot(relay, q.limitBytes, charged);
  const late = watch(context, relay, existing);
  send(child.child, 'after-failure'); send(existing.child, 'start');
  const result = await record.settled, lateResult = await late.settled;
  assert.equal(result.ok, false); assert.equal(lateResult.ok, false);
  assert.equal(child.closed, true); assert.equal(existing.closed, true);
  assert.equal(result.outcome.code, 0); assert.equal(result.outcome.signal, null);
  assert.equal(lateResult.outcome.code, 0); assert.equal(lateResult.outcome.signal, null);
  assertStats(result.outcome.outputStats.stdout, Buffer.concat([first, droppedOut]),
    { handled: 0, uncertain: attempted.bytes, dropped: first.length - attempted.bytes + droppedOut.length });
  assertStats(result.outcome.outputStats.stderr, droppedErr, { handled: 0, dropped: droppedErr.length });
  const bytes = Buffer.from(Array.from({ length: 64 }, (_, n) => q.lateExistingIndex * 64 + n));
  assertStats(lateResult.outcome.outputStats.stdout, bytes, { handled: 0, dropped: bytes.length });
  assertStats(lateResult.outcome.outputStats.stderr, Buffer.from(bytes).reverse(), { handled: 0, dropped: bytes.length });
  await assert.rejects(relay.line('stderr', 'no-retry'), error => error === firstFailure);
  await assert.rejects(relay.finish(), error => error === firstFailure);
  assert.equal(relay.failure, firstFailure);
  assert.equal(assertAttemptCharges(attempts, q.limitBytes), charged);
  assert.equal(out.counters.calls, 2); assert.equal(err.counters.calls, 0);
  assert.equal(out.counters.handledBytes, marker.length);
  await finishFile(out); await finishFile(err);
  assert.deepEqual(await readFile(out.path), marker); assert.equal((await readFile(err.path)).length, 0);
  context.quotaFacts.actualStreamErrorCode = actualError.code;
  context.quotaFacts.finalBudget = budgetSnapshot(relay, q.limitBytes, charged);
});


e2e('14-quota-invalid actual open files receive no writes from invalid allowance construction', async context => {
  const q = quotaCases.Q14;
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  const invalid = [
    ['zero', 0], ['negative', -1], ['fractional', 0.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['nan', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY], ['null', null], ['string', '8'],
  ];
  assert.deepEqual(invalid.map(([name]) => name), q.invalidValueNames);
  const events = ['error', 'close', 'drain', 'finish'];
  const baseline = [out, err].map(file => events.map(event => file.stream.listenerCount(event)));
  let refused = 0;
  for (const [name, value] of invalid) {
    assert.throws(() => createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
      tailCodeUnits: 32768, maxOutputBytes: value }),
      error => error instanceof Error, 'Synchronous invalid allowance refusal: ' + name);
    refused += 1;
    assert.equal(out.counters.calls + err.counters.calls, q.expectedDelegatedSinkWrites);
    assert.equal(context.children.length, q.expectedChildren);
    for (let index = 0; index < 2; index += 1) {
      const file = [out, err][index];
      assert.equal(file.stream.destroyed, false); assert.equal(file.stream.writableEnded, false);
      assert.deepEqual(events.map(event => file.stream.listenerCount(event)), baseline[index],
        'Validation leaves the caller actual Writable untouched: ' + name);
    }
  }
  assert.equal(refused, q.expectedRefusals);
  await finishFile(out); await finishFile(err);
  assert.equal((await readFile(out.path)).length, 0); assert.equal((await readFile(err.path)).length, 0);
  context.quotaFacts = { invalidValueNames: q.invalidValueNames, actualSynchronousRefusals: refused,
    delegatedSinkWrites: out.counters.calls + err.counters.calls, actualChildren: context.children.length };
});

} else {

e2e('B0-baseline current Source retains nine bytes against the proposed eight-byte allowance', async context => {
  const q = quotaCases.B0, marker = Buffer.from(quotaCases.marker.utf8WithLfHex, 'hex');
  const out = await actualFile(context, 'stdout.bin'), err = await actualFile(context, 'stderr.bin');
  // This actual Source relay currently ignores the new option. Do not fake it.
  const relay = createWorkerOutputRelay({ stdout: out.stream, stderr: err.stream,
    tailCodeUnits: 32768, maxOutputBytes: q.limitBytes });
  await relay.line('stdout', quotaCases.marker.text);
  const approved = Buffer.from(q.approvedStdoutHex, 'hex');
  const handled = deferred(), pieces = []; let count = 0;
  out.onCompletion = (bytes, error) => {
    if (error) { handled.reject(error); return; }
    pieces.push(Buffer.from(bytes)); count += bytes.length;
    if (count >= approved.length) handled.resolve(Buffer.concat(pieces));
  };
  const child = childFixture(context, 'quota-plus-one'), record = watch(context, relay, child);
  await child.message('ready'); send(child.child, 'start');
  assert.deepEqual(await handled.promise, approved);
  send(child.child, 'extra');
  const result = await record.settled;
  assert.equal(result.ok, true, 'Import/sink/process failure is not a baseline overflow observation');
  assert.equal(result.outcome.code, 0); assert.equal(result.outcome.signal, null);
  assert.equal(child.closed, true); assert.equal(relay.failure, null);
  const emitted = Buffer.concat([approved, Buffer.from(q.overflowStdoutHex, 'hex')]);
  assert.equal(emitted.length, q.expectedObservedWorkerStdoutBytes);
  assertStats(result.outcome.outputStats.stdout, emitted);
  assertStats(result.outcome.outputStats.stderr, Buffer.alloc(0));
  await relay.finish(); await finishFile(out); await finishFile(err);
  const stdout = await readFile(out.path), stderr = await readFile(err.path);
  assert.deepEqual(stdout, Buffer.from(q.expectedFileStdoutHex, 'hex'));
  assert.deepEqual(stderr, Buffer.from(q.expectedFileStderrHex, 'hex'));
  const actual = stdout.length + stderr.length;
  assert(actual > q.limitBytes, 'Actual retained file bytes must exceed the proposed allowance');
  assert.equal(actual - q.limitBytes, q.expectedActualExcessBytes);
  assert.equal(out.counters.handledBytes, marker.length + emitted.length);
  context.quotaFacts = { baselineDefectObserved: true, proposedLimitBytes: q.limitBytes,
    actualFileBytes: actual, actualExcessBytes: actual - q.limitBytes,
    handledWorkerStdoutBytes: result.outcome.outputStats.stdout.handledBytes };
});

}
