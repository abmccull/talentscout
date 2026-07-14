import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface TransferOptions {
  maxPayloadBytes?: number;
  chunkBytes?: number;
  maxActiveTransfers?: number;
  ttlMs?: number;
  now?: () => number;
  createId?: () => string;
  budget?: TransferBudget;
}

interface TransferBudget {
  reservedBytes: number;
  assertCanReserve(bytes: number): void;
  reserve(key: string, bytes: number): void;
  release(key: string): boolean;
}

interface UploadRegistry {
  begin(input: {
    ownerId: number | string;
    slot: string;
    totalBytes: number;
    chunkCount: number;
  }): string;
  append(input: {
    ownerId: number | string;
    transferId: string;
    index: number;
    chunk: Uint8Array;
  }): number;
  commit(input: {
    ownerId: number | string;
    transferId: string;
  }): { slot: string; payload: Buffer };
  abort(ownerId: number | string, transferId: string): boolean;
}

interface DownloadRegistry {
  begin(input: {
    ownerId: number | string;
    slot: string;
    payload: Uint8Array;
  }): { transferId: string; totalBytes: number; chunkCount: number };
  read(input: {
    ownerId: number | string;
    transferId: string;
    index: number;
  }): Buffer;
  finish(input: { ownerId: number | string; transferId: string }): boolean;
}

interface SaveTransferModule {
  MAX_SAVE_PAYLOAD_BYTES: number;
  SAVE_TRANSFER_CHUNK_BYTES: number;
  SaveUploadTransferRegistry: new (options?: TransferOptions) => UploadRegistry;
  SaveDownloadTransferRegistry: new (options?: TransferOptions) => DownloadRegistry;
  SaveTransferBudget: new (options?: {
    maxBytes?: number;
    maxTransfers?: number;
  }) => TransferBudget;
  decodeUtf8SavePayload(value: Uint8Array, maxBytes?: number): string;
  expectedSaveChunkCount(totalBytes: number, chunkBytes?: number): number;
}

const require = createRequire(import.meta.url);
const transfer = require(resolve(process.cwd(), "electron/save-transfer.js")) as SaveTransferModule;

