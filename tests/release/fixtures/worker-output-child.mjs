// Finite real-child recipes for workerOutputRelay.e2e.test.mjs.
// Authored before the relay. No game, network, package or production calls.
import { writeSync } from 'node:fs';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
const index = Number(process.argv[3] ?? '0');
const modes = new Set(['split', 'bytes-tail', 'pressure-exit',
  'concurrent', 'trail-parent', 'trail-grandchild', 'nonzero', 'empty', 'sink-error']);
if (!modes.has(mode) || !Number.isInteger(index) || index < 0 || index > 2) {
  throw new Error('Invalid finite fixture recipe');
}
const commands = [];
let waiter = null;
let stopped = false;
let diagnosticControl;

function send(value) {
  if (process.connected) process.send(value);
}
function disconnect() {
  if (process.connected) process.disconnect();
}
process.on('message', message => {
  if (!message || typeof message.command !== 'string') return;
  if (message.command === 'stop') {
    stopped = true;
    process.exitCode = 1;
    disconnect();
    if (waiter) { const current = waiter; waiter = null; current.reject(new Error('Fixture stopped')); }
    return;
  }
  if (waiter && waiter.command === message.command) {
    const current = waiter;
    waiter = null;
    current.resolve(message);
  } else {
    if (commands.length >= 24) throw new Error('Finite fixture command bound exceeded');
    commands.push(message);
  }
});
function take(command) {
  if (stopped) return Promise.reject(new Error('Fixture stopped'));
  const at = commands.findIndex(item => item.command === command);
  if (at >= 0) return Promise.resolve(commands.splice(at, 1)[0]);
  if (waiter) throw new Error('Only one finite fixture command wait is allowed');
  return new Promise((resolve, reject) => { waiter = { command, resolve, reject }; });
}
function writeAll(fd, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 256 * 1024) throw new Error('Fixture byte bound');
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(count) || count <= 0) throw new Error('Fixture write made no progress');
    offset += count;
  }
}
function alphabet(reverse = false) {
  const bytes = Buffer.from(Array.from({ length: 64 }, (_, n) => index * 64 + n));
  return reverse ? bytes.reverse() : bytes;
}
async function main() {
  if (mode === 'trail-grandchild') {
    // An owned named pipe / Unix-domain socket is independent of the direct
    // parent's stdio handles, which Node closes when that parent exits.
    const control = connect(process.argv[4]);
    diagnosticControl = control;
    await new Promise((resolve, reject) => {
      let input = '';
      control.once('connect', () => control.write(JSON.stringify({ type: 'ready', pid: process.pid }) + '\n'));
      control.on('data', bytes => {
        input += bytes.toString('ascii');
        if (input === 'GO\n') resolve();
        else if (input.length >= 16) reject(new Error('Wrong private release'));
      });
      control.once('error', reject);
      control.once('end', () => { if (input !== 'GO\n') reject(new Error('Private release missing')); });
    });
    writeAll(1, Buffer.from('grandchild-after-direct-exit:\u20ac\n'));
    writeAll(2, Buffer.from('grandchild-stderr-after-direct-exit\n'));
    control.end(JSON.stringify({ type: 'wrote' }) + '\n');
    return;
  }
  send({ type: 'ready', mode, pid: process.pid });
  await take('start');
  if (mode === 'split') {
    const pieces = [0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0xb5];
    for (const channel of ['stdout', 'stderr']) {
      for (let piece = 0; piece < pieces.length; piece += 1) {
        writeAll(channel === 'stdout' ? 1 : 2, Buffer.from([pieces[piece]]));
        await take('ack-' + channel + '-' + piece);
      }
    }
  } else if (mode === 'bytes-tail') {
    const suffix = Buffer.from([0x00, 0xff, 0xc0, 0xaf, 0xe2, 0x82]);
    writeAll(1, Buffer.concat([Buffer.alloc(33000, 0x41), suffix]));
    writeAll(2, Buffer.concat([Buffer.alloc(33000, 0x53), suffix]));
  } else if (mode === 'pressure-exit') {
    writeAll(1, Buffer.from([0x61]));
    await take('continue');
    writeAll(1, Buffer.alloc(63, 0x62));
    writeAll(2, Buffer.from('pressure-stderr\n'));

  } else if (mode === 'concurrent') {
    writeAll(1, alphabet());
    writeAll(2, alphabet(true));
    send({ type: 'wrote', index });
  } else if (mode === 'trail-parent') {
    const descendant = spawn(process.execPath, [fileURLToPath(import.meta.url), 'trail-grandchild', '0', process.argv[4]], {
      stdio: ['ignore', 1, 2],
      windowsHide: true,
      // Windows libuv otherwise kills this child in its parent's private job
      // on parent exit. Detached skips that inner job without job breakaway;
      // the outer diagnostic job still owns this CreateProcess descendant.
      detached: process.platform === 'win32',
    });
    await new Promise((resolve, reject) => {
      descendant.once('spawn', resolve);
      descendant.once('error', reject);
    });
    send({ type: 'descendant', pid: descendant.pid });
    await take('parent-exit');
    descendant.unref();
  } else if (mode === 'nonzero') {
    writeAll(1, Buffer.from('nonzero-stdout\n'));
    writeAll(2, Buffer.from('nonzero-stderr:\u20ac\n'));
    process.exitCode = 7;
  } else if (mode === 'sink-error') {
    writeAll(1, Buffer.from('first-uncertain-buffer'));
    await take('after-failure');
    writeAll(1, Buffer.from('later-explicitly-dropped-stdout'));
    writeAll(2, Buffer.from('later-explicitly-dropped-stderr'));
  }
  send({ type: 'finished', mode });
  disconnect();
}
main().catch(error => {
  if (diagnosticControl?.writable) diagnosticControl.end(JSON.stringify({ type: 'error', code: error.code ?? 'FIXTURE_FAILURE' }) + '\n');
  process.exitCode = 1;
  if (!stopped) {
    const kind = typeof error?.code === 'string' ? error.code : 'FIXTURE_FAILURE';
    try { writeAll(2, Buffer.from('FIXTURE_ERROR:' + kind.slice(0, 64) + '\n')); } catch {}
    send({ type: 'fixture-error', code: kind.slice(0, 64) });
  }
  disconnect();
});
