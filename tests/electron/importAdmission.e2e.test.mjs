import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { readBoundedUtf8Buffer } = require("../../electron/file-io.js");
const { SaveDownloadTransferRegistry, SaveTransferBudget, SaveUploadTransferRegistry } =
  require("../../electron/save-transfer.js");

async function withFile(body, run, fault = {}) {
  const directory = await fs.mkdtemp(join(tmpdir(), "talentscout-import-admission-"));
  const filename = join(directory, "career.json");
  await fs.writeFile(filename, body);
  const observed = { reads: [], buffers: new Set(), readBytes: 0, closed: false, wholeFileReads: 0 };
  const fileSystem = {
    async open(path, flags) {
      const handle = await fs.open(path, flags);
      return {
        async stat() {
          const result = await handle.stat();
          if (fault.afterStat) await fault.afterStat(filename);
          if (fault.statError) throw new Error("injected stat error");
          return fault.notFile ? { ...result, isFile: () => false } : result;
        },
        async read(buffer, offset, length, position) {
          observed.reads.push(length);
          observed.buffers.add(buffer);
          if (fault.readError) throw new Error("injected read error");
          const result = await handle.read(buffer, offset, length, position);
          observed.readBytes += result.bytesRead;
          return result;
        },
        async readFile() {
          observed.wholeFileReads += 1;
          throw new Error("whole-file materialization is forbidden");
        },
        async close() {
          await handle.close();
          observed.closed = true;
          if (fault.closeError) throw new Error("injected close error");
        },
      };
    },
  };
  try {
    await run({ filename, fileSystem, observed });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function registries(options = {}) {
  const budget = new SaveTransferBudget({ maxBytes: 128, maxTransfers: 1, ...options });
  const download = new SaveDownloadTransferRegistry({
    budget, maxPayloadBytes: budget.maxBytes, maxActiveTransfers: budget.maxTransfers,
    chunkBytes: 64, ttlMs: 10,
  });
  return { budget, download };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("bounded descriptor read preserves BOM and split UTF-8 with at most ceiling plus sentinel bytes", async () => {
  const body = Buffer.from("\ufeff" + "x".repeat(65532) + "é足球");
  await withFile(body, async ({ filename, fileSystem, observed }) => {
    const payload = await readBoundedUtf8Buffer(filename, body.length, fileSystem);
    assert.deepEqual(payload, body);
    assert.equal(observed.wholeFileReads, 0);
    assert.ok(Math.max(...observed.reads) <= 65536);
    assert.ok([...observed.buffers].reduce((sum, buffer) => sum + buffer.length, 0) <= body.length + 1);
    assert.equal(observed.closed, true);
  });
});

test("file growth after stat never reads more than the admitted ceiling plus one byte", async () => {
  await withFile(Buffer.from("12345678"), async ({ filename, fileSystem, observed }) => {
    await assert.rejects(readBoundedUtf8Buffer(filename, 8, fileSystem), /changed|1-8 bytes/);
    assert.ok(observed.readBytes <= 9);
    assert.ok([...observed.buffers].reduce((sum, buffer) => sum + buffer.length, 0) <= 9);
    assert.equal(observed.wholeFileReads, 0);
    assert.equal(observed.closed, true);
  }, { afterStat: (filename) => fs.appendFile(filename, Buffer.alloc(1024 * 1024, 120)) });
});

test("file shrink after stat is refused and descriptor actually closes", async () => {
  await withFile(Buffer.from("12345678"), async ({ filename, fileSystem, observed }) => {
    await assert.rejects(readBoundedUtf8Buffer(filename, 8, fileSystem), /changed/);
    assert.equal(observed.closed, true);
  }, { afterStat: (filename) => fs.truncate(filename, 2) });
});

test("empty oversized and nonregular files are rejected before body reads", async () => {
  for (const [body, fault] of [[Buffer.alloc(0), {}], [Buffer.alloc(9), {}], [Buffer.from("x"), { notFile: true }]]) {
    await withFile(body, async ({ filename, fileSystem, observed }) => {
      await assert.rejects(readBoundedUtf8Buffer(filename, 8, fileSystem), /bytes|not a file/);
      assert.deepEqual(observed.reads, []);
      assert.equal(observed.closed, true);
    }, fault);
  }
});

test("malformed UTF-8 and partial final sequences are refused with real close", async () => {
  for (const body of [Buffer.from([0xc3, 0x28]), Buffer.concat([Buffer.alloc(65535, 120), Buffer.from([0xe2, 0x82])])]) {
    await withFile(body, async ({ filename, fileSystem, observed }) => {
      await assert.rejects(readBoundedUtf8Buffer(filename, body.length, fileSystem), /valid UTF-8/);
      assert.equal(observed.closed, true);
    });
  }
});

test("admission precedes the dialog/read callback and handoff keeps one reservation", async () => {
  const { budget, download } = registries();
  const hold = deferred();
  const payload = Buffer.from('{"week":12}');
  let callbackCount = 0;
  const first = download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload: async () => {
    callbackCount += 1;
    assert.equal(budget.reservedBytes, 128);
    await hold.promise;
    return payload;
  } });
  await assert.rejects(download.beginRead({ ownerId: 2, slot: "dialog-import", readPayload: async () => {
    callbackCount += 1;
    return payload;
  } }), /budget|active/);
  assert.equal(callbackCount, 1);
  hold.resolve();
  const metadata = await first;
  assert.equal(budget.reservedBytes, payload.length);
  assert.equal(budget.reservations.size, 1);
  assert.equal(download.transfers.get(metadata.transferId).payload, payload);
  assert.deepEqual(download.read({ ownerId: 1, transferId: metadata.transferId, index: 0 }), payload);
  download.finish({ ownerId: 1, transferId: metadata.transferId });
  assert.equal(budget.reservedBytes, 0);
});

test("an existing upload prevents an import from opening its dialog", async () => {
  const { budget, download } = registries({ maxTransfers: 2 });
  const upload = new SaveUploadTransferRegistry({ budget, maxPayloadBytes: 128 });
  const id = upload.begin({ ownerId: 1, slot: "0", totalBytes: 1, chunkCount: 1 });
  let entered = false;
  await assert.rejects(download.beginRead({ ownerId: 2, slot: "dialog-import", readPayload: async () => {
    entered = true;
    return Buffer.from("x");
  } }), /budget/);
  assert.equal(entered, false);
  assert.equal(budget.reservedBytes, 1);
  upload.abort(1, id);
  assert.equal(budget.reservedBytes, 0);
});

test("cancel thrown callback and invalid payload release all read allowances", async () => {
  const { budget, download } = registries();
  assert.equal(await download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload: async () => null }), null);
  for (const readPayload of [async () => { throw new Error("dialog failure"); }, async () => Buffer.alloc(129), async () => "wrong type"]) {
    await assert.rejects(download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload }));
    assert.equal(budget.reservedBytes, 0);
    assert.equal(budget.reservations.size, 0);
  }
});

