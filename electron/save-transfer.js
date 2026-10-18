"use strict";

const { randomUUID } = require("crypto");
const { TextDecoder } = require("util");

// The long-career release gate permits an 80 MiB canonical state. Leave room
// for the versioned save envelope and metadata, while retaining a hard upper
// bound below 100 MiB for every transfer assembled by the privileged process.
const MAX_SAVE_PAYLOAD_BYTES = 96 * 1024 * 1024;
const SAVE_TRANSFER_CHUNK_BYTES = 1024 * 1024;
const MAX_ACTIVE_SAVE_TRANSFERS = 2;
const SAVE_TRANSFER_TTL_MS = 2 * 60 * 1000;
const UTF8_DECODER = new TextDecoder("utf-8", {
  fatal: true,
  // Preserve an explicit BOM so a valid payload round-trips byte-for-byte.
  ignoreBOM: true,
});

function assertSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertOwnerId(ownerId) {
  if (
    (typeof ownerId !== "number" && typeof ownerId !== "string") ||
    String(ownerId).length === 0 ||
    String(ownerId).length > 128
  ) {
    throw new TypeError("ownerId is invalid");
  }
  return ownerId;
}

function assertTransferId(transferId) {
  if (
    typeof transferId !== "string" ||
    transferId.length === 0 ||
    transferId.length > 128
  ) {
    throw new TypeError("transferId is invalid");
  }
  return transferId;
}

function expectedSaveChunkCount(totalBytes, chunkBytes = SAVE_TRANSFER_CHUNK_BYTES) {
  assertSafePositiveInteger(totalBytes, "totalBytes");
  assertSafePositiveInteger(chunkBytes, "chunkBytes");
  return Math.ceil(totalBytes / chunkBytes);
}

function binaryBufferView(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("save transfer chunk must be binary data");
}

function decodeUtf8SavePayload(value, maxBytes = MAX_SAVE_PAYLOAD_BYTES) {
  const payload = binaryBufferView(value);
  if (payload.byteLength <= 0 || payload.byteLength > maxBytes) {
    throw new RangeError(`save payload must be between 1 and ${maxBytes} bytes`);
  }

  try {
    return UTF8_DECODER.decode(payload);
  } catch {
    throw new TypeError("save payload is not valid UTF-8");
  }
}

class SaveTransferBudget {
  constructor(options = {}) {
    this.maxBytes = options.maxBytes ?? MAX_SAVE_PAYLOAD_BYTES;
    this.maxTransfers = options.maxTransfers ?? MAX_ACTIVE_SAVE_TRANSFERS;
    this.reservations = new Map();
    this.reservedBytes = 0;

    assertSafePositiveInteger(this.maxBytes, "maxBytes");
    assertSafePositiveInteger(this.maxTransfers, "maxTransfers");
  }

  assertCanReserve(bytes) {
    assertSafePositiveInteger(bytes, "transfer bytes");
    if (bytes > this.maxBytes || this.reservedBytes + bytes > this.maxBytes) {
      throw new Error("save transfer exceeds the shared active-byte budget");
    }
    if (this.reservations.size >= this.maxTransfers) {
      throw new Error("too many active save transfers");
    }
  }

  reserve(key, bytes) {
    if (typeof key !== "string" || key.length === 0 || this.reservations.has(key)) {
      throw new Error("save transfer reservation key is invalid or duplicated");
    }
    this.assertCanReserve(bytes);
    this.reservations.set(key, bytes);
    this.reservedBytes += bytes;
  }

  adopt(key, nextKey, bytes) {
    assertSafePositiveInteger(bytes, "transfer bytes");
    const allowance = this.reservations.get(key);
    if (allowance === undefined || bytes > allowance) {
      throw new Error("save transfer exceeds its reserved read allowance");
    }
    if (typeof nextKey !== "string" || nextKey.length === 0 || this.reservations.has(nextKey)) {
      throw new Error("save transfer reservation key is invalid or duplicated");
    }
    // The reader and resulting download are one operation. Move ownership
    // synchronously without freeing bytes or requiring a second transfer slot.
    this.reservations.delete(key);
    this.reservations.set(nextKey, bytes);
    this.reservedBytes += bytes - allowance;
  }

  release(key) {
    const bytes = this.reservations.get(key);
    if (bytes === undefined) return false;
    this.reservations.delete(key);
    this.reservedBytes -= bytes;
    return true;
  }
}

