"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { decodeUtf8SavePayload } = require("./save-transfer");

function assertPositiveByteLimit(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
}

/**
 * Replace a user-selected export atomically. The temporary file lives beside
 * the destination so rename never crosses a filesystem boundary. A crash or
 * failed write leaves the previous export intact instead of truncating it.
 */
async function atomicWriteUtf8File(filePath, text, maxBytes, fileSystem = fs) {
  assertPositiveByteLimit(maxBytes);
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("filePath must be a non-empty string");
  }
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }

  const payload = Buffer.from(text, "utf8");
  if (payload.byteLength === 0 || payload.byteLength > maxBytes) {
    throw new RangeError(`File payload must contain 1-${maxBytes} UTF-8 bytes`);
  }

  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle = null;

  try {
    handle = await fileSystem.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;
    await fileSystem.rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await fileSystem.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Read a regular file through one open handle, enforce its byte budget before
 * and after materialization, and reject malformed UTF-8 rather than silently
 * replacing corrupt bytes before JSON validation sees them.
 */
async function readBoundedUtf8Buffer(filePath, maxBytes, fileSystem = fs) {
  assertPositiveByteLimit(maxBytes);
  const handle = await fileSystem.open(filePath, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error("Selected path is not a file");
    if (stats.size <= 0 || stats.size > maxBytes) {
      throw new RangeError(`Selected file must contain 1-${maxBytes} bytes`);
    }

    const payload = await handle.readFile();
    if (payload.byteLength <= 0 || payload.byteLength > maxBytes) {
      throw new RangeError(`Selected file must contain 1-${maxBytes} bytes`);
    }
    // Validate before crossing IPC. Return the original buffer so chunked
    // transfers do not need another UTF-8 encode in the main process.
    decodeUtf8SavePayload(payload);
    return payload;
  } finally {
    await handle.close();
  }
}

async function readBoundedUtf8File(filePath, maxBytes, fileSystem = fs) {
  return decodeUtf8SavePayload(
    await readBoundedUtf8Buffer(filePath, maxBytes, fileSystem),
  );
}

module.exports = {
  atomicWriteUtf8File,
  readBoundedUtf8Buffer,
  readBoundedUtf8File,
};