test("read stat and close failures release allowance only after descriptor close", async () => {
  for (const fault of [{ readError: true }, { statError: true }, { closeError: true }]) {
    const { budget, download } = registries();
    await withFile(Buffer.from("valid"), async ({ filename, fileSystem, observed }) => {
      await assert.rejects(download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload: () => readBoundedUtf8Buffer(filename, 128, fileSystem) }), /injected/);
      assert.equal(observed.closed, true);
      assert.equal(budget.reservedBytes, 0);
      assert.equal(budget.reservations.size, 0);
    }, fault);
  }
});

test("renderer disposal marks pending read inactive without freeing memory before settlement", async () => {
  const { budget, download } = registries();
  const hold = deferred();
  let active;
  const pending = download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload: async (isActive) => {
    active = isActive;
    await hold.promise;
    return Buffer.from("valid");
  } });
  assert.equal(active(), true);
  download.discardOwner(1);
  assert.equal(active(), false);
  assert.equal(budget.reservedBytes, 128);
  await assert.rejects(download.beginRead({ ownerId: 2, slot: "dialog-import", readPayload: async () => Buffer.from("new") }), /budget|active/);
  hold.resolve();
  assert.equal(await pending, null);
  assert.equal(budget.reservedBytes, 0);
  assert.equal(download.transfers.size, 0);
});

test("pending I/O remains reserved when the ordinary transfer TTL passes", async () => {
  const { budget, download } = registries();
  const hold = deferred();
  let now = 1000;
  download.now = () => now;
  const pending = download.beginRead({ ownerId: 1, slot: "dialog-import", readPayload: async () => {
    await hold.promise;
    return null;
  } });
  now += 100000;
  download.purgeExpired();
  assert.equal(budget.reservedBytes, 128);
  hold.resolve();
  assert.equal(await pending, null);
  assert.equal(budget.reservedBytes, 0);
});