class TransferRegistryBase {
  constructor(options = {}) {
    this.maxPayloadBytes = options.maxPayloadBytes ?? MAX_SAVE_PAYLOAD_BYTES;
    this.chunkBytes = options.chunkBytes ?? SAVE_TRANSFER_CHUNK_BYTES;
    this.maxActiveTransfers =
      options.maxActiveTransfers ?? MAX_ACTIVE_SAVE_TRANSFERS;
    this.ttlMs = options.ttlMs ?? SAVE_TRANSFER_TTL_MS;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.transfers = new Map();

    assertSafePositiveInteger(this.maxPayloadBytes, "maxPayloadBytes");
    assertSafePositiveInteger(this.chunkBytes, "chunkBytes");
    assertSafePositiveInteger(this.maxActiveTransfers, "maxActiveTransfers");
    assertSafePositiveInteger(this.ttlMs, "ttlMs");
    this.budget =
      options.budget ??
      new SaveTransferBudget({
        maxBytes: this.maxPayloadBytes,
        maxTransfers: this.maxActiveTransfers,
      });
  }

  deleteTransfer(id) {
    const transfer = this.transfers.get(id);
    if (!transfer) return false;
    this.transfers.delete(id);
    this.budget.release(transfer.budgetKey);
    return true;
  }

  purgeExpired() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, transfer] of this.transfers) {
      if (transfer.updatedAt <= cutoff) this.deleteTransfer(id);
    }
  }

  beginTransfer(transfer, readReservationKey = null) {
    this.purgeExpired();

    // A renderer may restart a transfer after a transient IPC failure. Keep at
    // most one transfer for a given owner, direction, and slot.
    for (const [id, active] of this.transfers) {
      if (
        active.ownerId === transfer.ownerId &&
        active.direction === transfer.direction &&
        active.slot === transfer.slot
      ) {
        this.deleteTransfer(id);
      }
    }

    if (this.transfers.size >= this.maxActiveTransfers) {
      throw new Error("too many active save transfers");
    }

    let id;
    do {
      id = this.createId();
    } while (this.transfers.has(id));

    const timestamp = this.now();
    const budgetKey = `${transfer.direction}:${id}`;
    if (readReservationKey === null) this.budget.reserve(budgetKey, transfer.totalBytes);
    else this.budget.adopt(readReservationKey, budgetKey, transfer.totalBytes);
    this.transfers.set(id, {
      ...transfer,
      id,
      budgetKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return id;
  }

  getOwnedTransfer(ownerId, transferId) {
    assertOwnerId(ownerId);
    assertTransferId(transferId);
    this.purgeExpired();
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.ownerId !== ownerId) {
      throw new Error("save transfer is unavailable or owned by another renderer");
    }
    return transfer;
  }

  abort(ownerId, transferId) {
    const transfer = this.getOwnedTransfer(ownerId, transferId);
    this.deleteTransfer(transfer.id);
    return true;
  }

  discardOwner(ownerId) {
    for (const [id, transfer] of this.transfers) {
      if (transfer.ownerId === ownerId) this.deleteTransfer(id);
    }
  }
}

class SaveUploadTransferRegistry extends TransferRegistryBase {
  begin({ ownerId, slot, totalBytes, chunkCount }) {
    assertOwnerId(ownerId);
    assertSafePositiveInteger(totalBytes, "totalBytes");
    if (totalBytes > this.maxPayloadBytes) {
      throw new RangeError(
        `save payload exceeds the ${this.maxPayloadBytes}-byte transfer limit`,
      );
    }
    const expectedChunks = expectedSaveChunkCount(totalBytes, this.chunkBytes);
    if (chunkCount !== expectedChunks) {
      throw new TypeError(`chunkCount must equal ${expectedChunks}`);
    }

    return this.beginTransfer({
      direction: "upload",
      ownerId,
      slot,
      totalBytes,
      chunkCount,
      nextIndex: 0,
      receivedBytes: 0,
      chunks: [],
    });
  }

  append({ ownerId, transferId, index, chunk }) {
    const transfer = this.getOwnedTransfer(ownerId, transferId);
    if (transfer.direction !== "upload") throw new Error("transfer is not an upload");
    if (!Number.isSafeInteger(index) || index !== transfer.nextIndex) {
      throw new TypeError(`save chunks must arrive in order at index ${transfer.nextIndex}`);
    }

    const isLast = index === transfer.chunkCount - 1;
    const expectedBytes = isLast
      ? transfer.totalBytes - this.chunkBytes * (transfer.chunkCount - 1)
      : this.chunkBytes;
    const chunkView = binaryBufferView(chunk);
    if (chunkView.byteLength !== expectedBytes) {
      throw new RangeError(
        `chunk ${index} must contain exactly ${expectedBytes} bytes`,
      );
    }
    const normalized = Buffer.from(chunkView);
    if (transfer.receivedBytes + normalized.byteLength > transfer.totalBytes) {
      throw new RangeError("save transfer exceeds its declared byte length");
    }

    transfer.chunks.push(normalized);
    transfer.receivedBytes += normalized.byteLength;
    transfer.nextIndex += 1;
    transfer.updatedAt = this.now();
    return transfer.receivedBytes;
  }

