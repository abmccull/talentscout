import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const fileIo = require("../../electron/file-io.js") as {
  atomicWriteUtf8File: (
    path: string,
    text: string,
    maxBytes: number,
    fileSystem?: typeof import("node:fs/promises"),
  ) => Promise<void>;
  readBoundedUtf8File: (
    path: string,
    maxBytes: number,
  ) => Promise<string>;
};

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "talentscout-file-io-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Electron save file I/O", () => {
  it("atomically replaces an existing export without leaving a temporary file", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "career.json");
    await writeFile(target, "old", "utf8");

    await fileIo.atomicWriteUtf8File(target, '{"week":12}', 1024);

    await expect(readFile(target, "utf8")).resolves.toBe('{"week":12}');
    await expect(readdir(directory)).resolves.toEqual(["career.json"]);
  });

  it("preserves the previous export and cleans up when the atomic rename fails", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "career.json");
    await writeFile(target, "known-good", "utf8");
    const realFs = await import("node:fs/promises");
    const fileSystem = {
      ...realFs,
      rename: vi.fn(async () => {
        throw new Error("simulated rename failure");
      }),
    } as typeof import("node:fs/promises");

    await expect(
      fileIo.atomicWriteUtf8File(target, "replacement", 1024, fileSystem),
    ).rejects.toThrow("simulated rename failure");

    await expect(readFile(target, "utf8")).resolves.toBe("known-good");
    await expect(readdir(directory)).resolves.toEqual(["career.json"]);
  });

  it("rejects oversized and malformed UTF-8 imports", async () => {
    const directory = await temporaryDirectory();
    const oversized = join(directory, "oversized.json");
    const malformed = join(directory, "malformed.json");
    await writeFile(oversized, "12345", "utf8");
    await writeFile(malformed, Buffer.from([0xc3, 0x28]));

    await expect(fileIo.readBoundedUtf8File(oversized, 4)).rejects.toThrow(
      "1-4 bytes",
    );
    await expect(fileIo.readBoundedUtf8File(malformed, 4)).rejects.toThrow(
      "valid UTF-8",
    );
  });
});
