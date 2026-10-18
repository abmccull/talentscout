import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

// One session shares destination gates across all concurrent workers. It owns
// neither the children nor the caller's destinations. A sink failure invalidates
// the run; later bytes are counted/hashed and explicitly dropped, never retried.
export function createWorkerOutputRelay({ stdout, stderr, tailCodeUnits = 32_768, maxOutputBytes }) {
  if (!Number.isSafeInteger(tailCodeUnits) || tailCodeUnits <= 0) {
    throw new TypeError("A positive diagnostic tail bound is required");
  }
  if (
    maxOutputBytes !== undefined
    && (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0)
  ) {
    throw new TypeError("maxOutputBytes must be a positive safe integer when supplied");
  }
  let chargedBytes = 0;
  const gates = new Map();
  const tickets = new Set();
  let failure = null;
  let finishing = false;
  let completion;

  function assertHealthy() {
    if (failure) throw failure;
  }
  function fail(error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
    for (const gate of gates.values()) gate.stop();
  }

  function admit(bytes) {
    if (failure) return false;
    // Omission preserves unmetered behavior and the null/0 budget snapshot.
    if (maxOutputBytes === undefined) return true;
    if (bytes.length > maxOutputBytes - chargedBytes) {
      const error = new Error("Worker output exceeds cumulative byte allowance");
      error.code = "ERR_WORKER_OUTPUT_QUOTA";
      fail(error);
      return false;
    }
    chargedBytes += bytes.length;
    return true;
  }

  function destination(stream) {
    if (gates.has(stream)) return gates.get(stream);
    if (!stream || typeof stream.write !== "function") {
      throw new TypeError("Writable stdout/stderr destinations are required");
    }
    const queue = [];
    const idleWaiters = [];
    let current = null;
    let closed = stream.closed === true;
    let errorSeen = false;
    let cleaned = false;
    function idle() {
      if (!current && queue.length === 0) {
        for (const resolve of idleWaiters.splice(0)) resolve();
      }
    }
    function settle() {
      if (!current || !current.returned || !current.callbackDone) return;
      if (!failure && current.needsDrain && !current.drained) return;
      const request = current;
      current = null;
      request.resolve(request.status);
      pump();
    }
    function pump() {
      if (current) return;
      if (failure) {
        for (const request of queue.splice(0)) request.resolve("dropped");
        idle();
        return;
      }
      const request = queue.shift();
      if (!request) { idle(); return; }
      current = request;
      // Set the request before calling write: callbacks/throws may be immediate.
      try {
        request.needsDrain = !stream.write(request.bytes, error => {
          if (request.callbackDone) return;
          request.callbackDone = true;
          request.status = error ? "uncertain" : "handled";
          if (error) fail(error);
          settle();
        });
      } catch (error) {
        request.callbackDone = true;
        request.status = "uncertain";
        fail(error);
      }
      request.returned = true;
      settle();
    }
    function onDrain() {
      if (current) current.drained = true;
      settle();
    }
    function onError(error) {
      errorSeen = true;
      fail(error);
    }
    function onClose() {
      closed = true;
      fail(new Error("Worker output destination closed before relay completion"));
      if (current && !current.callbackDone) {
        current.callbackDone = true;
        current.status = "uncertain";
      }
      settle();
      if (finishing) cleanup();
    }
    function onFinish() {
      fail(new Error("Worker output destination ended before relay completion"));
    }
    function cleanup() {
      if (cleaned) return;
      // A failed Writable may emit its error/close after its write callback.
      // Keep its error guard until actual close; never destroy it to clean up.
      if (stream.errored && !closed && !errorSeen) return;
      cleaned = true;
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
      stream.off("finish", onFinish);
    }
    const gate = {
      write(bytes) {
        if (failure) return Promise.resolve("dropped");
        return new Promise(resolve => {
          queue.push({ bytes, resolve, returned: false, callbackDone: false,
            needsDrain: false, drained: false, status: "uncertain" });
          pump();
        });
      },
      stop() {
        for (const request of queue.splice(0)) request.resolve("dropped");
        settle();
        idle();
      },
      idle: () => !current && queue.length === 0
        ? Promise.resolve() : new Promise(resolve => idleWaiters.push(resolve)),
      cleanup,
    };
    gates.set(stream, gate);
    stream.on("drain", onDrain);
    stream.on("error", onError);
    stream.on("close", onClose);
    stream.on("finish", onFinish);
    if (closed || stream.destroyed || stream.writableEnded || stream.errored) {
      fail(stream.errored ?? new Error("Worker output destination is unavailable"));
    }
    return gate;
  }
  const channels = { stdout: destination(stdout), stderr: destination(stderr) };

  async function line(channel, text) {
    assertHealthy();
    if (finishing) throw new Error("Worker output relay is already finishing");
    if (!Object.hasOwn(channels, channel)) throw new TypeError("Unknown output channel");
    const bytes = Buffer.from(`${text}\n`, "utf8");
    if (admit(bytes)) await channels[channel].write(bytes);
    assertHealthy();
  }

  function watch(child, { onSpawn } = {}) {
    // A caller checks health immediately before spawn. Once a child exists we
    // must adopt/drain it even if another worker has since failed the session.
    if (finishing) fail(new Error("Child created after output relay finish"));
    const exitedBeforeWatch = Number.isInteger(child.exitCode) || typeof child.signalCode === "string";
    if (exitedBeforeWatch) {
      fail(new Error("Child exited before output was watched; historical output is incomplete"));
      // Refused admission leaves the existing ChildProcess with its caller;
      // no synthetic close event or historical byte-completeness is claimed.
      throw failure;
    }
    let code = null;
    let signal = null;
    let spawned = false;
    let spawnFallback;
    let releaseIdentity;
    const identity = new Promise(resolve => { releaseIdentity = resolve; });
    let closeChild;
    const closedChild = new Promise(resolve => { closeChild = resolve; });
    function onError(error) {
      fail(error);
      if (!spawned) releaseIdentity();
    }
    function onExit(actualCode, actualSignal) {
      code = actualCode;
      signal = actualSignal;
    }
    function onClose(actualCode, actualSignal) {
      clearImmediate(spawnFallback);
      code = actualCode;
      signal = actualSignal;
      if (!spawned && Number.isSafeInteger(child.pid) && child.pid > 0) onActualSpawn();
      else if (!spawned) releaseIdentity();
      closeChild();
    }
    function onActualSpawn() {
      if (spawned) return;
      spawned = true;
      clearImmediate(spawnFallback);
      Promise.resolve().then(() => onSpawn?.()).catch(fail).finally(releaseIdentity);
    }
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
    child.once("spawn", onActualSpawn);
    // Late adoption of an already spawned child is valid. The spawn event may
    // already have fired, so a live pid starts its hook without waiting again.
    spawnFallback = setImmediate(() => {
      if (!spawned && Number.isSafeInteger(child.pid) && child.pid > 0) onActualSpawn();
    });

    function channelState() {
      return { decoder: new StringDecoder("utf8"), hash: createHash("sha256"), tail: "",
        observedBytes: 0, handledBytes: 0, uncertainBytes: 0, droppedBytes: 0 };
    }
    const states = { stdout: channelState(), stderr: channelState() };
    function append(state, text) {
      state.tail = (state.tail + text).slice(-tailCodeUnits);
      const first = state.tail.charCodeAt(0);
      if (first >= 0xdc00 && first <= 0xdfff) state.tail = state.tail.slice(1);
    }
    async function forward(channel) {
      const stream = child[channel];
      if (!stream) {
        await identity;
        if (spawned) fail(new Error(`Spawned child has no ${channel} pipe`));
        return;
      }
      const state = states[channel];
      let normalEnd = false;
      try {
        // Async iteration installs a readable-mode pump synchronously. Unlike
        // data/pause handlers it survives Node's exit-time flushStdio resume.
        // Each source holds at most one obtained Buffer while its gate waits.
        for await (const bytes of stream) {
          await identity;
          if (!Buffer.isBuffer(bytes)) throw new TypeError("Child output must remain raw Buffers");
          state.observedBytes += bytes.length;
          state.hash.update(bytes);
          append(state, state.decoder.write(bytes));
          const disposition = admit(bytes) ? await channels[channel].write(bytes) : "dropped";
          state[`${disposition}Bytes`] += bytes.length;
        }
        normalEnd = true;
      } catch (error) {
        fail(error);
      } finally {
        if (normalEnd) append(state, state.decoder.end());
      }
    }
    const stdoutDone = forward("stdout");
    const stderrDone = forward("stderr");
    const ticket = {};
    ticket.done = (async () => {
      await Promise.all([closedChild, identity, stdoutDone, stderrDone]);
      const outputStats = {};
      for (const channel of ["stdout", "stderr"]) {
        const state = states[channel];
        outputStats[channel] = {
          observedBytes: state.observedBytes, observedSha256: state.hash.digest("hex"),
          handledBytes: state.handledBytes, uncertainBytes: state.uncertainBytes,
          droppedBytes: state.droppedBytes,
        };
      }
      const outcome = { code, signal, stdoutTail: states.stdout.tail,
        stderrTail: states.stderr.tail, outputStats };
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("close", onClose);
      child.off("spawn", onActualSpawn);
      tickets.delete(ticket);
      if (failure) {
        const error = new Error(`Worker output session failed: ${failure.message}`, { cause: failure });
        error.code = failure.code;
        error.outcome = outcome;
        throw error;
      }
      return outcome;
    })();
    tickets.add(ticket);
    ticket.done.catch(() => {});
    return ticket;
  }

  function finish() {
    completion ??= (async () => {
      finishing = true;
      await Promise.allSettled([...tickets].map(ticket => ticket.done));
      await Promise.all([...gates.values()].map(gate => gate.idle()));
      // Writable error emission may follow its callback on the next tick.
      await new Promise(resolve => setImmediate(resolve));
      for (const gate of gates.values()) gate.cleanup();
      assertHealthy();
    })();
    return completion;
  }
  return {
    line, watch, finish, assertHealthy,
    get failure() { return failure; },
    get outputBudget() { return { limitBytes: maxOutputBytes ?? null, chargedBytes }; },
  };
}