  commit({ ownerId, transferId }) {
    const transfer = this.getOwnedTransfer(ownerId, transferId);
    if (transfer.direction !== "upload") throw new Error("transfer is not an upload");
    if (
      transfer.nextIndex !== transfer.chunkCount ||
      transfer.receivedBytes !== transfer.totalBytes
    ) {
      throw new Error("save transfer is incomplete");
    }

    const payload = Buffer.concat(transfer.chunks, transfer.totalBytes);
    this.deleteTransfer(transfer.id);
    return { slot: transfer.slot, payload };
  }
}

class SaveDownloadTransferRegistry extends TransferRegistryBase {
  constructor(options = {}) {
    super(options);
    this.pendingReads = new Map();
  }

  async beginRead({ ownerId, slot, readPayload }) {
    assertOwnerId(ownerId);
    if (typeof readPayload !== "function") throw new TypeError("readPayload must be a function");
    this.purgeExpired();
    const key = `pending-read:${randomUUID()}`;
    this.budget.reserve(key, this.maxPayloadBytes);
    const pending = { ownerId, canceled: false };
    this.pendingReads.set(key, pending);
    try {
      // The allowance covers the native dialog as well as all awaited I/O.
      // Pending reads must not expire: their buffers may still be live after
      // renderer destruction or a slow filesystem operation.
      const payload = await readPayload(() => !pending.canceled);
      if (pending.canceled || payload === null) return null;
      return this.begin({ ownerId, slot, payload }, key);
    } finally {
      this.pendingReads.delete(key);
      // Adoption moved the key into a download. Failures/cancellation release
      // it here only after readPayload (including descriptor close) settles.
      this.budget.release(key);
    }
  }

  discardOwner(ownerId) {
    for (const pending of this.pendingReads.values()) {
      if (pending.ownerId === ownerId) pending.canceled = true;
    }
    super.discardOwner(ownerId);
  }

  begin({ ownerId, slot, payload }, readReservationKey = null) {
    assertOwnerId(ownerId);
    // The privileged caller hands ownership of a fresh Steam read buffer to
    // this registry. Retaining the view avoids a second 50-96 MiB copy.
    const normalized = binaryBufferView(payload);
    if (normalized.byteLength <= 0 || normalized.byteLength > this.maxPayloadBytes) {
      throw new RangeError(
        `save payload must be between 1 and ${this.maxPayloadBytes} bytes`,
      );
    }
    const chunkCount = expectedSaveChunkCount(normalized.byteLength, this.chunkBytes);
    const transferId = this.beginTransfer({
      direction: "download",
      ownerId,
      slot,
      totalBytes: normalized.byteLength,
      chunkCount,
      nextIndex: 0,
      payload: normalized,
    }, readReservationKey);
    return { transferId, totalBytes: normalized.byteLength, chunkCount };
  }

  read({ ownerId, transferId, index }) {
    const transfer = this.getOwnedTransfer(ownerId, transferId);
    if (transfer.direction !== "download") throw new Error("transfer is not a download");
    if (!Number.isSafeInteger(index) || index !== transfer.nextIndex) {
      throw new TypeError(`save chunks must be read in order at index ${transfer.nextIndex}`);
    }
    if (index >= transfer.chunkCount) throw new RangeError("chunk index is out of range");

    const start = index * this.chunkBytes;
    const end = Math.min(start + this.chunkBytes, transfer.totalBytes);
    const chunk = Buffer.from(transfer.payload.subarray(start, end));
    transfer.nextIndex += 1;
    transfer.updatedAt = this.now();
    return chunk;
  }

  finish({ ownerId, transferId }) {
    const transfer = this.getOwnedTransfer(ownerId, transferId);
    if (transfer.direction !== "download") throw new Error("transfer is not a download");
    const complete = transfer.nextIndex === transfer.chunkCount;
    this.deleteTransfer(transfer.id);
    if (!complete) throw new Error("save download ended before every chunk was read");
    return true;
  }
}

module.exports = {
  MAX_ACTIVE_SAVE_TRANSFERS,
  MAX_SAVE_PAYLOAD_BYTES,
  SAVE_TRANSFER_CHUNK_BYTES,
  SAVE_TRANSFER_TTL_MS,
  SaveDownloadTransferRegistry,
  SaveTransferBudget,
  SaveUploadTransferRegistry,
  decodeUtf8SavePayload,
  expectedSaveChunkCount,
};