function idFactory(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("bounded desktop save transfers", () => {
  it("round-trips a legitimate save larger than 50 MiB in bounded chunks", () => {
    const sourceText = JSON.stringify({
      scout: "José Álvarez",
      career: "x".repeat(50 * 1024 * 1024),
    });
    const source = Buffer.from(sourceText, "utf8");
    expect(source.byteLength).toBeGreaterThan(50 * 1024 * 1024);
    expect(source.byteLength).toBeLessThan(transfer.MAX_SAVE_PAYLOAD_BYTES);

    const upload = new transfer.SaveUploadTransferRegistry({
      createId: idFactory("upload"),
    });
    const chunkCount = transfer.expectedSaveChunkCount(source.byteLength);
    const uploadId = upload.begin({
      ownerId: 7,
      slot: "3",
      totalBytes: source.byteLength,
      chunkCount,
    });
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * transfer.SAVE_TRANSFER_CHUNK_BYTES;
      upload.append({
        ownerId: 7,
        transferId: uploadId,
        index,
        chunk: source.subarray(
          start,
          Math.min(start + transfer.SAVE_TRANSFER_CHUNK_BYTES, source.byteLength),
        ),
      });
    }
    const uploaded = upload.commit({ ownerId: 7, transferId: uploadId });
    expect(uploaded.slot).toBe("3");
    expect(digest(uploaded.payload)).toBe(digest(source));
    expect(transfer.decodeUtf8SavePayload(uploaded.payload)).toBe(sourceText);

    const download = new transfer.SaveDownloadTransferRegistry({
      createId: idFactory("download"),
    });
    const metadata = download.begin({
      ownerId: 7,
      slot: "3",
      payload: uploaded.payload,
    });
    const downloadedChunks: Buffer[] = [];
    for (let index = 0; index < metadata.chunkCount; index += 1) {
      downloadedChunks.push(
        download.read({
          ownerId: 7,
          transferId: metadata.transferId,
          index,
        }),
      );
    }
    expect(download.finish({ ownerId: 7, transferId: metadata.transferId })).toBe(true);
    expect(digest(Buffer.concat(downloadedChunks, metadata.totalBytes))).toBe(digest(source));
  });

  it("rejects oversized declarations without allocating their payload", () => {
    const upload = new transfer.SaveUploadTransferRegistry({
      createId: idFactory("oversized"),
    });
    const totalBytes = transfer.MAX_SAVE_PAYLOAD_BYTES + 1;
    expect(() =>
      upload.begin({
        ownerId: 1,
        slot: "0",
        totalBytes,
        chunkCount: transfer.expectedSaveChunkCount(totalBytes),
      }),
    ).toThrow(/exceeds/);
  });

  it("rejects foreign, out-of-order, malformed, incomplete, and invalid UTF-8 transfers", () => {
    const upload = new transfer.SaveUploadTransferRegistry({
      maxPayloadBytes: 32,
      chunkBytes: 4,
      createId: idFactory("strict"),
    });
    const transferId = upload.begin({
      ownerId: "renderer-a",
      slot: "1",
      totalBytes: 10,
      chunkCount: 3,
    });

    expect(() =>
      upload.append({
        ownerId: "renderer-b",
        transferId,
        index: 0,
        chunk: Buffer.from("1234"),
      }),
    ).toThrow(/owned by another renderer/);
    expect(() =>
      upload.append({
        ownerId: "renderer-a",
        transferId,
        index: 1,
        chunk: Buffer.from("1234"),
      }),
    ).toThrow(/in order/);
    expect(() =>
      upload.append({
        ownerId: "renderer-a",
        transferId,
        index: 0,
        chunk: Buffer.from("123"),
      }),
    ).toThrow(/exactly 4 bytes/);
    expect(() =>
      upload.append({
        ownerId: "renderer-a",
        transferId,
        index: 0,
        chunk: Buffer.alloc(16),
      }),
    ).toThrow(/exactly 4 bytes/);

    upload.append({
      ownerId: "renderer-a",
      transferId,
      index: 0,
      chunk: Buffer.from("1234"),
    });
    expect(() => upload.commit({ ownerId: "renderer-a", transferId })).toThrow(
      /incomplete/,
    );
    upload.append({
      ownerId: "renderer-a",
      transferId,
      index: 1,
      chunk: Buffer.from("5678"),
    });
    upload.append({
      ownerId: "renderer-a",
      transferId,
      index: 2,
      chunk: Buffer.from("90"),
    });
    expect(upload.commit({ ownerId: "renderer-a", transferId }).payload.toString()).toBe(
      "1234567890",
    );

    expect(() =>
      transfer.decodeUtf8SavePayload(Buffer.from([0xc3, 0x28]), 32),
    ).toThrow(/valid UTF-8/);
    const bomPayload = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expect(Buffer.from(transfer.decodeUtf8SavePayload(bomPayload), "utf8")).toEqual(
      bomPayload,
    );
  });

  it("shares one active-byte budget across upload and download registries", () => {
    const budget = new transfer.SaveTransferBudget({ maxBytes: 8, maxTransfers: 2 });
    const upload = new transfer.SaveUploadTransferRegistry({
      maxPayloadBytes: 8,
      chunkBytes: 4,
      budget,
      createId: idFactory("shared-upload"),
    });
    const download = new transfer.SaveDownloadTransferRegistry({
      maxPayloadBytes: 8,
      chunkBytes: 4,
      budget,
      createId: idFactory("shared-download"),
    });

    const uploadId = upload.begin({
      ownerId: 1,
      slot: "1",
      totalBytes: 6,
      chunkCount: 2,
    });
    expect(budget.reservedBytes).toBe(6);
    expect(() =>
      download.begin({ ownerId: 1, slot: "2", payload: Buffer.alloc(3) }),
    ).toThrow(/active-byte budget/);
    const downloadMetadata = download.begin({
      ownerId: 1,
      slot: "2",
      payload: Buffer.alloc(2),
    });
    expect(budget.reservedBytes).toBe(8);

    upload.abort(1, uploadId);
    expect(budget.reservedBytes).toBe(2);
    download.read({ ownerId: 1, transferId: downloadMetadata.transferId, index: 0 });
    download.finish({ ownerId: 1, transferId: downloadMetadata.transferId });
    expect(budget.reservedBytes).toBe(0);
  });

  it("expires abandoned transfers and caps concurrent privileged memory", () => {
    let now = 1_000;
    const upload = new transfer.SaveUploadTransferRegistry({
      maxPayloadBytes: 16,
      chunkBytes: 4,
      maxActiveTransfers: 1,
      ttlMs: 100,
      now: () => now,
      createId: idFactory("ttl"),
    });
    upload.begin({ ownerId: 1, slot: "1", totalBytes: 4, chunkCount: 1 });
    expect(() =>
      upload.begin({ ownerId: 2, slot: "2", totalBytes: 4, chunkCount: 1 }),
    ).toThrow(/too many active/);

    now += 101;
    expect(
      upload.begin({ ownerId: 2, slot: "2", totalBytes: 4, chunkCount: 1 }),
    ).toBe("ttl-2");
  });

  it("keeps sandboxed preload limits synchronized with the privileged registry", () => {
    const preload = readFileSync(resolve(process.cwd(), "electron/preload.js"), "utf8");
    expect(transfer.MAX_SAVE_PAYLOAD_BYTES).toBe(96 * 1024 * 1024);
    expect(transfer.SAVE_TRANSFER_CHUNK_BYTES).toBe(1024 * 1024);
    expect(preload).toContain("const MAX_FILE_BYTES = 96 * 1024 * 1024;");
    expect(preload).toContain("const SAVE_TRANSFER_CHUNK_BYTES = 1024 * 1024;");
  });
});
