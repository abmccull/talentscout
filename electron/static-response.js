"use strict";

const { createReadStream } = require("node:fs");
const { stat } = require("node:fs/promises");
const { Readable } = require("node:stream");

function parseSingleByteRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return false;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size
    ) {
      return false;
    }
    end = Math.min(end, size - 1);
  }

  return { start, end };
}

function sharedHeaders(contentType, size) {
  return {
    "Accept-Ranges": "bytes",
    "Content-Length": String(size),
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Build a streamed custom-protocol response. Single byte ranges cover HTML5
 * media metadata/playback without materializing multi-megabyte assets in the
 * Electron main process. Multi-range requests fail closed instead of building
 * multipart bodies the game never needs.
 */
async function createStaticFileResponse({
  filePath,
  contentType,
  method = "GET",
  rangeHeader = null,
}) {
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error("Static path is not a file");
  const range = parseSingleByteRange(rangeHeader, fileStats.size);
  if (range === false) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileStats.size}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, fileStats.size - 1);
  const responseSize = range ? end - start + 1 : fileStats.size;
  const headers = sharedHeaders(contentType, responseSize);
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${fileStats.size}`;

  const body = method === "HEAD"
    ? null
    : Readable.toWeb(createReadStream(filePath, range ? { start, end } : undefined));
  return new Response(body, {
    status: range ? 206 : 200,
    headers,
  });
}

module.exports = {
  createStaticFileResponse,
  parseSingleByteRange,
};
