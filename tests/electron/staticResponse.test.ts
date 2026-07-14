import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createStaticFileResponse, parseSingleByteRange } = require(
  "../../electron/static-response.js",
) as {
  createStaticFileResponse: (input: {
    filePath: string;
    contentType: string;
    method?: string;
    rangeHeader?: string | null;
  }) => Promise<Response>;
  parseSingleByteRange: (
    header: string | null,
    size: number,
  ) => { start: number; end: number } | null | false;
};

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "talentscout-static-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "track.mp3");
  await writeFile(filePath, "0123456789", "utf8");
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Electron static protocol responses", () => {
  it("parses only one satisfiable byte range", () => {
    expect(parseSingleByteRange(null, 10)).toBeNull();
    expect(parseSingleByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseSingleByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseSingleByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseSingleByteRange("bytes=20-30", 10)).toBe(false);
    expect(parseSingleByteRange("bytes=0-1,4-5", 10)).toBe(false);
  });

  it("streams complete and partial content with defensive headers", async () => {
    const filePath = await fixture();
    const complete = await createStaticFileResponse({
      filePath,
      contentType: "audio/mpeg",
    });
    expect(complete.status).toBe(200);
    expect(complete.headers.get("accept-ranges")).toBe("bytes");
    expect(complete.headers.get("content-length")).toBe("10");
    expect(complete.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(complete.text()).resolves.toBe("0123456789");

    const partial = await createStaticFileResponse({
      filePath,
      contentType: "audio/mpeg",
      rangeHeader: "bytes=2-5",
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(partial.headers.get("content-length")).toBe("4");
    await expect(partial.text()).resolves.toBe("2345");
  });

  it("supports HEAD and rejects unsupported or unsatisfiable requests", async () => {
    const filePath = await fixture();
    const head = await createStaticFileResponse({
      filePath,
      contentType: "audio/mpeg",
      method: "HEAD",
    });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("content-length")).toBe("10");

    const unsatisfiable = await createStaticFileResponse({
      filePath,
      contentType: "audio/mpeg",
      rangeHeader: "bytes=99-100",
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe("bytes */10");

    const method = await createStaticFileResponse({
      filePath,
      contentType: "audio/mpeg",
      method: "POST",
    });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET, HEAD");
  });
});
